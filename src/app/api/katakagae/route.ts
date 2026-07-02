/**
 * GET /api/katakagae?from_lat=&from_lng=&to_lat=&to_lng=&datetime=
 *
 * 方違 Katakagae · Heian Japanese onmyoji travel divination
 * อาเจ๊กฮ้ง original Express · port → Next.js 17 พ.ค. 2026
 */
import { NextRequest, NextResponse } from "next/server";

const HASSHOJIN: Record<string, any> = {
  taisai:    { name_ja:'太歳神', name_en:'Taisai',    cycle:'yearly', taboo:'ห้ามรบกวน · ห้ามตอก/ขุด/ก่อสร้าง', description:'เทพประจำปี · เปลี่ยนทิศทุกปี ตามราศีปี' },
  daishogun: { name_ja:'大将軍', name_en:'Daishogun', cycle:'yearly', taboo:'ห้ามย้ายบ้าน · ห้ามเดินทาง · 3 ปี', description:'เทพแห่งสงคราม · อยู่ทิศเดิม 3 ปี' },
  daion:     { name_ja:'大陰神', name_en:'Daion',     cycle:'yearly', taboo:'ห้ามแต่งงาน · ห้ามรับคนเข้าบ้าน', description:'เทพหยินใหญ่ · มเหสีของ Taisai' },
  saikyo:    { name_ja:'歳刑神', name_en:'Saikyō',    cycle:'yearly', taboo:'ห้ามขุดดิน · ห้ามเกษตร', description:'เทพแห่งโทษ' },
  saiha:     { name_ja:'歳破神', name_en:'Saiha',     cycle:'yearly', taboo:'ห้ามเริ่มกิจการ', description:'ตรงข้าม太歳 · ทำลายการเริ่มต้น' },
  saisetsu:  { name_ja:'歳殺神', name_en:'Saisetsu',  cycle:'yearly', taboo:'ห้ามการต่อสู้', description:'เทพสังหาร' },
  oban:      { name_ja:'黄幡神', name_en:'Ōban',      cycle:'yearly', taboo:'ห้ามขุดบ่อ', description:'ธงเหลือง' },
  hyobi:     { name_ja:'豹尾神', name_en:'Hyōbi',     cycle:'yearly', taboo:'ห้ามค้าสัตว์', description:'หางเสือดาว · ตรงข้าม Ōban' },
  tenichi:   { name_ja:'天一神', name_en:'Tenichijin',cycle:'daily',  taboo:'ห้ามไปทิศที่เทพอยู่', description:'เทพประจำทิศ · เคลื่อนทุก 5-6 วัน' },
};

