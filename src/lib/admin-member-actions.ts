/**
 * Domain mutations for admin members — called by API routes + tests.
 */
import { q1 } from "@/lib/db";
import { writeAdminAudit } from "@/lib/admin-audit";
import type { AdminSession } from "@/lib/admin-guard";
import { evaluatePermission } from "@/lib/admin-guard";
import { normalizeProductTier } from "@/lib/admin-permissions";
import { checkCreditAdjustAllowed } from "@/lib/admin-credit-policy";

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

  const exist = await q1<{ tier: string }>(`SELECT tier FROM users WHERE id=$1`, [opts.userId]);
  if (!exist) return { ok: false, error: "not_found", status: 404 };
  const before = exist.tier;

  await q1(`UPDATE users SET tier=$2 WHERE id=$1`, [opts.userId, tier]);
  await writeAdminAudit({
    actor: opts.admin,
    action: "admin.users.tier.set",
    targetType: "user",
    targetId: opts.userId,
    payload: { before, after: tier },
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
  return { ok: true, tier, before };
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
