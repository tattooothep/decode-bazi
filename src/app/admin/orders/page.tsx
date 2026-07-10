import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import OrdersClient from "./orders-client";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  try {
    await requirePermission("admin.orders.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/orders");
  }
  const sp = await searchParams;
  return <OrdersClient lang={sp.lang || "th"} />;
}
