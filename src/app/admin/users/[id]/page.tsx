import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import User360Client from "./user360-client";

export const dynamic = "force-dynamic";

export default async function User360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  try {
    await requirePermission("admin.users.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/members");
  }
  const { id } = await params;
  const sp = await searchParams;
  return <User360Client userId={id} lang={sp.lang || "th"} />;
}
