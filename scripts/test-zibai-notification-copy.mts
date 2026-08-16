import assert from "node:assert/strict";
import copy from "../src/lib/zibai-notification-copy.cjs";

const focus = [
  { star: 1, dayDirection: "N", dayRelation: "same-element", shichenDirection: "N", shichenRelation: "same-element", overlaps: true },
  { star: 2, dayDirection: "W", dayRelation: "drains-star", shichenDirection: "W", shichenRelation: "drains-star", overlaps: true },
  { star: 5, dayDirection: "SW", dayRelation: "same-element", shichenDirection: "SW", shichenRelation: "same-element", overlaps: true },
  { star: 9, dayDirection: "E", dayRelation: "generates-palace", shichenDirection: "E", shichenRelation: "generates-palace", overlaps: true },
];
const snapshot = {
  apparentSolarDate: "2026-08-16", shichenKey: "si",
  startAt: "2026-08-16T02:07:00.000Z", endAt: "2026-08-16T04:07:00.000Z", focus,
};

for (const locale of ["th", "en", "zh"]) {
  const full = copy.buildZibaiCopy(locale, "zibai_shichen", snapshot);
  assert.ok(full.title.length >= 8);
  assert.ok(full.body.length >= 180);
  for (const star of ["1", "2", "5", "9"]) assert.ok(full.body.includes(star) || full.body.includes(({ 1: "一", 2: "二", 5: "五", 9: "九" } as const)[star as "1"]));
  assert.ok(!/Period\s*9|九運|ดวงกำเนิด|ผังบ้าน|Qi Men|ฉีเหมิน/iu.test(full.body));
  assert.ok(!/13\.7|100\.5|latitude|longitude/iu.test(JSON.stringify(full)));
  if (locale !== "zh") assert.equal(full.body.includes("。"), false, "Thai/English copy must use native-readable punctuation");
  const hidden = copy.zibaiProviderCopy(locale, false, "zibai_shichen", snapshot);
  assert.ok(!/一白|二黑|五黃|九紫|เหนือ|ตะวัน|north|south|east|west|北|南|東|西/iu.test(hidden.body));
}

const daily = copy.buildZibaiCopy("th", "zibai_daily", {
  ...snapshot,
  shichenKey: null,
  focus: focus.map((item) => ({ ...item, shichenDirection: null, shichenRelation: null, overlaps: false })),
});
assert.match(daily.title, /จื่อไป๋ประจำวัน/u);
assert.match(daily.body, /ผัง 9 วัง/u);

console.log("ZIBAI_NOTIFICATION_COPY_OK");
