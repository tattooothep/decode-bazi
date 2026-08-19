import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const qimen = require("../src/lib/qimen-notification-advisory.cjs");
const shichen = ["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"];

const fixtures = [
  { date: "2026-08-19", time: "08:00", timezone: "Asia/Bangkok", instant: "2026-08-19T01:00:00.000Z", lat: 13.7563, lng: 100.5018 },
  { date: "2026-03-08", time: "01:30", timezone: "America/New_York", instant: "2026-03-08T06:30:00.000Z", lat: 40.7128, lng: -74.006 },
  { date: "2026-11-01", time: "01:30", timezone: "America/New_York", instant: "2026-11-01T05:30:00.000Z", lat: 40.7128, lng: -74.006 },
  { date: "2026-08-19", time: "08:00", timezone: "Asia/Tokyo", instant: "2026-08-18T23:00:00.000Z", lat: 35.6762, lng: 139.6503 },
  { date: "2026-09-06", time: "01:30", timezone: "America/Santiago", instant: "2026-09-06T04:30:00.000Z", lat: -33.4489, lng: -70.6693 },
];

for (const fixture of fixtures) {
  const advisory = await qimen.fetchCanonicalQimenAdvisory(fixture);
  assert.ok(advisory, `${fixture.timezone}: canonical engine must return a complete advisory`);
  assert.equal(advisory.purpose, "travel");
  assert.equal(advisory.profileId, 1);
  assert.equal(advisory.school, "chaibu");
  assert.equal(advisory.systemType, "hour");
  assert.ok(Date.parse(advisory.validFrom) <= Date.parse(advisory.inputAt));
  assert.ok(Date.parse(advisory.validUntil) > Date.parse(advisory.inputAt));
  const durationMinutes = (Date.parse(advisory.validUntil) - Date.parse(advisory.validFrom)) / 60_000;
  assert.ok(durationMinutes >= 59 && durationMinutes <= 181, `${fixture.timezone}: DST-aware true-solar shichen must remain bounded`);
  assert.ok(Math.abs(Date.parse(advisory.correctedAt) - Date.parse(advisory.inputAt)
    - advisory.correctionMinutes * 60_000) < 1_500);
  const correctedHour = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: fixture.timezone, hour: "2-digit", hourCycle: "h23",
  }).format(new Date(advisory.correctedAt)));
  assert.equal(advisory.shichenKey, shichen[correctedHour === 23 ? 0 : Math.floor((correctedHour + 1) / 2)],
    `${fixture.timezone}: validity window must use the engine's corrected true-solar hour`);
  assert.equal(qimen.trueSolarShichenWindow({
    timezone: fixture.timezone, longitude: fixture.lng, instant: new Date(Date.parse(advisory.validFrom) + 1_000),
  }).shichenKey, advisory.shichenKey);
  assert.notEqual(qimen.trueSolarShichenWindow({
    timezone: fixture.timezone, longitude: fixture.lng, instant: new Date(Date.parse(advisory.validFrom) - 1_000),
  }).shichenKey, advisory.shichenKey);
  assert.ok(advisory.deity.code && advisory.deity.zh && advisory.door.code && advisory.door.zh
    && advisory.star.code && advisory.star.zh, `${fixture.timezone}: deity, door and star identities must be complete`);
  assert.ok("quality" in advisory.deity && "quality" in advisory.door && "quality" in advisory.star,
    `${fixture.timezone}: component quality facts must be retained`);
  assert.equal(advisory.wangXiangOrder.length, 5, `${fixture.timezone}: canonical 旺相休囚死 order must be retained`);
  assert.match(advisory.door.vigor, /^[旺相休囚死]$/u);
  assert.match(advisory.star.vigor, /^[旺相休囚死]$/u);
  for (const locale of ["th", "en", "zh"]) {
    const copy = qimen.buildQimenStandaloneCopy(advisory, locale);
    assert.ok(copy.title.length <= 120 && copy.body.length <= 400);
    assert.match(copy.body, new RegExp(advisory.deity.zh, "u"));
    assert.match(copy.body, new RegExp(advisory.door.zh, "u"));
    assert.match(copy.body, new RegExp(advisory.star.zh, "u"));
    if (advisory.recommendation === "caution") {
      assert.doesNotMatch(`${copy.title} ${copy.body}`, /ทิศดีสุด|Best direction|最吉方/u);
    }
  }
}

console.log(`QIMEN_NOTIFICATION_ENGINE_INTEGRATION_OK fixtures=${fixtures.length}`);
