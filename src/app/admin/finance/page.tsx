import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import FinanceAdmin from "./view";

export const metadata = { title: "การเงิน · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("admin.finance.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/finance");
  }
  return (
    <Suspense fallback={<div className="p-8 text-sm opacity-50">Loading…</div>}>
      <FinanceAdmin />
    </Suspense>
  );
}
