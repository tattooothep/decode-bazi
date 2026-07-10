#!/usr/bin/env node
import { loadEnvConfig } from "@next/env";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import pg from "pg";

loadEnvConfig(process.cwd(), false, console, true);

const queue = process.argv[2] || "hourkey-vision-palm";
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6380";
const baseUrl = process.env.HOURKEY_INTERNAL_BASE_URL || "http://127.0.0.1:3349";
const token = process.env.HOURKEY_INTERNAL_JOB_TOKEN;
const isPalm = queue === "hourkey-vision-palm";
const isFusion = queue === "hourkey-ai-fusion";
const concurrency = Math.max(1, Math.min(20, Number(isPalm
  ? (process.env.PALM_WORKER_CONCURRENCY || 2)
  : (process.env.FUSION_WORKER_CONCURRENCY || 2))));
if (!token) throw new Error("HOURKEY_INTERNAL_JOB_TOKEN is required");
if (!isPalm && !isFusion) throw new Error(`unsupported queue: ${queue}`);

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const producerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const producer = new Queue(queue, { connection: producerConnection });
const database = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 2,
});

async function reconcileOutbox() {
  const result = await database.query(
    `SELECT id,feature FROM hourkey_jobs
      WHERE queue_name=$1 AND status='waiting' AND created_at < now() - interval '10 seconds'
      ORDER BY created_at ASC LIMIT 100`,
    [queue]
  );
  for (const row of result.rows) {
    const name = row.feature === "palm" ? "palm-read" : "fusion5-read";
    await producer.add(name, { jobId: row.id }, {
      jobId: row.id,
      priority: row.feature === "palm" ? 20 : 40,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 20_000 },
    });
  }
  if (result.rowCount) console.log(JSON.stringify({ event: "outbox_reconciled", queue, count: result.rowCount }));
}

const worker = new Worker(queue, async (job) => {
  const endpoint = isPalm ? "/api/internal/jobs/palm" : "/api/sifu/fusion5";
  const body = isPalm ? { jobId: job.data.jobId } : { __worker: true, jobId: job.data.jobId };
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(isPalm ? 300_000 : 900_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${isPalm ? "palm" : "fusion"}_worker_http_${response.status}:${result.error || "unknown"}`);
  return result;
}, {
  connection,
  concurrency,
  lockDuration: isPalm ? 360_000 : 960_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
});

worker.on("completed", (job, result) => console.log(JSON.stringify({ event: "completed", queue, jobId: job.id, result })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ event: "failed", queue, jobId: job?.id, error: error.message })));
worker.on("error", (error) => console.error(JSON.stringify({ event: "worker_error", queue, error: error.message })));
await reconcileOutbox();
const reconcileTimer = setInterval(() => {
  void reconcileOutbox().catch((error) => console.error(JSON.stringify({ event: "outbox_error", queue, error: error.message })));
}, 30_000);
reconcileTimer.unref();

async function shutdown(signal) {
  console.log(JSON.stringify({ event: "shutdown", queue, signal }));
  clearInterval(reconcileTimer);
  await worker.close();
  await producer.close();
  await connection.quit();
  await producerConnection.quit();
  await database.end();
  process.exit(0);
}
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
console.log(JSON.stringify({ event: "ready", queue, concurrency }));
