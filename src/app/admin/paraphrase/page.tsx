import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import ParaphraseEditor from "./editor";

export default async function AdminParaphrasePage() {
  const s = await getSession();
  if (!s) redirect("/signup?tab=login&next=/admin/paraphrase");

  const adminAllow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = (s.email || "").toLowerCase();
  let isAdmin = adminAllow.includes(email);
  if (!isAdmin && s.orgId) {
    const m = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [s.orgId, s.userId]
    );
    if (m && ["owner", "admin"].includes(m.role)) isAdmin = true;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="border border-foreground/15 bg-card p-8 max-w-md">
          <h1 className="font-serif text-2xl mb-3">Forbidden</h1>
          <p className="text-sm text-foreground/70">
            หน้านี้สำหรับผู้ดูแลเท่านั้น · กรุณาเข้าใช้ด้วยบัญชี admin
          </p>
          <p className="text-xs text-foreground/50 mt-4">
            ใช้บัญชี: {s.email} · ติดต่อให้เพิ่มใน ADMIN_EMAILS หรือเปลี่ยน role เป็น owner/admin
          </p>
        </div>
      </div>
    );
  }
  return <ParaphraseEditor session={{ email: s.email, role: "admin" }} />;
}
