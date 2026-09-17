/**
 * mobile-astronomy-interpret-r8.cjs — ตีความดาวจริงรายยาม (เจ้านายสั่ง 18 ก.ย. 2569)
 *
 * แจ้งเตือนดาวจริงเดิมส่งแต่ตำแหน่ง (ข้อเท็จจริง) → user ไม่รู้ว่าแปลว่าอะไร
 * ชั้นนี้ให้ AI แปลเป็นภาษาคน "ยามนี้ท้องฟ้าแปลว่าอะไรกับคุณ" โดยเทียบดวงกำเนิด
 * (โหราตะวันตก + 七政 ระดับที่ live บนเว็บ /fusion แล้ว) และอิงน้ำเสียงสรุปดวงเช้าของวัน
 *
 * กติกา: ตัวเลข/องศา/ราศี มาจาก snapshot ล้วน (AI ห้ามคิดเลข) · ไม่ใช่ "ฤกษ์ยาม 七政"
 * (กฎเลือกยามยังล็อกจนคัมภีร์ตรวจซ้ำ) · 3 ภาษา th/en/zh · validator เข้ม · AI พัง = null
 * (ตัวส่งถอยไปใช้ข้อความคงที่เดิม ไม่มีวันเงียบ)
 */
const crypto = require("node:crypto");
const summaryLib = require("./daily-ai-summary.cjs");

