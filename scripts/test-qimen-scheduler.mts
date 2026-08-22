import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let scheduler: Record<string, any> | null = null;
try {
  scheduler = require("./mobile-qimen-push-cron.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(scheduler, "the dedicated Qimen scheduler must exist");

const row = {
  user_id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  purpose: "travel",
  location_timezone: "Asia/Bangkok",
  longitude: 100.5018,
  quiet_start: 22,
  quiet_end: 7,
  location_permission: "foreground",
};
const occurrence = {
  snapshotDigest: "a".repeat(64),
  selectedDirection: "SE",
  versionTuple: {
    month: "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
    day: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1",
    hour: "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1",
  },
  layers: { hour: { validFrom: "2026-08-21T14:00:00.000Z", validUntil: "2026-08-21T16:00:00.000Z" } },
};

const key = scheduler.occurrenceKey(row, occurrence);
assert.match(key, /^qimen\|[a-f0-9]{64}$/u);
assert.notEqual(key, scheduler.occurrenceKey(row, { ...occurrence, selectedDirection: "E" }));
assert.notEqual(key, scheduler.occurrenceKey(row, {
  ...occurrence,
  versionTuple: { ...occurrence.versionTuple, day: "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V2" },
}));

assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:00:30.000Z")),
  { allow: true, sendDeadline: "2026-08-21T14:10:00.000Z" },
);
assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:05:00.000Z")),
  { allow: true, sendDeadline: "2026-08-21T14:10:00.000Z" },
  "the scheduler must still admit a science-approved direction after the five-minute boundary buffer",
);
assert.deepEqual(
  scheduler.admissionDecision(row, occurrence, new Date("2026-08-21T14:10:00.000Z")),
  { allow: false, reason: "late_occurrence" },
);
assert.deepEqual(
  scheduler.admissionDecision(
    { ...row, quiet_start: 0, quiet_end: 0 },
    { ...occurrence, layers: { hour: { validFrom: "2026-08-21T15:54:00.000Z", validUntil: "2026-08-21T15:59:30.000Z" } } },
    new Date("2026-08-21T15:54:30.000Z"),
  ),
  { allow: false, reason: "provider_safety_window" },
);
assert.deepEqual(
  scheduler.admissionDecision({ ...row, quiet_start: 20, quiet_end: 7 }, occurrence, new Date("2026-08-21T14:00:30.000Z")),
  { allow: false, reason: "quiet_hours" },
);

const queries: string[] = [];
const fakeDb = {
  async query(sql: string, params: unknown[]) {
    queries.push(sql);
    assert.equal(params[1], 25);
    return { rows: [{ installation_id: row.installation_id }] };
  },
};
const claimed = await scheduler.claimDue(fakeDb, new Date("2026-08-21T14:00:30.000Z"), 25);
assert.equal(claimed.length, 1);
assert.match(queries[0], /claim_mobile_qimen_installations/u);
assert.doesNotMatch(queries[0], /yam|today|personal/iu);
assert.deepEqual(scheduler.localDateTime("Asia/Bangkok", new Date("2026-08-21T17:30:00.000Z")), {
  date: "2026-08-22", time: "00:30",
});
assert.equal(scheduler.localDateTime("not/a-zone", new Date()), null);

let memoFetchCalls = 0;
const memoizedEngineFetch = scheduler.createEngineSnapshotMemo(async (input: Record<string, unknown>) => {
  memoFetchCalls += 1;
  return { input, sequence: memoFetchCalls };
});
const memoInput = {
  date: "2026-08-21", time: "14:00", timezone: "Asia/Bangkok",
  instant: "2026-08-21T07:00:00.000Z", lat: 13.7563, lng: 100.5018,
};
const [memoFirst, memoSecond] = await Promise.all([
  memoizedEngineFetch(memoInput, { signal: new AbortController().signal }),
  memoizedEngineFetch({ ...memoInput }, { signal: new AbortController().signal }),
]);
assert.equal(memoFirst, memoSecond, "same run/time/location shares one immutable engine response");
assert.equal(memoFetchCalls, 1);
await memoizedEngineFetch({ ...memoInput, lng: 101 }, { signal: new AbortController().signal });
assert.equal(memoFetchCalls, 2, "a different calculation input never reuses another location's chart");

