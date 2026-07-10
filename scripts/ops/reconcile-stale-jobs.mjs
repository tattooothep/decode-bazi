#!/usr/bin/env node
import nextEnv from "@next/env";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
if (!process.env.PGUSER) loadEnvConfig(process.cwd(), false, console);
const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 2,
});
const jobsRoot = "/var/tmp/palm-jobs";

async function refundStalePalm(jobId) {
  const client = await pool.connect();
  let jobDir = null;
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT user_id,status,billing_status,yam_reserved,job_dir
         FROM palm_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
    const job = found.rows[0];
    if (!job || !["queued", "running"].includes(job.status)) {
      await client.query("ROLLBACK");
      return false;
    }
    jobDir = job.job_dir;
    if (job.billing_status === "reserved" && job.user_id) {
      const amount = Math.max(1, Number(job.yam_reserved) || 1);
      const user = await client.query(
        `UPDATE users SET hour_balance=hour_balance+$2 WHERE id=$1 RETURNING hour_balance`,
        [job.user_id, amount]);
      if (user.rows[0]) {
        await client.query(
          `INSERT INTO hour_transactions
           (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
           VALUES ($1,$2,'refund_palmistry_ai_pre',$3,'palmistry_ai',$4,'worker_stale')`,
          [job.user_id, amount, user.rows[0].hour_balance, `palm_job:${jobId}:refund`]);
      }
    }
    await client.query(
      `UPDATE palm_jobs SET status='error',error='worker_stale',billing_status=CASE WHEN billing_status='reserved' THEN 'refunded' ELSE billing_status END,yam_charged=0,billed_at=COALESCE(billed_at,now()),updated_at=now() WHERE id=$1`,
      [jobId]);
    await client.query(
      `UPDATE hourkey_jobs SET status='failed',error_code='worker_stale',finished_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (jobDir) await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  return true;
}

async function refundStaleFusion(jobId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT user_id,status,billing_status,yam_reserved
         FROM fusion5_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
    const job = found.rows[0];
    if (!job || !["queued", "running"].includes(job.status)) {
      await client.query("ROLLBACK");
      return false;
    }
    let refunded = 0;
    if (job.billing_status === "reserved") {
      refunded = Math.max(0, Number(job.yam_reserved) || 0);
      const user = await client.query(
        `UPDATE users SET hour_balance=hour_balance+$2 WHERE id=$1 RETURNING hour_balance`,
        [job.user_id, refunded]);
      if (!user.rows[0]) throw new Error("fusion_stale_user_missing");
      if (refunded > 0) {
        await client.query(
          `INSERT INTO hour_transactions
           (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
           VALUES ($1,$2,'refund_sifu_fusion5',$3,'sifu_fusion5',$4)`,
          [job.user_id, refunded, user.rows[0].hour_balance, `fusion5_job:${jobId}:refund`]);
      }
    }
    await client.query(
      `UPDATE fusion5_jobs SET status='error',error='worker_stale',billing_status=CASE WHEN billing_status='reserved' THEN 'refunded' ELSE billing_status END,yam_charged=CASE WHEN billing_status='reserved' THEN 0 ELSE yam_charged END,yam_refunded=CASE WHEN billing_status='reserved' THEN $2 ELSE yam_refunded END,billed_at=COALESCE(billed_at,now()),updated_at=now() WHERE id=$1`,
      [jobId, refunded]);
    await client.query(
      `UPDATE hourkey_jobs SET status='failed',error_code='worker_stale',finished_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const stale = await pool.query(`
  SELECT id::text,'palm' AS feature FROM palm_jobs
   WHERE (status='running' AND COALESCE(heartbeat_at,updated_at) < now()-interval '30 minutes')
      OR (status='queued' AND created_at < now()-interval '6 hours')
  UNION ALL
  SELECT id::text,'fusion5' AS feature FROM fusion5_jobs
   WHERE (status='running' AND COALESCE(heartbeat_at,updated_at) < now()-interval '30 minutes')
      OR (status='queued' AND created_at < now()-interval '6 hours')
  LIMIT 100`);

let reconciled = 0;
for (const job of stale.rows) {
  const changed = job.feature === "palm" ? await refundStalePalm(job.id) : await refundStaleFusion(job.id);
  if (changed) reconciled++;
}

let orphanDirs = 0;
for (const entry of await readdir(jobsRoot, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isDirectory()) continue;
  const fullPath = path.join(jobsRoot, entry.name);
  const info = await stat(fullPath).catch(() => null);
  if (info && Date.now() - info.mtimeMs > 24 * 60 * 60_000) {
    const found = await pool.query(`SELECT status FROM palm_jobs WHERE id::text=$1`, [entry.name]).catch(() => ({ rows: [] }));
    const status = found.rows[0]?.status;
    if (!status || status === "done" || status === "error") {
      await rm(fullPath, { recursive: true, force: true });
      orphanDirs++;
    }
  }
}

await pool.end();
console.log(JSON.stringify({ ok: true, checked: stale.rowCount, reconciled, orphanDirs }));
