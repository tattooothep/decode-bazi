import { q, q1 } from "@/lib/db";
import {
  ADMIN_PERM_KEYS,
  ROLE_SEEDS,
  hasPermission,
  type AdminPermKey,
} from "@/lib/admin-permissions";
import { checkAccountUsable } from "@/lib/account-status";
// NOTE: do not static-import @/lib/auth here — pulls next/headers and breaks node tests.
// requireAdmin/requirePermission dynamic-import getSession.

export type AdminSession = {
  userId: string;
  email: string;
  orgId: string | null;
  /** legacy field — primary role key or env_admin */
  role: string;
  roles: string[];
  perms: Set<string>;
  source: "env" | "rbac" | "legacy_org";
  isSuper: boolean;
};

/** Re-read every call so break-glass can be updated without process restart (and tests can set env). */
function envAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** When "1" (default), org owner/admin still gets full admin during cutover. */
function legacyOrgAdminEnabled(): boolean {
  const v = (process.env.LEGACY_ORG_ADMIN ?? "1").trim();
  return v !== "0" && v.toLowerCase() !== "false" && v !== "off";
}

let _seedPromise: Promise<void> | null = null;

/** Idempotent seed of permissions + system roles (safe to call often). */
export async function ensureAdminRbacSeeded(): Promise<void> {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    try {
      for (const key of ADMIN_PERM_KEYS) {
        const module = key.split(".").slice(0, 2).join(".");
        await q1(
          `INSERT INTO admin_permissions(key, module, description)
           VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING`,
          [key, module, key]
        );
      }
      for (const role of ROLE_SEEDS) {
        const row = await q1<{ id: string }>(
          `INSERT INTO admin_roles(key, name_th, name_en, description, is_system, is_super, sort)
           VALUES ($1,$2,$3,$4,true,$5,$6)
           ON CONFLICT (key) DO UPDATE SET
             name_th=EXCLUDED.name_th,
             name_en=EXCLUDED.name_en,
             description=EXCLUDED.description,
             is_super=EXCLUDED.is_super,
             sort=EXCLUDED.sort,
             updated_at=now()
           RETURNING id`,
          [role.key, role.name_th, role.name_en, role.description, role.is_super, role.sort]
        );
        if (!row?.id) continue;
        if (role.perms === "*") continue;
        for (const pk of role.perms) {
          await q1(
            `INSERT INTO admin_role_permissions(role_id, perm_key)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [row.id, pk]
          );
        }
      }
      // Support credit policy defaults
      await q1(
        `INSERT INTO admin_action_policies(perm_key, max_abs_delta, daily_cap, require_note)
         VALUES ('admin.users.credit.adjust', 500, 2000, true)
         ON CONFLICT (perm_key) DO NOTHING`
      ).catch(() => null);
    } catch (e) {
      // Tables may not exist yet before migration — log and continue dual-gate
      console.warn("[admin-rbac] seed skipped", e instanceof Error ? e.message : String(e));
      _seedPromise = null;
    }
  })();
  return _seedPromise;
}

/**
 * Resolve platform admin access for a known identity (no cookies).
 * Used by requireAdmin after getSession, and by tests.
 */
export async function resolveAdminSessionForUser(
  userId: string,
  email: string,
  orgId: string | null = null
): Promise<AdminSession | null> {
  const usable = await checkAccountUsable(userId);
  if (!usable.ok) return null;

  const em = (email || "").toLowerCase();

  if (envAllowlist().includes(em)) {
    return {
      userId,
      email,
      orgId,
      role: "env_admin",
      roles: ["superadmin"],
      perms: new Set(["*"]),
      source: "env",
      isSuper: true,
    };
  }

  const rbac = await loadRbacSession(userId, email, orgId);
  if (rbac) return rbac;

  if (legacyOrgAdminEnabled() && orgId) {
    const row = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [orgId, userId]
    );
    if (row && ["owner", "admin"].includes(row.role)) {
      return {
        userId,
        email,
        orgId,
        role: row.role,
        roles: [row.role],
        perms: new Set(["*"]),
        source: "legacy_org",
        isSuper: true,
      };
    }
  }

  return null;
}

/** True if session may perform key (super / wildcard / exact / prefix). */
export function sessionHasPermission(admin: AdminSession, key: AdminPermKey): boolean {
  return hasPermission(admin.perms, key, admin.isSuper);
}

/**
 * Gate like requirePermission but without throwing Response — for tests & callers.
 */
export function evaluatePermission(
  admin: AdminSession | null,
  key: AdminPermKey
): { ok: true; admin: AdminSession } | { ok: false; status: 401 | 403; missing?: string } {
  if (!admin) return { ok: false, status: 401 };
  if (sessionHasPermission(admin, key)) return { ok: true, admin };
  if ((process.env.ADMIN_RBAC_ENFORCE || "1") === "0") {
    return { ok: true, admin };
  }
  return { ok: false, status: 403, missing: key };
}

async function loadRbacSession(userId: string, email: string, orgId: string | null): Promise<AdminSession | null> {
  await ensureAdminRbacSeeded();
  try {
    const roles = await q<{ key: string; is_super: boolean }>(
      `SELECT r.key, r.is_super
         FROM admin_user_roles ur
         JOIN admin_roles r ON r.id = ur.role_id
        WHERE ur.user_id=$1 AND ur.revoked_at IS NULL
          AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
      [userId]
    );
    if (!roles.length) return null;
    const isSuper = roles.some((r) => r.is_super);
    const roleKeys = roles.map((r) => r.key);
    const perms = new Set<string>();
    if (!isSuper) {
      const rows = await q<{ perm_key: string }>(
        `SELECT DISTINCT rp.perm_key
           FROM admin_user_roles ur
           JOIN admin_role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id=$1 AND ur.revoked_at IS NULL
            AND (ur.expires_at IS NULL OR ur.expires_at > now())`,
        [userId]
      );
      for (const r of rows) perms.add(r.perm_key);
    }
    return {
      userId,
      email,
      orgId,
      role: isSuper ? "superadmin" : roleKeys[0] || "admin",
      roles: roleKeys,
      perms,
      source: "rbac",
      isSuper,
    };
  } catch {
    return null;
  }
}

/**
 * Any platform admin (env break-glass, RBAC role, or legacy org admin).
 */
export async function requireAdmin(): Promise<AdminSession> {
  const { getSession } = await import("@/lib/auth");
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  const admin = await resolveAdminSessionForUser(s.userId, s.email, s.orgId ?? null);
  if (!admin) throw new Response("Forbidden", { status: 403 });
  return admin;
}

/**
 * Require a specific permission key (or break-glass / super).
 */
export async function requirePermission(key: AdminPermKey): Promise<AdminSession> {
  const admin = await requireAdmin();
  const ev = evaluatePermission(admin, key);
  if (ev.ok) return ev.admin;
  throw new Response(JSON.stringify({ ok: false, error: "forbidden", missing: key }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function adminHas(admin: AdminSession, key: AdminPermKey): boolean {
  return hasPermission(admin.perms, key, admin.isSuper);
}

export function envAdminEmails(): string[] {
  return envAllowlist();
}
