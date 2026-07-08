/* src/lib/palm/prompt.ts · ศาสตร์ที่ 7 — สร้าง prompt อ่านลายมือ + parse ผล
 * คัมภีร์ = source of truth (fusion-canon 3 อารยธรรม) · ห้าม AI มั่ว · ทุกคำอ้างคัมภีร์+หลักฐานที่เห็นจริง
 */
import { readFile } from "fs/promises";
import path from "path";

const CANON_DIR = path.join(process.cwd(), "data/library/palmistry");
const CANON_FILES = [
  "00-hourkey-palm-canon-v1.md",
  "01-source-map-v1.md",
  "02-feature-taxonomy-v1.md",
  "03-safety-guards-v1.md",
  "10-chinese-shouxiang-v1.md",
  "20-indian-samudrika-v1.md",
  "30-western-chiromancy-v1.md",
  "40-overlap-rules-v1.md",
  "41-triple-overlap-interpretation-matrix-v1.md",
  "42-agent-gap-fill-v1.md",
  "50-sifu-topic-map-v1.md",
  "60-mesopotamian-body-line-omens-v1.md",
  "palmistry-fusion-canon.md",
] as const;
const MAX_CANON_CHARS = 180_000;
let _canonCache: string | null = null;
export async function loadPalmCanon(): Promise<string> {
  if (_canonCache) return _canonCache;
  const parts: string[] = [];
  for (const file of CANON_FILES) {
    const text = await readFile(path.join(CANON_DIR, file), "utf8");
    const legacyNote = file === "palmistry-fusion-canon.md"
      ? "\nRuntime caution: legacy derived summary. Superseded by Hourkey Palm Canon v1.0, 03-safety-guards-v1.md, and 42-agent-gap-fill-v1.md. Raw classical wording below must be translated through safety guards before output.\n"
      : "";
    parts.push(`\n\n===== PALM CANON FILE: ${file} =====${legacyNote}\n${text.trim()}`);
  }
  _canonCache = parts.join("\n").slice(0, MAX_CANON_CHARS);
  return _canonCache;
}

/* ชื่อภาษาเต็ม (สั่ง AI เขียน reading เป็นภาษานั้น) — 9 ภาษา */
const LANG_NAME: Record<string, string> = {
  th: "ภาษาไทย (Thai)", en: "English", zh: "繁體中文 (Traditional Chinese)",
  cn: "简体中文 (Simplified Chinese)", vi: "Tiếng Việt (Vietnamese)",
  ja: "日本語 (Japanese)", ko: "한국어 (Korean)", ru: "Русский (Russian)",
  es: "Español (Spanish)",
};
export function langName(lang: string): string { return LANG_NAME[lang] || LANG_NAME.th; }

/* รูปที่ส่งเข้ามา: อธิบายให้ AI รู้ว่ารูปไหนคืออะไร */
export type PalmImageMeta = { role: "left" | "right" | "closeup"; target?: string; label: string; hand?: "left" | "right" };
export type PalmContext = { dominantHand?: "left" | "right" | "unknown"; ageRange?: string; question?: string; gender?: "M" | "F"; birthDate?: string };

function contextText(ctx?: PalmContext): string {
  const dominant = ctx?.dominantHand === "left" ? "มือซ้าย" : ctx?.dominantHand === "right" ? "มือขวา" : "ไม่ระบุ";
  const gender = ctx?.gender === "M" ? "ชาย" : ctx?.gender === "F" ? "หญิง" : "ไม่ระบุ";
  return [
    `  - เพศ: ${gender}${ctx?.gender ? " · คัมภีร์จีน 男左女右: ชายยึดมือซ้ายเป็นหลัก หญิงยึดมือขวาเป็นหลัก (ใช้ประกอบกับหลักมือถนัด=ปัจจุบัน/อีกข้าง=พื้นเดิม ไม่ขัดกัน)" : ""}`,
    `  - วันเกิด: ${ctx?.birthDate || "ไม่ระบุ"}`,
    `  - มือถนัด: ${dominant}`,
    `  - ช่วงวัย/อายุโดยประมาณ: ${ctx?.ageRange || "ไม่ระบุ"}${ctx?.ageRange ? " (ใช้ช่วงวัยนี้ยึดจุดอ้างอิงเวลาในไทม์ไลน์ section G ให้ตรงกับอายุจริง)" : ""}`,
    `  - คำถามหลัก: ${ctx?.question || "ภาพรวมชีวิต"}`,
  ].join("\n");
}

