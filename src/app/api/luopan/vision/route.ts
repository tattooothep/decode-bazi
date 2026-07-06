/**
 * POST /api/luopan/vision
 * VLM · ให้ Claude (Anthropic Opus ผ่าน OpenRouter) "เห็น" ภาพแปลนบ้านที่ user แนบ + ตอบคำถามฮวงจุ้ย
 * แยกจาก /api/sifu (LOCKED engine) โดยสิ้นเชิง · login-gated · ไม่แตะ engine ปาจื้อ
 * ใช้เฉพาะหน้า /luopan ตอนมีแปลนบ้านอัพไว้
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reserveHour, drainHoursByChars } from "@/lib/spend-hours";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = process.env.SIFU_VISION_MODEL || process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";
const MAX_IMAGE_CHARS = 8_000_000; // ~6MB base64 · กัน payload ใหญ่
const MAX_Q = 600;

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    if (!s?.orgId) {
      return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const question = String(body.question || "").trim().slice(0, MAX_Q);
    const packet = String(body.packet || "").trim().slice(0, 12000);
    const image = String(body.image || "").trim();

    if (!question) {
      return NextResponse.json({ ok: false, error: "no_question" }, { status: 400 });
    }
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(image)) {
      return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "vision_unavailable" }, { status: 503 });
    }

    // เครดิต "ยาม": จอง 1 ยาม atomic ก่อนเรียก AI (บล็อกยอด 0 + กัน race) · ใช้ users.hour_balance
    const rsv = await reserveHour("luopan_vision");
    if (!rsv.ok) {
      return NextResponse.json({ ok: false, error: "insufficient_hours", credit_yam: 0 }, { status: 402 });
    }

    const sysText = [
      "คุณคือซินแสฮวงจุ้ยที่กำลังดูภาพ 'แปลนบ้าน' ที่ผู้ใช้แนบมา ตอบสั้น กระชับ เป็นภาษาไทย",
      "อ้างอิงตำแหน่งจริงในแปลน (ห้องนอน/ประตู/บันได/ห้องน้ำ/ครัว/เตียง/โต๊ะ) ประกอบกับองศา·ทิศ·ผู้อยู่ใน context",
      "ถ้าภาพไม่ชัดหรืออ่านบางส่วนไม่ออก ให้บอกตรงๆ ว่าอ่านส่วนไหนไม่ได้ ห้ามเดามั่ว",
      "ถ้าผู้ใช้ถามจำนวนศาสตร์ ให้ตอบจาก FULL_LUOPAN_SCIENCES_PACKET science_count/catalog และแยกสถานะ ready/needs-house-lock/needs-water-pin/needs-hour-mode ให้ชัด",
      "ห้ามนับเฉพาะ engine360 score evidence เป็นจำนวนศาสตร์ทั้งหมด",
      packet ? ("บริบทบ้าน/ทิศ/ผู้อยู่ (FULL_LUOPAN_SCIENCES_PACKET + engine360):\n" + packet) : "",
    ].filter(Boolean).join("\n");

    const r = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hourkey.io",
        "X-Title": "hourkey · Luopan Vision",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: sysText + "\n\nคำถาม: " + question },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `vision ${r.status}`, detail: t.slice(0, 200) }, { status: 502 });
    }
    const j = await r.json();
    const reply = String(j?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      return NextResponse.json({ ok: false, error: "empty_reply" }, { status: 502 });
    }
    // หักยามตามจำนวนตัวอักษรคำตอบ (drain · ดูดเท่าที่มีถึง 0)
    const sp = await drainHoursByChars(reply.length, "luopan_vision");
    return NextResponse.json({ ok: true, reply, model: VISION_MODEL, cost_yam: sp.spent, credit_yam: sp.balance_after });
  } catch (e) {
    console.error("[luopan/vision]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "vision_failed" }, { status: 500 });
  }
}
