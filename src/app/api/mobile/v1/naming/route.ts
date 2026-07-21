// POST /api/mobile/v1/naming — ⑬ข ชื่อมงคล 姓名學 (五格剖象) + ชั้นเทียบ用神ดวงจริง (21 ก.ค. 2569)
// สูตร/ตาราง = แหล่งใน canon-inbox/xingming (เจ้านายเคาะใช้แหล่งรองระหว่างรอต้นตำรับ) — engine ใน src/lib/naming
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { analyzeName } from "@/lib/naming/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EN_TO_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-naming:${clientIp(req)}:${session.userId}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  let body: { surname?: string; given?: string; profileId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const surname = String(body.surname || "").trim();
  const given = String(body.given || "").trim();
  if (!surname || !given) return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });

  let yongElement: string | null = null;
  let yongName: { th?: string; en?: string; zh?: string } | null = null;
  if (body.profileId) {
    const row = await q1<{ yongshen: { top3?: Array<{ element?: string; elementName?: { th?: string; en?: string; zh?: string } }> } | null }>(
      `SELECT yongshen FROM profiles WHERE id = $1::uuid AND org_id = $2 AND created_by_user_id = $3`,
      [String(body.profileId), session.orgId, session.userId]
    );
    const top = row?.yongshen?.top3?.[0];
    if (top?.element && EN_TO_ZH[top.element]) {
      yongElement = EN_TO_ZH[top.element];
      yongName = top.elementName || null;
    }
  }

  const result = analyzeName(surname, given, yongElement);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, chars: "chars" in result ? result.chars : undefined }, { status: 422 });
  }
  return NextResponse.json({ ok: true, result, yongshenName: yongName }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
