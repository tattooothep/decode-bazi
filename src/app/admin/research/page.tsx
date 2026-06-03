import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import ResearchAdmin from "./research-admin";

export const metadata = { title: "Research Console · Admin" };

export default async function AdminResearchPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/login?next=/admin/research");
  }
  return <ResearchAdmin email={admin.email || ""} />;
}
