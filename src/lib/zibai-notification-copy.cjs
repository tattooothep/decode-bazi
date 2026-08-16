const payload = require("./notification-payload.cjs");

const SHICHEN = Object.freeze({
  zi: ["子", "23:00–01:00"], chou: ["丑", "01:00–03:00"], yin: ["寅", "03:00–05:00"],
  mao: ["卯", "05:00–07:00"], chen: ["辰", "07:00–09:00"], si: ["巳", "09:00–11:00"],
  wu: ["午", "11:00–13:00"], wei: ["未", "13:00–15:00"], shen: ["申", "15:00–17:00"],
  you: ["酉", "17:00–19:00"], xu: ["戌", "19:00–21:00"], hai: ["亥", "21:00–23:00"],
});

const STAR = Object.freeze({
  th: Object.freeze({ 1: "一白 หนึ่งขาว", 2: "二黑 สองดำ", 5: "五黃 ห้าเหลือง", 9: "九紫 เก้าม่วง" }),
  en: Object.freeze({ 1: "1 One White", 2: "2 Two Black", 5: "5 Five Yellow", 9: "9 Nine Purple" }),
  zh: Object.freeze({ 1: "一白", 2: "二黑", 5: "五黃", 9: "九紫" }),
});
const DIR = Object.freeze({
  th: Object.freeze({ N: "เหนือ", NE: "ตะวันออกเฉียงเหนือ", E: "ตะวันออก", SE: "ตะวันออกเฉียงใต้", S: "ใต้", SW: "ตะวันตกเฉียงใต้", W: "ตะวันตก", NW: "ตะวันตกเฉียงเหนือ", C: "กลางพื้นที่" }),
  en: Object.freeze({ N: "north", NE: "northeast", E: "east", SE: "southeast", S: "south", SW: "southwest", W: "west", NW: "northwest", C: "the centre" }),
  zh: Object.freeze({ N: "北方", NE: "東北", E: "東方", SE: "東南", S: "南方", SW: "西南", W: "西方", NW: "西北", C: "中宮" }),
});
const RELATION = Object.freeze({
  th: Object.freeze({
    "generates-palace": "ดาว生ธาตุวัง พลังถูกส่งไปสู่พื้นที่",
    "controls-palace": "ดาว剋ธาตุวัง พลังต้านกัน ควรใช้พื้นที่อย่างพอดี",
    "drains-star": "วัง洩พลังดาว ผลของดาวอ่อนลงและกระจายออก",
    "same-element": "ดาวกับวังเป็นธาตุเดียวกัน พลังซ้อนและเด่นขึ้น",
    "palace-controls-star": "ธาตุวัง剋ดาว พลังดาวถูกจำกัด ควรทำอย่างระมัดระวัง",
  }),
  en: Object.freeze({
    "generates-palace": "the star generates the palace element, feeding energy into this sector",
    "controls-palace": "the star controls the palace element; use the sector in moderation",
    "drains-star": "the palace drains the star, dispersing and softening its effect",
    "same-element": "star and palace share an element, reinforcing the pattern",
    "palace-controls-star": "the palace controls the star, so proceed carefully and keep activity measured",
  }),
  zh: Object.freeze({
    "generates-palace": "星生宮，能量流入此方",
    "controls-palace": "星剋宮，宜節制使用此方",
    "drains-star": "宮洩星氣，作用較分散柔和",
    "same-element": "星宮比和，特性較為突出",
    "palace-controls-star": "宮剋星，宜謹慎並減少強烈活動",
  }),
});

