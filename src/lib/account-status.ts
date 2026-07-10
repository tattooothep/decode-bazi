import { q1 } from "@/lib/db";

export type AccountGate = {
  ok: true;
  id: string;
  email: string;
  is_active: boolean;
} | {
  ok: false;
  reason: "not_found" | "suspended" | "deleted";
};

/**
 * Enforce product account usability (suspend / soft-delete).
 * Used by login paths and session re-validation.
 */
export async function checkAccountUsable(userId: string): Promise<AccountGate> {
  const row = await q1<{
    id: string;
    email: string;
    is_active: boolean | null;
    deleted_at: string | null;
  }>(
    `SELECT id, email, is_active, deleted_at FROM users WHERE id=$1`,
    [userId]
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.deleted_at) return { ok: false, reason: "deleted" };
  if (row.is_active === false) return { ok: false, reason: "suspended" };
  return { ok: true, id: row.id, email: row.email, is_active: true };
}

export async function checkAccountUsableByEmail(email: string): Promise<AccountGate & { password_hash?: string; current_org_id?: string | null }> {
  const row = await q1<{
    id: string;
    email: string;
    password_hash: string | null;
    current_org_id: string | null;
    is_active: boolean | null;
    deleted_at: string | null;
  }>(
    `SELECT id, email, password_hash, current_org_id, is_active, deleted_at
       FROM users WHERE lower(email)=lower($1)`,
    [email]
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.deleted_at) return { ok: false, reason: "deleted" };
  if (row.is_active === false) return { ok: false, reason: "suspended" };
  return {
    ok: true,
    id: row.id,
    email: row.email,
    is_active: true,
    password_hash: row.password_hash || undefined,
    current_org_id: row.current_org_id,
  };
}

export function accountGateMessage(reason: "not_found" | "suspended" | "deleted"): string {
  if (reason === "suspended") return "บัญชีนี้ถูกระงับ · ติดต่อฝ่ายสนับสนุน";
  if (reason === "deleted") return "บัญชีนี้ถูกลบแล้ว";
  return "ไม่พบบัญชี";
}
