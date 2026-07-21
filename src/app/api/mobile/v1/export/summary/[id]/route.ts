import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanId(value: string): string | null {
  const id = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }
  const id = cleanId((await context.params).id || "");
  if (!id) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const upstream = await fetch(`${internalAppOrigin(req)}/api/export/summary?job_id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { Accept: "application/json", Cookie: `decode_auth=${bearer}` },
  });
  const data = await upstream.json().catch(() => ({ error: "invalid_export_status_response" }));
  return NextResponse.json(publicAiPayload({ ...data, ok: upstream.ok }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
