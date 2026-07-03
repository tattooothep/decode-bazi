/**
 * account-utils.ts · helper กลางของ /api/account/* (Account Phase 1 · r378)
 * additive ล้วน — ไม่แตะ src/lib/auth.ts (LOCKED) · แค่ import getSession มาใช้
 */
import { createHash } from "node:crypto";
import { getSession, type Session } from "@/lib/auth";
import { q1 } from "@/lib/db";

export type AccountUser = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  google_user_id: string | null;
  line_user_id: string | null;
  avatar_url: string | null;
  avatar_updated_at: string | null;
  locale: string | null;
  timezone: string | null;
  theme: string | null;
  tier: string | null;
  hour_balance: number | null;
  sub_expires_at: string | null;
  phone: string | null;
  created_at: string;
  deleted_at: string | null;
  current_org_id: string | null;
};

/** session + user row ที่ยังไม่ถูกลบ (soft-delete แล้ว = 401 ทุก endpoint บัญชี) */
export async function getAccountUser(): Promise<{ s: Session; u: AccountUser } | null> {
  const s = await getSession();
  if (!s) return null;
  const u = await q1<AccountUser>(
    `SELECT id, email, name, password_hash, google_user_id, line_user_id,
            avatar_url, avatar_updated_at, locale, timezone, theme,
            tier, hour_balance, sub_expires_at, phone, created_at,
            deleted_at, current_org_id
       FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [s.userId]
  );
  if (!u) return null;
  return { s, u };
}

/** hash อุปกรณ์จาก deviceId (client สุ่มเก็บ localStorage) + UA · ไม่เก็บค่าดิบ */
export function deviceHash(deviceId: string, ua: string): string {
  return createHash("sha256").update(`${deviceId}|${ua}`).digest("hex").slice(0, 64);
}

/** hash IP แบบตัดสั้น (PDPA: ไม่เก็บ IP ดิบ · พอไว้แยกเครื่อง/ที่มา) */
export function ipHash(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function clientIpFrom(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  return (xf.split(",")[0] || "").trim() || req.headers.get("x-real-ip") || "";
}
