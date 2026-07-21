import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { mobileStorePackage } from "@/lib/mobile-store-products";

export type VerifiedStorePurchase = {
  platform: "apple" | "google";
  productId: string;
  eventRef: string;
  originalRef: string;
  eventKind: "purchase" | "restore" | "renewal" | "refund" | "revoke" | "status_sync";
  state: "active" | "grace" | "canceled" | "pending" | "expired" | "revoked";
  environment: "production" | "sandbox" | "test";
  purchasedAt: string | null;
  expiresAt: string | null;
  purchaseToken?: string | null;
  autoRenewing?: boolean | null;
  accountBinding: string;
  summary?: Record<string, unknown>;
};

export type ApplyStoreResult = {
  status: "applied" | "already";
  plan: "free" | "premium" | "master";
  tier: string;
  sub_expires_at: string | null;
  hour_balance: number;
};

function isAccessState(state: VerifiedStorePurchase["state"]): boolean {
  return state === "active" || state === "grace" || state === "canceled";
}

export async function recomputePaidEntitlement(client: PoolClient, userId: string) {
  await client.query(
    `UPDATE product_entitlement_sources
        SET status='expired',updated_at=now()
      WHERE user_id=$1 AND status='active' AND expires_at<=now()`,
    [userId]
  );
  const best = await client.query<{ id: string; tier: "premium" | "master"; expires_at: string }>(
    `SELECT id,tier,expires_at::text FROM product_entitlement_sources
      WHERE user_id=$1 AND status='active' AND expires_at>now()
      ORDER BY CASE tier WHEN 'master' THEN 2 ELSE 1 END DESC,expires_at DESC
      LIMIT 1`,
    [userId]
  );
  const source = best.rows[0] || null;
  const user = await client.query<{ tier: string; sub_expires_at: string | null; hour_balance: number }>(
    `UPDATE users SET
       tier=COALESCE($2,'free'),
       sub_expires_at=$3::timestamptz,
       entitlement_source_id=$4::uuid
     WHERE id=$1
     RETURNING tier,sub_expires_at::text,hour_balance`,
    [userId, source?.tier || null, source?.expires_at || null, source?.id || null]
  );
  return user.rows[0];
}