const source = fs.readFileSync(new URL("./mobile-qimen-push-cron.cjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /mobile-yam-push|mobile-personal-reminders|today_occurrence/iu);
assert.match(source, /withSchedulerRunLease\(db, "qimen"/u);
assert.match(source, /writeSchedulerHeartbeat\("qimen"\)/u);
assert.match(source, /if \(!DRY\) await writeSchedulerHeartbeat\("qimen"\)/u,
  "a successful guarded scheduler tick must still publish liveness while the producer is disabled");
assert.doesNotMatch(source, /report\.disabled[^\n]*writeSchedulerHeartbeat/u,
  "producer enablement must not control scheduler liveness evidence");

const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const snapshotRuntime = require("../src/lib/qimen-three-layer-notification.cjs");
const snapshotV3Fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const deliverySource = fs.readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");
assert.match(deliverySource, /qimenOccurrenceId/u);
assert.match(deliverySource, /mobile_qimen_occurrences/u);
assert.match(deliverySource, /qimen_payload_schema/u);
assert.match(deliverySource, /qimenV3/u, "durable delivery binds schema-v3 Qimen payloads");
assert.match(deliverySource, /qimenPayload\?\.schema === 3/u,
  "only schema-v3 Qimen delivery receives the explicit privacy-safe full-copy exception");
assert.match(deliverySource, /location_permission,location_captured_at,location_expires_at/u,
  "retry must re-read current location permission and freshness from the installation");
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:00:30.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    999,
  ),
  { allow: true },
  "Qimen retry policy uses its own installation consent and ignores the unrelated generic daily cap",
);
for (const [contextPatch, reason] of [
  [{ qimen_location_permission: "denied" }, "policy_location_permission_revoked"],
  [{ qimen_location_expires_at: "2026-08-21T14:00:00.000Z" }, "policy_location_expired"],
] as const) {
  assert.deepEqual(
    delivery.currentPolicyDecision(
      { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
      {
        privacy_preview: false, account_active: true, account_tier: "premium",
        account_sub_expires_at: "2027-08-21T00:00:00.000Z", account_trial_ends_at: null,
        now_at: new Date("2026-08-21T14:00:30.000Z"), qimen_enabled: true,
        qimen_location_required: true, qimen_location_permission: "foreground",
        qimen_location_captured_at: "2026-08-20T14:00:30.000Z",
        qimen_location_expires_at: "2026-08-27T14:00:30.000Z",
        qimen_expires_at: "2026-08-21T16:00:00.000Z", qimen_timezone: "Asia/Bangkok",
        qimen_quiet_start: 22, qimen_quiet_end: 7, ...contextPatch,
      },
      0,
    ),
    { allow: false, terminal: true, reason },
  );
}
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: { eventEndAt: "2026-08-21T16:00:00.000Z" } },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:00:30.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 20,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_quiet_hours" },
  "a queued Qimen attempt is terminal in quiet hours and cannot replay in another shichen",
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:06:00.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_send_deadline: "2026-08-21T14:05:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_late_occurrence" },
  "a retry can never escape the immutable occurrence admission deadline",
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "11111111-1111-4111-8111-111111111111", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false,
      account_active: true,
      account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z",
      account_trial_ends_at: null,
      now_at: new Date("2026-08-21T14:01:00.000Z"),
      qimen_enabled: true,
      qimen_expires_at: "2026-08-21T16:00:00.000Z",
      qimen_send_deadline: "2026-08-21T14:05:00.000Z",
      qimen_paused_until: "2026-08-22T00:00:00.000Z",
      qimen_timezone: "Asia/Bangkok",
      qimen_quiet_start: 22,
      qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_paused" },
  "pause terminally skips this immutable shichen instead of replaying it later",
);
assert.match(source, /snapshot\.accountId !== row\.user_id/u);
assert.match(source, /snapshot\.purpose !== row\.purpose/u);
assert.match(source, /snapshot\.layers\.hour\.validFrom !== canonicalWindow\.startAt/u);
assert.match(source, /qimenNotificationEntitlement/u);
assert.match(source, /paused_until/u);
assert.match(source, /HOURKEY_RELEASE_COMMIT/u);
assert.match(source, /producer\.backend_commit !== runtimeCommit/u);

