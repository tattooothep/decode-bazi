/* src/lib/palm/prompt.ts · ศาสตร์ที่ 7 — สร้าง prompt อ่านลายมือ + parse ผล
 * คัมภีร์ = source of truth (fusion-canon 3 อารยธรรม) · ห้าม AI มั่ว · ทุกคำอ้างคัมภีร์+หลักฐานที่เห็นจริง
 */
import { readFile } from "fs/promises";
import path from "path";

const CANON_PATH = path.join(process.cwd(), "data/library/palmistry/palmistry-fusion-canon.md");
let _canonCache: string | null = null;
export async function loadPalmCanon(): Promise<string> {
  if (_canonCache) return _canonCache;
  _canonCache = await readFile(CANON_PATH, "utf8");
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
export type PalmImageMeta = { role: "left" | "right" | "closeup"; target?: string; label: string };

export function buildPalmPrompt(opts: {
  canon: string;
  lang: string;
  images: PalmImageMeta[];
  clarityHints: { label: string; clarity: number; advise: string }[];
}): string {
  const { canon, lang, images, clarityHints } = opts;
  const imgList = images.map((m, i) =>
    `  รูปที่ ${i + 1}: ${m.label}${m.target ? ` (โฟกัส: ${m.target})` : ""}`).join("\n");
  const clarityList = clarityHints.map(c => `  - ${c.label}: ความชัด ${c.clarity}% (${c.advise})`).join("\n");

  return `คุณคือซินแสผู้เชี่ยวชาญ "ศาสตร์การดูลายมือหลอมรวม 3 อารยธรรม" (จีน 手相 · อินเดีย Samudrika · ตะวันตก Chiromancy)
หน้าที่ของคุณ: ดูรูปฝ่ามือที่แนบมา แล้วอ่านตาม "คัมภีร์" ด้านล่างอย่างเคร่งครัด

═══════════ กฎเหล็ก (ห้ามฝ่าฝืน) ═══════════
1. **ยึดคัมภีร์เป็น source of truth** — ทุกคำทำนายต้องมาจากคัมภีร์ด้านล่างเท่านั้น ห้ามแต่งความหมายเอง
2. **ห้ามมั่ว** — ถ้าเส้น/ลักษณะไหนมองไม่ชัดในรูป ให้ตั้ง seen=false หรือ clarity="unclear" และ **ห้ามทำนายจากมัน**
3. **ทุก reading ต้องมี evidence** — ระบุลักษณะจริงที่เห็นในรูป (เช่น "เส้นสมองยาวพาดถึงขอบฝ่ามือ") + อ้าง canon (เช่น "T1.5")
4. **แก่นสากล (T1) มาก่อน** — จุดที่ 3 อารยธรรมเห็นตรงกัน = ฟันธงมั่นใจสุด · T3 = เอกลักษณ์รายสาย ระบุที่มาว่าสายเดียว
5. **coverage** — สำหรับแต่ละเส้นหลัก 4 เส้น (life/head/heart/fate) บอกว่าเห็นชัดพอทำนายไหม · ถ้าไม่ชัด ตั้ง need_reshoot=true + บอก region + hint การถ่ายซูมเฉพาะจุดนั้น
6. เขียนค่า text/observation/hint/advice ทั้งหมดเป็น **${langName(lang)}** (แต่ key ของ JSON เป็นอังกฤษตามสคีมา)
7. ตอบเป็น **JSON เท่านั้น** ไม่มีข้อความอื่นนอก JSON ไม่มี markdown fence

═══════════ รูปที่แนบ ═══════════
${imgList}
ความชัดที่ระบบวัดได้ (Laplacian):
${clarityList}

═══════════ คัมภีร์หลอมรวม (SOURCE OF TRUTH) ═══════════
${canon}

═══════════ สคีมา JSON ที่ต้องตอบ ═══════════
{
  "clarity_overall": <0-100 ประเมินจากที่คุณเห็นจริง>,
  "hand_open": <true ถ้าแบมือเต็มเห็นเส้นได้ / false ถ้ากำ/บัง>,
  "handedness_note": "<สังเกตซ้าย/ขวา ถ้าบอกได้>",
  "lines": [
    {"key":"life|head|heart|fate","name":"<ชื่อเส้น ${langName(lang)}>","seen":<bool>,"clarity":"clear|partial|unclear",
     "observation":"<ลักษณะที่เห็นจริง>","canon":"<T1.x/T2/T3 ที่อ้าง>"}
  ],
  "coverage": [
    {"target":"life|head|heart|fate","clarity":"clear|partial|unclear","need_reshoot":<bool>,
     "region":"<บริเวณบนฝ่ามือ>","hint":"<วิธีถ่ายซูมเก็บจุดนี้>"}
  ],
  "features": [
    {"type":"mount|symbol|finger|color|shape","name":"<ชื่อลักษณะ>","observation":"<ที่เห็น>","canon":"<อ้างคัมภีร์>"}
  ],
  "reading": {
    "universal": [ {"title":"<หัวข้อ>","text":"<คำอ่าน>","canon":"<T1.x>","evidence":"<ลักษณะที่เห็น>"} ],
    "per_school": [ {"school":"cn|in|west","title":"<หัวข้อ>","text":"<คำอ่าน>","canon":"<T3 ที่อ้าง>","evidence":"<ที่เห็น>"} ]
  },
  "needs_better_photo": <true ถ้ารูปแย่จนอ่านหลักไม่ได้>,
  "summary": "<สรุปแก่น 1-2 ประโยค ${langName(lang)}>",
  "advice": "<ถ้าต้องถ่ายใหม่/เพิ่ม บอกวิธี ${langName(lang)} · ถ้าครบแล้วบอกว่าอ่านครบ>"
}`;
}

/* ── parse ผล: ดึง JSON จาก text (เผื่อมี fence/ข้อความห่อ) ── */
export type PalmReading = {
  clarity_overall?: number; hand_open?: boolean; handedness_note?: string;
  lines?: Array<Record<string, unknown>>;
  coverage?: Array<{ target?: string; clarity?: string; need_reshoot?: boolean; region?: string; hint?: string }>;
  features?: Array<Record<string, unknown>>;
  reading?: { universal?: Array<Record<string, unknown>>; per_school?: Array<Record<string, unknown>> };
  needs_better_photo?: boolean; summary?: string; advice?: string;
};

export function parsePalmResult(raw: string): PalmReading {
  let s = raw.trim();
  // ตัด markdown fence ถ้ามี
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // หา { ... } ก้อนแรก-สุดท้าย
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  const obj = JSON.parse(s) as PalmReading;
  if (typeof obj !== "object" || obj === null) throw new Error("palm_parse_not_object");
  return obj;
}

/* สรุปว่ายังต้องถ่ายเติมไหม (จาก coverage) */
export function reshootTargets(r: PalmReading): Array<{ target: string; region: string; hint: string }> {
  return (r.coverage || [])
    .filter(c => c.need_reshoot && c.target)
    .map(c => ({ target: c.target!, region: c.region || "", hint: c.hint || "" }));
}
