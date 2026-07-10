import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/admin-guard";
import SettingsAdmin from "./editor";

export const metadata = { title: "ตั้งค่าเว็บ · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("admin.settings.read");
  } catch {
    redirect("/signup?tab=login&next=/admin/settings");
  }
  return (
    <Suspense fallback={<div className="p-8 text-sm opacity-50">Loading…</div>}>
      <SettingsAdmin />
    </Suspense>
  );
}
