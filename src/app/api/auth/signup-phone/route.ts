// POST /api/auth/signup-phone — สมัครด้วยเบอร์โทร · ส่ง OTP
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { q1 } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { normalizePhone, isValidThaiMobile, createOtp } from "@/lib/phone-otp";
import { sendOtpSms, isSmsReady } from "@/lib/thaibulksms-sms";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { captureAffiliateAttribution } from "@/lib/affiliate";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(body.phone || "");
  const password = String(body.password || "");
  const name = String(body.name || "").trim();

  if (!isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "เบอร์โทรไม่ถูกต้อง (เริ่มต้นด้วย 06, 08, 09 · 10 หลัก)" }, { status: 400 });
  }
  /* 1 มิ.ย. · กัน spam สร้างบัญชี + ยิง SMS · 5 ครั้ง/ชม. ต่อ (IP + เบอร์) */
  const rl = rateLimit(`signupphone:${clientIp(req)}:${phone}`, 5, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "สมัครบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "รหัสผ่านอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }

  // เช็คว่ามี user ที่ใช้เบอร์นี้แล้ว
  const existing = await q1<{ id: string }>(`SELECT id FROM users WHERE phone=$1`, [phone]);
  if (existing) {
    return NextResponse.json({ error: "เบอร์นี้สมัครไว้แล้ว · เข้าสู่ระบบแทน" }, { status: 409 });
  }

  // สร้าง user + org
  const hash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const displayName = name || `User${phone.slice(-4)}`;
  const placeholderEmail = `phone.${phone}@hourkey.local`;

  await q1(
    `INSERT INTO users (id, email, password_hash, phone, phone_verified, name, locale, timezone, theme, email_verified, is_active, created_at)
     VALUES ($1, $2, $3, $4, false, $5, 'th', 'Asia/Bangkok', 'dark', false, true, now())`,
    [userId, placeholderEmail, hash, phone, displayName]
  );
  await q1(
    `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [orgId, userId, `${displayName}'s Workspace`, orgId.slice(0, 8)]
  ).catch(async () => {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [orgId, displayName]);
  });
  await q1(
    `INSERT INTO org_members (org_id, user_id, role, created_at)
     VALUES ($1, $2, 'owner', now())`,
    [orgId, userId]
  ).catch(() => null);
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);

  const referral = await captureAffiliateAttribution({
    referredUserId: userId,
    referralCode: body.referralCode || body.ref || null,
    request: req,
    channel: "phone",
    deviceId: body.affiliateDeviceId || null,
  }).catch((e) => ({ ok: false, status: "error", reason: e instanceof Error ? e.message : String(e) }));

  // สร้าง OTP + ส่ง SMS
  const code = await createOtp(phone);
  if (!isSmsReady()) {
    return NextResponse.json({ ok: true, need_verify: true, phone, dev_otp: code, referral });
  }
  const r = await sendOtpSms(phone, code);
  if (!r.ok) {
    return NextResponse.json({ ok: true, need_verify: true, phone, sms_error: r.error, referral });
  }
  return NextResponse.json({ ok: true, need_verify: true, phone, referral });
}
