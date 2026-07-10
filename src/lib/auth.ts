import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

/* 1 มิ.ย. · ตัด fallback secret สาธารณะ (เดิม env หาย=ใครก็ปลอม login ได้)
 * lazy + fail-closed: ไม่มี AUTH_SECRET = throw ตอนใช้จริง (ไม่พังตอน build) */
function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET env is required (>=16 chars)");
  }
  return new TextEncoder().encode(s);
}
const COOKIE = "decode_auth";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? ".hourkey.io" : undefined;

export type Session = {
  userId: string;
  email: string;
  orgId?: string | null;
  /** Session version for revoke-all (bump users.session_version invalidates tokens) */
  sv?: number;
  /** Impersonation actor (admin) if viewing as user */
  impActorId?: string | null;
};

export async function signSession(s: Session): Promise<string> {
  const payload: Record<string, unknown> = {
    userId: s.userId,
    email: s.email,
    orgId: s.orgId ?? null,
    sv: s.sv ?? 0,
  };
  if (s.impActorId) payload.impActorId = s.impActorId;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      orgId: (payload.orgId as string) || null,
      sv: payload.sv != null ? Number(payload.sv) : 0,
      impActorId: payload.impActorId ? String(payload.impActorId) : null,
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function clearAuthCookie() {
  const c = await cookies();
  c.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  try {
    const { checkAccountUsable } = await import("@/lib/account-status");
    const { q1 } = await import("@/lib/db");
    const gate = await checkAccountUsable(session.userId);
    if (!gate.ok) return null;
    // session_version revoke
    const row = await q1<{ session_version: number | null }>(
      `SELECT session_version FROM users WHERE id=$1`,
      [session.userId]
    ).catch(() => null);
    if (row && row.session_version != null) {
      const dbSv = Number(row.session_version) || 0;
      const tokSv = Number(session.sv) || 0;
      if (tokSv !== dbSv) return null;
    }
  } catch {
    /* DB unavailable — keep JWT session to avoid total outage; login paths still check */
  }
  return session;
}

/** Load current session_version for login signing (defaults 0 if column missing). */
export async function readSessionVersion(userId: string): Promise<number> {
  try {
    const { q1 } = await import("@/lib/db");
    const row = await q1<{ session_version: number | null }>(
      `SELECT session_version FROM users WHERE id=$1`,
      [userId]
    );
    return Number(row?.session_version) || 0;
  } catch {
    return 0;
  }
}

export async function bumpSessionVersion(userId: string): Promise<number> {
  const { q1 } = await import("@/lib/db");
  const row = await q1<{ session_version: number }>(
    `UPDATE users SET session_version = COALESCE(session_version,0) + 1
      WHERE id=$1 RETURNING session_version`,
    [userId]
  );
  return Number(row?.session_version) || 0;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
