import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { notificationHistoryPayload } from "../src/lib/mobile-notification-history.ts";
import {
  buildZibaiSnapshot,
  nextShichenBoundary,
  solarDayWindow,
} from "../src/lib/zibai-science.ts";
import { nextCivilMinute } from "../src/lib/mobile-zibai-installation.ts";

const require = createRequire(import.meta.url);
const scheduler = require("./mobile-zibai-push-cron.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const projection = require("../src/lib/zibai-payload-projection.cjs");
const push = require("../src/lib/push-send.cjs");

const mobileRootInput = process.env.HOURKEY_MOBILE_ROOT;
const expectedMobileSha = process.env.HOURKEY_MOBILE_SHA;
assert.ok(mobileRootInput && expectedMobileSha,
  "portable Zi Bai E2E requires explicit HOURKEY_MOBILE_ROOT and HOURKEY_MOBILE_SHA");
const mobileRoot = resolve(mobileRootInput);
assert.equal(
  execFileSync("git", ["-C", mobileRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  expectedMobileSha,
  "portable Zi Bai E2E must execute the exact requested mobile commit",
);
const mobilePayload = await import(pathToFileURL(
  resolve(mobileRoot, "src/navigation/notificationPayload.ts"),
).href);
const resolveNotificationPayload = mobilePayload.resolveNotificationPayload as (
  raw: unknown,
  expectedKind: "zibai",
  accountId: string,
) => Record<string, any> | null;

const database = `zibai_three_layer_e2e_${process.pid}`;
const role = `zibai_three_layer_e2e_role_${process.pid}`;
const password = crypto.randomBytes(24).toString("hex");
const at = new Date("2026-08-16T06:55:00.000Z");
const ids = {
  dailyV1: "00000000-0000-4000-8000-000000000101",
  dailyV2: "00000000-0000-4000-8000-000000000102",
  shichenV1: "00000000-0000-4000-8000-000000000103",
  shichenV2: "00000000-0000-4000-8000-000000000104",
} as const;

function psql(db: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", db, "-Atq"],
    { encoding: "utf8", input: sql },
  ).trim();
}

function providerData(provider: "fcm" | "expo", message: Record<string, any>): Record<string, any> {
  const data = provider === "fcm" ? JSON.parse(message.data.body) : message.data;
  assert.ok(data && typeof data === "object" && !Array.isArray(data));
  return data;
}

function exactDailySnapshot(instant: Date, longitude: number) {
  const snapshot = buildZibaiSnapshot(instant, longitude);
  const window = solarDayWindow(instant, longitude);
  return {
    ...snapshot,
    shichenKey: null,
    startAt: window.start.toISOString(),
    endAt: window.end.toISOString(),
    shichenPalaces: null,
    focus: snapshot.focus.map((item) => ({
      star: item.star,
      dayDirection: item.dayDirection,
      dayRelation: item.dayRelation,
      shichenDirection: null,
      shichenRelation: null,
      overlaps: false,
    })),
  };
}

let boundarySequence = 900;
function boundaryRoundTrip(instant: Date, longitude: number, event: "zibai_daily" | "zibai_shichen") {
  boundarySequence += 1;
  const suffix = String(boundarySequence).padStart(12, "0");
  const accountId = `00000000-0000-4000-8000-${suffix}`;
  const occurrenceId = `10000000-0000-4000-8000-${suffix}`;
  const notificationId = `20000000-0000-4000-8000-${suffix}`;
  const snapshot = event === "zibai_daily"
    ? exactDailySnapshot(instant, longitude)
    : buildZibaiSnapshot(instant, longitude);
  const notice = scheduler.buildZibaiNotice({
    user_id: accountId,
    installation_id: `30000000-0000-4000-8000-${suffix}`,
    token_id: `40000000-0000-4000-8000-${suffix}`,
    device_push_token: null,
    device_token_type: null,
    expo_push_token: `ExponentPushToken[e2e-${suffix}]`,
    platform: "ios",
    token_locale: "en",
    privacy_preview: true,
    zibai_payload_schema: 2,
    calculation_version: "zibai-zaoming-true-solar-v3",
    zibai_calculation_version: "zibai-zaoming-true-solar-v3",
  }, event, snapshot, occurrenceId);
  const exactData = { ...notice.messages[0].data, notificationId };
  const prepared = push.prepareMessage({ ...notice.messages[0], data: exactData }, "expo");
  assert.deepEqual(prepared.data, exactData, "boundary provider preparation preserves exact v2 data");
  const providerWireData = JSON.parse(JSON.stringify(prepared.data));
  const resolved = resolveNotificationPayload(providerWireData, "zibai", accountId);
  assert.ok(resolved, "shipped mobile parser accepts the canonical boundary envelope");
  assert.equal(resolved.sectorReadings.length, 9);
  return resolved;
}

let pool: pg.Pool | null = null;
try {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role}; CREATE ROLE ${role} LOGIN PASSWORD '${password}'; CREATE DATABASE ${database};`);
  psql(database, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      is_active boolean NOT NULL DEFAULT true,
      deleted_at timestamptz,
      tier text,
      sub_expires_at timestamptz,
      trial_ends_at timestamptz,
      timezone text DEFAULT 'UTC',
      locale text DEFAULT 'en'
    );
    CREATE TABLE mobile_push_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id),
      installation_id uuid NOT NULL,
      expo_push_token text UNIQUE,
      device_push_token text,
      device_token_type text,
      platform text NOT NULL,
      app_version text,
      locale text,
      timezone text,
      enabled boolean NOT NULL DEFAULT true,
      fail_count integer NOT NULL DEFAULT 0,
      last_registered_at timestamptz,
      last_success_at timestamptz,
      disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT mobile_push_tokens_user_id_installation_id_key UNIQUE(user_id, installation_id)
    );
    CREATE TABLE mobile_notification_prefs (
      user_id uuid PRIMARY KEY REFERENCES users(id), timezone text DEFAULT 'UTC',
      security_enabled boolean NOT NULL DEFAULT true, saved_date_enabled boolean NOT NULL DEFAULT false,
      daily_enabled boolean NOT NULL DEFAULT true, yam_enabled boolean NOT NULL DEFAULT false,
      qimen_enabled boolean NOT NULL DEFAULT false, shrine_enabled boolean NOT NULL DEFAULT false,
      goal_enabled boolean NOT NULL DEFAULT false, service_enabled boolean NOT NULL DEFAULT true,
      quiet_start int NOT NULL DEFAULT 0, quiet_end int NOT NULL DEFAULT 0,
      max_per_day int NOT NULL DEFAULT 100, paused_until timestamptz
    );
    CREATE TABLE mobile_push_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      yam_key text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      sent_at timestamptz,
      read_at timestamptz,
      delivery_status text NOT NULL DEFAULT 'accepted' CHECK (delivery_status IN ('pending','accepted','failed')),
      attempt_count integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      accepted_at timestamptz,
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id,yam_key)
    );
  `);
  psql(database, readFileSync("migrations/20260815_mobile_notification_integrity.sql", "utf8"));
  psql(database, readFileSync("migrations/20260816_mobile_zibai_notifications.sql", "utf8"));
  psql(database, readFileSync("migrations/20260819_mobile_zibai_three_layer.sql", "utf8"));
  psql(database, readFileSync("migrations/20260823_mobile_zibai_v3_compatibility.sql", "utf8"));
  psql(database, readFileSync("migrations/20260823_mobile_zibai_v3_boundary_latch.sql", "utf8"));
  psql(database, `
    INSERT INTO users(id) VALUES
      ('${ids.dailyV1}'),('${ids.dailyV2}'),('${ids.shichenV1}'),('${ids.shichenV2}');
    INSERT INTO mobile_push_tokens
      (id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,timezone,last_registered_at,zibai_payload_schema,zibai_calculation_version)
    VALUES
      ('10000000-0000-4000-8000-000000000101','${ids.dailyV1}','20000000-0000-4000-8000-000000000101','ExponentPushToken[daily-v1]','fcm-daily-v1','fcm','android','en','UTC',now(),1,'zibai-zaoming-true-solar-v3'),
      ('10000000-0000-4000-8000-000000000102','${ids.dailyV2}','20000000-0000-4000-8000-000000000102','ExponentPushToken[daily-v2]',NULL,NULL,'ios','en','UTC',now(),2,'zibai-zaoming-true-solar-v3'),
      ('10000000-0000-4000-8000-000000000103','${ids.shichenV1}','20000000-0000-4000-8000-000000000103','ExponentPushToken[shichen-v1]',NULL,NULL,'ios','en','UTC',now(),1,'zibai-zaoming-true-solar-v3'),
      ('10000000-0000-4000-8000-000000000104','${ids.shichenV2}','20000000-0000-4000-8000-000000000104','ExponentPushToken[shichen-v2]','fcm-shichen-v2','fcm','android','en','UTC',now(),2,'zibai-zaoming-true-solar-v3');
    INSERT INTO mobile_notification_prefs(user_id,privacy_preview,locale) VALUES
      ('${ids.dailyV1}',false,'en'),('${ids.dailyV2}',true,'en'),
      ('${ids.shichenV1}',false,'en'),('${ids.shichenV2}',true,'en');
    INSERT INTO mobile_zibai_installations
      (user_id,installation_id,daily_enabled,shichen_enabled,daily_minute,quiet_start,quiet_end,
       location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at,
       next_daily_at,next_shichen_at,calculation_version)
    VALUES
      ('${ids.dailyV1}','20000000-0000-4000-8000-000000000101',true,false,415,0,0,'foreground',13.75,0,'UTC','2026-08-16T06:54:00.000Z','2026-08-22T06:54:00.000Z','2026-08-16T06:54:59.000Z',NULL,'zibai-zaoming-true-solar-v3'),
      ('${ids.dailyV2}','20000000-0000-4000-8000-000000000102',true,false,415,0,0,'foreground',13.75,0,'UTC','2026-08-16T06:54:00.000Z','2026-08-22T06:54:00.000Z','2026-08-16T06:54:59.000Z',NULL,'zibai-zaoming-true-solar-v3'),
      ('${ids.shichenV1}','20000000-0000-4000-8000-000000000103',false,true,415,0,0,'background',13.75,0,'UTC','2026-08-16T06:54:00.000Z','2026-08-22T06:54:00.000Z',NULL,'2026-08-16T06:54:59.000Z','zibai-zaoming-true-solar-v3'),
      ('${ids.shichenV2}','20000000-0000-4000-8000-000000000104',false,true,415,0,0,'background',13.75,0,'UTC','2026-08-16T06:54:00.000Z','2026-08-22T06:54:00.000Z',NULL,'2026-08-16T06:54:59.000Z','zibai-zaoming-true-solar-v3');
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role};
  `);

  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 6 });
  const scienceImported = await import("../src/lib/zibai-science.ts");
  const stateImported = await import("../src/lib/mobile-zibai-installation.ts");
  const science = { ...scienceImported, nextCivilMinute: stateImported.nextCivilMinute };
  const claims = await scheduler.claimDue(pool, at, 10);
  assert.equal(claims.length, 4, "all four schema/event fixtures are durably claimed");
  for (const claim of claims) {
    assert.deepEqual(await scheduler.processClaim(pool, claim, at, science),
      { reserved: 1, skipped: 0, reason: null });
  }

  const attempts = (await pool.query(`
    SELECT a.id,a.provider,a.provider_message,a.message_sha256,a.privacy_safe,a.status,
           l.id AS notification_id,l.user_id,l.payload,l.source_facts,l.title,l.body,
           o.occurrence_type,t.zibai_payload_schema
      FROM mobile_push_attempts a
      JOIN mobile_push_log l ON l.id=a.push_log_id
      JOIN mobile_push_tokens t ON t.id=a.token_id
      JOIN mobile_zibai_occurrences o ON o.push_log_id=l.id
     ORDER BY l.user_id
  `)).rows;
  assert.equal(attempts.length, 4);
  assert.deepEqual(
    attempts.map((row) => [row.occurrence_type, Number(row.zibai_payload_schema), row.provider]),
    [["daily", 1, "fcm"], ["daily", 2, "expo"], ["shichen", 1, "expo"], ["shichen", 2, "fcm"]],
    "durable pipeline covers daily/shichen × v1/v2 across exact FCM/Expo inner envelopes",
  );
  const historyReplayAt = new Date("2026-09-08T00:00:00.000Z");

  for (const row of attempts) {
    const inner = providerData(row.provider, row.provider_message);
    assert.equal(row.provider === "fcm" ? row.provider_message.android.ttl : row.provider_message.ttl,
      row.provider === "fcm" ? "300s" : 300,
      `${row.occurrence_type} v${row.zibai_payload_schema} has a bounded provider queue lifetime`);
    const parsed = resolveNotificationPayload(inner, "zibai", row.user_id);
    assert.ok(parsed, `mobile parser accepts durable ${row.occurrence_type} v${row.zibai_payload_schema}`);
    assert.equal(parsed.event, `zibai_${row.occurrence_type}`);
    assert.equal(parsed.notificationId, row.notification_id);
    assert.equal(parsed.snapshotSchema === 2, Number(row.zibai_payload_schema) === 2);
    if (Number(row.zibai_payload_schema) === 2) {
      assert.equal(parsed.sectorReadings.length, 9);
      assert.equal(parsed.shichen === null, row.occurrence_type === "daily");
    }
    const serializedProvider = JSON.stringify(inner);
    assert.doesNotMatch(serializedProvider,
      /latitude|longitude|source_facts|sourceFacts|saved.?house|natal|period.?9/iu,
      "provider envelope contains no coordinates, audit facts, house/natal identity, or Period-9 proxy");

    const requestedSchemas = Number(row.zibai_payload_schema) === 2 ? [1, 2] : [2];
    const immutableEndAt = Number(row.zibai_payload_schema) === 2
      ? row.occurrence_type === "daily" ? row.payload.day.endAt : row.payload.shichen.endAt
      : row.payload.endAt;
    assert.ok(historyReplayAt > new Date(immutableEndAt),
      "history replay probe is deterministically later than the immutable occurrence expiry");
    for (const requestedSchema of requestedSchemas) {
      const projected = projection.projectZibaiPayload(row.payload, requestedSchema);
      const historyEnvelope = notificationHistoryPayload(row.notification_id, projected);
      // NextResponse crosses a JSON wire boundary before React Native sees it.
      // Exercise those exact bytes so internal Object.freeze descriptors are
      // not mistaken for properties present on parsed network JSON.
      const historyWireEnvelope = JSON.parse(JSON.stringify(historyEnvelope));
      const historyParsed = resolveNotificationPayload(historyWireEnvelope, "zibai", row.user_id);
      assert.ok(historyParsed,
        `history projection ${row.user_id}/${row.occurrence_type}/stored-v${row.zibai_payload_schema}/requested-v${requestedSchema} remains routable after expiry`);
      assert.equal(historyParsed.notificationId, row.notification_id);
      assert.equal(historyParsed.snapshotSchema === 2,
        Number(row.zibai_payload_schema) === 2 && requestedSchema === 2,
        "history never upconverts stored v1 and down-projects stored v2 only when requested");
      assert.doesNotMatch(JSON.stringify(historyWireEnvelope), /source_facts|sourceFacts|latitude|longitude/iu);
    }

    if (row.privacy_safe === true) {
      const title = row.provider === "fcm" ? row.provider_message.notification.title : row.provider_message.title;
      const body = row.provider === "fcm" ? row.provider_message.notification.body : row.provider_message.body;
      assert.deepEqual({ title, body }, {
        title: "Private notification",
        body: "Open HourKey to view details",
      }, "privacy-off reservation stores only the exact generic provider copy");
    }
  }

  const retryRow = attempts.find((row) => row.user_id === ids.shichenV2);
  assert.ok(retryRow);
  const retryProviderMessages: unknown[] = [];
  const firstRetry = await delivery.runRetryBatch(pool, {
    attemptIds: [retryRow.id], limit: 1, concurrency: 1,
    maxAttempts: 3, baseDelaySeconds: 1,
    hooks: { policyNow: () => at },
    sender: { async sendPrepared(target: Record<string, any>) {
      retryProviderMessages.push(target.providerMessage);
      return { kind: "provider_error", reason: "synthetic_retry", retryable: true };
    } },
  });
  assert.deepEqual({ claimed: firstRetry.claimed, retryDue: firstRetry.retryDue, dead: firstRetry.dead },
    { claimed: 1, retryDue: 1, dead: 0 });
  await pool.query(`UPDATE mobile_push_attempts SET next_retry_at=$2 WHERE id=$1`, [retryRow.id, at.toISOString()]);
  const secondRetry = await delivery.runRetryBatch(pool, {
    attemptIds: [retryRow.id], limit: 1, concurrency: 1,
    hooks: { policyNow: () => at },
    sender: { async sendPrepared(target: Record<string, any>) {
      retryProviderMessages.push(target.providerMessage);
      return { kind: "provider_accepted", providerMessageId: "stub-e2e-retry-accepted" };
    } },
  });
  assert.deepEqual({ claimed: secondRetry.claimed, accepted: secondRetry.accepted, dead: secondRetry.dead },
    { claimed: 1, accepted: 1, dead: 0 });
  assert.equal(retryProviderMessages.length, 2);
  assert.deepEqual(retryProviderMessages[0], retryRow.provider_message);
  assert.deepEqual(retryProviderMessages[1], retryRow.provider_message,
    "retry sends the exact immutable reserved provider message without recomputation");
  const retryAfter = (await pool.query(
    `SELECT provider_message,message_sha256 FROM mobile_push_attempts WHERE id=$1`, [retryRow.id],
  )).rows[0];
  assert.deepEqual(retryAfter.provider_message, retryRow.provider_message);
  assert.equal(retryAfter.message_sha256, retryRow.message_sha256);
  const acceptedHistory = (await pool.query(
    `SELECT delivery_status,payload FROM mobile_push_log WHERE id=$1`, [retryRow.notification_id],
  )).rows[0];
  assert.equal(acceptedHistory.delivery_status, "accepted",
    "history replay starts from a provider-accepted durable row");
  assert.ok(historyReplayAt > new Date(retryRow.payload.shichen.endAt));
  for (const requestedSchema of [1, 2]) {
    const projected = projection.projectZibaiPayload(acceptedHistory.payload, requestedSchema);
    const historyWire = JSON.parse(JSON.stringify(
      notificationHistoryPayload(retryRow.notification_id, projected),
    ));
    const parsed = resolveNotificationPayload(historyWire, "zibai", retryRow.user_id);
    assert.ok(parsed, `accepted history remains parseable as schema ${requestedSchema} after expiry`);
    assert.equal(parsed.snapshotSchema === 2, requestedSchema === 2);
    if (requestedSchema === 2) {
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.month.palaces)), retryRow.payload.month.palaces);
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.day.palaces)), retryRow.payload.day.palaces);
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.shichen.palaces)), retryRow.payload.shichen.palaces,
        "expired history retains its immutable three-layer maps without recomputation");
    }
  }

  const expiredRow = attempts.find((row) => row.user_id === ids.dailyV2);
  assert.ok(expiredRow);
  const expiryAt = new Date(Date.parse(expiredRow.payload.day.endAt) - push.providerQueueSafetySeconds("zibai") * 1_000);
  let forbiddenExpiredSend = 0;
  const expired = await delivery.runRetryBatch(pool, {
    attemptIds: [expiredRow.id], limit: 1, concurrency: 1,
    hooks: { policyNow: () => expiryAt },
    sender: { async sendPrepared() {
      forbiddenExpiredSend += 1;
      return { kind: "provider_accepted", providerMessageId: "must-not-send-expired-v2" };
    } },
  });
  assert.equal(forbiddenExpiredSend, 0,
    "v2 snapshot is never submitted when its immutable end cannot contain provider TTL plus acceptance headroom");
  assert.deepEqual({ claimed: expired.claimed, dead: expired.dead }, { claimed: 1, dead: 1 });
  assert.equal(expired.outcomes[0]?.reason, "policy_expired_occurrence");

  const remainingIds = attempts
    .filter((row) => row.id !== retryRow.id && row.id !== expiredRow.id)
    .map((row) => row.id);
  let stubAccepted = 0;
  const drained = await delivery.runRetryBatch(pool, {
    attemptIds: remainingIds, limit: remainingIds.length, concurrency: 2,
    hooks: { policyNow: () => at },
    sender: { async sendPrepared() {
      stubAccepted += 1;
      return { kind: "provider_accepted", providerMessageId: `stub-e2e-${stubAccepted}` };
    } },
  });
  assert.equal(drained.accepted, remainingIds.length);
  assert.equal(stubAccepted, remainingIds.length);

  const monthBoundary = new Date("2026-08-07T11:42:43.000Z");
  const monthBefore = boundaryRoundTrip(new Date(monthBoundary.getTime() - 1), 100.5018, "zibai_shichen");
  const monthExact = boundaryRoundTrip(monthBoundary, 100.5018, "zibai_shichen");
  assert.equal(monthBefore.month.endAt, monthBoundary.toISOString());
  assert.equal(monthExact.month.startAt, monthBoundary.toISOString());
  assert.notDeepEqual(monthBefore.month.palaces, monthExact.month.palaces,
    "global Jie instant switches the month layer exactly at the boundary");

  const dayProbe = buildZibaiSnapshot(new Date("2026-08-16T03:07:00.000Z"), 100.5018);
  const dayBoundary = new Date(dayProbe.day.endAt);
  const dayBefore = boundaryRoundTrip(new Date(dayBoundary.getTime() - 1), 100.5018, "zibai_daily");
  const dayExact = boundaryRoundTrip(dayBoundary, 100.5018, "zibai_daily");
  assert.notEqual(dayBefore.day.apparentSolarDate, dayExact.day.apparentSolarDate,
    "apparent-solar day switches at exact 23:00 rather than civil midnight");

  const shichenBoundary = nextShichenBoundary(new Date("2026-08-16T03:07:00.000Z"), 100.5018);
  const shichenBefore = boundaryRoundTrip(new Date(shichenBoundary.getTime() - 1), 100.5018, "zibai_shichen");
  const shichenExact = boundaryRoundTrip(shichenBoundary, 100.5018, "zibai_shichen");
  assert.equal(shichenBefore.shichen.endAt, shichenBoundary.toISOString());
  assert.equal(shichenExact.shichen.startAt, shichenBoundary.toISOString());
  assert.notEqual(shichenBefore.shichen.key, shichenExact.shichen.key,
    "exact two-hour apparent-solar boundary advances the shichen layer");

  const gap = nextCivilMinute(new Date("2026-03-08T06:59:00.000Z"), "America/New_York", 150);
  assert.equal(gap.toISOString(), "2026-03-09T06:30:00.000Z",
    "nonexistent DST-gap 02:30 schedules the next real civil occurrence");
  boundaryRoundTrip(gap, -74.006, "zibai_daily");
  const foldFirst = nextCivilMinute(new Date("2026-11-01T04:59:00.000Z"), "America/New_York", 90);
  const foldSecond = nextCivilMinute(new Date("2026-11-01T05:31:00.000Z"), "America/New_York", 90);
  assert.equal(foldFirst.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(foldSecond.toISOString(), "2026-11-01T06:30:00.000Z",
    "DST fold exposes both real instants without collapsing or replaying one slot");
  boundaryRoundTrip(foldFirst, -74.006, "zibai_daily");
  boundaryRoundTrip(foldSecond, -74.006, "zibai_daily");

  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_zibai_installations WHERE lease_token IS NOT NULL`)).rows[0].n, 0);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mobile_push_attempts WHERE status IN ('reserved','retry_due')`)).rows[0].n, 0);
  console.log("ZIBAI_THREE_LAYER_E2E_OK dailyV1=1 dailyV2=1 shichenV1=1 shichenV2=1 providers=fcm,expo boundaries=jie,day23,shichen,dst-gap,dst-fold realSends=0");
} finally {
  await pool?.end().catch(() => null);
  try {
    psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE); DROP ROLE IF EXISTS ${role};`);
  } catch { /* guarded cleanup */ }
}
