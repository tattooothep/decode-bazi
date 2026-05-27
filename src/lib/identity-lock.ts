/**
 * identity-lock · 27 พ.ค. 2026
 * ตัวล็อก "ตัวตนหลัก" (日干) ของคำตอบ AI ซินแส — กันอ่านผิดคนละดวง (เช่น 己 → มโนเป็น 壬)
 *
 * ทำไมต้องมี: prompt สั่งได้แค่ "ขอร้อง" (probabilistic) · ตัวล็อกจริงต้องเป็น "โค้ดเทียบแล้วตัด" (deterministic)
 * วิธี: บังคับ AI ขึ้นต้นคำตอบด้วยบรรทัด machine-readable ⟦ID⟧日干=X⟧ (echo ก้านวันจาก FACT LOCK)
 *       → โค้ดดึงก้านนั้นมาเทียบ calc.dayMaster → ไม่ตรง/ไม่มี = ตัดทิ้ง (strict)
 *
 * เทียบเฉพาะ 日干 (ก้านจีน 1/10) — hard fact จาก engine · ผิด = คนละดวง 100%
 * (格局/用神 มีมุมตีความ → ไม่เอามา gate กัน false-reject · ปล่อย prompt rule คุม)
 * ก้านจีน language-agnostic → ใช้ชุดเดียวทุกภาษา TH/EN/ZH
 */

const TEN_STEMS = new Set(["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]);

/** ดึงก้านวันจากบรรทัด ID ที่ AI ต้องขึ้นต้น · null ถ้าไม่มี/รูปแบบผิด */
export function parseIdLine(text: string): string | null {
  // ⟦⟧ = U+27E6/U+27E7 · ไม่โผล่ในเนื้อคำตอบปกติ → false-match เกือบ 0
  const m = text.match(/⟦ID⟧\s*日干\s*=\s*(.)\s*⟧/);
  if (!m) return null;
  const stem = m[1];
  return TEN_STEMS.has(stem) ? stem : null;
}

/** ลบบรรทัด ID ออกก่อนส่งให้ user เห็น (กัน ⟦ID⟧ โผล่) */
export function stripIdLine(text: string): string {
  return text.replace(/^\s*⟦ID⟧[^⟧]*⟧[ \t]*\r?\n?/, "");
}

export type IdentityCheck = {
  ok: boolean;
  parsedDM: string | null;
  reason: "ok" | "no_id_line" | "dm_mismatch" | "skip_no_expected";
};

/**
 * เทียบ 日干 ที่ AI echo กับที่ engine คำนวณ (expectedDM)
 * - expectedDM ว่าง (ไม่มีดวง/intro/ทั่วไป) → skip = PASS (ไม่มีอะไรให้เทียบ)
 * - มี expectedDM แต่ AI ไม่ใส่ ID line → fail (strict · จะ retry)
 * - ก้านไม่ตรง → fail (อ่านผิดคนละดวง)
 */
export function validateIdentity(text: string, expectedDM: string | null | undefined): IdentityCheck {
  if (!expectedDM || !TEN_STEMS.has(expectedDM)) {
    return { ok: true, parsedDM: null, reason: "skip_no_expected" };
  }
  const parsed = parseIdLine(text);
  if (!parsed) return { ok: false, parsedDM: null, reason: "no_id_line" };
  if (parsed !== expectedDM) return { ok: false, parsedDM: parsed, reason: "dm_mismatch" };
  return { ok: true, parsedDM: parsed, reason: "ok" };
}

/** ดึง expectedDM จาก ctx (FACT LOCK ที่ engine ฝังไว้) · ไม่ต้องเปลี่ยน signature buildBaziContext */
export function extractExpectedDM(ctx: string): string | null {
  const m = ctx.match(/FACT LOCK: Day Master = (\S+)/);
  if (!m) return null;
  const stem = m[1];
  return TEN_STEMS.has(stem) ? stem : null;
}
