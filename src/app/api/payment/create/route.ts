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
import { getCheckoutPackage, listPackagesPublic } from "@/lib/payment/packages";
import { createStripeCheckout, retrieveStripeSession } from "@/lib/payment/stripe";
import { createOmiseCharge } from "@/lib/payment/omise";
import { markCouponUsed, resolveCheckoutPricing } from "@/lib/payment/coupons";

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

function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const u = new URL(raw, "https://hourkey.local");
    const allowed = new Set(["/ask", "/ask.html"]);
    if (!allowed.has(u.pathname)) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    packageCode?: string;
    method?: string;
    gateway?: string;
    omiseToken?: string;
    returnPath?: string;
    couponCode?: string;
    coupon?: string;
  };

  const pricing = await resolveCheckoutPricing(
    String(body.packageCode || ""),
    body.couponCode || body.coupon,
    getCheckoutPackage
  );
  if (!pricing.ok) {
    return NextResponse.json(
      {
        error: pricing.error,
        available: Object.keys(listPackagesPublic().reduce((m, p) => ((m[p.code] = 1), m), {} as Record<string, number>)),
      },
      { status: 400 }
    );
  }
  const pkg = pricing.pkg;
  const amountThb = pricing.applied?.amount_thb ?? pkg.price_thb;
  const yamGranted = pricing.applied?.yam ?? pkg.yam;
  const couponCode = pricing.applied?.code || null;

  const method: "promptpay" | "card" = body.method === "card" ? "card" : "promptpay";
  const gateway: "omise" | "stripe" = body.gateway === "omise" ? "omise" : "stripe";

  // A second click should return the still-open Stripe Checkout instead of
  // creating another pending order and another amount in Admin.
  if (gateway === "stripe") {
    const recent = await q1<{ id: string; pay_ref: string | null }>(
      `SELECT id, pay_ref FROM orders
        WHERE user_id=$1 AND package_code=$2 AND amount_thb=$3 AND yam_granted=$4
          AND coupon_code IS NOT DISTINCT FROM $5
          AND pay_method=$6 AND status='pending'
          AND created_at > now() - interval '15 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [s.userId, pkg.code, amountThb, yamGranted, couponCode, `${gateway}_${method}`]
    );
    if (recent?.pay_ref?.startsWith("cs_")) {
      const live = await retrieveStripeSession(recent.pay_ref);
      if (live?.payment_status === "paid") {
        return NextResponse.json(
          { error: "payment_already_completed", orderId: recent.id },
          { status: 409 }
        );
      }
      if (live?.status === "open" && live.url) {
        return NextResponse.json({
          ok: true,
          reused: true,
          orderId: recent.id,
          gateway,
          method,
          mock: false,
          redirectUrl: live.url,
          amount_thb: amountThb,
          yam: yamGranted,
          coupon: pricing.applied,
        });
      }
    }
  }

  // สร้าง order pending — ราคา/ยามจาก packages.ts ± coupon server-side เท่านั้น
  const order = await q1<{ id: string }>(
    `INSERT INTO orders(user_id, package_code, amount_thb, yam_granted, coupon_code, status, pay_method)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
    [s.userId, pkg.code, amountThb, yamGranted, couponCode, `${gateway}_${method}`]
  );
  if (!order) return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  const orderId = order.id;
  if (couponCode) await markCouponUsed(couponCode);

  const site = baseUrl(req);
  const returnPath = safeReturnPath(body.returnPath);
  // แนบ ?payment=success/cancel เสมอ (แม้ไม่มี returnPath) → หน้าปลายทางโชว์แบนเนอร์ขอบคุณ/ยกเลิก
  const successUrl = `${site}${returnPath || "/account.html"}${(returnPath || "/account.html").includes("?") ? "&" : "?"}payment=success`;
  const cancelUrl = `${site}${returnPath || "/account.html"}${(returnPath || "/account.html").includes("?") ? "&" : "?"}payment=cancel`;

  try {
    if (gateway === "stripe") {
      const email = await q1<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [s.userId]);
      const r = await createStripeCheckout({
        orderId,
        amountThb,
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
        amount_thb: amountThb,
        yam: yamGranted,
        coupon: pricing.applied,
      });
    }

    // omise
    const r = await createOmiseCharge({
      orderId,
      amountThb,
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
      amount_thb: amountThb,
      yam: yamGranted,
      coupon: pricing.applied,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q1(`UPDATE orders SET status='failed', note=$2 WHERE id=$1 AND status='pending'`, [orderId, `create_error: ${msg}`]);
    return NextResponse.json({ error: "gateway_error", detail: msg, orderId }, { status: 502 });
  }
}
