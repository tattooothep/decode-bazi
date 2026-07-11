import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import NotifyClient from "./notify-client";

export const metadata = { title: "การแจ้งเตือน · Admin" };
export const dynamic = "force-dynamic";

export default async function NotifyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/signup?tab=login&next=/admin/notify");
  }
  const sp = await searchParams;
  return <NotifyClient lang={sp.lang || "th"} />;
}
