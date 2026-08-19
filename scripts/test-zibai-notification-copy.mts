import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import copy from "../src/lib/zibai-notification-copy.cjs";
import delivery from "../src/lib/mobile-notification-delivery.cjs";
import push from "../src/lib/push-send.cjs";
import { flyStars } from "../src/lib/fengshui-luxing.ts";
import { solarDayWindow, starPalaceRelation } from "../src/lib/zibai-science.ts";

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

const threeLayerFixture = JSON.parse(readFileSync("scripts/fixtures/zibai-three-layer-cases.json", "utf8"));
function layeredSnapshot(testCase: any) {
  return {
    snapshotSchema: 2,
    apparentSolarDate: "2026-08-16",
    shichenKey: "si",
    startAt: "2026-08-16T02:07:00.000Z",
    endAt: "2026-08-16T04:07:00.000Z",
    month: {
      ...testCase.month,
      startAt: "2026-08-07T11:42:43.000Z",
      endAt: "2026-09-07T14:41:16.000Z",
    },
    day: {
      ...testCase.day,
      apparentSolarDate: "2026-08-16",
      startAt: "2026-08-15T16:00:00.000Z",
      endAt: "2026-08-16T16:00:00.000Z",
    },
    shichen: {
      ...testCase.shichen,
      key: "si",
      startAt: "2026-08-16T02:07:00.000Z",
      endAt: "2026-08-16T04:07:00.000Z",
    },
  };
}

const tripleSnapshot = layeredSnapshot(threeLayerFixture.cases[0]);
const mixedSnapshot = layeredSnapshot(threeLayerFixture.cases[1]);
const differingLayerSnapshot = layeredSnapshot({
  month: { palaces: { N: 1, NE: 3, E: 4, SE: 9, S: 6, SW: 5, W: 8, NW: 2, C: 7 } },
  day: { palaces: { N: 1, NE: 3, E: 4, SE: 9, S: 6, SW: 5, W: 8, NW: 7, C: 2 } },
  shichen: { palaces: { N: 3, NE: 4, E: 5, SE: 1, S: 6, SW: 7, W: 8, NW: 9, C: 2 } },
});
const differingLayerCopy = copy.buildZibaiCopy("en", "zibai_shichen", differingLayerSnapshot);
assert.match(differingLayerCopy.body, /1 White M\/D\/S N\/N\/SE: double repeat not Period 9; plan\/communicate calmly/u,
  "repeat-nine disclosure follows the kernel's repeated layer evidence, not the current focus star");
assert.match(differingLayerCopy.body, /9 Purple M\/D\/S SE\/SE\/NW: mixed—caution first; order\/rest; avoid strain/u,
  "mixed guidance uses the kernel-selected current-layer caution action");
for (const locale of ["th", "en", "zh"] as const) {
  const triple = copy.buildZibaiCopy(locale, "zibai_shichen", tripleSnapshot);
  const mixed = copy.buildZibaiCopy(locale, "zibai_shichen", mixedSnapshot);
  assert.ok(triple.body.length <= 400 && mixed.body.length <= 400,
    `${locale} three-layer durable/provider copy stays within 400 characters without truncation`);
  assert.match(triple.body, locale === "th" ? /ซ้ำ 3 ชั้น/u : locale === "zh" ? /三層重複/u : /triple repeat/u);
  assert.match(triple.body, locale === "th" ? /ไม่ใช่ยุค 9/u : locale === "zh" ? /並非九運/u : /not Period 9/u,
    `${locale} Nine Purple repetition explicitly rejects Period-9 conflation`);
  assert.match(mixed.body, locale === "th" ? /คำเตือนก่อน/u : locale === "zh" ? /警示優先/u : /caution first/u);
  assert.match(mixed.body, locale === "th" ? /5 ห้าเหลือง/u : locale === "zh" ? /五黃/u : /5 Yellow/u);
  const hidden = copy.zibaiProviderCopy(locale, false, "zibai_shichen", mixedSnapshot);
  assert.doesNotMatch(hidden.body, /9|5|north|เหนือ|北方|caution|คำเตือน|警示/iu,
    `${locale} privacy-off provider copy remains generic`);
  const dailyLayered = copy.buildZibaiCopy(locale, "zibai_daily", {
    ...mixedSnapshot,
    shichen: null,
  });
  assert.doesNotMatch(dailyLayered.body, /3 ชั้น|3 layers|三層/u,
    `${locale} daily copy never implies that a shichen layer was sampled`);
}

