"use strict";

const snapshotRuntime = require("./ziwei-hourly-notification.cjs");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class ZiweiNotificationDetailError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "ZiweiNotificationDetailError";
    this.code = code;
    this.status = status;
  }
}

async function readZiweiNotificationDetail(db, userId, notificationId) {
  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    throw new ZiweiNotificationDetailError("ziwei_account_id_invalid", 400);
  }
  if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
    throw new ZiweiNotificationDetailError("ziwei_notification_id_invalid", 400);
  }
  const result = await db.query(
    `SELECT l.id::text AS notification_id,o.profile_id::text AS profile_id,o.snapshot,o.snapshot_digest
       FROM mobile_push_log l
       JOIN mobile_ziwei_hourly_occurrences o ON o.push_log_id=l.id
      WHERE l.id=$1 AND l.user_id=$2 AND o.user_id=$2
        AND l.kind='ziwei' AND l.delivery_status IN ('accepted','delivered')
        AND o.state='reserved'
      LIMIT 1`,
    [notificationId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new ZiweiNotificationDetailError("ziwei_notification_not_found", 404);
  const snapshot = row.snapshot;
  // Both historical schema 1 and six-layer schema 2 are verified as stored.
  // Never read the current profile or regenerate an old notification's chart.
  if (row.notification_id !== notificationId
    || !snapshotRuntime.verifyZiweiHourlyNotificationSnapshot(snapshot)
    || snapshot.accountId !== userId
    || snapshot.profile.id !== row.profile_id
    || snapshot.snapshotDigest !== row.snapshot_digest) {
    throw new ZiweiNotificationDetailError("ziwei_notification_snapshot_invalid", 409);
  }
  return Object.freeze({ notificationId: row.notification_id, snapshot });
}

module.exports = Object.freeze({ ZiweiNotificationDetailError, readZiweiNotificationDetail });
