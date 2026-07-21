import { createHash, randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { extname } from "path";
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = process.env.MOBILE_UPLOAD_DIR || "/root/decode-shared/mobile-uploads";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOW_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf", ".txt"]);
const EXT_MIME: Record<string, string> = {
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

type UploadRow = {
  id: string;
  original_name: string;
  mime: string;
  kind: string;
  size_bytes: number;
  sha256: string;
  profile_id: string | null;
  created_at: string;
};

function cleanString(value: FormDataEntryValue | null, max = 160): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
}

function cleanUuid(value: FormDataEntryValue | null): string | null {
  const text = cleanString(value, 80);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function safeOriginalName(name: string): string {
  const cleaned = name.replace(/[^\w.\-ก-๙ \u4e00-\u9fff]/g, "_").trim();
  return (cleaned || "upload").slice(0, 180);
}

function inferMime(file: File, ext: string): string {
  const type = (file.type || "").toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  return EXT_MIME[ext] || "application/octet-stream";
}

function kindForMime(mime: string): "image" | "pdf" | "text" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "text";
  return "file";
}

function publicMeta(row: UploadRow) {
  return {
    id: row.id,
    name: row.original_name,
    mime: row.mime,
    kind: row.kind,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    profile_id: row.profile_id,
    created_at: row.created_at,
    previewable: row.kind === "image" || row.kind === "pdf" || row.kind === "text",
    ai_status: "stored_for_mobile_context",
  };
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

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }
  if (!session.orgId) {
    return NextResponse.json({ ok: false, error: "missing org" }, { status: 400 });
  }

  const rl = await rateLimit(`mobile-upload:${clientIp(req)}:${session.userId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "อัปโหลดถี่เกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "ต้องส่งไฟล์แบบ multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "ไฟล์ใหญ่เกิน 12MB" }, { status: 413 });
  }

  const originalName = safeOriginalName(file.name || "upload");
  const ext = (extname(originalName) || "").toLowerCase();
  if (!ALLOW_EXT.has(ext)) {
    return NextResponse.json({ ok: false, error: "รองรับเฉพาะรูปภาพ PDF หรือ TXT" }, { status: 400 });
  }

  const mime = inferMime(file, ext);
  const kind = kindForMime(mime);
  if (kind === "file") {
    return NextResponse.json({ ok: false, error: "ชนิดไฟล์นี้ยังไม่รองรับ" }, { status: 400 });
  }

  const profileId = cleanUuid(form.get("profileId"));
  if (profileId) {
    const owned = await q1<{ id: string }>(
      `SELECT id
         FROM profiles
        WHERE id=$1
          AND org_id=$2
          AND created_by_user_id=$3
          AND COALESCE(is_archived, false)=false`,
      [profileId, session.orgId, session.userId]
    );
    if (!owned) return NextResponse.json({ ok: false, error: "ไม่พบดวงที่เลือก" }, { status: 404 });
  }
  const id = randomUUID();
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const dir = `${UPLOAD_DIR}/${session.orgId}/${session.userId}`;
  mkdirSync(dir, { recursive: true });
  const storagePath = `${dir}/${id}${ext}`;
  writeFileSync(storagePath, buf);

  await ensureUploadTable();
  const row = await q1<UploadRow>(
    `INSERT INTO mobile_uploads
       (id, org_id, user_id, profile_id, original_name, storage_path, mime, kind, size_bytes, sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, original_name, mime, kind, size_bytes, sha256, profile_id, created_at::text`,
    [id, session.orgId, session.userId, profileId, originalName, storagePath, mime, kind, file.size, sha256]
  );

  return NextResponse.json(
    { ok: true, upload: row ? publicMeta(row) : null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  await ensureUploadTable();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    const rows = await q<UploadRow>(
      `SELECT id, original_name, mime, kind, size_bytes, sha256, profile_id, created_at::text
         FROM mobile_uploads
        WHERE user_id=$1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 20`,
      [session.userId]
    );
    return NextResponse.json(
      { ok: true, uploads: rows.map(publicMeta) },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const row = await q1<UploadRow>(
    `SELECT id, original_name, mime, kind, size_bytes, sha256, profile_id, created_at::text
       FROM mobile_uploads
      WHERE id=$1
        AND user_id=$2
        AND deleted_at IS NULL`,
    [id, session.userId]
  );
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json(
    { ok: true, upload: publicMeta(row) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
