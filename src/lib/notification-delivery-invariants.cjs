"use strict";

function alias(value) {
  const selected = String(value || "a");
  if (!/^[a-z][a-z0-9_]*$/u.test(selected)) throw new TypeError("invalid notification SQL alias");
  return selected;
}

function attemptImpossibleSql(value = "a") {
  const a = alias(value);
  return `(
    (${a}.provider='expo' AND ${a}.status IN ('provider_accepted','delivered')
      AND (${a}.provider_ticket_id IS NULL OR ${a}.provider_message_id IS NOT NULL))
    OR (${a}.provider='fcm' AND ${a}.status IN ('provider_accepted','delivered')
      AND (${a}.provider_message_id IS NULL OR ${a}.provider_ticket_id IS NOT NULL))
    OR (${a}.status='retry_due' AND ${a}.next_retry_at IS NULL)
    OR (${a}.lease_token IS NOT NULL AND ${a}.lease_expires_at IS NULL)
    OR (${a}.status IN ('reserved','retry_due') AND ${a}.send_started_at IS NOT NULL AND ${a}.lease_token IS NULL)
    OR (${a}.status IN ('dead','delivered')
      AND (${a}.lease_token IS NOT NULL OR ${a}.lease_expires_at IS NOT NULL OR ${a}.next_retry_at IS NOT NULL))
    OR (${a}.status IN ('provider_accepted','delivered') AND ${a}.next_retry_at IS NOT NULL)
    OR (${a}.status='provider_accepted' AND ${a}.accepted_at IS NULL)
    OR (${a}.status='delivered' AND (${a}.delivered_at IS NULL OR ${a}.accepted_at IS NULL))
  )`;
}

function retentionStableAttemptSql(value = "a", ageParameter = "$1") {
  const a = alias(value);
  if (!/^\$\d+$/u.test(ageParameter)) throw new TypeError("invalid notification SQL parameter");
  return `(
    ${a}.updated_at<now()-(${ageParameter}::text||' days')::interval
    AND NOT ${attemptImpossibleSql(a)}
    AND ${a}.lease_token IS NULL AND ${a}.lease_expires_at IS NULL
    AND (
      ${a}.status IN ('dead','delivered')
      OR (${a}.provider='fcm' AND ${a}.status='provider_accepted')
      OR (${a}.provider='expo' AND ${a}.status='provider_accepted'
        AND ${a}.provider_receipt_checked_at IS NOT NULL)
    )
  )`;
}

function derivedParentStatusSql(fields = {}) {
  const delivered = fields.delivered || "delivered";
  const accepted = fields.accepted || "accepted";
  const open = fields.open || "open";
  for (const value of [delivered, accepted, open]) {
    if (!/^[a-z][a-z0-9_.]*$/u.test(value)) throw new TypeError("invalid notification aggregate SQL field");
  }
  return `CASE WHEN ${delivered}>0 THEN 'delivered' WHEN ${accepted}>0 THEN 'accepted' WHEN ${open}>0 THEN 'pending' ELSE 'failed' END`;
}

module.exports = { attemptImpossibleSql,derivedParentStatusSql,retentionStableAttemptSql };
