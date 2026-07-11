import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import ResearchAdmin from "./research-admin";

export const metadata = { title: "มอนิเตอร์แชท AI · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminResearchPage() {
  try {
    await requirePermission("admin.research.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/research");
  }
  return (
    <Suspense>
      <ResearchAdmin />
    </Suspense>
  );
}
