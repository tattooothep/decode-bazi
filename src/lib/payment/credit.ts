/**
 * payment/credit.ts · เติมยาม / เปิดสมาชิก แบบ atomic + idempotent
 * r408 · 5 ก.ค. 2026
 *
 * ⚠️ นี่คือหัวใจความปลอดภัย (เกี่ยวเงินจริง) — อ่านกฎ 5 ข้อก่อนแก้:
 *  1. เติมได้ก็ต่อเมื่อยืนยัน payment แล้วเท่านั้น (caller = webhook signature verified / server-side charge confirmed)
 *  2. Idempotent: webhook ยิงซ้ำ = เติมครั้งเดียว (orders.status transition + ref_payment_id UNIQUE)
 *  3. ตรวจยอดตรง: paidAmountThb ต้อง = order.amount_thb (กันแก้ราคา client)
 *  4. Atomic: mark order paid + เติม hour_balance + insert hour_transactions + เปิด sub ใน transaction เดียว (row lock)
 *  5. caller ต้อง auth/verify มาก่อน — credit.ts ไม่เชื่อ client โดยตรง
 */
import { pool } from "@/lib/db";
import { getPackage, thbToSatang } from "./packages";
import { createPendingAffiliateRewardForOrder } from "@/lib/affiliate";
import { recomputePaidEntitlement } from "@/lib/mobile-store-ledger";

export type FulfillResult =
  | { ok: true; status: "credited"; orderId: string; userId: string; yam: number; balance_after: number; tier: string | null; sub_expires_at: string | null }
  | { ok: true; status: "already"; orderId: string; note: string }
  | { ok: false; status: "amount_mismatch"; orderId: string; expected_thb: number; paid_thb: number }
  | { ok: false; status: "error"; orderId: string; error: string };

/**
 * ยืนยันชำระเงินสำเร็จ → เติมยาม/เปิดสมาชิก (atomic + idempotent)
 * @param orderId       order ที่รอชำระ (สร้างไว้ตอน create แล้ว)
 * @param payRef        อ้างอิงจาก gateway (charge id / payment_intent) เก็บลง orders.pay_ref
 * @param payMethod     'stripe' | 'promptpay' | 'omise' | 'mock' ...
 * @param paidAmountThb ยอดที่ตัดจริง (บาท) จาก gateway — ตรวจตรงกับ order.amount_thb
 */
