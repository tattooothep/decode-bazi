/**
 * payment/stripe.ts · Stripe adapter (REAL test mode) ผ่าน REST API + crypto
 * r408 · 5 ก.ค. 2026 · reuse pattern จาก /root/qimen-api/src/stripeService.js
 *
 * - ไม่ผูก stripe SDK (กัน build-deps landmine) — ยิง REST ตรง + verify webhook ด้วย node crypto
 * - Topup + Subscription = Stripe Checkout mode:'payment' (จ่ายครั้งเดียว) · PromptPay + Card
 * - ถ้าไม่มี STRIPE_SECRET_KEY = โหมด mock (sandbox เท่านั้น)
 */
import crypto from "crypto";

const STRIPE_BASE = "https://api.stripe.com/v1";

export function stripeSecret(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}
export function stripeReady(): boolean {
  const k = stripeSecret();
  return !!k && k.startsWith("sk_");
}
export function stripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function stripeRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, string>,
  idempotencyKey?: string
): Promise<T> {
  if (!stripeReady()) throw new Error("STRIPE_SECRET_KEY not set");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecret()}`,
    "Stripe-Version": "2024-06-20",
  };
  let payload: string | undefined;
  if (body) {
    payload = formEncode(body);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_BASE}${path}`, { method, headers, body: payload });
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok || json.error) {
    throw new Error(`stripe: ${json.error?.message || res.status}`);
  }
  return json as T;
}

type CheckoutArgs = {
  orderId: string;
  amountThb: number;
  packageCode: string;
  packageName: string;
  method: "promptpay" | "card";
  userId: string;
  userEmail?: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = {
  gateway: "stripe";
  mock: boolean;
  sessionId: string;
  redirectUrl: string;
};

/**
 * สร้าง Stripe Checkout Session (mode:payment · จ่ายครั้งเดียว)
 * รองรับ PromptPay (QR บนหน้า Stripe) และบัตร — คืน redirectUrl ให้ client ไป
 */
export async function createStripeCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
  const satang = Math.round(args.amountThb * 100);

  // mock (sandbox · ไม่มี key) — คืน url เด้งกลับ success พร้อม flag mock ให้ _mock-pay จำลอง
  if (!stripeReady()) {
    return {
      gateway: "stripe",
      mock: true,
      sessionId: `mock_stripe_${args.orderId}`,
      redirectUrl: `${args.successUrl}${args.successUrl.includes("?") ? "&" : "?"}mock=1&orderId=${args.orderId}`,
    };
  }

  // ไม่ล็อกวิธีจ่าย → ตัด payment_method_types ทิ้ง = Stripe Checkout โชว์ทุกวิธีที่เปิดใน dashboard อัตโนมัติ
  // (บัตร + PromptPay + Link ให้ลูกค้าเลือกในหน้าเดียว · รับได้ทั้งไทย/ต่างชาติ) · args.method ยังบันทึกใน order.pay_method เฉยๆ
  const body: Record<string, string> = {
    mode: "payment",
    "line_items[0][price_data][currency]": "thb",
    "line_items[0][price_data][unit_amount]": String(satang),
    "line_items[0][price_data][product_data][name]": args.packageName,
    "line_items[0][quantity]": "1",
    client_reference_id: String(args.userId),
    "metadata[order_id]": args.orderId,
    "metadata[user_id]": String(args.userId),
    "metadata[package_code]": args.packageCode,
    // ยอดที่คาดหวัง (บาท) ฝังใน metadata ไว้ cross-check ตอน webhook
    "metadata[amount_thb]": String(args.amountThb),
    "payment_intent_data[metadata][order_id]": args.orderId,
    success_url: `${args.successUrl}${args.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}&orderId=${args.orderId}`,
    cancel_url: args.cancelUrl,
    locale: "auto",
  };
  if (args.userEmail) body["customer_email"] = args.userEmail;

  const session = await stripeRequest<{ id: string; url: string }>(
    "POST",
    "/checkout/sessions",
    body,
    `checkout_${args.orderId}` // idempotency: create create ซ้ำ order เดิม = session เดิม
  );
  return { gateway: "stripe", mock: false, sessionId: session.id, redirectUrl: session.url };
}

/** ดึง Checkout Session สด (สำหรับ status poll / re-verify) */
export async function retrieveStripeSession(sessionId: string): Promise<{
  id?: string;
  status?: string;
  url?: string;
  payment_status?: string;
  amount_total?: number;
  payment_intent?: string;
  metadata?: Record<string, string>;
} | null> {
  if (!stripeReady()) return null;
  try {
    return await stripeRequest("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  } catch {
    return null;
  }
}

/**
 * ตรวจลายเซ็น webhook ของ Stripe (Stripe-Signature: t=...,v1=...)
 * คืน event ที่ parse แล้วถ้า valid · null ถ้าไม่ผ่าน
 * ⚠️ payload ต้องเป็น raw body string (ห้าม JSON.parse ก่อน)
 */
export function constructStripeEvent(rawBody: string, sigHeader: string | null): Record<string, unknown> | null {
  const secret = stripeWebhookSecret();
  if (!secret) return null; // live/real ต้องมี secret เสมอ
  if (!sigHeader) return null;
  const parts = sigHeader.split(",").reduce<Record<string, string>>((m, p) => {
    const idx = p.indexOf("=");
    if (idx > 0) m[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    return m;
  }, {});
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return null;
  // กัน replay: timestamp ต่างเกิน 5 นาที = ปฏิเสธ
  const ageSec = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(ageSec) || ageSec > 300) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  let match = false;
  try {
    match = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    match = false;
  }
  if (!match) return null;
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
