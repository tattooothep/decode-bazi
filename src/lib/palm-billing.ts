import { pool } from "@/lib/db";
import { charsToHours } from "@/lib/spend-hours";

type PalmJobCreate = {
  id: string;
  userId: string;
  orgId: string | null;
  lang: string;
  jobDir: string;
  imageCount: number;
};

export async function createReservedPalmJob(input: PalmJobCreate) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const user = await c.query<{ hour_balance: number }>(
      `UPDATE users SET hour_balance=hour_balance-1
       WHERE id=$1 AND deleted_at IS NULL AND hour_balance >= 1
       RETURNING hour_balance`,
      [input.userId]
    );
    if (!user.rows[0]) {
      await c.query("ROLLBACK");
      return { ok: false as const, error: "insufficient_hours" };
    }
    await c.query(
      `INSERT INTO palm_jobs
       (id,user_id,org_id,status,lang,job_dir,image_count,billing_status,yam_reserved,yam_charged)
       VALUES ($1,$2,$3,'running',$4,$5,$6,'reserved',1,1)`,
      [input.id, input.userId, input.orgId, input.lang, input.jobDir, input.imageCount]
    );
    await c.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
       VALUES ($1,-1,'spend_palmistry_ai_pre',$2,'palmistry_ai',$3)`,
      [input.userId, user.rows[0].hour_balance, `palm_job:${input.id}:reserve`]
    );
    await c.query("COMMIT");
    return { ok: true as const, balance_after: Number(user.rows[0].hour_balance) };
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}

export async function settlePalmJobBilling(jobId: string, chars: number) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const job = await c.query<{ user_id: string; billing_status: string; yam_reserved: number }>(
      `SELECT user_id,billing_status,yam_reserved FROM palm_jobs WHERE id=$1 FOR UPDATE`,
      [jobId]
    );
    const row = job.rows[0];
    if (!row || row.billing_status !== "reserved") {
      await c.query("ROLLBACK");
      return { ok: false as const, status: row?.billing_status || "missing" };
    }
    const reserved = Math.max(1, Number(row.yam_reserved) || 1);
    const extraWanted = Math.max(0, charsToHours(chars) - reserved);
    let extraSpent = 0;
    let balanceAfter = 0;
    if (extraWanted > 0) {
      const user = await c.query<{ old_bal: number; new_bal: number }>(
        `WITH cur AS (SELECT hour_balance AS old_bal FROM users WHERE id=$1 FOR UPDATE)
         UPDATE users SET hour_balance=GREATEST(0,hour_balance-$2)
         FROM cur WHERE users.id=$1
         RETURNING cur.old_bal,users.hour_balance AS new_bal`,
        [row.user_id, extraWanted]
      );
      const u = user.rows[0];
      if (!u) throw new Error("palm_billing_user_missing");
      extraSpent = Math.max(0, Number(u.old_bal) - Number(u.new_bal));
      balanceAfter = Number(u.new_bal);
      if (extraSpent > 0) {
        await c.query(
          `INSERT INTO hour_transactions
           (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
           VALUES ($1,$2,'spend_palmistry_ai',$3,'palmistry_ai',$4)`,
          [row.user_id, -extraSpent, balanceAfter, `palm_job:${jobId}:settle`]
        );
      }
    } else {
      const user = await c.query<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [row.user_id]);
      balanceAfter = Number(user.rows[0]?.hour_balance || 0);
    }
    const charged = reserved + extraSpent;
    await c.query(
      `UPDATE palm_jobs SET billing_status='settled',yam_charged=$2,billed_at=now(),updated_at=now() WHERE id=$1`,
      [jobId, charged]
    );
    await c.query("COMMIT");
    return { ok: true as const, charged, balance_after: balanceAfter };
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}

export async function refundPalmJobBilling(jobId: string, reason: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const job = await c.query<{ user_id: string; billing_status: string; yam_reserved: number }>(
      `SELECT user_id,billing_status,yam_reserved FROM palm_jobs WHERE id=$1 FOR UPDATE`,
      [jobId]
    );
    const row = job.rows[0];
    if (!row || row.billing_status !== "reserved") {
      await c.query("ROLLBACK");
      return { ok: false as const, status: row?.billing_status || "missing" };
    }
    const amount = Math.max(1, Number(row.yam_reserved) || 1);
    const user = await c.query<{ hour_balance: number }>(
      `UPDATE users SET hour_balance=hour_balance+$2 WHERE id=$1 RETURNING hour_balance`,
      [row.user_id, amount]
    );
    if (!user.rows[0]) throw new Error("palm_refund_user_missing");
    await c.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,$2,'refund_palmistry_ai_pre',$3,'palmistry_ai',$4,$5)`,
      [row.user_id, amount, user.rows[0].hour_balance, `palm_job:${jobId}:refund`, reason.slice(0, 160)]
    );
    await c.query(
      `UPDATE palm_jobs SET billing_status='refunded',yam_charged=0,billed_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]
    );
    await c.query("COMMIT");
    return { ok: true as const, refunded: amount, balance_after: Number(user.rows[0].hour_balance) };
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}

