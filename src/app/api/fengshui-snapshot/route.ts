/**
 * GET /api/fengshui-snapshot?house_id=N&datetime=ISO
 * Aggregate ฮวงจุ้ย ทุก layer · 9 palaces + 24 山 + 挨星 + 八宅 + 64 卦
 * Source: อาเจ๊กฮ้ง compass_3 · port → Next.js 17 พ.ค. 2026
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { readFileSync } from "fs";
import { join } from "path";
import { computeFlyingLayers } from "@/lib/fengshui-luxing";

// ── โหลดฐานข้อมูล玄空飛星ยุค 9 (อ่านครั้งเดียว · cache module-level) ──
type XKMountain = {
  id: string; mountain_name_zh: string; mountain_pinyin: string; gua: string;
  compass_code: string; degrees_range_min: number; degrees_range_max: number;
  facing_mountain: string; chart_type: string; chart_type_en: string;
  score: number; note_en: string; note_th: string; special_flag: string | null;
};
type XKValuation = {
  star_number: number; color_zh: string; element: string; status_zh: string;
  status_en: string; score: number; label_en: string; label_th: string;
  classical_justification: string;
};
type XKAnnual = {
  year: number; pillar: string; zodiac: string; centre_star: number;
  wuhuang_direction: string; erhei_direction: string; sansha_direction: string;
  taisui_direction: string; suipo_direction: string; year_start?: string;
  critical_flag?: string; note?: string;
};
type XKPair = {
  id: string; mountain_star: number; water_star: number; score: number;
  nature: string; is_fire_pair: boolean; classical_zh: string;
  interpretation_en: string; interpretation_th: string;
  remedy_element: string; remedy_th: string; period9_modifier: string;
};
type XKData = {
  metadata: { period: number; period_start: string; period_end: string; year_boundary_rule: string };
  star_pairs_81: XKPair[];
  mountains_24_p9: XKMountain[];
  star_valuations_p9: XKValuation[];
  annual_wuhuang_erhei: XKAnnual[];
};
let XK_CACHE: XKData | null = null;
function getXK(): XKData | null {
  if (XK_CACHE) return XK_CACHE;
  try {
    const raw = readFileSync(join(process.cwd(), "data/library/xuankong-period9.json"), "utf8");
    XK_CACHE = JSON.parse(raw) as XKData;
  } catch {
    XK_CACHE = null;
  }
  return XK_CACHE;
}
// valuation map: star_number → valuation (จาก star_valuations_p9)
function getValuationMap(xk: XKData | null): Record<number, XKValuation> {
  const m: Record<number, XKValuation> = {};
  (xk?.star_valuations_p9 || []).forEach(v => { m[v.star_number] = v; });
  return m;
}

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

// ── A. ปีฮวงจุ้ย (年柱) เปลี่ยนที่ 立春 ไม่ใช่ 1 ม.ค. ──
// ยุค 9 เริ่ม 4 ก.พ. 2024 16:27 (+08:00 = ICT 15:27) ตาม metadata.period_start
// JSON มี year_start เฉพาะปี 2024 · ปีอื่นใช้ค่าประมาณ 立春 ≈ 4 ก.พ.
function getFengShuiYear(d: Date, xk: XKData | null): number {
  const calYear = d.getFullYear();
  // หา year_start ของปีปฏิทินนี้จาก table (มีเฉพาะ 2024) ไม่งั้น fallback 4 ก.พ.
  const row = (xk?.annual_wuhuang_erhei || []).find(r => r.year === calYear && r.year_start);
  let lichun: Date;
  if (row?.year_start) {
    lichun = new Date(row.year_start);
  } else {
    // ค่าประมาณ 立春 = 4 ก.พ. เวลา 16:27 ICT ของปีนั้น (UTC = 09:27)
    lichun = new Date(Date.UTC(calYear, 1, 4, 9, 27, 0));
  }
  // ก่อน 立春 = ยังนับเป็นปีฮวงจุ้ยก่อนหน้า
  return d.getTime() < lichun.getTime() ? calYear - 1 : calYear;
}
function getCurrentPeriod(d: Date, xk: XKData | null): number {
  // ยุค 9 = ตั้งแต่ period_start (4 ก.พ. 2024) ถึง period_end (4 ก.พ. 2044)
  const meta = xk?.metadata;
  if (meta?.period_start && meta?.period_end) {
    const t = d.getTime();
    const start = new Date(meta.period_start).getTime();
    const end = new Date(meta.period_end).getTime();
    if (t >= start && t < end) return 9;
    if (t < start) return 8; // ก่อน 立春 2024 = ยังเป็นยุค 8
  }
  // fallback (กรณี JSON หาย) — ใช้ปีฮวงจุ้ยตาม 立春
  const y = getFengShuiYear(d, xk);
  if (y >= 2024 && y < 2044) return 9;
  if (y >= 2004 && y < 2024) return 8;
  if (y >= 1984 && y < 2004) return 7;
  return 9;
}
// ดาวกลางผังประจำปี — lookup centre_star จาก JSON ก่อน · ไม่มีค่อย fallback สูตร
function getAnnualCenter(year: number, xk: XKData | null): { center: number; from_json: boolean } {
  const row = (xk?.annual_wuhuang_erhei || []).find(r => r.year === year);
  if (row && typeof row.centre_star === "number") return { center: row.centre_star, from_json: true };
  const off = year - 2024;
  let c = (3 - off) % 9;
  if (c <= 0) c += 9;
  return { center: c, from_json: false };
}
// ── B. ผูกค่าดาวยุค 9 (valuation) ต่อ palace จาก star_valuations_p9 ──
function computePalaceStars(annualCenter: number, xk: XKData | null) {
  const offset = annualCenter - 5;
  const valMap = getValuationMap(xk);
  const result: Record<string, any> = {};
  PALACE_DIRS_GRID.forEach((dir, i) => {
    let star = FLYING_ORDER[i] + offset;
    if (star > 9) star -= 9;
    if (star < 1) star += 9;
    const cell: Record<string, any> = { annual: star, ...STAR_INFO[star] };
    const v = valMap[star];
    if (v) {
      // field ใหม่จาก p9 valuation (ห้ามลบ field เดิม)
      cell.p9_status = v.status_en;
      cell.p9_status_zh = v.status_zh;
      cell.p9_score = v.score;
      cell.p9_label_th = v.label_th;
      cell.p9_label_en = v.label_en;
      cell.p9_element = v.element;
      // quality ตามตำรายุค 9 (score≥3.5=ดี · ≤1.5=ร้าย · กลาง=neutral)
      cell.quality = v.score >= 3.5 ? "good" : v.score <= 1.5 ? "bad" : "neutral";
    }
    result[dir] = cell;
  });
  return result;
}
// 24 ภูเขา · ภูเขาที่ idx 0 (壬) ครอบ 337.5–352.5° ดังนั้น 0°=子 (กลางเหนือ)
// สูตรถูก: ภูเขา i ครอบ [337.5 + i*15, +15) → idx = floor(((angle - 337.5 + 360) % 360) / 15)
// (เดิมใช้ +7.5 ทำให้ map เพี้ยนครึ่งช่วง · 0°→壬 ผิด)
function mountainIdxOf(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.floor((((a - 337.5) % 360 + 360) % 360) / 15) % 24;
}
function build24Mountains(faceAngle?: number) {
  let facing: string | null = null, sitting: string | null = null;
  if (faceAngle !== undefined && faceAngle !== null) {
    facing = MOUNTAINS[mountainIdxOf(faceAngle)];
    sitting = MOUNTAINS[mountainIdxOf(faceAngle + 180)];
  }
  return { mountains: MOUNTAINS, facing, sitting, face_angle: faceAngle ?? null };
}
// ── C. lookup 24 ภูเขา (ผัง玄空ตามด้านนั่ง) จาก mountains_24_p9 ──
// ผัง玄空ตั้งชื่อตามภูเขาด้าน "นั่ง" (sitting) เช่น หันหน้า 午 = นั่ง 子 → ใช้ผังของ 子
function findMountainByAngle(angle: number, xk: XKData | null): XKMountain | null {
  const list = xk?.mountains_24_p9 || [];
  const a = ((angle % 360) + 360) % 360;
  for (const m of list) {
    const lo = m.degrees_range_min, hi = m.degrees_range_max;
    if (lo < hi) { if (a >= lo && a < hi) return m; }
    else { if (a >= lo || a < hi) return m; } // ช่วงคร่อม 0° (เช่น 子 352.5–7.5)
  }
  return null;
}
function computeAiXing(faceAngle: number | undefined, period: number, xk: XKData | null) {
  if (faceAngle === undefined || faceAngle === null) return null;
  // ดาวภูเขา/ดาวน้ำ — JSON ไม่มีเลขต่อภูเขา จึงคงสูตรเดิมไว้ (ค่าประมาณ)
  const mountainStar = (Math.floor(faceAngle / 15) % 9) + 1;
  const waterStar = (Math.floor(((faceAngle + 180) % 360) / 15) % 9) + 1;
  const sitAngle = (faceAngle + 180) % 360;
  const mt = findMountainByAngle(sitAngle, xk); // ผังตามภูเขาด้านนั่ง
  const out: Record<string, any> = {
    // field เดิม (ห้ามลบ)
    mountain_star: mountainStar,
    water_star: waterStar,
    period_star: period,
    note: mt
      ? `ค่าประมาณ · ใช้ chart_type/score เป็นหลัก (沈氏玄空 ยุค 9 · ผังตามภูเขาด้านนั่ง ${mt.mountain_name_zh})`
      : 'Yang Gong · simplified · ใช้ data file สำหรับ exact pattern',
  };
  if (mt) {
    // field ใหม่จาก mountains_24_p9 (ตัวที่ถูกตำรา)
    out.sitting_mountain = mt.mountain_name_zh;
    out.facing_mountain = mt.facing_mountain;
    out.chart_type = mt.chart_type;
    out.chart_type_zh = mt.chart_type;
    out.chart_type_en = mt.chart_type_en;
    out.chart_type_th = mt.note_th;
    out.score = mt.score;
    out.note_th = mt.note_th;
    out.note_en = mt.note_en;
    out.special_flag = mt.special_flag;
    out.compass_code = mt.compass_code;
  }
  return out;
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
// ── D. คำเตือนประจำปี 五黃/二黑/三煞/太歲/歲破 จาก annual_wuhuang_erhei ──
// ปีนอกตาราง (นอก 2024-2044) → fallback สูตรเดิม (TAISUI/SAN_SHA dict + ดาวในผัง)
function buildWarnings(stars: any, yearBranch: string, fsYear: number, xk: XKData | null) {
  const w: any[] = [];
  const row = (xk?.annual_wuhuang_erhei || []).find(r => r.year === fsYear);

  if (row) {
    // 五黃 大煞 (จากตาราง · ทิศแน่นอนตามตำรา)
    w.push({ code:`WU_HUANG_${row.wuhuang_direction}`, severity:'critical',
      text:`五黃 (5 黄大煞) อยู่ทิศ ${row.wuhuang_direction} · ห้ามรบกวน/ขุด/ตอก · วางโลหะ-นาฬิกาทองสลาย`, dirs:[row.wuhuang_direction] });
    // 二黑 病符
    w.push({ code:`ER_HEI_${row.erhei_direction}`, severity:'warning',
      text:`二黑 (2 黒 病符) อยู่ทิศ ${row.erhei_direction} · ระวังสุขภาพ · เลี่ยงเตียง/โต๊ะ · วางโลหะ`, dirs:[row.erhei_direction] });
    // 三煞
    w.push({ code:`SAN_SHA_${row.sansha_direction}`, severity:'critical',
      text:`三煞 (3 ชะ) อยู่ทิศ ${row.sansha_direction} · ห้ามนั่งหันหน้าใส่ · ห้ามรบกวนทิศนี้`, dirs:[row.sansha_direction] });
    // 太歲
    w.push({ code:`TAISUI_${row.taisui_direction}`, severity:'critical',
      text:`太歲 (ไท่ซุ่ย ${row.pillar}) อยู่ทิศ ${row.taisui_direction} · ห้ามขุด/ตอก/รบกวนทิศนี้`, dirs:[row.taisui_direction] });
    // 歲破
    w.push({ code:`SUI_PO_${row.suipo_direction}`, severity:'warning',
      text:`歲破 (ซุ่ยพั่ว) อยู่ทิศ ${row.suipo_direction} · ทิศตรงข้ามไท่ซุ่ย · เลี่ยงงานใหญ่`, dirs:[row.suipo_direction] });
    if (row.critical_flag === 'wuhuang_in_centre')
      w.push({ code:'WU_HUANG_CENTRE', severity:'critical',
        text:`⚠ ปีนี้ 五黃 เข้ากลางผัง (正關煞) · เป็นปีที่ต้องระวังเป็นพิเศษทั้งบ้าน`, dirs:['C'] });
    return w;
  }

  // fallback (ปีนอกตาราง) — สูตรเดิม
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
// ── B. "ดี" = ดาวที่ score≥3.5 ในยุค 9 (9,1,2) แทน [1,6,8,9] เดิม ──
function buildRecsPerPerson(members: any[], stars: any, xk: XKData | null) {
  const valMap = getValuationMap(xk);
  const isGoodP9 = (s: number) => (valMap[s] ? valMap[s].score >= 3.5 : [9, 1, 2].includes(s));
  const isBadP9 = (s: number) => (valMap[s] ? valMap[s].score <= 1.5 : [5, 3, 4, 6, 7].includes(s));
  return (members || []).map(p => {
    const g = KUA_GOOD[p.kua]; if (!g) return null;
    const recs: string[] = [];
    const shengStar = stars[g.sheng]?.annual;
    if (shengStar && isGoodP9(shengStar))
      recs.push(`ทิศ ${g.sheng} = 生氣 + ดาว ${shengStar} ดี (ยุค 9) · เหมาะนั่งทำงาน/ห้องนอน`);
    else if (shengStar && isBadP9(shengStar))
      recs.push(`ทิศ ${g.sheng} = 生氣 แต่ดาว ${shengStar} ร้าย (ยุค 9) · ปีนี้เลี่ยง`);
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

    const xk = getXK();
    const period = getCurrentPeriod(dt, xk);
    const fsYear = getFengShuiYear(dt, xk); // ปีฮวงจุ้ยตาม 立春
    const ac = getAnnualCenter(fsYear, xk);
    const annualCenter = ac.center;
    const palaceStars = computePalaceStars(annualCenter, xk);
    const yearBranch = ephemeris?.year_pillar?.charAt(1) || getYearBranchFallback(dt);

    const faceAngle = house?.face_angle ? parseFloat(house.face_angle) : undefined;

    // ── ดาวจร 玄空飛星 3 ชั้น (月盤/日盤/時盤) · additive · deterministic ──
    // ใช้ component ของ dt (local civil · ตรง convention ของ getFengShuiYear)
    let flyingLayers: ReturnType<typeof computeFlyingLayers> | null = null;
    try {
      flyingLayers = computeFlyingLayers(
        dt.getFullYear(), dt.getMonth() + 1, dt.getDate(),
        dt.getHours(), dt.getMinutes(), dt.getSeconds(),
        "zaoming", annualCenter   // 年盤 ใช้ centre_star ปีฮวงจุ้ย (verify จาก annual table)
      );
    } catch { flyingLayers = null; }

    const layers = {
      flying_stars: { period, annual_center: annualCenter, feng_shui_year: fsYear, annual_center_source: ac.from_json ? 'json_centre_star' : 'formula_fallback', palaces: palaceStars },
      twenty_four: build24Mountains(faceAngle),
      ai_xing: computeAiXing(faceAngle, period, xk),
      qi_men: ephemeris?.qi_men || computeQiMenFallback(dt),
      ba_zhai: house?.family_members?.length ? buildBaZhai(house.family_members) : null,
      sixty_four: computeSixtyFour(faceAngle),
      // ── field ใหม่ (additive · ไม่กระทบ field เดิม) ──
      year_stars: flyingLayers?.year_stars ?? null,
      month_stars: flyingLayers?.month_stars ?? null,
      day_stars: flyingLayers?.day_stars ?? null,
      hour_stars: flyingLayers?.hour_stars ?? null,
      luxing_note: flyingLayers?.luxing_note ?? null,
    };

    const today = {
      twelve_spirits: ephemeris?.twelve_spirits || null,
      twenty_eight: ephemeris?.twenty_eight || null,
      twelve_officers: ephemeris?.twelve_officers || null,
      five_element: fiveElementOfHour(ephemeris?.hour_pillar),
    };

    const warnings = buildWarnings(palaceStars, yearBranch, fsYear, xk);
    const recommendations = house?.family_members ? buildRecsPerPerson(house.family_members, palaceStars, xk) : [];

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
      source: 'อาเจ๊กฮ้ง compass 3 · 沈氏玄空 ยุค 9 (xuankong-period9.json) + 八宅 + 24山',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
