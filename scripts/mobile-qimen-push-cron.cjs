#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const payloadRuntime = require("../src/lib/qimen-three-layer-notification.cjs");
const sourceManifestRuntime = require("../src/lib/qimen-canonical-source-manifest.cjs");
const canonicalOccurrenceRuntime = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const qimenAdvisory = require("../src/lib/qimen-notification-advisory.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const { writeSchedulerHeartbeat } = require("../src/lib/notification-scheduler-heartbeat.cjs");

const DRY = process.argv.includes("--dry");
const BATCH = Math.max(1, Math.min(1_000, Number((process.argv.find((arg) => arg.startsWith("--batch=")) || "--batch=250").slice(8))));
const WORKERS = Math.max(1, Math.min(20, Number((process.argv.find((arg) => arg.startsWith("--workers=")) || "--workers=1").slice(10))));
const SOURCE_DIGEST = "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460";
const LOCATION_LEASE_MS = 7 * 24 * 60 * 60 * 1_000;
const PROVIDER_TTL_MS = 5 * 60 * 1_000;
const SEND_GRACE_MS = 5 * 60 * 1_000;

(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"|"$/gu, "");
  }
})();

function localMinute(timezone, at) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
    const value = (type) => Number(parts.find((part) => part.type === type)?.value);
    return (value("hour") % 24) * 60 + value("minute");
  } catch {
    return null;
  }
}

function localDateTime(timezone, at) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(at);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    const time = `${value("hour")}:${value("minute")}`;
    return /^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/u.test(`${date}|${time}`) ? { date, time } : null;
  } catch {
    return null;
  }
}

