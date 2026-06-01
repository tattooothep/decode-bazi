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

type TimingKey = "era" | "year" | "month" | "day" | "hour";
type Dir8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";

const MOUNTAINS_24 = [
  { c: "壬", t: "干", el: "water", grp: "坎" }, { c: "子", t: "支", el: "water", grp: "坎" }, { c: "癸", t: "干", el: "water", grp: "坎" },
  { c: "丑", t: "支", el: "earth", grp: "艮" }, { c: "艮", t: "卦", el: "earth", grp: "艮" }, { c: "寅", t: "支", el: "wood",  grp: "艮" },
  { c: "甲", t: "干", el: "wood",  grp: "震" }, { c: "卯", t: "支", el: "wood",  grp: "震" }, { c: "乙", t: "干", el: "wood",  grp: "震" },
  { c: "辰", t: "支", el: "earth", grp: "巽" }, { c: "巽", t: "卦", el: "wood",  grp: "巽" }, { c: "巳", t: "支", el: "fire",  grp: "巽" },
  { c: "丙", t: "干", el: "fire",  grp: "離" }, { c: "午", t: "支", el: "fire",  grp: "離" }, { c: "丁", t: "干", el: "fire",  grp: "離" },
  { c: "未", t: "支", el: "earth", grp: "坤" }, { c: "坤", t: "卦", el: "earth", grp: "坤" }, { c: "申", t: "支", el: "metal", grp: "坤" },
  { c: "庚", t: "干", el: "metal", grp: "兌" }, { c: "酉", t: "支", el: "metal", grp: "兌" }, { c: "辛", t: "干", el: "metal", grp: "兌" },
  { c: "戌", t: "支", el: "earth", grp: "乾" }, { c: "乾", t: "卦", el: "metal", grp: "乾" }, { c: "亥", t: "支", el: "water", grp: "乾" },
] as const;

function normalizeDeg(v: number): number {
  return ((v % 360) + 360) % 360;
}

function degreeToDir8(deg: number): Dir8 {
  const d = normalizeDeg(deg);
  if (d >= 337.5 || d < 22.5) return "N";
  if (d < 67.5) return "NE";
  if (d < 112.5) return "E";
  if (d < 157.5) return "SE";
  if (d < 202.5) return "S";
  if (d < 247.5) return "SW";
  if (d < 292.5) return "W";
  return "NW";
}

function degreeToMountain24(deg: number) {
  const d = normalizeDeg(deg);
  const idx = Math.floor(((d + 7.5) % 360) / 15) % 24;
  const m = MOUNTAINS_24[idx];
  const startDeg = normalizeDeg(idx * 15 - 7.5);
  const endDeg = normalizeDeg(startDeg + 15);
  return {
    index: idx,
    code: m.c,
    type: m.t,
    element: m.el,
    trigram: m.grp,
    range: { start_deg: startDeg, end_deg: endDeg },
  };
}

function pseudoTimeStar(deg: number, year: number, timing: TimingKey): number {
  const seed = year + (timing === "era" ? 0 : timing === "year" ? 7 : timing === "month" ? 13 : timing === "day" ? 19 : 23);
  return ((Math.floor(deg / 45) + seed) % 9) + 1;
}

function elementScore(el: ElementEN, yong: ElementEN[], xi: ElementEN[], ji: ElementEN[]): number {
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

async function loadProfileElements(profileId: string | null, orgId: string | null): Promise<{ yong: ElementEN[]; xi: ElementEN[]; ji: ElementEN[] } | null> {
  if (!profileId || !orgId) return null;  // 1 มิ.ย. ปิด IDOR: ต้องมี org + เป็นเจ้าของ (เดิมดึง用神ดวงคนอื่นได้)
  const row = await q1<{ yongshen: any }>("SELECT yongshen FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false", [profileId, orgId]);
  if (!row?.yongshen) return null;
  const top3 = Array.isArray(row.yongshen?.top3) ? row.yongshen.top3 : [];
  const toEl = (v: unknown): ElementEN | null => {
    const s = String(v || "").toLowerCase();
    return (["wood", "fire", "earth", "metal", "water"].includes(s) ? s : null) as ElementEN | null;
  };
  const uniq = (arr: (ElementEN | null)[]) => Array.from(new Set(arr.filter(Boolean))) as ElementEN[];
  const yong = uniq(top3.slice(0, 1).map((x: any) => toEl(x?.element)));
  const xi = uniq(top3.slice(1, 3).map((x: any) => toEl(x?.element))).filter((e) => !yong.includes(e));
  const ji = (["wood", "fire", "earth", "metal", "water"] as ElementEN[]).filter((e) => !yong.includes(e) && !xi.includes(e)).slice(0, 2);
  return { yong, xi, ji };
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const facingDeg = normalizeDeg(Number(body.facing_deg ?? 180));
    const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();
    const timing = (["era", "year", "month", "day", "hour"].includes(String(body.timing)) ? body.timing : "era") as TimingKey;
    const profileId = body.profile_id ? String(body.profile_id) : null;
    const pins = Array.isArray(body.pins) ? (body.pins as Array<{ degree?: number }>) : [];
    const pinDegs = pins.map((p) => Number(p.degree)).filter((d) => Number.isFinite(d)).map(normalizeDeg);
    const s = await getSession();
    const profileElements = await loadProfileElements(profileId, s?.orgId ?? null);

    const degrees = Array.from({ length: 360 }, (_, degree) => {
      const relativeDeg = normalizeDeg(degree + facingDeg);
      const m24 = degreeToMountain24(relativeDeg);
      const tStar = pseudoTimeStar(relativeDeg, year, timing);
      const profileWeight = profileElements ? elementScore(m24.element as ElementEN, profileElements.yong, profileElements.xi, profileElements.ji) : 0;
      const timeWeight = starScore(tStar);
      const pinWeight = pinProximityScore(relativeDeg, pinDegs);
      const finalScore = Math.max(0, Math.min(100, 50 + profileWeight + timeWeight + pinWeight));
      const evidence = [
        `L1-M24-${m24.code}`,
        profileWeight !== 0 ? `L1-PROFILE-${profileWeight > 0 ? "FAV" : "AVOID"}-${m24.element}` : "L1-PROFILE-NEUTRAL",
        `L1-TIME-STAR-${tStar}`,
        pinWeight > 0 ? `L1-PIN-PROX-${pinWeight}` : "L1-PIN-NONE",
      ];
      return {
        degree,                // 0..359 (screen/cursor)
        ring_degree: relativeDeg, // องศาบนวงหลังหัก/บวก facing
        dir8: degreeToDir8(relativeDeg),
        mountain24: m24,
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
        schema_version: "luopan.degrees.v1-l1",
        note: "L1: เพิ่ม profile/pin/time scoring + evidence ต่อองศา พร้อมใช้กับ AI advice",
        profile_elements: profileElements || null,
        top_good_degrees: sorted.slice(0, 12).map((x) => ({ degree: x.degree, score: x.scoring.final_score, m24: x.mountain24.code })),
        top_bad_degrees: sorted.slice(-12).map((x) => ({ degree: x.degree, score: x.scoring.final_score, m24: x.mountain24.code })),
      },
      degrees,
      meta: { duration_ms: Date.now() - started, generated_at: new Date().toISOString() },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
