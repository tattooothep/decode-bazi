import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";
import { buildZiweiHourlySixLayerSnapshot } from "../src/lib/astro/ziwei/hourly-six-layer";
import { resolveCanonicalZiweiHourlyContext } from "../src/lib/astro/ziwei/context-resolver";
import * as scheduler from "./mobile-ziwei-hourly-push-cron.mts";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
const accountId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const occurrenceId = "00000000-0000-4000-8000-000000000003";
const at = new Date("2026-08-26T12:01:00.000Z");
const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 },
  gender: "M",
  referenceInstant: at,
  referenceTimezone: "Asia/Bangkok",
});
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({
  accountId,
  profile: { id: profileId, name: "Owner", isSelf: true },
  facts,
});
const row = {
  user_id: accountId,
  installation_id: "00000000-0000-4000-8000-000000000004",
  profile_id: profileId,
  token_id: "00000000-0000-4000-8000-000000000005",
  device_push_token: "fcm-fixture",
  device_token_type: "fcm",
  expo_push_token: "ExponentPushToken[ziweihourlyfixture]",
  platform: "android",
  token_locale: "th",
  account_locale: "en",
  ziwei_payload_schema: 2,
  owner_generation: 7,
  reference_timezone: "Asia/Bangkok",
  quiet_start: 22,
  quiet_end: 7,
};

assert.match(scheduler.occurrenceKey(row, snapshot), /^ziwei\|[0-9a-f]{64}$/u);
assert.notEqual(scheduler.occurrenceKey(row, snapshot), scheduler.occurrenceKey({
  ...row, profile_id: "00000000-0000-4000-8000-000000000006",
}, snapshot), "profile binding participates in dedupe");
assert.deepEqual(scheduler.admissionDecision(row, snapshot, at), {
  allow: true,
  sendDeadline: "2026-08-26T12:10:00.000Z",
});
assert.deepEqual(scheduler.admissionDecision(row, snapshot, new Date("2026-08-26T12:10:00.000Z")),
  { allow: false, reason: "late_occurrence" });
assert.deepEqual(scheduler.admissionDecision({ ...row, quiet_start: 19, quiet_end: 7 }, snapshot, at),
  { allow: false, reason: "quiet_hours" });
assert.equal(
  scheduler.retryAfterSnapshotFailure(at, new RangeError("ziwei_hourly_timezone_transition_unsupported")).toISOString(),
  "2026-08-26T13:01:00.000Z",
  "DST transition failures retry hourly so the next valid local shichen is not skipped",
);
assert.equal(
  scheduler.retryAfterSnapshotFailure(at, new TypeError("ziwei_hourly_ambiguous_reference_boundary")).toISOString(),
  "2026-08-26T13:01:00.000Z",
);
assert.equal(
  scheduler.retryAfterSnapshotFailure(at, new TypeError("ziwei_hourly_profile_inputs_unavailable")).toISOString(),
  "2026-08-26T14:01:00.000Z",
  "invalid profiles stay on the lower-frequency fail-closed retry",
);

const backendCommit = "a".repeat(40);
const notice = scheduler.buildZiweiNotice(row, snapshot, occurrenceId, "2026-08-26T12:10:00.000Z", backendCommit);
assert.equal(notice.kind, "ziwei");
assert.equal(notice.ziweiOccurrenceId, occurrenceId);
assert.equal(notice.sourceFacts.sourceDigest, scheduler.SOURCE_DIGEST);
assert.equal(notice.sourceFacts.backendCommit, backendCommit);
assert.deepEqual(notice.payload, notice.messages[0].data);
assert.deepEqual(notice.sourceFacts, {
  accountId,
  profileId,
  lineage: snapshot.facts.lineage,
  calculationVersion: snapshot.facts.calculationVersion,
  windowKey: snapshot.facts.reference.windowKey,
  snapshotDigest: snapshot.snapshotDigest,
  sourceDigest: scheduler.SOURCE_DIGEST,
  backendCommit,
  eventEndAt: snapshot.facts.reference.validUntil,
  sendDeadline: "2026-08-26T12:10:00.000Z",
  ownerGeneration: 7,
});
assert.match(notice.messages[0].title, /Ziwei hour/u,
  "lock-screen copy follows current account locale even if this token still stores another locale");
