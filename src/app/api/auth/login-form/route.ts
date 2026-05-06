import { q1 } from "@/lib/db";
import { verifyPassword, signSession, setAuthCookie } from "@/lib/auth";

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return redirect303("/login?err=" + encodeURIComponent("กรอก email + password"));
  const user = await q1<{
    id: string; email: string; password_hash: string; current_org_id: string;
  }>("SELECT id, email, password_hash, current_org_id FROM users WHERE email=$1", [email]);
  if (!user || !user.password_hash) return redirect303("/login?err=" + encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง"));
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return redirect303("/login?err=" + encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง"));
  const token = await signSession({ userId: user.id, email: user.email, orgId: user.current_org_id });
  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1", [user.id]);
  return redirect303("/dashboard");
}