const snapshotV3 = snapshotV3Fixture.build(row.user_id);
const th = scheduler.buildQimenCopy("th", snapshotV3);
assert.match(th.title, /^△ ฉีเหมิน · ดีแบบมีเงื่อนไข · ทิศ/u,
  "raw usable with no warnings is conditional, never clear-good");
assert.match(th.body, /ใช้ได้ แต่ยังไม่ใช่ดีชัดเจน/u);
assert.match(th.body, /เก้าพื้นดิน \(九地\)✓/u);
assert.match(th.body, /ประตูปิดกั้น \(杜門\)•/u);
assert.match(th.body, /ดาวเทียนรุ่ย \(天芮\)!/u);
assert.match(th.body, /เก้าพื้นดิน \(九地\).*✓ ส่งเสริม/u);
assert.match(th.body, /ดาวเทียนรุ่ย \(天芮\).*! ไม่ส่งเสริม/u);
assert.match(th.body, /✓ ส่งเสริม.*• ขึ้นกับบริบท.*! ไม่ส่งเสริม.*\? ยังไม่มีข้อมูล/u);
assert.match(th.body, /ผังยามเป็นผู้ตัดสิน/u);
assert.ok(th.body.length <= 400, `Thai provider copy exceeds 400 characters: ${th.body.length}`);
const en = scheduler.buildQimenCopy("en", snapshotV3);
assert.match(en.body, /Jiu Di \(Nine Earth\) \(九地\)/u);
assert.ok(en.body.length <= 400, `English provider copy exceeds 400 characters: ${en.body.length}`);
const zh = scheduler.buildQimenCopy("zh", snapshotV3);
assert.doesNotMatch(zh.body, /九地 \(九地\)/u);
assert.ok(zh.body.length <= 400, `Chinese provider copy exceeds 400 characters: ${zh.body.length}`);
const fallback = scheduler.buildQimenCopy("vi", snapshotV3);
assert.match(fallback.body, /Jiu Di \(Nine Earth\) \(九地\)/u,
  "a supported locale without canonical component translations uses the documented English-plus-Han fallback");

const warningSnapshotV3 = snapshotRuntime.buildQimenThreeLayerSnapshotV3({
  ...snapshotV3Fixture.input(row.user_id),
  hourDecision: {
    direction: "N", purpose: "travel", recommendationCode: "recommended",
    reasonCodes: [
      "hour_conditional_good", "hour_reading_caution",
      "hour_warning_KONG_WANG", "hour_warning_STEM_RESPONSE_GUI_OVER_REN",
    ],
  },
});
for (const [locale, pattern] of [
  ["th", /ช่องว่าง.*เรื่องเดิมหรือความสับสนอาจย้อนกลับ/u],
  ["en", /void.*old issues\/confusion may return/iu],
  ["zh", /空亡.*舊事或混亂可能反覆/u],
] as const) {
  const copy = scheduler.buildQimenCopy(locale, warningSnapshotV3);
  assert.match(copy.body, pattern, `${locale} conditional copy surfaces every canonical warning`);
  assert.doesNotMatch(copy.body, /STEM_RESPONSE|GUI_OVER_REN/u,
    `${locale} provider copy must not expose an internal stem-response code`);
  assert.ok(copy.body.length <= 400, `${locale} conditional warning copy exceeds 400 characters`);
}

