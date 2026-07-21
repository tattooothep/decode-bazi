/* src/lib/palm/vision.ts · ศาสตร์ที่ 7 — เปิดตา AI อ่านลายมือจากรูป
 * grok-4.3 vision (ตัวนำ · เร็ว ~15s + ตาแม่น) → gemini API (fallback)
 * grok ใช้ xAI API + OAuth token (grok CLI login · /root/.grok/auth.json) — ไม่ต้องซื้อ key เพิ่ม
 * standalone — ไม่แตะ sifu route (LOCKED) · reuse pattern เดียวกัน
 */
import { readFile } from "fs/promises";
import { readFileSync } from "fs";
import { runWithProviderCircuit } from "@/lib/ai/provider-health";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.PALM_GEMINI_MODEL || "gemini-2.5-flash";
const GROK_MODEL = (process.env.PALM_GROK_MODEL || "grok-4.3").trim();
const GROK_EFFORT = (process.env.PALM_GROK_EFFORT || "high").trim(); // reasoning: ให้ grok คิดลึกก่อนอ่าน (ลึก > เร็ว)
const GROK_TIMEOUT = Math.max(30_000, Number(process.env.PALM_GROK_TIMEOUT_MS || 150_000)); // grok timeout สั้นกว่า route maxDuration 240s → เหลือเวลา fallback gemini
const GROK_AUTH_PATH = process.env.PALM_GROK_AUTH || "/root/.grok/auth.json";
const GROK_API_URL = process.env.PALM_GROK_URL || "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = Math.max(30_000, Number(process.env.PALM_TIMEOUT_MS || 200_000));
/* ตัวนำ: grok-4.3 (เร็ว ~15s + ตาแม่น + รับคัมภีร์ใหญ่ได้) · gemini เป็น fallback
 * สลับได้ด้วย env PALM_PRIMARY=gemini */
const PRIMARY = (process.env.PALM_PRIMARY || "grok").trim().toLowerCase();

export type VisionResult = { text: string; engine: "gemini-api" | "grok-api" };

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
  const timeoutSig = AbortSignal.timeout(GROK_TIMEOUT);
  const reqSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
  const r = await fetch(GROK_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    signal: reqSignal,
    body: JSON.stringify({ model: GROK_MODEL, messages: [{ role: "user", content }], temperature: 0.4, max_tokens: 32000, reasoning_effort: GROK_EFFORT }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`grok_${r.status}: ${String(j.error?.message || j.error || "").slice(0, 200)}`);
  const finish = j.choices?.[0]?.finish_reason;
  const text = (j.choices?.[0]?.message?.content || "").trim();
  // output ตัดกลาง (reasoning=high กิน token จน completion ไม่ครบ) → JSON พัง → โยนให้ fallback gemini แทน 502 เงียบ
  if (finish === "length") throw new Error("grok_truncated_length");
  if (!text) throw new Error(`grok_empty: ${finish || "no content"}`);
  return text;
}

/* ── ตัวนำตาม PALM_PRIMARY (default grok) → fallback ไล่ไปทีละตัว ── */
async function tryGrok(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runGrokVision(p, q, s), engine: "grok-api" };
}
async function tryGemini(p: string[], q: string, s?: AbortSignal): Promise<VisionResult> {
  return { text: await runGeminiVision(p, q, s), engine: "gemini-api" };
}
export async function readPalmVision(imagePaths: string[], prompt: string, signal?: AbortSignal): Promise<VisionResult> {
  const engines: Record<string, (p: string[], q: string, s?: AbortSignal) => Promise<VisionResult>> = {
    grok: tryGrok, gemini: tryGemini,
  };
  // Agentic Codex vision is intentionally excluded: even a read-only shell can
  // expose host credentials through a prompt-injected answer.
  const order = PRIMARY === "gemini" ? ["gemini", "grok"] : ["grok", "gemini"];
  let lastErr: unknown;
  for (const name of order) {
    try {
      return await runWithProviderCircuit(`palm:${name}`, () => engines[name](imagePaths, prompt, signal));
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      console.warn(`[palmistry] ${name} vision failed (${String((e as Error).message || "").slice(0, 120)}) → next`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all_vision_failed");
}
