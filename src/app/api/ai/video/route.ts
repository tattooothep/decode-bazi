// /api/ai/video — สร้างวิดีโอด้วย BytePlus Seedance (text-to-video / image-to-video)
// gpt/grok ไม่มี video tool → ใช้ byteplus (ARK_API_KEY) · logic reuse จาก heygen2 byteplus-seedance.mjs
// แยกจาก /api/sifu (LOCKED) · auth required
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const ARK_BASE = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
const ARK_MODEL = process.env.ARK_SEEDANCE_MODEL || "dreamina-seedance-2-0-260128";
const ARK_MODEL_FAST = process.env.ARK_SEEDANCE_MODEL_FAST || "dreamina-seedance-2-0-fast-260128";
const TIMEOUT_MS = Number(process.env.AI_VIDEO_TIMEOUT_MS || 480_000);

type VidContent = { type: string; text?: string; image_url?: { url: string }; role?: string };
type GenResult = { ok: true; video: Buffer; duration_ms: number } | { ok: false; error: string };

async function genVideoByteplus(prompt: string, opts: { image_b64?: string; duration?: number; resolution?: string; ratio?: string; seed?: number; fast?: boolean } = {}): Promise<GenResult> {
  const key = process.env.ARK_API_KEY;
  if (!key) return { ok: false, error: "no ARK_API_KEY" };
  const content: VidContent[] = [{ type: "text", text: String(prompt).slice(0, 1800) }];
  if (opts.image_b64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${opts.image_b64}` }, role: "reference_image" });
  try {
    const cr = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.fast ? ARK_MODEL_FAST : ARK_MODEL, content,
        ratio: opts.ratio || "9:16", resolution: opts.resolution || "720p",
        duration: Math.min(Math.max(Math.round(opts.duration || 6), 4), 15),
        seed: opts.seed, watermark: false, generate_audio: false,
      }),
    });
    const cj = await cr.json().catch(() => ({}));
    const taskId = cj.id || cj.task_id;
    if (!cr.ok || !taskId) return { ok: false, error: `create ${cr.status}: ${JSON.stringify(cj).slice(0, 180)}` };
    const deadline = Date.now() + TIMEOUT_MS;
    let st: { status?: string; content?: { video_url?: string }; error?: unknown } = {};
    while (Date.now() < deadline) {
      await new Promise((rs) => setTimeout(rs, 6000));
      const pr = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
      st = await pr.json().catch(() => ({}));
      if (st.status === "succeeded") break;
      if (["failed", "expired", "cancelled"].includes(st.status || "")) return { ok: false, error: `task ${st.status}: ${JSON.stringify(st.error || {}).slice(0, 180)}` };
    }
    const videoUrl = st?.content?.video_url;
    if (!videoUrl) return { ok: false, error: "timeout/no video_url" };
    const vr = await fetch(videoUrl);
    if (!vr.ok) return { ok: false, error: `download ${vr.status}` };
    const video = Buffer.from(await vr.arrayBuffer());
    if (video.length > 100 * 1024 * 1024) return { ok: false, error: "video_too_large" }; // cap กัน memory บวม
    return { ok: true, video, duration_ms: (opts.duration || 6) * 1000 };
  } catch (e) { return { ok: false, error: String((e as Error)?.message || e).slice(0, 180) }; }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ARK_API_KEY) return NextResponse.json({ error: "ark_key_missing", detail: "ตั้งค่า ARK_API_KEY ก่อนใช้สร้างวิดีโอ" }, { status: 503 });

  let body: { prompt?: unknown; image_b64?: unknown; duration?: unknown; fast?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const prompt = String(body.prompt || "").trim().slice(0, 1800);
  if (!prompt) return NextResponse.json({ error: "no_prompt" }, { status: 400 });
  const image_b64 = typeof body.image_b64 === "string" ? body.image_b64 : undefined;
  const duration = Math.min(Math.max(Math.round(Number(body.duration) || 6), 4), 15);
  const fast = body.fast !== false; // default fast (เร็ว/ถูกกว่า)

  const r = await genVideoByteplus(prompt, { image_b64, duration, fast });
  if (!r.ok) return NextResponse.json({ error: "video_failed", detail: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, engine: "byteplus-seedance", mime: "video/mp4", duration_ms: r.duration_ms, bytes: r.video.length, video_base64: r.video.toString("base64") });
}
