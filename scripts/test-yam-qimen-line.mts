import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const yam = require("./mobile-yam-push-cron.cjs");
const fixture = JSON.parse(readFileSync("test-fixtures/notifications/task3-source-results.sanitized.json", "utf8"));

let pass = 0;
function ok(name: string, condition: unknown) {
  assert.ok(condition, name);
  pass += 1;
  console.log(`PASS ${name}`);
}

const source = readFileSync("scripts/mobile-yam-push-cron.cjs", "utf8");
ok("Yam scheduler has no Qimen advisory import, fetch, sample, or highlight path",
  !/qimen-notification-advisory|yamQimenHighlight|fetchQimenHighlight|qimenSample|loadQimenLocation|qimenLine/u.test(source));
ok("Yam user loading and scheduler do not use Qimen entitlement or location facts",
  !/qimen_enabled|qimenNotificationEntitlement|qimen_latitude|qimen_longitude/u.test(source));

const notice = yam.buildYamProducer({
  id: fixture.accountId,
  profile_id: fixture.profileId,
  tokens: [],
  user_timezone: fixture.timezone,
}, {
  ...fixture.yam,
  highlight: {
    validFrom: "2026-08-15T03:00:00.000Z",
    validUntil: "2026-08-15T03:30:00.000Z",
    deity: { zh: "六合" },
  },
});

assert.ok(notice, "a civil Yam window still creates a notification");
ok("Yam output never appends legacy Qimen content", !/六合/u.test(notice.historyCopies.th.body));
ok("Yam source facts contain only civil Yam occurrence facts", !("qimen" in notice.sourceFacts));
ok("Yam occurrence expiry remains the civil window end", notice.sourceFacts.eventEndAt === "2026-08-15T04:00:00.000Z");
assert.deepEqual(yam.civilYamRangeWindow("2026-08-19", "23:00-01:00", "Asia/Bangkok"), {
  startAt: "2026-08-19T16:00:00.000Z",
  endAt: "2026-08-19T18:00:00.000Z",
}, "a cross-midnight Yam retains its following-civil-date ending instant");
assert.deepEqual(yam.civilYamRangeWindow("2026-11-01", "01:00-03:00", "America/New_York"), {
  startAt: "2026-11-01T05:00:00.000Z",
  endAt: "2026-11-01T08:00:00.000Z",
}, "a Yam civil range retains its elapsed span across a DST fallback");
ok("Yam keeps its localized core copy", notice.historyCopies.th.body.includes("เหมาะลงมือเรื่องสำคัญ")
  && notice.historyCopies.en.body.includes("suitable for important action")
  && notice.historyCopies.zh.body.includes("適合處理重要事項"));
ok("forced-clock diagnostics remain dry-run only", source.includes("DRY && /^\\d{2}:\\d{2}$/.test(FORCE_TIME)"));

console.log(`[test-yam-qimen-line] ผ่าน ${pass}`);
