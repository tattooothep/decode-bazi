"use strict";

/** Read-only, aggregate-only notification health and reconciliation checks. */
const { SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS, SCHEDULER_NAMES } = require("./notification-science.cjs");
const { attemptImpossibleSql, derivedParentStatusSql } = require("./notification-delivery-invariants.cjs");

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function heartbeatTiming(value, maxAgeSeconds, maxFutureSkewSeconds, now) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) {
    return { fresh: false, ageSeconds: null, future: false, futureSkewSeconds: null };
  }
  const signedAgeSeconds = Math.round((now.valueOf() - timestamp) / 1000);
  const futureSkewSeconds = Math.max(0, -signedAgeSeconds);
  const future = futureSkewSeconds > maxFutureSkewSeconds;
  return {
    fresh: !future && signedAgeSeconds <= maxAgeSeconds,
    ageSeconds: Math.max(0, signedAgeSeconds),
    future,
    futureSkewSeconds,
  };
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function roundedMilliseconds(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value));
}

function ratio(numerator, denominator) {
  const total = numeric(denominator);
  if (total <= 0) return null;
  return Math.round((numeric(numerator) / total) * 10_000) / 10_000;
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
      heartbeatFutureSkewSeconds: boundedNumber(thresholds.heartbeatFutureSkewSeconds, 60, 0, 300),
      maxZibaiDueLagSeconds: boundedNumber(thresholds.maxZibaiDueLagSeconds, 600, 1, 24 * 3600),
      maxZibaiEngineFailureCount: boundedNumber(thresholds.maxZibaiEngineFailureCount, 10, 0, 1_000_000),
      schedulerHeartbeatSeconds: thresholds.schedulerHeartbeatSeconds === undefined
        ? null
        : boundedNumber(thresholds.schedulerHeartbeatSeconds, 3600, 1, 40 * 24 * 3600),
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
  const [retryResult, expiredLeaseResult, permanentLeaseResult, unrecoverableInFlightResult, reservedResult, receiptResult, attemptReadinessResult, inventoryResult, terminalResult, aggregatesResult, engagementResult, zibaiResult] = await readOnlyBounded(db, (readDb) => serialQueryResults([
    () => readDb.query(
      `SELECT count(*)::int AS overdue_count,
              COALESCE(max(extract(epoch FROM now()-COALESCE(next_retry_at,to_timestamp(0)))),0)::bigint AS oldest_age_seconds
         FROM mobile_push_attempts WHERE status='retry_due' AND send_started_at IS NULL
          AND COALESCE(next_retry_at,to_timestamp(0))<=now()
          AND (lease_token IS NULL OR lease_expires_at<=now())`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE lease_token IS NOT NULL AND lease_expires_at<=now()`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE lease_token IS NOT NULL AND lease_expires_at IS NULL`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE status IN ('reserved','retry_due') AND send_started_at IS NOT NULL AND lease_token IS NULL`,
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stale_count FROM mobile_push_attempts
        WHERE status='reserved' AND send_started_at IS NULL AND lease_token IS NULL
          AND COALESCE(next_retry_at,to_timestamp(0))<=now()
          AND COALESCE(updated_at,created_at)<=now()-($1::text||' seconds')::interval`,
      [String(config.thresholds.staleAttemptSeconds)],
    ),
    () => readDb.query(
      `SELECT count(*)::int AS stalled_count,
              COALESCE(max(extract(epoch FROM now()-COALESCE(accepted_at,created_at))),0)::bigint AS oldest_age_seconds
         FROM mobile_push_attempts WHERE provider='expo' AND status='provider_accepted'
          AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL
          AND (lease_token IS NULL OR lease_expires_at<=now())
          AND (accepted_at IS NULL OR (COALESCE(next_receipt_at,accepted_at,created_at)<=now()
            AND accepted_at<=now()-($1::text||' seconds')::interval))`,
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
                FILTER (WHERE a.accepted_at IS NOT NULL AND a.send_started_at IS NOT NULL
                  AND a.accepted_at>=a.send_started_at) AS provider_latency_p50_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.accepted_at-a.send_started_at))*1000)
                FILTER (WHERE a.accepted_at IS NOT NULL AND a.send_started_at IS NOT NULL
                  AND a.accepted_at>=a.send_started_at) AS provider_latency_p95_ms,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.provider_receipt_checked_at-a.accepted_at))*1000)
                FILTER (WHERE a.provider_receipt_checked_at IS NOT NULL AND a.accepted_at IS NOT NULL
                  AND a.provider_receipt_checked_at>=a.accepted_at) AS receipt_lag_p50_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.provider_receipt_checked_at-a.accepted_at))*1000)
                FILTER (WHERE a.provider_receipt_checked_at IS NOT NULL AND a.accepted_at IS NOT NULL
                  AND a.provider_receipt_checked_at>=a.accepted_at) AS receipt_lag_p95_ms
         FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
        WHERE a.updated_at >= now()-($1::text||' hours')::interval
        GROUP BY l.kind,a.provider,a.status ORDER BY l.kind,a.provider,a.status LIMIT 100`,
      [String(config.lookbackHours)],
    ),
    () => readDb.query(
      `WITH targeted AS (
         SELECT DISTINCT l.id AS push_log_id,a.installation_id
           FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
          WHERE a.status IN ('provider_accepted','delivered')
            AND a.accepted_at>=now()-($1::text||' hours')::interval
            AND a.accepted_at<=now() AND a.send_started_at IS NOT NULL
            AND a.accepted_at>=a.send_started_at
       ), evidence AS (
         SELECT e.event,e.push_log_id,e.installation_id
           FROM mobile_notification_engagements e JOIN targeted t
             ON t.push_log_id=e.push_log_id AND t.installation_id=e.installation_id
       ) SELECT (SELECT count(*)::int FROM targeted) AS targeted_count,
              count(DISTINCT (push_log_id,installation_id)) FILTER (WHERE event='app_received')::int AS app_received_count,
              count(DISTINCT (push_log_id,installation_id)) FILTER (WHERE event='opened')::int AS opened_count,
              count(DISTINCT (push_log_id,installation_id)) FILTER (WHERE event='action')::int AS action_count
         FROM evidence`,
      [String(config.lookbackHours)],
    ),
    () => readDb.query(
      `WITH installation AS (
         SELECT count(*) FILTER (WHERE due_at<=now()-($1::text||' seconds')::interval)::int AS overdue_count,
                COALESCE(max(extract(epoch FROM now()-due_at)) FILTER (WHERE due_at<=now()),0)::bigint AS oldest_lag_seconds,
                count(*) FILTER (WHERE latitude IS NULL)::int AS location_absent_count,
                count(*) FILTER (WHERE latitude IS NOT NULL AND location_captured_at>=now()-interval '3 hours' AND location_expires_at>now())::int AS location_fresh_count,
                count(*) FILTER (WHERE latitude IS NOT NULL AND NOT (location_captured_at>=now()-interval '3 hours' AND location_expires_at>now()))::int AS location_stale_count,
                count(*) FILTER (WHERE last_skip_reason='engine_unavailable' AND updated_at>=now()-($2::text||' hours')::interval)::int AS engine_failure_count
           FROM mobile_zibai_installations z
           CROSS JOIN LATERAL (VALUES (LEAST(
             CASE WHEN daily_enabled THEN COALESCE(next_daily_at,'infinity'::timestamptz) ELSE 'infinity'::timestamptz END,
             CASE WHEN shichen_enabled THEN COALESCE(next_shichen_at,'infinity'::timestamptz) ELSE 'infinity'::timestamptz END
           ))) due(due_at)
       ), occurrence AS (
         SELECT count(*) FILTER (WHERE occurrence_type='daily' AND state='reserved')::int AS daily_reserved_count,
                count(*) FILTER (WHERE occurrence_type='shichen' AND state='reserved')::int AS shichen_reserved_count,
                count(*) FILTER (WHERE state='skipped')::int AS skipped_count,
                count(*) FILTER (WHERE state='skipped' AND skip_reason='quiet_hours')::int AS quiet_skip_count,
                count(*) FILTER (WHERE skip_reason IN ('duplicate','duplicate_or_cap'))::int AS duplicate_or_cap_count
           FROM mobile_zibai_occurrences WHERE created_at>=now()-($2::text||' hours')::interval
       ) SELECT * FROM installation CROSS JOIN occurrence`,
      [String(config.thresholds.maxZibaiDueLagSeconds), String(config.lookbackHours)],
    ),
  ]));
  const retry = retryResult.rows[0] || {};
  const expiredLease = expiredLeaseResult.rows[0] || {};
  const permanentLease = permanentLeaseResult.rows[0] || {};
  const unrecoverableInFlight = unrecoverableInFlightResult.rows[0] || {};
  const reserved = reservedResult.rows[0] || {};
  const receipt = receiptResult.rows[0] || {};
  const attemptReadiness = attemptReadinessResult.rows[0] || {};
  const inventory = inventoryResult.rows[0] || {};
  const terminal = terminalResult.rows[0] || {};
  const engagement = engagementResult.rows[0] || {};
  const zibai = zibaiResult.rows[0] || {};
  const worker = heartbeatTiming(
    input.heartbeat?.workerAt,
    config.thresholds.workerHeartbeatSeconds,
    config.thresholds.heartbeatFutureSkewSeconds,
    now,
  );
  const schedulers = SCHEDULER_NAMES.map((name) => ({
    name,
    maxAgeSeconds: config.thresholds.schedulerHeartbeatSeconds || SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS[name],
    ...heartbeatTiming(
      input.heartbeat?.schedulers?.[name],
      config.thresholds.schedulerHeartbeatSeconds || SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS[name],
      config.thresholds.heartbeatFutureSkewSeconds,
      now,
    ),
  }));
  const activeProviders = { fcm: numeric(inventory.active_fcm_count), expo: numeric(inventory.active_expo_count) };
  const credentialMismatchCount = Object.entries(activeProviders)
    .filter(([provider, count]) => count > 0 && input.providerReady?.[provider] !== true).length;
  const metrics = {
    retry: { overdueCount: numeric(retry.overdue_count), oldestAgeSeconds: numeric(retry.oldest_age_seconds) },
    leases: { staleCount: numeric(expiredLease.stale_count) + numeric(permanentLease.stale_count) + numeric(unrecoverableInFlight.stale_count) + numeric(reserved.stale_count) },
    receipts: { stalledCount: numeric(receipt.stalled_count), oldestAgeSeconds: numeric(receipt.oldest_age_seconds) },
    readiness: {
      tokenMismatchCount: numeric(attemptReadiness.token_mismatch_count), credentialMismatchCount,
      mismatchCount: numeric(attemptReadiness.token_mismatch_count) + credentialMismatchCount,
    },
    outcomes: { deadLetterCount: numeric(terminal.dead_letter_count), invalidTokenCount: numeric(terminal.invalid_token_count), uncertainCount: numeric(terminal.uncertain_count) },
    worker,
    schedulers,
    engagement: {
      targetedCount: numeric(engagement.targeted_count),
      appReceivedCount: numeric(engagement.app_received_count),
      openedCount: numeric(engagement.opened_count),
      actionCount: numeric(engagement.action_count),
      ackRate: ratio(engagement.app_received_count, engagement.targeted_count),
      openRate: ratio(engagement.opened_count, engagement.targeted_count),
      actionRate: ratio(engagement.action_count, engagement.targeted_count),
    },
    zibai: {
      overdueCount: numeric(zibai.overdue_count), oldestLagSeconds: numeric(zibai.oldest_lag_seconds),
      locationFreshCount: numeric(zibai.location_fresh_count), locationStaleCount: numeric(zibai.location_stale_count),
      locationAbsentCount: numeric(zibai.location_absent_count), engineFailureCount: numeric(zibai.engine_failure_count),
      dailyReservedCount: numeric(zibai.daily_reserved_count), shichenReservedCount: numeric(zibai.shichen_reserved_count),
      skippedCount: numeric(zibai.skipped_count), quietSkipCount: numeric(zibai.quiet_skip_count),
      duplicateOrCapCount: numeric(zibai.duplicate_or_cap_count),
    },
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
  if (metrics.zibai.overdueCount > 0) reasons.push("zibai_due_lag");
  if (metrics.zibai.engineFailureCount > config.thresholds.maxZibaiEngineFailureCount) reasons.push("zibai_engine_failures");
  if (!metrics.worker.fresh) reasons.push(metrics.worker.ageSeconds === null
    ? "worker_heartbeat_missing" : metrics.worker.future ? "worker_heartbeat_future" : "worker_heartbeat_stale");
  for (const scheduler of metrics.schedulers) {
    if (!scheduler.fresh) reasons.push(`scheduler_heartbeat_${scheduler.ageSeconds === null
      ? "missing" : scheduler.future ? "future" : "stale"}:${scheduler.name}`);
  }
  return { ok: reasons.length === 0, reasons, metrics, windowHours: config.lookbackHours };
}

async function reconcile(db, input = {}) {
  const derivedParentStatus = derivedParentStatusSql({
    delivered: "delivered", accepted: "accepted", open: "open",
  });
  const result = await readOnlyBounded(db, (readDb) => readDb.query(
    `WITH parents AS (
       SELECT l.id,l.delivery_status,l.attempt_count,l.last_error,l.delivery_model_generation,l.attempts_retired_at,
              count(a.id) AS attempt_total,
              count(a.id) FILTER (WHERE a.status='delivered') AS delivered,
              count(a.id) FILTER (WHERE a.status='provider_accepted') AS accepted,
              count(a.id) FILTER (WHERE a.status IN ('reserved','retry_due')) AS open,
              COALESCE(sum(a.send_count),0) AS sends
         FROM mobile_push_log l LEFT JOIN mobile_push_attempts a ON a.push_log_id=l.id
        GROUP BY l.id,l.delivery_status,l.attempt_count,l.last_error,l.delivery_model_generation,l.attempts_retired_at
     ), parent_truth AS (
       SELECT count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND attempt_total>0
                AND delivery_status <> ${derivedParentStatus})::int AS parent_truth_mismatch,
              count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND attempt_total>0
                AND attempt_count<>sends)::int AS parent_attempt_count_mismatch,
              count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND delivery_status='failed' AND accepted>0)::int AS orphan_accepted_parent,
              count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND attempt_total=0
                AND delivery_status IN ('accepted','delivered'))::int AS orphan_failed_parent,
              count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND attempt_total=0
                AND NOT (delivery_status='failed' AND last_error='no_deliverable_installation'))::int AS orphan_new_parent,
              count(*) FILTER (WHERE delivery_model_generation=1 AND attempts_retired_at IS NULL AND attempt_total=0
                AND delivery_status='failed' AND last_error='no_deliverable_installation')::int AS no_delivery_parent_ignored,
              count(*) FILTER (WHERE delivery_model_generation=0 AND attempt_total=0)::int AS legacy_parent_ignored,
              count(*) FILTER (WHERE delivery_model_generation=0 AND attempt_total>0)::int AS legacy_parent_with_attempts,
              count(*) FILTER (WHERE attempts_retired_at IS NOT NULL AND attempt_total=0)::int AS retired_parent_ignored,
              count(*) FILTER (WHERE attempts_retired_at IS NOT NULL AND attempt_total>0)::int AS retired_parent_with_attempts
         FROM parents
     ), attempts AS (
       SELECT count(*) FILTER (WHERE l.id IS NULL)::int AS orphan_attempt,
              count(*) FILTER (WHERE l.id IS NULL AND a.provider='expo' AND a.provider_ticket_id IS NOT NULL)::int AS orphan_receipt,
              count(*) FILTER (WHERE ${attemptImpossibleSql("a")})::int AS impossible_state
         FROM mobile_push_attempts a LEFT JOIN mobile_push_log l ON l.id=a.push_log_id
     ) SELECT * FROM parent_truth CROSS JOIN attempts`,
  ));
  const row = result.rows[0] || {};
  const counts = {
    parentTruthMismatch: numeric(row.parent_truth_mismatch),
    parentAttemptCountMismatch: numeric(row.parent_attempt_count_mismatch),
    orphanAttempt: numeric(row.orphan_attempt),
    orphanReceipt: numeric(row.orphan_receipt),
    orphanAcceptedParent: numeric(row.orphan_accepted_parent),
    orphanFailedParent: numeric(row.orphan_failed_parent),
    orphanNewParent: numeric(row.orphan_new_parent),
    noDeliveryParentIgnored: numeric(row.no_delivery_parent_ignored),
    legacyParentIgnored: numeric(row.legacy_parent_ignored),
    legacyParentWithAttempts: numeric(row.legacy_parent_with_attempts),
    retiredParentIgnored: numeric(row.retired_parent_ignored),
    retiredParentWithAttempts: numeric(row.retired_parent_with_attempts),
    impossibleState: numeric(row.impossible_state),
  };
  const informational = new Set(["legacyParentIgnored", "noDeliveryParentIgnored", "retiredParentIgnored"]);
  const ok = Object.entries(counts).every(([name, count]) => informational.has(name) || count === 0);
  return { ok, scope: "generation_1_unretired_and_all_attempts", counts };
}

module.exports = { collectHealth, reconcile, readOnlyBounded, serialQueryResults };
