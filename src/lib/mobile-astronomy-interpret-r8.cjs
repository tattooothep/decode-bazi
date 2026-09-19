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
const SIGNS_ZH = ["牡羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"];
const BODY_TH = { Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร", Jupiter: "พฤหัส", Saturn: "เสาร์", Rahu: "ราหู", Ketu: "เกตุ", Yuebo: "เยว่ป๋อ" };
const BODY_ZH = { Sun: "太陽", Moon: "月亮", Mercury: "水星", Venus: "金星", Mars: "火星", Jupiter: "木星", Saturn: "土星", Rahu: "羅睺", Ketu: "計都", Yuebo: "月孛" };
const THAI_RE = /[\u0E00-\u0E7F]/u;
// คำต้องห้าม: คำตัดสินแบบตำราเลือกยาม (七政 election ยังล็อก) + เรื่องต้องห้ามของ HourKey
// ศัพท์เทคนิค/คำอ้างเกินที่ผู้ตรวจพบรั่วในคำอ่านจริง (19 ก.ย. 2569) — เจอ = ตีตก แล้วให้ AI เขียนใหม่ 1 รอบ
const LEAK_RE = /\bnatal\b|\bretrograde\b|\bdegrees?\b|\borb\b|sub-window|องศา|เยว่ป๋อ|Yuebo|月孛|本命|逆行|吉角|ดาวโชค|วาสนา|เจ้าดวง|แข็งที่สุด|lucky planet|最旺|貴人|กำเนิด|ถอยหลัง|(?:ดาว|อาทิตย์|จันทร์|พุธ|ศุกร์|อังคาร|พฤหัส|เสาร์)จร/iu;
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

/**
 * มุมระหว่างดาวจร → ดาวกำเนิด (เรขาคณิตล้วน · orb ≤ 3°) — ให้ AI มีหลักฐานเทียบดวง
 * ผลตรวจ 5 ผู้ตรวจ 19 ก.ย. 2569:
 *  · จันทร์ (เร็ว ~1°/2 ชม.) คือสิ่งเดียวที่ "เฉพาะยามนี้" จริง → กันช่องให้มุมจันทร์ก่อนเสมอ (เดิมเรียง orb ล้วน
 *    มุมดาวช้าชุดเดิมกิน 11/12 ช่องทุกยาม → คำอ่านซ้ำทั้งวัน)
 *  · ดาวช้า = ฉากหลังหลายวัน ติดป้าย pace + ระยะที่มุมค้างโดยประมาณ ห้าม AI เขียนว่าเฉพาะ 2 ชม.นี้
 *  · จุดคำนวณกำเนิด (ราหู/เกตุ/เยว่ป๋อ) ใช้เฉพาะมุมทับ · จื่อชี่ (สูตรยังทดลอง) ไม่นำมาเทียบ
 *  · ทุกแถวบอกทิศชัด: transit (ดาวบนฟ้าตอนนี้) → natal (ดาวในดวงเจ้าของ) กัน AI สลับตัว
 */
const NATAL_POINTS = new Set(["Rahu", "Ketu", "Yuebo"]);
const NATAL_EXCLUDED = new Set(["Ziqi"]);
// องศา/วัน โดยประมาณ → มุม orb 3° ค้างราว (6 / ความเร็ว) วัน
const DAILY_MOTION = { Moon: 13.2, Sun: 1, Mercury: 1.2, Venus: 1.1, Mars: 0.6, Jupiter: 0.1, Saturn: 0.05 };
function transitHits(facts, natal) {
  const natalBodies = Array.isArray(natal?.bodies) ? natal.bodies : [];
  const hits = [];
  const aspects = [[0, "ทับ/conjunct", "neutral"], [60, "60°/sextile", "flowing"], [90, "90°/square", "tense"], [120, "120°/trine", "flowing"], [180, "180°/opposition", "tense"]];
  for (const t of Array.isArray(facts?.physicalBodies) ? facts.physicalBodies : []) {
    for (const n of natalBodies) {
      if (!Number.isFinite(Number(n.lon)) || NATAL_EXCLUDED.has(n.key)) continue;
      let d = Math.abs(((Number(t.longitudeTropicalDeg) - Number(n.lon)) % 360 + 360) % 360);
      if (d > 180) d = 360 - d;
      for (const [angle, name, quality] of aspects) {
        if (NATAL_POINTS.has(n.key) && angle !== 0) continue;
        const orb = Math.abs(d - angle);
        if (orb > 3) continue;
        const fast = t.key === "Moon";
        hits.push({
          transit: t.key, natal: n.key, aspect: name, quality, orb: Math.round(orb * 10) / 10,
          direction: `${t.key} บนฟ้าตอนนี้ → ${n.key} ในดวงเจ้าของ`,
          pace: fast ? "fast_this_period" : "slow_background",
          lastsAbout: fast ? "ราว 6-10 ชั่วโมง" : `ราว ${Math.max(2, Math.round(6 / (DAILY_MOTION[t.key] || 1)))} วันขึ้นไป`,
        });
      }
    }
  }
  const byOrb = (a, b) => a.orb - b.orb;
  const fastHits = hits.filter((h) => h.pace === "fast_this_period").sort(byOrb).slice(0, 5);
  const slowHits = hits.filter((h) => h.pace !== "fast_this_period").sort(byOrb).slice(0, 12 - fastHits.length);
  return [...fastHits, ...slowHits];
}

/** ดวงกำเนิดที่ส่งให้ AI: ราศีสายันระบบเดียวกับ SKY (เดิมป้ายราศีเป็นนิรายนะ ปนกับองศาสายัน → AI สลับราศี/ตัวดาว) */
function natalForPrompt(natal) {
  const bodies = (Array.isArray(natal?.bodies) ? natal.bodies : [])
    .filter((b) => Number.isFinite(Number(b?.lon)) && !NATAL_EXCLUDED.has(b.key))
    .map((b) => { const sg = signOf(b.lon); return { key: b.key, th: BODY_TH[b.key] || b.th || b.key, zh: BODY_ZH[b.key] || b.key, sign: `${sg.th}/${sg.en}/${sg.zh}`, deg: sg.deg }; });
  const key = natal?.keyPlanet && typeof natal.keyPlanet.key === "string" ? natal.keyPlanet : null;
  return {
    bodies,
    keyPlanet: key ? { key: key.key, strength: key.statusTh || "ไม่ระบุ", callIt: { th: "ดาวหลักของคุณ", en: "your key planet", zh: "你的主星" } } : null,
  };
}

function buildInterpretPrompt(input) {
  const { facts, natal, dailyTone, profileName, previousPeriod } = input;
  const sky = skyTable(facts);
  const hits = transitHits(facts, natal);
  const local = String(facts?.localBoundary || "");
  return [
    "คุณคือซินแสดาวจริงของ HourKey — ใช้โหราศาสตร์ตะวันตกแบบดาวจรเทียบดวงกำเนิดเป็นแกนเดียว (七政四餘 ใช้บอกแค่ว่าดาวไหนคือดาวหลักของดวง ไม่ใช้ตัดสินว่ามุมดีหรือร้าย)",
    "หน้าที่: แปลว่า 'ท้องฟ้าจริงในช่วง 2 ชั่วโมงนี้แปลว่าอะไรกับเจ้าของดวงคนนี้' เป็นภาษาคน",
    "",
    "== กฎเหล็ก ==",
    "1. ใช้เฉพาะตำแหน่ง/มุมใน SKY และ TRANSIT_HITS ห้ามแต่งองศา/ราศี/มุมเพิ่ม และห้ามอ้างมุมที่ไม่อยู่ใน TRANSIT_HITS แม้จะคิดว่ามีจริง",
    "2. ห้ามตัดสินว่ายามนี้ 'ฤกษ์ดี/ฤกษ์ร้าย' แบบตำราเลือกยาม — ให้พูดในกรอบ 'พลังงาน/อารมณ์/จังหวะที่เหมาะ' เทียบดวงกำเนิด",
    "3. ทิศของมุมต้องตรงช่อง direction เสมอ: ดาวซ้ายคือดาวบนฟ้าตอนนี้ ดาวขวาคือดาวในดวงเจ้าของ ห้ามสลับ ห้ามเอาราศีของดาวบนฟ้าไปใส่ให้ดาวในดวง (ราศีของดาวในดวงดูจาก NATAL เท่านั้น) · quality: flowing=ลื่น/หนุน · tense=ตึง/กดดัน · neutral(ทับ)=ขึ้นกับคู่ดาว",
    "4. pace=fast_this_period (จันทร์) คือสิ่งเดียวที่เฉพาะ 2 ชั่วโมงนี้ → ต้องเป็นหัวเรื่องของยามถ้ามี · pace=slow_background คือฉากหลังของหลายวัน ให้พูดว่า 'ช่วงนี้/หลายวันนี้' ห้ามเขียนว่าเฉพาะ 2 ชั่วโมงนี้หรือ 'เป็นพิเศษในยามนี้' · ถ้าไม่มีมุมจันทร์เลย ให้บอกตรงๆ ว่ายามนี้ไม่ต่างจากภาพรวมช่วงนี้ แล้วสรุปฉากหลังสั้นๆ",
    "5. DAILY_TONE เป็นแค่เพดานน้ำเสียง (ห้ามขัด) ไม่ใช่เนื้อหาให้พูดซ้ำ · doList/avoidList อย่างน้อย 1 ข้อต้องมาจากมุมจันทร์ของยามนี้ (ถ้ามี) · ห้ามซ้ำหัวข้อหรือคำแนะนำหลักของ PREVIOUS_PERIOD — ให้นำด้วยสิ่งที่เปลี่ยนไปจากยามก่อน",
    "6. ห้ามเรื่องต้องห้าม: ความตาย โรคร้ายแรง คดีความ การเมือง การพนัน หวย",
    "7. คำเรียกดาวหลัก: ใช้คำใน NATAL.keyPlanet.callIt เท่านั้น (th 'ดาวหลักของคุณ' · en 'your key planet' · zh '你的主星') ห้ามคำว่า ดาวโชค/วาสนา/เจ้าดวง/แข็งที่สุด/lucky/最旺/貴人 · ราหู เกตุ เยว่ป๋อ ในดวงให้เรียกว่า 'จุดอ่อนไหวในดวงคุณ' ห้ามใส่ความหมายเฉพาะ (เงิน/ผู้มีอำนาจ ฯลฯ) ให้มัน",
    "8. ภาษาคนล้วน ห้ามศัพท์เทคนิคในข้อความ: aspect/orb/transit/natal/retrograde/degree/องศา/จร/กำเนิด/ถอยหลัง/本命/逆行/沖/合/เยว่ป๋อ/Yuebo/月孛 — ใช้ 'ดาวบนฟ้าตอนนี้' 'ดาวในดวงคุณ' 'เดินช้าลงทบทวน' แทน · ชื่อดาว/ราศีใช้ได้",
    "9. title = สิ่งที่ควรทำ/ระวังในยามนี้ (ไม่ใช่รหัสดาว) มีชื่อดาวได้ไม่เกิน 1 ดวง · body ประโยคแรก = ทำอะไร/เลี่ยงอะไร ประโยคสอง = เพราะดาวอะไร · doList/avoidList ทุกข้อขึ้นต้นด้วยคำกริยา ทำได้จริงใน 2 ชั่วโมง ไม่ขัดกันเอง",
    "10. เขียน th ก่อน แล้ว en และ zh แปลประโยคต่อประโยคจาก th ห้ามเพิ่ม/ลด/เปลี่ยนความแรงหรือคำแนะนำ · zh จีนตัวเต็มล้วน ห้ามอักษรไทย ใช้ 你 ตลอด ใช้ ， เต็มตัว (ชื่อดาว/ราศีใช้คอลัมน์ zh) · en ห้ามอักษรไทย · ทุกช่องบรรทัดเดียว",
    "11. ห้ามคำว่า 'อาจจะ/น่าจะ' เกิน 1 ครั้งต่อภาษา — กล้าฟันธงในกรอบข้อ 2",
    "",
    `== ช่วงเวลา == ${local} (2 ชั่วโมงถัดจากนี้) · เจ้าของดวง: ${profileName || "ผู้ใช้"}`,
    "== SKY (ตำแหน่งดาวจริง ณ ต้นยาม · ราศีสายัน) ==",
    JSON.stringify(sky),
    "== NATAL (ดาวในดวงเจ้าของ · ราศีสายันระบบเดียวกับ SKY) ==",
    JSON.stringify(natalForPrompt(natal)),
    "== TRANSIT_HITS (ดาวบนฟ้าตอนนี้ → ดาวในดวง · ≤3° · เรขาคณิตล้วน · มุมจันทร์อยู่บนสุด) ==",
    JSON.stringify(hits),
    "== DAILY_TONE (เพดานน้ำเสียงของวัน) ==",
    JSON.stringify(dailyTone || null),
    "== PREVIOUS_PERIOD (ยามก่อนหน้าในวันเดียวกัน — ห้ามซ้ำ) ==",
    JSON.stringify(previousPeriod || null),
    "",
    "== รูปแบบคำตอบ == JSON ล้วนก้อนเดียว โครงนี้เป๊ะ:",
    JSON.stringify({
      th: {
        title: "สิ่งที่ควรทำ/ระวังในยามนี้ ≤40 ตัวอักษร (เช่น '2 ชม.นี้คุยเรื่องใจได้ลื่น')",
        body: "2 ประโยค ≤180 ตัวอักษร: ทำอะไร/เลี่ยงอะไร แล้วตามด้วยเพราะดาวอะไร อ่านจบบนจอล็อก",
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
  if (FORBIDDEN_RE.test(text) || LEAK_RE.test(text)) return null;
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
  // งบเวลารวมทั้งสายสำรอง + เขียนใหม่ 1 รอบ (ค่าเริ่ม 220 วิ < 230 วิ ที่ตัวส่งรอ · วัดจริง 2 รอบ ≈ 148 วิ) — ไม่ให้สายสำรอง 4 ชั้นลากถึง 600 วิ
  const totalMs = options.totalTimeoutMs || 220_000;
  const perBackendMs = Math.min(options.timeoutMs || 150_000, totalMs);
  const once = (text) => (options.invoke
    ? options.invoke(text, options).then((raw) => ({ raw, model: options.model || "mock" }))
    : summaryLib.invokeAnyBackend(text, { timeoutMs: perBackendMs }));
  const run = once(prompt).then((first) => (validateInterpretation(first.raw) ? first
    : once(`${prompt}\n\n== คำตอบรอบแรกไม่ผ่านด่านตรวจ (ศัพท์เทคนิค/คำต้องห้าม/ภาษาปน/ความยาว/รูปแบบ) เขียนใหม่ทั้งก้อนให้ตรงกฎทุกข้อ ==`)));
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
  natalForPrompt,
  LOCALES,
  buildInterpretPrompt,
  generateAstronomyInterpretation,
  signOf,
  skyTable,
  transitHits,
  validateInterpretation,
  factsDigest,
};
