// GET/POST /api/mobile/v1/liuyao — ⑬ค 六爻納甲 (裝卦เต็มตำรา 增刪卜易) — 21 ก.ค. 2569
// GET = รายการเรื่องที่ถาม (用神ตามคัมภีร์) · POST = ตั้ง卦จากเหรียญ 6 ครั้ง → โครงสร้างเต็ม
// engine deterministic ล้วน (src/lib/liuyao) — ไม่มีค่าปั้น ทุกปัจจัยผูก quote คัมภีร์
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { castLiuyao } from "@/lib/liuyao/engine";
import rulesRaw from "@/lib/liuyao/data/rules.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const rules = rulesRaw as { yongshenByTopic: Array<{ topic_key: string; liuqin: string }> };
  return NextResponse.json(
    {
      ok: true,
      // เฉพาะหัวข้อที่ 用神 เป็น 六親 มาตรฐาน (ข้อยกเว้นพิเศษของคัมภีร์ เว้นไว้เฟสหน้า)
      topics: rules.yongshenByTopic
        .filter((t) => ["父母", "官鬼", "兄弟", "妻財", "子孫"].includes(t.liuqin))
        .map((t) => ({ key: t.topic_key, liuqin: t.liuqin })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-liuyao:${clientIp(req)}:${session.userId}`, 12, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  let body: { tosses?: number[]; topicKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const result = castLiuyao({ tosses: body.tosses || [], topicKey: String(body.topicKey || "") });
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
