import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import PackagesAdmin from "./editor";

export const metadata = { title: "แพ็กเกจ · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("admin.packages.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/packages");
  }
  return (
    <Suspense fallback={<div className="p-8 text-sm opacity-50">Loading…</div>}>
      <PackagesAdmin />
    </Suspense>
  );
}
