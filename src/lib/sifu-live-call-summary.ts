/**
 * สมุดดวง — สรุปสายคุยสดซินแส (4 ส.ค. 2569)
 *
 * ตัวประกอบ "บันทึกสรุปหลังวางสาย" ลงประวัติซินแสเดิม (research_ai_messages
 * feature sifu_master) — ระหว่างสาย ทุกคำถามโหมด relay ถูกบันทึกรายคู่ผ่าน
 * /api/sifu อยู่แล้ว ไฟล์นี้ทำแค่ "ใบสรุประดับสาย" 1 แถว ให้ย้อนอ่านง่าย
 *
 * เก็บดิบแบบย่อ (deterministic) ไม่เรียกโมเดลสรุป — คำตอบเต็มของแต่ละคำถาม
 * มีในประวัติรายคู่อยู่แล้ว (ถ้าวันหน้าจะให้ AI สรุป ค่อยเสียบแทน buildAnswer)
 *
 * pure ล้วน ไม่มี DB/Next — ด่านทดสอบยิงตรงได้
 */

export const SIFU_LIVE_SUMMARY_SOURCE = "sifu_live_call_summary" as const;

export const SIFU_LIVE_SUMMARY_MAX_PAIRS = 40;
const MAX_QUESTION_SCALARS = 2_000;
const MAX_ANSWER_SCALARS = 8_000;
/** ในใบสรุป ตัดคำตอบต่อข้อให้อ่านไว — ฉบับเต็มอยู่ในประวัติรายคู่ */
const DIGEST_ANSWER_SCALARS = 700;
const MAX_TOTAL_ANSWER_CHARS = 20_000;
const MAX_DURATION_SEC = 4 * 3_600;

const CONVERSATION_ID = /^cnv_[0-9a-f]{32}$/u;

export type SifuLiveSummaryLang = "en" | "th" | "zh";

export type SifuLiveSummaryPair = Readonly<{ answer: string; question: string }>;

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

function clipScalars(text: string, maximum: number): string {
  const scalars = Array.from(text);
  return scalars.length > maximum
    ? `${scalars.slice(0, maximum).join("")}…`
    : text;
}

export function cleanSifuLiveSummaryLang(value: unknown): SifuLiveSummaryLang {
  return value === "en" || value === "zh" ? value : "th";
}

export function cleanSifuLiveConversationId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return CONVERSATION_ID.test(text) ? text : null;
}

export function cleanSifuLiveDurationSec(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(MAX_DURATION_SEC, Math.floor(num));
}

/**
 * คู่ถาม-ตอบจากแอพ — เกินเพดานจำนวน = เก็บ "คู่ท้ายสุด" (เรื่องล่าสุดของสาย)
 * คู่ที่ขาดฝั่งใดฝั่งหนึ่ง = ทิ้ง (กันเหตุการณ์ค้างท่อครึ่งเดียว)
 */
export function cleanSifuLiveSummaryPairs(value: unknown): SifuLiveSummaryPair[] {
  if (!Array.isArray(value)) return [];
  const out: SifuLiveSummaryPair[] = [];
  for (const item of value.slice(-SIFU_LIVE_SUMMARY_MAX_PAIRS * 2)) {
    if (!isPlainRecord(item)) continue;
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    if (!question || !answer) continue;
    out.push(Object.freeze({
      answer: clipScalars(answer, MAX_ANSWER_SCALARS),
      question: clipScalars(question, MAX_QUESTION_SCALARS),
    }));
  }
  return out.slice(-SIFU_LIVE_SUMMARY_MAX_PAIRS);
}

const HEAD: Record<SifuLiveSummaryLang, {
  ask: string; footer: string; minute: string; questions: string; reply: string; title: string;
}> = {
  th: {
    ask: "ถาม",
    footer: "(บันทึกอัตโนมัติหลังวางสาย · คำตอบฉบับเต็มของแต่ละคำถามอยู่ในประวัติซินแสตามปกติ)",
    minute: "นาที",
    questions: "คำถาม",
    reply: "ซินแสตอบ",
    title: "📞 สรุปสายคุยสดกับซินแส",
  },
  en: {
    ask: "Q",
    footer: "(Saved automatically after the call · full answers are kept in the master history as usual)",
    minute: "min",
    questions: "questions",
    reply: "Master",
    title: "📞 Live call with the master — summary",
  },
  zh: {
    ask: "問",
    footer: "(通話結束後自動保存 · 每個問題的完整回答仍在老師諮詢記錄中)",
    minute: "分鐘",
    questions: "個問題",
    reply: "老師",
    title: "📞 與老師即時通話摘要",
  },
};

function formatStamp(endedAt: Date): string {
  /* เวลาไทยตายตัวตามธรรมเนียมทั้งระบบ (Asia/Bangkok) */
  const bkk = new Date(endedAt.getTime() + 7 * 3_600_000);
  const dd = String(bkk.getUTCDate()).padStart(2, "0");
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(bkk.getUTCHours()).padStart(2, "0");
  const mi = String(bkk.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${bkk.getUTCFullYear()} ${hh}:${mi}`;
}

/**
 * ประกอบ 1 แถวสมุดดวง — question = หัวใบสรุป (โชว์ในลิสต์ประวัติ)
 * answer = เนื้อสรุปรายข้อ + หมายเหตุ
 */
export function buildSifuLiveCallSummaryEntry(input: Readonly<{
  durationSec: number;
  endedAt: Date;
  lang: SifuLiveSummaryLang;
  pairs: readonly SifuLiveSummaryPair[];
}>): Readonly<{ answer: string; question: string }> | null {
  if (input.pairs.length === 0) return null;
  const h = HEAD[input.lang] ?? HEAD.th;
  const minutes = Math.max(1, Math.ceil(input.durationSec / 60));
  const question = `${h.title} · ${formatStamp(input.endedAt)} · ${minutes} ${h.minute} · ${input.pairs.length} ${h.questions}`;

  const blocks: string[] = [];
  let used = 0;
  for (let i = 0; i < input.pairs.length; i++) {
    const pair = input.pairs[i];
    const block = `${i + 1}. ${h.ask}: ${pair.question}\n${h.reply}: ${clipScalars(pair.answer, DIGEST_ANSWER_SCALARS)}`;
    if (used + block.length > MAX_TOTAL_ANSWER_CHARS) break;
    used += block.length;
    blocks.push(block);
  }
  if (blocks.length === 0) return null;
  return Object.freeze({
    answer: `${blocks.join("\n\n")}\n\n${h.footer}`,
    question,
  });
}
