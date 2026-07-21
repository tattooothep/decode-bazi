import { getSession, type Session, verifySession } from "@/lib/auth";
import { checkAccountUsable } from "@/lib/account-status";
import { q1 } from "@/lib/db";

export function mobileBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Native bearer sessions fail closed. Unlike browser cookies, a stolen mobile
 * token can survive outside the app, so every request re-checks account state,
 * session revocation, and the user's current organization.
 */
export async function validateMobileBearerToken(token: string): Promise<Session | null> {
  const session = await verifySession(token);
  if (!session) return null;

  try {
    const gate = await checkAccountUsable(session.userId);
    if (!gate.ok) return null;
    const row = await q1<{ session_version: number | null; current_org_id: string | null }>(
      `SELECT session_version,current_org_id FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active=true`,
      [session.userId]
    );
    if (!row) return null;
    if ((Number(session.sv) || 0) !== (Number(row.session_version) || 0)) return null;
    return {
      ...session,
      email: gate.email,
      orgId: row.current_org_id || null,
    };
  } catch {
    return null;
  }
}

export async function getMobileSession(req: Request): Promise<Session | null> {
  const token = mobileBearerToken(req);
  if (token) return validateMobileBearerToken(token);

  // Compatibility for browser smoke tests only. Native clients should send Bearer tokens.
  return getSession();
}