for (const [code, thPattern, enPattern, zhPattern] of [
  ["STEM_RESPONSE_GUI_OVER_JI", /เหมาะงานเงียบ ไม่เหมาะเปิดเผย/u, /quiet work favored; avoid publicity/u, /宜靜務，不宜公開/u],
  ["STEM_RESPONSE_XIN_OVER_BING", /เงินหรือผลประโยชน์อาจพิพาท/u, /money\/interests may cause disputes/u, /錢財或利益恐生爭議/u],
  ["STEM_RESPONSE_BING_OVER_GUI", /ข้อมูลซ่อนอาจทำให้ยุ่งยาก/u, /hidden information may complicate matters/u, /隱藏資訊恐添紛擾/u],
  ["STEM_RESPONSE_JI_OVER_DING", /ข่าวหรือเอกสารอาจติดขัด/u, /news\/documents may be delayed/u, /消息或文書恐受阻/u],
] as const) {
  const localizedStemSnapshot = snapshotRuntime.buildQimenThreeLayerSnapshotV3({
    ...snapshotV3Fixture.input(row.user_id),
    hourDecision: {
      direction: "N", purpose: "travel", recommendationCode: "recommended",
      reasonCodes: ["hour_conditional_good", "hour_reading_caution", `hour_warning_${code}`],
    },
  });
  assert.match(scheduler.buildQimenCopy("th", localizedStemSnapshot).body, thPattern);
  assert.match(scheduler.buildQimenCopy("en", localizedStemSnapshot).body, enPattern);
  assert.match(scheduler.buildQimenCopy("zh", localizedStemSnapshot).body, zhPattern);
}

const clearSnapshotV3 = snapshotRuntime.buildQimenThreeLayerSnapshotV3({
  ...snapshotV3Fixture.input(row.user_id),
  hourDecision: {
    direction: "N", purpose: "travel", recommendationCode: "recommended",
    reasonCodes: ["hour_clear_good", "hour_reading_suitable"],
  },
});
assert.match(scheduler.buildQimenCopy("th", clearSnapshotV3).title, /^✓ ฉีเหมิน · ดีชัดเจน · ทิศ/u);
assert.match(scheduler.buildQimenCopy("en", clearSnapshotV3).title, /^✓ Qimen · Clearly good · /u);
assert.match(scheduler.buildQimenCopy("zh", clearSnapshotV3).title, /^✓ 奇門 · 明確吉方 · /u);

const tamperedQuality = structuredClone(snapshotV3);
tamperedQuality.selectedEvidence.month.deityBaseQuality = "great_auspicious";
assert.throws(() => scheduler.buildQimenCopy("th", tamperedQuality), /qimen_snapshot_invalid/u,
  "a mismatched attested quality is rejected instead of rendered supportive");
const unknownCode = structuredClone(snapshotV3);
unknownCode.selectedEvidence.month.deityCode = "UNKNOWN";
assert.throws(() => scheduler.buildQimenCopy("th", unknownCode), /qimen_snapshot_invalid/u,
  "an unknown component code is rejected instead of rendered supportive or contextual");

const schema3Notice = scheduler.buildQimenNotice(
  { ...row, token_id: "token-v3", qimen_payload_schema: 3, token_locale: "th", platform: "android" },
  snapshotV3,
  "33333333-3333-4333-8333-333333333333",
  new Date(Date.parse(snapshotV3.layers.hour.validFrom) + 10 * 60_000).toISOString(),
);
assert.deepEqual(Object.keys(schema3Notice.payload), ["qimenV3"]);
assert.equal(schema3Notice.messages[0].data.qimenV3, schema3Notice.payload.qimenV3);
assert.deepEqual(schema3Notice.historyCopies.th, th,
  "the durable Thai history copy exactly matches the localized copy used for provider delivery");

const disabledQueries: string[] = [];
const disabledDb = {
  async query(sql: string) {
    disabledQueries.push(sql);
    if (/mobile_qimen_producer_state/u.test(sql)) return { rows: [{ producer_enabled: false }] };
    throw new Error("disabled scheduler must not claim installations");
  },
};
const report = await scheduler.runScheduler(
  disabledDb,
  { throwIfAborted() {} },
  new Date("2026-08-21T14:00:30.000Z"),
  { runtimeProducerEnabled: true },
);
assert.deepEqual(report, { disabled: true, due: 0, reserved: 0, skipped: 0 });
assert.equal(disabledQueries.length, 1);

