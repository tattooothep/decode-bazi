// GET /api/auth/line/callback — รับ code จาก LINE · login/สมัคร · พาไปหน้าเว็บ
import { cookies } from "next/headers";
import {
  isReady,
  verifyState,
  handleCallback,
  findOrCreateUser,
  linkLineToUser,
} from "@/lib/oauth-line";
import { getSession, signSession, readSessionVersion, setAuthCookie } from "@/lib/auth";
import { userHasProfile } from "@/lib/profile-status";
import { captureAffiliateAttribution } from "@/lib/affiliate";
import { recordSignupFingerprint } from "@/lib/record-signup-fingerprint";
import { applySignupProductDefaults } from "@/lib/product-entitlement";

const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? ".hourkey.io" : undefined;

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function clearOAuthStateCookie(c: Awaited<ReturnType<typeof cookies>>) {
  c.set("oauth_state_line", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function GET(req: Request) {
  if (!isReady()) return new Response("LINE Login not configured", { status: 503 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("ยกเลิกการเข้าสู่ระบบด้วย LINE")}`);
  }
  if (!code || !state) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("ข้อมูลจาก LINE ไม่ครบ")}`);
  }

  const c = await cookies();
  const stateCookie = c.get("oauth_state_line")?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("session OAuth ไม่ตรง · ลองใหม่")}`);
  }
  const stateData = await verifyState(state);
  if (!stateData) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("token หมดอายุ · ลองใหม่")}`);
  }
  clearOAuthStateCookie(c);

  let profile;
  try {
    profile = await handleCallback(code);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "line verify failed";
    return redirect(`/signup?tab=login&err=${encodeURIComponent(msg)}`);
  }

  const current = await getSession();
  let user;
  try {
    user = current?.userId
      ? await linkLineToUser(current.userId, profile)
      : await findOrCreateUser(profile);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "create user failed";
    return redirect(`/signup?tab=login&err=${encodeURIComponent(msg)}`);
  }
  if (user.is_new) {
    await recordSignupFingerprint({ userId: user.id, request: req });
    await applySignupProductDefaults(user.id);
    if (stateData.ref) {
      await captureAffiliateAttribution({
        referredUserId: user.id,
        referralCode: stateData.ref,
        request: req,
        channel: "line",
      }).catch((e) => console.warn("[affiliate] line attribution failed", e instanceof Error ? e.message : String(e)));
    }
  }

  const sv = await readSessionVersion(user.id);
  const token = await signSession({
    userId: user.id,
    email: user.email,
    orgId: user.current_org_id,
    sv,
  });
  await setAuthCookie(token);

  const hasProfile = await userHasProfile(user.id);
  const next = stateData.next || "/today";
  return redirect(hasProfile ? next : `/input?next=${encodeURIComponent(next)}`);
}
