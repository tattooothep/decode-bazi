/* POST /api/palmistry/read · ศาสตร์ที่ 7 — อ่านลายมือจากรูป (async job · r479)
 * formData: images[] (jpeg) + roles[] (left|right|closeup) + targets[] + lang
 * flow: validate รูป → เซฟลง job_dir ถาวรชั่วคราว → INSERT palm_jobs(running) → คืน job_id ทันที (202)
 *       → background: enhance → คัมภีร์ → grok/gemini อ่าน → parse → UPDATE done + ลบรูป (privacy)
 * รูป biometric: temp + ลบทันทีเสมอ (ไม่เก็บ server) · งานวิ่งต่อบน server แม้ client พับจอ/ปิดแอป
 * ⚠️ ไม่มี auth (guest ใช้ได้) · session แบบ optional (ผูก user_id ถ้ามี · ไม่มีก็ null)
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdir, writeFile, chmod, rm } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { q1, q } from "@/lib/db";
import { readPalmVision } from "@/lib/palm/vision";
import { loadPalmCanon, buildPalmPrompt, parsePalmResult, reshootTargets, type PalmContext, type PalmImageMeta } from "@/lib/palm/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

// ตั้ง process-global "เวลาบูต" ตั้งแต่ read route โหลด (POST มาก่อน poll เสมอ) → job route ใช้ค่าเดียวกัน
// กัน orphan false-positive: งานแรกหลัง restart ต้องไม่ถูก mark error เพราะ SERVER_STARTED_AT ตั้งช้ากว่า created_at
((globalThis as unknown as { __palmServerStartedAt?: Date }).__palmServerStartedAt ||= new Date());

const MAX_IMAGES = 6;
const MAX_BYTES = 12 * 1024 * 1024; // 12MB/รูป
const ENHANCE = path.join(process.cwd(), "scripts/palm-enhance.py");
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

/* rate limit เบา ๆ in-memory: 15 คำขอ/นาที/ip */
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now(), win = 60_000, cap = 15;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < win)) hits.delete(k);
  return arr.length > cap;
}

/* spawn python enhance → {clarity, clear, lines, advise} */
function enhance(src: string, stem: string): Promise<{ clarity: number; clear: string; advise: string }> {
  return new Promise((resolve) => {
    const c = spawn("python3", [ENHANCE, src, stem]);
    let out = "", err = "", settled = false;
    const finish = (v: { clarity: number; clear: string; advise: string }) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} finish({ clarity: 0, clear: src, advise: "enhance_timeout" }); }, 30_000); // กันแฮงก์
    c.stdout.on("data", d => (out += d)); c.stderr.on("data", d => (err += d));
    c.on("close", () => {
      try {
        const j = JSON.parse(out.trim());
        if (j.ok) return finish({ clarity: j.clarity, clear: j.clear, advise: j.advise });
      } catch { /* fall through */ }
      finish({ clarity: 0, clear: src, advise: "enhance_failed" }); // ใช้ต้นฉบับ
    });
    c.on("error", () => finish({ clarity: 0, clear: src, advise: "enhance_error" }));
  });
}

/* getSession แบบ optional — login แล้วผูก user_id/org_id · guest = null (ห้ามบังคับ login) */
async function tryGetSession(): Promise<{ userId: string; orgId: string | null } | null> {
  try {
    const mod = await import("@/lib/auth");
    const s = await mod.getSession();
    return s ? { userId: s.userId, orgId: s.orgId ?? null } : null;
  } catch { return null; }
}

type PalmJobParams = {
  jobId: string;
  jobDir: string;
  srcPaths: string[];        // รูปต้นฉบับที่เขียนลง job_dir แล้ว (background enhance ต่อ)
  metas: PalmImageMeta[];    // role/target/label/hand ต่อรูป (คำนวณตอน POST · cheap)
  labels: string[];          // ป้ายกำกับสำหรับ clarity hint
  lang: string;
  context: PalmContext;
};

/* 🔄 worker เบื้องหลัง · ไม่ผูก req.signal → user ปิดจอ/พับมือถือได้ งานวิ่งต่อบน server → เก็บผลลง DB
 * เรียกแบบ detached (ไม่ await) · ต้องไม่ throw ออกนอก (อัปเดต job เสมอ ทั้งสำเร็จ/พลาด) · ลบรูปเสมอ (privacy) */
