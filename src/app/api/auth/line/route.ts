// GET /api/auth/line — เริ่ม LINE Login · พาไปหน้า LINE consent
import { cookies } from "next/headers";
import { isReady, buildState, buildAuthUrl } from "@/lib/oauth-line";

export async function GET() {
  if (!isReady()) {
    return new Response("LINE Login not configured", { status: 503 });
  }
  const state = await buildState();
  const c = await cookies();
  c.set("oauth_state_line", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const url = buildAuthUrl(state);
  return new Response(null, { status: 302, headers: { Location: url } });
}
