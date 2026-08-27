// GET /api/auth/google/callback — รับ code จาก Google · login/สมัคร · พาไปหน้าเว็บ
import { cookies } from "next/headers";
import {
  isReady,
  verifyState,
  handleCallback,
  findOrCreateUser,
  linkGoogleToUser,
} from "@/lib/oauth-google";
import { getSession, signSession, readSessionVersion, setAuthCookie } from "@/lib/auth";
import { userHasProfile } from "@/lib/profile-status";
import { captureAffiliateAttribution } from "@/lib/affiliate";
import { recordSignupFingerprint } from "@/lib/record-signup-fingerprint";
import { applySignupProductDefaults } from "@/lib/product-entitlement";
import {
  classifyGoogleCallback,
  googleAccountAction,
  googleCallbackErrorLocation,
} from "@/lib/oauth-google-callback-flow";

const COOKIE_DOMAIN = process.env.NODE_ENV === "production" ? ".hourkey.io" : undefined;

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function clearOAuthStateCookie(c: Awaited<ReturnType<typeof cookies>>) {
  c.set("oauth_state_google", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (!state) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("ข้อมูลจาก Google ไม่ครบ")}`);
  }

  const c = await cookies();
  const stateCookie = c.get("oauth_state_google")?.value;
  const stateData = await verifyState(state);
  if (!stateData) {
    return redirect(`/signup?tab=login&err=${encodeURIComponent("token หมดอายุ · ลองใหม่")}`);
  }

  // A mobile callback runs inside the system browser, whose HourKey cookie may
  // belong to a different account. The signed mobile marker is authoritative:
  // never turn that stale browser session into an account-link operation.
  const callbackFlow = classifyGoogleCallback(stateData.next);
  if (callbackFlow.kind === "invalid_mobile") {
    return redirect(`hourkey://auth/google?error=${encodeURIComponent("bad_challenge")}`);
  }
  const flowError = (mobileCode: string, webMessage: string) => redirect(
    googleCallbackErrorLocation(callbackFlow, mobileCode, webMessage),
  );
  if (!stateCookie || stateCookie !== state) {
    return flowError("oauth_state_mismatch", "session OAuth ไม่ตรง · ลองใหม่");
  }
  clearOAuthStateCookie(c);
  if (error) {
    return flowError("oauth_cancelled", "ยกเลิกการเข้าสู่ระบบด้วย Google");
  }
  if (!code) {
    return flowError("oauth_incomplete", "ข้อมูลจาก Google ไม่ครบ");
  }
  if (!isReady()) {
    return flowError("google_not_configured", "Google OAuth not configured");
  }

  let profile;
  try {
    profile = await handleCallback(code);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "google verify failed";
    return redirect(googleCallbackErrorLocation(callbackFlow, "google_verify_failed", msg));
  }

  const current = callbackFlow.kind === "web" ? await getSession() : null;
  const accountAction = googleAccountAction(callbackFlow, current?.userId ?? null);
  let user;
  try {
    user = accountAction === "link"
      ? await linkGoogleToUser(current!.userId, profile)
      : await findOrCreateUser(profile);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "create user failed";
    return redirect(googleCallbackErrorLocation(callbackFlow, "account_resolution_failed", msg));
  }
  if (user.is_new) {
    await recordSignupFingerprint({ userId: user.id, request: req });
    await applySignupProductDefaults(user.id);
    if (stateData.ref) {
      await captureAffiliateAttribution({
        referredUserId: user.id,
        referralCode: stateData.ref,
        request: req,
        channel: "google",
      }).catch((e) => console.warn("[affiliate] google attribution failed", e instanceof Error ? e.message : String(e)));
    }
  }

  // R522: สะพานมือถือ — state จาก /api/mobile/v1/auth/google/start ฝัง challenge เป็น
  // path "/__mobile__/<code_challenge>" → ออก one-time code (PKCE S256 · ใช้ครั้งเดียว · 60 วิ)
  // แล้วเด้งกลับเข้าแอพ ไม่ set cookie เว็บ
  if (callbackFlow.kind === "mobile") {
    const { q1 } = await import("@/lib/db");
    const codeRow = await q1<{ code: string }>(
      `INSERT INTO mobile_auth_codes (user_id, code_challenge) VALUES ($1, $2) RETURNING code`,
      [user.id, callbackFlow.challenge],
    ).catch(() => null);
    if (!codeRow) {
      return redirect(`hourkey://auth/google?error=${encodeURIComponent("code_issue_failed")}`);
    }
    return redirect(`hourkey://auth/google?code=${encodeURIComponent(codeRow.code)}`);
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
