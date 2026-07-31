/**
 * วันไหว้และเทศกาลจีน — คำนวณจากปฏิทินจันทรคติจริง ไม่ใช่ตารางที่พิมพ์ไว้ตายตัว
 *
 * ── ทำไมคำนวณ ไม่ใช้ตารางแช่แข็ง (30 ก.ค. 69) ───────────────
 * วันไหว้จีนผูกกับ **ปฏิทินจันทรคติ** ซึ่งเลื่อนทุกปีและมีเดือนอธิกมาส
 * ตารางที่พิมพ์ไว้จะผิดทันทีที่ข้ามปี และไม่มีใครรู้ตัว
 * `tyme4ts` คำนวณจันทรคติจริงอยู่แล้ว (ตัวเดียวกับที่ทั้งระบบใช้คิดเสาวัน)
 *
 * ── สองชั้นที่รวมกัน ────────────────────────────────────────
 * ① เทศกาลจันทรคติที่ตัวคำนวณมีอยู่แล้ว 13 วัน/ปี (ตรุษจีน สารทจีน ไหว้พระจันทร์ ฯลฯ)
 * ② **วันไหว้เจ้าที่คนไทยเชื้อสายจีนถือจริง** ซึ่งตัวคำนวณไม่มีให้
 *    · 初一 / 十五 ทุกเดือน — วันพระจีน ไหว้เจ้าประจำ
 *    · 正月初九 ไหว้ฟ้าดิน (เทียนกง) — วันสำคัญมากของคนไทยเชื้อสายจีน
 *    · 十二月廿四 ส่งเจ้าขึ้นสวรรค์
 *
 * ── 🔴 ขอบเขตของไฟล์นี้ ─────────────────────────────────────
 * ตัวนี้บอกแค่ **"วันนี้เป็นวันอะไร"** ซึ่งเป็นข้อเท็จจริงของปฏิทิน
 * **ห้ามทำนายผลลัพธ์** ห้ามบอกว่าไหว้แล้วจะได้อะไร ไม่ไหว้แล้วจะเป็นอะไร
 * นั่นเกินขอบเขตของปฏิทินและเกินความแม่นของระบบ
 *
 * ชื่อไทยใช้คำที่คนไทยเชื้อสายจีนเรียกกันจริง ไม่ใช่คำแปลตรงตัว
 */

const { SolarDay } = require("tyme4ts");

/**
 * ชื่อเทศกาล 3 ภาษา
 *
 * กุญแจคือชื่อจีนที่ตัวคำนวณคืนมา — ห้ามเปลี่ยน
 * ชื่อไทยเป็นคำที่ใช้เรียกกันจริงในไทย (เช่น 清明 = เช็งเม้ง ไม่ใช่ "เทศกาลกวาดสุสาน")
 */
const FESTIVAL_NAMES = Object.freeze({
  "春节":   { th: "ตรุษจีน",              en: "Chinese New Year",   kind: "worship" },
  "除夕":   { th: "วันสิ้นปีจีน",          en: "Lunar New Year's Eve", kind: "worship" },
  "元宵节": { th: "หยวนเซียว",            en: "Lantern Festival",   kind: "worship" },
  "清明节": { th: "เช็งเม้ง",              en: "Qingming",           kind: "ancestor" },
  "端午节": { th: "ตวงโหง่ว (บ๊ะจ่าง)",   en: "Dragon Boat",        kind: "festival" },
  "七夕节": { th: "ชิดเซ็ก",               en: "Qixi",               kind: "festival" },
  "中元节": { th: "สารทจีน",              en: "Ghost Festival",     kind: "ancestor" },
  "中秋节": { th: "ไหว้พระจันทร์",         en: "Mid-Autumn",         kind: "worship" },
  "重阳节": { th: "เทศกาลขึ้นเก้า",        en: "Double Ninth",       kind: "festival" },
  "冬至节": { th: "ตังโจ่ย",               en: "Winter Solstice",    kind: "worship" },
  "腊八节": { th: "ลาปา",                  en: "Laba",               kind: "festival" },
  "龙头节": { th: "วันมังกรเงยหัว",        en: "Dragon Head",        kind: "festival" },
  "上巳节": { th: "ซ่างซื่อ",              en: "Shangsi",            kind: "festival" },
});

