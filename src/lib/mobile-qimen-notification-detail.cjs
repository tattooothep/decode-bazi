"use strict";

const snapshotRuntime = require("./qimen-three-layer-notification.cjs");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class QimenNotificationDetailError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "QimenNotificationDetailError";
    this.code = code;
    this.status = status;
  }
}

async function readQimenNotificationDetail(db, userId, notificationId) {
  if (!UUID_RE.test(String(userId || ""))) {
    throw new QimenNotificationDetailError("qimen_account_id_invalid", 400);
  }
  if (!UUID_RE.test(String(notificationId || ""))) {
    throw new QimenNotificationDetailError("qimen_notification_id_invalid", 400);
  }
  const result = await db.query(
    `SELECT l.id::text AS notification_id,o.snapshot,o.snapshot_digest
       FROM mobile_push_log l
       JOIN mobile_qimen_occurrences o ON o.push_log_id=l.id
      WHERE l.id=$1 AND l.user_id=$2 AND o.user_id=$2
        AND l.kind='qimen' AND l.delivery_status IN ('accepted','delivered')
        AND o.state='reserved'
      LIMIT 1`,
    [notificationId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new QimenNotificationDetailError("qimen_notification_not_found", 404);
  const snapshot = row.snapshot;
  if (!snapshotRuntime.verifyQimenThreeLayerSnapshot(snapshot)
      || snapshot.accountId !== userId
      || snapshot.snapshotDigest !== row.snapshot_digest) {
    throw new QimenNotificationDetailError("qimen_notification_snapshot_invalid", 409);
  }
  return Object.freeze({ notificationId: row.notification_id, snapshot });
}

module.exports = Object.freeze({ QimenNotificationDetailError, readQimenNotificationDetail });
