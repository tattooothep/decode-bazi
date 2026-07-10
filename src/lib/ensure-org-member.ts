/**
 * Ensure org_members row exists (owner/member).
 * Live schema requires org_members.id NOT NULL without default — always set id.
 * Safe to call multiple times (unique org_id+user_id).
 */
import { q1 } from "@/lib/db";

export async function ensureOrgMember(
  orgId: string,
  userId: string,
  role: string = "owner"
): Promise<void> {
  if (!orgId || !userId) return;
  await q1(
    `INSERT INTO org_members (id, org_id, user_id, role, status, joined_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'active', now(), now())
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    [orgId, userId, role]
  );
}
