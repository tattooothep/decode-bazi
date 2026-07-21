/* POST /api/palmistry/read · ศาสตร์ที่ 7 — อ่านลายมือจากรูป (async job · r479)
 * formData: images[] (jpeg) + roles[] (left|right|closeup) + targets[] + lang
 * flow: validate รูป → เซฟลง job_dir ถาวรชั่วคราว → INSERT palm_jobs(running) → คืน job_id ทันที (202)
 *       → background: enhance → คัมภีร์ → grok/gemini อ่าน → parse → UPDATE done + ลบรูป (privacy)
 * รูป biometric: temp + ลบทันทีเสมอ (ไม่เก็บ server) · งานวิ่งต่อบน server แม้ client พับจอ/ปิดแอป
 * ต้อง login · reserve 1 ยามก่อนสร้าง job · settle ตามคำตอบหรือ refund เมื่อพลาด
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, chmod, rm } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createReservedPalmJob, refundPalmJobBilling } from "@/lib/palm-billing";
import { type PalmContext, type PalmImageMeta } from "@/lib/palm/prompt";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { enqueuePalmJob } from "@/lib/jobs/queue";
import type { PalmJobPayload } from "@/lib/palm/job-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const MAX_IMAGES = 6;
const MAX_BYTES = 12 * 1024 * 1024; // 12MB/รูป
// โฟลเดอร์ถาวรชั่วคราว (ไม่ใช่ os.tmpdir ที่อาจโดนล้าง) เพราะ background อ่านทีหลัง · ลบทิ้งหลังอ่านเสร็จ
const JOBS_ROOT = "/var/tmp/palm-jobs";
const ALLOWED_ROLES = new Set(["left", "right", "closeup"]);
const ALLOWED_TARGETS = new Set(["life", "head", "heart", "fate", "palm", "mount", "finger", "thumb"]); // whitelist กัน prompt injection ผ่าน targets
const ALLOWED_DOMINANT = new Set(["left", "right", "unknown"]);
function isImageMagic(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42) return true; // WEBP (RIFF..WEB)
  return false;
}

function cleanText(v: FormDataEntryValue | null, max: number): string {
  return String(v || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limit = await rateLimit(`palm:${sess.userId}:${clientIp(req)}`, 15, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited", message: "คำขอถี่เกินไป รอสักครู่แล้วลองใหม่" }, { status: 429 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 }); }

  const files = form.getAll("images").filter((x): x is File => x instanceof File);
  if (!files.length) return NextResponse.json({ ok: false, error: "no_image", message: "ยังไม่ได้แนบรูปฝ่ามือ" }, { status: 400 });
  if (files.length > MAX_IMAGES) return NextResponse.json({ ok: false, error: "too_many", message: `แนบได้สูงสุด ${MAX_IMAGES} รูป` }, { status: 400 });

  const roles = form.getAll("roles").map(String);
  const targets = form.getAll("targets").map(String);
  const hands = form.getAll("hands").map(String); // มือของแต่ละรูป (โดยเฉพาะ closeup: ซูมนี้ของมือซ้าย/ขวา)
  const lang = (String(form.get("lang") || "th").toLowerCase().split("-")[0]) || "th";
  const rawDominant = cleanText(form.get("dominant_hand"), 12).toLowerCase();
  const rawGender = cleanText(form.get("gender"), 4).toUpperCase().charAt(0); // profile ส่ง M/F (login แล้ว auto)
  const context: PalmContext = {
    dominantHand: (ALLOWED_DOMINANT.has(rawDominant) ? rawDominant : "unknown") as PalmContext["dominantHand"],
    ageRange: cleanText(form.get("age_range"), 40),
    question: cleanText(form.get("question"), 180),
    gender: rawGender === "M" || rawGender === "F" ? rawGender as "M" | "F" : undefined,
    birthDate: cleanText(form.get("birth_date"), 30),
  };

  const jobId = randomUUID();
  const jobDir = path.join(JOBS_ROOT, jobId);
  try {
    await mkdir(jobDir, { recursive: true });
    await chmod(jobDir, 0o700);

    // 1) validate + เขียนรูปลง job_dir (ถาวรชั่วคราว) · เตรียม metas/labels (background อ่านต่อ)
    const srcPaths: string[] = [];
    const metas: PalmImageMeta[] = [];
    const labels: string[] = [];
    const requestHash = createHash("sha256")
      .update(sess.userId)
      .update(JSON.stringify(context))
      .update(String(Math.floor(Date.now() / 600_000)));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.size) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "empty_image", message: `รูปที่ ${i + 1} ว่างเปล่า/ไฟล์เสีย` }, { status: 400 }); }
      if (f.size > MAX_BYTES) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "too_big", message: `รูปที่ ${i + 1} ใหญ่เกิน 12MB` }, { status: 400 }); }
      const buf = Buffer.from(await f.arrayBuffer());
      if (!isImageMagic(buf)) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "not_image", message: `รูปที่ ${i + 1} ไม่ใช่ไฟล์ภาพ (รองรับ JPEG/PNG/WEBP)` }, { status: 400 }); }
      requestHash.update(buf);
      const src = path.join(jobDir, `src_${i}.jpg`);
      await writeFile(src, buf); await chmod(src, 0o600);
      srcPaths.push(src);

      const role = (ALLOWED_ROLES.has(roles[i]) ? roles[i] : (i === 0 ? "left" : i === 1 ? "right" : "closeup")) as PalmImageMeta["role"];
      const target = ALLOWED_TARGETS.has(targets[i]) ? targets[i] : undefined; // sanitize กัน injection
      // มือของรูปนี้: closeup อ่านจาก hands[] (frontend ส่งมาว่าซูมมือไหน) · รูปเต็มซ้าย/ขวา = มือตาม role เอง
      const hand = (hands[i] === "left" || hands[i] === "right") ? hands[i] as "left" | "right"
        : (role === "left" || role === "right") ? role as "left" | "right" : undefined;
      const handLabel = hand === "left" ? "มือซ้าย" : hand === "right" ? "มือขวา" : "";
      const label = role === "left" ? "ฝ่ามือซ้าย" : role === "right" ? "ฝ่ามือขวา"
        : `ภาพซูมเสริม${handLabel ? " (" + handLabel + ")" : ""}${target ? " เก็บ" + target : ""}`;
      metas.push({ role, target, label, hand });
      labels.push(label);
    }

    const suppliedIdempotency = String(req.headers.get("idempotency-key") || "")
      .replace(/[^a-zA-Z0-9_.:-]/g, "")
      .slice(0, 80);
    const idempotencyKey = suppliedIdempotency || requestHash.digest("hex");
    const payload: PalmJobPayload = { jobId, jobDir, srcPaths, metas, labels, lang, context };

    // Reserve once, persist the worker payload, then publish to BullMQ.
    const job = await createReservedPalmJob({
      id: jobId,
      userId: sess.userId,
      orgId: sess.orgId ?? null,
      lang,
      jobDir,
      imageCount: files.length,
      idempotencyKey,
      payload,
    });
    if (!job.ok) {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json({ ok: false, error: job.error }, { status: 402 });
    }
    if (job.existing) {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
      return NextResponse.json({ ok: true, job_id: job.id, status: job.status, deduplicated: true }, { status: 202 });
    }

    try {
      await enqueuePalmJob(jobId);
    } catch (error) {
      const message = (error as Error).message || "queue_unavailable";
      await refundPalmJobBilling(jobId, "queue_unavailable").catch(() => {});
      await q(`UPDATE palm_jobs SET status='error',error='queue_unavailable',updated_at=now() WHERE id=$1`, [jobId]).catch(() => {});
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
      console.error("[palmistry/queue]", message);
      return NextResponse.json({ ok: false, error: "queue_unavailable" }, { status: 503 });
    }

    return NextResponse.json({ ok: true, job_id: jobId, status: "queued" }, { status: 202 });
  } catch (e) {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    const msg = (e as Error).message || "error";
    console.error("[palmistry/read]", msg);
    return NextResponse.json({ ok: false, error: "read_failed", message: msg.slice(0, 200) }, { status: 500 });
  }
}