const canonicalSeed = new Date("2026-08-21T12:30:00.000Z");
const canonicalWindow = require("../src/lib/qimen-notification-advisory.cjs").trueSolarShichenWindow({
  timezone: "Asia/Bangkok", longitude: 100.5018, instant: canonicalSeed,
});
const canonicalAt = new Date(Date.parse(canonicalWindow.startAt) + 60_000);
const recoveredInputV3 = snapshotV3Fixture.input("acct_recovery");
recoveredInputV3.createdAt = canonicalAt.toISOString();
recoveredInputV3.layers.hour.validFrom = canonicalWindow.startAt;
recoveredInputV3.layers.hour.validUntil = canonicalWindow.endAt;
const persistedSnapshot = snapshotRuntime.buildQimenThreeLayerSnapshotV3(recoveredInputV3);
const recoveryClaim = { user_id: "acct_recovery", installation_id: "installation_recovery", lease_token: "lease_recovery" };
const recoveryRow = {
  ...recoveryClaim,
  purpose: "travel",
  location_timezone: "Asia/Bangkok",
  longitude: 100.5018,
  quiet_start: 22,
  quiet_end: 7,
  location_captured_at: new Date(canonicalAt.valueOf() - 24 * 60 * 60 * 1_000).toISOString(),
  location_expires_at: new Date(canonicalAt.valueOf() + 6 * 24 * 60 * 60 * 1_000).toISOString(),
  location_permission: "foreground",
  qimen_payload_schema: 3,
  tier: "premium",
  sub_expires_at: "2027-08-21T00:00:00.000Z",
  trial_ends_at: null,
  paused_until: null,
  token_id: "token_recovery",
  device_push_token: "device_recovery",
  device_token_type: "fcm",
  expo_push_token: null,
  platform: "android",
  token_locale: "th",
};

let schema2BuildCalls = 0;
let schema2FinishReason = "";
const schema2Db = {
  async query(sql: string, params: unknown[] = []) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [{ ...recoveryRow, qimen_payload_schema: 2 }] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) {
      schema2FinishReason = String(params[4]);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected schema-2 SQL: ${sql}`);
  },
};
assert.deepEqual(
  await scheduler.processClaim(schema2Db, recoveryClaim, canonicalAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() {
      schema2BuildCalls += 1;
      return persistedSnapshot;
    },
  }),
  { reserved: 0, skipped: 1, reason: "payload_capability_missing" },
  "a schema-2 token receives no incompatible schema-v3 occurrence",
);
assert.equal(schema2BuildCalls, 0, "schema-2 capability is rejected before invoking the engine");
assert.equal(schema2FinishReason, "payload_capability_missing");

const boundaryCautionAt = new Date(Date.parse(canonicalWindow.startAt) + 30_000);
let boundaryRetry: { nextDueAt: string; reason: string } | null = null;
const boundaryCautionDb = {
  async query(sql: string, params: unknown[] = []) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [{
      ...recoveryRow,
      location_captured_at: new Date(boundaryCautionAt.valueOf() - 24 * 60 * 60 * 1_000).toISOString(),
      location_expires_at: new Date(boundaryCautionAt.valueOf() + 6 * 24 * 60 * 60 * 1_000).toISOString(),
    }] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) {
      boundaryRetry = { nextDueAt: String(params[3]), reason: String(params[4]) };
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected boundary-caution SQL: ${sql}`);
  },
};
assert.deepEqual(
  await scheduler.processClaim(boundaryCautionDb, recoveryClaim, boundaryCautionAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() {
      return null;
    },
  }),
  { reserved: 0, skipped: 1, reason: "boundary_stabilizing" },
  "a first-five-minute caution must be retried inside the same shichen",
);
assert.deepEqual(boundaryRetry, {
  nextDueAt: new Date(Date.parse(canonicalWindow.startAt) + 5 * 60_000).toISOString(),
  reason: "boundary_stabilizing",
}, "a boundary caution becomes due exactly when the engine's five-minute caution buffer ends");

