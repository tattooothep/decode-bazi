// /api/ai/imagegen — สร้างรูปด้วย grok (image_gen) หรือ gpt/codex (imagegen) ผ่าน cli skill ในตัว (ไม่ต้อง image API แยก)
// grok save ~/.grok/sessions/<cwd>/<sid>/images/N.jpg · codex save ~/.codex/generated_images/<sid>/ig_*.png
// แยกจาก /api/sifu (LOCKED) · spawn เป็น user jarvis (login grok+codex อยู่ที่ jarvis)
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const CHILD_USER = "jarvis";
const GROK_BIN = process.env.SIFU_GROK_BIN || "/root/.grok/bin/grok";
const CWD = process.env.SIFU_GROK_CWD || "/home/jarvis";
const TIMEOUT_MS = Number(process.env.AI_IMG_TIMEOUT_MS || 300_000);
const GROK_SESS = "/home/jarvis/.grok/sessions";
const CODEX_IMG = "/home/jarvis/.codex/generated_images";
const MAX_BYTES = 12 * 1024 * 1024;

type SpawnResult = { code: number; out: string; err: string };
function spawnP(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const c = spawn("sudo", ["-u", CHILD_USER, "-H", cmd, ...args], { cwd: CWD, env: process.env });
    let out = "", err = "", done = false;
    const fin = (r: SpawnResult) => { if (!done) { done = true; resolve(r); } };
    const t = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} fin({ code: -1, out, err: "timeout" }); }, TIMEOUT_MS);
    c.stdout.on("data", (d) => { out += d.toString(); });
    c.stderr.on("data", (d) => { err += d.toString(); });
    c.on("error", (e) => { clearTimeout(t); fin({ code: -1, out, err: String(e?.message || e) }); });
    c.on("close", (code) => { clearTimeout(t); fin({ code: code ?? -1, out, err }); });
  });
}

// หาไฟล์รูปที่ mtime ใหม่กว่า since (ms) ที่ใหม่สุด ใต้ dir (recursive · กัน depth ระเบิด)
function newestImageSince(dir: string, since: number, depth = 0): string | null {
  if (depth > 6) return null;
  let best: string | null = null, bestT = since;
  let ents: import("fs").Dirent[];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = newestImageSince(p, since, depth + 1);
      if (sub) { try { const m = statSync(sub).mtimeMs; if (m >= bestT) { bestT = m; best = sub; } } catch {} }
    } else if (/\.(png|jpe?g|webp)$/i.test(e.name)) {
      try { const m = statSync(p).mtimeMs; if (m >= bestT) { bestT = m; best = p; } } catch {}
    }
  }
  return best;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { prompt?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const prompt = String(body.prompt || "").trim().slice(0, 2000);
  if (!prompt) return NextResponse.json({ error: "no_prompt" }, { status: 400 });
  const m = String(body.model || "").toLowerCase();
  const engine = (m === "codex-cli" || m === "codex" || m === "gpt") ? "codex" : "grok";
  const startMs = Date.now() - 3000; // เผื่อ clock skew เล็กน้อย

  let r: SpawnResult, imgPath: string | null;
  if (engine === "codex") {
    r = await spawnP("codex", ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "-C", CWD, `Generate an image based on this request and save it as a PNG file: ${prompt}`]);
    imgPath = newestImageSince(CODEX_IMG, startMs);
  } else {
    r = await spawnP(GROK_BIN, ["-p", `สร้างรูปภาพตามคำขอนี้แล้วบันทึกเป็นไฟล์: ${prompt}`, "--output-format", "plain"]);
    imgPath = newestImageSince(GROK_SESS, startMs);
  }

  if (!imgPath) {
    return NextResponse.json({ error: "no_image", engine, detail: String(r.err || r.out).slice(0, 400) }, { status: 502 });
  }
  let buf: Buffer;
  try { buf = readFileSync(imgPath); } catch { return NextResponse.json({ error: "read_fail", engine }, { status: 500 }); }
  if (buf.length < 500) return NextResponse.json({ error: "image_too_small", engine }, { status: 502 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "image_too_large", engine }, { status: 502 });
  const mime = /\.png$/i.test(imgPath) ? "image/png" : /\.webp$/i.test(imgPath) ? "image/webp" : "image/jpeg";
  return NextResponse.json({ ok: true, engine, mime, bytes: buf.length, image_base64: buf.toString("base64") });
}
