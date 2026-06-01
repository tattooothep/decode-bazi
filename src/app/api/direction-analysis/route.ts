/**
 * POST /api/direction-analysis
 * Body: { person_id, face_angle?, sit_angle?, datetime, activity, layers[] }
 * Source: อาเจ๊กฮ้ง compass_studio · port → Next.js 17 พ.ค. 2026
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

const MOUNTAINS = ['壬','子','癸','丑','艮','寅','甲','卯','乙','辰','巽','巳','丙','午','丁','未','坤','申','庚','酉','辛','戌','乾','亥'];
const TWENTY_FOUR = MOUNTAINS.map((zh, i) => {
  const startDeg = (i * 15 - 7.5 + 360) % 360;
  const endDeg = (startDeg + 15) % 360;
  return { idx: i+1, zh, start_deg: startDeg, end_deg: endDeg };
});

const KUA_GOOD: Record<number, Record<string,string>> = {
  1:{sheng:'SE',tian:'E',yan:'S',fu:'N'},2:{sheng:'NE',tian:'W',yan:'NW',fu:'SW'},
  3:{sheng:'S',tian:'N',yan:'SE',fu:'E'},4:{sheng:'N',tian:'S',yan:'E',fu:'SE'},
  6:{sheng:'W',tian:'NE',yan:'SW',fu:'NW'},7:{sheng:'NW',tian:'SW',yan:'NE',fu:'W'},
  8:{sheng:'SW',tian:'NW',yan:'W',fu:'NE'},9:{sheng:'E',tian:'SE',yan:'N',fu:'S'},
};
const KUA_BAD: Record<number, Record<string,string>> = {
  1:{jue:'SW',liu:'NE',wu:'NW',huo:'W'},2:{jue:'N',liu:'S',wu:'SE',huo:'E'},
  3:{jue:'W',liu:'NW',wu:'NE',huo:'SW'},4:{jue:'NE',liu:'SW',wu:'W',huo:'NW'},
  6:{jue:'S',liu:'N',wu:'E',huo:'SE'},7:{jue:'E',liu:'SE',wu:'S',huo:'N'},
  8:{jue:'SE',liu:'E',wu:'N',huo:'S'},9:{jue:'NW',liu:'W',wu:'SW',huo:'NE'},
};
const STAR_QUAL: Record<number,string> = {1:'good',2:'bad',3:'neutral',4:'neutral',5:'bad',6:'good',7:'neutral',8:'good',9:'good'};
const STAR_LABEL: Record<number,string> = {1:'白·官星',2:'黑·病符',3:'碧·爭鬪',4:'綠·文昌',5:'黄·災殃',6:'白·武曲',7:'赤·破軍',8:'白·財星',9:'紫·喜慶'};

function angleToMountain(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  const idx = Math.floor((d + 7.5) % 360 / 15);
  return TWENTY_FOUR[idx];
}
function angleToDir(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return 'N';
  if (d < 67.5) return 'NE'; if (d < 112.5) return 'E'; if (d < 157.5) return 'SE';
  if (d < 202.5) return 'S'; if (d < 247.5) return 'SW'; if (d < 292.5) return 'W';
  return 'NW';
}
function computeFlyingStars(year: number) {
  const offset = year - 2024;
  let center = (3 - offset) % 9; if (center <= 0) center += 9;
  const order = [4,9,2,3,5,7,8,1,6];
  const off = center - 5;
  const flying = order.map(s => { let x = s + off; if (x > 9) x -= 9; if (x < 1) x += 9; return x; });
  const dirs = ['NW','N','NE','W','C','E','SW','S','SE'];
  const out: Record<string,any> = {};
  dirs.forEach((d, i) => out[d] = { star: flying[i], label: STAR_LABEL[flying[i]], quality: STAR_QUAL[flying[i]] });
  return { annual_center: center, palace_stars: out };
}
function computeBaZhai(kua: number) {
  const good = KUA_GOOD[kua], bad = KUA_BAD[kua];
  if (!good || !bad) return null;
  return { kua, good, bad };
}
function evaluateDir(dir: string, kua: number, _activity: string, flyingStars: any) {
  let score = 50; const reasons: string[] = [];
  const good = KUA_GOOD[kua], bad = KUA_BAD[kua];
  if (good) {
    if (good.sheng === dir) { score += 30; reasons.push('生氣 +30'); }
    else if (good.tian === dir) { score += 25; reasons.push('天醫 +25'); }
    else if (good.yan === dir) { score += 20; reasons.push('延年 +20'); }
    else if (good.fu === dir) { score += 15; reasons.push('伏位 +15'); }
  }
  if (bad) {
    if (bad.jue === dir) { score -= 30; reasons.push('絕命 -30'); }
    else if (bad.liu === dir) { score -= 20; reasons.push('六煞 -20'); }
    else if (bad.wu === dir) { score -= 25; reasons.push('五鬼 -25'); }
    else if (bad.huo === dir) { score -= 15; reasons.push('禍害 -15'); }
  }
  const starCell = flyingStars?.palace_stars?.[dir];
  if (starCell) {
    if ([1,6,8,9].includes(starCell.star)) { score += 10; reasons.push(`飛星${starCell.star} +10`); }
    else if ([2,5].includes(starCell.star)) { score -= 15; reasons.push(`飛星${starCell.star} -15`); }
  }
  score = Math.max(0, Math.min(100, score));
  return { score, reasons, tier: score >= 75 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'neutral' : 'bad' };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => ({} as any));
    const { person_id, face_angle, sit_angle, datetime, activity = 'work', layers = ['twenty_four','flying_stars','ba_zhai'] } = body;
    if (!person_id || (face_angle === undefined && sit_angle === undefined)) {
      return NextResponse.json({ error: 'Missing required: person_id, face_angle (or sit_angle)' }, { status: 400 });
    }
    const faceAngle = face_angle ?? ((sit_angle + 180) % 360);
    const sitAngle = sit_angle ?? ((face_angle + 180) % 360);
    const facingMtn = angleToMountain(faceAngle);
    const sittingMtn = angleToMountain(sitAngle);
    const facingDir = angleToDir(faceAngle);
    const sittingDir = angleToDir(sitAngle);

    // load person KUA (จาก profiles) — 1 มิ.ย. ปิด IDOR fail-closed: ต้อง login + เจ้าของ org เดียวกัน (เดิม fail-open ดึงดวงคนอื่นได้ตอนไม่ login)
    const s = await getSession();
    if (!s?.orgId) return NextResponse.json({ error: "not logged in" }, { status: 401 });
    const person = await q1<{ id: string; name: string; nickname: string; bazi_pillars: any }>(
      `SELECT id, name, nickname, bazi_pillars FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
      [person_id, s.orgId]
    );
    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    // Calc KUA simplified · use year stem-branch index % 9 ถ้าไม่มี kua precomputed
    const pillars = (person.bazi_pillars as any) || {};
    const yearStr = pillars.pillars?.year ? pillars.pillars.year.stem + pillars.pillars.year.branch : null;
    const kua = ((yearStr ? yearStr.length : 1) * 3 % 9) || 1; // fallback simplified

    const dt = datetime ? new Date(datetime) : new Date();
    const out: Record<string,any> = {};

    if (layers.includes('twenty_four')) out.twenty_four = { facing: facingMtn, sitting: sittingMtn, all_24: TWENTY_FOUR };
    let fs: any = null;
    if (layers.includes('flying_stars')) { fs = computeFlyingStars(dt.getFullYear()); out.flying_stars = fs; }
    if (layers.includes('ba_zhai')) out.ba_zhai = computeBaZhai(kua);

    const allDirs = ['N','NE','E','SE','S','SW','W','NW'];
    const dirScores = allDirs.map(d => ({ direction: d, ...evaluateDir(d, kua, activity, fs) }));
    dirScores.sort((a,b) => b.score - a.score);
    const currentEval = evaluateDir(sittingDir, kua, activity, fs);

    const warnings: string[] = [];
    if (fs?.palace_stars?.[sittingDir]?.star === 5) warnings.push('นั่งทิศที่มีดาว 5 黄 · ระวังโรค');
    if (fs?.palace_stars?.[sittingDir]?.star === 2) warnings.push('นั่งทิศที่มีดาว 2 黑 · ระวังการเงิน');
    if (currentEval.score < 35) warnings.push(`ทิศนั่งปัจจุบัน (${sittingDir}) ไม่เหมาะกับ KUA ${kua}`);

    return NextResponse.json({
      facing: { angle: Math.round(faceAngle*100)/100, mountain: facingMtn, direction: facingDir },
      sitting: { angle: Math.round(sitAngle*100)/100, mountain: sittingMtn, direction: sittingDir },
      layers: out,
      recommendation: {
        best_sit: dirScores.slice(0,3), current_sit: currentEval, worst_sit: dirScores.slice(-2),
        warnings,
      },
      meta: { duration_ms: Date.now() - startTime, person_kua: kua, person_name: person.name },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
