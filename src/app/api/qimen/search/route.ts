/**
 * POST /api/qimen/search
 *
 * ค้นหาผังฉีเหมินที่เหมาะกับกิจกรรม หรือ ตรง spec ที่ user กำหนด
 *
 * Modes:
 *   - "activity": { activity, dateFrom, dateTo, school?, lng?, lat?, limit? }
 *   - "spec":     { spec: {doors[],stars[],deities[],sanqi[]}, dateFrom, dateTo, school?, limit? }
 *
 * Strategy: scan ทุก "ชั่วยาม" (12 ต่อวัน) · เรียก qimen-api ผ่าน internal callQimen
 * · score per palace · top N output
 *
 * 15 พ.ค. 2026 · อากง
 */
import { NextResponse } from "next/server";

const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";

const SCHOOL_TO_PROFILE: Record<string, number> = {
  zhirun: 4, chaibu: 1, yinpan: 5,
};
function isEnabled(v: unknown): boolean {
  return v === true || v === "true";
}
function resolveSchool(school?: string | null): string | null {
  const s = (school || "chaibu").toLowerCase();
  return SCHOOL_TO_PROFILE[s] ? s : null;
}

/* 📜 12 ชั่วยาม starts (00, 02, 04, ..., 22) */
const HOUR_STARTS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

/* 📜 Activity scoring rules · อากง 15 พ.ค. */
type ScoreRule = { code: string; weight: number };
type Activity = { doors: ScoreRule[]; stars: ScoreRule[]; deities: ScoreRule[]; sanqi?: string[]; avoid_doors?: string[]; avoid_stars?: string[] };
const ACTIVITIES: Record<string, Activity> = {
  work_start: {
    doors: [{code:'KAI_MEN',weight:10},{code:'XIU_MEN',weight:6},{code:'SHENG_MEN',weight:6}],
    stars: [{code:'TIAN_XIN',weight:8},{code:'TIAN_FU',weight:6}],
    deities: [{code:'ZHI_FU',weight:6},{code:'JIU_TIAN',weight:5}],
    sanqi: ['YI'],
    avoid_doors: ['SI_MEN','JING_FEAR_MEN','SHANG_MEN'],
    avoid_stars: ['TIAN_PENG'],
  },
  negotiate: {
    doors: [{code:'XIU_MEN',weight:10},{code:'KAI_MEN',weight:7}],
    stars: [{code:'TIAN_REN',weight:7},{code:'TIAN_XIN',weight:6}],
    deities: [{code:'TAI_YIN',weight:9},{code:'LIU_HE',weight:8},{code:'JIU_TIAN',weight:5}],
    sanqi: ['BING'],
    avoid_doors: ['DU_MEN','JING_FEAR_MEN'],
    avoid_stars: ['TIAN_RUI'],
  },
  wealth: {
    doors: [{code:'SHENG_MEN',weight:10},{code:'KAI_MEN',weight:7},{code:'XIU_MEN',weight:5}],
    stars: [{code:'TIAN_QIN',weight:8},{code:'TIAN_XIN',weight:6}],
    deities: [{code:'JIU_TIAN',weight:7},{code:'ZHI_FU',weight:6}],
    sanqi: ['DING'],
    avoid_doors: ['SI_MEN','SHANG_MEN'],
    avoid_stars: ['TIAN_PENG'],
  },
  love: {
    doors: [{code:'XIU_MEN',weight:9},{code:'SHENG_MEN',weight:7}],
    stars: [{code:'TIAN_FU',weight:7},{code:'TIAN_REN',weight:6}],
    deities: [{code:'LIU_HE',weight:10},{code:'TAI_YIN',weight:8}],
    avoid_doors: ['SI_MEN','JING_FEAR_MEN','SHANG_MEN'],
  },
  travel: {
    doors: [{code:'KAI_MEN',weight:9},{code:'XIU_MEN',weight:6}],
    stars: [{code:'TIAN_XIN',weight:7},{code:'TIAN_REN',weight:5}],
    deities: [{code:'JIU_TIAN',weight:8}],
    sanqi: ['BING'],
    avoid_doors: ['SI_MEN','SHANG_MEN'],
  },
  authority: {
    doors: [{code:'KAI_MEN',weight:10},{code:'JING_VIEW_MEN',weight:5}],
    stars: [{code:'TIAN_XIN',weight:8},{code:'TIAN_FU',weight:6}],
    deities: [{code:'ZHI_FU',weight:10},{code:'JIU_TIAN',weight:8}],
    sanqi: ['YI'],
    avoid_deities: undefined,
  } as any,
  decision: {
    doors: [{code:'JING_VIEW_MEN',weight:8},{code:'KAI_MEN',weight:6}],
    stars: [{code:'TIAN_XIN',weight:8},{code:'TIAN_FU',weight:6}],
    deities: [{code:'TAI_YIN',weight:7},{code:'ZHI_FU',weight:6}],
    sanqi: ['DING','YI'],
  },
  health: {
    doors: [{code:'SHENG_MEN',weight:10},{code:'XIU_MEN',weight:7}],
    stars: [{code:'TIAN_XIN',weight:9},{code:'TIAN_FU',weight:6}],
    deities: [{code:'TAI_YIN',weight:7}],
    sanqi: ['DING'],
    avoid_stars: ['TIAN_PENG','TIAN_RUI'],
  },
};

