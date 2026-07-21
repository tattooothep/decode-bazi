/**
 * Domain mutations for admin members — called by API routes + tests.
 */
import { pool, q1 } from "@/lib/db";
import { writeAdminAudit } from "@/lib/admin-audit";
import type { AdminSession } from "@/lib/admin-guard";
import { evaluatePermission } from "@/lib/admin-guard";
import { normalizeProductTier } from "@/lib/admin-permissions";
import { checkCreditAdjustAllowed } from "@/lib/admin-credit-policy";
import { recomputePaidEntitlement } from "@/lib/mobile-store-ledger";

export type ActionResult =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string; status?: number; [k: string]: unknown };

export async function adminAdjustCredit(opts: {
  admin: AdminSession;
  userId: string;
  delta: number;
  note: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ActionResult> {
  const gate = evaluatePermission(opts.admin, "admin.users.credit.adjust");
  if (!gate.ok) return { ok: false, error: "forbidden", status: 403, missing: "admin.users.credit.adjust" };

  const delta = Math.trunc(opts.delta);
  if (!delta) return { ok: false, error: "delta required", status: 400 };
  const note = String(opts.note || "").slice(0, 300);
  if (!note) return { ok: false, error: "note required", status: 400 };

  const capCheck = await checkCreditAdjustAllowed(opts.admin, delta);
  if (!capCheck.ok) {
    return {
      ok: false,
      error: capCheck.error,
      status: 400,
      cap: capCheck.cap,
    };
  }

  const exist = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [opts.userId]);
  if (!exist) return { ok: false, error: "not_found", status: 404 };
  const before = Number(exist.hour_balance);

  const row = await q1<{ balance_after: number }>(
    `WITH upd AS (
       UPDATE users SET hour_balance = GREATEST(0, hour_balance + $2) WHERE id=$1 RETURNING hour_balance
     )
     INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature, note)
     SELECT $1, $2, 'admin_adjust', hour_balance, 'admin:'||$4, $3 FROM upd
     RETURNING balance_after`,
    [opts.userId, delta, note, opts.admin.email]
  );

  await writeAdminAudit({
    actor: opts.admin,
    action: "admin.users.credit.adjust",
    targetType: "user",
    targetId: opts.userId,
    payload: { before, after: row?.balance_after, delta, note },
    reason: note,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  return { ok: true, balance_after: row?.balance_after, before };
}

export async function adminSetTier(opts: {
  admin: AdminSession;
  userId: string;
  tier: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ActionResult> {
  const gate = evaluatePermission(opts.admin, "admin.users.tier.set");
  if (!gate.ok) return { ok: false, error: "forbidden", status: 403, missing: "admin.users.tier.set" };

  const tier = normalizeProductTier(opts.tier);
  if (!tier) {
    return {
      ok: false,
      error: "bad tier",
      status: 400,
      allowed: ["free", "premium", "master"],
      rejected: opts.tier,
    };
  }

  const client = await pool.connect();
  let before = "free";
  let appliedTier: string = tier;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ tier: string; sub_expires_at: string | null }>(
      `SELECT tier,sub_expires_at::text FROM users WHERE id=$1 FOR UPDATE`,
      [opts.userId]
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, error: "not_found", status: 404 };
    }
    before = existing.rows[0].tier;
    await client.query(`UPDATE users SET tier=$2 WHERE id=$1`, [opts.userId, tier]);
    const sourceRef = `admin:manual:${opts.userId}`;
    if (tier === "premium" || tier === "master") {
      const expiresAt = existing.rows[0].sub_expires_at;
      const active = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
      await client.query(
        `INSERT INTO product_entitlement_sources
           (user_id,source_kind,source_ref,tier,status,starts_at,expires_at,metadata)
         VALUES($1,'admin',$2,$3,$4,now(),COALESCE($5::timestamptz,now()),$6::jsonb)
         ON CONFLICT(source_kind,source_ref) DO UPDATE SET
           tier=EXCLUDED.tier,status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,
           metadata=EXCLUDED.metadata,updated_at=now()`,
        [opts.userId, sourceRef, tier, active ? "active" : "pending", expiresAt, JSON.stringify({ actor: opts.admin.email })]
      );
      if (active) {
        const selected = await recomputePaidEntitlement(client, opts.userId);
        appliedTier = selected?.tier || tier;
      }
    } else {
      await client.query(
        `UPDATE product_entitlement_sources SET status='revoked',updated_at=now()
          WHERE user_id=$1 AND source_kind='admin' AND source_ref=$2`,
        [opts.userId, sourceRef]
      );
      const selected = await recomputePaidEntitlement(client, opts.userId);
      appliedTier = selected?.tier || "free";
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
  await writeAdminAudit({
    actor: opts.admin,
    action: "admin.users.tier.set",
    targetType: "user",
    targetId: opts.userId,
    payload: { before, after: appliedTier, requested: tier },
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
  return { ok: true, tier: appliedTier, before };
}

export async function adminSetActive(opts: {
  admin: AdminSession;
  userId: string;
  active: boolean;
  note?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ActionResult> {
  const gate = evaluatePermission(opts.admin, "admin.users.suspend");
  if (!gate.ok) return { ok: false, error: "forbidden", status: 403, missing: "admin.users.suspend" };

  const exist = await q1<{ is_active: boolean }>(`SELECT is_active FROM users WHERE id=$1`, [opts.userId]);
  if (!exist) return { ok: false, error: "not_found", status: 404 };
  const before = exist.is_active;

  await q1(`UPDATE users SET is_active=$2 WHERE id=$1`, [opts.userId, opts.active]);
  await writeAdminAudit({
    actor: opts.admin,
    action: opts.active ? "admin.users.restore" : "admin.users.suspend",
    targetType: "user",
    targetId: opts.userId,
    payload: { before, after: opts.active },
    reason: opts.note || null,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
  return { ok: true, is_active: opts.active, before };
}
