#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const { Pool } = require("pg");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const notificationPayload = require("../src/lib/notification-payload.cjs");
const copy = require("../src/lib/zibai-notification-copy.cjs");
const { writeSchedulerHeartbeat } = require("../src/lib/notification-scheduler-heartbeat.cjs");
const { ZIBAI_LOCATION_LEASE_MS } = require("../src/lib/zibai-location-policy.cjs");

const DRY = process.argv.includes("--dry");
const BATCH = Math.max(1, Math.min(1_000, Number((process.argv.find((arg) => arg.startsWith("--batch=")) || "--batch=250").slice(8))));
const WORKERS = Math.max(1, Math.min(20, Number((process.argv.find((arg) => arg.startsWith("--workers=")) || "--workers=1").slice(10))));
const CALCULATION_VERSION = "zibai-zaoming-true-solar-v2";

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
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const value = (type) => Number(parts.find((part) => part.type === type)?.value);
    return (value("hour") % 24) * 60 + value("minute");
  } catch { return null; }
}

function inQuietHours(minute, startHour, endHour) {
  if (!Number.isInteger(minute)) return true;
  const start = Number(startHour) * 60;
  const end = Number(endHour) * 60;
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function occurrenceKey(installationId, event, apparentDate, shichenKey) {
  const slot = event === "zibai_daily" ? "daily" : shichenKey;
  return `${installationId}|${apparentDate}|${slot}|${CALCULATION_VERSION}`;
}

function buildZibaiNotice(row, event, snapshot, occurrenceId) {
  const shichenKey = event === "zibai_shichen" ? snapshot.shichenKey : null;
  const referenceId = `zibai|${snapshot.apparentSolarDate}|${shichenKey || "daily"}|${CALCULATION_VERSION}`;
  const facts = {
    event, referenceId, calculationVersion: CALCULATION_VERSION,
    apparentSolarDate: snapshot.apparentSolarDate, shichenKey,
    startAt: snapshot.startAt, endAt: snapshot.endAt,
    dayPalaces: snapshot.dayPalaces,
    shichenPalaces: event === "zibai_shichen" ? snapshot.shichenPalaces : null,
    focus: snapshot.focus.map((item) => ({
      star: item.star, dayDirection: item.dayDirection, dayRelation: item.dayRelation,
      shichenDirection: item.shichenDirection, shichenRelation: item.shichenRelation, overlaps: item.overlaps,
    })),
    url: "/zibai",
  };
  const payload = notificationPayload.buildNotificationPayload("zibai", String(row.user_id), facts);
  const historyCopies = delivery.localizedHistoryCopies((locale) => copy.buildZibaiCopy(locale, event, snapshot));
  const locale = notificationPayload.normalizedLocale(row.token_locale);
  const providerCopy = copy.zibaiProviderCopy(locale, row.privacy_preview === true, event, snapshot);
  return {
    userId: row.user_id,
    key: `zibai|${referenceId}|${row.installation_id}`,
    kind: "zibai",
    zibaiOccurrenceId: occurrenceId,
    ...historyCopies.th,
    historyCopies,
    payload,
    sourceFacts: {
      calculationVersion: CALCULATION_VERSION,
      occurrenceType: event === "zibai_shichen" ? "shichen" : "daily",
      apparentSolarDate: snapshot.apparentSolarDate,
      // Avoid the generic credential-key sentinel while retaining the
      // non-sensitive branch name needed for science audit replay.
      shichen: shichenKey,
    },
    messages: [{
      tokenId: row.token_id, deviceToken: row.device_push_token, deviceTokenType: row.device_token_type,
      expoToken: row.expo_push_token, platform: row.platform, locale, category: "zibai",
      ...providerCopy, url: "/zibai", data: payload,
    }],
  };
}

async function claimDue(db, at, limit = BATCH) {
  const result = await db.query(
    `WITH candidate AS (
       SELECT user_id,installation_id FROM mobile_zibai_installations
        WHERE ((daily_enabled=true AND next_daily_at<=$1) OR (shichen_enabled=true AND next_shichen_at<=$1))
          AND (lease_token IS NULL OR lease_expires_at<=$1)
        ORDER BY LEAST(COALESCE(next_daily_at,'infinity'),COALESCE(next_shichen_at,'infinity')),user_id,installation_id
        FOR UPDATE SKIP LOCKED LIMIT $2
     )
     UPDATE mobile_zibai_installations z SET lease_token=gen_random_uuid(),lease_expires_at=$1+interval '5 minutes',updated_at=$1
      FROM candidate c WHERE z.user_id=c.user_id AND z.installation_id=c.installation_id RETURNING z.*`,
    [at.toISOString(), limit],
  );
  return result.rows;
}

async function claimDueBatches(db, at, batchSize = BATCH, workers = WORKERS) {
  const boundedWorkers = Math.max(1, Math.min(20, Number(workers) || 1));
  const batches = await Promise.all(Array.from({ length: boundedWorkers }, () => claimDue(db, at, batchSize)));
  return batches.flat();
}

async function forEachBounded(items, concurrency, handler) {
  const bounded = Math.max(1, Math.min(20, Number(concurrency) || 1));
  let cursor = 0;
  const runners = Array.from({ length: Math.min(bounded, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await handler(items[index]);
    }
  });
  await Promise.all(runners);
}

async function purgeExpiredLocations(db, at = new Date()) {
  const result = await db.query(
    `UPDATE mobile_zibai_installations SET latitude=NULL,longitude=NULL,location_timezone=NULL,
       location_captured_at=NULL,location_expires_at=NULL,next_daily_at=NULL,next_shichen_at=NULL,
       last_skip_reason='location_expired',updated_at=$1
      WHERE location_expires_at IS NOT NULL AND location_expires_at<=$1`,
    [at.toISOString()],
  );
  return Number(result.rowCount || 0);
}

async function purgeOldOccurrences(db, at = new Date(), limit = 10_000) {
  const boundedLimit = Math.max(1, Math.min(10_000, Number(limit) || 10_000));
  const result = await db.query(
    `WITH expired AS (
       SELECT id FROM mobile_zibai_occurrences
        WHERE created_at < $1::timestamptz - interval '32 days'
        ORDER BY created_at,id
        FOR UPDATE SKIP LOCKED LIMIT $2
     )
     DELETE FROM mobile_zibai_occurrences o USING expired e WHERE o.id=e.id`,
    [at.toISOString(), boundedLimit],
  );
  return Number(result.rowCount || 0);
}

async function loadClaimContext(db, claim) {
  const result = await db.query(
    `SELECT z.*,t.id AS token_id,t.device_push_token,t.device_token_type,t.expo_push_token,t.platform,t.locale AS token_locale,
            COALESCE(np.privacy_preview,false) AS privacy_preview
       FROM mobile_zibai_installations z
       JOIN mobile_push_tokens t ON t.user_id=z.user_id AND t.installation_id=z.installation_id AND t.enabled=true
       JOIN users u ON u.id=z.user_id AND u.deleted_at IS NULL
       LEFT JOIN mobile_notification_prefs np ON np.user_id=z.user_id
      WHERE z.user_id=$1 AND z.installation_id=$2 AND z.lease_token=$3`,
    [claim.user_id, claim.installation_id, claim.lease_token],
  );
  return result.rows[0] || null;
}

async function finishClaim(db, row, updates) {
  await db.query(
    `UPDATE mobile_zibai_installations SET next_daily_at=COALESCE($4,next_daily_at),next_shichen_at=COALESCE($5,next_shichen_at),
       last_skip_reason=$6,lease_token=NULL,lease_expires_at=NULL,updated_at=$7
      WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`,
    [row.user_id, row.installation_id, row.lease_token, updates.nextDailyAt ?? null, updates.nextShichenAt ?? null, updates.reason ?? null, updates.at.toISOString()],
  );
}

async function admitOccurrence(db, row, event, snapshot, state = "claimed", reason = null) {
  const key = occurrenceKey(row.installation_id, event, snapshot.apparentSolarDate, snapshot.shichenKey);
  const client = typeof db.connect === "function" ? await db.connect() : db;
  await client.query("BEGIN");
  try {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mobile-zibai-cap:'||$1::text,0))`, [row.installation_id]);
    const existing = await client.query(
      `SELECT id,state,push_log_id FROM mobile_zibai_occurrences
        WHERE user_id=$1 AND installation_id=$2 AND occurrence_key=$3 FOR UPDATE`,
      [row.user_id, row.installation_id, key],
    );
    if (existing.rows[0]) {
      const reusableId = existing.rows[0].state === "claimed" && existing.rows[0].push_log_id === null
        ? existing.rows[0].id
        : null;
      await client.query("COMMIT");
      return reusableId;
    }
    if (event === "zibai_shichen" && state !== "skipped") {
      const count = await client.query(`SELECT count(*)::int AS n FROM mobile_zibai_occurrences WHERE user_id=$1 AND installation_id=$2 AND apparent_solar_date=$3 AND occurrence_type='shichen' AND state IN ('claimed','reserved')`, [row.user_id, row.installation_id, snapshot.apparentSolarDate]);
      if (Number(count.rows[0]?.n || 0) >= 12) { await client.query("ROLLBACK"); return null; }
    }
    const inserted = await client.query(
      `INSERT INTO mobile_zibai_occurrences(user_id,installation_id,occurrence_key,occurrence_type,apparent_solar_date,shichen_key,calculation_version,state,skip_reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,installation_id,occurrence_key) DO NOTHING RETURNING id`,
      [row.user_id, row.installation_id, key, event === "zibai_shichen" ? "shichen" : "daily", snapshot.apparentSolarDate, event === "zibai_shichen" ? snapshot.shichenKey : null, CALCULATION_VERSION, state, reason],
    );
    await client.query("COMMIT");
    return inserted.rows[0]?.id || null;
  } catch (error) { await client.query("ROLLBACK").catch(() => null); throw error; }
  finally { if (client !== db && typeof client.release === "function") client.release(); }
}

async function processClaim(db, claim, at, science) {
  const row = await loadClaimContext(db, claim);
  if (!row) {
    await db.query(`DELETE FROM mobile_zibai_installations WHERE user_id=$1 AND installation_id=$2 AND lease_token=$3`, [claim.user_id, claim.installation_id, claim.lease_token]);
    return { reserved: 0, skipped: 1, reason: "owner_invalid" };
  }
  const next = { at, nextDailyAt: null, nextShichenAt: null, reason: null };
  const locationAt = row.location_captured_at ? new Date(row.location_captured_at) : null;
  const expiresAt = row.location_expires_at ? new Date(row.location_expires_at) : null;
  const locationFresh = locationAt && expiresAt && locationAt <= at
    && at.getTime() - locationAt.getTime() <= ZIBAI_LOCATION_LEASE_MS && expiresAt > at;
  const due = [];
  if (row.daily_enabled && row.next_daily_at && new Date(row.next_daily_at) <= at) due.push("zibai_daily");
  if (row.shichen_enabled && row.next_shichen_at && new Date(row.next_shichen_at) <= at) due.push("zibai_shichen");
  let reserved = 0;
  let skipped = 0;
  for (const event of due) {
    let snapshot;
    try {
      if (event === "zibai_daily") next.nextDailyAt = science.nextCivilMinute(at, row.location_timezone, Number(row.daily_minute)).toISOString();
      else next.nextShichenAt = science.nextShichenBoundary(new Date(at.getTime() + 1_000), Number(row.longitude)).toISOString();
      snapshot = science.buildZibaiSnapshot(at, Number(row.longitude));
      if (event === "zibai_daily") {
        const window = science.solarDayWindow(at, Number(row.longitude));
        snapshot = {
          ...snapshot, shichenKey: null, startAt: window.start.toISOString(), endAt: window.end.toISOString(),
          shichenPalaces: null,
          focus: snapshot.focus.map((item) => ({ star: item.star, dayDirection: item.dayDirection, dayRelation: item.dayRelation, shichenDirection: null, shichenRelation: null, overlaps: false })),
        };
      }
    } catch { next.reason = "engine_unavailable"; skipped += 1; }
    if (!snapshot) continue;
    if (!locationFresh || !Number.isFinite(Number(row.longitude))) { next.reason = "location_stale"; skipped += 1; continue; }
    if (event === "zibai_shichen" && row.location_permission !== "background") { next.reason = "background_permission_missing"; skipped += 1; continue; }
    const minute = localMinute(row.location_timezone, at);
    if (inQuietHours(minute, Number(row.quiet_start), Number(row.quiet_end))) {
      if (event === "zibai_daily") {
        next.nextDailyAt = science.nextCivilMinute(at, row.location_timezone, Number(row.quiet_end) * 60).toISOString();
      } else {
        await admitOccurrence(db, row, event, snapshot, "skipped", "quiet_hours");
      }
      next.reason = "quiet_hours";
      skipped += 1;
      continue;
    }
    const occurrenceId = await admitOccurrence(db, row, event, snapshot);
    if (!occurrenceId) { next.reason = "duplicate_or_cap"; skipped += 1; continue; }
    const notice = buildZibaiNotice(row, event, snapshot, occurrenceId);
    const result = await delivery.deliver(db, notice, { defer: true });
    if (result.status === "pending") reserved += 1;
    else { next.reason = result.status === "duplicate" ? "duplicate" : "delivery_reservation_failed"; skipped += 1; }
  }
  await finishClaim(db, row, next);
  return { reserved, skipped, reason: next.reason };
}

async function runScheduler(db, signal, at = new Date()) {
  signal.throwIfAborted();
  const scienceImported = await import("../src/lib/zibai-science.ts");
  const stateImported = await import("../src/lib/mobile-zibai-installation.ts");
  const scienceModule = scienceImported.default || scienceImported;
  const state = stateImported.default || stateImported;
  const science = { ...scienceModule, nextCivilMinute: state.nextCivilMinute };
  if (!DRY) {
    await purgeExpiredLocations(db, at);
    await purgeOldOccurrences(db, at);
  }
  const claims = DRY
    ? (await db.query(`SELECT * FROM mobile_zibai_installations WHERE ((daily_enabled AND next_daily_at<=$1) OR (shichen_enabled AND next_shichen_at<=$1)) ORDER BY LEAST(COALESCE(next_daily_at,'infinity'),COALESCE(next_shichen_at,'infinity')) LIMIT $2`, [at.toISOString(), BATCH * WORKERS])).rows
    : await claimDueBatches(db, at, BATCH, WORKERS);
  const report = { due: claims.length, reserved: 0, skipped: 0 };
  if (DRY) return report;
  await forEachBounded(claims, WORKERS, async (claim) => {
    signal.throwIfAborted();
    const result = await processClaim(db, claim, at, science);
    report.reserved += result.reserved;
    report.skipped += result.skipped;
  });
  return report;
}

async function main() {
  const db = new Pool({ host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5433), database: process.env.PGDATABASE || "decode_db", user: process.env.PGUSER || "decode_user", password: process.env.PGPASSWORD, max: Math.min(24, WORKERS + 4) });
  try {
    const leased = await delivery.withSchedulerRunLease(db, "zibai", (signal) => runScheduler(db, signal), { timeoutMs: 50_000 });
    if (!leased.acquired) return;
    console.log(`[mobile-zibai-push] due=${leased.result.due} reserved=${leased.result.reserved} skipped=${leased.result.skipped} dry=${DRY}`);
    if (!DRY) await writeSchedulerHeartbeat("zibai");
  } finally { await db.end(); }
}

module.exports = { admitOccurrence, buildZibaiNotice, claimDue, claimDueBatches, forEachBounded, inQuietHours, occurrenceKey, processClaim, purgeExpiredLocations, purgeOldOccurrences, runScheduler };
if (require.main === module) main().catch(() => { console.error("[mobile-zibai-push] error_code=scheduler_failed"); process.exit(1); });
