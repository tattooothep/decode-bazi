// POST /api/auth/forgot-password — ส่งลิงก์รีเซ็ตรหัส
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { isEmailReady } from "@/lib/email-service";
import { isSmsReady } from "@/lib/thaibulksms-sms";
import {enqueuePasswordResetDelivery} from "@/lib/auth-delivery-outbox";
import { normalizePhone, isValidThaiMobile } from "@/lib/phone-otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const APP_URL = process.env.APP_URL || "https://hourkey.io";

export async function POST(req: Request) {
  const started=Date.now();
  const uniformDelay=async()=>{const remaining=700-(Date.now()-started);if(remaining>0)await new Promise((resolve)=>setTimeout(resolve,remaining));};
  const body = await req.json().catch(() => ({}));
  const raw = String(body.identifier || body.email || body.phone || "").trim();
  if (!raw) return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทร" }, { status: 400 });
  /* 1 มิ.ย. · กันยิง email/SMS รีเซ็ตเปลืองเงิน · 3 ครั้ง/10 นาที ต่อ (IP + identifier) */
  const rl = await rateLimit(`forgot:${clientIp(req)}:${raw.toLowerCase()}`, 3, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ขอรีเซ็ตบ่อยเกินไป · กรุณารอสักครู่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const isEmail = raw.includes("@");
  const email = isEmail ? raw.toLowerCase() : "";
  const phone = isEmail ? "" : normalizePhone(raw);

  if (!isEmail && !isValidThaiMobile(phone)) {
    return NextResponse.json({ error: "กรอกอีเมลหรือเบอร์โทรที่ถูกต้อง" }, { status: 400 });
  }
  if (isEmail && !isEmailReady()) {
    return NextResponse.json({ error: "ระบบส่งอีเมลยังไม่พร้อม" }, { status: 503 });
  }
  if (!isEmail && !isSmsReady()) {
    return NextResponse.json({ error: "ระบบส่งข้อความยังไม่พร้อม" }, { status: 503 });
  }

  // กันเลี่ยงไม่บอกว่า email มีอยู่หรือไม่ — return ok เสมอ
  const user = isEmail
    ? await q1<{ id: string; name: string | null }>(
        `SELECT id, name FROM users WHERE email=$1`,
        [email]
      )
    : await q1<{ id: string; name: string | null }>(
        `SELECT id, name FROM users WHERE phone=$1`,
        [phone]
      );
  if (!user) {await uniformDelay();return NextResponse.json({ ok: true });}

  try {await enqueuePasswordResetDelivery({userId:user.id,name:user.name,channel:isEmail?"email":"sms",destination:isEmail?email:phone,appUrl:APP_URL});}
  catch(error){console.error("[forgot-password] durable enqueue failed",error);}
  await uniformDelay();
  return NextResponse.json({ok:true});
}
