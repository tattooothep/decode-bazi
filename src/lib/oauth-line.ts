// LINE Login · hourkey.io
// ใช้ fetch + jose (verify id_token HS256 ด้วย channel_secret)
import crypto from "node:crypto";
import { q1 } from "@/lib/db";
import { SignJWT, jwtVerify } from "jose";

const CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID || "";
const CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET || "";
const CALLBACK_URL =
  process.env.LINE_LOGIN_CALLBACK_URL ||
  "https://hourkey.io/api/auth/line/callback";

const STATE_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "decode-dev-secret-change-in-production-please-2026"
);

const SCOPES = ["profile", "openid", "email"];

const AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export function isReady(): boolean {
  return !!CHANNEL_ID && !!CHANNEL_SECRET;
}

export async function buildState(): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(STATE_SECRET);
}

export async function verifyState(state: string): Promise<boolean> {
  try {
    await jwtVerify(state, STATE_SECRET);
    return true;
  } catch {
    return false;
  }
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CHANNEL_ID,
    redirect_uri: CALLBACK_URL,
    state,
    scope: SCOPES.join(" "),
    bot_prompt: "normal",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
};

export type LineProfile = {
  line_sub: string;
  email: string | null;
  name: string;
  picture: string | null;
};

export async function handleCallback(code: string): Promise<LineProfile> {
  // exchange code → tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK_URL,
      client_id: CHANNEL_ID,
      client_secret: CHANNEL_SECRET,
    }).toString(),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text().catch(() => "");
    throw new Error(`LINE token exchange failed: ${tokenRes.status} ${t}`);
  }
  const tokens = (await tokenRes.json()) as TokenResponse;

  // verify id_token ผ่าน LINE verify endpoint (ปลอดภัยกว่า verify ด้วย channel_secret ฝั่งเรา)
  const verifyRes = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: tokens.id_token,
      client_id: CHANNEL_ID,
    }).toString(),
  });
  if (!verifyRes.ok) {
    const t = await verifyRes.text().catch(() => "");
    throw new Error(`LINE id_token verify failed: ${verifyRes.status} ${t}`);
  }
  const payload = (await verifyRes.json()) as {
    iss: string;
    sub: string;
    aud: string;
    name?: string;
    picture?: string;
    email?: string;
  };

  return {
    line_sub: payload.sub,
    email: payload.email ? payload.email.toLowerCase() : null,
    name: payload.name || `LINE ${payload.sub.slice(0, 6)}`,
    picture: payload.picture || null,
  };
}

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  current_org_id: string | null;
  is_new: boolean;
};

export async function findOrCreateUser(p: LineProfile): Promise<UserRow> {
  // หาจาก line_user_id ก่อน
  let user = await q1<{
    id: string;
    email: string;
    name: string | null;
    current_org_id: string | null;
  }>(
    `SELECT id, email, name, current_org_id FROM users WHERE line_user_id=$1`,
    [p.line_sub]
  );
  if (user) {
    await q1(
      `UPDATE users SET avatar_url=COALESCE($2, avatar_url), last_active_at=now() WHERE id=$1`,
      [user.id, p.picture]
    );
    return { ...user, is_new: false };
  }
  // ถ้ามี email และตรงกับ user ปกติ — ผูก line_user_id เพิ่ม
  if (p.email) {
    user = await q1<{
      id: string;
      email: string;
      name: string | null;
      current_org_id: string | null;
    }>(
      `SELECT id, email, name, current_org_id FROM users WHERE email=$1`,
      [p.email]
    );
    if (user) {
      await q1(
        `UPDATE users SET line_user_id=$2, avatar_url=COALESCE($3, avatar_url), last_active_at=now() WHERE id=$1`,
        [user.id, p.line_sub, p.picture]
      );
      return { ...user, is_new: false };
    }
  }
  // สร้าง user ใหม่ + org
  // LINE บางคนไม่ให้ email — ใช้ placeholder line:<sub>@line.local
  const email = p.email || `line.${p.line_sub.slice(0, 12)}@line.local`;
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  await q1(
    `INSERT INTO users (id, email, line_user_id, name, avatar_url, locale, timezone, theme, email_verified, is_active, created_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, 'th', 'Asia/Bangkok', 'dark', $6, true, now(), now())`,
    [userId, email, p.line_sub, p.name, p.picture, !!p.email]
  );
  await q1(
    `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [orgId, userId, `${p.name}'s Workspace`, orgId.slice(0, 8)]
  ).catch(async () => {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [
      orgId,
      p.name,
    ]);
  });
  await q1(
    `INSERT INTO org_members (org_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', now())`,
    [orgId, userId]
  ).catch(() => null);
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  return {
    id: userId,
    email,
    name: p.name,
    current_org_id: orgId,
    is_new: true,
  };
}
