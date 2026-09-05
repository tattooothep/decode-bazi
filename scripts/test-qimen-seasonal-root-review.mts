import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Independent, DB-free review checks. Never import/run the external engine,
// create a connection, send a push, or use the full live-call scheduler suite.
const require = createRequire(import.meta.url);
const scheduler = require("./mobile-qimen-push-cron.cjs");
const advisory = require("../src/lib/qimen-notification-advisory.cjs");
const builder = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const solar = require("../src/lib/zibai-solar-term-runtime.cjs");
const engine = require("./fixtures/qimen-seasonal-engine-witness.cjs");
const legacyFixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const method = "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
const longitude = 100.5018;
const timezone = "Asia/Bangkok";
const accountId = "11111111-1111-4111-8111-111111111111";
const hour = advisory.trueSolarShichenWindow({ instant: "2026-06-22T03:00:00.000Z", longitude, timezone });
const at = new Date(Date.parse(hour.startAt) + 6 * 60_000);
const row = {
  user_id: accountId, installation_id: "22222222-2222-4222-8222-222222222222",
  lease_token: "33333333-3333-4333-8333-333333333333", token_id: "44444444-4444-4444-8444-444444444444",
  purpose: "travel", latitude: 13.7563, longitude, location_timezone: timezone,
  quiet_start: 0, quiet_end: 0, qimen_payload_schema: 4, location_permission: "foreground",
  tier: "premium", sub_expires_at: "2027-01-01T00:00:00.000Z", trial_ends_at: null,
  paused_until: null, token_locale: "en", platform: "android", device_token_type: "fcm", device_push_token: "synthetic-only",
  location_captured_at: new Date(at.valueOf() - 86_400_000).toISOString(),
  location_expires_at: new Date(at.valueOf() + 86_400_000).toISOString(),
};
const make = (owner = accountId) => builder.buildCanonicalQimenOccurrence({ ...row, user_id: owner }, at, {
  schema: 4, doorMethod: method, fetchCanonicalQimenEngineSnapshot: async () => ({ result: engine.build(at) }),
});
const v4 = await make();
const legacyInput = legacyFixture.input(accountId);
legacyInput.createdAt = at.toISOString();
for (const kind of ["month", "day", "hour"]) {
  legacyInput.layers[kind].validFrom = v4.layers[kind].validFrom;
  legacyInput.layers[kind].validUntil = v4.layers[kind].validUntil;
}
const v3 = runtime.buildQimenThreeLayerSnapshotV3(legacyInput);
const deadline = new Date(Date.parse(hour.startAt) + 10 * 60_000).toISOString();
const occurrenceId = "55555555-5555-4555-8555-555555555555";

