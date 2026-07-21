/**
 * GET /api/account/history · ประวัติยาม (เติม/ใช้) + ข้อมูลชำระเงิน ฿/วิธีจ่าย (join orders)
 * 15 พ.ค. 2026 · 9 ก.ค. 2569 เพิ่ม: join orders (amount_thb+pay_method) + pagination (offset)
 */
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q } from "@/lib/db";

const PAGE = 50;

export async function GET(req: Request) {
  const s = await getMobileSession(req);
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const url = new URL(req.url);
  const offset = Math.max(0, Math.min(5000, parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  // LEFT JOIN orders เฉพาะรายการซื้อ (ref_payment_id = 'order_'<uuid>) → ได้ ฿ + วิธีจ่าย · spend (ref_payment_id null) = null
  const rows = await q(
    `SELECT t.id, t.delta, t.reason, t.balance_after, t.ref_feature, t.note, t.created_at,
            o.amount_thb, o.pay_method, o.package_code
       FROM hour_transactions t
       LEFT JOIN orders o
         ON t.ref_payment_id IS NOT NULL
        AND o.id::text = regexp_replace(t.ref_payment_id, '^order_', '')
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT ${PAGE + 1} OFFSET ${offset}`,
    [s.userId]
  );
  const hasMore = rows.length > PAGE;
  return NextResponse.json({ transactions: rows.slice(0, PAGE), hasMore, offset, page: PAGE });
}
