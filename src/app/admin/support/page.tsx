import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import SupportClient from "./support-client";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  try {
    await requirePermission("admin.users.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/support");
  }
  const sp = await searchParams;
  return (
    <Suspense>
      <SupportClient lang={sp.lang || "th"} />
    </Suspense>
  );
}
