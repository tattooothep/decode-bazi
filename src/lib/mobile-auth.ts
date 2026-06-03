import { getSession, type Session, verifySession } from "@/lib/auth";

export function mobileBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getMobileSession(req: Request): Promise<Session | null> {
  const token = mobileBearerToken(req);
  if (token) return verifySession(token);

  // Compatibility for browser smoke tests only. Native clients should send Bearer tokens.
  return getSession();
}
