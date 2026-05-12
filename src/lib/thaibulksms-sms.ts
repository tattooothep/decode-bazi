// ส่ง SMS ผ่าน ThaiBulkSMS API v2
// POST https://api-v2.thaibulksms.com/sms · Basic Auth (key:secret)
const API_KEY = process.env.THAIBULKSMS_API_KEY || "";
const API_SECRET = process.env.THAIBULKSMS_API_SECRET || "";
const SENDER = process.env.THAIBULKSMS_SMS_SENDER || "BulkSMS";
const URL = "https://api-v2.thaibulksms.com/sms";

export function isSmsReady(): boolean {
  return !!API_KEY && !!API_SECRET;
}

function normalizePhone(p: string): string {
  // แปลง 08x → 668x (รูปแบบ ThaiBulkSMS รองรับ)
  const s = String(p || "").replace(/[\s-]/g, "");
  if (s.startsWith("+66")) return s.slice(1);
  if (s.startsWith("66")) return s;
  if (s.startsWith("0")) return "66" + s.slice(1);
  return s;
}

export async function sendSms(opts: { to: string; message: string; sender?: string }): Promise<{
  ok: boolean;
  message_id?: string;
  remaining_credit?: number;
  error?: string;
}> {
  if (!isSmsReady()) return { ok: false, error: "SMS not configured" };
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    msisdn: normalizePhone(opts.to),
    message: opts.message,
    sender: opts.sender || SENDER,
    force: "standard",
  });
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = j?.error?.description || `HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  }
  const bad = j?.bad_phone_number_list || [];
  if (bad.length > 0) {
    return { ok: false, error: bad[0]?.message || "bad phone number" };
  }
  const first = j?.phone_number_list?.[0];
  return {
    ok: true,
    message_id: first?.message_id,
    remaining_credit: j?.remaining_credit,
  };
}

export async function sendOtpSms(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const message = `รหัสยืนยัน hourkey: ${code} (อายุ 5 นาที · ไม่ส่งต่อ)`;
  const r = await sendSms({ to: phone, message });
  return { ok: r.ok, error: r.error };
}