assert.doesNotMatch(`${notice.title} ${notice.body}`, /lucky|auspicious|best|มงคล|吉方|score/iu);

const rowV3 = { ...row, ziwei_payload_schema: 3 };
const noticeV3 = scheduler.buildZiweiNotice(rowV3, snapshot, occurrenceId, "2026-08-26T12:10:00.000Z", backendCommit);
assert.deepEqual(Object.keys(noticeV3.payload), ["ziweiHourlyV3"], "an explicitly capable installation gets the lossless readable transport");
assert.deepEqual(noticeV3.messages[0].data, noticeV3.payload);
assert.deepEqual(runtime.parseZiweiHourlyProviderData(noticeV3.payload), runtime.parseZiweiHourlyProviderData(notice.payload));
assert.equal(noticeV3.key, notice.key, "an in-window capability upgrade cannot invent a second occurrence key");
const readable = runtime.buildZiweiHourlyCopy("en", snapshot, { schema: 3, presentationVersion: presentation.READABLE_CLOCK_COPY_VERSION });
assert.equal(noticeV3.messages[0].title, readable.title);
assert.equal(noticeV3.messages[0].body, readable.body);
assert.equal(noticeV3.sourceFacts.payloadSchema, 3);
assert.equal(noticeV3.sourceFacts.presentationVersion, presentation.READABLE_CLOCK_COPY_VERSION);
assert.equal(noticeV3.sourceFacts.presentationCatalogSha256, presentation.READABLE_COPY_CATALOG_SHA256);
assert.equal(noticeV3.sourceFacts.meaningCatalogSha256, presentation.PRESENTATION_CATALOG_SHA256);
assert.equal(noticeV3.sourceFacts.presentationLocale, "en");
for (const locale of presentation.SUPPORTED_LOCALES) assert.deepEqual(noticeV3.historyCopies[locale], runtime.buildZiweiHourlyCopy(locale, snapshot, {
  schema: 3, presentationVersion: presentation.READABLE_CLOCK_COPY_VERSION,
}));
for (const schema of [0, 1, 4, undefined]) assert.throws(() => scheduler.buildZiweiNotice(
  { ...row, ziwei_payload_schema: schema }, snapshot, occurrenceId, "2026-08-26T12:10:00.000Z", backendCommit,
), /ziwei_hourly_token_capability_invalid/u);

