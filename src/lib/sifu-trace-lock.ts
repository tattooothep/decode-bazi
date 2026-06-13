/**
 * sifu-trace-lock · 13 มิ.ย. 2026 (เคส Swit รอบ 2 — 潤下格)
 * ตัวล็อก "ผลการเดินคัมภีร์ขั้นแรก" ของคำตอบ AI ซินแส — กันหยิบของผิดชั้นมาตั้งโครง
 *
 * ทำไมต้องมี: กฎ "เดินคัมภีร์ 13 ขั้นในใจก่อนตอบ" (r270) เป็นแค่คำขอ (probabilistic) — เคสจริง AI ยังลัด
 *   หยิบบรรทัดบุคลิก "โครง 5 ธาตุ (潤下格)" มาสวมเป็น 格局 ทั้งที่ packet ส่ง 格局=雜氣劫財格 มาถูกต้อง
 * วิธี (แบบเดียวกับ identity-lock ⟦ID⟧): บังคับ AI ขึ้นบรรทัดที่ 2 เป็นรหัส machine-readable
 *   ⟦TRACE⟧從=มี/ไม่มี·格局=X·用神=Y⟧ → โค้ดเทียบกับผังจริง → ไม่ตรง/ไม่มี = ตัดทิ้ง
 *   = บังคับให้ "เดินประตูฆ่า 3 ประตูแรก" (ตรวจ從格/專旺 → 格局 → 用神) ก่อนเขียนเนื้อเสมอ ลัดแล้วคำตอบไม่ออก
 *
 * ขอบเขต: เฉพาะดวงเดี่ยว (ctx มีบรรทัด "โครงดวง:" เดียว) — กลุ่ม/เทียบดวง = ข้าม (fail-open)
 * หลักเทียบ (กัน false-reject):
 *   - 格局: ตรงถ้า token ใดจากบรรทัดโครงดวงจริง (label หลัก/strict audit/化氣/從格ตรวจทาน) อยู่ในค่าที่ AI ตอบ
 *     (ก้ำกึ่ง 2 ทาง ใส่ทางไหนก็ผ่าน — ที่ไม่ผ่านคือของนอกบรรทัดโครงดวง เช่น 潤下格 จากบรรทัดบุคลิก)
 *   - 從: เทียบเฉพาะเคสชัด — ผังประกาศดวงพิเศษชัด=ต้อง "มี" · ผังไม่มีร่องรอย從/專旺/化氣เลย=ต้อง "ไม่มี"
 *     · เคสก้ำกึ่ง (candidate/候選) = ข้ามการเทียบช่องนี้
 *   - 用神: ต้องมีคำธาตุช่วยหลักจาก engine (ไทยหรือจีน)
 */

export type TraceFacts = {
  gejuTokens: string[];          // ชื่อโครงที่ยอมรับ
  yongWords: string[];           // คำธาตุช่วยหลักที่ยอมรับ (ไทย+จีน)
  congExpected: boolean | null;  // true=ต้องตอบมี · false=ต้องตอบไม่มี · null=ก้ำกึ่ง ข้ามการเทียบ
};

const EL_TH_TO_ZH: Record<string, string> = { "ไม้": "木", "ไฟ": "火", "ดิน": "土", "ทอง": "金", "น้ำ": "水" };
/* ร่องรอยตระกูลดวงพิเศษ (從格/專旺/化氣/一行得氣) ในบรรทัดโครง */
const SPECIAL_RE = /從|専旺|專旺|化氣|潤下|曲直|炎上|稼穡|從革|从/;

