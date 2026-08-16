const payload = require("./notification-payload.cjs");

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

function buildZibaiCopy(localeInput, event, snapshot) {
  const locale = payload.normalizedLocale(localeInput);
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
