import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Context) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  }
  const upstream = await fetch(`${internalAppOrigin(req)}/api/palmistry/job?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { Accept: "application/json", Cookie: `decode_auth=${bearer}` },
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_palm_response" }));
  return NextResponse.json(publicAiPayload(data), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