async function conflictCase(capability: number, candidate: any, conflictSnapshot: any, patch: any = {}) {
  let reads = 0; let inserts = 0; let delivered: any = null; let builds = 0;
  const active = { ...row, qimen_payload_schema: capability, ...patch };
  const db = { query: async (sql: string, args: any[]) => {
    if (/SELECT q\.\*,t\.id AS token_id/u.test(sql)) return { rows: [active] };
    if (/SELECT id,state,push_log_id,snapshot,send_deadline/u.test(sql)) {
      assert.deepEqual(args, [accountId, row.installation_id, "travel", hour.startAt]);
      reads += 1;
      return { rows: reads === 1 ? [] : [{ id: occurrenceId, state: "claimed", push_log_id: null,
        snapshot: conflictSnapshot, send_deadline: deadline }] };
    }
    if (/INSERT INTO mobile_qimen_occurrences/u.test(sql)) {
      assert.match(sql, /ON CONFLICT DO NOTHING/u); inserts += 1;
      assert.equal(JSON.parse(args[10]).snapshotDigest, candidate.snapshotDigest);
      return { rows: [] };
    }
    if (/UPDATE mobile_qimen_installations SET next_due_at/u.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected test SQL: ${sql}`);
  } };
  const outcome = await scheduler.processClaim(db, row, at, {
    seasonalDoorMethod: method,
    buildCanonicalOccurrence: async () => { builds += 1; return candidate; },
    deliver: async (_db: any, notice: any) => { delivered = notice; return { status: "pending" }; },
  });
  return { outcome, delivered, inserts, reads, builds };
}
const recovered = await conflictCase(4, v4, v3);
assert.equal(recovered.inserts, 1); assert.equal(recovered.reads, 2);
assert.equal(recovered.outcome.reserved, 1);
assert.equal(recovered.delivered.payload.qimenV3, runtime.buildQimenV3ProviderData(v3).qimenV3);
assert.equal(recovered.delivered.sourceFacts.calculationVersion, v3.versionTuple.hour);
assert.equal(Object.hasOwn(recovered.delivered.sourceFacts, "seasonalEvidence"), false);
const oldClient = await conflictCase(3, v3, v4);
assert.equal(oldClient.outcome.reason, "payload_upgrade_required");
assert.equal(oldClient.builds, 0);
assert.equal(oldClient.inserts, 0);
assert.equal(oldClient.reads, 1, "an old client may recover history but must not attempt a fresh INSERT");
assert.equal(oldClient.delivered, null);
const wrongOwner = await conflictCase(4, v4, await make("66666666-6666-4666-8666-666666666666"));
assert.equal(wrongOwner.outcome.reason, "persisted_snapshot_binding_mismatch");
assert.equal(wrongOwner.delivered, null);
for (const patch of [
  { location_permission: "denied" }, { paused_until: new Date(at.valueOf() + 60_000).toISOString() },
  { quiet_start: 0, quiet_end: 23 },
]) {
  const skipped = await conflictCase(4, v4, v4, patch);
  assert.equal(skipped.outcome.reserved, 0);
  assert.equal(skipped.builds, 0); assert.equal(skipped.inserts, 0); assert.equal(skipped.delivered, null);
}
assert.equal((await conflictCase(4, v4, v4, { tier: "free", sub_expires_at: null })).outcome.reserved, 1,
  "the existing entitlement policy allows the current free-plan hour; do not invent a new premium-only gate");

// All changed source identities must fail before a no-direction outcome could
// hide them. Advisory selection uses the raw result, never an injected advisory.
for (const key of ["yearPillarZh", "monthPillarZh", "dayPillarZh", "hourPillarZh"]) {
  const response = structuredClone(engine.build(at)); response.calculation.pillars[key] = "甲子";
  if (engine.build(at).calculation.pillars[key] === "甲子") response.calculation.pillars[key] = "乙丑";
  for (const palace of response.palaces) palace.display_score = 0;
  await assert.rejects(builder.buildCanonicalQimenOccurrence(row, at, {
    schema: 4, doorMethod: method, fetchCanonicalQimenEngineSnapshot: async () => ({ result: response }),
  }), /QIMEN_ENGINE_PILLARS_MISMATCH/u);
}
const stale = engine.build(new Date(at.valueOf() - 60_000));
await assert.rejects(builder.buildCanonicalQimenOccurrence(row, at, {
  schema: 4, doorMethod: method, fetchCanonicalQimenEngineSnapshot: async () => ({ result: stale }),
}), /QIMEN_CANONICAL_ENGINE_INSTANT_MISMATCH/u);

let crossingCases = 0;
for (const doorMethod of Object.keys(seasonal.DOOR_METHODS)) {
  for (let index = 1; index <= 23; index += 2) {
    const seam = Date.parse(solar.canonicalSolarTermInstant(2026, index));
    for (const delta of [-1, 0, 1]) {
      const instant = new Date(seam + delta);
      await assert.rejects(builder.buildCanonicalQimenOccurrence(row, instant, {
        schema: 4, doorMethod, fetchCanonicalQimenEngineSnapshot: async () => ({ result: engine.build(instant) }),
      }), /QIMEN_CONTEXT_TRANSITION_INSIDE_HOUR/u);
      crossingCases += 1;
    }
  }
}
assert.equal(Object.keys(require.cache).some(file => /[/\\]qimen-api[/\\]/u.test(file)), false);
console.log(JSON.stringify({ result: "QIMEN_SEASONAL_ROOT_REVIEW_OK", crossingCases,
  realInsertConflictHarness: "pass", upgradeLegacyBytes: "pass", downgradeOwnerGates: "pass", sourceBeforeNoDirection: "pass" }));
