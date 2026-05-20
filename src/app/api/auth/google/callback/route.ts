// GET /api/auth/google/callback — รับ code จาก Google · login/สมัคร · พาไปหน้าเว็บ
import { cookies } from "next/headers";
import {
  isReady,
  verifyState,
  handleCallback,
  findOrCreateUser,
} from "@/lib/oauth-google";
import { signSession, setAuthCookie } from "@/lib/auth";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

export async function GET(req: Request) {
  if (!isReady()) return new Response("Google OAuth not configured", { status: 503 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("ยกเลิกการเข้าสู่ระบบด้วย Google")}`);
  }
  if (!code || !state) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("ข้อมูลจาก Google ไม่ครบ")}`);
  }

  const c = await cookies();
  const stateCookie = c.get("oauth_state_google")?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("session OAuth ไม่ตรง · ลองใหม่")}`);
  }
  const valid = await verifyState(state);
  if (!valid) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("token หมดอายุ · ลองใหม่")}`);
  }
  c.delete("oauth_state_google");

  let profile;
  try {
    profile = await handleCallback(code);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "google verify failed";
    return redirect(`/signup?tab=login&err=${encodeURIComponent(msg)}`);
  }

  let user;
  try {
    user = await findOrCreateUser(profile);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "create user failed";
    return redirect(`/signup?tab=login&err=${encodeURIComponent(msg)}`);
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
  });
  await setAuthCookie(token);

  return redirect("/master?intro=1&next=%2Ftoday");
}
