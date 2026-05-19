import { q1 } from "@/lib/db";
import { getSession } from "@/lib/auth";

export type AdminSession = {
  userId: string;
  email: string;
  orgId: string | null;
  role: string;
};

const ENV_ALLOWLIST = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin(): Promise<AdminSession> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });

  const email = (s.email || "").toLowerCase();
  if (ENV_ALLOWLIST.includes(email)) {
    return { ...s, orgId: s.orgId ?? null, role: "env_admin" };
  }
  if (s.orgId) {
    const row = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [s.orgId, s.userId]
    );
    if (row && ["owner", "admin"].includes(row.role)) {
      return { ...s, orgId: s.orgId ?? null, role: row.role };
    }
  }
  throw new Response("Forbidden", { status: 403 });
}
