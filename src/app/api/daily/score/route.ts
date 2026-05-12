/**
 * POST /api/daily/score
 *
 * Daily Score · Universal + Personal · ตาม spec daily-score-spec.md v2
 *
 * Body: {
 *   date: 'YYYY-MM-DD',
 *   userChart?: { day:{stem,branch}, year, month, hour?, usefulGodDetails? }   // optional · ถ้าไม่ส่ง = แสดงแค่ Universal
 * }
 *
 * Returns code/score/debug only. Rendered text must be resolved through i18n.
 */
import { NextResponse } from "next/server";

// ───────── Constants ─────────
const STEM_ELEM: Record<string, string> = {
  '甲':'Wood','乙':'Wood','丙':'Fire','丁':'Fire','戊':'Earth','己':'Earth',
  '庚':'Metal','辛':'Metal','壬':'Water','癸':'Water'
};
const BR_ELEM: Record<string, string> = {
  '寅':'Wood','卯':'Wood','巳':'Fire','午':'Fire',
  '辰':'Earth','戌':'Earth','丑':'Earth','未':'Earth',
  '申':'Metal','酉':'Metal','亥':'Water','子':'Water'
};

const SIX_CLASHES: Record<string, string> = {
  '子':'午','午':'子','丑':'未','未':'丑','寅':'申','申':'寅',
  '卯':'酉','酉':'卯','辰':'戌','戌':'辰','巳':'亥','亥':'巳'
};
const SIX_HARMS: Record<string, string> = {
  '子':'未','未':'子','丑':'午','午':'丑','寅':'巳','巳':'寅',
  '卯':'辰','辰':'卯','申':'亥','亥':'申','酉':'戌','戌':'酉'
};
const SIX_HE: Record<string, string> = {
  '子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯',
  '辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午'
};
const SANHE_GROUPS: string[][] = [
  ['申','子','辰'], ['亥','卯','未'], ['寅','午','戌'], ['巳','酉','丑']
];
/* 7K = day stem ทำลาย user stem (same yin/yang) · key = `${userStem}-${dayStem}` */
const STEM_CLASH = new Set<string>([
  '甲-庚', '乙-辛', '丙-壬', '丁-癸',
  '戊-甲', '己-乙', '庚-丙', '辛-丁',
  '壬-戊', '癸-己'
]);
const STEM_HE_PAIRS = new Set<string>([
  '甲-己','己-甲','乙-庚','庚-乙','丙-辛','辛-丙','丁-壬','壬-丁','戊-癸','癸-戊'
]);

const OFFICER_TIER: Record<string, 'favorable'|'neutral'|'critical'> = {
  '成':'favorable','開':'favorable','建':'favorable','定':'favorable',
  '收':'neutral','除':'neutral','滿':'neutral','平':'neutral','執':'neutral',
  '危':'critical','閉':'critical','破':'critical',
  /* simplified Chinese variants from tyme4ts */
  '开':'favorable','满':'neutral','执':'neutral','闭':'critical'
};

const YELLOW_PATH = ['青龍','明堂','金匱','天德','玉堂','司命','青龙','金匮'];
const GOOD_STARS = ['天德','月德','天德合','月德合','三合','天恩','母倉','母仓','吉期','聖心','圣心','青龍','青龙','金匱','金匮','明堂','天乙','驛馬','驿马','文昌','貴人','贵人','五合','四相'];
const BAD_STARS = ['四廢','四废','大耗','劫煞','災煞','灾煞','歲煞','岁煞','咸池','勾陳','勾陈','五黃','五黄','三煞','白虎','天牢','玄武','朱雀','天刑'];

const HEAVENLY: Record<string, { wish:string; pardon:string }> = {
  '寅':{ wish:'乙亥', pardon:'戊寅' }, '卯':{ wish:'甲戌', pardon:'戊寅' }, '辰':{ wish:'乙酉', pardon:'戊寅' },
  '巳':{ wish:'丙申', pardon:'甲午' }, '午':{ wish:'丁未', pardon:'甲午' }, '未':{ wish:'戊午', pardon:'甲午' },
  '申':{ wish:'己巳', pardon:'戊申' }, '酉':{ wish:'庚辰', pardon:'戊申' }, '戌':{ wish:'辛卯', pardon:'戊申' },
  '亥':{ wish:'壬寅', pardon:'甲子' }, '子':{ wish:'癸丑', pardon:'甲子' }, '丑':{ wish:'甲子', pardon:'甲子' }
};

const TIER_WEIGHT: Record<string, number> = { 'SSS':3, 'SS':2.5, 'S':2, 'A+':1.5, 'A':1.2 };

