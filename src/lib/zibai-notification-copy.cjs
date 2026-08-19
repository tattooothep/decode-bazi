const payload = require("./notification-payload.cjs");
const zibaiRuleRuntime = require("./zibai-three-layer-runtime.cjs");

const DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"]);
const PRACTICAL_STARS = Object.freeze([1, 2, 5, 9]);

const SHICHEN = Object.freeze({
  zi: ["子", "23:00–01:00"], chou: ["丑", "01:00–03:00"], yin: ["寅", "03:00–05:00"],
  mao: ["卯", "05:00–07:00"], chen: ["辰", "07:00–09:00"], si: ["巳", "09:00–11:00"],
  wu: ["午", "11:00–13:00"], wei: ["未", "13:00–15:00"], shen: ["申", "15:00–17:00"],
  you: ["酉", "17:00–19:00"], xu: ["戌", "19:00–21:00"], hai: ["亥", "21:00–23:00"],
});

const STAR = Object.freeze({
  th: Object.freeze({ 1: "1 หนึ่งขาว", 2: "2 สองดำ", 5: "5 ห้าเหลือง", 9: "9 เก้าม่วง" }),
  en: Object.freeze({ 1: "1 White", 2: "2 Black", 5: "5 Yellow", 9: "9 Purple" }),
  zh: Object.freeze({ 1: "一白", 2: "二黑", 5: "五黃", 9: "九紫" }),
});
const DIR = Object.freeze({
  th: Object.freeze({ N: "เหนือ", NE: "ตะวันออกเฉียงเหนือ", E: "ตะวันออก", SE: "ตะวันออกเฉียงใต้", S: "ใต้", SW: "ตะวันตกเฉียงใต้", W: "ตะวันตก", NW: "ตะวันตกเฉียงเหนือ", C: "กลางพื้นที่" }),
  en: Object.freeze({ N: "north", NE: "northeast", E: "east", SE: "southeast", S: "south", SW: "southwest", W: "west", NW: "northwest", C: "the centre" }),
  zh: Object.freeze({ N: "北方", NE: "東北", E: "東方", SE: "東南", S: "南方", SW: "西南", W: "西方", NW: "西北", C: "中宮" }),
});
const RELATION = Object.freeze({
  th: Object.freeze({
    "generates-palace": "ดาวส่งพลังสู่วัง",
    "controls-palace": "ดาวข่มวัง ใช้อย่างพอดี",
    "palace-generates-star": "วังหนุนดาวให้เด่นขึ้น",
    "same-element": "ดาว–วังธาตุเดียวกัน พลังเด่น",
    "palace-controls-star": "วังข่มดาว ใช้อย่างระวัง",
  }),
  en: Object.freeze({
    "generates-palace": "star feeds sector",
    "controls-palace": "star checks sector; moderate",
    "palace-generates-star": "sector strengthens star",
    "same-element": "same element; reinforced",
    "palace-controls-star": "sector checks star; use care",
  }),
  zh: Object.freeze({
    "generates-palace": "星生宮，星氣付出",
    "controls-palace": "星剋宮，宜節制",
    "palace-generates-star": "宮生星，星氣得助增強",
    "same-element": "星宮比和，特性突出",
    "palace-controls-star": "宮剋星，宜謹慎",
  }),
});

function recommendation(locale, star) {
  const table = {
    th: {
      1: "วางแผน ติดต่อ ทำงานอย่างนิ่งชัด",
      2: "จัดระเบียบ พักให้พอ ไม่โหม",
      5: "งดเจาะ ตอก รื้อ และแรงสั่น",
      9: "ใช้แสง งานสร้างสรรค์ และสื่อสาร",
    },
    en: {
      1: "plan, communicate, work calmly",
      2: "organize, rest; avoid overwork",
      5: "keep quiet; no drilling or vibration",
      9: "use light, creativity and communication",
    },
    zh: {
      1: "宜規劃、溝通及沉著工作",
      2: "宜整潔休息，勿過度勞累",
      5: "宜靜，忌鑽敲拆動與震動",
      9: "宜明亮、創作與溝通",
    },
  };
  return table[locale][star];
}

function line(locale, item, event) {
  const direction = event === "zibai_shichen" ? item.shichenDirection : item.dayDirection;
  const relation = event === "zibai_shichen" ? item.shichenRelation : item.dayRelation;
  const overlap = item.overlaps ? (locale === "zh" ? "·同宮" : locale === "th" ? "·ซ้อน" : "·same") : "";
  return `${STAR[locale][item.star]} ${DIR[locale][direction]}: ${RELATION[locale][relation]}; ${recommendation(locale, item.star)}${overlap}`;
}

function immutableWindow(snapshot, daily) {
  const start = new Date(snapshot.startAt);
  const end = new Date(snapshot.endAt);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || end <= start) {
    throw new TypeError("zibai_copy_window_invalid");
  }
  return daily
    ? `${snapshot.startAt.slice(5, 16).replace("T", " ")}→${snapshot.endAt.slice(5, 16).replace("T", " ")}`
    : `${snapshot.startAt.slice(11, 16)}–${snapshot.endAt.slice(11, 16)}`;
}

