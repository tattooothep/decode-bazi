/* src/lib/palm/vision.ts · ศาสตร์ที่ 7 — เปิดตา AI อ่านลายมือจากรูป
 * grok-4.3 vision (ตัวนำ · เร็ว ~15s + ตาแม่น) → gemini API → codex CLI (fallback)
 * grok ใช้ xAI API + OAuth token (grok CLI login · /root/.grok/auth.json) — ไม่ต้องซื้อ key เพิ่ม
 * standalone — ไม่แตะ sifu route (LOCKED) · reuse pattern เดียวกัน
 */
import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { readFile } from "fs/promises";
import { readFileSync } from "fs";

const CHILD_USER = process.env.PALM_CHILD_USER || "jarvis";
const CODEX_MODEL = (process.env.SIFU_CODEX_MODEL || "").trim();
const CODEX_EFFORT = (process.env.PALM_CODEX_EFFORT || "medium").trim(); // อ่านภาพ+จับคู่คัมภีร์ ไม่ต้อง xhigh
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.PALM_GEMINI_MODEL || "gemini-2.5-flash";
const GROK_MODEL = (process.env.PALM_GROK_MODEL || "grok-4.3").trim();
const GROK_AUTH_PATH = process.env.PALM_GROK_AUTH || "/root/.grok/auth.json";
const GROK_API_URL = process.env.PALM_GROK_URL || "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = Math.max(30_000, Number(process.env.PALM_TIMEOUT_MS || 200_000));
/* ตัวนำ: grok-4.3 (เร็ว ~15s + ตาแม่น + รับคัมภีร์ใหญ่ได้) · gemini/codex เป็น fallback
 * สลับได้ด้วย env PALM_PRIMARY=gemini|codex */
const PRIMARY = (process.env.PALM_PRIMARY || "grok").trim().toLowerCase();

export type VisionResult = { text: string; engine: "codex-cli" | "gemini-api" | "grok-api" };

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
      const out = finalText.trim(); // ใช้เฉพาะ agent_message · ไม่ resolve rawOut (JSONL ดิบ = ขยะ)
      if (code === 0 && out) resolve(out);
      else reject(new Error(`codex_exit_${code}: ${(err || rawOut.slice(0, 120) || "").slice(0, 240)}`));
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
  // timeout ฝั่ง server (req.signal อย่างเดียวไม่พอบน self-host) + thinking budget คุมความยาว
  const timeoutSig = AbortSignal.timeout(TIMEOUT_MS);
  const reqSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, signal: reqSignal,
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.4, maxOutputTokens: 32000, thinkingConfig: { thinkingBudget: 2048 } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`gemini_${r.status}: ${(j.error?.message || "").slice(0, 200)}`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((x: { text?: string }) => x.text || "").join("").trim();
  if (!text) throw new Error(`gemini_empty: ${j.promptFeedback?.blockReason || "no candidates"}`);
  return text;
}

/* ── grok-4.3 vision (ตัวนำ): xAI API + OAuth token จาก grok CLI login ──
 * token อ่านสดทุก request (grok CLI refresh ให้เอง · service รันเป็น root อ่าน /root/.grok/auth.json ได้) */
function grokToken(): string {
  let raw: Record<string, { key?: string }>;
  try {
    raw = JSON.parse(readFileSync(GROK_AUTH_PATH, "utf8")) as Record<string, { key?: string }>;
  } catch {
    // ห้ามให้ SyntaxError ฝังเนื้อ auth.json/token ลง log — โยน error กลางแทน
    throw new Error("grok_auth_parse_fail");
  }
  const entry = Object.values(raw)[0];
  const tok = entry?.key;
  if (!tok) throw new Error("grok_no_token");
  return tok;
}
async function runGrokVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<string> {
  const token = grokToken();
  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const p of imagePaths) {
    const buf = await readFile(p);
    content.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + buf.toString("base64") } });
  }
  const timeoutSig = AbortSignal.timeout(TIMEOUT_MS);
  const reqSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
  const r = await fetch(GROK_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    signal: reqSignal,
    body: JSON.stringify({ model: GROK_MODEL, messages: [{ role: "user", content }], temperature: 0.4, max_tokens: 32000 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`grok_${r.status}: ${String(j.error?.message || j.error || "").slice(0, 200)}`);
  const text = (j.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error(`grok_empty: ${j.choices?.[0]?.finish_reason || "no content"}`);
  return text;
}

/* ── ตัวนำตาม PALM_PRIMARY (default grok) → fallback ไล่ไปทีละตัว ── */
async function tryGrok(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runGrokVision(p, q, s), engine: "grok-api" };
}
async function tryGemini(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runGeminiVision(p, q, s), engine: "gemini-api" };
}
async function tryCodex(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runCodexVision(p, q, s), engine: "codex-cli" };
}
export async function readPalmVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<VisionResult> {
  const engines: Record<string, (p: string[], q: string, s?: AbortSignal) => Promise<VisionResult>> = {
    grok: tryGrok, gemini: tryGemini, codex: tryCodex,
  };
  // ตัวนำก่อน แล้ว fallback ที่เหลือตามลำดับ (grok → gemini → codex เป็น default)
  const order = PRIMARY === "codex" ? ["codex", "gemini", "grok"]
    : PRIMARY === "gemini" ? ["gemini", "grok", "codex"]
    : ["grok", "gemini", "codex"];
  let lastErr: unknown;
  for (const name of order) {
    try {
      return await engines[name](imagePaths, prompt, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      console.warn(`[palmistry] ${name} vision failed (${String((e as Error).message || "").slice(0, 120)}) → next`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all_vision_failed");
}
