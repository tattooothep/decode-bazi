import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import LibraryAdmin from "./editor";

export const metadata = { title: "หอสมุดคัมภีร์ · Admin" };

export default async function AdminLibraryPage() {
  const s = await getSession();
  if (!s) redirect("/login?next=/admin/library");
  const allow = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = (s.email || "").toLowerCase();
  let isAdmin = allow.includes(email);
  if (!isAdmin && s.orgId) {
    const m = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [s.orgId, s.userId]
    );
    if (m && ["owner", "admin"].includes(m.role)) isAdmin = true;
  }
  if (!isAdmin) {
    return <div className="min-h-screen flex items-center justify-center p-6"><div className="border border-foreground/15 p-8 max-w-md"><h1 className="font-serif text-2xl mb-3">Forbidden</h1></div></div>;
  }
  return <LibraryAdmin email={s.email || ""} />;
}
