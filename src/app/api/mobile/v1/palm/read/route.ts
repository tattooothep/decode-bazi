import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 }); }

  const upstream = await fetch(`${internalAppOrigin(req)}/api/palmistry/read`, {
    body: form,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Cookie: `decode_auth=${bearer}`,
      ...(req.headers.get("idempotency-key") ? { "Idempotency-Key": String(req.headers.get("idempotency-key")) } : {}),
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_palm_response" }));
  return NextResponse.json(publicAiPayload(data), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