export async function fulfillOrder(
  orderId: string,
  payRef: string,
  payMethod: string,
  paidAmountThb: number
): Promise<FulfillResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) ล็อกแถว order + อ่านสถานะ (SELECT ... FOR UPDATE = กัน race + double credit)
    const ordRes = await client.query(
      `SELECT id, user_id, package_code, amount_thb, yam_granted, status
         FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = ordRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return { ok: false, status: "error", orderId, error: "order_not_found" };
    }

    // idempotent guard #1: สถานะไม่ใช่ pending = เคยประมวลผลแล้ว → ไม่ทำซ้ำ
    if (order.status !== "pending") {
      await client.query("ROLLBACK");
      if (order.status === "paid") {
        await createPendingAffiliateRewardForOrder(orderId, "payment_already_paid")
          .catch((e) => console.warn("[affiliate] reward backfill failed", e instanceof Error ? e.message : String(e)));
      }
      return { ok: true, status: "already", orderId, note: `order already ${order.status}` };
    }

    // 2) ตรวจยอดตรง (กันแก้ราคา client / gateway ตัดผิด) — เทียบทั้งบาทและ satang
    const expectedThb = Number(order.amount_thb);
    const paidOk =
      Number(paidAmountThb) === expectedThb ||
      thbToSatang(Number(paidAmountThb)) === thbToSatang(expectedThb);
    if (!paidOk) {
      // ยอดไม่ตรง = ไม่เติม · mark failed ไว้ตรวจสอบ
      await client.query(
        `UPDATE orders SET status='failed', pay_ref=$2, pay_method=$3,
           note = COALESCE(note,'') || $4
         WHERE id=$1 AND status='pending'`,
        [orderId, payRef, payMethod, ` amount_mismatch expected=${expectedThb} paid=${paidAmountThb}`]
      );
      await client.query("COMMIT");
      return { ok: false, status: "amount_mismatch", orderId, expected_thb: expectedThb, paid_thb: Number(paidAmountThb) };
    }

    // 3) config แพ็กเกจ (server-side · ไม่เชื่อ client) — ยืนยันยาม/ราคา/tier ตรง config
    const pkg = getPackage(order.package_code);
    if (!pkg) {
      await client.query("ROLLBACK");
      return { ok: false, status: "error", orderId, error: "unknown_package_code" };
    }
    if (pkg.price_thb !== expectedThb) {
      // order.amount_thb ถูกแก้ไม่ตรง config = ผิดปกติ → ไม่เติม
      await client.query(
        `UPDATE orders SET status='failed', note = COALESCE(note,'') || $2 WHERE id=$1 AND status='pending'`,
        [orderId, ` order_amount_config_mismatch config=${pkg.price_thb}`]
      );
      await client.query("COMMIT");
      return { ok: false, status: "amount_mismatch", orderId, expected_thb: pkg.price_thb, paid_thb: expectedThb };
    }
    const yam = pkg.yam;

    // idempotent guard #2 (belt-and-suspenders): ถ้ามี txn ที่ ref_payment_id ตรง order นี้แล้ว = เคยเติม
    const refPaymentId = `order_${orderId}`;
    const dup = await client.query(
      `SELECT 1 FROM hour_transactions WHERE ref_payment_id = $1 LIMIT 1`,
      [refPaymentId]
    );
    if (dup.rows[0]) {
      // เคยเติมแล้ว (order status ควรเป็น paid อยู่แล้ว) — ปิดให้สถานะ paid เผื่อ desync แล้วจบ
      await client.query(
        `UPDATE orders SET status='paid', paid_at=COALESCE(paid_at, now()) WHERE id=$1 AND status='pending'`,
        [orderId]
      );
      await client.query("COMMIT");
      return { ok: true, status: "already", orderId, note: "ref_payment_id exists" };
    }

    // 4) mark order paid (transition guard: WHERE status='pending')
    const upd = await client.query(
      `UPDATE orders SET status='paid', pay_ref=$2, pay_method=$3, paid_at=now()
        WHERE id=$1 AND status='pending' RETURNING id`,
      [orderId, payRef, payMethod]
    );
    if (!upd.rows[0]) {
      // แพ้ race — มี process อื่น mark paid ไปแล้ว
      await client.query("ROLLBACK");
      return { ok: true, status: "already", orderId, note: "lost transition race" };
    }

    // 5) เติมยาม + log ธุรกรรม (ref_payment_id UNIQUE = กันซ้ำชั้นสุดท้าย)
    const balRes = await client.query(
      `UPDATE users SET hour_balance = COALESCE(hour_balance,0) + $2 WHERE id=$1 RETURNING hour_balance`,
      [order.user_id, yam]
    );
    const balanceAfter = Number(balRes.rows[0]?.hour_balance ?? 0);
    await client.query(
      `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.user_id, yam, `purchase_${pkg.kind}`, balanceAfter, refPaymentId, `${pkg.code} · ${pkg.name.th}`]
    );

    // 6) subscription → เปิด/ต่อ tier + sub_expires_at (ต่อจาก max(ปัจจุบัน, now))
    let tier: string | null = null;
    let subExpiresAt: string | null = null;
    if (pkg.kind === "subscription" && pkg.tier && pkg.days) {
      const subRes = await client.query(
        `UPDATE users
            SET tier = $2,
                sub_expires_at = GREATEST(COALESCE(sub_expires_at, now()), now()) + ($3 || ' days')::interval
          WHERE id = $1
          RETURNING tier, sub_expires_at`,
        [order.user_id, pkg.tier, String(pkg.days)]
      );
      tier = subRes.rows[0]?.tier ?? pkg.tier;
      subExpiresAt = subRes.rows[0]?.sub_expires_at ?? null;

      // บันทึก subscriptions row (org-scoped) แบบ best-effort — เฉพาะ user ที่มี org
      const orgRes = await client.query(`SELECT current_org_id FROM users WHERE id=$1`, [order.user_id]);
      const orgId = orgRes.rows[0]?.current_org_id || null;
      if (orgId) {
        await client.query(
          `INSERT INTO subscriptions
             (id, org_id, tier, status, started_at, current_period_start, current_period_end,
              payment_provider, payment_id, amount_cents, currency, interval)
           VALUES (gen_random_uuid(), $1,$2,'active', now(), now(), now() + ($3 || ' days')::interval,
              $4, $5, $6, 'thb', $7)`,
          [
            orgId,
            pkg.tier,
            String(pkg.days),
            payMethod,
            payRef,
            thbToSatang(pkg.price_thb),
            pkg.days >= 365 ? "year" : "month",
          ]
        );
      }

      const source = await client.query<{ id: string }>(
        `INSERT INTO product_entitlement_sources
           (user_id,source_kind,source_ref,tier,status,starts_at,expires_at,metadata)
         VALUES($1,'web',$2,$3,'active',now(),$4::timestamptz,$5::jsonb)
         ON CONFLICT(source_kind,source_ref) DO UPDATE SET
           status='active',expires_at=EXCLUDED.expires_at,updated_at=now()
         RETURNING id`,
        [order.user_id, `order:${orderId}`, pkg.tier, subExpiresAt, JSON.stringify({ gateway: payMethod, package_code: pkg.code })]
      );
      if (!source.rows[0]) throw new Error("web_entitlement_source_failed");
      const selected = await recomputePaidEntitlement(client, order.user_id);
      tier = selected?.tier || tier;
      subExpiresAt = selected?.sub_expires_at || subExpiresAt;
    }

    await client.query("COMMIT");
    await createPendingAffiliateRewardForOrder(orderId, "payment_paid")
      .catch((e) => console.warn("[affiliate] reward create failed", e instanceof Error ? e.message : String(e)));
    return {
      ok: true,
      status: "credited",
      orderId,
      userId: order.user_id,
      yam,
      balance_after: balanceAfter,
      tier,
      sub_expires_at: subExpiresAt,
    };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    const msg = e instanceof Error ? e.message : String(e);
    // ชนกับ ref_payment_id UNIQUE = webhook race ซ้ำ → ถือว่าเติมแล้ว (idempotent)
    if (/uq_hour_tx_ref_payment|duplicate key/i.test(msg)) {
      return { ok: true, status: "already", orderId, note: "unique ref_payment_id race" };
    }
    return { ok: false, status: "error", orderId, error: msg };
  } finally {
    client.release();
  }
}

