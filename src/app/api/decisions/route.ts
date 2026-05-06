/**
 * POST /api/decisions
 * Body: {
 *   natal_date: "YYYY-MM-DD",
 *   natal_time: "HH:MM",
 *   target_date: "YYYY-MM-DD",     // เมื่อไหร่จะตัดสินใจ
 *   target_time?: "HH:MM",
 *   question?: string,
 *   gender?: "M"|"F"
 * }
 * Returns: cross-layer interaction analysis (Da Yun + Liu Nian/Yue/Ri/Shi)
 */
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { natal_date, natal_time = "12:00", target_date, target_time = "12:00", question = "" } = body;
  if (!natal_date || !target_date)
    return NextResponse.json({ error: "natal_date + target_date required" }, { status: 400 });

  try {
    // Use shared helper · TST applied for both natal and transit
    const { calcBazi } = await import("@/lib/bazi-calc");
    const tyme = await import("tyme4ts");
    const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
    const w5 = await import("../../../../data/library/wrappers/5-tiao-hou.js");
    const w6 = await import("../../../../data/library/wrappers/6-strength-yongshen.js");
    // interaction detector v8
    const det = await import("../../../../data/sesheta-v8/decode-interaction-detector.js" as string).catch(() => null);

    // Calc natal (TST)
    const natalCalc = await calcBazi({ date: natal_date, time: natal_time, longitude: 100.5018, gmtOffsetHours: 7 });
    const natal = natalCalc.pillars;
    const yp = natalCalc.pillarsZh.year;
    const mp = natalCalc.pillarsZh.month;
    const dp = natalCalc.pillarsZh.day;
    const hp = natalCalc.pillarsZh.hour;
    void yp; void mp; void dp; void hp; // keep for downstream

    // Calc transits at target (TST too)
    const targetCalc = await calcBazi({ date: target_date, time: target_time, longitude: 100.5018, gmtOffsetHours: 7 });
    const tEc = {
      getYear: () => ({ getName: () => targetCalc.pillarsZh.year }),
      getMonth: () => ({ getName: () => targetCalc.pillarsZh.month }),
      getDay: () => ({ getName: () => targetCalc.pillarsZh.day }),
      getHour: () => ({ getName: () => targetCalc.pillarsZh.hour }),
    };
    const [ny, nm] = [parseInt(natal_date.split("-")[0]), 0];
    const ty = parseInt(target_date.split("-")[0]);
    void nm; void tyme;
    const tyP = tEc.getYear().getName();
    const tmP = tEc.getMonth().getName();
    const tdP = tEc.getDay().getName();
    const thP = tEc.getHour().getName();
    // Da Yun (10-year): rough — use natal year stem direction · เริ่มที่ next solar term หลังเกิด
    // ใช้ approximation: ใส่ year pillar จากปีเกิด+age modulo
    const age = ty - ny;
    const luckIdx = Math.floor(age / 10);
    const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
    const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
    const monthStemIdx = STEMS.indexOf(natal.month.stem);
    const monthBranchIdx = BRANCHES.indexOf(natal.month.branch);
    const yangStem = ["甲","丙","戊","庚","壬"].includes(natal.year.stem);
    const dir = yangStem ? 1 : -1; // simplified: yang → forward, yin → backward
    const dyStemIdx = ((monthStemIdx + dir * (luckIdx + 1)) % 10 + 10) % 10;
    const dyBranchIdx = ((monthBranchIdx + dir * (luckIdx + 1)) % 12 + 12) % 12;
    const da_yun = { stem: STEMS[dyStemIdx], branch: BRANCHES[dyBranchIdx] };

    const transits = {
      da_yun,
      liu_nian: { stem: tyP[0], branch: tyP[1] },
      liu_yue:  { stem: tmP[0], branch: tmP[1] },
      liu_ri:   { stem: tdP[0], branch: tdP[1] },
      liu_shi:  { stem: thP[0], branch: thP[1] },
    };

    // Run yongshen for opts
    const yongResult = w6.bridgeYongshen(natal);
    const ug = w4.getUsefulGod(natal.day.stem);
    const climate = w5.tiaoHouAnalysis(natal);
    const usefulGodElements = [...new Set(ug.ranks.slice(0,3).map((r: { element: string }) => r.element))];
    const opts = {
      dmElement: ({甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'} as Record<string,string>)[natal.day.stem],
      usefulGodElements,
      unfavorableElements: [],
      rootStrength: yongResult.strength.percent,
    };

    // Run interaction detector if available
    let interactions = null;
    if (det && det.detectInteractions) {
      interactions = det.detectInteractions(natal, transits, opts);
    }

    return NextResponse.json({
      input: { natal_date, natal_time, target_date, target_time, question },
      natal,
      transits,
      strength: yongResult.strength,
      yongshen: yongResult.yongshenFinal,
      climate,
      interactions,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
