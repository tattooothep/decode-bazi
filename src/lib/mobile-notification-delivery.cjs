/** Durable reservation + provider delivery + history finalization. */
const push = require("./push-send.cjs");

function errorSummary(result) {
  const reasons = (result?.outcomes || [])
    .filter((outcome) => outcome && outcome.kind !== "sent" && outcome.kind !== "dry")
    .map((outcome) => String(outcome.reason || outcome.kind || "failed"))
    .filter(Boolean);
  return [...new Set(reasons)].join(" | ").slice(0, 800) || "provider_not_accepted";
}

async function reserve(db, notice, dry) {
  if (dry) {
    const existing = await db.query(
      `SELECT delivery_status FROM mobile_push_log WHERE user_id=$1 AND yam_key=$2`,
      [notice.userId, notice.key],
    );
    return existing.rows[0]?.delivery_status === "accepted" || existing.rows[0]?.delivery_status === "pending"
      ? null
      : { id: null, attempt_count: 1 };
  }
  const result = await db.query(
    `INSERT INTO mobile_push_log
       (user_id,yam_key,kind,title,body,payload,delivery_status,attempt_count,
        next_retry_at,accepted_at,last_error,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',1,NULL,NULL,NULL,now())
     ON CONFLICT (user_id,yam_key) DO UPDATE SET
       kind=EXCLUDED.kind,
       title=EXCLUDED.title,
       body=EXCLUDED.body,
       payload=EXCLUDED.payload,
       delivery_status='pending',
       attempt_count=mobile_push_log.attempt_count+1,
       next_retry_at=NULL,
       last_error=NULL,
       updated_at=now()
     WHERE mobile_push_log.delivery_status='failed'
       AND COALESCE(mobile_push_log.next_retry_at, to_timestamp(0)) <= now()
     RETURNING id,attempt_count`,
    [notice.userId, notice.key, notice.kind, notice.title, notice.body, JSON.stringify(notice.payload || {})],
  );
  return result.rows[0] || null;
}

async function finalize(db, reservation, result) {
  if (!reservation?.id) return;
  if (result.sent > 0) {
    await db.query(
      `UPDATE mobile_push_log
          SET delivery_status='accepted',sent_at=now(),accepted_at=now(),
              next_retry_at=NULL,last_error=NULL,updated_at=now()
        WHERE id=$1 AND delivery_status='pending'`,
      [reservation.id],
    );
    return;
  }
  const attempt = Math.max(1, Number(reservation.attempt_count || 1));
  const delayMinutes = Math.min(360, 5 * (2 ** Math.min(6, attempt - 1)));
  await db.query(
    `UPDATE mobile_push_log
        SET delivery_status='failed',next_retry_at=now()+($2::text||' minutes')::interval,
            last_error=$3,updated_at=now()
      WHERE id=$1 AND delivery_status='pending'`,
    [reservation.id, String(delayMinutes), errorSummary(result)],
  );
}

/**
 * One logical user notification may target multiple installations. It becomes
 * visible and counts toward the cap only if at least one provider accepts it.
 */
async function deliver(db, notice, options = {}) {
  const dry = options.dry === true;
  const reservation = await reserve(db, notice, dry);
  if (!reservation) return { status: "duplicate", sent: 0, failed: 0, result: null };
  const messages = Array.isArray(notice.messages) ? notice.messages : [];
  if (dry) return { status: "dry", sent: messages.length, failed: 0, result: null };
  const result = await push.sendAll(messages, { db });
  await finalize(db, reservation, result);
  return {
    status: result.sent > 0 ? "accepted" : "failed",
    sent: result.sent,
    failed: result.failed + result.gone + result.noToken,
    result,
  };
}

module.exports = { deliver, errorSummary, finalize, reserve };
