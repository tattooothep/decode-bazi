import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import AffiliateAdmin from "./view";

export const metadata = { title: "Affiliate · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("admin.affiliate.members.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/affiliate");
  }
  return <AffiliateAdmin />;
}
