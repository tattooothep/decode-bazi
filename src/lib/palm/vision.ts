/* src/lib/palm/vision.ts · ศาสตร์ที่ 7 — เปิดตา AI อ่านลายมือจากรูป
 * codex CLI (ตัวนำ) → gemini API (fallback) · อ่านรูปฝ่ามือหลายรูปพร้อมกัน
 * standalone — ไม่แตะ sifu route (LOCKED) · reuse pattern spawn เดียวกัน
 */
import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { readFile } from "fs/promises";

const CHILD_USER = process.env.PALM_CHILD_USER || "jarvis";
const CODEX_MODEL = (process.env.SIFU_CODEX_MODEL || "").trim();
const CODEX_EFFORT = (process.env.PALM_CODEX_EFFORT || "medium").trim(); // อ่านภาพ+จับคู่คัมภีร์ ไม่ต้อง xhigh
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.PALM_GEMINI_MODEL || "gemini-2.5-flash";
const TIMEOUT_MS = Math.max(30_000, Number(process.env.PALM_TIMEOUT_MS || 200_000));
/* ตัวนำ: gemini (เร็ว ~37s + แม่น) · codex ช้าเกิน (>260s กับคัมภีร์ 9KB) เก็บเป็น fallback
 * สลับได้ด้วย env PALM_PRIMARY=codex ถ้าวันหน้า codex เร็วขึ้น/prompt เล็กลง */
const PRIMARY = (process.env.PALM_PRIMARY || "gemini").trim().toLowerCase();

export type VisionResult = { text: string; engine: "codex-cli" | "gemini-api" };

/* ── codex: sudo -u jarvis -H codex exec --json ... -i <img> <prompt(positional)> ── */
function codexArgs(imagePaths: string[], prompt: string): string[] {
  const a = [
    "-u", CHILD_USER, "-H", "codex", "exec",
    "--json", "--ephemeral",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "-C", "/tmp",
  ];
  if (CODEX_MODEL) a.push("-m", CODEX_MODEL);
  if (CODEX_EFFORT) a.push("-c", `model_reasoning_effort="${CODEX_EFFORT}"`);
  for (const p of imagePaths) a.push("-i", p);
  a.push(prompt); // prompt เป็น positional arg (image mode ห้าม stdin — ไม่งั้น "No prompt provided")
  return a;
}

function runCodexVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const c = spawn("sudo", codexArgs(imagePaths, prompt), { cwd: "/tmp", env: process.env });
    let rawOut = "", finalText = "", err = "", lineBuf = "", settled = false;
    const dec = new StringDecoder("utf8");
    const parseLine = (line: string) => {
      const t = line.trim();
      if (!t) return;
      try {
        const o = JSON.parse(t);
        if (o.type === "item.completed" && o.item?.type === "agent_message" && typeof o.item.text === "string") finalText = o.item.text;
        else if (o.type === "turn.failed" && o.error?.message) err += "\n" + o.error.message;
        else if (o.type === "error" && o.message) err += "\n" + o.message;
      } catch { /* non-json line */ }
    };
    const done = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort); fn(); };
    const onAbort = () => { try { c.kill("SIGKILL"); } catch {} done(() => reject(new Error("aborted"))); };
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} done(() => reject(new Error("codex_timeout"))); }, TIMEOUT_MS);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    c.stdout.on("data", ch => {
      const s = dec.write(ch); rawOut += s; lineBuf += s;
      let nl; while ((nl = lineBuf.indexOf("\n")) !== -1) { parseLine(lineBuf.slice(0, nl)); lineBuf = lineBuf.slice(nl + 1); }
    });
    c.stderr.on("data", ch => { err += ch.toString(); });
    c.on("error", e => done(() => reject(e)));
    c.on("close", code => done(() => {
      const tail = (lineBuf + dec.end()).trim(); if (tail) parseLine(tail);
      const out = (finalText || rawOut).trim();
      if (code === 0 && out) resolve(out);
      else reject(new Error(`codex_exit_${code}: ${(err || "").slice(0, 240)}`));
    }));
  });
}

/* ── gemini fallback: inline base64 หลายรูป ── */
async function runGeminiVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<string> {
  if (!GEMINI_KEY) throw new Error("gemini_no_key");
  const parts: unknown[] = [{ text: prompt }];
  for (const p of imagePaths) {
    const buf = await readFile(p);
    parts.push({ inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, signal,
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.3, maxOutputTokens: 8000 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`gemini_${r.status}: ${(j.error?.message || "").slice(0, 200)}`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((x: { text?: string }) => x.text || "").join("").trim();
  if (!text) throw new Error(`gemini_empty: ${j.promptFeedback?.blockReason || "no candidates"}`);
  return text;
}

/* ── ตัวนำตาม PALM_PRIMARY (default gemini) → อีกตัว fallback ── */
async function tryGemini(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runGeminiVision(p, q, s), engine: "gemini-api" };
}
async function tryCodex(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runCodexVision(p, q, s), engine: "codex-cli" };
}
export async function readPalmVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<VisionResult> {
  const primary = PRIMARY === "codex" ? tryCodex : tryGemini;
  const fallback = PRIMARY === "codex" ? tryGemini : tryCodex;
  try {
    return await primary(imagePaths, prompt, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn(`[palmistry] ${PRIMARY} vision failed (${((e as Error).message || "").slice(0, 120)}) → fallback`);
    return await fallback(imagePaths, prompt, signal);
  }
}
