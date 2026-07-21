// จัดการ token สำหรับ verify email + reset password
import crypto from "node:crypto";
import { q1 } from "@/lib/db";

export type TokenKind = "email_verify" | "password_reset";

function tokenDigest(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createToken(userId: string, kind: TokenKind, ttlMinutes: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await q1(
    `INSERT INTO auth_tokens (token, user_id, kind, expires_at, used)
     VALUES ($1, $2, $3, now() + ($4::text || ' minutes')::interval, false)`,
    [tokenDigest(token), userId, kind, ttlMinutes]
  );
  return token;
}

export async function consumeToken(
  token: string,
  kind: TokenKind
): Promise<{ userId: string } | null> {
  const row = await q1<{ user_id: string }>(
    `UPDATE auth_tokens
        SET used=true
      WHERE token=$1 AND kind=$2 AND used=false AND expires_at > now()
      RETURNING user_id`,
    [tokenDigest(token), kind]
  );
  if (!row) return null;
  return { userId: row.user_id };
}
