"use strict";

const { derivedParentStatusSql, retentionStableAttemptSql } = require("./notification-delivery-invariants.cjs");

function integerOption(value, fallback, minimum, maximum, name) {
  const selected = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw new TypeError(`invalid notification retention option: ${name}`);
  }
  return selected;
}

function optionsFor(input = {}) {
  const config = {
    sourceFactsDays: integerOption(input.sourceFactsDays, 30, 1, 3650, "sourceFactsDays"),
    // Installation ownership is required to authenticate late open/action
    // callbacks. Keep that evidence for the full engagement acceptance window.
    attemptDays: integerOption(input.attemptDays, 90, 1, 3650, "attemptDays"),
    engagementDays: integerOption(input.engagementDays, 90, 1, 3650, "engagementDays"),
    historyDays: integerOption(input.historyDays, 180, 30, 3650, "historyDays"),
    securityHistoryDays: integerOption(input.securityHistoryDays, 365, 30, 3650, "securityHistoryDays"),
    ziweiOccurrenceDays: integerOption(input.ziweiOccurrenceDays, 30, 1, 3650, "ziweiOccurrenceDays"),
    batchSize: integerOption(input.batchSize, 500, 1, 5000, "batchSize"),
    maxBatches: integerOption(input.maxBatches, 20, 1, 100, "maxBatches"),
  };
  if (config.sourceFactsDays > config.historyDays || config.attemptDays < config.engagementDays
      || config.engagementDays > config.historyDays
      || config.securityHistoryDays < config.historyDays) {
    throw new TypeError("invalid notification retention window ordering");
  }
  return config;
}

function isPool(db) {
  return typeof db?.connect === "function" && typeof db?.totalCount === "number";
}

async function transaction(client, run) {
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  }
}

async function redactSourceFactsBatch(client, config) {
  return transaction(client, async (tx) => {
    const result = await tx.query(
      `WITH candidates AS (
         SELECT l.id FROM mobile_push_log l
          WHERE l.source_facts_redacted_at IS NULL AND l.source_facts<>'{}'::jsonb
            AND l.delivery_status IN ('accepted','delivered','failed')
            AND COALESCE(l.sent_at,l.accepted_at,l.updated_at)<now()-($1::text||' days')::interval
            AND NOT EXISTS (
              SELECT 1 FROM mobile_push_attempts a WHERE a.push_log_id=l.id AND (
                a.status IN ('reserved','retry_due')
                OR (a.provider='expo' AND a.status='provider_accepted' AND a.provider_receipt_checked_at IS NULL)
              )
            )
          ORDER BY COALESCE(l.sent_at,l.accepted_at,l.updated_at),l.id
          LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       UPDATE mobile_push_log l SET source_facts='{}'::jsonb,source_facts_redacted_at=now()
        FROM candidates c WHERE l.id=c.id RETURNING l.id`,
      [String(config.sourceFactsDays), config.batchSize],
    );
    return result.rowCount || 0;
  });
}

async function purgeAttemptsBatch(client, config) {
  return transaction(client, async (tx) => {
    const derivedParentStatus = derivedParentStatusSql({
      delivered: "rollup.delivered", accepted: "rollup.accepted", open: "rollup.open",
    });
    const candidates = await tx.query(
      `WITH old_parents AS (
         SELECT DISTINCT a.push_log_id FROM mobile_push_attempts a
          WHERE a.updated_at<now()-($1::text||' days')::interval
       ), rollup AS (
         SELECT a.push_log_id,count(*) AS attempt_total,
                count(*) FILTER (WHERE a.status='delivered') AS delivered,
                count(*) FILTER (WHERE a.status='provider_accepted') AS accepted,
                count(*) FILTER (WHERE a.status IN ('reserved','retry_due')) AS open,
                COALESCE(sum(a.send_count),0) AS sends,
                bool_and(${retentionStableAttemptSql("a", "$1")}) AS children_purgeable
           FROM mobile_push_attempts a JOIN old_parents old ON old.push_log_id=a.push_log_id
          GROUP BY a.push_log_id
       ), eligible AS (
         SELECT l.id FROM mobile_push_log l JOIN rollup ON rollup.push_log_id=l.id
          WHERE l.delivery_model_generation=1 AND l.attempts_retired_at IS NULL
            AND rollup.attempt_total>0 AND rollup.children_purgeable
            AND l.delivery_status=${derivedParentStatus}
            AND l.attempt_count=rollup.sends
       )
       SELECT l.id FROM mobile_push_log l JOIN eligible e ON e.id=l.id
        ORDER BY l.id LIMIT $2 FOR UPDATE OF l SKIP LOCKED`,
      [String(config.attemptDays), config.batchSize],
    );
    const ids = candidates.rows.map((row) => row.id);
    if (!ids.length) return 0;
    // The candidate statement can wait for a worker-held parent lock. Re-read
    // every child after acquiring those locks so a state change committed while
    // we waited cannot be retired from a stale statement snapshot.
    const verified = await tx.query(
      `WITH rollup AS (
         SELECT a.push_log_id,count(*) AS attempt_total,
                count(*) FILTER (WHERE a.status='delivered') AS delivered,
                count(*) FILTER (WHERE a.status='provider_accepted') AS accepted,
                count(*) FILTER (WHERE a.status IN ('reserved','retry_due')) AS open,
                COALESCE(sum(a.send_count),0) AS sends,
                bool_and(${retentionStableAttemptSql("a", "$1")}) AS children_purgeable
           FROM mobile_push_attempts a WHERE a.push_log_id=ANY($2::uuid[])
          GROUP BY a.push_log_id
       )
       SELECT l.id FROM mobile_push_log l JOIN rollup ON rollup.push_log_id=l.id
        WHERE l.id=ANY($2::uuid[]) AND l.delivery_model_generation=1
          AND l.attempts_retired_at IS NULL AND rollup.attempt_total>0 AND rollup.children_purgeable
          AND l.delivery_status=${derivedParentStatus} AND l.attempt_count=rollup.sends`,
      [String(config.attemptDays), ids],
    );
    const verifiedIds = verified.rows.map((row) => row.id);
    if (!verifiedIds.length) return 0;
    await tx.query(`UPDATE mobile_push_log SET attempts_retired_at=now() WHERE id=ANY($1::uuid[])`, [verifiedIds]);
    const deleted = await tx.query(`DELETE FROM mobile_push_attempts WHERE push_log_id=ANY($1::uuid[]) RETURNING id`, [verifiedIds]);
    return deleted.rowCount || 0;
  });
}

