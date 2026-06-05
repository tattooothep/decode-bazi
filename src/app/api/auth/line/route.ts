// GET /api/auth/line — เริ่ม LINE Login · พาไปหน้า LINE consent
import { cookies } from "next/headers";
import { isReady, buildState, buildAuthUrl } from "@/lib/oauth-line";

const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? ".hourkey.io" : undefined;

export async function GET(req: Request) {
  if (!isReady()) {
    return new Response("LINE Login not configured", { status: 503 });
  }
  const requestUrl = new URL(req.url);
  const state = await buildState(requestUrl.searchParams.get("next"));
  const c = await cookies();
  c.set("oauth_state_line", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  const authUrl = buildAuthUrl(state);
  return new Response(null, { status: 302, headers: { Location: authUrl } });
}
