/**
 * POST /api/auth/signup-form
 * HTML form fallback (works without JS)
 * Returns 303 redirect to /input (success) or /signup?err=... (error)
 */
import { q1 } from "@/lib/db";
import { hashPassword, signSession, setAuthCookie } from "@/lib/auth";
import crypto from "node:crypto";

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const name = String(form.get("name") || "").trim();

  if (!email || !password) return redirect303("/signup?err=" + encodeURIComponent("กรอก email + password"));
  if (password.length < 6) return redirect303("/signup?err=" + encodeURIComponent("รหัสผ่านต้อง ≥ 6 ตัวอักษร"));

  const existing = await q1<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  if (existing) return redirect303("/signup?err=" + encodeURIComponent("อีเมลนี้สมัครไปแล้ว"));

  const hash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const displayName = name || email.split("@")[0];

  await q1(
    `INSERT INTO users (id, email, password_hash, name, locale, timezone, theme, email_verified, is_active, created_at)
     VALUES ($1,$2,$3,$4,'th','Asia/Bangkok','dark',false,true,now())`,
    [userId, email, hash, displayName]
  );
  await q1(
    `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
     VALUES ($1,$2,$3,$4,now())`,
    [orgId, userId, `${displayName}'s Workspace`, orgId.slice(0, 8)]
  ).catch(async () => {
    await q1(`INSERT INTO organizations (id, name) VALUES ($1,$2)`, [orgId, displayName]);
  });
  await q1(
    `INSERT INTO org_members (org_id, user_id, role, created_at)
     VALUES ($1,$2,'owner',now())`,
    [orgId, userId]
  ).catch(() => null);
  await q1(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);

  const token = await signSession({ userId, email, orgId });
  await setAuthCookie(token);

  return redirect303("/input");
}
