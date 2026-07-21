import { q1 } from "@/lib/db";
import { verifyPassword, signSession, setAuthCookie, readSessionVersion } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { userHasProfile } from "@/lib/profile-status";

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return redirect303("/signup?tab=login&err=" + encodeURIComponent("กรอก email + password"));
  /* 1 มิ.ย. · กัน brute-force · 5 ครั้ง/นาที ต่อ (IP + อีเมล) */
  const rl = rateLimit(`loginform:${clientIp(req)}:${email}`, 5, 60_000);
  if (!rl.ok) return redirect303("/signup?tab=login&err=" + encodeURIComponent("ลองบ่อยเกินไป · รอสักครู่"));
  const user = await q1<{
    id: string; email: string; password_hash: string; current_org_id: string;
    is_active: boolean | null; deleted_at: string | null;
  }>("SELECT id, email, password_hash, current_org_id, is_active, deleted_at FROM users WHERE email=$1", [email]);
  if (!user || !user.password_hash) return redirect303("/signup?tab=login&err=" + encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง"));
  if (user.deleted_at) return redirect303("/signup?tab=login&err=" + encodeURIComponent("บัญชีนี้ถูกลบแล้ว"));
  if (user.is_active === false) return redirect303("/signup?tab=login&err=" + encodeURIComponent("บัญชีนี้ถูกระงับ · ติดต่อฝ่ายสนับสนุน"));
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return redirect303("/signup?tab=login&err=" + encodeURIComponent("อีเมลหรือรหัสผ่านไม่ถูกต้อง"));
  const sv = await readSessionVersion(user.id);
  const token = await signSession({ userId: user.id, email: user.email, orgId: user.current_org_id, sv });
  await setAuthCookie(token);
  await q1("UPDATE users SET last_active_at=now() WHERE id=$1", [user.id]);
  const hasProfile = await userHasProfile(user.id);
  return redirect303(hasProfile ? "/today" : "/input");
}
