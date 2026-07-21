import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import MembersAdmin from "./editor";

export const metadata = { title: "สมาชิก · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("admin.users.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/members");
  }
  return (
    <Suspense fallback={<div className="min-h-screen p-8 text-white/50">Loading…</div>}>
      <MembersAdmin />
    </Suspense>
  );
}
