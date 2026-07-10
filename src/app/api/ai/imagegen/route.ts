// Disabled until image generation runs in a worker with no host credentials or mounts.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "image_generation_temporarily_disabled" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
