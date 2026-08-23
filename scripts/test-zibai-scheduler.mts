import assert from "node:assert/strict";
import scheduler from "./mobile-zibai-push-cron.cjs";
import { buildZibaiSnapshot, solarDayWindow } from "../src/lib/zibai-science.ts";

assert.equal(scheduler.inQuietHours(23 * 60, 22, 7), true);
assert.equal(scheduler.inQuietHours(7 * 60, 22, 7), false);
assert.equal(scheduler.inQuietHours(10 * 60, 8, 8), false);

const at = new Date("2026-08-16T03:00:00.000Z");
const snapshot = buildZibaiSnapshot(at, 100.5018);
assert.equal(snapshot.calculationVersion, "zibai-zaoming-true-solar-v3",
  "boundary-latched snapshots must carry the new immutable calculation version");
const row = {
  user_id: "00000000-0000-4000-8000-000000000001",
  installation_id: "10000000-0000-4000-8000-000000000001",
  token_id: "20000000-0000-4000-8000-000000000001",
  device_push_token: "fixture-native-token", device_token_type: "fcm", expo_push_token: "ExponentPushToken[fixture]",
  platform: "android", token_locale: "th",
  privacy_preview: false, zibai_payload_schema: 1, app_version: "999.0.0",
  calculation_version: "zibai-zaoming-true-solar-v3",
  zibai_calculation_version: "zibai-zaoming-true-solar-v3",
};
const occurrenceId = "30000000-0000-4000-8000-000000000001";
const notice = scheduler.buildZibaiNotice(row, "zibai_shichen", snapshot, occurrenceId);
assert.throws(
  () => scheduler.buildZibaiNotice(
    row,
    "zibai_shichen",
    { ...snapshot, calculationVersion: "zibai-zaoming-true-solar-v2" },
    occurrenceId,
  ),
  /zibai_snapshot_calculation_version_mismatch/u,
  "the active scheduler fails closed instead of relabelling an older snapshot as v3",
);
assert.equal(notice.kind, "zibai");
assert.equal(notice.messages.length, 1);
assert.equal(notice.messages[0].category, "zibai");
assert.equal(notice.payload.kind, "zibai");
assert.equal(notice.zibaiOccurrenceId, occurrenceId);
assert.equal(notice.messages[0].title, "การแจ้งเตือนส่วนตัว");
assert.doesNotMatch(notice.messages[0].body, /วางแผน|พักให้พอ|งดเจาะ|งานสร้างสรรค์/u);
for (const token of ["1 ", "2 ", "5 ", "9 ", "พักให้พอ", "งดเจาะ"]) {
  assert.ok(notice.historyCopies.th.body.includes(token), `authenticated history retains bounded practical copy: ${token}`);
}
assert.doesNotMatch(notice.historyCopies.th.body, /วางแผน|งานสร้างสรรค์/u,
  "producer copy does not synthesize a focus-star action when the kernel selects caution/reference guidance");
const optedInPreview = scheduler.buildZibaiNotice({ ...row, privacy_preview: true }, "zibai_shichen", snapshot, occurrenceId);
assert.equal(optedInPreview.messages[0].body, notice.historyCopies.th.body,
  "privacy-preview provider copy is the exact bounded history copy without truncation");
assert.deepEqual(Object.keys(notice.sourceFacts).sort(), ["apparentSolarDate", "calculationVersion", "occurrenceType", "shichen"],
  "science audit facts retain the branch without a credential-like key name");
assert.equal(/latitude|longitude|100\.5018|13\.7/iu.test(JSON.stringify(notice)), false);
assert.equal(scheduler.occurrenceKey(row.installation_id, "zibai_shichen", snapshot.apparentSolarDate, snapshot.shichenKey), `${row.installation_id}|${snapshot.apparentSolarDate}|${snapshot.shichenKey}|zibai-zaoming-true-solar-v3`);
assert.equal(notice.payload.calculationVersion, "zibai-zaoming-true-solar-v3");
assert.match(notice.payload.referenceId, /\|zibai-zaoming-true-solar-v3$/u);
assert.equal(notice.sourceFacts.calculationVersion, "zibai-zaoming-true-solar-v3");

assert.equal(typeof scheduler.buildZibaiV2Facts, "function", "producer must expose the exact v2 facts builder");
const capableRow = {
  ...row,
  installation_id: "10000000-0000-4000-8000-000000000002",
  token_id: "20000000-0000-4000-8000-000000000002",
  zibai_payload_schema: 2,
  app_version: "1.0.0",
};
const capableOccurrenceId = "30000000-0000-4000-8000-000000000002";
const capableNotice = scheduler.buildZibaiNotice(capableRow, "zibai_shichen", snapshot, capableOccurrenceId);
assert.equal(Object.hasOwn(notice.payload, "snapshotSchema"), false,
  "a legacy installation stays exact v1 even when its app-version string looks new");
assert.equal(capableNotice.payload.snapshotSchema, 2,
  "the exact capable installation receives v2 even when its app-version string looks old");
assert.equal(capableNotice.payload.calculationVersion, "zibai-zaoming-true-solar-v3",
  "wire schema 2 carries the new boundary-latched calculation version");
assert.equal(notice.messages.length, 1);
assert.equal(capableNotice.messages.length, 1);
assert.notEqual(notice.key, capableNotice.key,
  "a mixed-device user receives distinct installation-scoped parents");
assert.deepEqual(capableNotice.payload.month.palaces, snapshot.month.palaces);
assert.deepEqual(capableNotice.payload.day.palaces, snapshot.day.palaces);
assert.deepEqual(capableNotice.payload.shichen.palaces, snapshot.shichen.palaces);
assert.equal(capableNotice.payload.sectors.length, 9);
assert.equal(capableNotice.messages[0].data, capableNotice.payload,
  "provider reservation and durable parent share the same immutable v2 payload");

const dailyCapable = scheduler.buildZibaiNotice(
  capableRow,
  "zibai_daily",
  snapshot,
  "30000000-0000-4000-8000-000000000003",
);
assert.equal(dailyCapable.payload.snapshotSchema, 2);
assert.equal(dailyCapable.payload.shichen, null, "daily v2 never samples a shichen layer");
assert.equal(dailyCapable.payload.day.startAt, snapshot.day.startAt);
assert.equal(dailyCapable.payload.day.endAt, snapshot.day.endAt);
assert.equal(dailyCapable.payload.month.startAt, snapshot.month.startAt);
assert.equal(dailyCapable.payload.month.endAt, snapshot.month.endAt);
assert.ok(dailyCapable.payload.sectors.every((sector: { shichen: number | null }) => sector.shichen === null));

let claimSql = "";
const loaded = await scheduler.loadClaimContext({
  async query(sql: string) {
    claimSql = sql;
    return { rows: [capableRow] };
  },
}, {
  user_id: row.user_id,
  installation_id: capableRow.installation_id,
  lease_token: "40000000-0000-4000-8000-000000000001",
});
assert.equal(loaded.zibai_payload_schema, 2);
assert.match(claimSql, /t\.zibai_payload_schema/u,
  "claim context selects capability from the exact installation token before reservation");
assert.doesNotMatch(claimSql, /app_version/u, "claim context never infers schema from app version");

const dailyWindow = solarDayWindow(at, 100.5018);
assert.ok(dailyWindow.end.getTime() - dailyWindow.start.getTime() > 23.9 * 3_600_000);
assert.ok(dailyWindow.end.getTime() - dailyWindow.start.getTime() < 24.1 * 3_600_000);

console.log("ZIBAI_SCHEDULER_OK");
