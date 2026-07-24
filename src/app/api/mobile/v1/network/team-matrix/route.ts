// /api/mobile/v1/network/team-matrix — ตารางความสัมพันธ์ "ในทีมด้วยกันเอง" N×N (เจ้านายเคาะ 24 ก.ค. 2569)
//
// ── ใครเรียกได้ / ใช้สิทธิ์อะไร ───────────────────────────────────────────────
//  • ต้องล็อกอินผ่านโทเค็นมือถือ (getMobileSession) และมี orgId — ไม่มี = 401
//  • อ่านได้เฉพาะดวงที่ "ผู้ใช้คนนี้สร้างเอง ในองค์กรเดียวกัน และยังไม่ถูกเก็บเข้ากรุ"
//    (เงื่อนไข created_by_user_id + org_id + is_archived=false เดียวกับ /api/mobile/v1/network)
//    id ที่ไม่ใช่ของตัวเองจะตกไปอยู่ใน notAvailable ไม่มีทางอ่านข้ามบัญชี
//  • เพดานจำนวนคนมาจากแพ็กเกจจริง: PRODUCT_PAGE_ENTITLEMENTS[plan].network.team_people
//    (ปัจจุบัน master = 12 คน = 66 คู่ · แพ็กอื่น = 0 คือยังไม่เปิดใช้ฟีเจอร์จัดทีม)
//    ส่งเกินเพดาน = ตอบ 400 พร้อมบอกจำนวนที่ขอกับเพดาน — ห้ามตัดรายชื่อทิ้งเงียบ
//  • เส้นนี้เป็น read-only ล้วน ไม่เขียน DB ไม่เรียก AI ไม่มีการเก็บผลลง DB
//
// ── ของที่ตอบกลับ + ที่ต้องระวังตอนเอาไปแสดง ────────────────────────────────
//  ⚠️ คะแนนคู่จาก computePairReactionV2 "ไม่แปรตามวัน" (engine รับ date แต่ไม่อ่าน · ยิงจริง 5 วัน
//     ได้แฮชเดียวกัน) → ห้ามพาดหัวว่า "ความสัมพันธ์วันนี้" ต้องใช้คำว่าปฏิกิริยาพื้นดวง
//     ต้องการรายวันให้ไปที่ /api/mobile/v1/network/bestday (computeUserDayScore)
//  ⚠️ คู่ที่มีคนไม่รู้เวลาเกิด (ดวง 3 เสา) ถูกลดความมั่นใจ + ติดธง 3P_NO_HOUR — ห้ามแสดงเท่าคู่ที่ครบ
//  ⚠️ ไม่มีการเรียงลำดับคนจากดีไปแย่ · ห้ามนำผลไปใช้ตัดสินการจ้าง/เลิกจ้าง/เลื่อนขั้น/ประเมินผลงาน
//     (คำกำกับข้อนี้ส่งไปกับ basis.usage_limits ทุกครั้ง)
//
// pattern auth / rate-limit / cache ลอกจาก bestday/route.ts
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { buildNetworkScorePayload } from "@/lib/scoring/network-score-payload";
import { getProductAccess, PRODUCT_PAGE_ENTITLEMENTS } from "@/lib/product-entitlement";
import type { PairReactionUseful } from "@/lib/scoring/pair-reaction-v2";
import { cleanUuid, profilePillars, usefulElements } from "../bestday/bestday-lib";
import {
  TEAM_MATRIX_BASIS,
  TEAM_MATRIX_QUESTIONS,
  TEAM_MATRIX_MAX_PEOPLE,
  TEAM_MATRIX_TTL_MS,
  buildTeamMatrix,
  teamMatrixCacheKey,
  type TeamMatrixPerson,
  type TeamMatrixResult,
} from "./team-matrix-lib";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  nickname: string | null;
  relationship_type: string | null;
  network_group: string | null;
  network_group_label: string | null;
  day_master: string | null;
  yongshen: unknown;
  bazi_pillars: unknown;
  birth_time_known: boolean | null;
  updated_stamp: string | null;
  is_self: boolean;
};

type NotAvailable = { id: string | null; index: number; reason: string };

/* ── cache ต่อชุดสมาชิก · TTL 6 ชม. (pattern bestday) ── */
const _cache = new Map<string, { value: TeamMatrixResult; expires: number }>();

function cacheGet(key: string): TeamMatrixResult | null {
  const hit = _cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) _cache.delete(key);
  return null;
}

function cacheSet(key: string, value: TeamMatrixResult): void {
  _cache.set(key, { value, expires: Date.now() + TEAM_MATRIX_TTL_MS });
  if (_cache.size > 200) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].expires - b[1].expires).slice(0, 50);
    for (const [k] of oldest) _cache.delete(k);
  }
}

