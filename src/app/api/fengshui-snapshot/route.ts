/**
 * GET /api/fengshui-snapshot?house_id=N&datetime=ISO
 * Aggregate ฮวงจุ้ย ทุก layer · 9 palaces + 24 山 + 挨星 + 八宅 + 64 卦
 * Source: อาเจ๊กฮ้ง compass_3 · port → Next.js 17 พ.ค. 2026
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";

const FLYING_ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const PALACE_DIRS_GRID = ['SE','S','SW','E','C','W','NE','N','NW'];

const STAR_INFO: Record<number, { color: string; quality: string; meaning: string }> = {
  1: { color:'白', quality:'good',    meaning:'อำนาจ · ปัญญา · ตำแหน่ง' },
  2: { color:'黒', quality:'bad',     meaning:'โรค · ห่วย · ระวัง' },
  3: { color:'碧', quality:'neutral', meaning:'โต้แย้ง · ฟ้องร้อง' },
  4: { color:'綠', quality:'neutral', meaning:'การเรียน · เสน่ห์' },
  5: { color:'黄', quality:'bad',     meaning:'หายนะ · ภัยพิบัติ' },
  6: { color:'白', quality:'good',    meaning:'ราชการ · อำนาจ' },
  7: { color:'赤', quality:'neutral', meaning:'การเงิน(เก่า) · ขโมย(ใหม่)' },
  8: { color:'白', quality:'good',    meaning:'การเงิน(ปัจจุบัน) · มั่งคั่ง' },
  9: { color:'紫', quality:'good',    meaning:'ชื่อเสียง · ความรัก' },
};

const KUA_GOOD: Record<number, Record<string, string>> = {
  1:{sheng:'SE',tian:'E',yan:'S',fu:'N'},  2:{sheng:'NE',tian:'W',yan:'NW',fu:'SW'},
  3:{sheng:'S',tian:'N',yan:'SE',fu:'E'},  4:{sheng:'N',tian:'S',yan:'E',fu:'SE'},
  6:{sheng:'W',tian:'NE',yan:'SW',fu:'NW'},7:{sheng:'NW',tian:'SW',yan:'NE',fu:'W'},
  8:{sheng:'SW',tian:'NW',yan:'W',fu:'NE'},9:{sheng:'E',tian:'SE',yan:'N',fu:'S'},
};
const KUA_BAD: Record<number, Record<string, string>> = {
  1:{jue:'SW',liu:'NE',wu:'NW',huo:'W'},2:{jue:'N',liu:'S',wu:'SE',huo:'E'},
  3:{jue:'W',liu:'NW',wu:'NE',huo:'SW'},4:{jue:'NE',liu:'SW',wu:'W',huo:'NW'},
  6:{jue:'S',liu:'N',wu:'E',huo:'SE'},7:{jue:'E',liu:'SE',wu:'S',huo:'N'},
  8:{jue:'SE',liu:'E',wu:'N',huo:'S'},9:{jue:'NW',liu:'W',wu:'SW',huo:'NE'},
};
const SAN_SHA: Record<string,string> = {'申':'S','子':'S','辰':'S','寅':'N','午':'N','戌':'N','巳':'E','酉':'E','丑':'E','亥':'W','卯':'W','未':'W'};
const TAISUI: Record<string,string> = {'子':'N','丑':'NE','寅':'NE','卯':'E','辰':'SE','巳':'SE','午':'S','未':'SW','申':'SW','酉':'W','戌':'NW','亥':'NW'};
const MOUNTAINS = ['壬','子','癸','丑','艮','寅','甲','卯','乙','辰','巽','巳','丙','午','丁','未','坤','申','庚','酉','辛','戌','乾','亥'];

function getCurrentPeriod(d: Date): number {
  const y = d.getFullYear();
  if (y >= 2024 && y < 2044) return 9;
  if (y >= 2004 && y < 2024) return 8;
  if (y >= 1984 && y < 2004) return 7;
  return 9;
}
function getAnnualCenter(year: number): number {
  const off = year - 2024;
  let c = (3 - off) % 9;
  if (c <= 0) c += 9;
  return c;
}
function computePalaceStars(annualCenter: number) {
  const offset = annualCenter - 5;
  const result: Record<string, any> = {};
  PALACE_DIRS_GRID.forEach((dir, i) => {
    let star = FLYING_ORDER[i] + offset;
    if (star > 9) star -= 9;
    if (star < 1) star += 9;
    result[dir] = { annual: star, ...STAR_INFO[star] };
  });
  return result;
}
function build24Mountains(faceAngle?: number) {
  let facing: string | null = null, sitting: string | null = null;
  if (faceAngle !== undefined && faceAngle !== null) {
    const idx = Math.floor(((faceAngle + 7.5) % 360) / 15);
    facing = MOUNTAINS[idx];
    const sitIdx = Math.floor((((faceAngle + 180) + 7.5) % 360) / 15);
    sitting = MOUNTAINS[sitIdx];
  }
  return { mountains: MOUNTAINS, facing, sitting, face_angle: faceAngle ?? null };
}
function computeAiXing(faceAngle?: number, period = 9) {
  if (faceAngle === undefined || faceAngle === null) return null;
  const mountainStar = (Math.floor(faceAngle / 15) % 9) + 1;
  const waterStar = (Math.floor(((faceAngle + 180) % 360) / 15) % 9) + 1;
  return { mountain_star: mountainStar, water_star: waterStar, period_star: period,
           note: 'Yang Gong · simplified · ใช้ data file สำหรับ exact pattern' };
}
function computeQiMenFallback(dt: Date) {
  const GATES = ['休','生','傷','杜','景','死','驚','開'];
  const DIRS = ['N','NE','E','SE','S','SW','W','NW'];
  const m: Record<string,string> = {};
  DIRS.forEach((dir, i) => { m[dir] = GATES[(i + Math.floor(dt.getHours()/2)) % 8]; });
  return { palace_gates: m, note: 'simplified fallback' };
}
function buildBaZhai(members: any[]) {
  return (members || []).map(p => {
    const good = KUA_GOOD[p.kua], bad = KUA_BAD[p.kua];
    if (!good || !bad) return null;
    return { person_id: p.person_id, name: p.name, kua: p.kua,
      good: { sheng_qi: good.sheng, tian_yi: good.tian, yan_nian: good.yan, fu_wei: good.fu },
      bad:  { jue_ming: bad.jue, liu_sha: bad.liu, wu_gui: bad.wu, huo_hai: bad.huo },
    };
  }).filter(Boolean);
}
function computeSixtyFour(faceAngle?: number) {
  if (faceAngle === undefined || faceAngle === null) return null;
  return { facing_hex: Math.floor(faceAngle / 5.625) + 1 };
}
function buildWarnings(stars: any, yearBranch: string) {
  const w: any[] = [];
  for (const dir of Object.keys(stars)) {
    if (stars[dir]?.annual === 5)
      w.push({ code:`WU_HUANG_${dir}`, severity:'critical', text:`5 黄 อยู่ทิศ ${dir} · ห้ามรบกวน · วางโลหะ/นาฬิกาทอง`, dirs:[dir] });
    if (stars[dir]?.annual === 2)
      w.push({ code:`ER_HEI_${dir}`, severity:'warning', text:`2 黒 อยู่ทิศ ${dir} · ระวังสุขภาพ · เลี่ยงเตียง/โต๊ะ`, dirs:[dir] });
  }
  const ts = TAISUI[yearBranch];
  if (ts) w.push({ code:'TAISUI', severity:'critical', text:`ไท่ซุ่ย ${ts} · ห้ามขุด/ตอก/รบกวนทิศนี้`, dirs:[ts] });
  const ss = SAN_SHA[yearBranch];
  if (ss) w.push({ code:'SAN_SHA', severity:'critical', text:`3 ชะ ${ss} · ห้ามนั่งหันหน้าใส่`, dirs:[ss] });
  return w;
}
function buildRecsPerPerson(members: any[], stars: any) {
  return (members || []).map(p => {
    const g = KUA_GOOD[p.kua]; if (!g) return null;
    const recs: string[] = [];
    const shengStar = stars[g.sheng]?.annual;
    if (shengStar && [1,6,8,9].includes(shengStar))
      recs.push(`ทิศ ${g.sheng} = 生氣 + ดาว ${shengStar} ดี · เหมาะนั่งทำงาน/ห้องนอน`);
    else if (shengStar === 5 || shengStar === 2)
      recs.push(`ทิศ ${g.sheng} = 生氣 แต่ดาว ${shengStar} ร้าย · ปีนี้เลี่ยง`);
    else recs.push(`ทิศ ${g.sheng} = 生氣 ของคุณ · ปลอดภัย`);
    return { person_id: p.person_id, name: p.name, kua: p.kua, best_direction: g.sheng, recommendations: recs };
  }).filter(Boolean);
}
function fiveElementOfHour(hp?: string) {
  if (!hp) return null;
  const E: Record<string,string> = {'甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水'};
  return E[hp[0]] || null;
}
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
function getYearBranchFallback(d: Date): string {
  return BRANCHES[((d.getFullYear() - 4) % 12 + 12) % 12];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const houseId = searchParams.get('house_id') ? parseInt(searchParams.get('house_id')!, 10) : null;
    const dt = searchParams.get('datetime') ? new Date(searchParams.get('datetime')!) : new Date();

    // load house (จาก ka_houses ของ Phase C2)
    let house: any = null;
    if (houseId) {
      house = await q1<any>(`SELECT id, name, lat, lng, face_angle, sit_angle, facing_mountain, facing_direction, family_members FROM ka_houses WHERE id=$1`, [houseId]);
    }
    // load ephemeris (จาก aj_ephemeris_cache ของ datepick)
    const ephemeris = await q1<any>(
      `SELECT * FROM aj_ephemeris_cache WHERE datetime_start <= $1::timestamptz AND datetime_end > $1::timestamptz LIMIT 1`,
      [dt.toISOString()]
    );

    const period = getCurrentPeriod(dt);
    const annualCenter = getAnnualCenter(dt.getFullYear());
    const palaceStars = computePalaceStars(annualCenter);
    const yearBranch = ephemeris?.year_pillar?.charAt(1) || getYearBranchFallback(dt);

    const faceAngle = house?.face_angle ? parseFloat(house.face_angle) : undefined;

    const layers = {
      flying_stars: { period, annual_center: annualCenter, palaces: palaceStars },
      twenty_four: build24Mountains(faceAngle),
      ai_xing: computeAiXing(faceAngle, period),
      qi_men: ephemeris?.qi_men || computeQiMenFallback(dt),
      ba_zhai: house?.family_members?.length ? buildBaZhai(house.family_members) : null,
      sixty_four: computeSixtyFour(faceAngle),
    };

    const today = {
      twelve_spirits: ephemeris?.twelve_spirits || null,
      twenty_eight: ephemeris?.twenty_eight || null,
      twelve_officers: ephemeris?.twelve_officers || null,
      five_element: fiveElementOfHour(ephemeris?.hour_pillar),
    };

    const warnings = buildWarnings(palaceStars, yearBranch);
    const recommendations = house?.family_members ? buildRecsPerPerson(house.family_members, palaceStars) : [];

    return NextResponse.json({
      house,
      datetime: {
        gregorian: dt.toISOString(),
        year_pillar: ephemeris?.year_pillar,
        month_pillar: ephemeris?.month_pillar,
        day_pillar: ephemeris?.day_pillar,
        hour_pillar: ephemeris?.hour_pillar,
        solar_term: ephemeris?.solar_term,
        shichen: ephemeris?.shichen,
      },
      layers, today, warnings, recommendations,
      source: 'อาเจ๊กฮ้ง compass 3 · 沈氏玄空 + 八宅 + 24山',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