function recommendation(locale, star) {
  const table = {
    th: {
      1: "เหมาะกับการคิด วางแผน ติดต่อ หรือทำงานที่ต้องการความนิ่งและความชัดเจน",
      2: "ดูแลความเป็นระเบียบ ความสะอาด และพักร่างกายให้พอ หลีกเลี่ยงการโหมงานในทิศนี้",
      5: "ลดเสียง การสั่นสะเทือน การเจาะ ตอก หรือรื้อในทิศนี้ และใช้พื้นที่อย่างสงบ",
      9: "เหมาะกับพื้นที่สว่าง งานสร้างสรรค์ การสื่อสาร และการทำสิ่งให้เห็นผลอย่างมีสติ",
    },
    en: {
      1: "Good for planning, communication and calm work that benefits from clarity.",
      2: "Keep the area orderly, rest adequately and avoid overexertion in this direction.",
      5: "Keep this direction quiet; avoid drilling, hammering, demolition and strong vibration.",
      9: "Good for light, creative work, communication and making progress visible with care.",
    },
    zh: {
      1: "適合規劃、溝通，以及需要沉著清晰的工作。",
      2: "保持整潔並充分休息，避免在此方過度勞累。",
      5: "此方宜靜，避免鑽孔、敲打、拆動及強烈震動。",
      9: "適合明亮空間、創作、溝通與穩健地推動成果。",
    },
  };
  return table[locale][star];
}

function line(locale, item, event) {
  const direction = event === "zibai_shichen" ? item.shichenDirection : item.dayDirection;
  const relation = event === "zibai_shichen" ? item.shichenRelation : item.dayRelation;
  const overlap = item.overlaps
    ? locale === "th" ? " ดาววัน–ดาวยามซ้อนทิศเดียวกัน จึงควรให้น้ำหนักกับคำแนะนำนี้มากขึ้น"
      : locale === "zh" ? " 日星與時星同宮，這項提示值得優先留意"
        : " The day and shichen layers overlap here, so give this guidance extra attention."
    : "";
  const separator = locale === "zh" ? "：" : " — ";
  const sentenceBreak = locale === "zh" ? "。" : locale === "th" ? " · " : ". ";
  return `${STAR[locale][item.star]} ${DIR[locale][direction]}${separator}${RELATION[locale][relation]}${sentenceBreak}${recommendation(locale, item.star)}${overlap}`;
}

function buildZibaiCopy(localeInput, event, snapshot) {
  const locale = payload.normalizedLocale(localeInput);
  if (!snapshot || !Array.isArray(snapshot.focus) || snapshot.focus.length !== 4) throw new TypeError("zibai_copy_snapshot_invalid");
  const daily = event === "zibai_daily";
  const shichen = daily ? null : SHICHEN[snapshot.shichenKey];
  if (!daily && !shichen) throw new TypeError("zibai_copy_shichen_invalid");
  const title = daily
    ? locale === "th" ? `จื่อไป๋ประจำวัน · ${snapshot.apparentSolarDate}` : locale === "zh" ? `每日紫白 · ${snapshot.apparentSolarDate}` : `Daily Zi Bai · ${snapshot.apparentSolarDate}`
    : locale === "th" ? `จื่อไป๋ยาม${shichen[0]} · ${shichen[1]} เวลาสุริยะจริง`
      : locale === "zh" ? `紫白${shichen[0]}時 · 真太陽時 ${shichen[1]}`
        : `Zi Bai ${shichen[0]} shichen · true solar ${shichen[1]}`;
  const lines = snapshot.focus.map((item) => line(locale, item, event));
  const footer = locale === "th"
    ? "แตะเพื่อดูผัง 9 วังครบ ความสัมพันธ์ธาตุ และช่วงเวลาที่คำนวณจากเวลาสุริยะจริง"
    : locale === "zh"
      ? "點按查看完整九宮、五行關係及真太陽時計算時段"
      : "Tap for the complete nine-palace chart, elemental relationships and true-solar time window.";
  return Object.freeze({ title, body: `${lines.join("\n")}\n${footer}` });
}

function zibaiProviderCopy(locale, privacyPreview, event, snapshot) {
  return payload.previewCopy("zibai", privacyPreview, buildZibaiCopy(locale, event, snapshot), locale);
}

module.exports = { buildZibaiCopy, zibaiProviderCopy };