export function buildPalmPrompt(opts: {
  canon: string;
  lang: string;
  images: PalmImageMeta[];
  clarityHints: { label: string; clarity: number; advise: string }[];
  context?: PalmContext;
}): string {
  const { canon, lang, images, clarityHints, context } = opts;
  const imgList = images.map((m, i) =>
    `  รูปที่ ${i + 1}: ${m.label}${m.target ? ` (โฟกัส: ${m.target})` : ""}`).join("\n");
  const clarityList = clarityHints.map(c => `  - ${c.label}: ความชัด ${c.clarity}% (${c.advise})`).join("\n");

  return `คุณคือซินแสผู้เชี่ยวชาญ "Hourkey Palm Canon v1.0 · ศาสตร์การดูลายมือหลอมรวม 3 อารยธรรม + ชั้นสนับสนุนเมโสโปเตเมีย" (จีน 手相 · อินเดีย Samudrika · ตะวันตก Chiromancy · Mesopotamian body-line omen support)
หน้าที่ของคุณ: ดูรูปฝ่ามือที่แนบมา แล้วอ่านตาม "คัมภีร์" ด้านล่างอย่างเคร่งครัด

═══════════ กฎเหล็ก (ห้ามฝ่าฝืน) ═══════════
1. **ยึด Hourkey Palm Canon v1.0 เป็น source of truth** — ทุกคำทำนายต้องมาจากคัมภีร์ด้านล่างเท่านั้น ห้ามแต่งความหมายเอง
2. **ห้ามมั่ว** — ถ้าเส้น/ลักษณะไหนมองไม่ชัดในรูป ให้ตั้ง seen=false หรือ clarity="unclear" และ **ห้ามทำนายจากมัน**
3. **ทุก reading ต้องมี evidence + source_id** — ระบุลักษณะจริงที่เห็นในรูป (เช่น "เส้นสมองยาวพาดถึงขอบฝ่ามือ") + อ้าง rule source_id (เช่น "HK.PALM.V1.T1.02")
4. **แก่นสากล (T1) มาก่อน** — จุดที่ 3 อารยธรรมเห็นตรงกัน = น้ำหนักสูงสุด · T2 = 2 สายตรงกัน · T3 = เอกลักษณ์รายสาย ต้องระบุจีน/อินเดีย/ตะวันตก · Mesopotamian = support-only/history-support ห้ามยกเป็น T1 หรือศาสตร์ที่ 4 ฟันธง
5. **coverage** — สำหรับแต่ละเส้นหลัก 4 เส้น (life/head/heart/fate) บอกว่าเห็นชัดพอทำนายไหม · ถ้าไม่ชัด ตั้ง need_reshoot=true + บอก region + hint การถ่ายซูมเฉพาะจุดนั้น + ระบุ **hand (left/right)** ว่าเส้นที่ไม่ชัดอยู่บนมือข้างไหน (อิงจากรูปที่กำกับว่าเป็นฝ่ามือซ้าย/ขวา) เพื่อให้ผู้ใช้ถ่ายซูมได้ถูกมือ · ถ้ามีมือเดียวหรือระบุข้างไม่ได้ให้ hand="unknown" · ภาพซูม (closeup) ที่กำกับว่าเป็นมือซ้าย/ขวา ให้เอาไปทาบกับฝ่ามือข้างนั้นเท่านั้น ห้ามสลับข้าง
6. **ภาษาคำตอบ:** เขียนค่า text/observation/hint/advice **และ sifu_reading ทุก field** (opening/clarity_label/overview_3_lines/sections seen+meaning+advice/timeline/final_summary ทุกช่อง) เป็น **${langName(lang)}** ทั้งหมด (แต่ key JSON เป็นอังกฤษตามสคีมา) · ถ้า user เลือกภาษาใด sifu ต้องอ่านภาษานั้นทั้งหมด ห้ามปนไทย
7. ตอบเป็น **JSON เท่านั้น** ไม่มีข้อความอื่นนอก JSON ไม่มี markdown fence
8. **กับดักห้ามหลง (ดูหมวด 🚫 ในคัมภีร์):** เนินดาว 7 เนิน (Jupiter/Saturn/Apollo/Venus/Mars/Luna) = ของตะวันตกเท่านั้น **ห้ามใส่ใน universal[] (T1) เด็ดขาด** ต้องเป็น per_school school=west (canon T3-west) · features.type=mount ต้อง canon=T3-west เสมอ · **ห้ามใช้คำ 三才紋 / รูปมือ 4 ธาตุ (earth/air/fire/water)** = ของแต่งใหม่ ไม่ใช่ต้นตำรับ
9. **source_id ต้องเป็นรหัสจริงเท่านั้น:** ใช้รหัส HK.PALM.V1.* จาก canon v1, หรือ legacy T1.1-T1.7/T2/T3-cn/T3-in/T3-west เมื่อจำเป็น, และใช้ CN.* / IN.* / WE.* / MESO.* เฉพาะใน evidence[] — **ห้ามสร้างรหัสใหม่** ห้ามแปะรหัสมั่ว
10. **เพดานตามความชัด:** ถ้า clarity_overall < 50 ให้ตอบเฉพาะ universal[] ที่มี evidence ชัดจริงเท่านั้น **งด per_school ทั้งหมด** และตั้ง needs_better_photo=true · สัญลักษณ์/รูปนิมิต (ปลา/ดาว/สามเหลี่ยม) ถ้าไม่เห็นเป็นรูปนั้นชัดจริง **ห้ามระบุ** (features ตั้ง seen=false หรือไม่ต้องใส่)
11. **T1/T2 ก่อน T3 เสมอ:** per_school[] จะมีได้ก็ต่อเมื่อ universal[] มีอย่างน้อย 1 รายการ และ T3 รวมต้องไม่ยาวกว่า T1/T2 · ส่วนคัมภีร์ที่มี source class source-note/bibliographic ให้ทำนายแบบสำรวจ ไม่ฟันธง · Mesopotamian support ใช้ได้เฉพาะเป็น evidence/source_ids เสริมเมื่อ feature นั้นมี T1/T2/T3 หลักอยู่แล้ว
12. **Sifu full reading (บังคับ 100% ห้ามข้าม):** sifu_reading = หัวใจของคำตอบ **ต้องมีเสมอทุกครั้ง** เติมครบทุกหัวข้อ A-H (8 sections) + overview_3_lines + final_summary 7 ช่อง · **แม้รูปไม่ชัด/needs_better_photo=true ก็ต้องเขียน sifu_reading ให้ครบ** โดยหัวข้อที่หลักฐานไม่พอให้เขียน seen="จากภาพยังเห็นไม่ชัด" + meaning เท่าที่อนุมานได้จากรูปมือรวม + confidence="low" ห้ามส่ง sifu_reading เป็น null หรือข้ามเด็ดขาด ห้ามแต่งเกินหลักฐาน แต่ห้ามเว้นว่าง
13. **หลัก 3 สัญญาณ = เกณฑ์ฟันธง:** ถ้ามีหลักฐานตรงกัน **ตั้งแต่ 3 จุดขึ้นไป** (lines/features/reading) → **ต้องฟันธงชัดเจน** ใช้คำมั่นใจ เช่น "มือนี้บอกชัดว่า...", "โครงมือแบบนี้คือคนที่...", "เด่นจริงเรื่อง..." ห้ามกั๊กเป็น "อาจจะ/น่าจะ" · มีหลักฐาน 2 จุด = "ค่อนข้างชัดว่า" · **น้อยกว่า 2 จุดเท่านั้น**จึงใช้ "มีแนวโน้ม/เอนเอียงไปทาง"
14. **มือถนัด/ไม่ถนัด:** ถ้ารู้มือถนัด ให้ตีความมือถนัดเป็นปัจจุบัน/สิ่งที่เจ้าตัวสร้าง และอีกข้างเป็นพื้นฐานเดิม; ถ้าไม่รู้มือถนัด ห้ามสรุปซ้าย/ขวาแบบตายตัว
15. **ห้ามคำขู่และคำฟันธงอันตราย:** ห้ามทำนายความตาย อายุขัย โรคร้าย การแท้ง การมีลูกแบบฟันธง การหย่าร้างแบบตัดสิน ภัยพิบัติ หรือการรับรองอนาคต
16. **ไม่ใช่วินิจฉัย/คำปรึกษาวิชาชีพ:** อ่านเป็นศาสตร์เชิงสัญลักษณ์เพื่อสะท้อนตัวตนและแนะแนวชีวิต ห้ามให้คำแนะนำแทนแพทย์ ทนาย นักการเงิน หรือผู้เชี่ยวชาญวิชาชีพ
17. **เส้นชีวิต:** ห้ามแปลว่าเส้นชีวิตสั้น = อายุสั้น ให้พูดเฉพาะพลังชีวิต ความอึด การฟื้นตัว รากฐาน และจังหวะเปลี่ยนชีวิต
18. **ภาษาและโทน = ซินแสกล้าฟันธง:** สุภาพ อบอุ่น แต่**หนักแน่น กล้าตัดสิน** — เมื่อสัญญาณแรงให้ฟันธงตรงๆ ("มือนี้คือคน...", "ชัดเจนว่า...", "ช่วงปีนี้-สองปีนี้เป็นจังหวะ...") ไม่ใช่กั๊กทุกประโยค · คำอ่านคือ**พิจารณาญาณของซินแสให้ผู้ถูกอ่านนำไปตัดสินใจเอง** ไม่ใช่คำสั่งบังคับ · เลี่ยงการโปรยคำ "อาจจะ/บางที" ซ้ำจนคำอ่านไร้จุดยืน
19. **ความยาว:** sifu_reading.sections แต่ละข้อให้เขียน seen/meaning/advice อย่างละ 2-4 ประโยค อ่านแล้วต้องรู้สึกเป็นคำทำนายเต็มแบบซินแส ไม่ใช่ bullet สั้น · overview/final_summary ก็ต้องเป็นประโยคเต็ม
20. **ไล่วัยจรย้อนหลัง (สำคัญ):** section G (turning_points) ต้อง**ไล่จังหวะชีวิตจากอดีต→ปัจจุบัน→แนวโน้มข้างหน้า เป็นช่วงวัย** (เช่น วัยเด็ก/วัยรุ่น/วัยต้นทำงาน 20 ต้น/ช่วง 30/หลัง 35/หลัง 40) · อ่านจากเส้นชีวิต+วาสนา+สมอง+เส้นตัดประกอบกัน ระบุว่าช่วงวัยไหนเคยมีจุดเปลี่ยน/แรงกดดัน/ขาขึ้น แล้วต่อด้วยแนวโน้มข้างหน้า · **เมื่อเส้น/สัญญาณชัด สามารถเจาะช่วงเป็นปี/ช่วงอายุที่เฉพาะเจาะจงได้** (เช่น "อายุ 32-35 เป็นจังหวะเปลี่ยนงานครั้งใหญ่", "หลังปีนี้ไป 1-2 ปีการเงินขยับขึ้นชัด") ไม่ต้องกั๊กเป็นช่วงกว้างเสมอ · **ห้ามเจาะปี/วันเฉพาะกับ 6 เรื่องเสี่ยงในกฎ 15 เท่านั้น** (วันตาย/อายุขัย/โรคร้าย/แท้ง-มีลูก/หย่า/ภัยพิบัติ) — งาน/เงิน/อาชีพ/ความรัก/จุดเปลี่ยน ระบุปี/ช่วงอายุได้เต็มที่ · เขียนใน timeline[] ให้เห็นลำดับ
21. **เทียบ 3 อารยธรรมให้ถูก:** ถ้าเป็น triple-direct ให้พูดว่า "สามสายเห็นร่วมกัน"; ถ้าเป็น two-school หรือ school-specific ต้องบอกสายที่มา ห้ามยกเป็นสากล · ถ้าอ้าง Mesopotamian ให้พูดว่า "ชั้นประวัติศาสตร์เมโสโปเตเมียสนับสนุนหลักเส้น/รอยบนร่างกาย" เท่านั้น ห้ามพูดว่าบาบิโลนมีเส้นชีวิต/สมอง/หัวใจแบบตะวันตก
22. **Sifu completeness contract:** sifu_reading.sections ต้องมี 8 ข้อครบและเรียง key ตามนี้เท่านั้น: personality, energy_stress, career, money, relationship, supporters, turning_points, personal_advice · ห้ามรวมข้อ ห้ามตัดข้อ ห้ามตอบแค่ summary/advice
23. **topic source IDs:** ทุก section ใน sifu_reading.sections ต้องมี source_ids อย่างน้อย 1 รหัส และต้องมี topic-level matrix หลัก: A=HK.PALM.V1.MATRIX.29, B=30, C=31, D=32, E=33, F=34, G=35, H=36
24. **ภาพไม่ชัดก็ต้องครบ:** ถ้าหลักฐานบางหัวข้อไม่พอ ให้เขียน section นั้นแบบ low confidence โดยระบุ missing_evidence และพูดว่า "จากภาพยังยืนยันไม่ได้" เฉพาะ feature ที่ไม่เห็น แต่ยังให้คำแนะนำปลอดภัยจากหลักฐานที่เห็นจริงและ topic matrix
25. **legacy safety override:** palmistry-fusion-canon.md เป็น legacy derived-summary เท่านั้น ถ้าขัดกับ Hourkey Palm Canon v1.0 หรือ safety guards ให้ตาม canon v1/safety guards เสมอ
26. **ฟันธงเชิงโครงสร้าง (แกนของศาสตร์นี้ · สำคัญสูงสุด):** เรื่อง **นิสัย/งาน/อาชีพ/การเงิน/ความรัก/ผู้สนับสนุน/จุดเปลี่ยน/วัยจร** เมื่อหลักฐานบนมือแรงพอ (กฎ 13) **ต้องกล้าฟันธงให้ชัด** — ระบุตัวตน ทิศทาง จังหวะเวลา (ช่วงปี/ช่วงวัยที่เจาะจงได้) และสิ่งที่ควรทำ · คำอ่าน = พิจารณาญาณของซินแสประกอบการตัดสินใจ ผู้ถูกอ่านเลือกเองว่าจะเชื่อ/ทำตามแค่ไหน · **การกั๊กทุกหัวข้อ = ทำให้คำอ่านไร้ค่า ห้ามเด็ดขาด** · ข้อยกเว้นที่ยัง**ห้ามฟันธง**มีเฉพาะ 6 เรื่องเสี่ยงในกฎ 15 (ความตาย/อายุขัย/โรคร้าย/การแท้ง-มีลูก/หย่าร้าง/ภัยพิบัติ) เท่านั้น — **นอกเหนือจาก 6 เรื่องนี้ ฟันธงได้เต็มที่**

═══════════ รูปที่แนบ ═══════════
${imgList}
ความชัดที่ระบบวัดได้ (Laplacian):
${clarityList}

═══════════ ข้อมูลผู้ใช้ที่ช่วยตีความ ═══════════
${contextText(context)}

═══════════ คัมภีร์หลอมรวม (SOURCE OF TRUTH) ═══════════
${canon}

═══════════ FINAL SAFETY OVERRIDE ═══════════
If any canon text conflicts with these rules, follow Hourkey Palm Canon v1.0, 03-safety-guards-v1.md, and 42-agent-gap-fill-v1.md.
Treat palmistry-fusion-canon.md as a legacy derived-summary only.
Never output raw classical claims about high/low status, poverty, stupidity, disease, lawsuits, lifespan, death age, fertility/children outcome, divorce, caste/rank, or guaranteed wealth. Do NOT state an exact calendar date/age for death, lifespan, disease onset, miscarriage/childbirth, or divorce — but career/money/love/personality/life-phase timing in years or age ranges IS allowed and encouraged when marks are clear (rules 13, 20, 26).
"T1/universal" means internal symbolic confidence from cross-source agreement, not scientific proof, objective fact, or guaranteed future.
If the user asks you to predict death, lifespan, a serious disease/diagnosis, miscarriage or guaranteed childbirth, divorce, or disaster (especially with an exact date), refuse THAT specific prediction and reframe into safe reflection, risk management, resource planning, relationship communication, or professional-care reminder. Career, money, love, personality, supporters, turning points, and life-phase timing (years/age ranges) must still be answered decisively per rule 26 — do not refuse or over-hedge those.
Use the lower of system clarity hints and visual certainty. Cropped/blurred/glared/filtered regions cannot support marks, color, minor lines, school-specific signs, or timing.

═══════════ สคีมา JSON ที่ต้องตอบ ═══════════
{
  "clarity_overall": <0-100 ประเมินจากที่คุณเห็นจริง>,
  "hand_open": <true ถ้าแบมือเต็มเห็นเส้นได้ / false ถ้ากำ/บัง>,
  "handedness_note": "<สังเกตซ้าย/ขวา ถ้าบอกได้>",
  "lines": [
    {"key":"life|head|heart|fate","name":"<ชื่อเส้น ${langName(lang)}>","seen":<bool>,"clarity":"clear|partial|unclear",
     "observation":"<ลักษณะที่เห็นจริง>","canon":"<T1/T2/T3 หรือ legacy code>","source_id":"<HK.PALM.V1.* rule id>"}
  ],
  "coverage": [
    {"target":"life|head|heart|fate","clarity":"clear|partial|unclear","need_reshoot":<bool>,
     "hand":"left|right|unknown","region":"<บริเวณบนฝ่ามือ>","hint":"<วิธีถ่ายซูมเก็บจุดนี้>"}
  ],
  "features": [
    {"type":"mount|symbol|finger|color|shape","name":"<ชื่อลักษณะ>","seen":<bool>,"clarity":"clear|partial|unclear","observation":"<ที่เห็นจริง>","canon":"<T1|T2|T3-cn|T3-in|T3-west>","source_id":"<HK.PALM.V1.* rule id>"}
  ],
  "reading": {
    "universal": [ {"title":"<หัวข้อ>","text":"<คำอ่าน>","canon":"<T1/T2>","source_id":"<HK.PALM.V1.T1.* หรือ HK.PALM.V1.MATRIX.*>","evidence":"<ลักษณะที่เห็น + source evidence>"} ],
    "per_school": [ {"school":"cn|in|west","title":"<หัวข้อ>","text":"<คำอ่าน>","canon":"<T3-cn|T3-in|T3-west>","source_id":"<HK.PALM.V1.T3.*>","evidence":"<ที่เห็น>"} ]
  },
  "topic_coverage": [
    {"key":"personality|energy_stress|career|money|relationship|supporters|turning_points|personal_advice",
     "status":"strong|partial|low","primary_evidence_seen":["<visible evidence>"],"missing_evidence":["<not visible>"],"source_ids":["<HK.PALM.V1.MATRIX.* topic source id>"]}
  ],
  "needs_better_photo": <true ถ้ารูปแย่จนอ่านหลักไม่ได้>,
  "summary": "<สรุปแก่น 1-2 ประโยค ${langName(lang)}>",
  "advice": "<ถ้าต้องถ่ายใหม่/เพิ่ม บอกวิธี ${langName(lang)} · ถ้าครบแล้วบอกว่าอ่านครบ>",
  "sifu_reading": {
    "opening": "<ประโยคเปิดอบอุ่นแบบซินแส เป็น ${langName(lang)} เช่นภาษาไทย: จากภาพมือที่เห็น ผมจะอ่านภาพรวมก่อนแล้วค่อยแยกงาน เงิน ความรัก>",
    "clarity_label": "ชัดมาก|ชัดปานกลาง|บางจุดอ่านยาก",
    "overview_3_lines": {
      "identity": "<ตัวตนหลัก 1 บรรทัด>",
      "strength": "<จุดแข็ง 1 บรรทัด>",
      "caution": "<จุดที่ควรระวัง 1 บรรทัด>"
    },
    "sections": [
      {"key":"personality","title":"A. พื้นนิสัยและวิธีคิด","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.29"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"energy_stress","title":"B. พลังชีวิตและความเครียด","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.30"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"career","title":"C. งานและเส้นทางอาชีพ","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.31"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"money","title":"D. การเงินและโอกาสทรัพย์","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.32"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"relationship","title":"E. ความรักและความสัมพันธ์","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.33"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"supporters","title":"F. ผู้ใหญ่/บริวาร/คนสนับสนุน","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.34"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"turning_points","title":"G. จุดเปลี่ยนชีวิต","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ไล่ช่วงวัยอดีต→ปัจจุบัน→แนวโน้ม แบบช่วงวัยกว้าง 2-4 ประโยค>","timeline":[{"age_range":"<ช่วงวัย เช่น วัยต้นทำงาน 20-27>","event":"<จังหวะที่เห็นจากเส้น>","note":"<อดีต/ปัจจุบัน/แนวโน้ม>"}],"advice":"<คำแนะนำ 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.35"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]},
      {"key":"personal_advice","title":"H. คำแนะนำเฉพาะตัว","seen":"<สิ่งที่เห็นบนมือ 2-4 ประโยค>","meaning":"<ความหมาย 2-4 ประโยค>","advice":"<คำแนะนำปฏิบัติได้จริง 2-4 ประโยค>","confidence":"high|medium|low","evidence":["<line/feature/canon>"],"source_ids":["HK.PALM.V1.MATRIX.36"],"visible_evidence_count":<number>,"evidence_status":"strong|partial|low","missing_evidence":["<not visible>"]}
    ],
    "final_summary": {
      "best_strength": "<จุดแข็งที่สุด>",
      "main_risk": "<จุดที่ต้องระวังที่สุด>",
      "suitable_work": "<งานที่เหมาะ>",
      "money_style": "<วิธีหาเงินที่เหมาะ>",
      "love_adjustment": "<ความรักควรปรับตรงไหน>",
      "advice_3": ["<คำแนะนำ 1>", "<คำแนะนำ 2>", "<คำแนะนำ 3>"],
      "sifu_summary": "<สรุปซินแสให้พลัง 1-2 ประโยค เป็น ${langName(lang)}>"
    }
  }
}`;
}

