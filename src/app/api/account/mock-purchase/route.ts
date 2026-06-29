/**
 * POST /api/account/mock-purchase · simulate buy package (no Stripe yet)
 * รับ: { package: 'hour_100'|'hour_500'|'hour_1500'|'premium_1y'|'master_1y' }
 * 15 พ.ค. 2026 · phase 1 mock · Stripe real = phase 2
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

const PACKAGES: Record<string, { hours: number; tier?: string; days?: number; price_thb: number; label: string }> = {
  hour_100:    { hours: 100,   price_thb: 99,   label: "100 時" },
  hour_500:    { hours: 550,   price_thb: 449,  label: "500 時 + 50 boost" },
  hour_1500:   { hours: 1700,  price_thb: 1290, label: "1,500 時 + 200 boost" },
  premium_1y:  { hours: 120,   tier: "premium", days: 365, price_thb: 599,  label: "Premium 1 ปี + 120 時" },
  master_1y:   { hours: 1200,  tier: "master",  days: 365, price_thb: 5990, label: "Master 1 ปี + 1,200 時" },
};

export async function POST(req: Request) {
  // 29 มิ.ย. · security (audit): mock-purchase = dev/test เท่านั้น · กันเติมเครดิต/อัปเกรด tier ฟรีใน production (รอ Stripe จริง phase 2)
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PURCHASE !== "1") {
    return NextResponse.json({ error: "mock_purchase_disabled", note: "real payment coming soon" }, { status: 403 });
  }
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pkgKey = String(body.package || "");
  const pkg = PACKAGES[pkgKey];
  if (!pkg) return NextResponse.json({ error: "invalid package", available: Object.keys(PACKAGES) }, { status: 400 });

  /* extend subscription if tier package */
  let subExpiresAt: string | null = null;
  if (pkg.tier && pkg.days) {
    const row = await q1<{ sub_expires_at: string | null }>(`SELECT sub_expires_at FROM users WHERE id=$1`, [s.userId]);
    const cur = row?.sub_expires_at ? new Date(row.sub_expires_at).getTime() : 0;
    const baseTs = Math.max(cur, Date.now());
    subExpiresAt = new Date(baseTs + pkg.days * 86400 * 1000).toISOString();
    await q(`UPDATE users SET tier=$1, sub_expires_at=$2 WHERE id=$3`, [pkg.tier, subExpiresAt, s.userId]);
  }

  /* credit hours */
  const updated = await q1<{ hour_balance: number }>(
    `UPDATE users SET hour_balance = hour_balance + $2 WHERE id=$1 RETURNING hour_balance`,
    [s.userId, pkg.hours]
  );
  await q(
    `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, note)
     VALUES ($1, $2, 'purchase_mock', $3, $4, $5)`,
    [s.userId, pkg.hours, updated?.hour_balance || 0, `mock_${pkgKey}_${Date.now()}`, pkg.label]
  );
  return NextResponse.json({
    ok: true,
    package: pkgKey,
    hours_added: pkg.hours,
    tier: pkg.tier || null,
    sub_expires_at: subExpiresAt,
    balance_after: updated?.hour_balance || 0,
    label: pkg.label,
    price_thb: pkg.price_thb,
    note: "Phase 1 mock · Stripe payment phase 2",
  });
}

export async function GET() {
  return NextResponse.json({ packages: Object.entries(PACKAGES).map(([k, v]) => ({ key: k, ...v })) });
}
