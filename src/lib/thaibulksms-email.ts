// ส่ง Email ผ่าน ThaiBulkSMS Email API
// POST https://tbs-email-api-gateway.omb.to/email/v1/send_template
const API_KEY = process.env.THAIBULKSMS_API_KEY || "";
const API_SECRET = process.env.THAIBULKSMS_API_SECRET || "";
const FROM = process.env.THAIBULKSMS_EMAIL_FROM || "noreply@hourkey.io";
const FROM_NAME = process.env.THAIBULKSMS_EMAIL_NAME || "hourkey";

const URL = "https://tbs-email-api-gateway.omb.to/email/v1/send_template";

// UUID ของ templates ที่สร้างใน ThaiBulkSMS UI
const TPL_VERIFY = process.env.TBS_TPL_VERIFY || "";
const TPL_RESET = process.env.TBS_TPL_RESET || "";
const TPL_OTP = process.env.TBS_TPL_OTP || "";

export function isEmailTbsReady(): boolean {
  return !!API_KEY && !!API_SECRET;
}

async function sendTemplate(opts: {
  template_id: string;
  payload: Record<string, string>;
  to: string;
  subject: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailTbsReady()) return { ok: false, error: "Email not configured" };
  if (!opts.template_id) return { ok: false, error: "template UUID not set" };
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: opts.template_id,
      Payload: opts.payload,
      mail_from: FROM,
      name: FROM_NAME,
      mail_to: opts.to,
      subject: opts.subject,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = j?.error?.description || `HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  return { ok: true };
}

export async function sendVerifyEmailTbs(opts: { to: string; name?: string; link: string }) {
  return sendTemplate({
    template_id: TPL_VERIFY,
    payload: { NAME: opts.name || "คุณ", VERIFY_LINK: opts.link },
    to: opts.to,
    subject: "ยืนยันอีเมล · hourkey",
  });
}

export async function sendResetEmailTbs(opts: { to: string; name?: string; link: string }) {
  return sendTemplate({
    template_id: TPL_RESET,
    payload: { NAME: opts.name || "คุณ", RESET_LINK: opts.link },
    to: opts.to,
    subject: "รีเซ็ตรหัสผ่าน · hourkey",
  });
}

export async function sendOtpEmailTbs(opts: { to: string; name?: string; code: string }) {
  return sendTemplate({
    template_id: TPL_OTP,
    payload: { NAME: opts.name || "คุณ", OTP: opts.code },
    to: opts.to,
    subject: `รหัสยืนยัน ${opts.code} · hourkey`,
  });
}
