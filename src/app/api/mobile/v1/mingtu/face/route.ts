// POST /api/mobile/v1/mingtu/face — 命圖 โหมด 📷 อ่านโหงวเฮ้งจากรูปจริงตามคัมภีร์ (22 ก.ค. 2569)
// multipart: image (jpeg/png ≤8MB) + lang · ตาเอไอตัวเดียวกับ palm (grok vision · gemini fallback)
// รูปเขียนไฟล์ชั่วคราวแล้วลบทันที — ไม่เก็บถาวร (privacy)
import { NextResponse } from "next/server";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { readPalmVision } from "@/lib/palm/vision";
import { buildMianxiangPrompt, loadMianxiangCanon, parseFaceResult } from "@/lib/mianxiang/prompt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-mingtu-face:${clientIp(req)}:${session.userId}`, 6, 3600_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }
  const image = form.get("image");
  if (!(image instanceof File) || !/^image\//.test(image.type)) {
    return NextResponse.json({ ok: false, error: "image_required" }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
  const lang = ["th", "en", "zh"].includes(String(form.get("lang"))) ? String(form.get("lang")) : "th";
  const gender = ["M", "F"].includes(String(form.get("gender"))) ? String(form.get("gender")) : undefined;

  const dir = await mkdtemp(path.join(tmpdir(), "mingtu-face-"));
  const filePath = path.join(dir, "face.jpg");
  try {
    await writeFile(filePath, Buffer.from(await image.arrayBuffer()));
    const canon = await loadMianxiangCanon();
    const prompt = buildMianxiangPrompt({ canon, lang, gender });
    const vision = await readPalmVision([filePath], prompt);
    const reading = parseFaceResult(vision.text);
    if (!reading.ok) {
      return NextResponse.json({ ok: false, error: "unreadable", reason: reading.refuse }, { status: 422 });
    }
    return NextResponse.json({ ok: true, reading }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ ok: false, error: "vision_failed" }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
