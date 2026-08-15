"use strict";

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
    attemptDays: integerOption(input.attemptDays, 30, 1, 3650, "attemptDays"),
    historyDays: integerOption(input.historyDays, 180, 30, 3650, "historyDays"),
    securityHistoryDays: integerOption(input.securityHistoryDays, 365, 30, 3650, "securityHistoryDays"),
    batchSize: integerOption(input.batchSize, 500, 1, 5000, "batchSize"),
    maxBatches: integerOption(input.maxBatches, 20, 1, 100, "maxBatches"),
  };
  if (config.sourceFactsDays > config.historyDays || config.attemptDays > config.historyDays
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
    const candidates = await tx.query(
      `WITH old_parents AS (
         SELECT DISTINCT a.push_log_id FROM mobile_push_attempts a
          WHERE a.updated_at<now()-($1::text||' days')::interval
       ), eligible AS (
         SELECT old.push_log_id FROM old_parents old
          WHERE NOT EXISTS (
            SELECT 1 FROM mobile_push_attempts a WHERE a.push_log_id=old.push_log_id AND (
              a.updated_at>=now()-($1::text||' days')::interval
              OR NOT (
                a.status IN ('dead','delivered')
                OR (a.provider='fcm' AND a.status='provider_accepted')
                OR (a.provider='expo' AND a.status='provider_accepted' AND a.provider_receipt_checked_at IS NOT NULL)
              )
            )
          )
       )
       SELECT l.id FROM mobile_push_log l JOIN eligible e ON e.push_log_id=l.id
        WHERE l.delivery_model_generation=1 AND l.attempts_retired_at IS NULL
        ORDER BY l.id LIMIT $2 FOR UPDATE OF l SKIP LOCKED`,
      [String(config.attemptDays), config.batchSize],
    );
    const ids = candidates.rows.map((row) => row.id);
    if (!ids.length) return 0;
    await tx.query(`UPDATE mobile_push_log SET attempts_retired_at=now() WHERE id=ANY($1::uuid[])`, [ids]);
    const deleted = await tx.query(`DELETE FROM mobile_push_attempts WHERE push_log_id=ANY($1::uuid[]) RETURNING id`, [ids]);
    return deleted.rowCount || 0;
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
            AND NOT EXISTS (
              SELECT 1 FROM mobile_push_attempts a WHERE a.push_log_id=l.id AND (
                a.updated_at>=now()-($3::text||' days')::interval
                OR a.status IN ('reserved','retry_due')
                OR (a.provider='expo' AND a.status='provider_accepted' AND a.provider_receipt_checked_at IS NULL)
              )
            )
          ORDER BY COALESCE(l.sent_at,l.accepted_at,l.updated_at),l.id
          LIMIT $4 FOR UPDATE SKIP LOCKED
       )
       DELETE FROM mobile_push_log l USING candidates c WHERE l.id=c.id RETURNING l.id`,
      [String(config.securityHistoryDays), String(config.historyDays), String(config.attemptDays), config.batchSize],
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
      return { ok: true, status: "overlap_skipped", sourceFactsRedacted: 0, attemptsPurged: 0, historyPurged: 0 };
    }
    const sourceFactsRedacted = await runPhase(client, config, redactSourceFactsBatch);
    const attemptsPurged = await runPhase(client, config, purgeAttemptsBatch);
    const historyPurged = await runPhase(client, config, purgeHistoryBatch);
    return { ok: true, status: "completed", sourceFactsRedacted, attemptsPurged, historyPurged };
  } finally {
    if (locked) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtextextended('mobile-notification-retention:v1',0)) AS unlocked`,
      ).catch(() => null);
    }
    if (pooled) client.release();
  }
}

module.exports = { optionsFor,purgeAttemptsBatch,purgeHistoryBatch,redactSourceFactsBatch,runRetention };