const transientAt = new Date(Date.parse(canonicalWindow.startAt) + 5.5 * 60_000);
const transientRecoveryAt = new Date(transientAt.valueOf() + 60_000);
let transientNextDueAt = "";
let transientFinishReason = "";
let transientAdmissionCalls = 0;
let transientDeliveryCalls = 0;
const transientDb = {
  async query(sql: string, params: unknown[] = []) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [{
      ...recoveryRow,
      location_captured_at: new Date(transientAt.valueOf() - 24 * 60 * 60 * 1_000).toISOString(),
      location_expires_at: new Date(transientAt.valueOf() + 6 * 24 * 60 * 60 * 1_000).toISOString(),
    }] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) {
      transientNextDueAt = String(params[3]);
      transientFinishReason = String(params[4]);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`unexpected transient SQL: ${sql}`);
  },
};
const transportError = Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
assert.deepEqual(
  await scheduler.processClaim(transientDb, recoveryClaim, transientAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() { throw transportError; },
  }),
  { reserved: 0, skipped: 1, reason: "engine_retry_ECONNRESET" },
  "a retryable engine transport failure stays inside the current admission window",
);
assert.equal(transientNextDueAt, transientRecoveryAt.toISOString());
assert.equal(transientFinishReason, "engine_retry_ECONNRESET");

const recoveredAfterTransient = await scheduler.processClaim(transientDb, recoveryClaim, transientRecoveryAt, {
  signal: new AbortController().signal,
  async buildCanonicalOccurrence() { return persistedSnapshot; },
  async admitOccurrence(_db: unknown, _row: unknown, recoveredSnapshot: unknown, sendDeadline: string) {
    transientAdmissionCalls += 1;
    if (transientAdmissionCalls > 1) return null;
    return { id: "occurrence_after_transient", snapshot: recoveredSnapshot, sendDeadline };
  },
  async deliver() {
    transientDeliveryCalls += 1;
    return { status: "pending" };
  },
});
assert.deepEqual(recoveredAfterTransient, { reserved: 1, skipped: 0, reason: null });
assert.equal(transientDeliveryCalls, 1, "recovery reserves one durable delivery");
assert.deepEqual(
  await scheduler.processClaim(transientDb, recoveryClaim, transientRecoveryAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() { return persistedSnapshot; },
    async admitOccurrence() {
      transientAdmissionCalls += 1;
      return null;
    },
    async deliver() {
      transientDeliveryCalls += 1;
      return { status: "pending" };
    },
  }),
  { reserved: 0, skipped: 1, reason: "duplicate" },
  "a repeated recovery cannot reserve a second occurrence",
);
assert.equal(transientDeliveryCalls, 1, "duplicate recovery never reaches delivery");

const contractMismatch = Object.assign(new Error("QIMEN_HOUR_ENGINE_CONTRACT_NOT_ALLOWED"), {
  code: "QIMEN_HOUR_ENGINE_CONTRACT_NOT_ALLOWED",
});
await scheduler.processClaim(transientDb, recoveryClaim, transientAt, {
  signal: new AbortController().signal,
  async buildCanonicalOccurrence() { throw contractMismatch; },
});
assert.equal(transientNextDueAt, canonicalWindow.endAt,
  "a deterministic contract mismatch fails closed until the next shichen instead of retrying");
assert.equal(transientFinishReason, "QIMEN_HOUR_ENGINE_CONTRACT_NOT_ALLOWED");

let recoveryBuildCalls = 0;
let recoveryDeliverCalls = 0;
const recoveryDb = {
  async query(sql: string) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [recoveryRow] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [{
      id: "occurrence_recovery",
      state: "claimed",
      push_log_id: null,
      snapshot: persistedSnapshot,
      send_deadline: new Date(Date.parse(canonicalWindow.startAt) + 10 * 60_000).toISOString(),
    }] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) return { rowCount: 1, rows: [] };
    throw new Error(`unexpected recovery SQL: ${sql}`);
  },
};
assert.deepEqual(
  await scheduler.processClaim(recoveryDb, recoveryClaim, canonicalAt, {
    signal: new AbortController().signal,
    async buildCanonicalOccurrence() {
      recoveryBuildCalls += 1;
      throw new Error("recovery must not rebuild a persisted immutable occurrence");
    },
    async deliver(_db: unknown, notice: Record<string, any>) {
      recoveryDeliverCalls += 1;
      assert.equal(notice.qimenOccurrenceId, "occurrence_recovery");
      assert.equal(notice.sourceFacts.snapshotDigest, persistedSnapshot.snapshotDigest);
      return { status: "pending" };
    },
  }),
  { reserved: 1, skipped: 0, reason: null },
);
assert.equal(recoveryBuildCalls, 0, "crash recovery reuses the original createdAt and digest without calling the engine");
assert.equal(recoveryDeliverCalls, 1, "the recovered occurrence is reserved exactly once");

