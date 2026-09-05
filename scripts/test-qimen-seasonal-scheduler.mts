import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scheduler = require("./mobile-qimen-push-cron.cjs");
const builder = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const payloads = require("../src/lib/qimen-three-layer-notification.cjs");
const clock = require("../src/lib/qimen-notification-advisory.cjs");
const engineFixture = require("./fixtures/qimen-seasonal-engine-witness.cjs");
const legacyFixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const doorMethod = "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
const row = {
  user_id: "11111111-1111-4111-8111-111111111111", installation_id: "22222222-2222-4222-8222-222222222222",
  lease_token: "33333333-3333-4333-8333-333333333333", token_id: "44444444-4444-4444-8444-444444444444",
  purpose: "travel", latitude: 13.7563, longitude: 100.5018, location_timezone: "Asia/Bangkok",
  quiet_start: 0, quiet_end: 0, qimen_payload_schema: 4, location_permission: "foreground",
  tier: "premium", sub_expires_at: "2027-01-01T00:00:00.000Z", trial_ends_at: null,
  paused_until: null, token_locale: "th", platform: "android", device_token_type: "fcm", device_push_token: "synthetic-device",
};
const window = clock.trueSolarShichenWindow({ instant: "2026-06-22T03:00:00.000Z", longitude: row.longitude, timezone: row.location_timezone });
const at = new Date(Date.parse(window.startAt) + 6 * 60000);
const validRow = { ...row, location_captured_at: new Date(at.valueOf() - 86400000).toISOString(),
  location_expires_at: new Date(at.valueOf() + 6 * 86400000).toISOString() };
const snapshot = await builder.buildCanonicalQimenOccurrence(row, at, { schema: 4, doorMethod,
  fetchCanonicalQimenEngineSnapshot: async () => ({ result: engineFixture.build(at) }) });
const notice = scheduler.buildQimenNotice(validRow, snapshot, "55555555-5555-4555-8555-555555555555",
  new Date(Date.parse(window.startAt) + 10 * 60000).toISOString());
assert.deepEqual(Object.keys(notice.payload), ["qimenV4"]);
assert.equal(notice.sourceFacts.calculationVersion, "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_MONTH_V2");
assert.deepEqual(notice.sourceFacts.seasonalEvidence, snapshot.layers.hour.contextEvidence);
for (const locale of ["th", "en", "zh"]) {
  assert.deepEqual(notice.historyCopies[locale], scheduler.buildQimenCopy(locale, snapshot));
  assert.ok(notice.historyCopies[locale].body.length <= 400);
}

let calls = 0;
const memo = scheduler.createEngineSnapshotMemo(async (_input: unknown, options: any) => ({ count: ++calls, schema: options.schema, doorMethod: options.doorMethod }));
const input = { date: "2026-06-22", time: "10:00", instant: "2026-06-22T03:00:00.000Z", timezone: row.location_timezone, lat: row.latitude, lng: row.longitude };
const first = await memo(input, { schema: 3 });
const second = await memo(input, { schema: 4, doorMethod });
assert.notEqual(first, second, "cached legacy advisory must not cross the new method boundary");
assert.equal(second, await memo(input, { schema: 4, doorMethod }));
assert.notEqual(second, await memo(input, { schema: 4, doorMethod: "TONGZONG_DARK_RESIDUAL_QI_DOOR_MONTH_V1" }));
assert.equal(calls, 3);

