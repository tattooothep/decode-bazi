import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import ParaphraseEditor from "./editor";

export default async function AdminParaphrasePage() {
  let admin;
  try {
    admin = await requirePermission("admin.paraphrase.read");
  } catch {
    redirect("/today");
  }
  return <ParaphraseEditor session={{ email: admin.email, role: admin.role }} />;
}
