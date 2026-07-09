// Google OAuth · hourkey.io
// ใช้ google-auth-library + postgres + jose JWT session
import { OAuth2Client } from "google-auth-library";
import crypto from "node:crypto";
import { q1 } from "@/lib/db";
import { SignJWT, jwtVerify } from "jose";
import { normalizeAffiliateCode } from "@/lib/affiliate";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  "https://hourkey.io/api/auth/google/callback";

const STATE_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || (() => { throw new Error("AUTH_SECRET required (oauth-google)"); })()  // 1 มิ.ย. · เลิก dev-secret fallback ที่หลุดผ่าน zip · fail-closed
);

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

function safeNext(path: unknown): string | null {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
    ? path
    : null;
}

export function isReady(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

function makeClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export async function buildState(next?: string | null, referralCode?: string | null): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: { nonce: string; next?: string; ref?: string } = { nonce };
  const safe = safeNext(next);
  if (safe) payload.next = safe;
  const ref = normalizeAffiliateCode(referralCode);
  if (ref) payload.ref = ref;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(STATE_SECRET);
}

export async function verifyState(state: string): Promise<{ next: string | null; ref: string | null } | null> {
  try {
    const { payload } = await jwtVerify(state, STATE_SECRET);
    return { next: safeNext(payload.next), ref: normalizeAffiliateCode(payload.ref) };
  } catch {
    return null;
  }
}

export function buildAuthUrl(state: string): string {
  const client = makeClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "select_account",
    state,
  });
}

export type GoogleProfile = {
  google_sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export async function handleCallback(code: string): Promise<GoogleProfile> {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("missing id_token from Google");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("invalid id_token payload");
  if (!payload.email_verified) throw new Error("email ยังไม่ถูกยืนยัน");
  return {
    google_sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    name: payload.name || String(payload.email).split("@")[0],
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

export async function findOrCreateUser(p: GoogleProfile): Promise<UserRow> {
  // หาจาก google_user_id ก่อน · ไม่เจอ → หาจาก email · ไม่เจอ → สร้าง
  let user = await q1<{
    id: string;
    email: string;
    name: string | null;
    current_org_id: string | null;
  }>(
    `SELECT id, email, name, current_org_id FROM users WHERE google_user_id=$1`,
    [p.google_sub]
  );
  if (user) {
    await q1(
      `UPDATE users SET avatar_url=COALESCE($2, avatar_url), last_active_at=now(), email_verified=true WHERE id=$1`,
      [user.id, p.picture]
    );
    return { ...user, is_new: false };
  }
  // ลองจาก email — เผื่อสมัครด้วย password มาก่อน · ผูก google_user_id เพิ่ม
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
      `UPDATE users SET google_user_id=$2, avatar_url=COALESCE($3, avatar_url), last_active_at=now(), email_verified=true WHERE id=$1`,
      [user.id, p.google_sub, p.picture]
    );
    return { ...user, is_new: false };
  }
  // สร้างใหม่ + org
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  await q1(
    `INSERT INTO users (id, email, google_user_id, name, avatar_url, locale, timezone, theme, email_verified, is_active, created_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, 'th', 'Asia/Bangkok', 'dark', true, true, now(), now())`,
    [userId, p.email, p.google_sub, p.name, p.picture]
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
    email: p.email,
    name: p.name,
    current_org_id: orgId,
    is_new: true,
  };
}

export async function linkGoogleToUser(userId: string, p: GoogleProfile): Promise<UserRow> {
  const linked = await q1<{ id: string }>(
    `SELECT id FROM users WHERE google_user_id=$1`,
    [p.google_sub]
  );
  if (linked && linked.id !== userId) {
    throw new Error("Google นี้ถูกผูกกับบัญชีอื่นแล้ว");
  }

  const emailOwner = await q1<{ id: string }>(
    `SELECT id FROM users WHERE email=$1`,
    [p.email]
  );
  if (emailOwner && emailOwner.id !== userId) {
    throw new Error("อีเมล Google นี้มีบัญชีอยู่แล้ว · กรุณาเข้าสู่บัญชีนั้นก่อนรวมบัญชี");
  }

  const user = await q1<{
    id: string;
    email: string;
    name: string | null;
    current_org_id: string | null;
  }>(
    `UPDATE users
        SET google_user_id=$2,
            email=CASE
              WHEN email LIKE 'phone.%@hourkey.local' OR email LIKE 'line.%@line.local' THEN $4
              ELSE email
            END,
            avatar_url=COALESCE($3, avatar_url),
            email_verified=CASE
              WHEN email=$4 OR email LIKE 'phone.%@hourkey.local' OR email LIKE 'line.%@line.local' THEN true
              ELSE email_verified
            END,
            last_active_at=now()
      WHERE id=$1
      RETURNING id, email, name, current_org_id`,
    [userId, p.google_sub, p.picture, p.email]
  );
  if (!user) throw new Error("ไม่พบบัญชีที่กำลังใช้งาน");
  return { ...user, is_new: false };
}
