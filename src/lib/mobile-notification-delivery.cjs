/** Durable per-installation reservation, provider delivery, and receipt state. */
const { createHash } = require("node:crypto");
const push = require("./push-send.cjs");
const notificationPayload = require("./notification-payload.cjs");
const notificationScience = require("./notification-science.cjs");

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_SECONDS = 300;
const DEFAULT_LEASE_SECONDS = 60;
const MAX_DELAY_SECONDS = 21_600;

function cleanJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoCredentialFacts(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]+/gu, "");
    const sensitiveKeyParts = [
      "token", "auth", "authorization", "secret", "credential", "password", "cookie", "session",
      "apikey", "privatekey", "accesskey", "clientsecret", "bearer",
    ];
    if (normalizedKey.endsWith("key") || sensitiveKeyParts.some((part) => normalizedKey.includes(part))) {
      throw new TypeError("notification source facts contain a forbidden credential key");
    }
    assertNoCredentialFacts(child);
  }
}

function isTransactionalKind(kind) {
  return kind === "security" || kind === "service";
}

function assertTransactionalKind(notice) {
  if (notice?.transactional === true && !isTransactionalKind(notice?.kind)) {
    throw new TypeError("transactional notifications require kind security or service");
  }
}

function localizedHistoryCopies(build) {
  if (typeof build !== "function") throw new TypeError("notification history copy builder is required");
  return Object.fromEntries(["th", "en", "zh"].map((locale) => {
    const copy = build(locale);
    const title = String(copy?.title || "").slice(0, 120);
    const body = String(copy?.body || "").slice(0, 400);
    if (!title || !body) throw new TypeError(`notification history copy is incomplete for ${locale}`);
    return [locale, { title, body }];
  }));
}

function historyCopyFor(notice, locale) {
  const family = notificationPayload.normalizedLocale(locale);
  const copy = notice?.historyCopies?.[family];
  return {
    title: String(copy?.title || notice?.title || "").slice(0, 120),
    body: String(copy?.body || notice?.body || "").slice(0, 400),
  };
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

function isPool(db) {
  return typeof db?.connect === "function" && typeof db?.totalCount === "number";
}

async function withClient(db, run) {
  const pooled = isPool(db);
  const client = pooled ? await db.connect() : db;
  const lifecycle = {
    destroy: false,
    discard() { this.destroy = true; },
  };
  try {
    return await run(client, lifecycle);
  } finally {
    if (pooled) client.release(lifecycle.destroy);
  }
}

async function transactionOn(client, run) {
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  }
}

async function transaction(db, run) {
  return withClient(db, (client) => transactionOn(client, run));
}

async function lockParent(client, pushLogId) {
  const result = await client.query(`SELECT id FROM mobile_push_log WHERE id=$1 FOR UPDATE`, [pushLogId]);
  return result.rowCount === 1;
}

