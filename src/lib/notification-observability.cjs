"use strict";

/** Read-only, aggregate-only notification health and reconciliation checks. */

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function ageSeconds(value, now) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((now.valueOf() - timestamp) / 1000));
}

function freshness(value, maxAgeSeconds, now) {
  const age = ageSeconds(value, now);
  return { fresh: age !== null && age <= maxAgeSeconds, ageSeconds: age };
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundedMilliseconds(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value));
}

function optionsFor(input = {}) {
  const thresholds = input.thresholds || {};
  return {
    lookbackHours: boundedNumber(input.lookbackHours, 168, 1, 24 * 31),
    thresholds: {
      maxRetryBacklogCount: boundedNumber(thresholds.maxRetryBacklogCount, 100, 0, 1_000_000),
      maxRetryAgeSeconds: boundedNumber(thresholds.maxRetryAgeSeconds, 900, 1, 31 * 24 * 3600),
      maxStaleLeaseCount: boundedNumber(thresholds.maxStaleLeaseCount, 0, 0, 1_000_000),
      staleAttemptSeconds: boundedNumber(thresholds.staleAttemptSeconds, 900, 1, 31 * 24 * 3600),
      maxReceiptStalledCount: boundedNumber(thresholds.maxReceiptStalledCount, 0, 0, 1_000_000),
      receiptStallSeconds: boundedNumber(thresholds.receiptStallSeconds, 900, 1, 31 * 24 * 3600),
      workerHeartbeatSeconds: boundedNumber(thresholds.workerHeartbeatSeconds, 300, 1, 24 * 3600),
      schedulerHeartbeatSeconds: boundedNumber(thresholds.schedulerHeartbeatSeconds, 3600, 1, 24 * 3600),
    },
  };
}

async function readOnlyBounded(db, run) {
  const pooled = typeof db?.connect === "function" && typeof db?.totalCount === "number";
  const client = pooled ? await db.connect() : db;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    if (pooled) client.release();
  }
}

async function serialQueryResults(queryFactories) {
  const results = [];
  for (const query of queryFactories) results.push(await query());
  return results;
}

