/** Durable per-installation reservation, provider delivery, and receipt state. */
const { createHash } = require("node:crypto");
const push = require("./push-send.cjs");

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_SECONDS = 300;
const DEFAULT_LEASE_SECONDS = 60;
const MAX_DELAY_SECONDS = 21_600;

function cleanJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function messageSha256(message) {
  return createHash("sha256").update(stableStringify(message)).digest("hex");
}

function deterministicLeaseToken(attemptId, ordinal) {
  const hex = createHash("md5").update(`${attemptId}:${ordinal}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeReason(outcome) {
  return String(outcome?.reason || outcome?.kind || "provider_failed")
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, 300);
}

function errorSummary(result) {
  const reasons = (result?.outcomes || [])
    .filter((outcome) => outcome && outcome.kind !== "provider_accepted" && outcome.kind !== "delivered")
    .map(safeReason)
    .filter(Boolean);
  return [...new Set(reasons)].join(" | ").slice(0, 800) || "provider_not_accepted";
}

async function transaction(db, run) {
  const isPool = typeof db?.connect === "function" && typeof db?.totalCount === "number";
  const client = isPool ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    if (isPool) client.release();
  }
}

async function reserve(db, notice, dry = false) {
  if (dry) {
    const existing = await db.query(
      `SELECT delivery_status FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`,
      [notice.userId, notice.key],
    );
    return existing.rows[0] ? null : { id: null, attemptIds: [] };
  }

  return transaction(db, async (client) => {
    const parent = await client.query(
      `INSERT INTO mobile_push_log
         (user_id,yam_key,kind,title,body,payload,delivery_status,attempt_count,
          next_retry_at,accepted_at,sent_at,last_error,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',0,now(),NULL,NULL,NULL,now())
       ON CONFLICT (user_id,yam_key) DO NOTHING
       RETURNING id`,
      [notice.userId, notice.key, notice.kind, notice.title, notice.body, JSON.stringify(notice.payload || {})],
    );
    if (!parent.rows[0]) return null;

    const attemptIds = [];
    const messages = Array.isArray(notice.messages) ? notice.messages.slice(0, 100) : [];
    for (const item of messages) {
      if (!item?.tokenId) continue;
      const tokenResult = await client.query(
        `SELECT id,installation_id,device_push_token,device_token_type,expo_push_token,platform
           FROM mobile_push_tokens WHERE id=$1 AND user_id=$2 AND enabled=true`,
        [item.tokenId, notice.userId],
      );
      const token = tokenResult.rows[0];
      if (!token) continue;
      const target = {
        ...item,
        tokenId: token.id,
        installationId: token.installation_id,
        deviceToken: token.device_push_token,
        deviceTokenType: token.device_token_type,
        expoToken: token.expo_push_token,
        platform: token.platform,
      };
      const provider = push.providerFor(target);
      if (!provider) continue;
      const providerMessage = cleanJson(push.prepareMessage(item, provider));
      const inserted = await client.query(
        `INSERT INTO mobile_push_attempts
           (push_log_id,token_id,installation_id,provider,provider_message,message_sha256,
            status,next_retry_at,updated_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,'reserved',now(),now())
         ON CONFLICT(push_log_id,installation_id) DO NOTHING RETURNING id`,
        [parent.rows[0].id, token.id, token.installation_id, provider, JSON.stringify(providerMessage), messageSha256(providerMessage)],
      );
      if (inserted.rows[0]) attemptIds.push(inserted.rows[0].id);
    }
    return { id: parent.rows[0].id, attemptIds };
  });
}

async function deriveParent(db, pushLogId) {
  await db.query(
    `WITH child AS (
       SELECT push_log_id,
              count(*) FILTER (WHERE status='delivered') AS delivered,
              count(*) FILTER (WHERE status='provider_accepted') AS accepted,
              count(*) FILTER (WHERE status IN ('reserved','retry_due')) AS open,
              count(*) FILTER (WHERE status='dead') AS dead,
              count(*) AS total,
              COALESCE(sum(send_count),0) AS sends,
              min(next_retry_at) FILTER (WHERE status='retry_due') AS retry_at
         FROM mobile_push_attempts WHERE push_log_id=$1 GROUP BY push_log_id
     ), truth AS (
       SELECT *, CASE
         WHEN delivered>0 THEN 'delivered'
         WHEN accepted>0 THEN 'accepted'
         WHEN open>0 THEN 'pending'
         ELSE 'failed'
       END AS parent_status FROM child
     )
     UPDATE mobile_push_log l SET
       delivery_status=t.parent_status,
       attempt_count=t.sends,
       next_retry_at=t.retry_at,
       accepted_at=CASE WHEN t.parent_status IN ('accepted','delivered') THEN COALESCE(l.accepted_at,now()) ELSE NULL END,
       sent_at=CASE WHEN t.parent_status IN ('accepted','delivered') THEN COALESCE(l.sent_at,now()) ELSE NULL END,
       last_error=CASE WHEN t.parent_status='failed' THEN 'all_installations_dead'
                       WHEN t.parent_status IN ('accepted','delivered') THEN NULL ELSE l.last_error END,
       updated_at=now()
      FROM truth t WHERE l.id=t.push_log_id`,
    [pushLogId],
  );
}

async function claimDue(db, options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const leaseSeconds = Math.max(5, Math.min(900, Number(options.leaseSeconds || DEFAULT_LEASE_SECONDS)));
  const attemptIds = Array.isArray(options.attemptIds) && options.attemptIds.length ? options.attemptIds : null;
  return transaction(db, async (client) => {
    const result = await client.query(
      `WITH candidates AS (
         SELECT a.id,target.id AS target_token_id
           FROM mobile_push_attempts a
           JOIN mobile_push_log l ON l.id=a.push_log_id
           LEFT JOIN LATERAL (
             SELECT t.id
               FROM mobile_push_tokens t
              WHERE t.user_id=l.user_id AND t.installation_id=a.installation_id AND t.enabled=true
                AND (
                  (a.provider='fcm' AND t.device_push_token IS NOT NULL
                    AND t.platform<>'ios' AND COALESCE(t.device_token_type,'')<>'apns')
                  OR (a.provider='expo' AND t.expo_push_token IS NOT NULL)
                )
              ORDER BY (t.id=a.token_id) DESC,t.last_registered_at DESC NULLS LAST,t.updated_at DESC,t.id DESC
              LIMIT 1
           ) target ON true
          WHERE a.status IN ('reserved','retry_due')
            AND COALESCE(a.next_retry_at,to_timestamp(0))<=now()
            AND (a.lease_token IS NULL OR a.lease_expires_at<=now())
            AND ($2::uuid[] IS NULL OR a.id=ANY($2::uuid[]))
          ORDER BY COALESCE(a.next_retry_at,a.created_at),a.created_at,a.id
          FOR UPDATE OF a SKIP LOCKED
          LIMIT $1
       ), claimed AS (
         UPDATE mobile_push_attempts a SET
           send_count=a.send_count+1,
           token_id=c.target_token_id,
           lease_token=substr(md5(a.id::text||':'||(a.send_count+1)::text),1,8)||'-'||
                       substr(md5(a.id::text||':'||(a.send_count+1)::text),9,4)||'-'||
                       substr(md5(a.id::text||':'||(a.send_count+1)::text),13,4)||'-'||
                       substr(md5(a.id::text||':'||(a.send_count+1)::text),17,4)||'-'||
                       substr(md5(a.id::text||':'||(a.send_count+1)::text),21,12),
           lease_expires_at=now()+($3::text||' seconds')::interval,
           updated_at=now()
          FROM candidates c WHERE a.id=c.id
          RETURNING a.*
       )
       SELECT c.*,t.device_push_token,t.expo_push_token,t.enabled AS token_enabled
         FROM claimed c LEFT JOIN mobile_push_tokens t ON t.id=c.token_id
        ORDER BY c.created_at,c.id`,
      [limit, attemptIds, String(leaseSeconds)],
    );
    return result.rows;
  });
}

function retryDelaySeconds(sendCount, baseDelaySeconds, retryAfterSeconds) {
  const exponential = Math.min(MAX_DELAY_SECONDS, baseDelaySeconds * (2 ** Math.max(0, sendCount - 1)));
  const providerDelay = Number.isFinite(Number(retryAfterSeconds)) ? Math.max(0, Number(retryAfterSeconds)) : 0;
  return Math.min(MAX_DELAY_SECONDS, Math.max(exponential, providerDelay));
}

async function finishAttempt(db, attempt, outcome, options = {}) {
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const baseDelaySeconds = Math.max(1, Math.min(3600, Number(options.baseDelaySeconds || DEFAULT_BASE_DELAY_SECONDS)));
  const accepted = outcome?.kind === "provider_accepted";
  const delivered = outcome?.kind === "delivered";
  const terminal = outcome?.kind === "gone" || outcome?.retryable === false || Number(attempt.send_count) >= maxAttempts;
  const status = delivered ? "delivered" : accepted ? "provider_accepted" : terminal ? "dead" : "retry_due";
  const delay = status === "retry_due"
    ? retryDelaySeconds(Number(attempt.send_count), baseDelaySeconds, outcome?.retryAfterSeconds)
    : null;
  return transaction(db, async (client) => {
    const result = await client.query(
      `UPDATE mobile_push_attempts SET
         status=$3,
         next_retry_at=CASE WHEN $4::integer IS NULL THEN NULL ELSE now()+($4::text||' seconds')::interval END,
         lease_token=NULL,lease_expires_at=NULL,
         provider_message_id=COALESCE($5,provider_message_id),
         provider_ticket_id=COALESCE($6,provider_ticket_id),
         last_error=CASE WHEN $3 IN ('provider_accepted','delivered') THEN NULL ELSE $7 END,
         accepted_at=CASE WHEN $3 IN ('provider_accepted','delivered') THEN COALESCE(accepted_at,now()) ELSE accepted_at END,
         delivered_at=CASE WHEN $3='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END,
         updated_at=now()
       WHERE id=$1 AND lease_token=$2
       RETURNING push_log_id,token_id`,
      [attempt.id, attempt.lease_token, status, delay, outcome?.providerMessageId || null, outcome?.providerTicketId || null, safeReason(outcome)],
    );
    const updated = result.rows[0];
    if (!updated) return status;
    if (status === "dead" && (outcome?.kind === "gone" || safeReason(outcome) === "DeviceNotRegistered") && updated.token_id) {
      await client.query(
        `UPDATE mobile_push_tokens SET enabled=false,disabled_at=COALESCE(disabled_at,now()),updated_at=now() WHERE id=$1`,
        [updated.token_id],
      );
    }
    await deriveParent(client, updated.push_log_id);
    return status;
  });
}

async function runRetryBatch(db, options = {}) {
  const sender = options.sender || push;
  const claimed = await claimDue(db, options);
  const report = { claimed: claimed.length, accepted: 0, delivered: 0, retryDue: 0, dead: 0, outcomes: [] };
  for (const attempt of claimed) {
    let outcome;
    if (attempt.token_enabled !== true) {
      outcome = { kind: "gone", provider: attempt.provider, reason: "target_unavailable", retryable: false };
    } else {
      try {
        outcome = await sender.sendPrepared({
          attemptId: attempt.id,
          provider: attempt.provider,
          providerMessage: attempt.provider_message,
          deviceToken: attempt.device_push_token,
          expoToken: attempt.expo_push_token,
        });
      } catch {
        outcome = { kind: "failed", provider: attempt.provider, reason: "provider_exception", retryable: true };
      }
    }
    report.outcomes.push(outcome);
    const status = await finishAttempt(db, attempt, outcome, options);
    if (status === "provider_accepted") report.accepted += 1;
    else if (status === "delivered") report.delivered += 1;
    else if (status === "retry_due") report.retryDue += 1;
    else report.dead += 1;
  }
  return report;
}

async function pollReceiptBatch(db, options = {}) {
  const sender = options.sender || push;
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const leaseSeconds = Math.max(5, Math.min(900, Number(options.leaseSeconds || DEFAULT_LEASE_SECONDS)));
  const attempts = await transaction(db, async (client) => {
    const result = await client.query(
      `WITH candidates AS (
         SELECT id FROM mobile_push_attempts
          WHERE provider='expo' AND status='provider_accepted' AND provider_ticket_id IS NOT NULL
            AND (lease_token IS NULL OR lease_expires_at<=now())
          ORDER BY accepted_at,id FOR UPDATE SKIP LOCKED LIMIT $1
       ), claimed AS (
         UPDATE mobile_push_attempts a SET
           lease_token='receipt-'||substr(md5(a.id::text||':'||a.send_count::text),1,32),
           lease_expires_at=now()+($2::text||' seconds')::interval,updated_at=now()
          FROM candidates c WHERE a.id=c.id RETURNING a.*
       ) SELECT * FROM claimed ORDER BY accepted_at,id`,
      [limit, String(leaseSeconds)],
    );
    return result.rows;
  });
  const report = { claimed: attempts.length, delivered: 0, errors: 0, pending: 0 };
  if (attempts.length === 0) return report;
  let receipts;
  try {
    receipts = await sender.pollExpoReceipts(attempts.map((attempt) => attempt.provider_ticket_id));
  } catch {
    receipts = {};
  }
  for (const attempt of attempts) {
    const receipt = receipts?.[attempt.provider_ticket_id];
    if (!receipt) {
      await db.query(
        `UPDATE mobile_push_attempts SET lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`,
        [attempt.id, attempt.lease_token],
      );
      report.pending += 1;
      continue;
    }
    const outcome = receipt.kind === "delivered"
      ? { kind: "delivered" }
      : { kind: "failed", reason: receipt.reason || "expo_receipt_error", retryable: receipt.retryable !== false };
    const status = await finishAttempt(db, attempt, outcome, options);
    if (status === "delivered") report.delivered += 1;
    else report.errors += 1;
  }
  return report;
}

async function deliver(db, notice, options = {}) {
  const dry = options.dry === true;
  const reservation = await reserve(db, notice, dry);
  if (!reservation) return { status: "duplicate", sent: 0, failed: 0, result: null };
  const messages = Array.isArray(notice.messages) ? notice.messages : [];
  if (dry) return { status: "dry", sent: messages.length, failed: 0, result: null };
  if (reservation.attemptIds.length === 0) {
    await db.query(
      `UPDATE mobile_push_log SET delivery_status='failed',next_retry_at=NULL,last_error='no_deliverable_installation',updated_at=now() WHERE id=$1`,
      [reservation.id],
    );
    return { status: "failed", sent: 0, failed: messages.length, result: null };
  }
  if (options.defer === true) return { status: "pending", sent: 0, failed: 0, result: null };
  const result = await runRetryBatch(db, { ...options, attemptIds: reservation.attemptIds });
  const parent = await db.query(`SELECT delivery_status FROM mobile_push_log WHERE id=$1`, [reservation.id]);
  return {
    status: parent.rows[0]?.delivery_status || "failed",
    sent: result.accepted + result.delivered,
    failed: result.retryDue + result.dead,
    result,
  };
}

module.exports = {
  claimDue,
  deliver,
  deriveParent,
  deterministicLeaseToken,
  errorSummary,
  finishAttempt,
  messageSha256,
  pollReceiptBatch,
  reserve,
  retryDelaySeconds,
  runRetryBatch,
  stableStringify,
};
