import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";
import { MobileLuopanEvidenceError, rebuildMobileLuopanExportEvidence } from "@/lib/mobile-luopan-export-evidence";
import {MobileCalendarEvidenceError,rebuildMobileCalendarExportEvidence} from "@/lib/mobile-calendar-export-evidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGES = new Set(["chart", "palm", "fusion", "qimen", "datepick", "calendar", "luopan"]);
const MAX_BODY_BYTES = 900_000;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "export_payload_too_large" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const page = typeof body.page === "string" ? body.page.trim().toLowerCase() : "";
  if (!PAGES.has(page)) {
    return NextResponse.json({ ok: false, error: "unsupported_page" }, { status: 400 });
  }
  let inputs: unknown = body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)
    ? body.inputs
    : {};
  if (page === "luopan") {
    try {
      inputs = await rebuildMobileLuopanExportEvidence({bearer,inputs,origin:internalAppOrigin(req)});
    } catch (cause) {
      const status = cause instanceof MobileLuopanEvidenceError ? cause.status : 500;
      const error = cause instanceof MobileLuopanEvidenceError ? cause.code : "luopan_evidence_verification_failed";
      return NextResponse.json({ok:false,error},{status});
    }
  }
  if(page==="calendar"){
    try{inputs=await rebuildMobileCalendarExportEvidence({bearer,inputs,origin:internalAppOrigin(req)});}
    catch(cause){const status=cause instanceof MobileCalendarEvidenceError?cause.status:500;const error=cause instanceof MobileCalendarEvidenceError?cause.code:"calendar_evidence_verification_failed";return NextResponse.json({ok:false,error},{status});}
  }
  if(page==="chart"){
    const root=inputs&&typeof inputs==="object"&&!Array.isArray(inputs)?inputs as Record<string,unknown>:{};
    inputs={profileId:typeof root.profileId==="string"?root.profileId:""};
  }

  const upstream = await fetch(`${internalAppOrigin(req)}/api/export/summary`, {
    body: JSON.stringify({ page, lang: body.lang, inputs }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `decode_auth=${bearer}`,
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ error: "invalid_export_response" }));
  return NextResponse.json(publicAiPayload({ ...data, ok: upstream.ok }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
