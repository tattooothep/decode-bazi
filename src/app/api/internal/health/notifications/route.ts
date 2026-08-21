import { notificationHealthPost } from "@/lib/notification-health-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Next Route Handler boundary; dependency injection stays outside its signature. */
export async function POST(req: Request) {
  return notificationHealthPost(req);
}
