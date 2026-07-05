/**
 * POST /api/payment/create · สร้าง order (pending) + เรียก gateway สร้าง charge/session
 * GET  /api/payment/create · list แพ็กเกจ (public config) สำหรับ UI
 * r408 · 5 ก.ค. 2026
 *
 * ความปลอดภัย:
 *  - auth (getSession) เสมอ · order ผูก user_id
 *  - amount/yam มาจาก config server-side เท่านั้น (ห้ามเชื่อ client)
 *  - order สร้างสถานะ pending — ยังไม่เติมยามจนกว่า webhook/verify จะยืนยัน
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getPackage, listPackagesPublic } from "@/lib/payment/packages";
import { createStripeCheckout } from "@/lib/payment/stripe";
import { createOmiseCharge } from "@/lib/payment/omise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ packages: listPackagesPublic() });
}

function baseUrl(req: Request): string {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : "";
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    packageCode?: string;
    method?: string;
    gateway?: string;
    omiseToken?: string;
  };

  const pkg = getPackage(body.packageCode);
  if (!pkg) {
    return NextResponse.json(
      { error: "invalid_package", available: Object.keys(listPackagesPublic().reduce((m, p) => ((m[p.code] = 1), m), {} as Record<string, number>)) },
      { status: 400 }
    );
  }

  const method: "promptpay" | "card" = body.method === "card" ? "card" : "promptpay";
  const gateway: "omise" | "stripe" = body.gateway === "omise" ? "omise" : "stripe";

  // สร้าง order pending (amount/yam จาก config เท่านั้น)
  const order = await q1<{ id: string }>(
    `INSERT INTO orders(user_id, package_code, amount_thb, yam_granted, status, pay_method)
       VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id`,
    [s.userId, pkg.code, pkg.price_thb, pkg.yam, `${gateway}_${method}`]
  );
  if (!order) return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  const orderId = order.id;

  const site = baseUrl(req);
  const successUrl = `${site}/account.html`;
  const cancelUrl = `${site}/account.html?payment=cancel`;

  try {
    if (gateway === "stripe") {
      const email = await q1<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [s.userId]);
      const r = await createStripeCheckout({
        orderId,
        amountThb: pkg.price_thb,
        packageCode: pkg.code,
        packageName: pkg.name.th,
        method,
        userId: s.userId,
        userEmail: email?.email,
        successUrl,
        cancelUrl,
      });
      // เก็บ gateway ref ไว้ที่ pay_ref (สำหรับ status re-verify)
      await q1(`UPDATE orders SET pay_ref=$2 WHERE id=$1`, [orderId, r.sessionId]);
      return NextResponse.json({
        ok: true,
        orderId,
        gateway,
        method,
        mock: r.mock,
        redirectUrl: r.redirectUrl,
        amount_thb: pkg.price_thb,
        yam: pkg.yam,
      });
    }

    // omise
    const r = await createOmiseCharge({
      orderId,
      amountThb: pkg.price_thb,
      packageCode: pkg.code,
      method,
      omiseToken: body.omiseToken,
      returnUri: successUrl,
    });
    await q1(`UPDATE orders SET pay_ref=$2 WHERE id=$1`, [orderId, r.chargeId]);
    return NextResponse.json({
      ok: true,
      orderId,
      gateway,
      method,
      mock: r.mock,
      qrImage: r.qrImage,
      redirectUrl: r.authorizeUri,
      amount_thb: pkg.price_thb,
      yam: pkg.yam,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q1(`UPDATE orders SET status='failed', note=$2 WHERE id=$1 AND status='pending'`, [orderId, `create_error: ${msg}`]);
    return NextResponse.json({ error: "gateway_error", detail: msg, orderId }, { status: 502 });
  }
}