function directionForStar(palaces, star) {
  return DIRECTIONS.find((direction) => palaces[direction] === star) || null;
}

function layeredSnapshot(snapshot) {
  return snapshot?.month?.palaces && snapshot?.day?.palaces
    && (snapshot?.shichen?.palaces || snapshot?.shichen === null);
}

function action(locale, actionCode) {
  const table = {
    th: {
      plan_communicate_calmly: "วางแผน/สื่อสารอย่างนิ่ง",
      reduce_strain_rest_keep_orderly: "จัดระเบียบ/พักให้พอ",
      keep_sector_calm_avoid_drilling_demolition_vibration: "ให้นิ่ง งดเจาะ/รื้อ/สั่น",
      use_light_visibility_creativity_thoughtfully: "ใช้แสง/งานสร้างสรรค์",
      reference_only: "เปิดผังเต็มก่อนใช้",
    },
    en: {
      plan_communicate_calmly: "plan/communicate calmly",
      reduce_strain_rest_keep_orderly: "order/rest; avoid strain",
      keep_sector_calm_avoid_drilling_demolition_vibration: "calm; no drilling/demolition/vibration",
      use_light_visibility_creativity_thoughtfully: "use light/creative work",
      reference_only: "open full chart first",
    },
    zh: {
      plan_communicate_calmly: "宜規劃並沉著溝通",
      reduce_strain_rest_keep_orderly: "宜整潔休息，勿勞累",
      keep_sector_calm_avoid_drilling_demolition_vibration: "宜靜，忌鑽敲拆動與震動",
      use_light_visibility_creativity_thoughtfully: "宜明亮、創作與溝通",
      reference_only: "行動前先看完整九宮",
    },
  };
  return table[locale][actionCode];
}

function pattern(locale, reading, daily) {
  const repeatedLayer = reading.repeatedLayers[0];
  const repeatedStar = repeatedLayer ? reading[repeatedLayer]?.star : null;
  const repeatedNine = repeatedStar === 9 && reading.repeatCount > 1;
  const nineNote = repeatedNine
    ? locale === "th" ? " ไม่ใช่ยุค 9" : locale === "zh" ? " 並非九運" : " not Period 9"
    : "";
  if (reading.patternCode === "three_layer_same_star") {
    return `${locale === "th" ? "ซ้ำ 3 ชั้น" : locale === "zh" ? "三層重複" : "triple repeat"}${nineNote}`;
  }
  if (reading.patternCode === "two_layer_same_star") {
    return `${locale === "th" ? "ซ้ำ 2 ชั้น" : locale === "zh" ? "兩層重複" : "double repeat"}${nineNote}`;
  }
  if (reading.patternCode === "mixed_caution_priority") {
    return locale === "th" ? "ผสม—ยึดคำเตือนก่อน" : locale === "zh" ? "混合—警示優先" : "mixed—caution first";
  }
  if (reading.patternCode === "heightened_caution") {
    return locale === "th" ? "ย้ำคำเตือน" : locale === "zh" ? "加強警示" : "heightened caution";
  }
  if (daily) return locale === "th" ? "ดูร่วม 2 ชั้น" : locale === "zh" ? "兩層合參" : "read both layers";
  return locale === "th" ? "ดูร่วม 3 ชั้น" : locale === "zh" ? "三層合參" : "read all 3 layers";
}

function layeredLine(locale, star, reading, snapshot, daily) {
  const monthDirection = directionForStar(snapshot.month.palaces, star);
  const dayDirection = directionForStar(snapshot.day.palaces, star);
  const shichenDirection = daily ? null : directionForStar(snapshot.shichen.palaces, star);
  if (!monthDirection || !dayDirection || (!daily && !shichenDirection)) throw new TypeError("zibai_copy_snapshot_invalid");
  const positions = daily
    ? locale === "th" ? `ด/ว ${monthDirection}/${dayDirection}`
      : locale === "zh" ? `月/日 ${monthDirection}/${dayDirection}`
        : `M/D ${monthDirection}/${dayDirection}`
    : locale === "th" ? `ด/ว/ย ${monthDirection}/${dayDirection}/${shichenDirection}`
      : locale === "zh" ? `月/日/時 ${monthDirection}/${dayDirection}/${shichenDirection}`
        : `M/D/S ${monthDirection}/${dayDirection}/${shichenDirection}`;
  return `${STAR[locale][star]} ${positions}: ${pattern(locale, reading, daily)}; ${action(locale, reading.actionCode)}`;
}

function layeredPriority(reading, star) {
  if (reading.patternCode === "three_layer_same_star") return star === 5 ? 0 : 1;
  if (star === 5 || reading.warningCodes.includes("five_yellow_caution")) return 2;
  if (reading.patternCode === "mixed_caution_priority") return 3;
  if (reading.patternCode === "heightened_caution" || star === 2) return 4;
  return star === 9 ? 5 : 6;
}

