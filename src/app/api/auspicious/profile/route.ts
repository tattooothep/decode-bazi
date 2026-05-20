/**
 * POST /api/auspicious/profile · บันทึกโปรไฟล์ลูกค้า + คำนวณ pillars
 * Body: { personId: string, birthDate: 'YYYY-MM-DD', birthTime: 'HH:MM', longitude?: number, gender?: 'M'|'F' }
 *
 * เก็บลง aj_user_profiles · ใช้ใน /api/auspicious lazy compute (ba_zi/yong_shen/hex64)
 */
import { NextRequest, NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { calcBazi } from "@/lib/bazi-calc";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { personId, birthDate, birthTime = "12:00", longitude = 100.5018, gender = "M" } = body;
    if (!personId || !birthDate) return NextResponse.json({ error: "personId + birthDate required" }, { status: 400 });

    const c = await calcBazi({
      date: birthDate, time: birthTime, longitude, gmtOffsetHours: 7,
      gender: gender as "M" | "F", dayBoundary: "23:00",
    });

    const ys = (c.yongshen || []).map(y => y.element).filter(Boolean) as string[];
    const ELEMENT_TO_BRANCH: Record<string, string> = { wood:"寅", fire:"巳", earth:"辰", metal:"申", water:"亥" };
    const yongBranches = ys.map(e => ELEMENT_TO_BRANCH[e]).filter(Boolean);
    const jiBranches: string[] = []; // เริ่มต้นว่าง · เพิ่มทีหลัง

    await q(`
      INSERT INTO aj_user_profiles
        (person_id, birth_datetime, birth_timezone, year_pillar, month_pillar, day_pillar, hour_pillar,
         day_master, zodiac, yong_shen, ji_shen, ge_ju, current_dayun)
      VALUES ($1, $2::timestamptz, 'Asia/Bangkok', $3, $4, $5, $6, $7, $8, $9::char(2)[], $10::char(2)[], $11, $12)
      ON CONFLICT (person_id) DO UPDATE SET
        birth_datetime=EXCLUDED.birth_datetime, year_pillar=EXCLUDED.year_pillar,
        month_pillar=EXCLUDED.month_pillar, day_pillar=EXCLUDED.day_pillar, hour_pillar=EXCLUDED.hour_pillar,
        day_master=EXCLUDED.day_master, zodiac=EXCLUDED.zodiac,
        yong_shen=EXCLUDED.yong_shen, ji_shen=EXCLUDED.ji_shen,
        ge_ju=EXCLUDED.ge_ju, current_dayun=EXCLUDED.current_dayun,
        updated_at=NOW()
    `, [
      personId, `${birthDate}T${birthTime}:00+07:00`,
      c.pillarsZh.year, c.pillarsZh.month, c.pillarsZh.day, c.pillarsZh.hour,
      c.pillars.day.stem, c.pillars.year.branch,
      yongBranches, jiBranches,
      c.geJu?.structure || null, null,
    ]);

    // Invalidate personal cache สำหรับคนนี้ (เผื่อ profile เปลี่ยน)
    await q(`DELETE FROM aj_personal_cache WHERE person_id=$1`, [personId]);

    return NextResponse.json({
      ok: true, personId,
      pillars: c.pillarsZh, dayMaster: c.pillars.day.stem, zodiac: c.pillars.year.branch,
      yongShen: ys, yongBranches,
    });
  } catch (e: unknown) {
    console.error("[/api/auspicious/profile]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
