/* src/lib/mingtu/scene-image.ts · เจนภาพฉาก Cinematic Life Report ผ่าน xAI images/generations
 * token: pattern เดียวกับ src/lib/palm/vision.ts grokToken (อ่านสดจาก /root/.grok/auth.json · ห้าม log ค่า token)
 * ล้มเหลว → โยน error ตรงๆ ให้ route ตอบ error (contract PRD: ห้าม fallback เงียบ)
 */
import { readFileSync } from "fs";

const GROK_AUTH_PATH = process.env.MINGTU_GROK_AUTH || "/root/.grok/auth.json";
const IMAGE_URL = process.env.MINGTU_IMAGE_URL || "https://api.x.ai/v1/images/generations";
const IMAGE_MODEL = (process.env.MINGTU_IMAGE_MODEL || "grok-imagine-image-quality").trim();
const TIMEOUT_MS = Math.max(30_000, Number(process.env.MINGTU_IMAGE_TIMEOUT_MS || 90_000));

function grokToken(): string {
  let raw: Record<string, { key?: string }>;
  try {
    raw = JSON.parse(readFileSync(GROK_AUTH_PATH, "utf8")) as Record<string, { key?: string }>;
  } catch {
    /* ห้ามให้ SyntaxError ฝังเนื้อ auth.json/token ลง log — โยน error กลางแทน */
    throw new Error("grok_auth_parse_fail");
  }
  const entry = Object.values(raw)[0];
  const tok = entry?.key;
  if (!tok) throw new Error("grok_no_token");
  return tok;
}

export function sceneImageModel(): string {
  return IMAGE_MODEL;
}

/** เจนภาพ 9:16 คืน base64 (b64_json) · timeout 90s · โยน error ทันทีเมื่อพัง (ไม่มี fallback) */
export async function generateSceneImage(prompt: string): Promise<string> {
  const token = grokToken();
  const r = await fetch(IMAGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, aspect_ratio: "9:16", response_format: "b64_json" }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } | string; data?: { b64_json?: string }[] };
  if (!r.ok || j.error) {
    const msg = typeof j.error === "string" ? j.error : j.error?.message || "";
    throw new Error(`image_${r.status}: ${msg.slice(0, 200)}`);
  }
  const b64 = j.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") throw new Error("image_empty");
  return b64;
}