async function processPalmJob(p: PalmJobParams): Promise<void> {
  const { jobId, jobDir, srcPaths, metas, labels, lang, context } = p;
  try {
    // 1) enhance ทุกรูป (งานหนัก · อยู่ใน background)
    const clarityHints: { label: string; clarity: number; advise: string }[] = [];
    const sendPaths: string[] = [];
    for (let i = 0; i < srcPaths.length; i++) {
      const stem = path.join(jobDir, `e_${i}`);
      const en = await enhance(srcPaths[i], stem);
      await chmod(en.clear, 0o644).catch(() => {});
      sendPaths.push(en.clear);
      clarityHints.push({ label: labels[i] || `image_${i + 1}`, clarity: en.clarity, advise: en.advise });
    }

    // 2) build prompt + อ่าน (⚠️ ไม่ส่ง signal — งานต้องวิ่งจบแม้ client หลุด)
    const canon = await loadPalmCanon();
    const prompt = buildPalmPrompt({ canon, lang, images: metas, clarityHints, context });
    const vision = await readPalmVision(sendPaths, prompt, undefined);

    // 3) parse
    let reading;
    try { reading = parsePalmResult(vision.text); }
    catch {
      await q(`UPDATE palm_jobs SET status='error', error=$2, engine=$3, updated_at=now() WHERE id=$1`,
        [jobId, "parse_failed", vision.engine]).catch(() => {});
      return;
    }

    const result = {
      ok: true,
      engine: vision.engine,
      lang,
      clarity_hints: clarityHints,
      reading,
      reshoot: reshootTargets(reading),
      image_count: srcPaths.length,
    };
    await q(`UPDATE palm_jobs SET status='done', result=$2, engine=$3, updated_at=now() WHERE id=$1`,
      [jobId, JSON.stringify(result), vision.engine]);
  } catch (e) {
    const msg = ((e as Error)?.message || "read_failed").slice(0, 200);
    await q(`UPDATE palm_jobs SET status='error', error=$2, updated_at=now() WHERE id=$1`, [jobId, msg]).catch(() => {});
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {}); // ลบรูปทันทีหลังอ่านเสร็จ/พลาด (privacy)
  }
}

export async function POST(req: NextRequest) {
  // IP จริงจาก nginx (X-Real-IP=$remote_addr) ก่อน · ถ้าไม่มีใช้ hop ขวาสุดของ XFF (=ที่ proxy เห็น) · ห้ามใช้ตัวซ้ายสุด (client ปลอมได้ → ข้าม rate limit)
  const _xff = req.headers.get("x-forwarded-for");
  const ip = req.headers.get("x-real-ip")?.trim() || (_xff ? _xff.split(",").pop()!.trim() : "") || "unknown";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "rate_limited", message: "คำขอถี่เกินไป รอสักครู่แล้วลองใหม่" }, { status: 429 });

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

  // session optional (guest = null) → ผูก ownership กัน IDOR ที่ GET /job (ถ้ามี user)
  const sess = await tryGetSession();

  const jobId = randomUUID();
  const jobDir = path.join(JOBS_ROOT, jobId);
  try {
    await mkdir(jobDir, { recursive: true });
    await chmod(jobDir, 0o755); // ให้ user jarvis (codex/grok) เข้าถึงได้

    // 1) validate + เขียนรูปลง job_dir (ถาวรชั่วคราว) · เตรียม metas/labels (background อ่านต่อ)
    const srcPaths: string[] = [];
    const metas: PalmImageMeta[] = [];
    const labels: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.size) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "empty_image", message: `รูปที่ ${i + 1} ว่างเปล่า/ไฟล์เสีย` }, { status: 400 }); }
      if (f.size > MAX_BYTES) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "too_big", message: `รูปที่ ${i + 1} ใหญ่เกิน 12MB` }, { status: 400 }); }
      const buf = Buffer.from(await f.arrayBuffer());
      if (!isImageMagic(buf)) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "not_image", message: `รูปที่ ${i + 1} ไม่ใช่ไฟล์ภาพ (รองรับ JPEG/PNG/WEBP)` }, { status: 400 }); }
      const src = path.join(jobDir, `src_${i}.jpg`);
      await writeFile(src, buf); await chmod(src, 0o644);
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

    // 2) INSERT palm_jobs (running) → คืน job_id ทันที (user พับจอ/ปิดแอปได้)
    const job = await q1<{ id: string }>(
      `INSERT INTO palm_jobs(id, user_id, org_id, status, lang, job_dir, image_count)
       VALUES ($1,$2,$3,'running',$4,$5,$6) RETURNING id`,
      [jobId, sess?.userId ?? null, sess?.orgId ?? null, lang, jobDir, files.length]
    );
    if (!job) { await rm(jobDir, { recursive: true, force: true }).catch(() => {}); return NextResponse.json({ ok: false, error: "job_create_failed" }, { status: 500 }); }

    // 3) 🔄 detached — ไม่ await · งานวิ่งบน server แม้ client ปิด
    void processPalmJob({ jobId, jobDir, srcPaths, metas, labels, lang, context });

    return NextResponse.json({ ok: true, job_id: jobId, status: "running" }, { status: 202 });
  } catch (e) {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    const msg = (e as Error).message || "error";
    console.error("[palmistry/read]", msg);
    return NextResponse.json({ ok: false, error: "read_failed", message: msg.slice(0, 200) }, { status: 500 });
  }
}