const TENICHIJIN_PATTERN = [
  { dir:'NE', duration:6 }, { dir:'E', duration:5 }, { dir:'SE', duration:6 },
  { dir:'S', duration:5 },  { dir:'SW', duration:6 }, { dir:'W', duration:5 },
  { dir:'NW', duration:6 }, { dir:'N', duration:5 },  { dir:'HEAVEN', duration:16 },
];
const ZODIAC_BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const TAISAI_DIR: Record<string,string> = {'子':'N','丑':'NE','寅':'NE','卯':'E','辰':'SE','巳':'SE','午':'S','未':'SW','申':'SW','酉':'W','戌':'NW','亥':'NW'};

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180, toDeg = (r: number) => r * 180 / Math.PI;
  const φ1=toRad(lat1), φ2=toRad(lat2), Δλ=toRad(lng2-lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function bearingToDir(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return 'N';
  if (d < 67.5) return 'NE'; if (d < 112.5) return 'E'; if (d < 157.5) return 'SE';
  if (d < 202.5) return 'S'; if (d < 247.5) return 'SW'; if (d < 292.5) return 'W';
  return 'NW';
}
function bearingToMountain(deg: number): string {
  const M = ['壬','子','癸','丑','艮','寅','甲','卯','乙','辰','巽','巳','丙','午','丁','未','坤','申','庚','酉','辛','戌','乾','亥'];
  return M[Math.floor(((deg+7.5) % 360) / 15)];
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function oppositeDir(d: string): string {
  const o: Record<string,string> = {N:'S',NE:'SW',E:'W',SE:'NW',S:'N',SW:'NE',W:'E',NW:'SE'};
  return o[d] || d;
}
function getTenichijinPosition(date: Date) {
  const epoch = new Date('2024-02-04T00:00:00+09:00');
  const daysSince = Math.floor((date.getTime() - epoch.getTime()) / 86400000);
  const dayInCycle = ((daysSince % 60) + 60) % 60;
  let acc = 0;
  for (const p of TENICHIJIN_PATTERN) {
    acc += p.duration;
    if (dayInCycle < acc) return { dir: p.dir, days_remaining: acc - dayInCycle };
  }
  return { dir:'HEAVEN', days_remaining: 16 };
}
function getYearBranch(date: Date): string {
  const lichunYear = date.getMonth() >= 1 ? date.getFullYear() : date.getFullYear() - 1;
  return ZODIAC_BRANCHES[((lichunYear - 4) % 12 + 12) % 12];
}
function getDaishogunDir(yb: string): string {
  const c: Record<string,string> = {'亥':'W','子':'W','丑':'W','寅':'N','卯':'N','辰':'N','巳':'E','午':'E','未':'E','申':'S','酉':'S','戌':'S'};
  return c[yb] || 'N';
}
function findNextSafeDay(start: Date, direction: string): string {
  for (let i = 1; i <= 14; i++) {
    const t = new Date(start); t.setDate(t.getDate() + i);
    const pos = getTenichijinPosition(t);
    if (pos.dir === 'HEAVEN' || pos.dir !== direction) return t.toISOString().slice(0, 10);
  }
  return start.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fromLat = parseFloat(searchParams.get('from_lat') || 'NaN');
    const fromLng = parseFloat(searchParams.get('from_lng') || 'NaN');
    const toLat = parseFloat(searchParams.get('to_lat') || 'NaN');
    const toLng = parseFloat(searchParams.get('to_lng') || 'NaN');
    const dt = searchParams.get('datetime') ? new Date(searchParams.get('datetime')!) : new Date();

    if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
      return NextResponse.json({ error:'Missing or invalid coordinates', required:['from_lat','from_lng','to_lat','to_lng'] }, { status:400 });
    }

    const bearing = computeBearing(fromLat, fromLng, toLat, toLng);
    const direction = bearingToDir(bearing);
    const mountain = bearingToMountain(bearing);
    const distance = haversineKm(fromLat, fromLng, toLat, toLng);

    const journey = {
      from: { lat: fromLat, lng: fromLng }, to: { lat: toLat, lng: toLng },
      direction, mountain,
      bearing_degrees: Math.round(bearing * 100) / 100,
      distance_km: Math.round(distance * 100) / 100,
    };

    const yearBranch = getYearBranch(dt);
    const tenichi = getTenichijinPosition(dt);
    const taisaiDir = TAISAI_DIR[yearBranch];
    const daishogunDir = getDaishogunDir(yearBranch);
    const saihaDir = oppositeDir(taisaiDir);

    const restrictions = [
      { deity:'Ten-ichi-jin', deity_ja:'天一神', current_dir: tenichi.dir, days_remaining: tenichi.days_remaining,
        conflicts: tenichi.dir !== 'HEAVEN' && tenichi.dir === direction,
        reason: tenichi.dir === 'HEAVEN'
          ? `🌌 Tenichijin อยู่ในสวรรค์ · ปลอดภัยทุกทิศ · ${tenichi.days_remaining} วัน`
          : `Tenichijin อยู่ทิศ ${tenichi.dir} · เคลื่อนต่อใน ${tenichi.days_remaining} วัน`,
        severity:'critical' },
      { deity:'Taisai', deity_ja:'太歳神', current_dir: taisaiDir,
        conflicts: taisaiDir === direction,
        reason: `太歳 ปี ${yearBranch} อยู่ทิศ ${taisaiDir}`, severity:'high' },
      { deity:'Daishogun', deity_ja:'大将軍', current_dir: daishogunDir,
        conflicts: daishogunDir === direction,
        reason: `大将軍 อยู่ทิศ ${daishogunDir} · ห้าม 3 ปี (san-sha-fusagari)`, severity:'high' },
      { deity:'Saiha', deity_ja:'歳破神', current_dir: saihaDir,
        conflicts: saihaDir === direction,
        reason: `歳破 อยู่ทิศ ${saihaDir} · ตรงข้าม太歳 · ทำลายทุกการเริ่มต้น`, severity:'critical' },
    ];

    const conflicts = restrictions.filter(r => r.conflicts);
    const hasCritical = conflicts.some(r => r.severity === 'critical');
    const verdict = conflicts.length === 0 ? 'auspicious'
                  : (conflicts.length === 1 && !hasCritical) ? 'caution' : 'forbidden';

    const intermediates = ['N','NE','E','SE','S','SW','W','NW'].filter(d => {
      if (d === direction || d === oppositeDir(direction)) return false;
      return !restrictions.some(r => r.conflicts && r.current_dir === d);
    });
    const katatagaeOptions = verdict === 'auspicious' ? [] : intermediates.slice(0, 3).map(d => ({
      via_dir: d, stop_overnight: true, day_offset: 1,
      instruction: `เดินทางไปทิศ ${d} ก่อน · ค้างคืน · เช้าวันรุ่งขึ้นเข้าจุดหมาย · ทิศจะนับใหม่จากจุดที่นอน`,
      safe_until: dt.toISOString().slice(0, 10),
    }));
    const recommendations = {
      can_go_direct: verdict === 'auspicious',
      message: verdict === 'auspicious' ? '✅ เดินทางตรงได้ปลอดภัย · ทุกเทพประจำทิศไม่ขวาง'
             : verdict === 'forbidden' ? '🚫 ทิศนี้มีเทพหลายองค์ขวาง · ห้ามตรง · ใช้ katatagae'
             : '⚠ มีเทพ 1 องค์ขวาง · ระวังหรือใช้ katatagae',
      katatagae_options: katatagaeOptions,
      best_day: verdict === 'auspicious' ? dt.toISOString().slice(0,10) : findNextSafeDay(dt, direction),
    };

    return NextResponse.json({
      datetime: dt.toISOString(),
      journey, restrictions, verdict, recommendations,
      deity_info: HASSHOJIN,
      source: '方違 Heian onmyoji · 暦法 + Tsuchimikado · อาเจ๊กฮ้ง',
    });
  } catch (e: unknown) {
    console.error("[katakagae]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