const source = readFileSync(new URL("./mobile-ziwei-hourly-push-cron.mts", import.meta.url), "utf8");
assert.match(source, /to_char\(p\.birth_datetime AT TIME ZONE 'Asia\/Bangkok','YYYY-MM-DD"T"HH24:MI:SS'\) AS birth_wall/u);
assert.match(source, /resolveCanonicalZiweiHourlyContext\(/u);
assert.match(source, /canonicalContext\.birthFingerprint !== row\.birth_context_fingerprint/u);
assert.match(source, /AS account_locale/u);
assert.match(source, /t\.enabled=true AND t\.ziwei_payload_schema IN \(2,3\)/u);
assert.match(source, /owner_generation/u);
assert.match(source, /profile_id=\$3 AND owner_generation=\$5 AND window_valid_from=\$4/u,
  "a conflict lookup must never revive a stale occurrence from another owner generation");
assert.doesNotMatch(source, /buildZiweiHourlyPreview\(/u,
  "the production scheduler must never promote preview-only output");
assert.match(source, /withSchedulerRunLease\(\s*db,\s*"ziwei-hourly"/u);
assert.match(source, /writeSchedulerHeartbeat\("ziwei-hourly"\)/u);
assert.match(source, /mobile_ziwei_hourly_producer_state/u);
assert.match(source, /HOURKEY_RELEASE_COMMIT/u);
assert.match(source, /producer\?\.source_digest !== SOURCE_DIGEST/u);
assert.match(source, /verifyRuntimeSourceManifest\(\)/u);
assert.match(source, /producer\?\.backend_commit !== runtimeCommit/u);
assert.doesNotMatch(source, /DELETE FROM mobile_ziwei_hourly_installations/u,
  "a transient owner/capability miss disables the installation without erasing its occurrence audit trail");
assert.match(source, /last_skip_reason='owner_or_capability_invalid'/u);
assert.doesNotMatch(source, /qizheng|七政|qimen|zibai/iu,
  "the Ziwei scheduler cannot hybridize another discipline");

const disabledDb = {
  async query(sql: string) {
    assert.match(sql, /mobile_ziwei_hourly_producer_state/u);
    return { rows: [{ producer_enabled: false, source_digest: scheduler.SOURCE_DIGEST, backend_commit: null }] };
  },
};
assert.deepEqual(await scheduler.runScheduler(disabledDb as never, new AbortController().signal, at, {
  runtimeProducerEnabled: true,
  backendCommit: "a".repeat(40),
}), { disabled: true, due: 0, reserved: 0, skipped: 0 });

console.log("PASS Ziwei hourly scheduler — self profile, immutable occurrence, factual copy, hard release gates");

// Exercise the actual builder/admission, not dependency stubs of those paths.
const canonical = resolveCanonicalZiweiHourlyContext({ mode: "strict", birthWallClock: "1984-12-31T13:15:00",
  birthTimezone: "Asia/Bangkok", birthTimezoneSource: "profile", referenceInstant: at, referenceTimezone: "Asia/Bangkok" });
assert.equal(canonical.status, "resolved");
const fullRow = { ...rowV3, nickname: "Owner", name: "Owner", birth_wall: "1984-12-31T13:15:00", birth_tz: "Asia/Bangkok", gender: "M",
  birth_lat: 13.7563, birth_lng: 100.5018, birth_context_fingerprint: canonical.birthFingerprint,
  lease_token: "00000000-0000-4000-8000-000000000008" };
const fullSnapshot = buildZiweiHourlySixLayerSnapshot({ birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok", birthLocation: { lat: 13.7563, lng: 100.5018 }, gender: "M", referenceInstant: at, referenceTimezone: "Asia/Bangkok" },
{ accountId, profile: snapshot.profile });
for (const snapshotMode of [undefined, "six_layer", "legacy_three_layer"]) {
for (const { saved, runAt } of [{ saved: null, runAt: at }, ...[snapshot, fullSnapshot].flatMap(saved =>
  [at, new Date(at.valueOf() + 2_000)].map(runAt => ({ saved, runAt })))]) {
  let claimed = false; let attempts = 0; let inserted: any;
  const queries: string[] = [];
  const db = { async query(sql: string, params: any[] = []) {
    queries.push(sql);
    if (sql.includes("SELECT producer_enabled")) return { rows: [{ producer_enabled: true, source_digest: scheduler.SOURCE_DIGEST, backend_commit: backendCommit }] };
    if (sql.includes("claim_mobile_ziwei_hourly_installations")) { const rows = claimed ? [] : [fullRow]; claimed = true; return { rows }; }
    if (sql.includes("AS account_locale")) return { rows: [fullRow] };
    if (sql.includes("INSERT INTO mobile_ziwei_hourly_occurrences")) {
      inserted = JSON.parse(params[10]); assert.equal(inserted.snapshotSchema, snapshotMode === "legacy_three_layer" ? 1 : 2,
        "only explicit producer fallback creates legacy snapshots; default remains six-layer");
      return { rows: saved ? [] : [{ id: occurrenceId, snapshot: inserted, send_deadline: params[9], owner_generation: 7 }] };
    }
    if (sql.includes("SELECT id,state,push_log_id,snapshot")) return { rows: [{ id: occurrenceId, state: "claimed", push_log_id: null,
      snapshot: saved, send_deadline: "2026-08-26T12:10:00.000Z", owner_generation: 7 }] };
    if (sql.includes("UPDATE mobile_ziwei_hourly_installations")) return { rows: [] };
    throw new Error(`unexpected synthetic query: ${sql}`);
  } };
  const result = await scheduler.runScheduler(db as never, new AbortController().signal, runAt, {
    runtimeProducerEnabled: true, sourceManifestReady: true, backendCommit, snapshotMode,
    deliver: async (_db: any, actual: any) => {
      attempts += 1; assert.equal(actual.sourceFacts.snapshotDigest, (saved || inserted).snapshotDigest);
      assert.deepEqual(actual, scheduler.buildZiweiNotice(fullRow, saved || inserted, occurrenceId,
        "2026-08-26T12:10:00.000Z", backendCommit), "fallback retains the exact saved notice, locale and deadline");
      return { status: "pending" };
    },
  });
  assert.deepEqual(result, { disabled: false, due: 1, reserved: 1, skipped: 0 }, `mode ${snapshotMode} stored schema ${saved?.snapshotSchema ?? "new"} retry ${runAt.toISOString()}`);
  assert.equal(attempts, 1, "existing claimed schema1 and schema2 resume once without rewriting the stored chart");
  assert.equal(queries.some(sql => /UPDATE mobile_ziwei_hourly_occurrences|DELETE /u.test(sql)), false);
}
}
console.log("PASS Ziwei six-layer producer — real builder, new occurrence, legacy/schema2 resume, no history rewrite");

assert.equal(scheduler.resolveSnapshotMode("six_layer"), "six_layer");
assert.equal(scheduler.resolveSnapshotMode("legacy_three_layer"), "legacy_three_layer");
for (const value of ["", "0", "1", "legacy", "SIX_LAYER", null, false, 1, {}]) {
  assert.throws(() => scheduler.resolveSnapshotMode(value), /ziwei_hourly_snapshot_mode_invalid/u);
  let claims = 0;
  await assert.rejects(scheduler.runScheduler({ async query(sql: string) {
    if (sql.includes("SELECT producer_enabled")) return { rows: [{ producer_enabled: true,
      source_digest: scheduler.SOURCE_DIGEST, backend_commit: backendCommit }] };
    claims += 1; throw new Error("invalid mode reached a claim or mutation");
  } } as never, new AbortController().signal, at, {
    runtimeProducerEnabled: true, sourceManifestReady: true, backendCommit, snapshotMode: value,
  }), /ziwei_hourly_snapshot_mode_invalid/u);
  assert.equal(claims, 0);
}

const savedMode = process.env.ZIWEI_HOURLY_SNAPSHOT_MODE;
try {
  delete process.env.ZIWEI_HOURLY_SNAPSHOT_MODE;
  assert.equal(scheduler.resolveSnapshotMode(), "six_layer", "unset keeps the approved full chart");
  process.env.ZIWEI_HOURLY_SNAPSHOT_MODE = "legacy_three_layer";
  assert.equal(scheduler.resolveSnapshotMode(), "legacy_three_layer");
  assert.equal(scheduler.resolveSnapshotMode("six_layer"), "six_layer", "explicit run mode is stable");
} finally {
  if (savedMode === undefined) delete process.env.ZIWEI_HOURLY_SNAPSHOT_MODE;
  else process.env.ZIWEI_HOURLY_SNAPSHOT_MODE = savedMode;
}

async function rejectedRecovery(options: { saved?: any; current?: any; runAt?: Date; generation?: number; deadline?: string }) {
  let claimed = false; let delivered = 0;
  const saved = options.saved ?? fullSnapshot;
  const original = JSON.stringify(saved);
  const queries: string[] = [];
  const db = { async query(sql: string) {
    queries.push(sql);
    if (sql.includes("SELECT producer_enabled")) return { rows: [{ producer_enabled: true,
      source_digest: scheduler.SOURCE_DIGEST, backend_commit: backendCommit }] };
    if (sql.includes("claim_mobile_ziwei_hourly_installations")) {
      const rows = claimed ? [] : [fullRow]; claimed = true; return { rows };
    }
    if (sql.includes("AS account_locale")) return { rows: [options.current ?? fullRow] };
    if (sql.includes("INSERT INTO mobile_ziwei_hourly_occurrences")) return { rows: [] };
    if (sql.includes("SELECT id,state,push_log_id,snapshot")) return { rows: [{ id: occurrenceId,
      state: "claimed", push_log_id: null, snapshot: saved, owner_generation: options.generation ?? 7,
      send_deadline: options.deadline ?? "2026-08-26T12:10:00.000Z" }] };
    if (sql.includes("UPDATE mobile_ziwei_hourly_installations") || sql.includes("SET state='skipped'")) return { rows: [] };
    throw new Error(`unexpected synthetic query: ${sql}`);
  } };
  const result = await scheduler.runScheduler(db as never, new AbortController().signal, options.runAt ?? at, {
    runtimeProducerEnabled: true, sourceManifestReady: true, backendCommit, snapshotMode: "legacy_three_layer",
    deliver: async () => { delivered += 1; return { status: "pending" }; },
  });
  assert.deepEqual(result, { disabled: false, due: 1, reserved: 0, skipped: 1 });
  assert.equal(delivered, 0);
  assert.equal(JSON.stringify(saved), original, "stored chart is never mutated in memory");
  assert.equal(queries.some(sql => /DELETE |SET snapshot|SET producer_enabled|SET ziwei_hourly_enabled/u.test(sql)), false);
}

await rejectedRecovery({ saved: { ...fullSnapshot, snapshotDigest: "0".repeat(64) } });
await rejectedRecovery({ saved: runtime.buildZiweiHourlyNotificationSnapshot({ ...fullSnapshot,
  accountId: "00000000-0000-4000-8000-000000000009" }) });
await rejectedRecovery({ saved: runtime.buildZiweiHourlyNotificationSnapshot({ ...fullSnapshot,
  profile: { ...fullSnapshot.profile, id: "00000000-0000-4000-8000-000000000009" } }) });
await rejectedRecovery({ generation: 8 });
await rejectedRecovery({ current: { ...fullRow, nickname: "Changed profile" } });
await rejectedRecovery({ current: { ...fullRow, birth_context_fingerprint: "0".repeat(64) } });
await rejectedRecovery({ current: { ...fullRow, reference_timezone: "Asia/Tokyo" } });
await rejectedRecovery({ deadline: "2026-08-26T12:11:00.000Z" });
await rejectedRecovery({ runAt: new Date("2026-08-26T12:10:00.000Z") });
const midnightSnapshot = buildZiweiHourlySixLayerSnapshot({ birthInstant: new Date("1984-12-31T06:15:00.000Z"),
  birthTimezone: "Asia/Bangkok", birthLocation: { lat: 13.7563, lng: 100.5018 }, gender: "M",
  referenceInstant: new Date("2026-08-26T16:01:00.000Z"), referenceTimezone: "Asia/Bangkok" },
{ accountId, profile: snapshot.profile });
await rejectedRecovery({ saved: midnightSnapshot, current: { ...fullRow, quiet_start: 0, quiet_end: 0 },
  runAt: new Date("2026-08-26T17:01:00.000Z"), deadline: "2026-08-26T16:10:00.000Z" });
assert.match(source, /snapshot_mode=\$\{snapshotMode\}/u, "operator mode is visible in the existing cron log");
console.log("PASS Ziwei producer fallback — 15 new/resume cases, 9 invalid modes, 10 rejection cases; default, locale, ownership, history and deadline retained");