async function deriveParentLocked(client, pushLogId) {
  await client.query(
    `WITH child AS (
       SELECT push_log_id,
              count(*) FILTER (WHERE status='delivered') AS delivered,
              count(*) FILTER (WHERE status='provider_accepted') AS accepted,
              count(*) FILTER (WHERE status IN ('reserved','retry_due')) AS open,
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

async function deriveParent(db, pushLogId) {
  return transaction(db, async (client) => {
    if (!await lockParent(client, pushLogId)) return;
    await deriveParentLocked(client, pushLogId);
  });
}

async function reserve(db, notice, dry = false) {
  assertTransactionalKind(notice);
  const zibaiOccurrenceId = notice?.kind === "zibai" && typeof notice?.zibaiOccurrenceId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(notice.zibaiOccurrenceId)
    ? notice.zibaiOccurrenceId : null;
  if (notice?.kind === "zibai" && zibaiOccurrenceId === null) throw new TypeError("zibai occurrence reservation required");
  if (dry) {
    const existing = await db.query(`SELECT 1 FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`, [notice.userId, notice.key]);
    return existing.rows[0] ? null : { id: null, attemptIds: [] };
  }
  return transaction(db, async (client) => {
    assertNoCredentialFacts(notice.sourceFacts);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('mobile-notification-cap:'||$1::text,0))`,
      [notice.userId],
    );
    const contextResult = await client.query(
      `SELECT COALESCE(to_jsonb(np)->>'timezone',to_jsonb(u)->>'timezone','Asia/Bangkok') AS timezone,
              COALESCE((to_jsonb(np)->>'max_per_day')::int,2) AS max_per_day,
              COALESCE(np.privacy_preview,false) AS privacy_preview,
              CASE
                WHEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
                  IN ('th','en','zh','cn','vi','ja','ru','ko','es')
                THEN lower(COALESCE(NULLIF(btrim(to_jsonb(u)->>'locale'),''),NULLIF(btrim(np.locale),''),'th'))
                ELSE 'th'
              END AS locale,
              np.user_id IS NOT NULL AS has_prefs
         FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
        WHERE u.id=$1`,
      [notice.userId],
    );
    const context = contextResult.rows[0];
    if (!context) return null;
    let zibaiOccurrence = null;
    if (notice.kind === "zibai") {
      const occurrence = await client.query(
        `SELECT id,user_id,installation_id,state,push_log_id FROM mobile_zibai_occurrences
          WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [zibaiOccurrenceId, notice.userId],
      );
      zibaiOccurrence = occurrence.rows[0] || null;
      if (!zibaiOccurrence || zibaiOccurrence.state !== "claimed" || zibaiOccurrence.push_log_id !== null
        || !Array.isArray(notice.messages) || notice.messages.length !== 1) return null;
    }
    const historyCopy = historyCopyFor(notice, context.locale);
    if (context.has_prefs === true && notice.transactional !== true && notice.kind !== "zibai") {
      const cap = await client.query(
        `SELECT count(*)::int AS reserved_today
           FROM mobile_push_log l
          WHERE l.user_id=$1
            AND l.delivery_status IN ('pending','accepted','delivered')
            AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE $2)::date
                = (now() AT TIME ZONE $2)::date`,
        [notice.userId, context.timezone],
      );
      if (Number(cap.rows[0]?.reserved_today || 0) >= Number(context.max_per_day)) return null;
    }
    const parent = await client.query(
      `INSERT INTO mobile_push_log
         (user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,attempt_count,
          next_retry_at,accepted_at,sent_at,last_error,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'pending',0,now(),NULL,NULL,NULL,now())
       ON CONFLICT (user_id,yam_key) DO NOTHING RETURNING id`,
      [notice.userId, notice.key, notice.kind, historyCopy.title, historyCopy.body,
        JSON.stringify(notice.payload || {}), JSON.stringify(notice.sourceFacts || {})],
    );
    if (!parent.rows[0]) return null;
    const attemptIds = [];
    for (const item of (Array.isArray(notice.messages) ? notice.messages.slice(0, 100) : [])) {
      if (!item?.tokenId) continue;
      const tokenResult = await client.query(
        `SELECT id,installation_id,device_push_token,device_token_type,expo_push_token,platform
           FROM mobile_push_tokens WHERE id=$1 AND user_id=$2 AND enabled=true`,
        [item.tokenId, notice.userId],
      );
      const token = tokenResult.rows[0];
      if (!token) continue;
      if (notice.kind === "zibai" && token.installation_id !== zibaiOccurrence.installation_id) continue;
      const provider = push.providerFor({
        ...item,
        deviceToken: token.device_push_token,
        deviceTokenType: token.device_token_type,
        expoToken: token.expo_push_token,
        platform: token.platform,
      });
      if (!provider) continue;
      const providerCopy = notificationPayload.previewCopy(
        notice.kind,
        context.privacy_preview === true,
        { title: item.title, body: item.body },
        item.locale || context.locale,
      );
      const itemData = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {};
      const providerMessage = cleanJson(push.prepareMessage({
        ...item,
        ...providerCopy,
        transactional: notice.transactional === true,
        data: { ...itemData, notificationId: parent.rows[0].id },
      }, provider));
      const inserted = await client.query(
        `INSERT INTO mobile_push_attempts
           (push_log_id,token_id,installation_id,provider,provider_message,message_sha256,
            privacy_safe,transactional,status,next_retry_at,updated_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'reserved',now(),now())
         ON CONFLICT(push_log_id,installation_id) DO NOTHING RETURNING id`,
        [parent.rows[0].id, token.id, token.installation_id, provider, JSON.stringify(providerMessage),
          messageSha256(providerMessage), context.privacy_preview !== true, notice.transactional === true],
      );
      if (inserted.rows[0]) attemptIds.push(inserted.rows[0].id);
    }
    if (notice.kind === "zibai") {
      await client.query(
        `UPDATE mobile_zibai_occurrences SET state='reserved',push_log_id=$2,updated_at=now()
          WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
        [zibaiOccurrenceId, parent.rows[0].id],
      );
    }
    return { id: parent.rows[0].id, attemptIds };
  });
}