export async function applyVerifiedStorePurchase(
  userId: string,
  verified: VerifiedStorePurchase
): Promise<ApplyStoreResult> {
  if (!userId || verified.accountBinding !== userId) throw new Error("store_account_binding_mismatch");
  const pkg = mobileStorePackage(verified.productId);
  if (!pkg) throw new Error("unknown_store_product");
  if (!verified.eventRef || !verified.originalRef) throw new Error("store_reference_missing");
  const expiresMs = verified.expiresAt ? new Date(verified.expiresAt).getTime() : NaN;
  if (pkg.kind === "subscription" && !Number.isFinite(expiresMs)) throw new Error("subscription_expiry_missing");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`store:${verified.platform}:${verified.originalRef}`]);
    const duplicate = await client.query<{ user_id: string }>(
      `SELECT user_id::text FROM mobile_store_events WHERE platform=$1 AND event_ref=$2`,
      [verified.platform, verified.eventRef]
    );
    if (duplicate.rows[0]) {
      if (duplicate.rows[0].user_id !== userId) throw new Error("store_event_bound_to_other_account");
      const current = await client.query<{ tier: string; sub_expires_at: string | null; hour_balance: number }>(
        `SELECT tier,sub_expires_at::text,hour_balance FROM users WHERE id=$1`, [userId]
      );
      await client.query("ROLLBACK");
      const row = current.rows[0];
      return {
        status: "already",
        plan: row?.tier === "master" ? "master" : row?.tier === "premium" ? "premium" : "free",
        tier: row?.tier || "free",
        sub_expires_at: row?.sub_expires_at || null,
        hour_balance: Number(row?.hour_balance) || 0,
      };
    }

    let entitlementId: string | null = null;
    let yamDelta = 0;
    if (pkg.kind === "subscription" && pkg.tier && verified.expiresAt) {
      const existing = await client.query<{ id: string; user_id: string; source_id: string; initial_yam_granted: boolean }>(
        `SELECT id,user_id::text,source_id,initial_yam_granted FROM mobile_store_entitlements
          WHERE platform=$1 AND original_ref=$2 FOR UPDATE`,
        [verified.platform, verified.originalRef]
      );
      if (existing.rows[0] && existing.rows[0].user_id !== userId) throw new Error("store_subscription_bound_to_other_account");
      const sourceStatus = isAccessState(verified.state) && expiresMs > Date.now() ? "active" : verified.state === "pending" ? "pending" : verified.state === "revoked" ? "revoked" : "expired";
      const sourceRef = `${verified.platform}:${verified.originalRef}`;
      const source = await client.query<{ id: string }>(
        `INSERT INTO product_entitlement_sources
           (user_id,source_kind,source_ref,tier,status,starts_at,expires_at,metadata)
         VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),$7::timestamptz,$8::jsonb)
         ON CONFLICT(source_kind,source_ref) DO UPDATE SET
           tier=EXCLUDED.tier,status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,
           metadata=EXCLUDED.metadata,updated_at=now()
         WHERE product_entitlement_sources.user_id=EXCLUDED.user_id
         RETURNING id`,
        [userId, verified.platform, sourceRef, pkg.tier, sourceStatus, verified.purchasedAt, verified.expiresAt, JSON.stringify({ product_id: verified.productId, environment: verified.environment })]
      );
      if (!source.rows[0]) throw new Error("store_source_bound_to_other_account");
      const entitlement = await client.query<{ id: string; initial_yam_granted: boolean }>(
        `INSERT INTO mobile_store_entitlements
           (source_id,user_id,platform,original_ref,product_id,package_code,state,environment,
            purchase_token,latest_event_ref,auto_renewing,purchased_at,expires_at,last_verified_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,now())
         ON CONFLICT(platform,original_ref) DO UPDATE SET
           product_id=EXCLUDED.product_id,package_code=EXCLUDED.package_code,state=EXCLUDED.state,
           environment=EXCLUDED.environment,purchase_token=COALESCE(EXCLUDED.purchase_token,mobile_store_entitlements.purchase_token),
           latest_event_ref=EXCLUDED.latest_event_ref,auto_renewing=EXCLUDED.auto_renewing,
           expires_at=EXCLUDED.expires_at,last_verified_at=now(),updated_at=now()
         WHERE mobile_store_entitlements.user_id=EXCLUDED.user_id
         RETURNING id,initial_yam_granted`,
        [source.rows[0].id, userId, verified.platform, verified.originalRef, verified.productId, pkg.code, verified.state, verified.environment, verified.purchaseToken || null, verified.eventRef, verified.autoRenewing ?? null, verified.purchasedAt, verified.expiresAt]
      );
      if (!entitlement.rows[0]) throw new Error("store_subscription_bound_to_other_account");
      entitlementId = entitlement.rows[0].id;
      if (!entitlement.rows[0].initial_yam_granted && isAccessState(verified.state) && expiresMs > Date.now()) {
        const balance = await client.query<{ hour_balance: number }>(
          `UPDATE users SET hour_balance=COALESCE(hour_balance,0)+$2 WHERE id=$1 RETURNING hour_balance`,
          [userId, pkg.yam]
        );
        await client.query(
          `INSERT INTO hour_transactions(user_id,delta,reason,balance_after,ref_payment_id,note)
           VALUES($1,$2,'purchase_subscription',$3,$4,$5)`,
          [userId, pkg.yam, Number(balance.rows[0]?.hour_balance) || 0, `store_initial:${verified.platform}:${verified.originalRef}`, `${pkg.code} · native store`]
        );
        await client.query(`UPDATE mobile_store_entitlements SET initial_yam_granted=true WHERE id=$1`, [entitlementId]);
        yamDelta = pkg.yam;
      } else if (verified.state === "revoked" && entitlement.rows[0].initial_yam_granted) {
        const net = await client.query<{ n: number }>(
          `SELECT COALESCE(sum(yam_delta),0)::int AS n FROM mobile_store_events
            WHERE platform=$1 AND original_ref=$2`,
          [verified.platform, verified.originalRef]
        );
        if (Number(net.rows[0]?.n) > 0) {
          const balance = await client.query<{ before: number; after: number }>(
            `WITH current AS (
               SELECT id,COALESCE(hour_balance,0)::int AS before FROM users WHERE id=$1 FOR UPDATE
             ), updated AS (
               UPDATE users u SET hour_balance=GREATEST(0,current.before-$2)
                 FROM current WHERE u.id=current.id
                 RETURNING current.before,u.hour_balance::int AS after
             ) SELECT before,after FROM updated`,
            [userId, pkg.yam]
          );
          yamDelta = -(Number(balance.rows[0]?.before || 0) - Number(balance.rows[0]?.after || 0));
          await client.query(
            `INSERT INTO hour_transactions(user_id,delta,reason,balance_after,ref_payment_id,note)
             VALUES($1,$2,'refund_subscription',$3,$4,$5)`,
            [userId, yamDelta, Number(balance.rows[0]?.after) || 0, `store_adjust:${verified.platform}:${verified.eventRef}`, `${pkg.code} · native store revoke`]
          );
        }
      }
    }

    if (pkg.kind === "topup") {
      if (isAccessState(verified.state)) {
        const previous = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM mobile_store_events
            WHERE platform=$1 AND original_ref=$2`,
          [verified.platform, verified.originalRef]
        );
        if (Number(previous.rows[0]?.n) === 0) {
          const balance = await client.query<{ hour_balance: number }>(
            `UPDATE users SET hour_balance=COALESCE(hour_balance,0)+$2 WHERE id=$1 RETURNING hour_balance`,
            [userId, pkg.yam]
          );
          yamDelta = pkg.yam;
          await client.query(
            `INSERT INTO hour_transactions(user_id,delta,reason,balance_after,ref_payment_id,note)
             VALUES($1,$2,'purchase_topup',$3,$4,$5)`,
            [userId, yamDelta, Number(balance.rows[0]?.hour_balance) || 0, `store:${verified.platform}:${verified.eventRef}`, `${pkg.code} · native store`]
          );
        }
      } else if (verified.state === "revoked") {
        const net = await client.query<{ n: number }>(
          `SELECT COALESCE(sum(yam_delta),0)::int AS n FROM mobile_store_events
            WHERE platform=$1 AND original_ref=$2`,
          [verified.platform, verified.originalRef]
        );
        if (Number(net.rows[0]?.n) > 0) {
          const balance = await client.query<{ before: number; after: number }>(
            `WITH current AS (
               SELECT id,COALESCE(hour_balance,0)::int AS before FROM users WHERE id=$1 FOR UPDATE
             ), updated AS (
               UPDATE users u SET hour_balance=GREATEST(0,current.before-$2)
                 FROM current WHERE u.id=current.id
                 RETURNING current.before,u.hour_balance::int AS after
             ) SELECT before,after FROM updated`,
            [userId, Math.min(pkg.yam, Number(net.rows[0].n))]
          );
          yamDelta = -(Number(balance.rows[0]?.before || 0) - Number(balance.rows[0]?.after || 0));
          await client.query(
            `INSERT INTO hour_transactions(user_id,delta,reason,balance_after,ref_payment_id,note)
             VALUES($1,$2,'refund_topup',$3,$4,$5)`,
            [userId, yamDelta, Number(balance.rows[0]?.after) || 0, `store_adjust:${verified.platform}:${verified.eventRef}`, `${pkg.code} · native store refund`]
          );
        }
      }
    }

    await client.query(
      `INSERT INTO mobile_store_events
       (user_id,entitlement_id,platform,event_ref,original_ref,product_id,package_code,event_kind,yam_delta,verified_summary)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [userId, entitlementId, verified.platform, verified.eventRef, verified.originalRef, verified.productId, pkg.code, verified.eventKind, yamDelta, JSON.stringify(verified.summary || {})]
    );

    const user = await recomputePaidEntitlement(client, userId);
    await client.query("COMMIT");
    return {
      status: "applied",
      plan: user?.tier === "master" ? "master" : user?.tier === "premium" ? "premium" : "free",
      tier: user?.tier || "free",
      sub_expires_at: user?.sub_expires_at || null,
      hour_balance: Number(user?.hour_balance) || 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}
