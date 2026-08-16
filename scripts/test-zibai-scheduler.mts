import assert from "node:assert/strict";
import scheduler from "./mobile-zibai-push-cron.cjs";
import { buildZibaiSnapshot, solarDayWindow } from "../src/lib/zibai-science.ts";

assert.equal(scheduler.inQuietHours(23 * 60, 22, 7), true);
assert.equal(scheduler.inQuietHours(7 * 60, 22, 7), false);
assert.equal(scheduler.inQuietHours(10 * 60, 8, 8), false);

const at = new Date("2026-08-16T03:00:00.000Z");
const snapshot = buildZibaiSnapshot(at, 100.5018);
const row = {
  user_id: "00000000-0000-4000-8000-000000000001",
  installation_id: "10000000-0000-4000-8000-000000000001",
  token_id: "20000000-0000-4000-8000-000000000001",
  device_push_token: "fixture-native-token", device_token_type: "fcm", expo_push_token: "ExponentPushToken[fixture]",
  platform: "android", token_locale: "th",
  privacy_preview: false,
};
const occurrenceId = "30000000-0000-4000-8000-000000000001";
const notice = scheduler.buildZibaiNotice(row, "zibai_shichen", snapshot, occurrenceId);
assert.equal(notice.kind, "zibai");
assert.equal(notice.messages.length, 1);
assert.equal(notice.messages[0].category, "zibai");
assert.equal(notice.payload.kind, "zibai");
assert.equal(notice.zibaiOccurrenceId, occurrenceId);
assert.equal(notice.messages[0].title, "การแจ้งเตือนส่วนตัว");
assert.doesNotMatch(notice.messages[0].body, /หนึ่งขาว|สองดำ|ห้าเหลือง|เก้าม่วง/u);
assert.match(notice.historyCopies.th.body, /หนึ่งขาว/u, "authenticated history keeps the useful full copy");
const optedInPreview = scheduler.buildZibaiNotice({ ...row, privacy_preview: true }, "zibai_shichen", snapshot, occurrenceId);
assert.match(optedInPreview.messages[0].body, /หนึ่งขาว/u);
assert.equal(/latitude|longitude|100\.5018|13\.7/iu.test(JSON.stringify(notice)), false);
assert.equal(scheduler.occurrenceKey(row.installation_id, "zibai_shichen", snapshot.apparentSolarDate, snapshot.shichenKey), `${row.installation_id}|${snapshot.apparentSolarDate}|${snapshot.shichenKey}|zibai-zaoming-true-solar-v1`);

const dailyWindow = solarDayWindow(at, 100.5018);
assert.ok(dailyWindow.end.getTime() - dailyWindow.start.getTime() > 23.9 * 3_600_000);
assert.ok(dailyWindow.end.getTime() - dailyWindow.start.getTime() < 24.1 * 3_600_000);

console.log("ZIBAI_SCHEDULER_OK");
