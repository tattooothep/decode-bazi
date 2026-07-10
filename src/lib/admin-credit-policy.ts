/**
 * Role-based credit adjust caps (P1).
 */
import { q1 } from "@/lib/db";
import type { AdminSession } from "@/lib/admin-guard";
import { SUPPORT_CREDIT_DAILY_CAP, SUPPORT_CREDIT_MAX_ABS } from "@/lib/admin-permissions";

export type CreditCap = { max_abs: number; daily: number };

const DEFAULT_CAPS: Record<string, CreditCap> = {
  support: { max_abs: SUPPORT_CREDIT_MAX_ABS, daily: SUPPORT_CREDIT_DAILY_CAP },
  ops: { max_abs: 5000, daily: 20000 },
  finance: { max_abs: 0, daily: 0 },
  content: { max_abs: 0, daily: 0 },
  research: { max_abs: 0, daily: 0 },
  affiliate_ops: { max_abs: 0, daily: 0 },
  readonly: { max_abs: 0, daily: 0 },
};

export async function loadCreditPolicyMeta(): Promise<Record<string, CreditCap>> {
  const row = await q1<{ meta: Record<string, unknown> | null; max_abs_delta: number | null; daily_cap: number | null }>(
    `SELECT meta, max_abs_delta, daily_cap FROM admin_action_policies WHERE perm_key='admin.users.credit.adjust'`
  ).catch(() => null);
  const caps = { ...DEFAULT_CAPS };
  if (row?.meta && typeof row.meta === "object") {
    const rc = (row.meta as { role_caps?: Record<string, CreditCap> }).role_caps;
    if (rc) {
      for (const [k, v] of Object.entries(rc)) {
        if (v && typeof v === "object") {
          caps[k] = {
            max_abs: Math.max(0, Number(v.max_abs) || 0),
            daily: Math.max(0, Number(v.daily) || 0),
          };
        }
      }
    }
  }
  // fallback global
  if (row?.max_abs_delta != null) {
    caps.support = caps.support || { max_abs: row.max_abs_delta, daily: row.daily_cap || SUPPORT_CREDIT_DAILY_CAP };
  }
  return caps;
}

export function pickRoleCap(admin: AdminSession, caps: Record<string, CreditCap>): CreditCap {
  if (admin.isSuper || admin.source === "env") {
    return { max_abs: 1_000_000, daily: 10_000_000 };
  }
  // most restrictive among roles if multiple
  let best: CreditCap | null = null;
  for (const r of admin.roles) {
    const c = caps[r];
    if (!c) continue;
    if (!best || c.max_abs < best.max_abs) best = c;
  }
  return best || { max_abs: SUPPORT_CREDIT_MAX_ABS, daily: SUPPORT_CREDIT_DAILY_CAP };
}

export async function checkCreditAdjustAllowed(
  admin: AdminSession,
  delta: number
): Promise<{ ok: true; cap: CreditCap } | { ok: false; error: string; cap: CreditCap }> {
  const caps = await loadCreditPolicyMeta();
  const cap = pickRoleCap(admin, caps);
  const abs = Math.abs(Math.trunc(delta));
  if (cap.max_abs <= 0) {
    return { ok: false, error: "role_cannot_adjust_credit", cap };
  }
  if (abs > cap.max_abs) {
    return { ok: false, error: "exceeds_max_abs", cap };
  }
  // daily sum of |delta| for this admin today
  if (cap.daily > 0) {
    const used = await q1<{ n: number }>(
      `SELECT COALESCE(SUM(ABS((payload->>'delta')::int)),0)::int AS n
         FROM audit_logs
        WHERE user_id=$1
          AND action='admin.users.credit.adjust'
          AND created_at >= date_trunc('day', now())
          AND outcome='success'`,
      [admin.userId]
    ).catch(() => ({ n: 0 }));
    if ((used?.n || 0) + abs > cap.daily) {
      return { ok: false, error: "exceeds_daily_cap", cap };
    }
  }
  return { ok: true, cap };
}
