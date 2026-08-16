import assert from "node:assert/strict";
import copy from "../src/lib/zibai-notification-copy.cjs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import push from "../src/lib/push-send.cjs";

const focus = [
  { star: 1, dayDirection: "N", dayRelation: "same-element", shichenDirection: "N", shichenRelation: "same-element", overlaps: true },
  { star: 2, dayDirection: "W", dayRelation: "palace-generates-star", shichenDirection: "W", shichenRelation: "palace-generates-star", overlaps: true },
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
  assert.ok(full.body.length >= 150);
  for (const star of ["1", "2", "5", "9"]) assert.ok(full.body.includes(star) || full.body.includes(({ 1: "一", 2: "二", 5: "五", 9: "九" } as const)[star as "1"]));
  assert.ok(!/Period\s*9|九運|ดวงกำเนิด|ผังบ้าน|Qi Men|ฉีเหมิน/iu.test(full.body));
  assert.ok(!/13\.7|100\.5|latitude|longitude/iu.test(JSON.stringify(full)));
  if (locale !== "zh") assert.equal(full.body.includes("。"), false, "Thai/English copy must use native-readable punctuation");
  assert.ok(full.body.length <= 400, `${locale} shichen body must fit the durable/provider contract without truncation`);
  assert.ok(full.body.includes("02:07") && full.body.includes("04:07"), `${locale} shichen copy must state the immutable bounded period`);
  const hidden = copy.zibaiProviderCopy(locale, false, "zibai_shichen", snapshot);
  assert.ok(!/一白|二黑|五黃|九紫|เหนือ|ตะวัน|north|south|east|west|北|南|東|西/iu.test(hidden.body));
}

const durableCopies = delivery.localizedHistoryCopies((locale: string) => (
  copy.buildZibaiCopy(locale, "zibai_shichen", snapshot)
));
for (const locale of ["th", "en", "zh"] as const) {
  const durable = durableCopies[locale];
  const provider = push.prepareMessage({
    category: "zibai",
    title: durable.title,
    body: durable.body,
    data: { event: "zibai_shichen" },
  }, "expo");
  assert.equal(provider.title, durable.title);
  assert.equal(provider.body, durable.body,
    `${locale} provider copy must equal durable history copy without hidden truncation`);
  for (const star of ["1", "2", "5", "9"]) {
    assert.ok(durable.body.includes(star) || durable.body.includes(({ 1: "一", 2: "二", 5: "五", 9: "九" } as const)[star as "1"]),
      `${locale} durable/provider copy must retain star ${star}`);
  }
}

const daily = copy.buildZibaiCopy("th", "zibai_daily", {
  ...snapshot,
  shichenKey: null,
  focus: focus.map((item) => ({ ...item, shichenDirection: null, shichenRelation: null, overlaps: false })),
});
assert.match(daily.title, /จื่อไป๋ประจำวัน/u);
assert.match(daily.body, /ผัง 9 วัง/u);
assert.ok(daily.body.length <= 400, "daily body must fit the durable/provider contract without truncation");
assert.match(daily.body, /02:07[\s\S]*04:07/u, "daily copy must state its immutable true-solar day window");

console.log("ZIBAI_NOTIFICATION_COPY_OK");
