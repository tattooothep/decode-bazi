// POST /api/mobile/v1/auth/google/exchange — แลก one-time code (จาก callback) เป็น Bearer
// ตรวจ PKCE S256: sha256(code_verifier) base64url ต้องตรง code_challenge ที่ผูกไว้ ·
// code ใช้ครั้งเดียว อายุ 60 วิ · ออก token ด้วย signSession ตัวเดียวกับ login ปกติ
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { readSessionVersion, signSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { userHasProfile } from "@/lib/profile-status";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 60_000;
const VERIFIER_RE = /^[A-Za-z0-9_.~-]{43,128}$/;

function s256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

type CodeRow = {
  code: string;
  user_id: string;
  code_challenge: string;
  created_at: string;
  used_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  current_org_id: string | null;
  tier: string | null;
  hour_balance: number | null;
  email_verified: boolean | null;
};

export async function POST(req: Request) {
  const rl = await rateLimit(`mobile-google-exchange:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown; code_verifier?: unknown };
  const code = String(body.code || "").trim();
  const verifier = String(body.code_verifier || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code)) {
    return NextResponse.json({ ok: false, error: "bad_code" }, { status: 400 });
  }
  if (!VERIFIER_RE.test(verifier)) {
    return NextResponse.json({ ok: false, error: "bad_code_verifier" }, { status: 400 });
  }

  // เก็บกวาดแถวหมดอายุแบบเบาๆ (ไม่บล็อกผลลัพธ์)
  await q1(`DELETE FROM mobile_auth_codes WHERE created_at < now() - interval '10 minutes' RETURNING code`).catch(
    () => null,
  );

  // ใช้ครั้งเดียว: mark used แบบ atomic — แถวที่ used แล้ว/หมดอายุจะไม่ถูกอัพเดต
  const row = await q1<CodeRow>(
    `UPDATE mobile_auth_codes
        SET used_at = now()
      WHERE code = $1
        AND used_at IS NULL
        AND created_at > now() - ($2 || ' milliseconds')::interval
      RETURNING code, user_id, code_challenge, created_at, used_at`,
    [code, String(CODE_TTL_MS)],
  );
  if (!row) {
    return NextResponse.json({ ok: false, error: "code_expired_or_used" }, { status: 401 });
  }
  if (s256(verifier) !== row.code_challenge) {
    return NextResponse.json({ ok: false, error: "pkce_mismatch" }, { status: 401 });
  }

  const user = await q1<UserRow>(
    `SELECT id, email, name, avatar_url, current_org_id, tier, hour_balance, email_verified
       FROM users
      WHERE id=$1 AND deleted_at IS NULL AND is_active IS DISTINCT FROM false`,
    [row.user_id],
  );
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const sv = await readSessionVersion(user.id);
  const token = await signSession({ userId: user.id, email: user.email, orgId: user.current_org_id, sv });
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1 RETURNING id", [user.id]).catch(() => null);
  const hasProfile = await userHasProfile(user.id);

  return NextResponse.json(
    {
      ok: true,
      token_type: "Bearer",
      access_token: token,
      has_profile: hasProfile,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        tier: user.tier || "free",
        hour_balance: user.hour_balance ?? 0,
        email_verified: user.email_verified !== false,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