async function collectHealth(db, input = {}) {
  const config = optionsFor(input);
  const now = input.now instanceof Date ? input.now : new Date();
  // Actionable alert predicates deliberately have no historical window. Each
  // is a direct indexed query so an old blocked row cannot become invisible.
  const [retryResult, leaseResult, reservedResult, receiptResult, attemptReadinessResult, inventoryResult, terminalResult, aggregatesResult] = await readOnlyBounded(db, (readDb) => serialQueryResults([
    () => readDb.query(
      `SELECT count(*)::int AS overdue_count,
              COALESCE(max(extract(epoch FROM now()-next_retry_at)),0)::bigint AS oldest_age_seconds
         FROM mobile_push_attempts WHERE status='retry_due' AND next_retry_at<=now()`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE lease_token IS NOT NULL AND lease_expires_at<=now()`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE status='reserved' AND lease_token IS NULL
          AND COALESCE(send_started_at,updated_at,created_at)<=now()-($1::text||' seconds')::interval`,
      [String(config.thresholds.staleAttemptSeconds)],
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stalled_count,
              COALESCE(max(extract(epoch FROM now()-accepted_at)),0)::bigint AS oldest_age_seconds
         FROM mobile_push_attempts WHERE provider='expo' AND status='provider_accepted'
          AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL
          AND accepted_at<=now()-($1::text||' seconds')::interval`,
      [String(config.thresholds.receiptStallSeconds)],
    ),
    () => readDb.query(
      `SELECT count(*) FILTER (WHERE t.id IS NULL
              OR (a.provider='fcm' AND (NULLIF(btrim(t.device_push_token),'') IS NULL OR t.platform='ios' OR COALESCE(t.device_token_type,'')='apns'))
              OR (a.provider='expo' AND NULLIF(btrim(t.expo_push_token),'') IS NULL))::int AS token_mismatch_count
         FROM mobile_push_attempts a LEFT JOIN mobile_push_tokens t ON t.id=a.token_id AND t.enabled=true
        WHERE a.status IN ('reserved','retry_due')`,
    ),
    () => readDb.query(
      `SELECT count(*) FILTER (WHERE NULLIF(btrim(device_push_token),'') IS NOT NULL
                       AND platform<>'ios' AND COALESCE(device_token_type,'')<>'apns')::int AS active_fcm_count,
              count(*) FILTER (WHERE (NULLIF(btrim(device_push_token),'') IS NULL OR platform='ios' OR COALESCE(device_token_type,'')='apns')
                       AND NULLIF(btrim(expo_push_token),'') IS NOT NULL)::int AS active_expo_count
         FROM mobile_push_tokens WHERE enabled=true`,
    ),
    () => readDb.query(
      `SELECT count(*) FILTER (WHERE status='dead')::int AS dead_letter_count,
              count(*) FILTER (WHERE status='dead' AND (last_error ILIKE '%devicenotregistered%' OR last_error ILIKE '%invalid_token%' OR last_error ILIKE '%target_unavailable%'))::int AS invalid_token_count,
              count(*) FILTER (WHERE status='dead' AND last_error='uncertain_provider_result')::int AS uncertain_count
         FROM mobile_push_attempts WHERE updated_at >= now()-($1::text||' hours')::interval`,
      [String(config.lookbackHours)],
    ),
    () => readDb.query(
      `SELECT l.kind,a.provider,a.status,count(*)::int AS count,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.accepted_at-a.send_started_at))*1000)
                FILTER (WHERE a.accepted_at IS NOT NULL AND a.send_started_at IS NOT NULL) AS provider_latency_p50_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.accepted_at-a.send_started_at))*1000)
                FILTER (WHERE a.accepted_at IS NOT NULL AND a.send_started_at IS NOT NULL) AS provider_latency_p95_ms,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.provider_receipt_checked_at-a.accepted_at))*1000)
                FILTER (WHERE a.provider_receipt_checked_at IS NOT NULL AND a.accepted_at IS NOT NULL) AS receipt_lag_p50_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.provider_receipt_checked_at-a.accepted_at))*1000)
                FILTER (WHERE a.provider_receipt_checked_at IS NOT NULL AND a.accepted_at IS NOT NULL) AS receipt_lag_p95_ms
         FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
        WHERE a.updated_at >= now()-($1::text||' hours')::interval
        GROUP BY l.kind,a.provider,a.status ORDER BY l.kind,a.provider,a.status LIMIT 100`,
      [String(config.lookbackHours)],
    ),
  ]));
  const retry = retryResult.rows[0] || {};
  const lease = leaseResult.rows[0] || {};
  const reserved = reservedResult.rows[0] || {};
  const receipt = receiptResult.rows[0] || {};
  const attemptReadiness = attemptReadinessResult.rows[0] || {};
  const inventory = inventoryResult.rows[0] || {};
  const terminal = terminalResult.rows[0] || {};
  const worker = freshness(input.heartbeat?.workerAt, config.thresholds.workerHeartbeatSeconds, now);
  const scheduler = freshness(input.heartbeat?.schedulerAt, config.thresholds.schedulerHeartbeatSeconds, now);
  const activeProviders = { fcm: numeric(inventory.active_fcm_count), expo: numeric(inventory.active_expo_count) };
  const credentialMismatchCount = Object.entries(activeProviders)
    .filter(([provider, count]) => count > 0 && input.providerReady?.[provider] !== true).length;
  const metrics = {
    retry: { overdueCount: numeric(retry.overdue_count), oldestAgeSeconds: numeric(retry.oldest_age_seconds) },
    leases: { staleCount: numeric(lease.stale_count) + numeric(reserved.stale_count) },
    receipts: { stalledCount: numeric(receipt.stalled_count), oldestAgeSeconds: numeric(receipt.oldest_age_seconds) },
    readiness: {
      tokenMismatchCount: numeric(attemptReadiness.token_mismatch_count), credentialMismatchCount,
      mismatchCount: numeric(attemptReadiness.token_mismatch_count) + credentialMismatchCount,
    },
    outcomes: { deadLetterCount: numeric(terminal.dead_letter_count), invalidTokenCount: numeric(terminal.invalid_token_count), uncertainCount: numeric(terminal.uncertain_count) },
    worker,
    scheduler,
    byCategoryProviderState: aggregatesResult.rows.map((row) => ({
      category: row.kind, provider: row.provider, state: row.status, count: numeric(row.count),
      providerLatencyP50Ms: roundedMilliseconds(row.provider_latency_p50_ms),
      providerLatencyP95Ms: roundedMilliseconds(row.provider_latency_p95_ms),
      receiptLagP50Ms: roundedMilliseconds(row.receipt_lag_p50_ms),
      receiptLagP95Ms: roundedMilliseconds(row.receipt_lag_p95_ms),
    })),
  };
  const reasons = [];
  if (metrics.retry.overdueCount > config.thresholds.maxRetryBacklogCount) reasons.push("retry_backlog_count");
  if (metrics.retry.oldestAgeSeconds > config.thresholds.maxRetryAgeSeconds) reasons.push("retry_backlog_age");
  if (metrics.leases.staleCount > config.thresholds.maxStaleLeaseCount) reasons.push("stale_lease");
  if (metrics.receipts.stalledCount > config.thresholds.maxReceiptStalledCount) reasons.push("receipt_poll_stalled");
  if (metrics.readiness.mismatchCount > 0) reasons.push("provider_readiness_mismatch");
  if (!metrics.worker.fresh) reasons.push(metrics.worker.ageSeconds === null ? "worker_heartbeat_missing" : "worker_heartbeat_stale");
  return { ok: reasons.length === 0, reasons, metrics, windowHours: config.lookbackHours };
}

async function reconcile(db, input = {}) {
  const result = await readOnlyBounded(db, (readDb) => readDb.query(
    `WITH parents AS (
       SELECT l.id,l.delivery_status,
              count(a.id) FILTER (WHERE a.status='delivered') AS delivered,
              count(a.id) FILTER (WHERE a.status='provider_accepted') AS accepted,
              count(a.id) FILTER (WHERE a.status IN ('reserved','retry_due')) AS open
         FROM mobile_push_log l LEFT JOIN mobile_push_attempts a ON a.push_log_id=l.id
        GROUP BY l.id,l.delivery_status
     ), parent_truth AS (
       SELECT count(*) FILTER (WHERE delivery_status <> CASE WHEN delivered>0 THEN 'delivered' WHEN accepted>0 THEN 'accepted' WHEN open>0 THEN 'pending' ELSE 'failed' END)::int AS parent_truth_mismatch,
              count(*) FILTER (WHERE delivery_status='failed' AND accepted>0)::int AS orphan_accepted_parent,
              count(*) FILTER (WHERE delivery_status IN ('accepted','delivered') AND delivered=0 AND accepted=0 AND open=0)::int AS orphan_failed_parent
         FROM parents
     ), attempts AS (
       SELECT count(*) FILTER (WHERE l.id IS NULL)::int AS orphan_attempt,
              count(*) FILTER (WHERE l.id IS NULL AND a.provider='expo' AND a.provider_ticket_id IS NOT NULL)::int AS orphan_receipt,
              count(*) FILTER (WHERE a.provider='expo' AND a.status='provider_accepted' AND a.provider_ticket_id IS NULL)::int
                + count(*) FILTER (WHERE a.provider='fcm' AND a.provider_ticket_id IS NOT NULL)::int
                + count(*) FILTER (WHERE a.status='delivered' AND a.delivered_at IS NULL)::int AS impossible_state
         FROM mobile_push_attempts a LEFT JOIN mobile_push_log l ON l.id=a.push_log_id
     ) SELECT * FROM parent_truth CROSS JOIN attempts`,
  ));
  const row = result.rows[0] || {};
  const counts = {
    parentTruthMismatch: numeric(row.parent_truth_mismatch),
    orphanAttempt: numeric(row.orphan_attempt),
    orphanReceipt: numeric(row.orphan_receipt),
    orphanAcceptedParent: numeric(row.orphan_accepted_parent),
    orphanFailedParent: numeric(row.orphan_failed_parent),
    impossibleState: numeric(row.impossible_state),
  };
  return { ok: Object.values(counts).every((count) => count === 0), scope: "all_current_rows", counts };
}

module.exports = { collectHealth, reconcile, readOnlyBounded, serialQueryResults };