export type ClawbackResult =
  | { ok: true; status: "clawed" | "already" | "nothing"; orderId: string; clawed: number; balance_after: number }
  | { ok: false; status: "error"; orderId: string; error: string };

/**
 * ดึงยามคืนจาก order ที่ paid/refunded (idempotent via ref_payment_id).
 * ใช้ตอน refund/admin reverse — ไม่แตะ affiliate tables (ให้ caller เรียก reverse แยก).
 */
export async function clawbackYamForOrder(orderId: string, note = "refund clawback"): Promise<ClawbackResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ordRes = await client.query(
      `SELECT id, user_id, yam_granted, status FROM orders WHERE id=$1 FOR UPDATE`,
      [orderId]
    );
    const order = ordRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return { ok: false, status: "error", orderId, error: "order_not_found" };
    }
    if (!["paid", "refunded"].includes(order.status)) {
      await client.query("ROLLBACK");
      return { ok: false, status: "error", orderId, error: `order_status_${order.status}` };
    }
    const yam = Math.max(0, Number(order.yam_granted) || 0);
    const refRefundId = `order_${orderId}_refund`;
    const dup = await client.query(
      `SELECT 1 FROM hour_transactions WHERE ref_payment_id=$1 LIMIT 1`,
      [refRefundId]
    );
    if (dup.rows[0]) {
      const bal = await client.query(`SELECT hour_balance FROM users WHERE id=$1`, [order.user_id]);
      await client.query("COMMIT");
      return {
        ok: true,
        status: "already",
        orderId,
        clawed: 0,
        balance_after: Number(bal.rows[0]?.hour_balance ?? 0),
      };
    }
    if (yam <= 0) {
      await client.query("COMMIT");
      return { ok: true, status: "nothing", orderId, clawed: 0, balance_after: 0 };
    }
    const balRes = await client.query(
      `UPDATE users SET hour_balance = GREATEST(0, COALESCE(hour_balance,0) - $2)
         WHERE id=$1 RETURNING hour_balance`,
      [order.user_id, yam]
    );
    const balanceAfter = Number(balRes.rows[0]?.hour_balance ?? 0);
    await client.query(
      `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, note)
         VALUES ($1,$2,'refund_clawback',$3,$4,$5)`,
      [order.user_id, -yam, balanceAfter, refRefundId, note.slice(0, 300)]
    );
    await client.query("COMMIT");
    return { ok: true, status: "clawed", orderId, clawed: yam, balance_after: balanceAfter };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    const msg = e instanceof Error ? e.message : String(e);
    if (/uq_hour_tx_ref_payment|duplicate key/i.test(msg)) {
      return { ok: true, status: "already", orderId, clawed: 0, balance_after: 0 };
    }
    return { ok: false, status: "error", orderId, error: msg };
  } finally {
    client.release();
  }
}

