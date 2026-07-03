/**
 * /api/account/avatar · Account Phase 1 (r378 · 3 ก.ค. 2026)
 * POST   → อัปโหลดรูปโปรไฟล์ (multipart field "file" ≤2MB) · sharp resize 256px webp · เก็บ DB (users.avatar bytea)
 * DELETE → ลบรูปโปรไฟล์ (กลับไปใช้อักษรย่อ)
 * เก็บใน DB แทน public/uploads เพราะ: cluster 4 instance แชร์ DB เดียว (ไฟล์ local ไม่ sync) + backup รวมกับ pg_dump
 */
import { NextResponse } from "next/server";
import sharp from "sharp";
import { q1 } from "@/lib/db";
import { getAccountUser } from "@/lib/account-utils";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(req: Request) {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const rl = rateLimit(`avatar:${acc.u.id}`, 20, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "อัปโหลดบ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "ต้องส่งเป็น multipart/form-data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "ไม่พบไฟล์รูป (field: file)" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 2MB" }, { status: 413 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "ต้องเป็นไฟล์รูปภาพ" }, { status: 400 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (input.length > MAX_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 2MB" }, { status: 413 });
  }

  let webp: Buffer;
  try {
    webp = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate() // เคารพ EXIF orientation
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "อ่านไฟล์รูปไม่ได้ (ไฟล์เสียหรือไม่ใช่รูป)" }, { status: 400 });
  }

  const v = Date.now();
  const avatarUrl = `/api/account/avatar/${acc.u.id}?v=${v}`;
  await q1(
    `UPDATE users SET avatar=$2, avatar_updated_at=now(), avatar_url=$3, last_active_at=now()
      WHERE id=$1 AND deleted_at IS NULL`,
    [acc.u.id, webp, avatarUrl]
  );
  return NextResponse.json({ ok: true, avatar_url: avatarUrl, bytes: webp.length });
}

export async function DELETE() {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  await q1(
    `UPDATE users SET avatar=NULL, avatar_updated_at=NULL, avatar_url=NULL, last_active_at=now()
      WHERE id=$1 AND deleted_at IS NULL`,
    [acc.u.id]
  );
  return NextResponse.json({ ok: true });
}
