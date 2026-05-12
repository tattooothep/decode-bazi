/**
 * POST /api/chart
 * Body: { date:"YYYY-MM-DD", time:"HH:MM", longitude?:number, gender?:"M"|"F" }
 * Returns: full BaZi chart from 6 wrappers + tyme4ts
 */
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { date, time = "12:00", longitude = 100.5018, gender = "M" } = body;
  if (!date) return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });

  const [yy, mm, dd] = date.split("-").map(Number);
  const [hh, mn] = time.split(":").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  try {
    // Use shared helper (TST applied · single source of truth)
    const { calcBazi } = await import("@/lib/bazi-calc");
    const w1 = await import("../../../../data/library/wrappers/1-stem-branch-matrix.js");
    const w2 = await import("../../../../data/library/wrappers/2-hs-hhs-combo.js");
    const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
    const w5 = await import("../../../../data/library/wrappers/5-tiao-hou.js");

    const calc = await calcBazi({
      date,
      time,
      longitude: typeof longitude === "number" ? longitude : 100.5018,
      gmtOffsetHours: 7,
      gender: gender as "M" | "F" | undefined,
    });
    const natal = calc.pillars;

    const matrix     = w1.buildMatrix(natal);
    const branches   = ["year","month","day","hour"].map(p => natal[p as keyof typeof natal].branch);
    const hsHhs      = ["year","month","day","hour"].map(p => ({
      pillar: p,
      ...w2.detectHsHhsCombo(natal[p as keyof typeof natal], branches),
    }));
    const usefulGod  = w4.getUsefulGod(natal.day.stem);
    const tiaoHou    = w5.tiaoHouAnalysis(natal);

    const { buildChartExtensions } = await import("@/lib/chart-extensions");
    const ext = buildChartExtensions(natal, new Date());

    return NextResponse.json({
      input: { date, time, longitude, gender },
      pillars: natal,
      pillarsZh: calc.pillarsZh,
      lunar: calc.lunar,
      tst: calc.tst,
      analysis: {
        ge_ju: calc.geJu,
        useful_god: usefulGod,
        tiao_hou: tiaoHou,
        strength_yongshen: { strength: calc.strength, yongshenFinal: calc.yongshen, climate: { climate: calc.climate } },
        hs_hhs: hsHhs,
        matrix_summary: matrix.summary,
        element_counts: ext.element_counts,
        ten_gods_map: ext.ten_gods_map,
        qi_phases: ext.qi_phases,
        interactions: ext.interactions,
        punishments: ext.punishments,
        combinations: ext.combinations,
        jishen: ext.jishen,
        today_overlay: ext.today_overlay,
      },
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
