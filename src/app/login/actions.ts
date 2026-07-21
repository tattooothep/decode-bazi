"use server";

import { redirect } from "next/navigation";
import { q1 } from "@/lib/db";
import { verifyPassword, signSession, readSessionVersion, setAuthCookie } from "@/lib/auth";

export async function loginAction(prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "กรอก email + password" };
  const user = await q1<{
    id: string; email: string; password_hash: string; current_org_id: string;
  }>(
    "SELECT id, email, password_hash, current_org_id FROM users WHERE email=$1",
    [email]
  );
  if (!user || !user.password_hash) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  const token = await signSession({
    userId: user.id, email: user.email, orgId: user.current_org_id,
  });
  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1", [user.id]);
  redirect("/dashboard");
}