export type RefundOrderResult =
  | {
      ok: true;
      orderId: string;
      clawback: ClawbackResult;
      affiliate_reversed: number;
    }
  | { ok: false; orderId: string; error: string };

/**
 * Admin/gateway refund: clawback ยาม + reverse affiliate reward (existing hook).
 * Does not fork fulfillOrder; does not write hour_balance from affiliate module.
 */
export async function refundPaidOrder(
  orderId: string,
  reason: string,
  actorUserId?: string | null
): Promise<RefundOrderResult> {
  const clawback = await clawbackYamForOrder(orderId, reason);
  if (!clawback.ok) {
    return { ok: false, orderId, error: clawback.error };
  }
  const entitlementClient = await pool.connect();
  try {
    await entitlementClient.query("BEGIN");
    const order = await entitlementClient.query<{ user_id: string }>(
      `SELECT user_id::text FROM orders WHERE id=$1 FOR UPDATE`,
      [orderId]
    );
    if (!order.rows[0]) throw new Error("order_not_found");
    await entitlementClient.query(
      `UPDATE product_entitlement_sources
          SET status='revoked',updated_at=now(),
              metadata=metadata || $2::jsonb
        WHERE source_kind='web' AND source_ref=$1 AND status<>'revoked'`,
      [`order:${orderId}`, JSON.stringify({ refund_reason: reason.slice(0, 120), refunded_at: new Date().toISOString() })]
    );
    await recomputePaidEntitlement(entitlementClient, order.rows[0].user_id);
    await entitlementClient.query("COMMIT");
  } catch (e) {
    await entitlementClient.query("ROLLBACK").catch(() => null);
    return { ok: false, orderId, error: e instanceof Error ? e.message : String(e) };
  } finally {
    entitlementClient.release();
  }
  let affiliate_reversed = 0;
  try {
    const mod = await import("@/lib/affiliate").catch(() => null);
    if (mod?.reverseAffiliateRewardsForOrder) {
      const r = await mod.reverseAffiliateRewardsForOrder(orderId, reason, actorUserId);
      affiliate_reversed = Number(r?.reversed || 0);
    }
  } catch (e) {
    console.warn("[refund] affiliate reverse skipped", e instanceof Error ? e.message : String(e));
  }
  // Ensure order marked refunded even if no affiliate reward row
  try {
    await pool.query(
      `UPDATE orders SET status='refunded',
          note = COALESCE(note,'') || $2
        WHERE id=$1 AND status='paid'`,
      [orderId, ` refund:${reason.slice(0, 120)}`]
    );
  } catch { /* noop */ }
  return { ok: true, orderId, clawback, affiliate_reversed };
}
