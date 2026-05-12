// GET /api/auth/verify-email/[token] — กดลิงก์จากอีเมล
import { q1 } from "@/lib/db";
import { consumeToken } from "@/lib/auth-tokens";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await consumeToken(token, "email_verify");
  if (!r) {
    return redirect(`/verify-email/result?ok=0&err=${encodeURIComponent("ลิงก์ไม่ถูกต้องหรือหมดอายุ")}`);
  }
  await q1(`UPDATE users SET email_verified=true WHERE id=$1`, [r.userId]);
  return redirect(`/verify-email/result?ok=1`);
}
