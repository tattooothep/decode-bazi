import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import LibraryAdmin from "./editor";

export const metadata = { title: "หอสมุดคัมภีร์ · Admin" };

export default async function AdminLibraryPage() {
  let admin;
  try {
    admin = await requirePermission("admin.library.read");
  } catch {
    redirect("/today");
  }
  return <LibraryAdmin email={admin.email} />;
}
