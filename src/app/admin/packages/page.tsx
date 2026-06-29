import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import PackagesAdmin from "./editor";

export const metadata = { title: "แพ็คเกจ · Admin" };

export default async function Page() {
  const s = await getSession();
  if (!s) redirect("/signup?tab=login&next=/admin/packages");
  const allow = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  let ok = allow.includes((s.email || "").toLowerCase());
  if (!ok && s.orgId) {
    const m = await q1<{ role: string }>(`SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`, [s.orgId, s.userId]);
    if (m && ["owner", "admin"].includes(m.role)) ok = true;
  }
  if (!ok) return <div className="min-h-screen flex items-center justify-center"><div className="border border-foreground/15 p-8"><h1 className="font-serif text-2xl">Forbidden</h1></div></div>;
  return <PackagesAdmin />;
}
