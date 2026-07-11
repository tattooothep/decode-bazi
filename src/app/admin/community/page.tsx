import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-guard";
import CommunityAdmin from "./editor";

export const metadata = { title: "ข่าวสารและ Support · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const admin = await requirePermission("admin.community.read");
    return <CommunityAdmin email={admin.email} />;
  } catch (err) {
    if (err instanceof Response && err.status === 401) redirect("/signup?tab=login&next=/admin/community");
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border border-foreground/15 p-8">
          <h1 className="font-serif text-2xl">Forbidden</h1>
        </div>
      </div>
    );
  }
}