async function processCase({ capability = 4, persisted = null, method = doorMethod, candidate = snapshot, expectedSchema = 4 }: any = {}) {
  const activeRow = { ...validRow, qimen_payload_schema: capability };
  let builds = 0; let admissions = 0; let delivered: any = null; let finishReason: unknown; let nextDue: unknown;
  const db = { async query(sql: string, params: any[] = []) {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [activeRow] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) return { rows: persisted ? [{
      id: "55555555-5555-4555-8555-555555555555", state: "claimed", push_log_id: null,
      snapshot: persisted, send_deadline: notice.sourceFacts.sendDeadline,
    }] : [] };
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) {
      assert.doesNotMatch(sql, /enabled|consent|mobile_push_tokens|mobile_notification_prefs/u);
      nextDue = params[3]; finishReason = params[4]; return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL ${sql}`);
  } };
  const result = await scheduler.processClaim(db, row, at, {
    seasonalDoorMethod: method,
    buildCanonicalOccurrence: async (_row: any, _at: any, options: any) => {
      builds += 1; assert.equal(options.schema, expectedSchema);
      assert.equal(options.doorMethod, expectedSchema === 4 ? method : undefined);
      return candidate;
    },
    admitOccurrence: async (_db: any, _row: any, value: any, deadline: any) => {
      admissions += 1;
      return { id: "55555555-5555-4555-8555-555555555555", snapshot: value, sendDeadline: deadline, recovered: false };
    },
    deliver: async (_db: any, value: any) => { delivered = value; return { status: "pending" }; },
  });
  return { result, builds, admissions, delivered, finishReason, nextDue };
}
// An old client cannot represent 廢 or the separated seasonal source evidence.
// Reject fresh production BEFORE consulting an engine; this is not a verdict
// that the hour has no good direction, and it must not disable the installation.
for (const method of [doorMethod, ""]) {
  const upgrade = await processCase({ capability: 3, method, candidate: null, expectedSchema: 3 });
  assert.deepEqual(upgrade.result, { reserved: 0, skipped: 1, reason: "payload_upgrade_required" });
  assert.equal(upgrade.builds, 0);
  assert.equal(upgrade.admissions, 0);
  assert.equal(upgrade.delivered, null);
  assert.equal(upgrade.finishReason, "payload_upgrade_required");
  assert.equal(upgrade.nextDue, window.endAt, "keep the installation scheduled for future upgrade recovery");
}
const sent = await processCase();
assert.deepEqual(sent.result, { reserved: 1, skipped: 0, reason: null });
assert.ok(sent.delivered.payload.qimenV4);
assert.equal(sent.builds, 1);
const missing = await processCase({ method: "" });
assert.equal(missing.result.reason, "seasonal_door_method_unconfigured");
assert.equal(missing.builds, 0);
assert.equal(missing.delivered, null);
const oldInput = legacyFixture.input(row.user_id);
oldInput.createdAt = at.toISOString();
oldInput.layers.month.validFrom = snapshot.layers.month.validFrom;
oldInput.layers.month.validUntil = snapshot.layers.month.validUntil;
oldInput.layers.day.validFrom = snapshot.layers.day.validFrom;
oldInput.layers.day.validUntil = snapshot.layers.day.validUntil;
oldInput.layers.hour.validFrom = window.startAt; oldInput.layers.hour.validUntil = window.endAt;
const legacy = payloads.buildQimenThreeLayerSnapshotV3(oldInput);
const recovered = await processCase({ persisted: legacy, method: "" });
assert.equal(recovered.result.reserved, 1);
assert.equal(recovered.builds, 0, "already-claimed historical V3 is recovered unchanged after upgrade");
assert.equal(recovered.delivered.payload.qimenV3, payloads.buildQimenV3ProviderData(legacy).qimenV3);
const recoveredOldClient = await processCase({ capability: 3, persisted: legacy, method: "" });
assert.equal(recoveredOldClient.result.reserved, 1);
assert.equal(recoveredOldClient.builds, 0);
assert.equal(recoveredOldClient.admissions, 0);
assert.equal(recoveredOldClient.delivered.payload.qimenV3, payloads.buildQimenV3ProviderData(legacy).qimenV3,
  "the fresh-production upgrade gate must not rewrite or block an already-claimed V3 occurrence");
const downgrade = await processCase({ capability: 3, persisted: snapshot });
assert.equal(downgrade.result.reason, "snapshot_capability_mismatch");
assert.equal(downgrade.builds, 0);
assert.equal(downgrade.delivered, null);
const badNew = await processCase({ candidate: legacy });
assert.equal(badNew.result.reason, "snapshot_capability_mismatch", "new V4 occurrence cannot be mislabeled legacy");
assert.equal(badNew.delivered, null);
console.log("QIMEN_SEASONAL_SCHEDULER_OK explicit_method=PASS v4_notice=PASS fresh_v3_upgrade_gate=PASS legacy_recovery=PASS upgrade=PASS downgrade=PASS memo=PASS");
