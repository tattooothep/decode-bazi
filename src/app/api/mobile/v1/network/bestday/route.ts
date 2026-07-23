// /api/mobile/v1/network/bestday — "หาวันนัด" 14 วันข้างหน้า ต่อคนในเครือข่ายดวง (เจ้านายเคาะ 23 ก.ค. 2569)
// GET ?profileId=<uuid>   วันดีสุด / วันควรเลี่ยง สำหรับนัดเจอคนคนนั้น
//
// ⚠️ ที่มาของคะแนน (อ่านก่อนแก้ · ห้ามเปลี่ยนเป็น engine คู่):
//   engine ปฏิกิริยาคู่ computePairReactionV2 รับ param date แต่ "ไม่อ่านค่า date เลย"
//   (pair-reaction-v2.ts:733 · ยิงจริงคู่เดียวกัน 4 วันต่างกัน ได้ JSON แฮชเดียวกันเป๊ะ)
//   → ถ้าวน engine คู่ทีละวัน จะได้ตัวเลขเท่ากันทั้ง 14 วัน = ของหลอก
//   เส้นนี้จึงใช้ computeUserDayScore (pair-base.ts) ซึ่งเป็นตัวที่แปรตามวันจริง
//   และเป็นตัวเดียวกับที่ /today + /calendar ใช้อยู่ — ไม่มีการ fork สูตรใด ๆ
//
// pattern auth / rate-limit / cache ตาม goals/custom/route.ts
// ทุกคะแนน + เหตุผล มาจาก engine จริงเท่านั้น — คิดไม่ได้ = ตอบ error ห้ามปั้นตัวเลข
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";
import {
  BESTDAY_BASIS,
  BESTDAY_TTL_MS,
  BESTDAY_WINDOW_DAYS,
  bestdayCacheKey,
  buildBestdayView,
  cleanUuid,
  dayPillarWindow,
  profilePillars,
  scoreDayForPair,
  thaiDay,
  usefulElements,
  usefulFromEngine,
  type BestdayView,
  type UsefulPair,
} from "./bestday-lib";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  nickname: string | null;
  relationship_type: string | null;
  network_group_label: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
  is_self: boolean;
};

/* ── cache ต่อคู่ · TTL 6 ชม. (pattern goals/custom) ── */
const _cache = new Map<string, { value: BestdayView; expires: number }>();

function cacheGet(key: string): BestdayView | null {
  const hit = _cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) _cache.delete(key);
  return null;
}

function cacheSet(key: string, value: BestdayView): void {
  _cache.set(key, { value, expires: Date.now() + BESTDAY_TTL_MS });
  if (_cache.size > 500) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].expires - b[1].expires).slice(0, 100);
    for (const [k] of oldest) _cache.delete(k);
  }
}

/** โหลดเฉพาะดวงเจ้าของบัญชี + ดวงเป้าหมาย (เงื่อนไข is_self เดียวกับ network/route.ts) */
async function loadPair(orgId: string, userId: string, profileId: string) {
  return q<Row>(
    `SELECT id, name, nickname, relationship_type, network_group_label, yongshen, bazi_pillars,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE created_by_user_id=$2 AND org_id=$1
        AND COALESCE(is_archived, false)=false
        AND (id=$3::uuid OR (relationship_type IS NULL OR btrim(relationship_type) = ''))
      ORDER BY is_self DESC, created_at DESC`,
    [orgId, userId, profileId]
  );
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-network-bestday:${clientIp(req)}:${session.userId}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const url = new URL(req.url);
  const profileId = cleanUuid(url.searchParams.get("profileId"));
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "profileId required" }, { status: 400 });
  }

  const rows = await loadPair(session.orgId, session.userId, profileId);
  const selfRow = rows.find((row) => row.is_self) || null;
  const otherRow = rows.find((row) => row.id === profileId) || null;

  if (!otherRow) {
    return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
  }
  if (!selfRow) {
    return NextResponse.json({ ok: false, error: "no self profile" }, { status: 422 });
  }
  if (otherRow.id === selfRow.id) {
    return NextResponse.json({ ok: false, error: "profileId must be another person" }, { status: 400 });
  }

  const selfPillars = profilePillars(selfRow.bazi_pillars);
  const otherPillars = profilePillars(otherRow.bazi_pillars);
  if (!selfPillars) {
    return NextResponse.json({ ok: false, error: "self profile has no day pillar" }, { status: 422 });
  }
  if (!otherPillars) {
    return NextResponse.json({ ok: false, error: "target profile has no day pillar" }, { status: 422 });
  }

  const startDay = thaiDay(0);
  const cacheKey = bestdayCacheKey(selfRow.id, otherRow.id, startDay);
  const cached = cacheGet(cacheKey);

  let view: BestdayView;
  if (cached) {
    view = cached;
  } else {
    // 用神/忌神 จาก wrapper-7 ผ่านทางเดียวกับเส้น /network (ไม่คำนวณเอง) · ไม่มีค่อยตกไปที่ column yongshen
    let selfUseful: UsefulPair = usefulElements(selfRow.yongshen);
    let otherUseful: UsefulPair = usefulElements(otherRow.yongshen);
    try {
      const payload = await buildNetworkScorePayload(
        {
          date: startDay,
          scoringVersion: "v2",
          self: { id: selfRow.id, ...selfPillars },
          selfYongshen: selfUseful.yongshen,
          selfJishen: selfUseful.jishen,
          others: [{ id: otherRow.id, ...otherPillars }],
        },
        "http://localhost/api/network/score?v=2"
      );
      const yv2 = (payload as { yongshen_v2?: { self?: unknown; others?: Record<string, unknown> } }).yongshen_v2;
      selfUseful = usefulFromEngine(yv2?.self, selfUseful);
      otherUseful = usefulFromEngine(yv2?.others?.[otherRow.id], otherUseful);
    } catch {
      // wrapper-7 ใช้ไม่ได้ → ใช้ 用神 ที่บันทึกไว้กับโปรไฟล์ตามเดิม (ไม่ใช่การเดา)
    }

    const window = await dayPillarWindow(startDay, BESTDAY_WINDOW_DAYS);
    const days = window.map((item) =>
      scoreDayForPair({
        date: item.date,
        dayPillar: item.pillar,
        selfPillars,
        selfUseful,
        otherPillars,
        otherUseful,
      })
    );
    view = buildBestdayView(days);
    cacheSet(cacheKey, view);
  }

  return NextResponse.json(
    {
      ok: true,
      profile: {
        id: otherRow.id,
        name: otherRow.name,
        nickname: otherRow.nickname,
        label: otherRow.network_group_label || otherRow.relationship_type || "ดวงที่บันทึกไว้",
      },
      start_date: startDay,
      window_days: BESTDAY_WINDOW_DAYS,
      days: view.days,
      best: view.best,
      // ไม่มีวันไหนถูก engine ตีระดับว่าควรเลี่ยงจริง = null (ห้ามยัดวันที่แย่ที่สุดมาเป็น "ควรเลี่ยง")
      avoid: view.avoid,
      basis: BESTDAY_BASIS,
      cached: !!cached,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