/** วันไหว้ที่ต้องเติมเอง — ตัวคำนวณไม่มีให้ */
const EXTRA = Object.freeze({
  /** 正月初九 ไหว้ฟ้าดิน — วันสำคัญมากของคนไทยเชื้อสายจีน */
  tiangong: { th: "ไหว้ฟ้าดิน (เทียนกง)", en: "Jade Emperor's Birthday", zh: "天公生", kind: "worship" },
  /** 十二月廿四 ส่งเจ้าขึ้นสวรรค์ */
  sendGod: { th: "ส่งเจ้าขึ้นสวรรค์", en: "Sending Off the Kitchen God", zh: "送神", kind: "worship" },
  /** 初一 · 十五 วันพระจีน ไหว้เจ้าประจำเดือน */
  temple: { th: "วันพระจีน (ไหว้เจ้า)", en: "Temple Day", zh: "初一十五", kind: "worship" },
});

/**
 * วันไหว้/เทศกาลของวันที่กำหนด
 *
 * @param {string} dateStr วันที่แบบ YYYY-MM-DD (ตามปฏิทินท้องถิ่นของผู้ใช้แล้ว)
 * @returns {Array<{zh:string, th:string, en:string, kind:string, major:boolean}>}
 */
function festivalsOn(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return [];

  let day;
  try {
    day = SolarDay.fromYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  } catch {
    return [];
  }

  const lunar = day.getLunarDay();
  const lunarDayNo = lunar.getDay();
  const lunarMonthNo = Math.abs(lunar.getLunarMonth().getMonth());
  const out = [];

  // ── ชั้นที่ ① เทศกาลจากตัวคำนวณ ──
  const f = lunar.getFestival();
  if (f) {
    const zh = String(f.getName ? f.getName() : f.toString()).trim();
    const known = FESTIVAL_NAMES[zh];
    out.push({
      zh,
      th: known ? known.th : zh,
      en: known ? known.en : zh,
      kind: known ? known.kind : "festival",
      // เทศกาลใหญ่ที่คนเตรียมของล่วงหน้าจริง
      major: ["春节", "除夕", "清明节", "中元节", "中秋节", "冬至节"].includes(zh),
    });
  }

  // ── ชั้นที่ ② วันไหว้ที่ต้องเติมเอง ──
  if (lunarMonthNo === 1 && lunarDayNo === 9) {
    out.push({ ...EXTRA.tiangong, major: true });
  }
  if (lunarMonthNo === 12 && lunarDayNo === 24) {
    out.push({ ...EXTRA.sendGod, major: true });
  }
  // วันพระจีน — ใส่ก็ต่อเมื่อวันนั้นไม่มีเทศกาลใหญ่อยู่แล้ว
  // ไม่งั้นวันตรุษจีนจะขึ้นสองใบซ้อนกัน
  if ((lunarDayNo === 1 || lunarDayNo === 15) && out.length === 0) {
    out.push({ ...EXTRA.temple, major: false });
  }

  return out;
}

/**
 * มีวันไหว้ใน N วันข้างหน้าไหม — ใช้เตือนล่วงหน้าให้เตรียมของทัน
 *
 * 🔴 ทำไมต้องเตือนล่วงหน้า ไม่ใช่เตือนวันนั้น
 * ของไหว้ต้องซื้อต้องเตรียม บอกตอนเช้าวันไหว้ = สายเกินไปแล้ว
 * เจ้าของถามเองว่า "เตือนพวกวันไหว้เจ้าด้วยดีมั๊ย" — ประโยชน์อยู่ที่เตรียมทัน
 */
function upcomingFestival(dateStr, leadDays = 1) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (let ahead = 1; ahead <= Math.max(1, leadDays); ahead += 1) {
    const at = new Date(base + ahead * 86_400_000);
    const target = at.toISOString().slice(0, 10);
    const list = festivalsOn(target);
    if (list.length > 0) return { date: target, daysAhead: ahead, festivals: list };
  }
  return null;
}

module.exports = { festivalsOn, upcomingFestival, FESTIVAL_NAMES, EXTRA };
