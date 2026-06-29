import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export const metadata = { title: "หลังบ้าน · Admin" };

async function isAdmin(): Promise<{ ok: boolean; email: string }> {
  const s = await getSession();
  if (!s) return { ok: false, email: "" };
  const allow = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = (s.email || "").toLowerCase();
  if (allow.includes(email)) return { ok: true, email };
  if (s.orgId) {
    const m = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`, [s.orgId, s.userId]);
    if (m && ["owner", "admin"].includes(m.role)) return { ok: true, email };
  }
  return { ok: false, email };
}

const MODULES = [
  { href: "/admin/members", icon: "👥", title: "สมาชิก", desc: "ค้นหา · เติม/หักยาม · ระงับ · เปลี่ยน tier · ต่ออายุ" },
  { href: "/admin/packages", icon: "📦", title: "แพ็คเกจ", desc: "แพ็คเติมยาม/สมาชิก · คูปอง/โปรโมชั่น" },
  { href: "/admin/finance", icon: "💰", title: "การเงิน", desc: "รายได้ · ยามที่ขาย/ใช้ · ต้นทุน AI · ธุรกรรม · ออเดอร์" },
  { href: "/admin/settings", icon: "⚙️", title: "ตั้งค่าเว็บ", desc: "อัตราเครดิต · feature flag · ประกาศ · maintenance" },
];

const CONTENT = [
  { href: "/admin/library", title: "หอสมุดคัมภีร์" },
  { href: "/admin/engine", title: "Engine 360" },
  { href: "/admin/formulas", title: "สูตร" },
  { href: "/admin/sifu-prompts", title: "Prompt ซินแส" },
  { href: "/admin/paraphrase", title: "Paraphrase" },
  { href: "/admin/research", title: "Research" },
];

export default async function AdminHub() {
  const a = await isAdmin();
  if (!a.email) redirect("/signup?tab=login&next=/admin");
  if (!a.ok) return <div className="min-h-screen flex items-center justify-center p-6"><div className="border border-foreground/15 p-8 max-w-md"><h1 className="font-serif text-2xl mb-3">Forbidden</h1><p className="text-sm opacity-70">บัญชีนี้ไม่มีสิทธิ์ admin</p></div></div>;

  return (
    <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-serif text-3xl">หลังบ้าน · hourkey</h1>
        <span className="text-xs opacity-60">{a.email}</span>
      </div>

      <h2 className="text-xs uppercase tracking-wider opacity-50 mb-3">ธุรกิจ</h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="border border-foreground/15 hover:border-foreground/40 transition-colors p-5 block">
            <div className="text-2xl mb-2">{m.icon}</div>
            <div className="font-serif text-lg mb-1">{m.title}</div>
            <div className="text-sm opacity-65">{m.desc}</div>
          </Link>
        ))}
      </div>

      <h2 className="text-xs uppercase tracking-wider opacity-50 mb-3">เนื้อหา / Engine</h2>
      <div className="flex flex-wrap gap-2">
        {CONTENT.map((c) => (
          <Link key={c.href} href={c.href} className="border border-foreground/15 hover:border-foreground/40 px-3 py-1.5 text-sm">{c.title}</Link>
        ))}
      </div>
    </div>
  );
}
