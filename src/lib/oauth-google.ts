// Google OAuth · hourkey.io
// ใช้ google-auth-library + postgres + jose JWT session
import { OAuth2Client } from "google-auth-library";
import crypto from "node:crypto";
import { q1 } from "@/lib/db";
import { SignJWT, jwtVerify } from "jose";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  "https://hourkey.io/api/auth/google/callback";

const STATE_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "decode-dev-secret-change-in-production-please-2026"
);

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

export function isReady(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

function makeClient() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
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