const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const;
const canonicalMaps = Array.from({ length: 9 }, (_, index) => index + 1)
  .flatMap((center) => [flyStars(center, true), flyStars(center, false)]);
function canonicalFocus(dayPalaces: Record<string, number>, shichenPalaces: Record<string, number> | null) {
  return [1, 2, 5, 9].map((star) => {
    const dayDirection = directions.find((direction) => dayPalaces[direction] === star)!;
    const shichenDirection = shichenPalaces
      ? directions.find((direction) => shichenPalaces[direction] === star)!
      : null;
    return {
      star, dayDirection, dayRelation: starPalaceRelation(star, dayDirection),
      shichenDirection,
      shichenRelation: shichenDirection ? starPalaceRelation(star, shichenDirection) : null,
      overlaps: shichenDirection !== null && dayDirection === shichenDirection,
    };
  });
}

for (const locale of ["th", "en", "zh"]) {
  for (const dayPalaces of canonicalMaps) {
    const dailyVariant = copy.buildZibaiCopy(locale, "zibai_daily", {
      ...snapshot, shichenKey: null, endAt: "2026-08-17T02:07:00.000Z",
      focus: canonicalFocus(dayPalaces, null),
    });
    assert.ok(dailyVariant.body.length <= 400, `${locale} canonical daily copy must fit provider bounds`);
    for (const shichenPalaces of canonicalMaps) {
      const variant = copy.buildZibaiCopy(locale, "zibai_shichen", {
        ...snapshot, focus: canonicalFocus(dayPalaces, shichenPalaces),
      });
      assert.ok(variant.body.length <= 400, `${locale} every canonical shichen map must fit provider bounds`);
      const identities = locale === "th" ? ["1 หนึ่งขาว", "2 สองดำ", "5 ห้าเหลือง", "9 เก้าม่วง"]
        : locale === "zh" ? ["一白", "二黑", "五黃", "九紫"]
          : ["1 White", "2 Black", "5 Yellow", "9 Purple"];
      for (const identity of identities) assert.ok(variant.body.includes(identity), `${locale} must name ${identity}`);
      assert.doesNotMatch(variant.body, /UTC[^\n]*(?:true solar|เวลาสุริยะจริง|真太陽時)/iu,
        "UTC bounds must never be mislabeled as apparent-solar clock time");
    }
  }
}

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

const realDailyWindow = solarDayWindow(new Date("2026-08-16T01:00:00.000Z"), 100.5);
const daily = copy.buildZibaiCopy("th", "zibai_daily", {
  ...snapshot,
  shichenKey: null,
  startAt: realDailyWindow.start.toISOString(), endAt: realDailyWindow.end.toISOString(),
  focus: focus.map((item) => ({ ...item, shichenDirection: null, shichenRelation: null, overlaps: false })),
});
assert.match(daily.title, /จื่อไป๋ประจำวัน/u);
assert.match(daily.body, /ผัง 9 วัง/u);
assert.ok(daily.body.length <= 400, "daily body must fit the durable/provider contract without truncation");
assert.ok(daily.body.includes(realDailyWindow.start.toISOString().slice(5, 16).replace("T", " ")));
assert.ok(daily.body.includes(realDailyWindow.end.toISOString().slice(5, 16).replace("T", " ")),
  "daily copy must show distinct dates for its real 24-hour immutable window");

console.log("ZIBAI_NOTIFICATION_COPY_OK");
