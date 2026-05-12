// ส่งอีเมลผ่าน Resend
// เรียกใช้: sendVerifyEmail({to, name, link})  ·  sendResetEmail({to, name, link})
import { Resend } from "resend";

const API_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://hourkey.io";

const resend = new Resend(API_KEY);

export function isEmailReady(): boolean {
  return !!API_KEY;
}

function shellTemplate(opts: { title: string; body: string; ctaText: string; ctaLink: string; note?: string }) {
  return `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0d0f12;font-family:'Noto Serif Thai','Cormorant Garamond',serif;color:#f6f1e6;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:48px;height:48px;border:1.5px solid #c8a44d;border-radius:50%;line-height:46px;color:#c8a44d;font-size:20px;">時</div>
      <h1 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;margin:14px 0 0;color:#c8a44d;">hourkey</h1>
    </div>
    <h2 style="font-size:22px;font-weight:500;margin-bottom:18px;">${opts.title}</h2>
    <p style="line-height:1.7;color:rgba(246,241,230,.78);margin-bottom:28px;">${opts.body}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${opts.ctaLink}" style="display:inline-block;background:#c8a44d;color:#0d0f12;text-decoration:none;padding:14px 32px;border-radius:99px;font-weight:700;letter-spacing:.1em;">${opts.ctaText}</a>
    </div>
    ${opts.note ? `<p style="font-size:12px;color:rgba(246,241,230,.5);line-height:1.6;margin-top:24px;">${opts.note}</p>` : ""}
    <hr style="border:none;border-top:1px solid rgba(200,164,77,.2);margin:32px 0;"/>
    <p style="font-size:11px;color:rgba(246,241,230,.4);text-align:center;">
      hourkey · 時鑰 · ดวงปาจื้อ + ฉีเหมิน + ปฏิทินมงคล<br/>
      <a href="${APP_URL}" style="color:rgba(200,164,77,.6);text-decoration:none;">${APP_URL}</a>
    </p>
  </div>
</body>
</html>`;
}

export async function sendVerifyEmail(opts: { to: string; name?: string; link: string }) {
  const html = shellTemplate({
    title: `ยืนยันอีเมลของคุณ`,
    body: `สวัสดี ${opts.name || "คุณ"}<br/><br/>ขอบคุณที่สมัครใช้ hourkey · กรุณากดปุ่มด้านล่างเพื่อยืนยันอีเมล อายุลิงก์ 24 ชั่วโมง`,
    ctaText: "ยืนยันอีเมล →",
    ctaLink: opts.link,
    note: `ถ้าปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br/><span style="color:rgba(200,164,77,.7);word-break:break-all;">${opts.link}</span>`,
  });
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "ยืนยันอีเมล · hourkey",
    html,
  });
}

export async function sendResetEmail(opts: { to: string; name?: string; link: string }) {
  const html = shellTemplate({
    title: `รีเซ็ตรหัสผ่าน`,
    body: `สวัสดี ${opts.name || "คุณ"}<br/><br/>มีคำขอรีเซ็ตรหัสผ่านบัญชี hourkey ของคุณ · กดปุ่มด้านล่างเพื่อตั้งรหัสใหม่ อายุลิงก์ 1 ชั่วโมง<br/><br/>ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร · บัญชีปลอดภัย`,
    ctaText: "ตั้งรหัสใหม่ →",
    ctaLink: opts.link,
    note: `ถ้าปุ่มไม่ทำงาน คัดลอกลิงก์นี้:<br/><span style="color:rgba(200,164,77,.7);word-break:break-all;">${opts.link}</span>`,
  });
  return resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "รีเซ็ตรหัสผ่าน · hourkey",
    html,
  });
}