async function purgeEngagementsBatch(client, config) {
  return transaction(client, async (tx) => {
    const result = await tx.query(
      `WITH candidates AS (
         SELECT user_id,installation_id,push_log_id,event,action_id
           FROM mobile_notification_engagements
          WHERE recorded_at<now()-($1::text||' days')::interval
          ORDER BY recorded_at,push_log_id LIMIT $2 FOR UPDATE SKIP LOCKED
       ) DELETE FROM mobile_notification_engagements e USING candidates c
          WHERE e.user_id=c.user_id AND e.installation_id=c.installation_id
            AND e.push_log_id=c.push_log_id AND e.event=c.event AND e.action_id=c.action_id
        RETURNING e.push_log_id`,
      [String(config.engagementDays), config.batchSize],
    );
    return result.rowCount || 0;
  });
}

async function purgeHistoryBatch(client, config) {
  return transaction(client, async (tx) => {
    const result = await tx.query(
      `WITH candidates AS (
         SELECT l.id FROM mobile_push_log l
          WHERE l.delivery_status IN ('accepted','delivered','failed')
            AND COALESCE(l.sent_at,l.accepted_at,l.updated_at)<now()-(
              CASE WHEN l.kind IN ('security','service') THEN $1::text ELSE $2::text END||' days'
            )::interval
            AND NOT EXISTS (SELECT 1 FROM mobile_push_attempts a WHERE a.push_log_id=l.id)
            AND (
              l.attempts_retired_at IS NOT NULL
              OR l.delivery_model_generation=0
              OR (l.delivery_model_generation=1 AND l.delivery_status='failed'
                AND l.last_error='no_deliverable_installation')
            )
          ORDER BY COALESCE(l.sent_at,l.accepted_at,l.updated_at),l.id
          LIMIT $3 FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mobile_push_log l USING candidates c WHERE l.id=c.id RETURNING l.id`,
      [String(config.securityHistoryDays), String(config.historyDays), config.batchSize],
    );
    return result.rowCount || 0;
  });
}

async function purgeZiweiOccurrencesBatch(client, config) {
  return transaction(client, async (tx) => {
    const result = await tx.query(
      `WITH candidates AS (
         SELECT id FROM mobile_ziwei_hourly_occurrences
          WHERE state IN ('claimed','skipped') AND push_log_id IS NULL
            AND created_at<now()-($1::text||' days')::interval
            AND window_valid_until<=now() AND send_deadline<=now()
          ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED
       ) DELETE FROM mobile_ziwei_hourly_occurrences o USING candidates c
          WHERE o.id=c.id AND o.state IN ('claimed','skipped') AND o.push_log_id IS NULL
            AND o.window_valid_until<=now() AND o.send_deadline<=now()
        RETURNING o.id`,
      [String(config.ziweiOccurrenceDays), config.batchSize],
    );
    return result.rowCount || 0;
  });
}

async function runPhase(client, config, execute) {
  let total = 0;
  for (let batch = 0; batch < config.maxBatches; batch += 1) {
    const count = await execute(client, config);
    total += count;
    if (count < config.batchSize) break;
  }
  return total;
}

async function runRetention(db, input = {}) {
  const config = optionsFor(input);
  const pooled = isPool(db);
  const client = pooled ? await db.connect() : db;
  let locked = false;
  try {
    const lock = await client.query(
      `SELECT pg_try_advisory_lock(hashtextextended('mobile-notification-retention:v1',0)) AS locked`,
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) {
      return { ok: true, status: "overlap_skipped", sourceFactsRedacted: 0, engagementPurged: 0, attemptsPurged: 0, historyPurged: 0, ziweiOccurrencesPurged: 0 };
    }
    const ziweiOccurrencesPurged = await runPhase(client, config, purgeZiweiOccurrencesBatch);
    const sourceFactsRedacted = await runPhase(client, config, redactSourceFactsBatch);
    const engagementPurged = await runPhase(client, config, purgeEngagementsBatch);
    const attemptsPurged = await runPhase(client, config, purgeAttemptsBatch);
    const historyPurged = await runPhase(client, config, purgeHistoryBatch);
    return { ok: true, status: "completed", sourceFactsRedacted, engagementPurged, attemptsPurged, historyPurged, ziweiOccurrencesPurged };
  } finally {
    if (locked) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtextextended('mobile-notification-retention:v1',0)) AS unlocked`,
      ).catch(() => null);
    }
    if (pooled) client.release();
  }
}

module.exports = { optionsFor,purgeAttemptsBatch,purgeEngagementsBatch,purgeHistoryBatch,purgeZiweiOccurrencesBatch,redactSourceFactsBatch,runRetention };
