import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { hashPassword, signSession, readSessionVersion, setAuthCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { captureAffiliateAttribution } from "@/lib/affiliate";
import crypto from "node:crypto";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, password, name } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "กรอกอีเมลและรหัสผ่าน" }, { status: 400 });
  }
  /* 1 มิ.ย. · กัน spam สร้างบัญชี · 10 บัญชี/ชม. ต่อ IP */
  const rl = rateLimit(`signup:${clientIp(req)}`, 10, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "สมัครบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }

  const existing = await q1<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  if (existing) {
    return NextResponse.json({ error: "อีเมลนี้สมัครไว้แล้ว · ลองเข้าสู่ระบบหรือกดลืมรหัสผ่าน" }, { status: 409 });
  }

  const hash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();

  // create user + org + membership
  await q1(
    `INSERT INTO users (id, email, password_hash, name, locale, timezone, theme, email_verified, is_active, created_at)
     VALUES ($1,$2,$3,$4,'th','Asia/Bangkok','dark',false,true,now())`,
    [userId, email, hash, name || email.split("@")[0]]
  );
  await q1(
    `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
     VALUES ($1,$2,$3,$4,now())`,
    [orgId, userId, `${name || email.split("@")[0]}'s space`, orgId.slice(0, 8)]
  ).catch(async () => {
    // org table may have different schema · try minimal insert
    await q1(`INSERT INTO organizations (id, name) VALUES ($1,$2)`, [orgId, name || "personal"]);
  });
  await q1(
    `INSERT INTO org_members (org_id, user_id, role, created_at)
     VALUES ($1,$2,'owner',now())`,
    [orgId, userId]
  ).catch(() => null);
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);

  const referral = await captureAffiliateAttribution({
    referredUserId: userId,
    referralCode: body.referralCode || body.ref || null,
    request: req,
    channel: "email",
    deviceId: body.affiliateDeviceId || null,
  }).catch((e) => ({ ok: false, status: "error", reason: e instanceof Error ? e.message : String(e) }));

  const token = await signSession({ userId, email, orgId });
  await setAuthCookie(token);

  return NextResponse.json({
    ok: true,
    has_profile: false,
    next_url: "/input",
    user: { id: userId, email, orgId },
    referral,
  });
}
