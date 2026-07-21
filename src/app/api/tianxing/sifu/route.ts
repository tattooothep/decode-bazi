/**
 * POST /api/tianxing/sifu · ซินแสสังเคราะห์ฤกษ์เชิงลึกจากผังดาวจริง (七政四餘)
 * login-gated + reserve/settle/refund ยามตามคำตอบ เหมือน luopan/vision
 * AI สรุป "ภาษาทีหลัง" จากผล engine deterministic (กฎ9 · ห้ามให้ AI เดาตำแหน่งดาว)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reserveHour, settleReservedHourByChars, refundReservedHour } from "@/lib/spend-hours";
import { tianxingReading } from "@/lib/tianxing";
import { getProductAccess, entitlementDenied } from "@/lib/product-entitlement";
import { publicAiPayload } from "@/lib/public-ai-response";

export const runtime = "nodejs";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";

export async function POST(req: NextRequest) {
  let reserved = false;
  try {
    const s = await getSession();
    if (!s?.orgId) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    const access = await getProductAccess(s.userId);
    if (!access?.pages.datepick.sifu) {
      return NextResponse.json(entitlementDenied("tianxing_sifu_locked", { plan: access?.plan || "free" }), { status: 403 });
    }

    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const dt = new Date(String(b.dtUTC || ""));
    if (isNaN(dt.getTime())) return NextResponse.json({ ok: false, error: "bad_dtUTC" }, { status: 400 });
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ ok: false, error: "bad_latlng" }, { status: 400 });
    const activity = String(b.activity || "").slice(0, 80);
    const lang = ["en", "zh", "th"].includes(String(b.lang)) ? String(b.lang) : "th";

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ai_unavailable" }, { status: 503 });

    const r = tianxingReading(dt, lat, lng);

    // จองยาม atomic ก่อนเรียก AI
    const rsv = await reserveHour("tianxing_sifu");
    if (!rsv.ok) return NextResponse.json({ ok: false, error: "insufficient_hours", credit_yam: 0 }, { status: 402 });
    reserved = true;

    const starLines = r.stars.map((x) => `${x.zh}(${x.th}) ราศี${x.signTh} ${x.deg}° 宿${x.shu}${x.shuDeg}° ${x.status}${x.retro ? " ถอย" : ""}`).join(" · ");
    const facts = [
      `ฤกษ์ (UTC): ${r.dtUTC} · พิกัด ${lat},${lng}${activity ? ` · กิจกรรม: ${activity}` : ""}`,
      `命宮(ลัคนา): ราศี${r.ascendant.signTh} ${r.ascendant.deg}° 宿${r.ascendant.shu}${r.ascendant.shuDeg}° · 命主: ${r.yongshen.th}(${r.yongshen.zh}) สถานะ ${r.yongshen.status}`,
      `命度/度主: 宿${r.mingDegree.shu}${r.mingDegree.shuDeg}° → ${r.mingDegree.lordTh}(${r.mingDegree.lordZh}) ${r.mingDegree.lordStatus} · 身主(月為身): 宿${r.shenDegree.shu}${r.shenDegree.shuDeg}° → ${r.shenDegree.lordTh}(${r.shenDegree.lordZh}) ${r.shenDegree.lordStatus}`,
      `ตำแหน่งดาวจริง: ${starLines}`,
      `恩星(หนุน用神): ${r.en_stars.map((x) => x.th).join(",") || "—"} · 難星(ขัด): ${r.nan_stars.map((x) => x.th).join(",") || "—"}`,
      `格局: ${r.geju.map((g) => g.zh).join(",") || "—"} · ผลรวมเบื้องต้น: ${r.verdictTh.th}`,
      `ข้อจำกัด: packet นี้ไม่มี 行限/限度主/流月/流日/化曜 และ七政四餘ไม่มี四化(祿權科忌)แบบ紫微斗數`,
    ].join("\n");

    const sys = lang === "en"
      ? "You are a 七政四餘 (real-star) date-selection master. Synthesize a DEEP but concise reading from the GIVEN astronomy facts only. Do NOT invent star positions. Explain in plain English whether the real-sky stars support this chosen auspicious time, key supporting/conflicting stars, and a practical takeaway. Note it complements the almanac (黃曆), is traditional belief, not a guarantee."
      : lang === "zh"
      ? "你是七政四餘（真實天星）擇日명師。僅根據所給天文事實深入而簡潔地綜合判斷，切勿杜撰星曜位置。說明真實天象是否扶助此擇定吉時、關鍵恩/難星、實用建議。註明此為輔助黃曆之傳統擇日，非保證。"
      : "คุณคือซินแส 七政四餘 (ดาวจริงบนฟ้า) วิเคราะห์ฤกษ์เชิงลึกแต่กระชับ จาก 'ข้อเท็จจริงตำแหน่งดาว' ที่ให้เท่านั้น ห้ามแต่งตำแหน่งดาวเอง อธิบายเป็นภาษาคนเข้าใจง่ายว่า ดาวจริงบนฟ้าหนุนหรือขัดฤกษ์ที่เลือกนี้ · ดาวหนุน/ดาวขัดสำคัญ · คำแนะนำใช้งานจริง · ปิดท้ายว่าเป็นการเสริม黃曆 เป็นความเชื่อโบราณ ไม่ใช่คำรับประกัน";

    const resp = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://hourkey.io", "X-Title": "hourkey · Tianxing" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: sys + "\n\n=== ข้อเท็จจริงดาว ===\n" + facts }], temperature: 0.4, max_tokens: 1100 }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      await refundReservedHour("tianxing_sifu").catch(() => {});
      reserved = false;
      return NextResponse.json(publicAiPayload({ ok: false, error: `ai ${resp.status}`, detail: t.slice(0, 150) }), { status: 502 });
    }
    const j = await resp.json();
    const reply = String(j?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      await refundReservedHour("tianxing_sifu").catch(() => {});
      reserved = false;
      return NextResponse.json({ ok: false, error: "empty_reply" }, { status: 502 });
    }
    const sp = await settleReservedHourByChars(reply.length, "tianxing_sifu");
    reserved = false;
    return NextResponse.json(publicAiPayload({ ok: true, reply, model: MODEL, cost_yam: sp.spent, credit_yam: sp.balance_after }));
  } catch (e) {
    if (reserved) await refundReservedHour("tianxing_sifu").catch(() => {});
    console.error("[tianxing/sifu]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "tianxing_sifu_failed" }, { status: 500 });
  }
}
