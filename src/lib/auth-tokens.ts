// จัดการ token สำหรับ verify email + reset password
import crypto from "node:crypto";
import { q1 } from "@/lib/db";

export type TokenKind = "email_verify" | "password_reset";

export async function createToken(userId: string, kind: TokenKind, ttlMinutes: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await q1(
    `INSERT INTO auth_tokens (token, user_id, kind, expires_at, used)
     VALUES ($1, $2, $3, $4, false)`,
    [token, userId, kind, expires]
  );
  return token;
}

export async function consumeToken(
  token: string,
  kind: TokenKind
): Promise<{ userId: string } | null> {
  const row = await q1<{ user_id: string; expires_at: string; used: boolean }>(
    `SELECT user_id, expires_at, used FROM auth_tokens WHERE token=$1 AND kind=$2`,
    [token, kind]
  );
  if (!row) return null;
  if (row.used) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  await q1(`UPDATE auth_tokens SET used=true WHERE token=$1`, [token]);
  return { userId: row.user_id };
}