/* ── parse ผล: ดึง JSON จาก text (เผื่อมี fence/ข้อความห่อ) ── */
export type PalmReading = {
  clarity_overall?: number; hand_open?: boolean; handedness_note?: string;
  lines?: Array<Record<string, unknown>>;
  coverage?: Array<{ target?: string; clarity?: string; need_reshoot?: boolean; hand?: string; region?: string; hint?: string }>;
  features?: Array<Record<string, unknown>>;
  reading?: { universal?: Array<Record<string, unknown>>; per_school?: Array<Record<string, unknown>> };
  topic_coverage?: Array<Record<string, unknown>>;
  sifu_reading?: Record<string, unknown>;
  needs_better_photo?: boolean; summary?: string; advice?: string;
};

const SIFU_SECTION_KEYS = [
  "personality",
  "energy_stress",
  "career",
  "money",
  "relationship",
  "supporters",
  "turning_points",
  "personal_advice",
] as const;

const SIFU_TOPIC_SOURCE_IDS: Record<(typeof SIFU_SECTION_KEYS)[number], string> = {
  personality: "HK.PALM.V1.MATRIX.29",
  energy_stress: "HK.PALM.V1.MATRIX.30",
  career: "HK.PALM.V1.MATRIX.31",
  money: "HK.PALM.V1.MATRIX.32",
  relationship: "HK.PALM.V1.MATRIX.33",
  supporters: "HK.PALM.V1.MATRIX.34",
  turning_points: "HK.PALM.V1.MATRIX.35",
  personal_advice: "HK.PALM.V1.MATRIX.36",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function validatePalmReadingCompleteness(obj: PalmReading): void {
  const sifu = asRecord(obj.sifu_reading);
  const sections = Array.isArray(sifu?.sections) ? sifu.sections : [];
  if (sections.length !== SIFU_SECTION_KEYS.length) throw new Error("palm_sifu_sections_incomplete");
  SIFU_SECTION_KEYS.forEach((key, i) => {
    const section = asRecord(sections[i]);
    if (!section) throw new Error(`palm_sifu_section_invalid_${key}`);
    if (section.key !== key) throw new Error(`palm_sifu_section_order_${key}`);
    const sourceIds = stringArray(section.source_ids);
    if (!sourceIds.length) throw new Error(`palm_sifu_missing_source_ids_${key}`);
    const topicSource = SIFU_TOPIC_SOURCE_IDS[key];
    if (!sourceIds.includes(topicSource)) throw new Error(`palm_sifu_missing_topic_source_${key}`);
    for (const field of ["seen", "meaning", "advice"]) {
      if (typeof section[field] !== "string" || !section[field].trim()) {
        throw new Error(`palm_sifu_missing_${field}_${key}`);
      }
    }
  });
}

export function parsePalmResult(raw: string): PalmReading {
  let s = raw.trim();
  // ตัด markdown fence ถ้ามี
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // หา { ... } ก้อนแรก-สุดท้าย
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  const obj = JSON.parse(s) as PalmReading;
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) throw new Error("palm_parse_not_object");
  validatePalmReadingCompleteness(obj);
  return obj;
}