// ───────── helpers ─────────
type BranchRelation = 'clash'|'harm'|'he'|'sanhe'|'none';
function getBranchRelation(userBranch: string, dayBranch: string): BranchRelation {
  if (!userBranch || !dayBranch) return 'none';
  if (SIX_CLASHES[userBranch] === dayBranch) return 'clash';
  if (SIX_HARMS[userBranch] === dayBranch) return 'harm';
  if (SIX_HE[userBranch] === dayBranch) return 'he';
  for (const grp of SANHE_GROUPS) {
    if (grp.includes(userBranch) && grp.includes(dayBranch) && userBranch !== dayBranch) return 'sanhe';
  }
  return 'none';
}

/* simple ten-god helper · day stem ↔ today stem */
function calcStemRelation(userStem: string, dayStem: string): string {
  if (!userStem || !dayStem) return 'none';
  if (userStem === dayStem) return 'sameStem';
  const k = `${userStem}-${dayStem}`;
  if (STEM_CLASH.has(k)) return 'stemClash';
  if (STEM_HE_PAIRS.has(k)) return 'stemHe';
  return 'other';
}

function isAuspiciousMansion(name: string): boolean {
  const auspicious = ['角','房','尾','箕','斗','女','虛','虚','室','奎','胃','畢','毕','觜','参','參','井','張','张','轸','軫','亢','心','危','室','壁','婁','娄','昴','觜'];
  return auspicious.includes(name);
}

