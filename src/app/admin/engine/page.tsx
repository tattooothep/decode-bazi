import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import EngineEditor from "./editor";

export default async function AdminEnginePage() {
  let admin;
  try {
    admin = await requirePermission("admin.engine.read");
  } catch {
    redirect("/today");
  }
  return <EngineEditor session={{ email: admin.email }} />;
}