async function trySchedulerRunLease(db, schedulerName) {
  const leaseKey = notificationScience.schedulerLeaseKey(schedulerName);
  const pooled = isPool(db);
  const client = pooled ? await db.connect() : db;
  let held = false;
  let released = false;
  try {
    const result = await client.query(
      `SELECT pg_try_advisory_lock(hashtextextended($1::text,0)) AS locked`,
      [leaseKey],
    );
    held = result.rows[0]?.locked === true;
    if (!held && pooled) client.release();
  } catch (error) {
    if (pooled) client.release();
    throw error;
  }
  return {
    acquired: held,
    async release() {
      if (!held || released) return;
      released = true;
      let destroy = false;
      try {
        const result = await client.query(
          `SELECT pg_advisory_unlock(hashtextextended($1::text,0)) AS unlocked`,
          [leaseKey],
        );
        if (result.rows[0]?.unlocked !== true) throw new Error("notification_scheduler_unlock_failed");
      } catch (error) {
        destroy = true;
        throw error;
      } finally {
        if (pooled) client.release(destroy);
      }
    },
  };
}

async function withSchedulerRunLease(db, schedulerName, run, options = {}) {
  const lease = await trySchedulerRunLease(db, schedulerName);
  if (!lease.acquired) return { acquired: false, result: null };
  try {
    const result = await notificationScience.withFencedTotalTimeout(
      (signal) => run(signal),
      Math.max(1, Number(options.timeoutMs || 12_000)),
    );
    return { acquired: true, result };
  } finally {
    await lease.release();
  }
}

function retryDelaySeconds(sendCount, baseDelaySeconds, retryAfterSeconds) {
  const exponential = Math.min(MAX_DELAY_SECONDS, baseDelaySeconds * (2 ** Math.max(0, sendCount - 1)));
  const providerDelay = Number.isFinite(Number(retryAfterSeconds)) ? Math.max(0, Number(retryAfterSeconds)) : 0;
  return Math.min(MAX_DELAY_SECONDS, Math.max(exponential, providerDelay));
}

