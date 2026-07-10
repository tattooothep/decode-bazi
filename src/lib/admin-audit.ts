import { q1 } from "@/lib/db";
import type { AdminSession } from "@/lib/admin-guard";

export type AuditInput = {
  actor: Pick<AdminSession, "userId" | "email" | "roles" | "source">;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
  outcome?: "success" | "denied" | "error";
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/**
 * Append-only platform audit row.
 * Never throws to callers for logging failures — logs warn instead.
 */
export async function writeAdminAudit(input: AuditInput): Promise<void> {
  try {
    const roles = (input.actor.roles || []).join(",");
    await q1(
      `INSERT INTO audit_logs
         (id, user_id, action, target_type, target_id, payload, ip_address, user_agent,
          actor_email, actor_role, request_id, outcome, reason, created_at)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12, now())`,
      [
        input.actor.userId,
        input.action.slice(0, 120),
        input.targetType || null,
        input.targetId || null,
        JSON.stringify(input.payload || {}),
        input.ip || null,
        input.userAgent || null,
        input.actor.email,
        `${input.actor.source}:${roles || "none"}`.slice(0, 120),
        input.requestId || null,
        input.outcome || "success",
        input.reason || null,
      ]
    );
  } catch (e) {
    console.warn("[admin-audit] write failed", e instanceof Error ? e.message : String(e));
  }
}
