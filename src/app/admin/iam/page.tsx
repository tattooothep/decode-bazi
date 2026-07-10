import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import IamClient from "./iam-client";

export const dynamic = "force-dynamic";

export default async function IamPage({ searchParams }: { searchParams: Promise<{ lang?: string; accept?: string }> }) {
  try {
    await requirePermission("admin.iam.read");
  } catch {
    // allow accept_invite flow for invited users who can at least login
    const sp = await searchParams;
    if (!sp.accept) redirect("/signup?tab=login&next=/admin/iam");
  }
  const sp = await searchParams;
  return <IamClient lang={sp.lang || "th"} acceptToken={sp.accept || ""} />;
}