/** โหลดโปรไฟล์ตามรายชื่อที่ขอ — เงื่อนไขความเป็นเจ้าของเดียวกับ mobile/v1/network/route.ts:88-103 */
async function loadProfiles(orgId: string, userId: string, ids: string[]) {
  if (!ids.length) return [];
  return q<Row>(
    `SELECT id, name, nickname, relationship_type, network_group, network_group_label,
            day_master, yongshen, bazi_pillars, birth_time_known,
            to_char(COALESCE(updated_at, created_at) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS') AS updated_stamp,
            (created_by_user_id=$2 AND (relationship_type IS NULL OR btrim(relationship_type) = '')) AS is_self
       FROM profiles
      WHERE created_by_user_id=$2 AND org_id=$1
        AND COALESCE(is_archived, false)=false
        AND id = ANY($3::uuid[])`,
    [orgId, userId, ids]
  );
}

function profileLabel(row: Row) {
  if (row.is_self) return "เจ้าของบัญชี";
  return row.network_group_label || row.relationship_type || "ดวงที่บันทึกไว้";
}

/** 用神 ที่ป้อน engine: wrapper-7 ก่อน ไม่มีค่อยตกมาที่ column yongshen (ลำดับเดียวกับ bestday/own-score) */
function usefulFor(row: Row, synth: unknown): PairReactionUseful | null {
  const s = (synth || null) as (PairReactionUseful & { primary_yongshen?: unknown }) | null;
  const hasSynth = !!s && Array.isArray(s.primary_yongshen) && s.primary_yongshen.length > 0;
  if (hasSynth) return s;
  const fallback = usefulElements(row.yongshen);
  if (!fallback.yongshen.length && !fallback.jishen.length) return s;
  return {
    ...(s || {}),
    primary_yongshen: fallback.yongshen,
    jishen: fallback.jishen,
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  // หนักกว่า bestday (N(N−1)/2 คู่ต่อครั้ง) จึงคุมไว้ที่ 10 ครั้ง/นาที
  const limited = await rateLimit(`mobile-network-team-matrix:${clientIp(req)}:${session.userId}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { profileIds?: unknown; centerProfileId?: unknown };
  const rawIds = Array.isArray(body.profileIds) ? body.profileIds : null;
  if (!rawIds) {
    return NextResponse.json({ ok: false, error: "profileIds required" }, { status: 400 });
  }
  if (rawIds.length > TEAM_MATRIX_MAX_PEOPLE * 4) {
    // กันคนยิงลิสต์ยาวเป็นพันเพื่อให้ server ทำงานเปล่า (ยังตอบด้วยเหตุผลชัด ไม่ตัดเงียบ)
    return NextResponse.json(
      { ok: false, error: "too_many_ids", limit: TEAM_MATRIX_MAX_PEOPLE, requested: rawIds.length },
      { status: 400 }
    );
  }

  const notAvailable: NotAvailable[] = [];
  const wanted: string[] = [];
  rawIds.forEach((value, index) => {
    const id = cleanUuid(value);
    if (!id) {
      notAvailable.push({ id: null, index, reason: "invalid_id" });
      return;
    }
    if (wanted.includes(id)) {
      notAvailable.push({ id, index, reason: "duplicate" });
      return;
    }
    wanted.push(id);
  });

  // centerProfileId (ถ้าส่งมา) = ดวงที่แอพอยากให้เป็นศูนย์กลางของหน้า · ถ้ายังไม่อยู่ในรายชื่อจะถูก "เพิ่ม"
  // และนับรวมในเพดานด้วย — ไม่มีทางลัดให้เกินเพดานโดยไม่รู้ตัว
  const centerId = cleanUuid(body.centerProfileId);
  if (centerId && !wanted.includes(centerId)) wanted.unshift(centerId);
  else if (centerId) {
    wanted.splice(wanted.indexOf(centerId), 1);
    wanted.unshift(centerId);
  }

  /* เพดานจากแพ็กเกจจริง — เกินแล้วต้องบอกจำนวน ห้ามตัดรายชื่อทิ้งเงียบ (แบบเดียวกับ network/sifu) */
  const access = await getProductAccess(session.userId);
  const caps = access?.pages.network || PRODUCT_PAGE_ENTITLEMENTS.free.network;
  const teamLimit = Math.max(0, Math.min(TEAM_MATRIX_MAX_PEOPLE, Number(caps.team_people) || 0));
  if (wanted.length > teamLimit) {
    return NextResponse.json(
      {
        ok: false,
        error: "team_limit_exceeded",
        limit: teamLimit,
        requested: wanted.length,
        max_pairs: (teamLimit * Math.max(0, teamLimit - 1)) / 2,
        message: teamLimit === 0
          ? `แพ็กเกจนี้ยังไม่เปิดการอ่านความสัมพันธ์ในทีม (ขอมา ${wanted.length} คน)`
          : `แพ็กเกจนี้อ่านความสัมพันธ์ในทีมได้สูงสุด ${teamLimit} คน (ขอมา ${wanted.length} คน)`,
        entitlement: { plan: access?.plan || "free", team_people: caps.team_people, team_analysis: caps.team_analysis },
      },
      { status: 400 }
    );
  }

  if (wanted.length < 2) {
    return NextResponse.json(
      { ok: false, error: "need_at_least_two_profiles", requested: wanted.length, notAvailable },
      { status: 400 }
    );
  }

  const rows = await loadProfiles(session.orgId, session.userId, wanted);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const roster: Array<{ row: Row; pillars: NonNullable<ReturnType<typeof profilePillars>> }> = [];
  wanted.forEach((id, index) => {
    const row = byId.get(id);
    if (!row) {
      // ไม่บอกว่ามีอยู่จริงที่อื่นหรือไม่ — กันการเดาว่ามีดวงนี้ในบัญชีคนอื่น
      notAvailable.push({ id, index, reason: "not_found_or_not_yours" });
      return;
    }
    const pillars = profilePillars(row.bazi_pillars);
    if (!pillars) {
      notAvailable.push({ id, index, reason: "no_day_pillar" });
      return;
    }
    roster.push({ row, pillars });
  });

  if (roster.length < 2) {
    return NextResponse.json(
      { ok: false, error: "need_at_least_two_usable_profiles", usable: roster.length, notAvailable },
      { status: 422 }
    );
  }

  const ids = roster.map(({ row }) => row.id);
  const stamp = roster.map(({ row }) => row.updated_stamp || "0").sort().join("-");
  const cacheKey = teamMatrixCacheKey(ids, stamp);
  const cached = cacheGet(cacheKey);

  let matrix: TeamMatrixResult;
  if (cached) {
    matrix = cached;
  } else {
    /* wrapper-7 = คอขวด → synthesize 用神/病/藥 "ครั้งเดียวต่อคน"
     * buildNetworkScorePayload คือทางเดียวที่ route ควรแตะ wrapper-7 (เส้น /network + bestday ใช้ตัวนี้)
     * เรียกครั้งเดียวโดยวางคนแรกเป็น self และที่เหลือเป็น others → ได้ yongshen_v2 ครบทุกคนใน 1 รอบ
     * (ยิงซ้ำคนละรอบแบบหน้าเว็บเดิม = synth N ครั้งต่อคน = งาน N²) */
    const first = roster[0];
    const firstUseful = usefulElements(first.row.yongshen);
    const payload = await buildNetworkScorePayload(
      {
        date: undefined, // engine ปฏิกิริยาคู่ไม่อ่านวัน — ไม่ส่งเพื่อไม่ให้เข้าใจผิดว่าเป็นค่าของวันนี้
        scoringVersion: "v2",
        self: { id: first.row.id, ...first.pillars },
        selfYongshen: firstUseful.yongshen,
        selfJishen: firstUseful.jishen,
        others: roster.slice(1).map(({ row, pillars }) => ({ id: row.id, ...pillars })),
      },
      "http://localhost/api/network/score?v=2"
    );
    const yv2 = (payload as { yongshen_v2?: { self?: unknown; others?: Record<string, unknown> } }).yongshen_v2;

    const people: TeamMatrixPerson[] = [];
    roster.forEach(({ row, pillars }, index) => {
      const synth = index === 0 ? yv2?.self : yv2?.others?.[row.id];
      people.push({
        id: row.id,
        pillars,
        hourKnown: row.birth_time_known !== false && !!pillars.hour,
        useful: usefulFor(row, synth),
      });
    });

    matrix = buildTeamMatrix(people);
    cacheSet(cacheKey, matrix);
  }

  return NextResponse.json(
    {
      ok: true,
      source: "computePairReactionV2 (same engine as /api/network/score)",
      version: "team-matrix-v1",
      center_profile_id: centerId && ids.includes(centerId) ? centerId : null,
      people: roster.map(({ row, pillars }) => ({
        id: row.id,
        name: row.name,
        nickname: row.nickname,
        label: profileLabel(row),
        network_group: row.network_group,
        network_group_label: row.network_group_label,
        day_master: row.day_master,
        birth_time_known: row.birth_time_known !== false && !!pillars.hour,
        chart_mode: row.birth_time_known !== false && !!pillars.hour ? "4p" : "3p",
        is_self: row.is_self,
      })),
      pairs: matrix.pairs,
      coverage: { ...matrix.coverage, requested: wanted.length },
      notAvailable,
      entitlement: {
        plan: access?.plan || "free",
        team_people: caps.team_people,
        team_analysis: caps.team_analysis,
        limit: teamLimit,
      },
      basis: TEAM_MATRIX_BASIS,
      /* หัวข้อที่แอพเอาไปตั้งชื่อบล็อกได้ — ถ้อยคำที่เจ้านายเคาะ (พูดถึงคู่ ไม่ตัดสินตัวคน) */
      questions: TEAM_MATRIX_QUESTIONS,
      cached: !!cached,
      elapsed_ms: Date.now() - startedAt,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
