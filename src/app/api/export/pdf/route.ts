import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { renderExportPdf } from "@/lib/export-pdf";
import {
  assertLegacyPdfDocumentServerSafe,
  assertPdfDocumentServerSafe,
  parseLegacyPdfDocument,
  parsePdfDocumentV2,
} from "@/lib/pdf-document-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 2_500_000;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "pdf_document_too_large" }, { status: 413 });
  }
  const limit = await rateLimit(`export-pdf:${session.userId}:${clientIp(req)}`, 8, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "pdf_document_too_large" }, { status: 413 });
    }
    const body = JSON.parse(raw) as { document?: unknown; legacy?: unknown };
    const document = body.document ? parsePdfDocumentV2(body.document) : null;
    const legacy = body.legacy ? parseLegacyPdfDocument(body.legacy) : null;
    if (!document && !legacy) return NextResponse.json({ error: "invalid_pdf_document" }, { status: 400 });
    if (document) assertPdfDocumentServerSafe(document);
    if (legacy) assertLegacyPdfDocumentServerSafe(legacy);

    const lang = document?.report.lang || legacy?.report.lang || "en";
    const id = `direct-${session.userId.slice(0, 8)}-${randomUUID()}`;
    const pdf = await renderExportPdf({ document, legacy, lang, page: "report" }, lang, id);
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hourkey-report-${ymd}.pdf"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_pdf_document";
    if ((error instanceof Error && error.name === "ZodError") || error instanceof SyntaxError || message.startsWith("pdf_")) {
      return NextResponse.json({ error: "invalid_pdf_document" }, { status: 400 });
    }
    console.error("[export/pdf]", error instanceof Error ? (error.stack || error.message) : String(error));
    return NextResponse.json({ error: "pdf_render_failed" }, { status: 500 });
  }
}