async function claimOne(db, options = {}) {
  const leaseSeconds = Math.max(5, Math.min(900, Number(options.leaseSeconds || DEFAULT_LEASE_SECONDS)));
  const attemptIds = Array.isArray(options.attemptIds) && options.attemptIds.length ? options.attemptIds : null;
  return transaction(db, async (client) => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT a.id,target.id AS target_token_id
           FROM mobile_push_attempts a
           JOIN mobile_push_log l ON l.id=a.push_log_id
           LEFT JOIN LATERAL (
             SELECT t.id FROM mobile_push_tokens t
              WHERE t.user_id=l.user_id AND t.installation_id=a.installation_id AND t.enabled=true
                AND ((a.provider='fcm' AND t.device_push_token IS NOT NULL AND t.platform<>'ios' AND COALESCE(t.device_token_type,'')<>'apns')
                  OR (a.provider='expo' AND t.expo_push_token IS NOT NULL))
              ORDER BY (t.id=a.token_id) DESC,t.last_registered_at DESC NULLS LAST,t.updated_at DESC,t.id DESC LIMIT 1
           ) target ON true
          WHERE a.status IN ('reserved','retry_due') AND a.send_started_at IS NULL
            AND COALESCE(a.next_retry_at,to_timestamp(0))<=now()
            AND (a.lease_token IS NULL OR a.lease_expires_at<=now())
            AND ($1::uuid[] IS NULL OR a.id=ANY($1::uuid[]))
          ORDER BY COALESCE(a.next_retry_at,a.created_at),a.created_at,a.id
          FOR UPDATE OF a SKIP LOCKED LIMIT 1
       )
       UPDATE mobile_push_attempts a SET
         token_id=c.target_token_id,lease_token=gen_random_uuid()::text,
         lease_expires_at=now()+($2::text||' seconds')::interval,updated_at=now()
        FROM candidate c WHERE a.id=c.id RETURNING a.*`,
      [attemptIds, String(leaseSeconds)],
    );
    return result.rows[0] || null;
  });
}

async function tryInstallationLock(client, installationId) {
  const result = await client.query(
    `SELECT pg_try_advisory_xact_lock(hashtextextended('mobile-push-installation:'||$1::text,0)) AS locked`,
    [installationId],
  );
  return result.rows[0]?.locked === true;
}

async function acquireInstallationLock(client, installationId) {
  await client.query(
    `SELECT pg_advisory_lock(hashtextextended('mobile-push-installation:'||$1::text,0))`,
    [installationId],
  );
}

async function releaseInstallationLock(client, installationId) {
  const result = await client.query(
    `SELECT pg_advisory_unlock(hashtextextended('mobile-push-installation:'||$1::text,0)) AS unlocked`,
    [installationId],
  );
  if (result.rows[0]?.unlocked !== true) throw new Error("mobile_push_advisory_unlock_failed");
}

async function withInstallationLock(db, installationId, run) {
  return withClient(db, async (client, lifecycle) => {
    await acquireInstallationLock(client, installationId);
    try {
      return await run(client);
    } finally {
      try {
        await releaseInstallationLock(client, installationId);
      } catch (error) {
        lifecycle.discard();
        throw error;
      }
    }
  });
}

async function recoverUncertainOne(db, options = {}) {
  const attemptIds = Array.isArray(options.attemptIds) && options.attemptIds.length ? options.attemptIds : null;
  return transaction(db, async (client) => {
    const candidate = await client.query(
      `SELECT id,push_log_id,installation_id,lease_token FROM mobile_push_attempts
        WHERE status IN ('reserved','retry_due') AND send_started_at IS NOT NULL
          AND lease_expires_at<=now() AND ($1::uuid[] IS NULL OR id=ANY($1::uuid[]))
        ORDER BY lease_expires_at,id LIMIT 1`,
      [attemptIds],
    );
    const attempt = candidate.rows[0];
    if (!attempt || !await tryInstallationLock(client, attempt.installation_id)) return null;
    if (!await lockParent(client, attempt.push_log_id)) return null;
    const current = await client.query(
      `SELECT id FROM mobile_push_attempts WHERE id=$1 AND lease_token=$2
        AND status IN ('reserved','retry_due') AND send_started_at IS NOT NULL AND lease_expires_at<=now() FOR UPDATE`,
      [attempt.id, attempt.lease_token],
    );
    if (!current.rows[0]) return null;
    const updated = await client.query(
      `UPDATE mobile_push_attempts SET status='dead',next_retry_at=NULL,lease_token=NULL,lease_expires_at=NULL,
         last_error='uncertain_provider_result',updated_at=now()
        WHERE id=$1 AND lease_token=$2 AND send_started_at IS NOT NULL RETURNING id`,
      [attempt.id, attempt.lease_token],
    );
    if (!updated.rows[0]) return null;
    await deriveParentLocked(client, attempt.push_log_id);
    return attempt.id;
  });
}

async function finishIdentifierConflict(db, attempt) {
  return transaction(db, async (client) => {
    if (!await lockParent(client, attempt.push_log_id)) return null;
    const updated = await client.query(
      `UPDATE mobile_push_attempts SET status='dead',next_retry_at=NULL,lease_token=NULL,lease_expires_at=NULL,
         last_error='provider_identifier_conflict',updated_at=now()
        WHERE id=$1 AND lease_token=$2 RETURNING id`,
      [attempt.id, attempt.lease_token],
    );
    if (!updated.rows[0]) return null;
    await deriveParentLocked(client, attempt.push_log_id);
    return "dead";
  });
}

async function finishAttempt(db, attempt, outcome, options = {}) {
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS)));
  const baseDelaySeconds = Math.max(1, Math.min(3600, Number(options.baseDelaySeconds || DEFAULT_BASE_DELAY_SECONDS)));
  const accepted = outcome?.kind === "provider_accepted";
  const delivered = outcome?.kind === "delivered";
  const uncertain = outcome?.kind === "uncertain";
  const terminal = uncertain || outcome?.kind === "gone" || outcome?.retryable === false || Number(attempt.send_count) >= maxAttempts;
  const status = delivered ? "delivered" : accepted ? "provider_accepted" : terminal ? "dead" : "retry_due";
  const delay = status === "retry_due" ? retryDelaySeconds(Number(attempt.send_count), baseDelaySeconds, outcome?.retryAfterSeconds) : null;
  try {
    return await transaction(db, async (client) => {
      if (!await lockParent(client, attempt.push_log_id)) return null;
      const updated = await client.query(
        `UPDATE mobile_push_attempts SET status=$3,
           next_retry_at=CASE WHEN $4::integer IS NULL THEN NULL ELSE now()+($4::text||' seconds')::interval END,
           lease_token=NULL,lease_expires_at=NULL,
           send_started_at=CASE WHEN $3='retry_due' THEN NULL ELSE send_started_at END,
           provider_message_id=CASE WHEN $3='retry_due' THEN NULL ELSE COALESCE($5,provider_message_id) END,
           provider_ticket_id=CASE WHEN $3='retry_due' THEN NULL ELSE COALESCE($6,provider_ticket_id) END,
           next_receipt_at=CASE
             WHEN $3='provider_accepted' AND $6::text IS NOT NULL THEN now()
             WHEN $3 IN ('retry_due','delivered','dead') THEN NULL ELSE next_receipt_at END,
           provider_receipt_checked_at=CASE WHEN $3='retry_due' THEN NULL ELSE provider_receipt_checked_at END,
           receipt_poll_count=CASE WHEN $3='retry_due' THEN 0 ELSE receipt_poll_count END,
           last_error=CASE WHEN $3 IN ('provider_accepted','delivered') THEN NULL
                           WHEN $8::boolean THEN 'uncertain_provider_result' ELSE $7 END,
           accepted_at=CASE WHEN $3 IN ('provider_accepted','delivered') THEN now()
                            WHEN $3='retry_due' THEN NULL ELSE accepted_at END,
           delivered_at=CASE WHEN $3='delivered' THEN now() WHEN $3='retry_due' THEN NULL ELSE delivered_at END,
           updated_at=now()
         WHERE id=$1 AND lease_token=$2 RETURNING push_log_id,token_id`,
        [attempt.id, attempt.lease_token, status, delay, outcome?.providerMessageId || null, outcome?.providerTicketId || null, safeReason(outcome), uncertain],
      );
      const row = updated.rows[0];
      if (!row) return null;
      if (status === "dead" && (outcome?.kind === "gone" || safeReason(outcome) === "DeviceNotRegistered") && row.token_id) {
        await client.query(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=COALESCE(disabled_at,now()),updated_at=now() WHERE id=$1`, [row.token_id]);
      }
      await deriveParentLocked(client, row.push_log_id);
      return status;
    });
  } catch (error) {
    if (error?.code === "23505") return finishIdentifierConflict(db, attempt);
    throw error;
  }
}

