import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { hashPassword, setAuthCookie, signSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanName(value: unknown, email: string) {
  const name = String(value || "").trim();
  return name || email.split("@")[0] || "สมาชิก";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const name = cleanName(body.name, email);

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "กรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }

  const rl = rateLimit(`mobile-signup:${clientIp(req)}`, 10, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "สมัครบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const existing = await q1<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1)", [email]);
  if (existing) {
    return NextResponse.json({ ok: false, error: "อีเมลนี้สมัครไว้แล้ว · ลองเข้าสู่ระบบแทน" }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await q1(
    `INSERT INTO users (id, email, password_hash, name, locale, timezone, theme, email_verified, is_active, created_at)
     VALUES ($1,$2,$3,$4,'th','Asia/Bangkok','dark',false,true,now())`,
    [userId, email, passwordHash, name]
  );
  await q1(
    `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
     VALUES ($1,$2,$3,$4,now())`,
    [orgId, userId, `${name}'s space`, orgId.slice(0, 8)]
  ).catch(async () => {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1,$2)`, [orgId, name || "personal"]);
  });
  await q1(
    `INSERT INTO org_members (org_id, user_id, role, created_at)
     VALUES ($1,$2,'owner',now())`,
    [orgId, userId]
  ).catch(() => null);
  await q1(`UPDATE users SET current_org_id=$1, last_active_at=now() WHERE id=$2`, [orgId, userId]);

  const token = await signSession({ userId, email, orgId });
  await setAuthCookie(token);

  return NextResponse.json(
    {
      ok: true,
      token_type: "Bearer",
      access_token: token,
      has_profile: false,
      intro_url: "/input",
      user: {
        id: userId,
        email,
        name,
        tier: "free",
        hour_balance: 0,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
