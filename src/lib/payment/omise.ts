/**
 * payment/omise.ts · Omise adapter (PromptPay QR)
 * r408 · 5 ก.ค. 2026
 *
 * สถานะ: ยังไม่มี OMISE key จากเจ้านาย → ทำงานโหมด mock (sandbox) ให้เทส flow ได้ครบ
 *   เมื่อใส่ OMISE_SECRET_KEY จริง → สลับเป็นเรียก Omise API อัตโนมัติ
 *
 * ความปลอดภัย: webhook ของ Omise ไม่มีลายเซ็น HMAC มาตรฐาน →
 *   ยืนยันด้วยการ "re-fetch charge จาก API" (server-side confirm) เท่านั้น · ห้ามเชื่อ payload ตรง ๆ
 */
const OMISE_BASE = "https://api.omise.co";

export function omiseSecret(): string {
  return process.env.OMISE_SECRET_KEY || "";
}
export function omiseReady(): boolean {
  const k = omiseSecret();
  return !!k && (k.startsWith("skey_") || k.startsWith("sk"));
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${omiseSecret()}:`).toString("base64");
}

async function omiseRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, string>
): Promise<T> {
  if (!omiseReady()) throw new Error("OMISE_SECRET_KEY not set");
  const headers: Record<string, string> = { Authorization: authHeader() };
  let payload: string | undefined;
  if (body) {
    payload = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(`${OMISE_BASE}${path}`, { method, headers, body: payload });
  const json = (await res.json()) as { object?: string; code?: string; message?: string } & T;
  if (json.object === "error") throw new Error(`omise: ${json.code} ${json.message}`);
  return json as T;
}

type OmiseChargeArgs = {
  orderId: string;
  amountThb: number;
  packageCode: string;
  method: "promptpay" | "card";
  omiseToken?: string; // เฉพาะบัตร (จาก Omise.js ฝั่ง client)
  returnUri?: string;
};

export type OmiseResult = {
  gateway: "omise";
  mock: boolean;
  chargeId: string;
  /** QR PromptPay (data URI หรือ url) สำหรับสแกนจ่าย */
  qrImage: string | null;
  /** สำหรับบัตรที่ต้อง 3DS */
  authorizeUri: string | null;
};

/** placeholder QR (SVG data URI) — ใช้ตอน mock ให้ UI มีอะไรโชว์ */
function mockQrDataUri(orderId: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
<rect width="220" height="220" fill="#fff"/>
<rect x="16" y="16" width="188" height="188" fill="none" stroke="#111" stroke-width="4"/>
<text x="110" y="100" font-family="monospace" font-size="13" text-anchor="middle" fill="#111">MOCK PROMPTPAY</text>
<text x="110" y="122" font-family="monospace" font-size="10" text-anchor="middle" fill="#555">${orderId.slice(0, 8)}</text>
<text x="110" y="150" font-family="monospace" font-size="9" text-anchor="middle" fill="#999">sandbox test only</text>
</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

/** สร้าง charge (PromptPay → QR · บัตร → authorize uri) */
export async function createOmiseCharge(args: OmiseChargeArgs): Promise<OmiseResult> {
  const satang = Math.round(args.amountThb * 100);

  // mock (ยังไม่มี key) — คืน QR ปลอมให้เทส · ยืนยันจริงผ่าน /api/payment/_mock-pay
  if (!omiseReady()) {
    return {
      gateway: "omise",
      mock: true,
      chargeId: `mock_omise_${args.orderId}`,
      qrImage: args.method === "promptpay" ? mockQrDataUri(args.orderId) : null,
      authorizeUri: null,
    };
  }

  const body: Record<string, string> = {
    amount: String(satang),
    currency: "thb",
    "metadata[order_id]": args.orderId,
    "metadata[package_code]": args.packageCode,
    "metadata[amount_thb]": String(args.amountThb),
  };
  if (args.method === "promptpay") {
    body["source[type]"] = "promptpay";
  } else {
    if (!args.omiseToken) throw new Error("omise card requires token");
    body["card"] = args.omiseToken;
    if (args.returnUri) body["return_uri"] = args.returnUri;
  }

  const charge = await omiseRequest<{
    id: string;
    authorize_uri?: string;
    source?: { scannable_code?: { image?: { download_uri?: string } } };
  }>("POST", "/charges", body);

  return {
    gateway: "omise",
    mock: false,
    chargeId: charge.id,
    qrImage: charge.source?.scannable_code?.image?.download_uri || null,
    authorizeUri: charge.authorize_uri || null,
  };
}

/**
 * ยืนยัน charge ด้วยการ re-fetch (server-side confirm) — หัวใจความปลอดภัยของ Omise
 * คืน { paid, amountThb, orderId } · ห้ามเชื่อ webhook payload โดยไม่เรียกอันนี้
 */
export async function verifyOmiseCharge(chargeId: string): Promise<{
  paid: boolean;
  amountThb: number;
  orderId: string | null;
} | null> {
  if (!omiseReady()) return null;
  try {
    const charge = await omiseRequest<{
      status?: string;
      paid?: boolean;
      amount?: number;
      metadata?: { order_id?: string };
    }>("GET", `/charges/${encodeURIComponent(chargeId)}`);
    return {
      paid: charge.status === "successful" || charge.paid === true,
      amountThb: Math.round(Number(charge.amount || 0) / 100),
      orderId: charge.metadata?.order_id || null,
    };
  } catch {
    return null;
  }
}