const abortController = new AbortController();
const abortReason = new Error("bounded scheduler abort");
const boundedClaims = Array.from({ length: 500 }, (_, index) => ({
  user_id: `acct_${index}`, installation_id: `installation_${index}`, lease_token: `lease_${index}`,
}));
let claimedLimit = 0;
let abortBuildCalls = 0;
let releasedClaims = 0;
let releaseQueries = 0;
const abortDb = {
  async query(sql: string, params: unknown[] = []) {
    if (/mobile_qimen_producer_state/u.test(sql)) return { rows: [{
      producer_enabled: true,
      source_digest: "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460",
      backend_commit: "d".repeat(40),
    }] };
    if (/claim_mobile_qimen_installations/u.test(sql)) {
      claimedLimit = Number(params[1]);
      return { rows: boundedClaims };
    }
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [{
      ...recoveryRow,
      user_id: params[0], installation_id: params[1], lease_token: params[2],
    }] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: [] };
    if (/SET lease_token=NULL,lease_expires_at=NULL/u.test(sql)) {
      assert.ok(Array.isArray(params[0]), "lease cleanup must use bounded UUID arrays instead of one SQL round-trip per claim");
      releaseQueries += 1;
      releasedClaims += params[0].length;
      return { rowCount: params[0].length, rows: [] };
    }
    throw new Error(`unexpected abort SQL: ${sql}`);
  },
};
await assert.rejects(
  scheduler.runScheduler(abortDb, abortController.signal, canonicalAt, {
    runtimeProducerEnabled: true,
    backendCommit: "d".repeat(40),
    batchLimit: 10_000,
    workerCount: 1,
    async buildCanonicalOccurrence(_row: unknown, _at: unknown, options: { signal: AbortSignal }) {
      abortBuildCalls += 1;
      assert.equal(options.signal, abortController.signal, "the scheduler abort signal reaches the engine builder");
      abortController.abort(abortReason);
      throw abortReason;
    },
  }),
  abortReason,
);
assert.equal(claimedLimit, 500, "one in-memory chunk is bounded to 500 claims within the 50-second lease");
assert.equal(abortBuildCalls, 1, "aborting stops the scheduler from starting another claim");
assert.equal(releasedClaims, 500, "abort cleanup releases every claimed lease, including work not started");
assert.equal(releaseQueries, 5, "a 500-claim cleanup uses five bounded 100-row updates");

let cleanupAttempts = 0;
await assert.rejects(
  scheduler.releaseClaims({
    async query() {
      cleanupAttempts += 1;
      if (cleanupAttempts === 2) throw new Error("one cleanup failed");
      return { rowCount: 1, rows: [] };
    },
  }, boundedClaims.slice(0, 250), canonicalAt),
  /one cleanup failed/u,
);
assert.equal(cleanupAttempts, 3, "one cleanup chunk failure never strands later cleanup chunks");

assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: row.user_id, kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false, account_active: false, account_tier: "premium",
      account_sub_expires_at: "2027-08-21T00:00:00.000Z", account_trial_ends_at: null,
      now_at: canonicalAt, qimen_enabled: true, qimen_expires_at: canonicalWindow.endAt,
      qimen_timezone: "Asia/Bangkok", qimen_quiet_start: 22, qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "policy_account_inactive" },
);
assert.deepEqual(
  delivery.currentPolicyDecision(
    { user_id: "", kind: "qimen", privacy_safe: true, transactional: false, source_facts: {} },
    {
      privacy_preview: false, account_active: true, account_tier: "premium",
      account_sub_expires_at: "2026-08-20T00:00:00.000Z", account_trial_ends_at: null,
      now_at: canonicalAt, qimen_enabled: true, qimen_expires_at: canonicalWindow.endAt,
      qimen_timezone: "Asia/Bangkok", qimen_quiet_start: 22, qimen_quiet_end: 7,
    },
    0,
  ),
  { allow: false, terminal: true, reason: "qimen_not_entitled" },
  "Qimen entitlement identity is rechecked before provider delivery",
);

console.log("qimen dedicated scheduler policy tests passed");
