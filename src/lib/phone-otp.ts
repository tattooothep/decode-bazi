// จัดการ OTP สำหรับเบอร์โทร · เก็บใน table phone_otp
import crypto from "node:crypto";
import { q1 } from "@/lib/db";

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export function normalizePhone(p: string): string {
  const s = String(p || "").replace(/[\s-]/g, "");
  if (s.startsWith("+66")) return "0" + s.slice(3);
  if (s.startsWith("66") && s.length === 11) return "0" + s.slice(2);
  return s;
}

export function isValidThaiMobile(p: string): boolean {
  return /^0[689]\d{8}$/.test(p);
}

export async function createOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
  await q1(
    `INSERT INTO phone_otp (phone, code, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (phone) DO UPDATE SET code=$2, expires_at=$3, attempts=0, created_at=now()`,
    [phone, code, expires]
  );
  return code;
}

export async function verifyOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const row = await q1<{ code: string; expires_at: string; attempts: number }>(
    `SELECT code, expires_at, attempts FROM phone_otp WHERE phone=$1`,
    [phone]
  );
  if (!row) return { ok: false, error: "ยังไม่ได้ส่ง OTP · กรุณาส่งใหม่" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "OTP หมดอายุ · กรุณาส่งใหม่" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "ลองเกินกำหนด · กรุณาส่ง OTP ใหม่" };
  if (row.code !== code) {
    await q1(`UPDATE phone_otp SET attempts=attempts+1 WHERE phone=$1`, [phone]);
    return { ok: false, error: "OTP ไม่ถูกต้อง" };
  }
  // ใช้ได้ ลบทิ้ง
  await q1(`DELETE FROM phone_otp WHERE phone=$1`, [phone]);
  return { ok: true };
}
