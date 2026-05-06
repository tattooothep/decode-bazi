/**
 * GET /api/today?date=YYYY-MM-DD&dm=己
 * Returns: today's pillar + Tongshu (黃曆) from tyme4ts
 *  + verdict score for given DM (optional)
 */
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const dm = url.searchParams.get("dm");
  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  try {
    // /api/today ใช้เวลา 12:00 ของวันนั้น เพื่อหา day pillar (ไม่จำเป็นต้อง TST · day pillar เปลี่ยนที่เที่ยงคืน)
    const tyme = await import("tyme4ts");
    const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
    const lh = st.getLunarHour();
    const ld = lh.getLunarDay();
    const ec = lh.getEightChar();

    const dayPillar = ec.getDay().getName();
    const monthPillar = ec.getMonth().getName();
    const yearPillar = ec.getYear().getName();

    const tongshu = {
      lunar: ld.toString(),
      day_officer: ld.getDuty().getName(),
      twelve_star: ld.getTwelveStar().getName(),
      nine_star: ld.getNineStar().getName(),
      twentyeight_star: ld.getTwentyEightStar().getName(),
      yi: ld.getRecommends().slice(0, 8).map((x: { getName(): string }) => x.getName()),
      ji: ld.getAvoids().slice(0, 8).map((x: { getName(): string }) => x.getName()),
      gods: ld.getGods().slice(0, 12).map((g: { getName(): string }) => g.getName()),
    };

    let verdict = null;
    if (dm) {
      // Score logic — simple alignment
      const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
      const ug = w4.getUsefulGod(dm) as { summary?: { friendlyElements: string[] } };
      const dayStem = dayPillar[0];
      const dayElement = ({甲:'wood',乙:'wood',丙:'fire',丁:'fire',戊:'earth',己:'earth',庚:'metal',辛:'metal',壬:'water',癸:'water'} as Record<string,string>)[dayStem];
      const friendly = ug.summary?.friendlyElements || [];
      const aligned = friendly.includes(dayElement);
      const score = aligned ? 78 : 52;
      verdict = {
        score,
        label: score >= 80 ? "EXCELLENT" : score >= 65 ? "GOOD" : score >= 50 ? "OK" : score >= 35 ? "CAUTION" : "AVOID",
        action_mode: score >= 80 ? "L1" : score >= 65 ? "L2" : score >= 50 ? "L3" : score >= 35 ? "L4" : "L5",
        aligned,
        day_element: dayElement,
        friendly_elements: friendly,
      };
    }

    return NextResponse.json({
      date,
      pillars: { year: yearPillar, month: monthPillar, day: dayPillar },
      tongshu,
      verdict,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