const LOCALES = ["th", "en", "zh"];
const SIGNS_TH = ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"];
const SIGNS_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGNS_ZH = ["白羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"];
const BODY_TH = { Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร", Jupiter: "พฤหัส", Saturn: "เสาร์", Rahu: "ราหู", Ketu: "เกตุ", Yuebo: "เยว่ป๋อ" };
const BODY_ZH = { Sun: "太陽", Moon: "月亮", Mercury: "水星", Venus: "金星", Mars: "火星", Jupiter: "木星", Saturn: "土星", Rahu: "羅睺", Ketu: "計都", Yuebo: "月孛" };
const THAI_RE = /[\u0E00-\u0E7F]/u;
// คำต้องห้าม: คำตัดสินแบบตำราเลือกยาม (七政 election ยังล็อก) + เรื่องต้องห้ามของ HourKey
const FORBIDDEN_RE = /ฤกษ์ดี|ฤกษ์ร้าย|ฤกษ์ยาม|吉時|凶時|吉时|凶时|auspicious hour|inauspicious hour|หวย|lottery|彩票|樂透|ความตาย|เสียชีวิต/iu;

function signOf(lon) {
  const l = ((Number(lon) % 360) + 360) % 360;
  const idx = Math.min(11, Math.floor(l / 30));
  const deg = Math.min(29.9, Math.round((l - idx * 30) * 10) / 10);
  return { idx, deg, th: SIGNS_TH[idx], en: SIGNS_EN[idx], zh: SIGNS_ZH[idx] };
}

/** สรุป snapshot เป็นตารางอ่านง่ายให้ AI (ตัวเลขทุกตัวจาก engine) */
function skyTable(facts) {
  const rows = [];
  for (const b of Array.isArray(facts?.physicalBodies) ? facts.physicalBodies : []) {
    const s = signOf(b.longitudeTropicalDeg);
    rows.push({ body: b.key, th: BODY_TH[b.key] || b.key, zh: BODY_ZH[b.key] || b.key, sign: `${s.th}/${s.en}/${s.zh}`, deg: s.deg,
      retrograde: b.retrograde === true, illuminated: typeof b.illuminatedFraction === "number" ? Math.round(b.illuminatedFraction * 100) : undefined });
  }
  for (const p of Array.isArray(facts?.points) ? facts.points : []) {
    const s = signOf(p.longitudeTropicalDeg);
    rows.push({ body: p.key, th: BODY_TH[p.key] || p.key, zh: BODY_ZH[p.key] || p.key, sign: `${s.th}/${s.en}/${s.zh}`, deg: s.deg, point: p.definition });
  }
  return rows;
}

/** มุมระหว่างดาวจรกับดาวกำเนิด (เรขาคณิตล้วน · orb ≤ 3°) — ให้ AI มีหลักฐานเทียบดวง */
function transitHits(facts, natal) {
  const natalBodies = Array.isArray(natal?.bodies) ? natal.bodies : [];
  const hits = [];
  const aspects = [[0, "ทับ/conjunct"], [60, "60°/sextile"], [90, "90°/square"], [120, "120°/trine"], [180, "180°/opposition"]];
  for (const t of Array.isArray(facts?.physicalBodies) ? facts.physicalBodies : []) {
    for (const n of natalBodies) {
      if (!Number.isFinite(Number(n.lon))) continue;
      let d = Math.abs(((Number(t.longitudeTropicalDeg) - Number(n.lon)) % 360 + 360) % 360);
      if (d > 180) d = 360 - d;
      for (const [angle, name] of aspects) {
        const orb = Math.abs(d - angle);
        if (orb <= 3) hits.push({ transit: t.key, natal: n.key, aspect: name, orb: Math.round(orb * 10) / 10 });
      }
    }
  }
  // เก็บมุมแน่นสุดก่อน (เดิมตัดตามลำดับพบ → มุม orb 0 หลุดได้เมื่อเกิน 12)
  return hits.sort((a, b) => a.orb - b.orb).slice(0, 12);
}

function buildInterpretPrompt(input) {
  const { facts, natal, dailyTone, profileName } = input;
  const sky = skyTable(facts);
  const hits = transitHits(facts, natal);
  const local = String(facts?.localBoundary || "");
  return [
    "คุณคือซินแสดาวจริง (โหราศาสตร์ตะวันตก + 七政四餘 ระดับดวงกำเนิด) ของ HourKey",
    "หน้าที่: แปลว่า 'ท้องฟ้าจริงในช่วง 2 ชั่วโมงนี้แปลว่าอะไรกับเจ้าของดวงคนนี้' เป็นภาษาคน",
    "",
    "== กฎเหล็ก ==",
    "1. ใช้เฉพาะตำแหน่ง/มุมใน SKY และ TRANSIT_HITS ห้ามแต่งองศา/ราศี/มุมเพิ่ม",
    "2. ห้ามตัดสินว่ายามนี้ 'ฤกษ์ดี/ฤกษ์ร้าย' แบบตำราเลือกยาม — ให้พูดในกรอบ 'พลังงาน/อารมณ์/จังหวะที่เหมาะ' เทียบดวงกำเนิด",
    "3. ไม่มี TRANSIT_HITS = ยามธรรมดา ให้พูดตามลักษณะจันทร์/ราศี/ดาวถอยหลังที่มีจริง ห้ามสร้างเหตุการณ์",
    "4. ภาษาคนล้วน สั้น ชัด ห้ามศัพท์เทคนิค (ห้ามคำว่า aspect/orb/transit/沖/合) — ชื่อดาว/ราศีไทยใช้ได้",
    "5. น้ำเสียงต้องไม่ขัดกับ DAILY_TONE (สรุปดวงเช้าของวันเดียวกัน) — ถ้ายามนี้ต่างจากภาพรวมวัน ให้บอกว่าเป็น 'ช่วงย่อย'",
    "6. ห้ามเรื่องต้องห้าม: ความตาย โรคร้ายแรง คดีความ การเมือง การพนัน หวย",
    "7. ห้ามคำว่า 'อาจจะ/น่าจะ' เกิน 1 ครั้งต่อภาษา — กล้าฟันธงในกรอบข้อ 2",
    "8. zh ต้องเป็นจีนตัวเต็มล้วน ห้ามมีอักษรไทยแม้ตัวเดียว (ชื่อดาว/ราศีใช้คอลัมน์ zh ใน SKY) · en ห้ามมีอักษรไทย · ทุกช่องเป็นบรรทัดเดียว ไม่ขึ้นบรรทัดใหม่",
    "",
    `== ช่วงเวลา == ${local} (2 ชั่วโมงถัดจากนี้) · เจ้าของดวง: ${profileName || "ผู้ใช้"}`,
    "== SKY (ตำแหน่งดาวจริง ณ ต้นยาม · ราศีสายัน) ==",
    JSON.stringify(sky),
    "== NATAL (ดวงกำเนิดย่อ) ==",
    JSON.stringify(natal || {}),
    "== TRANSIT_HITS (มุมดาวจรกับดาวกำเนิด ≤3° · เรขาคณิตล้วน) ==",
    JSON.stringify(hits),
    "== DAILY_TONE ==",
    JSON.stringify(dailyTone || null),
    "",
    "== รูปแบบคำตอบ == JSON ล้วนก้อนเดียว โครงนี้เป๊ะ:",
    JSON.stringify({
      th: {
        title: "หัวข้อแจ้งเตือน ≤40 ตัวอักษร (บอกดาวเด่นของยาม เช่น 'จันทร์เข้ากันย์ ทับดาวเดือนเกิด')",
        body: "1-2 ประโยค ≤180 ตัวอักษร แปลว่าอะไรกับคุณในยามนี้ อ่านจบบนจอล็อก",
        meaning: "คำอธิบายเต็ม 3-5 ประโยค: บนฟ้ามีอะไรเด่น → แปลว่าอะไรกับดวงคุณ → เหมาะทำ/เลี่ยงอะไรใน 2 ชม.นี้",
        doList: ["ควรทำในยามนี้ 1-3 ข้อ"],
        avoidList: ["ควรเลี่ยงในยามนี้ 1-3 ข้อ"],
      },
      en: "โครงเดียวกันภาษาอังกฤษ",
      zh: "โครงเดียวกันจีนตัวเต็ม",
    }),
  ].join("\n");
}

// ยุบช่องว่าง/ขึ้นบรรทัด/อักขระควบคุมเป็นช่องว่างเดียว (ซอง FCM ปฏิเสธอักขระควบคุม → ถ้าปล่อยไว้จะถอยไปข้อความคงที่เงียบๆ)
function normalizeText(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/gu, " ").replace(/\s+/gu, " ").trim() : "";
}
function clean(value, max, locale) {
  const text = normalizeText(value);
  if (text.length === 0 || text.length > max) return null;
  if (locale !== "th" && THAI_RE.test(text)) return null;
  if (FORBIDDEN_RE.test(text)) return null;
  return text;
}

