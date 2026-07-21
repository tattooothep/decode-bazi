import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import SifuPromptsAdmin from "./editor";

export const metadata = { title: "แก้ System Prompt ซินแส · Admin" };

export default async function AdminSifuPromptsPage() {
  let admin;
  try {
    admin = await requirePermission("admin.prompts.read");
  } catch {
    redirect("/today");
  }
  return <SifuPromptsAdmin email={admin.email} />;
}
