import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import FormulasAdmin from "./editor";

export default async function AdminFormulasPage() {
  let admin;
  try {
    admin = await requirePermission("admin.formulas.read");
  } catch {
    redirect("/today");
  }
  return <FormulasAdmin session={{ email: admin.email }} />;
}