function validateInterpretation(raw) {
  const parsed = typeof raw === "string" ? summaryLib.extractJsonObject(raw) : raw;
  if (!parsed || typeof parsed !== "object") return null;
  const out = {};
  for (const locale of LOCALES) {
    const e = parsed[locale];
    if (!e || typeof e !== "object") return null;
    const title = clean(e.title, 60, locale), body = clean(e.body, 240, locale), meaning = clean(e.meaning, 900, locale);
    if (title === null || body === null || meaning === null) return null;
    const list = (v) => {
      if (!Array.isArray(v) || v.length < 1 || v.length > 3) return null;
      const items = v.map((x) => clean(x, 120, locale));
      return items.every((x) => x !== null) ? items : null;
    };
    const doList = list(e.doList), avoidList = list(e.avoidList);
    if (doList === null || avoidList === null) return null;
    out[locale] = { title, body, meaning, doList, avoidList };
  }
  return out;
}

function factsDigest(facts) {
  return crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

/**
 * สร้างคำตีความ 3 ภาษา — invoke ฉีดได้เพื่อเทส (ตัวจริงใช้สายสำรอง 4 ชั้นของ daily-ai-summary)
 * คืน { locales, model, factsDigest } หรือโยน error
 */
async function generateAstronomyInterpretation(input, options = {}) {
  const prompt = buildInterpretPrompt(input);
  // งบเวลารวมทั้งสายสำรอง (ค่าเริ่ม 160 วิ < 170 วิ ที่ตัวส่งรอ) — ไม่ให้สายสำรอง 4 ชั้นลากถึง 600 วิ
  const totalMs = options.totalTimeoutMs || 160_000;
  const perBackendMs = Math.min(options.timeoutMs || 150_000, totalMs);
  const run = options.invoke
    ? options.invoke(prompt, options).then((raw) => ({ raw, model: options.model || "mock" }))
    : summaryLib.invokeAnyBackend(prompt, { timeoutMs: perBackendMs });
  let timer;
  const result = await Promise.race([
    run,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("astronomy_interpretation_timeout")), totalMs); }),
  ]).finally(() => clearTimeout(timer));
  const raw = result.raw;
  const model = result.model;
  const locales = validateInterpretation(raw);
  if (!locales) throw new Error("astronomy_interpretation_invalid");
  return { locales, model, factsDigest: factsDigest(input.facts) };
}

module.exports = {
  LOCALES,
  buildInterpretPrompt,
  generateAstronomyInterpretation,
  signOf,
  skyTable,
  transitHits,
  validateInterpretation,
  factsDigest,
};
