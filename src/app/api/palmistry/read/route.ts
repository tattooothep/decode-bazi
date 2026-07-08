/* POST /api/palmistry/read · ศาสตร์ที่ 7 — อ่านลายมือจากรูป
 * formData: images[] (jpeg) + roles[] (left|right|closeup) + targets[] + lang
 * flow: temp → opencv enhance (+%ความชัด) → codex/gemini อ่านตามคัมภีร์ → JSON + coverage
 * รูป biometric: temp + ลบทันทีเสมอ (ไม่เก็บ server)
 */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdtemp, writeFile, chmod, rm } from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { readPalmVision } from "@/lib/palm/vision";
import { loadPalmCanon, buildPalmPrompt, parsePalmResult, reshootTargets, type PalmContext, type PalmImageMeta } from "@/lib/palm/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const MAX_IMAGES = 6;
const MAX_BYTES = 12 * 1024 * 1024; // 12MB/รูป
const ENHANCE = path.join(process.cwd(), "scripts/palm-enhance.py");
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
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
  const context: PalmContext = {
    dominantHand: (ALLOWED_DOMINANT.has(rawDominant) ? rawDominant : "unknown") as PalmContext["dominantHand"],
    ageRange: cleanText(form.get("age_range"), 40),
    question: cleanText(form.get("question"), 180),
  };

  const dir = await mkdtemp(path.join(os.tmpdir(), "palm-"));
  await chmod(dir, 0o755); // ให้ user jarvis (codex) เข้าถึงได้
  try {
    // 1) เขียน temp + enhance ทุกรูป
    const metas: PalmImageMeta[] = [];
    const clarityHints: { label: string; clarity: number; advise: string }[] = [];
    const sendPaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.size) return NextResponse.json({ ok: false, error: "empty_image", message: `รูปที่ ${i + 1} ว่างเปล่า/ไฟล์เสีย` }, { status: 400 });
      if (f.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "too_big", message: `รูปที่ ${i + 1} ใหญ่เกิน 12MB` }, { status: 400 });
      const buf = Buffer.from(await f.arrayBuffer());
      if (!isImageMagic(buf)) return NextResponse.json({ ok: false, error: "not_image", message: `รูปที่ ${i + 1} ไม่ใช่ไฟล์ภาพ (รองรับ JPEG/PNG/WEBP)` }, { status: 400 });
      const src = path.join(dir, `src_${i}.jpg`);
      await writeFile(src, buf); await chmod(src, 0o644);
      const stem = path.join(dir, `e_${i}`);
      const en = await enhance(src, stem);
      await chmod(en.clear, 0o644).catch(() => {});
      sendPaths.push(en.clear);

      const role = (ALLOWED_ROLES.has(roles[i]) ? roles[i] : (i === 0 ? "left" : i === 1 ? "right" : "closeup")) as PalmImageMeta["role"];
      const target = ALLOWED_TARGETS.has(targets[i]) ? targets[i] : undefined; // sanitize กัน injection
      // มือของรูปนี้: closeup อ่านจาก hands[] (frontend ส่งมาว่าซูมมือไหน) · รูปเต็มซ้าย/ขวา = มือตาม role เอง
      const hand = (hands[i] === "left" || hands[i] === "right") ? hands[i] as "left" | "right"
        : (role === "left" || role === "right") ? role as "left" | "right" : undefined;
      const handLabel = hand === "left" ? "มือซ้าย" : hand === "right" ? "มือขวา" : "";
      const label = role === "left" ? "ฝ่ามือซ้าย" : role === "right" ? "ฝ่ามือขวา"
        : `ภาพซูมเสริม${handLabel ? " (" + handLabel + ")" : ""}${target ? " เก็บ" + target : ""}`;
      metas.push({ role, target, label, hand });
      clarityHints.push({ label, clarity: en.clarity, advise: en.advise });
    }

    // 2) build prompt + อ่าน
    const canon = await loadPalmCanon();
    const prompt = buildPalmPrompt({ canon, lang, images: metas, clarityHints, context });
    const vision = await readPalmVision(sendPaths, prompt, req.signal);

    // 3) parse
    let reading;
    try { reading = parsePalmResult(vision.text); }
    catch {
      return NextResponse.json({ ok: false, error: "parse_failed", engine: vision.engine, raw: vision.text.slice(0, 800) }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      engine: vision.engine,
      lang,
      clarity_hints: clarityHints,
      reading,
      reshoot: reshootTargets(reading),
      image_count: files.length,
    });
  } catch (e) {
    const msg = (e as Error).message || "error";
    if (msg === "aborted") return NextResponse.json({ ok: false, error: "aborted" }, { status: 499 });
    console.error("[palmistry/read]", msg);
    return NextResponse.json({ ok: false, error: "read_failed", message: msg.slice(0, 200) }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {}); // ลบรูปทันที เสมอ
  }
}