/* P9 16 พ.ค. (rate limit fix): in-memory cache + retry · qimen result คงที่ใน 1 ชั่วโมง */
const _qimenCache = new Map<string, { data: unknown; expires: number }>();
const QIMEN_CACHE_TTL = 60 * 60 * 1000; // 1 hour
async function callQimen(datetime: string, lng: number, lat: number, school: string): Promise<any> {
  const profile_id = SCHOOL_TO_PROFILE[school];
  const cacheKey = `${datetime}|${profile_id}|${lng.toFixed(4)}|${lat.toFixed(4)}`;
  const cached = _qimenCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  /* retry up to 3 times on 429 · backoff 200ms/400ms */
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${QIMEN_BASE}/api/qimen/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datetime, longitude: lng, latitude: lat, profile_id }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) {
        if (r.status === 429 && attempt < 2) {
          await new Promise(res => setTimeout(res, 200 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const j = await r.json();
      if (j.ok === false) {
        if (attempt < 2) {
          await new Promise(res => setTimeout(res, 200 * (attempt + 1)));
          continue;
        }
        return null;
      }
      const data = j.data;
      _qimenCache.set(cacheKey, { data, expires: Date.now() + QIMEN_CACHE_TTL });
      /* cap cache size · evict oldest 100 if > 5000 */
      if (_qimenCache.size > 5000) {
        const oldest = Array.from(_qimenCache.entries()).sort((a,b) => a[1].expires - b[1].expires).slice(0, 100);
        for (const [k] of oldest) _qimenCache.delete(k);
      }
      return data;
    } catch (e) {
      if (attempt < 2) await new Promise(res => setTimeout(res, 200 * (attempt + 1)));
    }
  }
  return null;
}

function scorePalaceForActivity(p: any, rule: Activity): { score: number; matches: string[] } {
  let score = 0;
  const matches: string[] = [];
  for (const r of rule.doors)  if (p.door_code === r.code)  { score += r.weight; matches.push(`+${r.weight} ${p.door_zh||p.door_code}`); }
  for (const r of rule.stars)  if (p.star_code === r.code)  { score += r.weight; matches.push(`+${r.weight} ${p.star_zh||p.star_code}`); }
  for (const r of rule.deities) if (p.deity_code === r.code) { score += r.weight; matches.push(`+${r.weight} ${p.deity_zh||p.deity_code}`); }
  if (rule.sanqi) {
    for (const qi of rule.sanqi) {
      if (p.heaven_stem_code === qi && p.heaven_is_three_qi) { score += 5; matches.push(`+5 三奇${qi}`); }
      if (p.earth_stem_code === qi  && p.earth_is_three_qi)  { score += 4; matches.push(`+4 地三奇${qi}`); }
    }
  }
  /* penalties */
  if (rule.avoid_doors?.includes(p.door_code)) { score -= 10; matches.push(`-10 ${p.door_zh||p.door_code}❌`); }
  if (rule.avoid_stars?.includes(p.star_code)) { score -= 8;  matches.push(`-8 ${p.star_zh||p.star_code}❌`); }
  /* bonus */
  if (p.is_traveling_horse) { score += 3; matches.push(`+3 馬星`); }
  if (p.is_void_any) { score -= 5; matches.push(`-5 空亡`); }
  return { score, matches };
}

function matchSpec(p: any, spec: { doors?: string[]; stars?: string[]; deities?: string[]; sanqi?: string[] }): { match: boolean; matchedFields: string[] } {
  const matched: string[] = [];
  if (spec.doors?.length && !spec.doors.includes(p.door_code)) return { match: false, matchedFields: [] };
  if (spec.doors?.length) matched.push(p.door_zh || p.door_code);
  if (spec.stars?.length && !spec.stars.includes(p.star_code)) return { match: false, matchedFields: [] };
  if (spec.stars?.length) matched.push(p.star_zh || p.star_code);
  if (spec.deities?.length && !spec.deities.includes(p.deity_code)) return { match: false, matchedFields: [] };
  if (spec.deities?.length) matched.push(p.deity_zh || p.deity_code);
  if (spec.sanqi?.length) {
    const ok = spec.sanqi.includes(p.heaven_stem_code) || spec.sanqi.includes(p.earth_stem_code);
    if (!ok) return { match: false, matchedFields: [] };
    matched.push('三奇');
  }
  return { match: true, matchedFields: matched };
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function* timeSlots(dateFrom: string, dateTo: string): Generator<{ date: string; time: string }> {
  const start = new Date(dateFrom + "T00:00:00");
  const end   = new Date(dateTo   + "T23:59:59");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    for (const h of HOUR_STARTS) {
      yield { date: dateStr, time: `${pad(h)}:00` };
    }
  }
}

/* 16 พ.ค. (เจ้านาย+อากง): 通書 yi/ji mapping per activity · 6 沖 pairs · 12 建除 score */
const ACTIVITY_TONGSHU: Record<string, { good_keywords: string[]; bad_keywords: string[] }> = {
  work_start:    { good_keywords: ['开市','开光','立券','交易','纳财'], bad_keywords: ['闭','破土','安葬'] },
  negotiate:     { good_keywords: ['立券','交易','会亲友'], bad_keywords: ['诉讼','破土'] },
  wealth:        { good_keywords: ['纳财','开市','交易','立券'], bad_keywords: ['破财','破土'] },
  love:          { good_keywords: ['嫁娶','纳采','订盟','会亲友'], bad_keywords: ['分手','安葬'] },
  travel:        { good_keywords: ['出行','移徙'], bad_keywords: ['破土','安葬'] },
  authority:     { good_keywords: ['上任','赴任','上官'], bad_keywords: ['退职'] },
  decision:      { good_keywords: ['立券','交易','立卷'], bad_keywords: ['破','闭'] },
  health:        { good_keywords: ['治病','针灸','疗病'], bad_keywords: ['安葬','破土'] },
};
const CHONG_PAIR: Record<string, string> = { 子:'午',午:'子',丑:'未',未:'丑',寅:'申',申:'寅',卯:'酉',酉:'卯',辰:'戌',戌:'辰',巳:'亥',亥:'巳' };
/* 12 建除 ratings · ตำราคลาสสิก */
const JIANCHU_SCORE: Record<string, number> = {
  '建':+2,'除':+3,'满':+2,'平':+1,'定':+4,'执':+2,'破':-5,'危':-2,'成':+5,'收':+3,'开':+5,'闭':-3
};
/* P6 16 พ.ค. (อากง tier 1): 28 宿 ratings ตามตำรา 通書 · 7 ดี · 7 ปานกลาง · 14 อ่อน/ระวัง */
const XIU_28_SCORE: Record<string, number> = {
  /* 大吉 +5 */ '房':+5,'箕':+5,'胃':+5,'昴':+5,'毕':+5,'觜':+5,'参':+5,
  /* 吉 +3 */ '角':+3,'氐':+3,'尾':+3,'斗':+3,'壁':+3,'井':+3,'柳':+3,
  /* 凶 -5 */ '亢':-5,'女':-5,'虚':-5,'危':-5,'娄':-5,'鬼':-5,'牛':-5,
  /* 平 0 */ '心':0,'室':0,'奎':0,'星':0,'张':0,'翼':0,'轸':0,
};
/* P6 (อากง tier 1): 12 神煞 (twelve_star) ratings · 4 ดี · 4 ปานกลาง · 4 ร้าย */
const SHEN12_SCORE: Record<string, number> = {
  /* 4 吉 */ '青龙':+5,'明堂':+4,'金匮':+4,'天德':+5,
  /* 4 凶 */ '白虎':-5,'天刑':-4,'朱雀':-3,'玄武':-3,
  /* 4 平 */ '司命':+2,'勾陈':-1,'天牢':-2,'天德合':+3,
};
/* P6 (อากง tier 2): 9-star flying direction · ดาว 1,6,8 ดี · 5,2 ร้าย */
const FLY9_SCORE: Record<string, number> = {
  '一':+3,'二':-5,'三':+2,'四':+3,'五':-5,'六':+5,'七':-2,'八':+5,'九':+3,
  '1':+3,'2':-5,'3':+2,'4':+3,'5':-5,'6':+5,'7':-2,'8':+5,'9':+3
};
/* P7 (อากงตำรา v1.0 · 16 พ.ค.): 河洛 9 ดาวเหิน · จาก nine_stars data
   nature: 吉=+5 · 平=0 · 凶=-5 · ใช้แทน FLY9 ทันที + รวม domain */
const HELUO_NATURE_SCORE: Record<string, number> = {
  '1':+4,'一':+4, // 一白貪狼 · 吉 (peach blossom·career)
  '2':-5,'二':-5, // 二黑巨門 · 大凶 (illness)
  '3':-3,'三':-3, // 三碧祿存 · 凶 (lawsuit·argument)
  '4':+2,'四':+2, // 四綠文曲 · 吉 (academic·romance · 9運退氣)
  '5':-5,'五':-5, // 五黃廉貞 · 大凶 (calamity)
  '6':+5,'六':+5, // 六白武曲 · 大吉 (power·wealth)
  '7':-2,'七':-2, // 七赤破軍 · 凶 (rob·argue · 8運退氣)
  '8':+5,'八':+5, // 八白左輔 · 大吉 (wealth · 8運當令)
  '9':+5,'九':+5, // 九紫右弼 · 大吉 (joy·marriage · 9運當令)
};

async function fetchTongshuForDay(date: string, origin: string): Promise<{ yi: string[]; ji: string[]; day_officer: string; day_pillar: string; year_pillar: string; xiu28: string; star12: string; star9: string; gods: string[] } | null> {
  try {
    const base = origin.replace(/\/$/, "");
    const r = await fetch(`${base}/api/today?date=${date}`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      yi: d?.tongshu?.yi || [],
      ji: d?.tongshu?.ji || [],
      day_officer: d?.tongshu?.day_officer || '',
      day_pillar: d?.pillars?.day || '',
      year_pillar: d?.pillars?.year || '',
      /* P6 (อากง tier 1+2): 28宿 · 12神煞 · 9-star · gods list */
      xiu28: d?.tongshu?.twentyeight_star || '',
      star12: d?.tongshu?.twelve_star || '',
      star9: String(d?.tongshu?.nine_star || ''),
      gods: d?.tongshu?.gods || [],
    };
  } catch (_) { return null; }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode = (body.mode === "spec" ? "spec" : "activity") as "activity" | "spec";
  const activity = body.activity || "work_start";
  const spec = body.spec || {};
  const school = resolveSchool(body.school);
  if (!school) return NextResponse.json({ error: "unsupported qimen school" }, { status: 400 });
  const lng = Number(body.lng ?? 100.5018);
  const lat = Number(body.lat ?? 13.7563);
  const limit = Math.min(Number(body.limit) || 10, 30);
  /* 16 พ.ค.: 5 ศาสตร์ filters · ส่งมาจาก frontend */
  const useTongshu: boolean = isEnabled(body.useTongshu);
  const useBazi:    boolean = isEnabled(body.useBazi);
  const useJianchu: boolean = isEnabled(body.useJianchu);
  const useTaisui:  boolean = isEnabled(body.useTaisui);
  const peopleBranches: string[] = Array.isArray(body.peopleBranches) ? body.peopleBranches : [];
  /* P6 16 พ.ค. (อากง tier 1+2): 28宿 · 12神煞 · 9飛星 · 用神 filter */
  const useXiu28:    boolean = isEnabled(body.useXiu28);
  const useShen12:   boolean = isEnabled(body.useShen12);
  const useFly9:     boolean = isEnabled(body.useFly9);
  const useHeluo:    boolean = isEnabled(body.useHeluo); // P7 อากงตำรา 河洛
  const userYongshen: string[] = Array.isArray(body.userYongshen) ? body.userYongshen : [];

  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  const defaultTo = new Date(today.getTime() + 6*86400000);
  const defaultToStr = `${defaultTo.getFullYear()}-${pad(defaultTo.getMonth()+1)}-${pad(defaultTo.getDate())}`;
  const dateFrom = body.dateFrom || defaultFrom;
  const dateTo   = body.dateTo   || defaultToStr;

  const rule = mode === "activity" ? ACTIVITIES[activity] : null;
  if (mode === "activity" && !rule) {
    return NextResponse.json({ error: `unknown activity: ${activity}` }, { status: 400 });
  }
  const hasSpec = ["doors", "stars", "deities", "sanqi"].some(k => Array.isArray(spec[k]) && spec[k].length > 0);
  if (mode === "spec" && !hasSpec) {
    return NextResponse.json({ error: "choose at least one qimen component" }, { status: 400 });
  }

  /* P5 16 พ.ค. A+B: ขยาย scan 7 วัน → 30 วัน · BATCH 6→12 · timeout เร็วขึ้น */
  const slots = [...timeSlots(dateFrom, dateTo)].slice(0, 360); // max 30 วัน × 12 ชั่วยาม
  /* P5 16 พ.ค.: pre-fetch Tongshu สำหรับแต่ละวัน (cache · 1 req/วัน) */
  const uniqueDates = Array.from(new Set(slots.map(s => s.date)));
  const tongshuCache: Record<string, Awaited<ReturnType<typeof fetchTongshuForDay>>> = {};
  const todayOrigin = new URL(req.url).origin;
  if (useTongshu || useBazi || useJianchu || useTaisui || useXiu28 || useShen12 || useFly9 || useHeluo || userYongshen.length > 0) {
    await Promise.allSettled(uniqueDates.map(async dt => {
      tongshuCache[dt] = await fetchTongshuForDay(dt, todayOrigin);
    }));
  }
  const tongshuRule = ACTIVITY_TONGSHU[activity] || { good_keywords: [], bad_keywords: [] };
  /* P8 16 พ.ค. (อากง intersection): each ticked filter = HARD CUT · ทุกศาสตร์ที่ติ๊กต้องผ่าน */
  const stats = { tongshu_cut: 0, bazi_cut: 0, taisui_cut: 0, jianchu_cut: 0, xiu28_cut: 0, shen12_cut: 0, fly9_cut: 0, heluo_cut: 0, yongshen_cut: 0 };
  const STEM_EL3: Record<string,string> = {'甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth','己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water'};

  const results: any[] = [];
  /* P9 16 พ.ค. fix: BATCH 4 + cache · qimen-api rate limit 100req/min · 4 batch × 90 wave × 0.5s ≈ 1s · พร้อม cache */
  const BATCH = 4;
  for (let i = 0; i < slots.length; i += BATCH) {
    const chunk = slots.slice(i, i + BATCH);
    const batch = await Promise.allSettled(chunk.map(async s => {
      const datetime = `${s.date}T${s.time}:00`;
      const d = await callQimen(datetime, lng, lat, school);
      if (!d) return null;
      const palaces = d.palaces || [];
      /* P5+P6 16 พ.ค.: 8 ศาสตร์ filters · Tongshu/BaZi/JianChu/Taisui/Xiu28/Shen12/Fly9/Yongshen */
      const ts = tongshuCache[s.date];
      let tongshuFlag = '', jianchuBonus = 0, xiu28Bonus = 0, shen12Bonus = 0, fly9Bonus = 0, yongshenBonus = 0, heluoBonus = 0;
      if (ts) {
        const dayBranch = ts.day_pillar.slice(1); // 辛卯 → 卯
        const yearBranch = ts.year_pillar.slice(1);
        /* 通書: cut if ji keyword for this activity */
        if (useTongshu && tongshuRule.bad_keywords.length) {
          const hasJi = (ts.ji||[]).some(j => tongshuRule.bad_keywords.some(b => j.includes(b)));
          if (hasJi) { stats.tongshu_cut++; return null; } // hard cut
          const hasYi = (ts.yi||[]).some(y => tongshuRule.good_keywords.some(g => y.includes(g)));
          if (hasYi) tongshuFlag = '通書宜';
        }
        /* BaZi 六沖: cut if day branch chong กับคนใน people */
        if (useBazi && peopleBranches.length && dayBranch) {
          const chong = peopleBranches.find(b => CHONG_PAIR[b] === dayBranch);
          if (chong) { stats.bazi_cut++; return null; } // hard cut
        }
        /* 太歲: cut if day branch chong year branch (流年沖日柱) */
        if (useTaisui && yearBranch && dayBranch && CHONG_PAIR[yearBranch] === dayBranch) {
          stats.taisui_cut++; return null;
        }
        /* P8 (อากง intersection): 6 ศาสตร์ → HARD CUT ถ้าติ๊กแล้ว score ≤ 0 */
        if (useJianchu) {
          jianchuBonus = JIANCHU_SCORE[ts.day_officer] || 0;
          if (jianchuBonus <= 0) { stats.jianchu_cut++; return null; }
        }
        if (useXiu28) {
          xiu28Bonus = XIU_28_SCORE[ts.xiu28] || 0;
          if (xiu28Bonus <= 0) { stats.xiu28_cut++; return null; }
        }
        if (useShen12) {
          shen12Bonus = SHEN12_SCORE[ts.star12] || 0;
          if (shen12Bonus <= 0) { stats.shen12_cut++; return null; }
        }
        if (useFly9) {
          fly9Bonus = FLY9_SCORE[ts.star9] || 0;
          if (fly9Bonus <= 0) { stats.fly9_cut++; return null; }
        }
        if (useHeluo) {
          heluoBonus = HELUO_NATURE_SCORE[ts.star9] || 0;
          if (heluoBonus <= 0) { stats.heluo_cut++; return null; }
        }
      }
      if (mode === "activity" && rule) {
        let bestScore = -Infinity, bestPalace: any = null, bestMatches: string[] = [];
        for (const p of palaces) {
          const { score, matches } = scorePalaceForActivity(p, rule);
          if (score > bestScore) { bestScore = score; bestPalace = p; bestMatches = matches; }
        }
        if (bestPalace) {
          /* P8 (อากง intersection): 用神 → ติ๊ก = ต้อง hour stem ∈ user yongshen */
          if (userYongshen.length && bestPalace.heaven_stem_zh) {
            const hsEl = STEM_EL3[bestPalace.heaven_stem_zh];
            const idx = userYongshen.indexOf(hsEl);
            if (idx === 0) yongshenBonus = 8;
            else if (idx === 1) yongshenBonus = 5;
            else if (idx === 2) yongshenBonus = 3;
            else { stats.yongshen_cut++; return null; } // HARD CUT
          }
          /* P5+P6+P7 (อากง 11 ศาสตร์): รวม bonus ทุกตำรา */
          const finalScore = bestScore + jianchuBonus + xiu28Bonus + shen12Bonus + fly9Bonus + yongshenBonus + heluoBonus;
          const allMatches = [...bestMatches];
          if (tongshuFlag) allMatches.push(tongshuFlag);
          if (ts?.day_officer && jianchuBonus !== 0) allMatches.push(`建除·${ts.day_officer}${jianchuBonus>0?'+'+jianchuBonus:jianchuBonus}`);
          if (ts?.xiu28 && xiu28Bonus !== 0) allMatches.push(`宿·${ts.xiu28}${xiu28Bonus>0?'+'+xiu28Bonus:xiu28Bonus}`);
          if (ts?.star12 && shen12Bonus !== 0) allMatches.push(`神·${ts.star12}${shen12Bonus>0?'+'+shen12Bonus:shen12Bonus}`);
          if (ts?.star9 && fly9Bonus !== 0) allMatches.push(`飛星${ts.star9}${fly9Bonus>0?'+'+fly9Bonus:fly9Bonus}`);
          if (ts?.star9 && heluoBonus !== 0) allMatches.push(`河洛${ts.star9}${heluoBonus>0?'+'+heluoBonus:heluoBonus}`);
          if (yongshenBonus !== 0) allMatches.push(`用神+${yongshenBonus}`);
          return {
            datetime, date: s.date, time: s.time,
            score: finalScore,
            palace_id: bestPalace.palace_id,
            direction: bestPalace.direction,
            door: bestPalace.door_zh, star: bestPalace.star_zh, deity: bestPalace.deity_zh,
            heaven_stem: bestPalace.heaven_stem_zh, earth_stem: bestPalace.earth_stem_zh,
            matches: allMatches,
            ju_pole: d.chart?.dun_type, ju_number: d.chart?.ju_number,
            tongshu: ts ? { day_officer: ts.day_officer, yi: ts.yi.slice(0,3), ji: ts.ji.slice(0,3) } : null,
          };
        }
      } else if (mode === "spec") {
        const matchedPalaces = palaces.filter((p: any) => matchSpec(p, spec).match);
        if (matchedPalaces.length) {
          const p = matchedPalaces[0];
          return {
            datetime, date: s.date, time: s.time,
            score: matchedPalaces.length, // count
            palace_id: p.palace_id, direction: p.direction,
            door: p.door_zh, star: p.star_zh, deity: p.deity_zh,
            heaven_stem: p.heaven_stem_zh, earth_stem: p.earth_stem_zh,
            ju_pole: d.chart?.dun_type, ju_number: d.chart?.ju_number,
            matched_palaces: matchedPalaces.length,
          };
        }
      }
      return null;
    }));
    for (const r of batch) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);
  return NextResponse.json({
    ok: true, mode, activity: mode==='activity'?activity:undefined, school,
    dateFrom, dateTo, lng, lat,
    total_scanned: slots.length, total_matched: results.length,
    top,
    /* P5 16 พ.ค.: 5 ศาสตร์ stats */
    filters: { useTongshu, useBazi, useJianchu, useTaisui, useXiu28, useShen12, useFly9, useHeluo, peopleBranches },
    today_loaded_dates: Object.values(tongshuCache).filter(Boolean).length,
    today_failed_dates: Object.values(tongshuCache).filter(v => !v).length,
    stats,
  });
}