interface Pillar { stem: string; branch: string; }
interface Chart {
  day: Pillar;
  year?: Pillar;
  month?: Pillar;
  hour?: Pillar;
  usefulGodDetails?: { elements: { element: string; tier: string }[] };
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { date, userChart } = body as { date?: string; userChart?: Chart };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date YYYY-MM-DD required" }, { status: 400 });
  }
  const [yy, mm, dd] = date.split('-').map(Number);

  /* === 1. ดึงข้อมูลจาก tyme4ts === */
  const tyme = await import("tyme4ts");
  const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
  const lh = st.getLunarHour();
  const ld = lh.getLunarDay();
  const ec = lh.getEightChar();

  const dayStem = ec.getDay().getName()[0];
  const dayBranch = ec.getDay().getName()[1];
  const monthStem = ec.getMonth().getName()[0];
  const monthBranch = ec.getMonth().getName()[1];
  const yearStem = ec.getYear().getName()[0];
  const yearBranch = ec.getYear().getName()[1];

  const officerName = ld.getDuty().getName();
  const twelveStar = ld.getTwelveStar().getName();
  const mansion = ld.getTwentyEightStar().getName();
  const nineStar = ld.getNineStar().getName();
  const gods = ld.getGods().slice(0, 12).map((g: any) => g.getName());
  const yi = ld.getRecommends().slice(0, 12).map((x: any) => x.getName());
  const ji = ld.getAvoids().slice(0, 12).map((x: any) => x.getName());

  /* === 2. Universal Score · 4 components === */
  const officerTier = OFFICER_TIER[officerName] || 'neutral';
  const officerScore = ({ favorable: 90, neutral: 60, critical: 25 })[officerTier];

  const goodCount = gods.filter(g => GOOD_STARS.some(s => g.includes(s))).length;
  const badCount = gods.filter(g => BAD_STARS.some(s => g.includes(s))).length;
  const starsScore = goodCount >= 3 && badCount === 0 ? 100
                   : goodCount >= 2 && badCount <= 1 ? 80
                   : goodCount >= badCount ? 50 : 20;
  const pathScore = YELLOW_PATH.includes(twelveStar) ? 85 : 35;
  const mansionScore = isAuspiciousMansion(mansion) ? 80 : 50;

  const universalRaw = officerScore * 0.50 + starsScore * 0.25 + pathScore * 0.10 + mansionScore * 0.15;
  /* + bonus ดาวเยอะ */
  let universalScore = Math.round(universalRaw);
  if (goodCount >= 4 && badCount === 0) universalScore = Math.min(100, universalScore + 5);
  universalScore = Math.max(0, Math.min(100, universalScore));

  const universalScoreCode = codeOfScore(universalScore);
  const universalTextCode = `daily_verdict_${universalScoreCode}`;

  /* === 3. Day Specials === */
  const dayPillarStr = `${dayStem}${dayBranch}`;
  const heavenlyLookup = HEAVENLY[monthBranch];
  const isHeavenlyWish = heavenlyLookup?.wish === dayPillarStr;
  const isHeavenlyPardon = heavenlyLookup?.pardon === dayPillarStr;

  /* === 4. Personal Score (ถ้ามี userChart) === */
  let personal: any = null;
  if (userChart && userChart.day && userChart.day.stem) {
    /* group useful god by tier */
    const tierGroups: Array<{ tier: string; elements: string[] }> = [];
    if (userChart.usefulGodDetails?.elements?.length) {
      const map: Record<string, string[]> = {};
      userChart.usefulGodDetails.elements.forEach(e => {
        if (!map[e.tier]) map[e.tier] = [];
        map[e.tier].push(e.element);
      });
      Object.keys(map).forEach(tier => tierGroups.push({ tier, elements: map[tier] }));
    } else {
      /* fallback · ใช้ generates+controls of DM */
      const dmElem = STEM_ELEM[userChart.day.stem];
      const PRODUCES: Record<string, string> = { Wood:'Water', Fire:'Wood', Earth:'Fire', Metal:'Earth', Water:'Metal' };
      const CONTROLLED_BY: Record<string, string> = { Wood:'Metal', Fire:'Water', Earth:'Wood', Metal:'Fire', Water:'Earth' };
      if (dmElem) {
        tierGroups.push({ tier:'S', elements: [PRODUCES[dmElem]] });
        tierGroups.push({ tier:'A', elements: [CONTROLLED_BY[dmElem]] });
      }
    }

    /* checkStatus */
    const userDayElem = STEM_ELEM[userChart.day.stem];
    const userDayBrElem = BR_ELEM[userChart.day.branch];
    const STRONG = ['SSS','SS','S']; const GOOD = ['A+','A']; const HARMFUL = ['F'];
    let stemMatch: 'strong'|'good'|'harmful'|'neutral' = 'neutral';
    let branchMatch: 'strong'|'good'|'harmful'|'neutral' = 'neutral';
    /* day stem ของวันนี้ vs useful god */
    const dayStemElem = STEM_ELEM[dayStem];
    const dayBrElem = BR_ELEM[dayBranch];
    for (const grp of tierGroups) {
      const cleaned = grp.elements.map(e => e.replace(/\(Stem\)|\(Branch\)/g,'').trim());
      if (cleaned.includes(dayStemElem)) {
        if (STRONG.includes(grp.tier)) stemMatch = 'strong';
        else if (GOOD.includes(grp.tier) && stemMatch === 'neutral') stemMatch = 'good';
        else if (HARMFUL.includes(grp.tier)) stemMatch = 'harmful';
      }
      if (cleaned.includes(dayBrElem)) {
        if (STRONG.includes(grp.tier)) branchMatch = 'strong';
        else if (GOOD.includes(grp.tier) && branchMatch === 'neutral') branchMatch = 'good';
        else if (HARMFUL.includes(grp.tier)) branchMatch = 'harmful';
      }
    }
    const stemPos = stemMatch === 'strong' || stemMatch === 'good';
    const brPos = branchMatch === 'strong' || branchMatch === 'good';
    let status: 'Favorable'|'Semi-Favorable'|'Unfavorable';
    if (stemPos && brPos) status = 'Favorable';
    else if (stemMatch === 'harmful' && branchMatch === 'harmful') status = 'Unfavorable';
    else if (stemPos || brPos) status = 'Semi-Favorable';
    else if (stemMatch === 'harmful' || branchMatch === 'harmful') status = 'Unfavorable';
    else status = 'Semi-Favorable';

    /* Pillar relations */
    const userPillars = ['year','month','day','hour'] as const;
    let echoPillar: typeof userPillars[number]|undefined;
    for (const p of userPillars) {
      if (!userChart[p]) continue;
      if (userChart[p]!.stem === dayStem && userChart[p]!.branch === dayBranch) { echoPillar = p; break; }
    }
    const branchToDay = {
      yearBranch:  userChart.year ? getBranchRelation(userChart.year.branch, dayBranch) : 'none',
      monthBranch: userChart.month ? getBranchRelation(userChart.month.branch, dayBranch) : 'none',
      dayBranch:   getBranchRelation(userChart.day.branch, dayBranch),
      hourBranch:  userChart.hour ? getBranchRelation(userChart.hour.branch, dayBranch) : 'none'
    };
    const stemDayRel = calcStemRelation(userChart.day.stem, dayStem);

    /* mapToScore */
    let score = ({ 'Favorable':75, 'Semi-Favorable':50, 'Unfavorable':25 })[status];
    const warning_codes: string[] = [];
    const bonus_codes: string[] = [];

    if (branchToDay.dayBranch === 'clash') { score -= 25; warning_codes.push('六沖'); }
    let otherClashes = 0;
    if (branchToDay.yearBranch === 'clash') otherClashes++;
    if (branchToDay.monthBranch === 'clash') otherClashes++;
    if (branchToDay.hourBranch === 'clash') otherClashes++;
    if (otherClashes >= 2) { score -= 20; warning_codes.push('三沖'); }
    else if (otherClashes === 1) { score -= 10; warning_codes.push('六沖'); }

    if (stemDayRel === 'stemClash') { score -= 12; warning_codes.push('天剋'); }

    let harmCount = 0;
    if (branchToDay.yearBranch === 'harm') harmCount++;
    if (branchToDay.monthBranch === 'harm') harmCount++;
    if (branchToDay.dayBranch === 'harm') harmCount++;
    if (branchToDay.hourBranch === 'harm') harmCount++;
    if (harmCount >= 1) { score -= 5 * harmCount; if (harmCount >= 2) { warning_codes.push('六害'); } }

    if (echoPillar) { score += 10; bonus_codes.push('伏吟'); }
    let heCount = 0;
    if (branchToDay.yearBranch === 'he') heCount++;
    if (branchToDay.monthBranch === 'he') heCount++;
    if (branchToDay.dayBranch === 'he') heCount++;
    if (branchToDay.hourBranch === 'he') heCount++;
    if (heCount >= 1) { score += 5 * Math.min(heCount, 2); bonus_codes.push('六合_no_化'); }

    let sanheHit = false;
    for (const k of ['yearBranch','monthBranch','dayBranch','hourBranch'] as const) {
      if (branchToDay[k] === 'sanhe') { sanheHit = true; break; }
    }
    if (sanheHit) { score += 8; bonus_codes.push('三合'); }
    if (stemDayRel === 'stemHe') { score += 6; bonus_codes.push('天合'); }

    score = Math.max(0, Math.min(100, Math.round(score)));

    /* Level */
    let level: 'Critical'|'Caution'|'Echo'|'Harmony'|'HarmonyPlus';
    if (score < 30) level = 'Critical';
    else if (score < 50) level = 'Caution';
    else if (echoPillar && score >= 75) level = 'HarmonyPlus';
    else if (echoPillar) level = 'Echo';
    else level = 'Harmony';

    personal = {
      score,
      score_code: codeOfScore(score),
      level,
      status,
      warning_codes,
      bonus_codes,
      text_codes: [`daily_verdict_${codeOfScore(score)}`, ...warning_codes, ...bonus_codes],
      breakdown: {
        stemMatch, branchMatch,
        stemDayRelation: stemDayRel,
        branchToDay,
        hasPillarEcho: !!echoPillar,
        echoPillarType: echoPillar
      }
    };
  }

  const personalScore = typeof personal?.score === "number" ? personal.score : null;
  const weightedScore = personalScore === null
    ? universalScore
    : Math.round((universalScore * 0.45) + (personalScore * 0.55));
  const matchedCodes = [
    universalTextCode,
    ...(personal?.warning_codes ?? []),
    ...(personal?.bonus_codes ?? []),
  ];
  const textCodes = [
    universalTextCode,
    ...(personal?.text_codes ?? []),
  ];

  return NextResponse.json({
    matched_codes: [...new Set(matchedCodes)],
    text_codes: [...new Set(textCodes)],
    raw_score: personalScore ?? universalScore,
    weighted_score: Math.max(0, Math.min(100, weightedScore)),
    engine_version: 'daily-score-v2.i18n-codes',
    formula_id: 'daily.score.v2',
    debug: {
      universal: {
        score: universalScore,
        score_code: universalScoreCode,
        officer: { name: officerName, tier: officerTier, score: officerScore },
        stars:   { score: starsScore, goodCount, badCount, gods },
        path:    { name: twelveStar, score: pathScore, type: YELLOW_PATH.includes(twelveStar) ? 'yellow':'black' },
        mansion: { name: mansion, score: mansionScore, auspicious: isAuspiciousMansion(mansion) }
      },
      personal,
      daySpecials: { isHeavenlyWish, isHeavenlyPardon },
      dayPillar: { stem: dayStem, branch: dayBranch, element: STEM_ELEM[dayStem], branchElement: BR_ELEM[dayBranch] },
      transitPillars: {
        year:  { stem: yearStem,  branch: yearBranch },
        month: { stem: monthStem, branch: monthBranch },
        day:   { stem: dayStem,   branch: dayBranch }
      },
      tongshu: { officer: officerName, twelveStar, mansion, nineStar, gods, yi, ji },
    }
  });
}

function codeOfScore(score: number): 'excellent'|'good'|'mixed'|'caution'|'low' {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'mixed';
  if (score >= 35) return 'caution';
  return 'low';
}
