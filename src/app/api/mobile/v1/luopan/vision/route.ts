import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_BODY_BYTES = 8_100_000;
const IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const packet = typeof body.packet === "string" ? body.packet.trim() : "";
  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (!question || question.length > 600) return NextResponse.json({ ok: false, error: "bad_question" }, { status: 400 });
  if (!IMAGE_PATTERN.test(image)) return NextResponse.json({ ok: false, error: "bad_image" }, { status: 400 });
  if (image.length > 8_000_000) return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
  if (packet.length > 12_000) return NextResponse.json({ ok: false, error: "packet_too_large" }, { status: 413 });

  const upstream = await fetch(`${internalAppOrigin(req)}/api/luopan/vision`, {
    body: JSON.stringify({ image, packet, question }),
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", Cookie: `decode_auth=${bearer}` },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_vision_response" })) as Record<string, unknown>;
  return NextResponse.json(publicAiPayload(data), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