/* สรุปว่ายังต้องถ่ายเติมไหม (จาก coverage) */
export function reshootTargets(r: PalmReading): Array<{ target: string; region: string; hint: string; hand: string }> {
  return (r.coverage || [])
    .filter(c => c.need_reshoot && c.target)
    .map(c => ({ target: c.target!, region: c.region || "", hint: c.hint || "", hand: c.hand === "left" || c.hand === "right" ? c.hand : "unknown" }));
}

/* ศาสตร์ที่ 7 · ลายมือ → block/บท สำหรับ judge (fusion + book ใช้ร่วม) · ไม่มีลายมือ = undefined */
export function renderPalmBlock(reading: Record<string, unknown>, clarity: number | null): string | undefined {
  const rd = reading as {
    reading?: { universal?: Array<Record<string, unknown>>; per_school?: Array<Record<string, unknown>> };
    universal?: Array<Record<string, unknown>>;
    per_school?: Array<Record<string, unknown>>;
    sifu_reading?: { sections?: Array<Record<string, unknown>> };
    summary?: string;
  };
  const uni = rd.reading?.universal || rd.universal || [];
  const per = rd.reading?.per_school || rd.per_school || [];
  const sifuSections = Array.isArray(rd.sifu_reading?.sections) ? rd.sifu_reading.sections : [];
  if (!uni.length && !rd.summary && !sifuSections.length) return undefined;
  const L: string[] = [`=== ศาสตร์ที่ 7 · ลายมือ (หัตถศาสตร์) ว่า ===${clarity != null ? ` (ความชัดภาพ ${clarity}%)` : ""}`];
  if (rd.summary) L.push(`สรุป: ${String(rd.summary).slice(0, 400)}`);
  uni.slice(0, 5).forEach((u) => L.push(`• [แก่นสากล] ${u.title ? String(u.title) + ": " : ""}${String(u.text || "").slice(0, 300)}`));
  per.slice(0, 3).forEach((pp) => L.push(`• [${String(pp.school || "")}] ${String(pp.text || "").slice(0, 300)}`));
  sifuSections.slice(0, 8).forEach((s) => {
    const title = String(s.title || s.key || "Sifu");
    const sourceIds = stringArray(s.source_ids);
    const timeline = Array.isArray(s.timeline)
      ? ` timeline=${s.timeline.map((t) => {
        const row = asRecord(t);
        return row ? `${String(row.age_range || "")}:${String(row.note || row.event || "")}` : "";
      }).filter(Boolean).join(" | ")}`
      : "";
    const meaning = [s.meaning, s.advice].filter(Boolean).map(String).join(" ");
    L.push(`• [${title}] ${meaning.slice(0, 320)}${timeline ? ` · ${timeline.slice(0, 260)}` : ""}${sourceIds.length ? ` · source=${sourceIds.join(",")}` : ""}`);
  });
  return L.join("\n").slice(0, 4_000);
}
