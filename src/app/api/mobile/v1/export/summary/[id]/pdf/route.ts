import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";

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

  const upstream = await fetch(`${internalAppOrigin(req)}/api/export/summary?job_id=${encodeURIComponent(id)}&format=pdf`, {
    cache: "no-store",
    headers: { Accept: "application/pdf", Cookie: `decode_auth=${bearer}` },
  });
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  if (!upstream.ok || !contentType.toLowerCase().includes("application/pdf")) {
    const data = await upstream.json().catch(() => ({ error: "invalid_export_pdf_response" }));
    return NextResponse.json({ ...data, ok: false }, { status: upstream.status });
  }
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": upstream.headers.get("content-disposition") || `attachment; filename="hourkey-${id}.pdf"`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": "application/pdf",
    },
    status: 200,
  });
}