function currentPolicyDecision(row, context, capCount) {
  if (context.privacy_preview !== true && row.privacy_safe !== true) {
    return { allow: false, terminal: true, reason: "policy_privacy_changed" };
  }
  if (row.transactional === true && !isTransactionalKind(row.kind)) {
    return { allow: false, terminal: true, reason: "policy_invalid_transactional_kind" };
  }
  if (row.transactional === true) return { allow: true };
  const now = new Date(context.now_at);
  if (row.kind === "zibai") {
    if (context.zibai_enabled !== true) return { allow: false, terminal: true, reason: "policy_consent_revoked" };
    if (context.zibai_expires_at && new Date(context.zibai_expires_at) <= now) {
      return { allow: false, terminal: true, reason: "policy_expired_occurrence" };
    }
    const timezone = notificationScience.safeTimezone(context.zibai_timezone);
    const hour = Number(notificationScience.zonedClock(timezone, now).time.slice(0, 2));
    const quietStart = Number.isInteger(Number(context.zibai_quiet_start)) ? Number(context.zibai_quiet_start) : 22;
    const quietEnd = Number.isInteger(Number(context.zibai_quiet_end)) ? Number(context.zibai_quiet_end) : 7;
    const quiet = quietStart === quietEnd ? false
      : quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd;
    if (quiet) return {
      allow: false,
      terminal: row.payload?.event === "zibai_shichen",
      reason: "policy_quiet_hours",
    };
    return { allow: true };
  }
  const timezone = notificationScience.safeTimezone(context.timezone);
  if (notificationScience.zonedClock(timezone, new Date(row.created_at)).date
      !== notificationScience.zonedClock(timezone, now).date) {
    return { allow: false, terminal: true, reason: "policy_expired_local_day" };
  }
  if (context.has_prefs !== true) return { allow: false, terminal: true, reason: "policy_consent_revoked" };
  const enabled = context.prefs?.[`${row.kind}_enabled`];
  if (enabled !== true) return { allow: false, terminal: true, reason: "policy_consent_revoked" };
  const pausedUntil = context.prefs?.paused_until ? new Date(context.prefs.paused_until) : null;
  if (pausedUntil && Number.isFinite(pausedUntil.valueOf()) && pausedUntil > now) {
    return { allow: false, terminal: false, reason: "policy_paused", retryAt: pausedUntil };
  }
  const maxPerDay = Number.isInteger(Number(context.prefs?.max_per_day))
    ? Number(context.prefs.max_per_day) : 2;
  if (Number(capCount || 0) > maxPerDay) {
    return { allow: false, terminal: true, reason: "policy_cap_reached" };
  }
  const quietStart = Number.isInteger(Number(context.prefs?.quiet_start)) ? Number(context.prefs.quiet_start) : 22;
  const quietEnd = Number.isInteger(Number(context.prefs?.quiet_end)) ? Number(context.prefs.quiet_end) : 7;
  const hour = Number(notificationScience.zonedClock(timezone, now).time.slice(0, 2));
  const quiet = quietStart === quietEnd ? false
    : quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd;
  if (quiet) return { allow: false, terminal: false, reason: "policy_quiet_hours" };
  return { allow: true };
}

