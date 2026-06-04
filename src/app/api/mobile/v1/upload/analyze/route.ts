import { existsSync, readFileSync, statSync } from "fs";
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT_CHARS = 12_000;

type UploadAnalyzeRow = {
  id: string;
  original_name: string;
  mime: string;
  kind: "image" | "pdf" | "text" | "file";
  size_bytes: number;
  storage_path: string;
  created_at: string;
};

function cleanUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

async function ensureUploadTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS mobile_uploads (
      id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      user_id uuid NOT NULL,
      profile_id uuid NULL,
      original_name text NOT NULL,
      storage_path text NOT NULL,
      mime text NOT NULL,
      kind text NOT NULL,
      size_bytes integer NOT NULL,
      sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    )
  `);
  await q(`
    CREATE INDEX IF NOT EXISTS idx_mobile_uploads_user_created
      ON mobile_uploads (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

function safeText(buf: Buffer): { text: string; truncated: boolean; chars: number } {
  const normalized = buf
    .toString("utf8")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  const text = normalized.slice(0, MAX_TEXT_CHARS);
  return { text, truncated: normalized.length > text.length, chars: normalized.length };
}

function pngSize(buf: Buffer): { width?: number; height?: number } {
  if (buf.length < 24) return {};
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (!isPng) return {};
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width?: number; height?: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    const len = buf.readUInt16BE(offset + 2);
    if (len < 2) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + len;
  }
  return {};
}

function webpSize(buf: Buffer): { width?: number; height?: number } {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return {};
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buf.length >= 30) {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 " && buf.length >= 30) {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  return {};
}

function imageSize(mime: string, buf: Buffer): { width?: number; height?: number } {
  if (mime === "image/png") return pngSize(buf);
  if (mime === "image/jpeg" || mime === "image/jpg") return jpegSize(buf);
  if (mime === "image/webp") return webpSize(buf);
  return pngSize(buf).width ? pngSize(buf) : jpegSize(buf).width ? jpegSize(buf) : webpSize(buf);
}

function pdfPageCount(buf: Buffer): number | undefined {
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length || undefined;
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  if (!session.orgId) {
    return NextResponse.json({ ok: false, error: "missing org" }, { status: 400 });
  }

  const rl = rateLimit(`mobile-upload-analyze:${clientIp(req)}:${session.userId}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "อ่านไฟล์ถี่เกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const uploadId = cleanUuid((body as { uploadId?: unknown; id?: unknown }).uploadId ?? (body as { id?: unknown }).id);
  if (!uploadId) {
    return NextResponse.json({ ok: false, error: "upload id ไม่ถูกต้อง" }, { status: 400 });
  }

  await ensureUploadTable();
  const row = await q1<UploadAnalyzeRow>(
    `SELECT id, original_name, mime, kind, size_bytes, storage_path, created_at::text
       FROM mobile_uploads
      WHERE id=$1
        AND user_id=$2
        AND org_id=$3
        AND deleted_at IS NULL`,
    [uploadId, session.userId, session.orgId]
  );
  if (!row) {
    return NextResponse.json({ ok: false, error: "ไม่พบไฟล์แนบของบัญชีนี้" }, { status: 404 });
  }
  if (!existsSync(row.storage_path)) {
    return NextResponse.json({ ok: false, error: "ไฟล์นี้ไม่มีอยู่ใน storage แล้ว" }, { status: 410 });
  }

  const diskSize = statSync(row.storage_path).size;
  const buf = readFileSync(row.storage_path);

  if (row.kind === "text" || row.mime.startsWith("text/")) {
    const extracted = safeText(buf);
    const hasText = extracted.text.length > 0;
    return NextResponse.json(
      {
        ok: true,
        analysis: {
          upload_id: row.id,
          name: row.original_name,
          kind: row.kind,
          mime: row.mime,
          size_bytes: row.size_bytes || diskSize,
          status: hasText ? "text_extracted" : "empty_text",
          summary_th: hasText
            ? `อ่านข้อความจาก ${row.original_name} ได้ ${extracted.text.length.toLocaleString("th-TH")} ตัวอักษร`
            : `ไฟล์ ${row.original_name} ไม่มีข้อความที่อ่านได้`,
          text: extracted.text,
          text_chars: extracted.chars,
          truncated: extracted.truncated,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (row.kind === "image") {
    const size = imageSize(row.mime, buf);
    return NextResponse.json(
      {
        ok: true,
        analysis: {
          upload_id: row.id,
          name: row.original_name,
          kind: row.kind,
          mime: row.mime,
          size_bytes: row.size_bytes || diskSize,
          status: "stored_waiting_vision",
          summary_th: size.width && size.height
            ? `รับรูป ${row.original_name} แล้ว (${size.width}x${size.height}) · ยังไม่เปิดชั้นอ่านภาพ/OCR`
            : `รับรูป ${row.original_name} แล้ว · ยังไม่เปิดชั้นอ่านภาพ/OCR`,
          needs_vision: true,
          width: size.width,
          height: size.height,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  if (row.kind === "pdf") {
    const pages = pdfPageCount(buf);
    return NextResponse.json(
      {
        ok: true,
        analysis: {
          upload_id: row.id,
          name: row.original_name,
          kind: row.kind,
          mime: row.mime,
          size_bytes: row.size_bytes || diskSize,
          status: "stored_waiting_ocr",
          summary_th: pages
            ? `รับ PDF ${row.original_name} แล้ว ประมาณ ${pages.toLocaleString("th-TH")} หน้า · ยังไม่เปิด OCR`
            : `รับ PDF ${row.original_name} แล้ว · ยังไม่เปิด OCR`,
          needs_ocr: true,
          pages,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      analysis: {
        upload_id: row.id,
        name: row.original_name,
        kind: row.kind,
        mime: row.mime,
        size_bytes: row.size_bytes || diskSize,
        status: "stored_metadata_only",
        summary_th: `รับไฟล์ ${row.original_name} แล้ว แต่ชนิดนี้ยังอ่านเนื้อหาไม่ได้`,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
