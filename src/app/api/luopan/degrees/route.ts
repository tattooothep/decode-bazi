/**
 * POST /api/luopan/degrees
 * Layer-0 scaffold: ส่งข้อมูล 360 องศาแบบ structured เพื่อรอ wire เข้า AI advice
 *
 * body (optional):
 * {
 *   facing_deg?: number,   // default 180
 *   year?: number,         // default ปีปัจจุบัน
 *   timing?: "era"|"year"|"month"|"day"|"hour", // default "era"
 *   profile_id?: string,   // optional
 *   pins?: Array<{ type?: string; degree?: number }>
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { findMountain24, degreeToDir8, isNearMountainBoundary, normalizeDeg } from "@/lib/luopan/mountains";
import type { ElementEn } from "@/lib/luopan/mountains";
import { calcXuanKongChart, decideTigua, tiguaSchoolLabel, type TiguaSchool } from "@/lib/luopan/tigua";
import { evaluateBashaHuangQuan, resolvePinCategory, type LuopanPinInput } from "@/lib/luopan/najia-basha";

type TimingKey = "era" | "year" | "month" | "day" | "hour";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function degreeToMountain24(deg: number) {
  const m = findMountain24(deg);
  return {
    index: m.index,
    code: m.name,
    mountain_code: m.code,
    type: m.type,
    element: m.element,
    element_zh: m.elementZh,
    trigram: m.trigram,
    yuan: m.yuan,
    yin_yang: m.yinYang,
    range: { start_deg: m.startDeg, end_deg: m.endDeg },
    center_deg: m.centerDeg,
  };
}

function pseudoTimeStar(deg: number, year: number, timing: TimingKey): number {
  const seed = year + (timing === "era" ? 0 : timing === "year" ? 7 : timing === "month" ? 13 : timing === "day" ? 19 : 23);
  return ((Math.floor(deg / 45) + seed) % 9) + 1;
}

function elementScore(el: ElementEn, yong: ElementEn[], xi: ElementEn[], ji: ElementEn[]): number {
  if (yong.includes(el)) return 30;
  if (xi.includes(el)) return 18;
  if (ji.includes(el)) return -22;
  return 0;
}

function starScore(star: number): number {
  if ([1, 6, 8, 9].includes(star)) return 8;
  if ([2, 5].includes(star)) return -12;
  return 0;
}

function pinProximityScore(targetDeg: number, pinDegs: number[]): number {
  if (!pinDegs.length) return 0;
  let best = 181;
  for (const p of pinDegs) {
    const d = Math.abs(((targetDeg - p + 540) % 360) - 180);
    if (d < best) best = d;
  }
  if (best <= 7.5) return 8;
  if (best <= 15) return 5;
  if (best <= 30) return 2;
  return 0;
}

async function loadProfileElements(profileId: string | null, orgId: string | null): Promise<{ yong: ElementEn[]; xi: ElementEn[]; ji: ElementEn[] } | null> {
  if (!profileId || !orgId) return null;  // 1 มิ.ย. ปิด IDOR: ต้องมี org + เป็นเจ้าของ (เดิมดึง用神ดวงคนอื่นได้)
  const row = await q1<{ yongshen: any }>("SELECT yongshen FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false", [profileId, orgId]);
  if (!row?.yongshen) return null;
  const top3 = Array.isArray(row.yongshen?.top3) ? row.yongshen.top3 : [];
  const toEl = (v: unknown): ElementEn | null => {
    const s = String(v || "").toLowerCase();
    return (["wood", "fire", "earth", "metal", "water"].includes(s) ? s : null) as ElementEn | null;
  };
  const uniq = (arr: (ElementEn | null)[]) => Array.from(new Set(arr.filter(Boolean))) as ElementEn[];
  const yong = uniq(top3.slice(0, 1).map((x: any) => toEl(x?.element)));
  const xi = uniq(top3.slice(1, 3).map((x: any) => toEl(x?.element))).filter((e) => !yong.includes(e));
  const ji = (["wood", "fire", "earth", "metal", "water"] as ElementEn[]).filter((e) => !yong.includes(e) && !xi.includes(e)).slice(0, 2);
  return { yong, xi, ji };
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const facingDeg = normalizeDeg(Number(body.facing_deg ?? 180));
    const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();
    const timing = (["era", "year", "month", "day", "hour"].includes(String(body.timing)) ? body.timing : "era") as TimingKey;
    const tiguaSchool = (body.tigua_school === "full_24" ? "full_24" : "shen_13") as TiguaSchool;
    const profileId = body.profile_id ? String(body.profile_id) : null;
    const s = await getSession();
    if (!s?.orgId) {
      return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
    }
    if (profileId && !UUID_RE.test(profileId)) {
      return NextResponse.json({ ok: false, error: "Invalid profile_id" }, { status: 400 });
    }
    const pins = Array.isArray(body.pins) ? (body.pins as LuopanPinInput[]) : [];
    const pinDegs = pins.map((p) => Number(p.degree)).filter((d) => Number.isFinite(d)).map(normalizeDeg);
    const profileElements = await loadProfileElements(profileId, s.orgId);
    const houseChart = calcXuanKongChart(facingDeg, 9, tiguaSchool);
    const pinClassical = pins
      .filter((p) => Number.isFinite(Number(p.degree ?? p.bearingDeg)))
      .map((p) => {
        const result = evaluateBashaHuangQuan(facingDeg, p);
        return {
          type: p.type || null,
          category: resolvePinCategory(p),
          degree: normalizeDeg(Number(p.degree ?? p.bearingDeg)),
          mountain: result.pinMountain ? {
            code: result.pinMountain.name,
            mountain_code: result.pinMountain.code,
            trigram: result.pinMountain.trigram,
            yuan: result.pinMountain.yuan,
            yin_yang: result.pinMountain.yinYang,
          } : null,
          hits: result.hits.map((h) => ({
            code: h.code,
            severity: h.severity,
            pass: h.pass,
            applies: h.applies,
            thai: h.thai,
            zh: h.zh,
            mountain: h.mountain.name,
          })),
        };
      });

    const degrees = Array.from({ length: 360 }, (_, degree) => {
      const relativeDeg = normalizeDeg(degree + facingDeg);
      const m24 = degreeToMountain24(relativeDeg);
      const tigua = decideTigua(relativeDeg, tiguaSchool);
      const tStar = pseudoTimeStar(relativeDeg, year, timing);
      const profileWeight = profileElements ? elementScore(m24.element as ElementEn, profileElements.yong, profileElements.xi, profileElements.ji) : 0;
      const timeWeight = starScore(tStar);
      const pinWeight = pinProximityScore(relativeDeg, pinDegs);
      const finalScore = Math.max(0, Math.min(100, 50 + profileWeight + timeWeight + pinWeight));
      const evidence = [
        `L1-M24-${m24.code}`,
        `L2-SANYUAN-${m24.yuan}-${m24.yin_yang}`,
        `L2-TIGUA-${tigua.mode}`,
        profileWeight !== 0 ? `L1-PROFILE-${profileWeight > 0 ? "FAV" : "AVOID"}-${m24.element}` : "L1-PROFILE-NEUTRAL",
        `L1-TIME-STAR-${tStar}`,
        pinWeight > 0 ? `L1-PIN-PROX-${pinWeight}` : "L1-PIN-NONE",
      ];
      return {
        degree,                // 0..359 (screen/cursor)
        ring_degree: relativeDeg, // องศาบนวงหลังหัก/บวก facing
        dir8: degreeToDir8(relativeDeg),
        mountain24: m24,
        tigua: {
          mode: tigua.mode,
          trigger: tigua.trigger,
          reason_th: tigua.reasonTh,
          reason_zh: tigua.reasonZh,
          near_boundary: isNearMountainBoundary(relativeDeg, 1),
        },
        time_star: tStar,
        scoring: {
          base: 50,
          profile_weight: profileWeight,
          time_weight: timeWeight,
          pin_weight: pinWeight,
          final_score: finalScore,
          evidence,
        },
      };
    });
    const sorted = [...degrees].sort((a, b) => b.scoring.final_score - a.scoring.final_score);

    return NextResponse.json({
      ok: true,
      input: { facing_deg: facingDeg, year, timing, profile_id: profileId, pin_count: pinDegs.length },
      summary: {
        total_degrees: 360,
        schema_version: "luopan.degrees.v2-classical",
        note: "L2: ใช้ 24山/三元龍/替卦/八煞黃泉 engine กลาง · ไทยนำ จีนรอง",
        profile_elements: profileElements || null,
        classical: {
          tigua_school: tiguaSchool,
          tigua_school_th: tiguaSchoolLabel(tiguaSchool),
          facing: {
            degree: facingDeg,
            mountain: houseChart.facing.name,
            mountain_code: houseChart.facing.code,
            yuan: houseChart.facing.yuan,
            yin_yang: houseChart.facing.yinYang,
          },
          sitting: {
            mountain: houseChart.sitting.name,
            mountain_code: houseChart.sitting.code,
            yuan: houseChart.sitting.yuan,
            yin_yang: houseChart.sitting.yinYang,
          },
          xuan_kong: {
            period: houseChart.period,
            water_flight: {
              seed_star: houseChart.waterFlight.seedStar,
              center_star: houseChart.waterFlight.centerStar,
              direction: houseChart.waterFlight.direction,
              reference_mountain: houseChart.waterFlight.referenceMountain.name,
              note_th: houseChart.waterFlight.noteTh,
              note_zh: houseChart.waterFlight.noteZh,
            },
            mountain_flight: {
              seed_star: houseChart.mountainFlight.seedStar,
              center_star: houseChart.mountainFlight.centerStar,
              direction: houseChart.mountainFlight.direction,
              reference_mountain: houseChart.mountainFlight.referenceMountain.name,
              note_th: houseChart.mountainFlight.noteTh,
              note_zh: houseChart.mountainFlight.noteZh,
            },
          },
          pin_warnings: pinClassical,
        },
        top_good_degrees: sorted.slice(0, 12).map((x) => ({ degree: x.degree, score: x.scoring.final_score, m24: x.mountain24.code })),
        top_bad_degrees: sorted.slice(-12).map((x) => ({ degree: x.degree, score: x.scoring.final_score, m24: x.mountain24.code })),
      },
      degrees,
      meta: { duration_ms: Date.now() - started, generated_at: new Date().toISOString() },
    });
  } catch (e: unknown) {
    console.error("[luopan/degrees]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