function inQuietHours(minute, startHour, endHour) {
  if (!Number.isInteger(minute)) return true;
  const start = Number(startHour) * 60;
  const end = Number(endHour) * 60;
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function occurrenceKey(row, snapshot) {
  const canonical = payloadRuntime.canonicalStringify({
    accountId: String(row.user_id),
    installationId: String(row.installation_id),
    purpose: String(row.purpose),
    hourValidFrom: snapshot.layers.hour.validFrom,
    versionTuple: snapshot.versionTuple,
    selectedDirection: snapshot.selectedDirection,
  });
  return `qimen|${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function admissionDecision(row, snapshot, at) {
  const now = at instanceof Date ? at : new Date(at);
  const start = new Date(snapshot?.layers?.hour?.validFrom);
  const end = new Date(snapshot?.layers?.hour?.validUntil);
  if (!Number.isFinite(now.valueOf()) || !Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || start >= end) {
    return { allow: false, reason: "snapshot_window_invalid" };
  }
  if (inQuietHours(localMinute(row.location_timezone, now), Number(row.quiet_start), Number(row.quiet_end))) {
    return { allow: false, reason: "quiet_hours" };
  }
  if (now < start) return { allow: false, reason: "occurrence_not_started" };
  const sendDeadline = new Date(start.valueOf() + SEND_GRACE_MS);
  if (now >= sendDeadline) return { allow: false, reason: "late_occurrence" };
  if (end.valueOf() <= now.valueOf() + PROVIDER_TTL_MS) return { allow: false, reason: "provider_safety_window" };
  return { allow: true, sendDeadline: sendDeadline.toISOString() };
}

const DIRECTION = Object.freeze({
  N: { th: "เหนือ", en: "north", zh: "北" }, NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北" },
  E: { th: "ตะวันออก", en: "east", zh: "東" }, SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南" },
  S: { th: "ใต้", en: "south", zh: "南" }, SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南" },
  W: { th: "ตะวันตก", en: "west", zh: "西" }, NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北" },
});

function buildQimenCopy(locale, snapshot) {
  const language = locale === "th" || locale === "zh" ? locale : "en";
  const direction = DIRECTION[snapshot.selectedDirection]?.[language] || snapshot.selectedDirection;
  const evidence = snapshot.selectedEvidence;
  if (language === "th") return Object.freeze({
    title: `ฉีเหมิน · ทิศ${direction}`,
    body: `เดือน ${evidence.month.deityZh} · ${evidence.month.doorZh} · ${evidence.month.starZh}\nวัน ${evidence.day.deityZh} · ${evidence.day.doorZh} · ${evidence.day.starZh}\nยาม ${evidence.hour.deityZh} · ${evidence.hour.doorZh} · ${evidence.hour.starZh} — ผังยามเป็นคำแนะนำหลัก`,
  });
  if (language === "zh") return Object.freeze({
    title: `奇門 · ${direction}方`,
    body: `月 ${evidence.month.deityZh} · ${evidence.month.doorZh} · ${evidence.month.starZh}\n日 ${evidence.day.deityZh} · ${evidence.day.doorZh} · ${evidence.day.starZh}\n時 ${evidence.hour.deityZh} · ${evidence.hour.doorZh} · ${evidence.hour.starZh} — 時家主行動`,
  });
  return Object.freeze({
    title: `Qimen · ${direction}`,
    body: `Month ${evidence.month.deityZh} · ${evidence.month.doorZh} · ${evidence.month.starZh}\nDay ${evidence.day.deityZh} · ${evidence.day.doorZh} · ${evidence.day.starZh}\nHour ${evidence.hour.deityZh} · ${evidence.hour.doorZh} · ${evidence.hour.starZh} — the hour chart governs action`,
  });
}

function buildQimenNotice(row, snapshot, occurrenceId, sendDeadline) {
  if (!payloadRuntime.verifyQimenThreeLayerSnapshot(snapshot)) throw new TypeError("qimen_snapshot_invalid");
  const payload = payloadRuntime.buildQimenV2ProviderData(snapshot);
  const historyCopies = delivery.localizedHistoryCopies((locale) => buildQimenCopy(locale, snapshot));
  const locale = notificationPayload.normalizedLocale(row.token_locale);
  const providerCopy = buildQimenCopy(locale, snapshot);
  return Object.freeze({
    userId: row.user_id,
    key: occurrenceKey(row, snapshot),
    kind: "qimen",
    qimenOccurrenceId: occurrenceId,
    ...historyCopies.th,
    historyCopies,
    payload,
    sourceFacts: Object.freeze({
      eventEndAt: snapshot.layers.hour.validUntil,
      sendDeadline,
      snapshotDigest: snapshot.snapshotDigest,
      selectedDirection: snapshot.selectedDirection,
      calculationVersion: snapshot.versionTuple.hour,
    }),
    messages: Object.freeze([Object.freeze({
      tokenId: row.token_id,
      deviceToken: row.device_push_token,
      deviceTokenType: row.device_token_type,
      expoToken: row.expo_push_token,
      platform: row.platform,
      locale,
      category: "qimen",
      ...providerCopy,
      url: "/qimen/notification-detail",
      data: payload,
    })]),
  });
}

async function claimDue(db, at, limit = BATCH) {
  const bounded = Math.max(1, Math.min(10_000, Number(limit) || BATCH));
  const result = await db.query(
    "SELECT * FROM claim_mobile_qimen_installations($1::timestamptz,$2::integer)",
    [at.toISOString(), bounded],
  );
  return result.rows;
}

async function loadClaimContext(db, claim) {
  const result = await db.query(
    `SELECT q.*,t.id AS token_id,t.device_push_token,t.device_token_type,t.expo_push_token,t.platform,
            t.locale AS token_locale,t.qimen_payload_schema,COALESCE(np.privacy_preview,false) AS privacy_preview,
            np.paused_until,u.tier,u.sub_expires_at,u.trial_ends_at
       FROM mobile_qimen_installations q
       JOIN mobile_push_tokens t ON t.user_id=q.user_id AND t.installation_id=q.installation_id AND t.enabled=true
       JOIN users u ON u.id=q.user_id AND u.deleted_at IS NULL
       LEFT JOIN mobile_notification_prefs np ON np.user_id=q.user_id
      WHERE q.user_id=$1 AND q.installation_id=$2 AND q.lease_token=$3`,
    [claim.user_id, claim.installation_id, claim.lease_token],
  );
  return result.rows[0] || null;
}

function nextDueAt(row, at) {
  const window = qimenAdvisory.trueSolarShichenWindow({
    timezone: row.location_timezone,
    longitude: Number(row.longitude),
    instant: at.toISOString(),
  });
  const next = new Date(window.endAt);
  if (!Number.isFinite(next.valueOf()) || next <= at) throw new Error("qimen_next_due_unavailable");
  return next;
}

async function finishClaim(db, row, at, next, reason) {
  await db.query(
    `UPDATE mobile_qimen_installations SET next_due_at=$4,last_skip_reason=$5,
       lease_token=NULL,lease_expires_at=NULL,updated_at=$6
      WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`,
    [row.user_id, row.installation_id, row.lease_token, next.toISOString(), reason, at.toISOString()],
  );
}

async function admitOccurrence(db, row, snapshot, sendDeadline) {
  const key = occurrenceKey(row, snapshot);
  const client = typeof db.connect === "function" ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mobile-qimen-occurrence:'||$1::text,0))", [row.installation_id]);
    const existing = await client.query(
      `SELECT id,state,push_log_id FROM mobile_qimen_occurrences
        WHERE user_id=$1 AND installation_id=$2 AND occurrence_key=$3 FOR UPDATE`,
      [row.user_id, row.installation_id, key],
    );
    if (existing.rows[0]) {
      const reusable = existing.rows[0].state === "claimed" && existing.rows[0].push_log_id === null
        ? existing.rows[0].id : null;
      await client.query("COMMIT");
      return reusable;
    }
    const inserted = await client.query(
      `INSERT INTO mobile_qimen_occurrences
       (user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,
        selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,'claimed')
       ON CONFLICT(user_id,installation_id,occurrence_key) DO NOTHING RETURNING id`,
      [row.user_id, row.installation_id, key, row.purpose,
        snapshot.layers.hour.validFrom, snapshot.layers.hour.validUntil, sendDeadline,
        snapshot.selectedDirection, JSON.stringify(snapshot.versionTuple), JSON.stringify(snapshot.sourceTuple),
        JSON.stringify(snapshot), snapshot.snapshotDigest],
    );
    await client.query("COMMIT");
    return inserted.rows[0]?.id || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    if (client !== db && typeof client.release === "function") client.release();
  }
}

async function defaultBuildCanonicalOccurrence(row, at) {
  return canonicalOccurrenceRuntime.buildCanonicalQimenOccurrence(row, at);
}

async function processClaim(db, claim, at, dependencies = {}) {
  const row = await loadClaimContext(db, claim);
  if (!row) {
    await db.query(
      "DELETE FROM mobile_qimen_installations WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3",
      [claim.user_id, claim.installation_id, claim.lease_token],
    );
    return { reserved: 0, skipped: 1, reason: "owner_invalid" };
  }
  let next;
  try {
    next = nextDueAt(row, at);
  } catch {
    next = new Date(at.valueOf() + 2 * 60 * 60 * 1_000);
  }
  let reason = null;
  const capturedAt = row.location_captured_at ? new Date(row.location_captured_at) : null;
  const expiresAt = row.location_expires_at ? new Date(row.location_expires_at) : null;
  const locationFresh = capturedAt && expiresAt && capturedAt <= at && expiresAt > at
    && at.valueOf() - capturedAt.valueOf() <= LOCATION_LEASE_MS
    && Number.isFinite(Number(row.longitude)) && row.location_timezone;
  if (!locationFresh) reason = "location_stale";
  else if (Number(row.qimen_payload_schema) !== 2) reason = "payload_capability_missing";
  else if (row.paused_until && new Date(row.paused_until) > at) reason = "paused";
  else if (inQuietHours(localMinute(row.location_timezone, at), Number(row.quiet_start), Number(row.quiet_end))) reason = "quiet_hours";
  if (reason) {
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }

  const canonicalWindow = qimenAdvisory.trueSolarShichenWindow({
    timezone: row.location_timezone,
    longitude: Number(row.longitude),
    instant: at.toISOString(),
  });
  const entitlementClock = localDateTime(row.location_timezone, at);
  const entitlement = qimenAdvisory.qimenNotificationEntitlement(
    { id: row.user_id, tier: row.tier, sub_expires_at: row.sub_expires_at, trial_ends_at: row.trial_ends_at },
    {
      timezone: row.location_timezone,
      now: at,
      instant: at,
      date: entitlementClock?.date,
      time: entitlementClock?.time,
    },
  );
  if (!entitlement.allow) {
    reason = entitlement.reason || "qimen_not_entitled";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }

  let snapshot;
  try {
    const build = dependencies.buildCanonicalOccurrence || defaultBuildCanonicalOccurrence;
    snapshot = await build(row, at);
  } catch (error) {
    reason = String(error?.code || "engine_unavailable").slice(0, 96);
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  if (snapshot === null) {
    reason = "no_recommendable_direction";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  if (!payloadRuntime.verifyQimenThreeLayerSnapshot(snapshot)) {
    reason = "snapshot_invalid";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  if (snapshot.accountId !== row.user_id || snapshot.purpose !== row.purpose
    || snapshot.layers.hour.validFrom !== canonicalWindow.startAt
    || snapshot.layers.hour.validUntil !== canonicalWindow.endAt) {
    reason = "snapshot_owner_window_mismatch";
    await finishClaim(db, row, at, next, reason);
    return { reserved: 0, skipped: 1, reason };
  }
  const admission = admissionDecision(row, snapshot, at);
  if (!admission.allow) {
    await finishClaim(db, row, at, next, admission.reason);
    return { reserved: 0, skipped: 1, reason: admission.reason };
  }
  const occurrenceId = await admitOccurrence(db, row, snapshot, admission.sendDeadline);
  if (!occurrenceId) {
    await finishClaim(db, row, at, next, "duplicate");
    return { reserved: 0, skipped: 1, reason: "duplicate" };
  }
  const notice = buildQimenNotice(row, snapshot, occurrenceId, admission.sendDeadline);
  const deliver = dependencies.deliver || delivery.deliver;
  const result = await deliver(db, notice, { defer: true });
  const reserved = result.status === "pending" ? 1 : 0;
  reason = reserved ? null : result.status === "duplicate" ? "duplicate" : "delivery_reservation_failed";
  if (!reserved) {
    await db.query(
      `UPDATE mobile_qimen_occurrences SET state='skipped',skip_reason=$2,updated_at=$3
        WHERE id=$1 AND state='claimed' AND push_log_id IS NULL`,
      [occurrenceId, reason, at.toISOString()],
    );
  }
  await finishClaim(db, row, at, next, reason);
  return { reserved, skipped: reserved ? 0 : 1, reason };
}

async function forEachBounded(items, concurrency, handler) {
  const bounded = Math.max(1, Math.min(20, Number(concurrency) || 1));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(bounded, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await handler(items[index]);
    }
  }));
}

async function runScheduler(db, signal, at = new Date(), dependencies = {}) {
  signal.throwIfAborted();
  const runtimeProducerEnabled = dependencies.runtimeProducerEnabled
    ?? sourceManifestRuntime.loadCanonicalSourceManifest().producerEnabled;
  const runtimeCommit = dependencies.backendCommit ?? process.env.HOURKEY_RELEASE_COMMIT ?? "";
  const state = await db.query(
    "SELECT producer_enabled,source_digest,backend_commit FROM mobile_qimen_producer_state WHERE singleton=true",
  );
  const producer = state.rows[0];
  if (runtimeProducerEnabled !== true || producer?.producer_enabled !== true || producer?.source_digest !== SOURCE_DIGEST
    || !/^[0-9a-f]{40}$/u.test(runtimeCommit) || producer.backend_commit !== runtimeCommit) {
    return { disabled: true, due: 0, reserved: 0, skipped: 0 };
  }
  const claims = DRY
    ? (await db.query(
      "SELECT * FROM mobile_qimen_installations WHERE enabled=true AND next_due_at<=$1 ORDER BY next_due_at LIMIT $2",
      [at.toISOString(), BATCH * WORKERS],
    )).rows
    : await claimDue(db, at, BATCH * WORKERS);
  const report = { disabled: false, due: claims.length, reserved: 0, skipped: 0 };
  if (DRY) return report;
  await forEachBounded(claims, WORKERS, async (claim) => {
    signal.throwIfAborted();
    const result = await processClaim(db, claim, at, dependencies);
    report.reserved += result.reserved;
    report.skipped += result.skipped;
  });
  return report;
}

async function main() {
  const db = new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,
    max: Math.min(24, WORKERS + 4),
  });
  try {
    const leased = await delivery.withSchedulerRunLease(db, "qimen", (signal) => runScheduler(db, signal), { timeoutMs: 50_000 });
    if (!leased.acquired) return;
    const report = leased.result;
    console.log(`[mobile-qimen-push] disabled=${report.disabled} due=${report.due} reserved=${report.reserved} skipped=${report.skipped} dry=${DRY}`);
    if (!DRY && report.disabled !== true) await writeSchedulerHeartbeat("qimen");
  } finally {
    await db.end();
  }
}

module.exports = Object.freeze({
  admissionDecision,
  admitOccurrence,
  buildQimenCopy,
  buildQimenNotice,
  claimDue,
  inQuietHours,
  localDateTime,
  loadClaimContext,
  nextDueAt,
  occurrenceKey,
  processClaim,
  runScheduler,
});

if (require.main === module) {
  main().catch(() => {
    console.error("[mobile-qimen-push] error_code=scheduler_failed");
    process.exit(1);
  });
}