function buildLayeredCopy(locale, event, snapshot) {
  const daily = event === "zibai_daily";
  const shichenKey = daily ? null : snapshot.shichen?.meta?.key ?? snapshot.shichen?.key ?? snapshot.shichenKey;
  const shichen = daily ? null : SHICHEN[shichenKey];
  if (!daily && !shichen) throw new TypeError("zibai_copy_shichen_invalid");
  const apparentSolarDate = snapshot.day?.meta?.apparentSolarDate
    ?? snapshot.day?.apparentSolarDate
    ?? snapshot.apparentSolarDate;
  const bounds = daily ? snapshot.day : snapshot.shichen;
  const window = immutableWindow(bounds, daily);
  const readings = zibaiRuleRuntime.interpretZibaiSectors(snapshot, !daily);
  const byDirection = new Map(readings.map((reading) => [reading.direction, reading]));
  const focus = PRACTICAL_STARS.map((star) => {
    const currentDirection = directionForStar(daily ? snapshot.day.palaces : snapshot.shichen.palaces, star);
    const reading = byDirection.get(currentDirection);
    if (!reading) throw new TypeError("zibai_copy_snapshot_invalid");
    return { star, reading };
  }).sort((left, right) => layeredPriority(left.reading, left.star) - layeredPriority(right.reading, right.star));
  const title = daily
    ? locale === "th" ? `จื่อไป๋ประจำวัน · ${apparentSolarDate}` : locale === "zh" ? `每日紫白 · ${apparentSolarDate}` : `Daily Zi Bai · ${apparentSolarDate}`
    : locale === "th" ? `จื่อไป๋ยาม${shichen[0]} · ${shichen[1]} เวลาสุริยะจริง`
      : locale === "zh" ? `紫白${shichen[0]}時 · 真太陽時 ${shichen[1]}`
        : `Zi Bai ${shichen[0]} shichen · true solar ${shichen[1]}`;
  const period = locale === "th" ? `ช่วง UTC ${window}` : locale === "zh" ? `UTC時段 ${window}` : `UTC window ${window}`;
  const footer = locale === "th" ? "แตะดูผัง 9 วัง" : locale === "zh" ? "點按查看完整九宮" : "Tap for full chart.";
  const lines = focus.map(({ star, reading }) => layeredLine(locale, star, reading, snapshot, daily));
  const body = `${period}\n${lines.join("\n")}\n${footer}`;
  if (body.length > 400) throw new Error(`zibai_copy_exceeds_provider_limit:${locale}:${body.length}`);
  return Object.freeze({ title, body });
}

function buildZibaiCopy(localeInput, event, snapshot) {
  const locale = payload.normalizedLocale(localeInput);
  if (layeredSnapshot(snapshot)) return buildLayeredCopy(locale, event, snapshot);
  if (!snapshot || !Array.isArray(snapshot.focus) || snapshot.focus.length !== 4) throw new TypeError("zibai_copy_snapshot_invalid");
  const daily = event === "zibai_daily";
  const shichen = daily ? null : SHICHEN[snapshot.shichenKey];
  if (!daily && !shichen) throw new TypeError("zibai_copy_shichen_invalid");
  const window = immutableWindow(snapshot, daily);
  const title = daily
    ? locale === "th" ? `จื่อไป๋ประจำวัน · ${snapshot.apparentSolarDate}` : locale === "zh" ? `每日紫白 · ${snapshot.apparentSolarDate}` : `Daily Zi Bai · ${snapshot.apparentSolarDate}`
    : locale === "th" ? `จื่อไป๋ยาม${shichen[0]} · ${shichen[1]} เวลาสุริยะจริง`
      : locale === "zh" ? `紫白${shichen[0]}時 · 真太陽時 ${shichen[1]}`
        : `Zi Bai ${shichen[0]} shichen · true solar ${shichen[1]}`;
  const lines = snapshot.focus.map((item) => line(locale, item, event));
  // startAt/endAt are immutable UTC instants. The title names the apparent-
  // solar shichen; do not mislabel these transport bounds as solar clock time.
  const period = locale === "th"
    ? `ช่วง UTC ${window}`
    : locale === "zh" ? `UTC時段 ${window}` : `UTC window ${window}`;
  const footer = locale === "th"
    ? "แตะดูผัง 9 วัง"
    : locale === "zh"
      ? "點按查看完整九宮"
      : "Tap for full chart.";
  const body = `${period}\n${lines.join("\n")}\n${footer}`;
  if (body.length > 400) throw new Error(`zibai_copy_exceeds_provider_limit:${locale}:${body.length}`);
  return Object.freeze({ title, body });
}

function zibaiProviderCopy(locale, privacyPreview, event, snapshot) {
  return payload.previewCopy("zibai", privacyPreview, buildZibaiCopy(locale, event, snapshot), locale);
}

module.exports = { buildZibaiCopy, zibaiProviderCopy };