async function applyCurrentPolicyLocked(tx, row) {
  await tx.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('mobile-notification-cap:'||$1::text,0))`,
    [row.user_id],
  );
  const contextResult = await tx.query(
    `SELECT COALESCE(to_jsonb(np)->>'timezone',to_jsonb(u)->>'timezone','Asia/Bangkok') AS timezone,
            COALESCE((to_jsonb(np)->>'privacy_preview')::boolean,false) AS privacy_preview,
            np.user_id IS NOT NULL AS has_prefs,to_jsonb(np) AS prefs,now() AS now_at
       FROM users u LEFT JOIN mobile_notification_prefs np ON np.user_id=u.id
      WHERE u.id=$1`,
    [row.user_id],
  );
  const context = contextResult.rows[0] || {
    timezone: "Asia/Bangkok", privacy_preview: false, has_prefs: false, prefs: null, now_at: new Date(),
  };
  if (row.kind === "zibai") {
    const event = row.payload && typeof row.payload === "object" ? row.payload.event : null;
    const zibai = await tx.query(
      `SELECT CASE WHEN $3='zibai_shichen' THEN shichen_enabled ELSE daily_enabled END AS enabled,
              location_timezone,quiet_start,quiet_end
         FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2`,
      [row.user_id, row.installation_id, event],
    );
    context.zibai_enabled = zibai.rows[0]?.enabled === true;
    context.zibai_expires_at = event === "zibai_shichen" ? row.payload?.endAt || null : null;
    context.zibai_timezone = zibai.rows[0]?.location_timezone || "UTC";
    context.zibai_quiet_start = zibai.rows[0]?.quiet_start;
    context.zibai_quiet_end = zibai.rows[0]?.quiet_end;
  }
  let capCount = 0;
  if (!(row.transactional === true && isTransactionalKind(row.kind)) && row.kind !== "zibai") {
    const cap = await tx.query(
      `SELECT count(*)::int AS reserved_today
         FROM mobile_push_log l
        WHERE l.user_id=$1
          AND l.delivery_status IN ('pending','accepted','delivered')
          AND (COALESCE(l.sent_at,l.accepted_at,l.updated_at) AT TIME ZONE $2)::date
              = (now() AT TIME ZONE $2)::date`,
      [row.user_id, notificationScience.safeTimezone(context.timezone)],
    );
    capCount = Number(cap.rows[0]?.reserved_today || 0);
  }
  const decision = currentPolicyDecision(row, context, capCount);
  if (decision.allow) return null;
  if (!await lockParent(tx, row.push_log_id)) return { status: null, reason: decision.reason };
  const status = decision.terminal ? "dead" : "retry_due";
  const retryAt = decision.retryAt instanceof Date
    ? decision.retryAt
    : new Date(new Date(context.now_at).valueOf() + 15 * 60_000);
  const updated = await tx.query(
    `UPDATE mobile_push_attempts SET status=$3,
       next_retry_at=CASE WHEN $3='retry_due' THEN $4::timestamptz ELSE NULL END,
       lease_token=NULL,lease_expires_at=NULL,last_error=$5,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND send_started_at IS NULL RETURNING push_log_id`,
    [row.id, row.lease_token, status, retryAt.toISOString(), decision.reason],
  );
  if (updated.rows[0]) await deriveParentLocked(tx, row.push_log_id);
  return { status, reason: decision.reason };
}

async function processClaim(db, attempt, options = {}) {
  const sender = options.sender || push;
  return withInstallationLock(db, attempt.installation_id, async (client) => {
      if (options.hooks?.afterClaim) await options.hooks.afterClaim(attempt);
      const started = await transactionOn(client, async (tx) => {
        const current = await tx.query(
          `SELECT a.*,l.user_id,l.kind,l.payload FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id
            WHERE a.id=$1 AND a.lease_token=$2 AND a.status IN ('reserved','retry_due') AND a.send_started_at IS NULL
            FOR UPDATE OF a`,
          [attempt.id, attempt.lease_token],
        );
        const row = current.rows[0];
        if (!row) return null;
        const policy = await applyCurrentPolicyLocked(tx, row);
        if (policy) return { ...row, policyBlocked: true, policy };
        const token = await tx.query(
          `SELECT id,device_push_token,expo_push_token FROM mobile_push_tokens
            WHERE user_id=$1 AND installation_id=$2 AND enabled=true
              AND (($3='fcm' AND device_push_token IS NOT NULL AND platform<>'ios' AND COALESCE(device_token_type,'')<>'apns')
                OR ($3='expo' AND expo_push_token IS NOT NULL))
            ORDER BY (id=$4) DESC,last_registered_at DESC NULLS LAST,updated_at DESC,id DESC LIMIT 1 FOR UPDATE`,
          [row.user_id, row.installation_id, row.provider, row.token_id],
        );
        if (!token.rows[0]) return { ...row, targetUnavailable: true };
        const marked = await tx.query(
          `UPDATE mobile_push_attempts SET token_id=$3,send_count=send_count+1,send_started_at=now(),
             accepted_at=NULL,delivered_at=NULL,provider_message_id=NULL,provider_ticket_id=NULL,
             provider_receipt_checked_at=NULL,next_receipt_at=NULL,receipt_poll_count=0,updated_at=now()
            WHERE id=$1 AND lease_token=$2 RETURNING *`,
          [row.id, row.lease_token, token.rows[0].id],
        );
        return {
          ...marked.rows[0],
          device_push_token: token.rows[0].device_push_token,
          expo_push_token: token.rows[0].expo_push_token,
        };
      });
      if (!started) return null;
      if (started.policyBlocked) {
        return {
          status: started.policy.status,
          outcome: { kind: "policy_blocked", reason: started.policy.reason, retryable: started.policy.status !== "dead" },
        };
      }
      if (started.targetUnavailable) {
        const status = await finishAttempt(client, started, { kind: "gone", reason: "target_unavailable", retryable: false }, options);
        return { status, outcome: { kind: "gone", reason: "target_unavailable", retryable: false } };
      }
      if (options.hooks?.afterSendStarted) await options.hooks.afterSendStarted(started);
      let outcome;
      try {
        outcome = await sender.sendPrepared({
          attemptId: started.id,provider: started.provider,providerMessage: started.provider_message,
          deviceToken: started.device_push_token,expoToken: started.expo_push_token,
        });
      } catch {
        outcome = { kind: "uncertain", provider: started.provider, reason: "uncertain_provider_result", retryable: false };
      }
      const status = await finishAttempt(client, started, outcome, options);
      return { status, outcome };
  });
}

async function runRetryBatch(db, options = {}) {
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const report = { claimed: 0, accepted: 0, delivered: 0, retryDue: 0, dead: 0, uncertainRecovered: 0, outcomes: [] };
  for (let processed = 0; processed < limit; processed += 1) {
    const recovered = await recoverUncertainOne(db, options);
    if (recovered) {
      report.dead += 1;
      report.uncertainRecovered += 1;
      continue;
    }
    const attempt = await claimOne(db, options);
    if (!attempt) break;
    report.claimed += 1;
    const completed = await processClaim(db, attempt, options);
    if (!completed?.status) continue;
    report.outcomes.push(completed.outcome);
    if (completed.status === "provider_accepted") report.accepted += 1;
    else if (completed.status === "delivered") report.delivered += 1;
    else if (completed.status === "retry_due") report.retryDue += 1;
    else report.dead += 1;
  }
  return report;
}

async function claimReceiptOne(db, options = {}) {
  const leaseSeconds = Math.max(5, Math.min(900, Number(options.leaseSeconds || DEFAULT_LEASE_SECONDS)));
  return transaction(db, async (client) => {
    const result = await client.query(
      `WITH candidate AS (
         SELECT id FROM mobile_push_attempts
          WHERE provider='expo' AND status='provider_accepted' AND provider_ticket_id IS NOT NULL
            AND provider_receipt_checked_at IS NULL
            AND COALESCE(next_receipt_at,accepted_at,created_at)<=now()
            AND (lease_token IS NULL OR lease_expires_at<=now())
          ORDER BY COALESCE(next_receipt_at,accepted_at,created_at),id FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE mobile_push_attempts a SET lease_token=gen_random_uuid()::text,
           lease_expires_at=now()+($1::text||' seconds')::interval,
           receipt_poll_count=receipt_poll_count+1,updated_at=now()
          FROM candidate c WHERE a.id=c.id RETURNING a.*`,
      [String(leaseSeconds)],
    );
    return result.rows[0] || null;
  });
}

async function scheduleReceiptRetry(db, attempt, options = {}) {
  const baseDelaySeconds = Math.max(1, Math.min(3600, Number(options.receiptBaseDelaySeconds || DEFAULT_BASE_DELAY_SECONDS)));
  const delay = retryDelaySeconds(Number(attempt.receipt_poll_count || 1), baseDelaySeconds, null);
  const result = await db.query(
    `UPDATE mobile_push_attempts SET lease_token=NULL,lease_expires_at=NULL,
       next_receipt_at=now()+($3::text||' seconds')::interval,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND status='provider_accepted' RETURNING id`,
    [attempt.id, attempt.lease_token, String(delay)],
  );
  return result.rowCount === 1;
}

async function finishReceipt(db, attempt, receipt, options = {}) {
  if (receipt?.kind === "provider_receipt_ok") {
    const result = await transaction(db, async (client) => {
      if (!await lockParent(client, attempt.push_log_id)) return false;
      const updated = await client.query(
        `UPDATE mobile_push_attempts SET provider_receipt_checked_at=now(),next_receipt_at=NULL,
           lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now()
          WHERE id=$1 AND lease_token=$2 AND status='provider_accepted' RETURNING push_log_id`,
        [attempt.id, attempt.lease_token],
      );
      if (!updated.rows[0]) return false;
      await deriveParentLocked(client, attempt.push_log_id);
      return true;
    });
    return result;
  }
  const outcome = { kind: "failed", reason: receipt?.reason || "expo_receipt_error", retryable: receipt?.retryable !== false };
  const status = await finishAttempt(db, attempt, outcome, options);
  return status !== null;
}

async function pollReceiptBatch(db, options = {}) {
  const sender = options.sender || push;
  const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
  const report = { claimed: 0, accepted: 0, delivered: 0, errors: 0, pending: 0, providerErrors: 0 };
  for (let count = 0; count < limit; count += 1) {
    const attempt = await claimReceiptOne(db, options);
    if (!attempt) break;
    report.claimed += 1;
    let receipts;
    try { receipts = await sender.pollExpoReceipts([attempt.provider_ticket_id]); }
    catch {
      await scheduleReceiptRetry(db, attempt, options);
      report.pending += 1;
      report.providerErrors += 1;
      break;
    }
    const receipt = receipts?.[attempt.provider_ticket_id];
    if (!receipt) {
      await scheduleReceiptRetry(db, attempt, options);
      report.pending += 1;
      continue;
    }
    const finished = await finishReceipt(db, attempt, receipt, options);
    if (!finished) continue;
    if (receipt.kind === "provider_receipt_ok") report.accepted += 1;
    else if (receipt.kind === "delivered") report.delivered += 1;
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
    await db.query(`UPDATE mobile_push_log SET delivery_status='failed',next_retry_at=NULL,last_error='no_deliverable_installation',updated_at=now() WHERE id=$1`, [reservation.id]);
    return { status: "failed", sent: 0, failed: messages.length, result: null };
  }
  if (options.defer === true) return { status: "pending", sent: 0, failed: 0, result: null };
  const result = await runRetryBatch(db, { ...options, attemptIds: reservation.attemptIds, limit: reservation.attemptIds.length });
  const parent = await db.query(`SELECT delivery_status FROM mobile_push_log WHERE id=$1`, [reservation.id]);
  return { status: parent.rows[0]?.delivery_status || "failed", sent: result.accepted + result.delivered, failed: result.retryDue + result.dead, result };
}

module.exports = {
  assertNoCredentialFacts,assertTransactionalKind,
  claimOne,claimReceiptOne,deliver,deriveParent,errorSummary,finishAttempt,finishReceipt,
  messageSha256,pollReceiptBatch,recoverUncertainOne,reserve,retryDelaySeconds,runRetryBatch,stableStringify,
  currentPolicyDecision,historyCopyFor,localizedHistoryCopies,trySchedulerRunLease,withInstallationLock,withSchedulerRunLease,
};
