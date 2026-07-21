import nextEnv from "@next/env";
import { randomUUID } from "crypto";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd(), false, console);
const { pool } = await import("../src/lib/db.ts");
const { reserveNetworkAiOperation, settleNetworkAiOperation, refundNetworkAiOperation, claimCachedNetworkPairTrial } = await import("../src/lib/network-pair-billing.ts");
const admin = new pg.Client({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let checks = 0;
function check(value: unknown, label: string) {
  if (!value) throw new Error(`FAIL ${label}`);
  checks++;
  console.log(`PASS ${label}`);
}

try {
  await admin.connect();
  const replayStore = await admin.query<{ ready: boolean; runtime_dml: boolean }>(
    `SELECT to_regclass('public.network_ai_operation_replays') IS NOT NULL AS ready,
            COALESCE(has_table_privilege(current_user,to_regclass('public.network_ai_operation_replays'),'SELECT,INSERT,UPDATE,DELETE'),false) AS runtime_dml`
  );
  check(replayStore.rows[0]?.ready && replayStore.rows[0]?.runtime_dml, "owner-run replay migration is applied with runtime DML privileges");
  for (const [index, userId] of users.entries()) {
    await admin.query(
      `INSERT INTO users(id,email,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at)
       VALUES($1,$2,$3,'en','Asia/Bangkok','dark',true,true,'trial',10,0,now())`,
      [userId, `network-billing-${userId}@example.test`, `Billing ${index}`]
    );
  }

  const trialOps = ["trial-a-12345678", "trial-b-12345678"];
  const trialRace = await Promise.all(trialOps.map((operationId) => reserveNetworkAiOperation({
    feature: "sifu_network_pair", operationId, requestFingerprint: `network-sifu:${operationId}`, trial: true, userId: users[0],
  })));
  check(trialRace.filter((row) => row.ok).length === 1, "concurrent trial reservations grant exactly one shared use");
  check(trialRace.some((row) => !row.ok && row.error === "network_pair_ai_trial_used"), "losing trial request is denied by the locked shared quota");
  const winner = trialRace.find((row) => row.ok)!;
  const winnerOp = trialOps[trialRace.indexOf(winner)];
  const settled = await Promise.all([
    settleNetworkAiOperation({ chars: 60, feature: "sifu_network_pair", operationId: winnerOp, userId: users[0] }),
    settleNetworkAiOperation({ chars: 60, feature: "sifu_network_pair", operationId: winnerOp, userId: users[0] }),
  ]);
  check(settled.every((row) => row.ok && row.spent === 2), "duplicate settlement is idempotent with one total charge");
  check(Number((await admin.query(`SELECT hour_balance FROM users WHERE id=$1`, [users[0]])).rows[0].hour_balance) === 8, "trial reserve plus settlement changes balance exactly once");
  const afterSettleRefund = await refundNetworkAiOperation({ feature: "sifu_network_pair", operationId: winnerOp, userId: users[0] });
  check(afterSettleRefund.status === "settled", "settled operation cannot be refunded afterward");

  const fullOp = "full-same-12345678";
  const firstFull = await reserveNetworkAiOperation({
    feature: "sifu_network_pair",
    operationId: fullOp,
    requestFingerprint: "network-sifu:payload-a",
    trial: false,
    userId: users[1],
  });
  check(firstFull.ok, "first full-tier operation reserves normally");
  const inProgressReplay = await reserveNetworkAiOperation({
    feature: "sifu_network_pair",
    operationId: fullOp,
    requestFingerprint: "network-sifu:payload-a",
    trial: false,
    userId: users[1],
  });
  check(!inProgressReplay.ok && inProgressReplay.error === "billing_operation_in_progress", "in-progress operation cannot start a second AI execution");
  const mismatchedReplay = await reserveNetworkAiOperation({
    feature: "sifu_network_pair",
    operationId: fullOp,
    requestFingerprint: "sifu-group:payload-b",
    trial: false,
    userId: users[1],
  });
  check(!mismatchedReplay.ok && mismatchedReplay.error === "billing_operation_mismatch", "same key cannot cross endpoint or payload boundaries");
  const exactAnswer = "  durable answer\n";
  await settleNetworkAiOperation({ chars: exactAnswer.length, feature: "sifu_network_pair", operationId: fullOp, replay: { reply: exactAnswer }, userId: users[1] });
  const settledReplay = await reserveNetworkAiOperation({
    feature: "sifu_network_pair",
    operationId: fullOp,
    requestFingerprint: "network-sifu:payload-a",
    trial: false,
    userId: users[1],
  });
  check(settledReplay.ok && settledReplay.existing === true && settledReplay.replay?.reply === exactAnswer, "settled operation replays the exact durable answer including whitespace without another AI execution");
  const fullLedger = await admin.query<{ note: string | null }>(`SELECT note FROM hour_transactions WHERE user_id=$1 AND ref_payment_id=$2`, [users[1], `ai:sifu_network_pair:${fullOp}:settle`]);
  check(!String(fullLedger.rows[0]?.note || "").includes(exactAnswer.trim()), "generic billing ledger never stores the AI answer");
  const fullReplay = await admin.query<{ reply: string; request_fingerprint: string }>(`SELECT reply,request_fingerprint FROM network_ai_operation_replays WHERE user_id=$1 AND feature='sifu_network_pair' AND operation_id=$2`, [users[1], fullOp]);
  check(fullReplay.rows[0]?.reply === exactAnswer && fullReplay.rows[0]?.request_fingerprint === "network-sifu:payload-a", "dedicated replay row is exact and bound to the canonical request fingerprint");
  check(Number((await admin.query(`SELECT hour_balance FROM users WHERE id=$1`, [users[1]])).rows[0].hour_balance) === 9, "replayed full-tier operation deducts once");

  const oversizedOp = "full-oversized-12345678";
  const oversizedFingerprint = "network-sifu:oversized";
  await reserveNetworkAiOperation({ feature: "sifu_network_pair", operationId: oversizedOp, requestFingerprint: oversizedFingerprint, trial: false, userId: users[4] });
  await settleNetworkAiOperation({ chars: 65_537, feature: "sifu_network_pair", operationId: oversizedOp, replay: { reply: "x".repeat(65_537) }, userId: users[4] });
  const oversizedRetry = await reserveNetworkAiOperation({ feature: "sifu_network_pair", operationId: oversizedOp, requestFingerprint: oversizedFingerprint, trial: false, userId: users[4] });
  check(!oversizedRetry.ok && oversizedRetry.error === "billing_operation_settled", "oversized answers settle once but fail closed instead of re-running AI");
  check(Number((await admin.query(`SELECT COUNT(*)::int AS n FROM network_ai_operation_replays WHERE user_id=$1 AND operation_id=$2`, [users[4], oversizedOp])).rows[0].n) === 0, "oversized AI answer is never persisted for replay");
  const refundOp = "full-refund-12345678";
  await reserveNetworkAiOperation({
    feature: "sifu_network_pair",
    operationId: refundOp,
    requestFingerprint: "network-sifu:refund-payload",
    trial: false,
    userId: users[1],
  });
  const duplicateRefund = await Promise.all([
    refundNetworkAiOperation({ feature: "sifu_network_pair", operationId: refundOp, userId: users[1] }),
    refundNetworkAiOperation({ feature: "sifu_network_pair", operationId: refundOp, userId: users[1] }),
  ]);
  check(duplicateRefund.every((row) => row.ok), "duplicate refund is idempotent");
  check(Number((await admin.query(`SELECT hour_balance FROM users WHERE id=$1`, [users[1]])).rows[0].hour_balance) === 9, "duplicate refund credits once");

  const cachedRace = await Promise.all([
    claimCachedNetworkPairTrial(users[2], "cached-race-12345678", "sifu-compare:cached-a"),
    reserveNetworkAiOperation({ feature: "sifu_network_pair", operationId: "live-race-12345678", requestFingerprint: "network-sifu:live-a", trial: true, userId: users[2] }),
  ]);
  check(Number(cachedRace[0].ok) + Number(cachedRace[1].ok) === 1, "cached compare and live Network share one serialized trial quota");

  const cachedFirst = await claimCachedNetworkPairTrial(users[3], "cached-final-12345678", "sifu-compare:cached-a");
  check(cachedFirst.ok, "first cached comparison consumes the shared trial once");
  const cachedReplay = await claimCachedNetworkPairTrial(users[3], "cached-final-12345678", "sifu-compare:cached-a");
  check(!cachedReplay.ok && cachedReplay.error === "billing_operation_settled", "cached operation cannot be replayed as another delivery");
  const cachedMismatch = await claimCachedNetworkPairTrial(users[3], "cached-final-12345678", "sifu-compare:cached-b");
  check(!cachedMismatch.ok && cachedMismatch.error === "billing_operation_mismatch", "cached operation key cannot be reused for another pair payload");

  console.log(`network AI billing passed: ${checks}/${checks}`);
} finally {
  if ((admin as any)._connected) {
    await admin.query(`DELETE FROM network_ai_operation_replays WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await admin.query(`DELETE FROM hour_transactions WHERE user_id=ANY($1::uuid[])`, [users]).catch(() => null);
    await admin.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
    await admin.end().catch(() => null);
  }
  await pool.end().catch(() => null);
}
