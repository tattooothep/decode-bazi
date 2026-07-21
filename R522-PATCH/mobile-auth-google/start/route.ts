// GET /api/mobile/v1/auth/google/start?code_challenge=<S256 base64url>
// เริ่ม Google OAuth สำหรับแอพมือถือ — reuse lib/oauth-google ของเว็บทั้งชุด
// ฝัง challenge ใน state (รูป path "/__mobile__/<challenge>" ให้ผ่าน safeNext) ·
// callback เดิมจะเห็น marker นี้แล้วออก one-time code แทนการ set cookie เว็บ
import { cookies } from "next/headers";
import { isReady, buildState, buildAuthUrl } from "@/lib/oauth-google";

const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? ".hourkey.io" : undefined;
// base64url ของ SHA-256 (43 ตัว) — เผื่อ client เข้ารหัสยาวขึ้นถึง 128 ตาม RFC 7636
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isReady()) {
    return Response.json({ ok: false, error: "google_not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const challenge = String(url.searchParams.get("code_challenge") || "");
  if (!CHALLENGE_RE.test(challenge)) {
    return Response.json({ ok: false, error: "bad_code_challenge" }, { status: 400 });
  }
  const state = await buildState(`/__mobile__/${challenge}`, url.searchParams.get("ref"));
  const c = await cookies();
  c.set("oauth_state_google", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  return new Response(null, { status: 302, headers: { Location: buildAuthUrl(state) } });
}