/** ดึงข้อเท็จจริงไว้เทียบจาก ctx · null = ข้ามการตรวจ (ไม่ใช่ดวงเดี่ยว/หาไม่เจอ — fail-open กัน false-reject) */
export function extractTraceFacts(ctx: string): TraceFacts | null {
  const structLines = ctx.match(/^โครงดวง: .+$/gm) || [];
  if (structLines.length !== 1) return null; // 0=ไม่มีดวง · >1=กลุ่ม/เทียบดวง → ข้าม
  const structLine = structLines[0];
  /* แหล่งชื่อโครงที่ถูกต้อง: โครงดวง + strict audit + 化氣 verdict + 從格ตรวจทาน + ดวงพิเศษ */
  const specialLines = ctx.match(/^ดวงพิเศษ: .+$/gm) || [];
  const sourceText = [
    structLine,
    ...(ctx.match(/^格局 strict audit.+$/gm) || []),
    ...(ctx.match(/^化氣格 verdict.+$/gm) || []),
    ...(ctx.match(/^從格ตรวจทาน.+$/gm) || []),
    ...specialLines,
  ].join(" · ");
  const gejuTokens = Array.from(new Set(sourceText.match(/[一-鿿]{1,10}格/g) || []));
  if (!gejuTokens.length) return null; // โครงไม่มีชื่อ格 (เคสพิเศษ) → ข้าม
  const ym = ctx.match(/ธาตุช่วยหลัก=([ก-๙]+)/);
  const yongTh = ym ? ym[1] : null;
  const yongWords = yongTh ? [yongTh, EL_TH_TO_ZH[yongTh] || ""].filter(Boolean) : [];
  /* 從 expected: ก้ำกึ่ง (มีคำ candidate/候選/ก้ำกึ่ง) → null · ประกาศดวงพิเศษ/โครงเป็นตระกูลพิเศษชัด → true · ไม่มีร่องรอยเลย → false */
  const ambiguous = /candidate|候選|ก้ำกึ่ง|2 สำนัก/.test(sourceText);
  const hasSpecial = specialLines.length > 0 || SPECIAL_RE.test(structLine);
  const congExpected = ambiguous ? null : hasSpecial;
  return { gejuTokens, yongWords, congExpected };
}

/** หา + แกะบรรทัด TRACE จากช่วงหัวคำตอบ (อยู่บรรทัดไหนในช่วงต้นก็ได้ · ⟦⟧ ไม่โผล่ในเนื้อปกติ) */
export function parseTraceLine(text: string): { cong: string; geju: string; yong: string } | null {
  const m = text.match(/⟦TRACE⟧\s*從\s*=\s*([^·⟧\n]+)·\s*格局\s*=\s*([^·⟧\n]+)·\s*用神\s*=\s*([^⟧\n]+)⟧/);
  if (!m) return null;
  return { cong: m[1].trim(), geju: m[2].trim(), yong: m[3].trim() };
}

/** ลบบรรทัด TRACE ก่อนส่งให้ user (อยู่ตำแหน่งไหนก็ลบ · ลบครั้งเดียว) */
export function stripTraceLine(text: string): string {
  return text.replace(/(^|\n)[ \t]*⟦TRACE⟧[^⟧\n]*⟧[ \t]*\r?\n?/, "$1");
}

export type TraceCheck = {
  ok: boolean;
  reason: "ok" | "skip_no_facts" | "no_trace_line" | "cong_mismatch" | "geju_mismatch" | "yong_mismatch";
  parsed?: { cong: string; geju: string; yong: string } | null;
};

export function validateTrace(text: string, facts: TraceFacts | null): TraceCheck {
  if (!facts) return { ok: true, reason: "skip_no_facts" };
  const parsed = parseTraceLine(text);
  if (!parsed) return { ok: false, reason: "no_trace_line", parsed: null };
  /* 從: ตอบ "ไม่" รูปแบบใดก็ได้ (ไม่มี/ไม่ใช่/ไม่เข้า/no/無) = no · นอกนั้น = yes */
  if (facts.congExpected !== null) {
    const saidNo = /ไม่|no|無|否/i.test(parsed.cong);
    if (facts.congExpected === saidNo) return { ok: false, reason: "cong_mismatch", parsed };
  }
  const gejuOk = facts.gejuTokens.some((t) => parsed.geju.includes(t) || (parsed.geju.length >= 2 && t.includes(parsed.geju)));
  if (!gejuOk) return { ok: false, reason: "geju_mismatch", parsed };
  if (facts.yongWords.length) {
    const yongOk = facts.yongWords.some((w) => parsed.yong.includes(w));
    if (!yongOk) return { ok: false, reason: "yong_mismatch", parsed };
  }
  return { ok: true, reason: "ok", parsed };
}
