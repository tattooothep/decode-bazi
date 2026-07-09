import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import AffiliateAdmin from "./view";

export const metadata = { title: "Affiliate · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requireAdmin();
  } catch {
    redirect("/signup?tab=login&next=/admin/affiliate");
  }
  return <AffiliateAdmin />;
}
