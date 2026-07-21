/**
 * src/lib/export/shared.ts · helper ร่วมของทุก export page handler (chart/palm/fusion)
 * ยกจาก src/app/api/export/summary/route.ts เดิม (chart นำร่อง) — พฤติกรรม/ค่าคงเดิมเป๊ะ ไม่แตะ logic
 * ⚠️ additive · ไม่แตะ /api/sifu (LOCKED) แค่เรียกผ่าน fusion-internal boundary เดิม
 */
import { readSessionVersion, signSession, type Session } from "@/lib/auth";
import { createHash } from "crypto";

export const INTERNAL_BASE = process.env.SIFU_INTERNAL_BASE_URL || "http://127.0.0.1:3349";
export const CHILD_TIMEOUT_MS = Number(process.env.SIFU_EXPORT_CHILD_TIMEOUT_MS || 240_000);
export const SUMMARY_MODEL = "claude-max-cli";

export function internalToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("fusion_internal_secret_missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}

/** เซ็น session ใหม่ → cookie สำหรับเรียก /api/chart, /api/sifu แบบ internal (server-to-server)
 * 21 ก.ค.: ต้องใส่ sv เสมอ — เดิมไม่ใส่ (default 0) ทำให้บัญชีที่เคยเปลี่ยนรหัส (sv>0)
 * โดนด่าน session_version ปัด 401 → PDF ทั้ง 7 หน้าพังเงียบ (บั๊กตระกูลเดียวกับที่แก้ fusion ใน r523) */
export async function authCookie(session: Session): Promise<string> {
  const sv = typeof (session as { sv?: number }).sv === "number"
    ? (session as { sv?: number }).sv
    : await readSessionVersion(session.userId);
  const token = await signSession({ userId: session.userId, email: session.email, orgId: session.orgId || null, sv });
  return `decode_auth=${encodeURIComponent(token)}`;
}

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function cleanId(x: unknown): string | null {
  const s = String(x || "").trim();
  return /^[0-9a-f-]{8,40}$/i.test(s) ? s : null;
}

/** เรียก /api/sifu externalPrompt (1 call · claude-max-cli default) · ใช้ร่วมทุก export page handler */
export async function callSifu(cookie: string, prompt: string, model: string = SUMMARY_MODEL): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHILD_TIMEOUT_MS);
  try {
    const r = await fetch(new URL("/api/sifu", INTERNAL_BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookie, "X-Sifu-Fusion": "1", "X-Sifu-Fusion-Token": internalToken() },
      body: JSON.stringify({ message: "export-summary", externalPrompt: prompt, model, noCache: true }),
      signal: ctrl.signal,
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) return { ok: false, error: String(j.error || `http_${r.status}`) };
    const reply = String(j.reply || "").trim();
    return reply ? { ok: true, reply } : { ok: false, error: "empty_reply" };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } finally { clearTimeout(timer); }
}
