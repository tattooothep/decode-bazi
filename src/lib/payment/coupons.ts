/**
 * Server-side coupon apply for checkout (packages.ts remains price SoT).
 * Kinds: bonus_yam | percent_off | fixed_off
 */
import { q1 } from "@/lib/db";

export type CouponRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
};

export type AppliedCoupon = {
  code: string;
  kind: string;
  value: number;
  amount_thb: number;
  yam: number;
  discount_thb: number;
  bonus_yam: number;
};

export async function loadActiveCoupon(code: string | null | undefined): Promise<CouponRow | null> {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  const row = await q1<CouponRow>(
    `SELECT id, code, kind, value, max_uses, used_count, expires_at, active
       FROM coupons WHERE upper(code)=$1 LIMIT 1`,
    [c]
  );
  if (!row || !row.active) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.max_uses != null && Number(row.used_count) >= Number(row.max_uses)) return null;
  return row;
}

/** Pure pricing math — testable without DB. */
export function applyCouponToPackage(
  base: { price_thb: number; yam: number },
  coupon: { kind: string; value: number }
): { amount_thb: number; yam: number; discount_thb: number; bonus_yam: number } {
  const price = Math.max(0, Math.trunc(Number(base.price_thb) || 0));
  const yam = Math.max(0, Math.trunc(Number(base.yam) || 0));
  const value = Math.max(0, Math.trunc(Number(coupon.value) || 0));
  const kind = String(coupon.kind || "");

  if (kind === "bonus_yam") {
    return { amount_thb: price, yam: yam + value, discount_thb: 0, bonus_yam: value };
  }
  if (kind === "percent_off") {
    const pct = Math.min(100, value);
    const discount = Math.floor((price * pct) / 100);
    return {
      amount_thb: Math.max(0, price - discount),
      yam,
      discount_thb: discount,
      bonus_yam: 0,
    };
  }
  if (kind === "fixed_off") {
    const discount = Math.min(price, value);
    return {
      amount_thb: Math.max(0, price - discount),
      yam,
      discount_thb: discount,
      bonus_yam: 0,
    };
  }
  return { amount_thb: price, yam, discount_thb: 0, bonus_yam: 0 };
}

type CheckoutPackage = { price_thb: number; yam: number; code: string };

export async function resolveCheckoutPricing<TPackage extends CheckoutPackage>(
  packageCode: string,
  couponCode: string | null | undefined,
  getPackage: (code: string) => TPackage | null
): Promise<
  | { ok: true; pkg: TPackage; applied: AppliedCoupon | null }
  | { ok: false; error: string }
> {
  const pkg = getPackage(packageCode);
  if (!pkg) return { ok: false, error: "invalid_package" };

  const coupon = await loadActiveCoupon(couponCode);
  if (couponCode && String(couponCode).trim() && !coupon) {
    return { ok: false, error: "invalid_coupon" };
  }
  if (!coupon) {
    return {
      ok: true,
      pkg,
      applied: null,
    };
  }
  const math = applyCouponToPackage(pkg, coupon);
  return {
    ok: true,
    pkg,
    applied: {
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      amount_thb: math.amount_thb,
      yam: math.yam,
      discount_thb: math.discount_thb,
      bonus_yam: math.bonus_yam,
    },
  };
}

export async function markCouponUsed(code: string | null | undefined): Promise<void> {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return;
  await q1(
    `UPDATE coupons SET used_count = used_count + 1
      WHERE upper(code)=$1 AND active=true
        AND (max_uses IS NULL OR used_count < max_uses)`,
    [c]
  ).catch(() => null);
}
