import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import AiCostClient from "./ai-cost-client";

export const dynamic = "force-dynamic";

export default async function AiCostPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  try {
    await requirePermission("admin.ai_cost.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/ai-cost");
  }
  const sp = await searchParams;
  return (
    <Suspense>
      <AiCostClient lang={sp.lang || "th"} />
    </Suspense>
  );
}
