/**
 * GET /api/calendar?year=2026&month=5&dm=己
 *   หรือ &birthDate=1984-12-31&birthTime=13:15&birthLng=100.5018
 * Returns: full month batch · pillar + lunar + tongshu + verdict + 6 goals
 *
 * Scoring · 3-layer
 *  - คะแนนหลัก: wrapper-7 strict · primary_yongshen เป็น用神จริง, xishen เป็น喜神รอง
 *  - 6 เป้าหมาย: mapping ten god ของวันต่อ DM (ตำราคลาสสิก)
 *  - fallback: wrapper-4 useful_god ถ้าไม่มี birthDate
 */
import { NextResponse } from "next/server";
import { summarizeStars } from "@/lib/star-dict-th";
import { computeIntentStatus, pickTopWorst } from "@/lib/tongshu-intents";
import { universalDayScore, universalGoals } from "@/lib/tongshu-universal";

/* 19 พ.ค. spec #2 · 六沖 dict สำหรับ branchClash check ใน intent system */
const SIX_CLASHES_CAL: Record<string, string> = {
  子:'午', 午:'子', 丑:'未', 未:'丑', 寅:'申', 申:'寅',
  卯:'酉', 酉:'卯', 辰:'戌', 戌:'辰', 巳:'亥', 亥:'巳',
};
import { hexagramForStemBranch } from "@/lib/year-hexagram";
import { computeUserDayScore } from "@/lib/scoring/pair-base";

const STEM_ELEM: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire",
  戊: "earth", 己: "earth", 庚: "metal", 辛: "metal",
  壬: "water", 癸: "water",
};
const BRANCH_ELEM: Record<string, string> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood",
  辰: "earth", 巳: "fire", 午: "fire", 未: "earth",
  申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};
const STEM_POLARITY: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin",
  戊: "yang", 己: "yin", 庚: "yang", 辛: "yin",
  壬: "yang", 癸: "yin",
};
const ELEMENT_PRODUCES: Record<string, string> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const ELEMENT_CONTROLS: Record<string, string> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};

function tenGodOf(dayMaster: string, targetStem: string): string | null {
  const dmEl = STEM_ELEM[dayMaster];
  const tEl = STEM_ELEM[targetStem];
  if (!dmEl || !tEl) return null;
  const samePol = STEM_POLARITY[dayMaster] === STEM_POLARITY[targetStem];
  if (dmEl === tEl) return samePol ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES[dmEl] === tEl) return samePol ? "食神" : "傷官";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return samePol ? "偏財" : "正財";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return samePol ? "七殺" : "正官";
  if (ELEMENT_PRODUCES[tEl] === dmEl) return samePol ? "偏印" : "正印";
  return null;
}

/* ตำราคลาสสิก · ten god → 6 goal boost (โดยรวมไม่เกิน ±18) */
const GOAL_BOOST: Record<string, Record<string, number>> = {
  正財: { wealth: +18, career: +5, love: +6, family: +4, health: 0,  travel: 0  },
  偏財: { wealth: +14, career: +4, love: +4, family: 0,  health: 0,  travel: +8 },
  正官: { wealth: +4,  career: +18, love: +6, family: +4, health: 0,  travel: 0  },
  七殺: { wealth: 0,   career: +12, love: -4, family: -3, health: -6, travel: +4 },
  食神: { wealth: +6,  career: +4,  love: +10, family: +6, health: +10, travel: +4 },
  傷官: { wealth: +4,  career: -6,  love: -4,  family: -3, health: +4,  travel: +12 },
  正印: { wealth: 0,   career: +6,  love: +4,  family: +12, health: +6, travel: -2 },
  偏印: { wealth: 0,   career: +4,  love: 0,   family: +4,  health: -4, travel: +4 },
  比肩: { wealth: -4,  career: +4,  love: -2,  family: +10, health: +4, travel: +6 },
  劫財: { wealth: -10, career: 0,   love: -6,  family: +4,  health: 0,  travel: +4 },
};

type DayCell = {
  date: string;
  day: number;
  pillar: string;
  month_pillar: string;
  stem: string;
  branch: string;
  stem_element: string;
  branch_element: string;
  lunar: string;
  day_officer: string;
  twelve_star: string;
  ten_god: string | null;
  yi: string[];
  ji: string[];
  gods: { good: string[]; bad: string[] };
  stars_detail?: ReturnType<typeof summarizeStars>;
  pillars_full?: {
    year:  { stem: string; branch: string; hex: { num: number; zh: string; th: string; en: string; symbol: string } | null };
    month: { stem: string; branch: string; hex: { num: number; zh: string; th: string; en: string; symbol: string } | null };
    day:   { stem: string; branch: string; hex: { num: number; zh: string; th: string; en: string; symbol: string } | null };
    hour:  { stem: string; branch: string; hex: { num: number; zh: string; th: string; en: string; symbol: string } | null };
  };
  verdict: {
    score: number;
    label: string;
    level: "best" | "good" | "ok" | "caution" | "avoid";
    tags?: string[];
    flags?: string[];
    role?: "yongshen" | "xishen" | "jishen" | "neutral";
    role_element?: string | null;
    role_label?: string;
  } | null;
  goals?: { wealth: number; career: number; love: number; family: number; health: number; travel: number };
  /* 19 พ.ค. spec #2 · 15 หมวด tongshu */
  intentStatus?: Record<string, 'good'|'neutral'|'bad'>;
  topIntents?: Array<{ id: string; label: string; tier: 'good'|'neutral'|'bad'; icon: string }>;
  worstIntents?: Array<{ id: string; label: string; tier: 'good'|'neutral'|'bad'; icon: string }>;
  /* 1 มิ.ย. · คะแนน Tongshu สากล (ไม่ขึ้นดวง) · โหมด "ทั่วไป·黃曆" */
  universal_verdict?: { score: number; level: string; hardBlocked: boolean };
  universal_goals?: Record<string, { score: number; level: string }>;
};

/* ตำราคลาสสิก · ดาวมงคล/อัปมงคล · ใช้ classify gods array จาก tyme4ts
 * 17 พ.ค. fix · ครอบคลุม simplified+traditional · เพิ่มดาวที่ tyme4ts ส่งจริง */
const GOOD_GODS = new Set([
  // ดาวเทพ (吉星)
  "天德","月德","天德合","月德合","天恩","月恩","母倉","母仓","吉慶","吉庆","解神","文昌","太陽","太阳","太陰","太阴","福星",
  "三合","六合","天醫","天医","四相","天馬","天马","不將","不将","金堂","玉堂","益後","益后","續世","续世","明堂",
  "青龍","青龙","金匱","金匮","寶光","宝光","司命","驛馬","驿马","天后","天倉","天仓","天富","天貴","天贵",
  // เพิ่ม 17 พ.ค. (tyme4ts จริง)
  "時德","时德","陽德","阳德","福生","王日","官日","守日","相日","民日","敬安","普護","普护","聖心","圣心","金匱","金匮","寶光","宝光",
  "天巫","福德","天倉","天仓","三合","臨日","临日","驛馬","驿马","天后","天醫","天医","要安","玉宇","金堂","解神","除神","天恩",
  "鳴吠","鸣吠","鳴吠對","鸣吠对","益後","益后","續世","续世","六儀","六仪","金匱","金匮",
]);
const BAD_GODS = new Set([
  // ดาวร้าย (凶星)
  "月破","大耗","五離","五离","八專","八专","復日","复日","重日","月害","月厭","月厌","月刑","五黃","五黄","劫煞","劫殺","劫杀",
  "災煞","灾煞","歲煞","岁煞","致死","五虛","五虚","天吏","死神","死氣","死气","小耗","天賊","天贼",
  "天牢","天罡","河魁","勾陳","勾陈","元武","白虎","朱雀","厭對","厌对","招搖","招摇","咸池","五墓",
  "土符","土忌","土公","八風","八风","八座","四廢","四废","受死","重喪","重丧","重複","重复","八敗","八败",
  // เพิ่ม 17 พ.ค. (tyme4ts จริง)
  "月煞","月虛","月虚","血支","血忌","滅門","灭门","厭","厌","遊禍","游祸","天火","地火","獨火","独火",
  "歸忌","归忌","往亡","小時","小时","土府","月建","月厭","月厌","死別","死别","披麻","咸池","八專","八专",
  "九空","九坎","九焦","土王用事","荒蕪","荒芜","羅網","罗网","刀砧","天瘟","地瘟","河魁","白虎","勾絞","勾绞",
]);
function classifyGods(arr: string[]): { good: string[]; bad: string[] } {
  const good: string[] = [], bad: string[] = [];
  arr.forEach(g => {
    if (GOOD_GODS.has(g)) good.push(g);
    else if (BAD_GODS.has(g)) bad.push(g);
    else good.push(g); /* unknown · เก็บฝั่ง good (default safe) */
  });
  return { good, bad };
}

/* 12 建除 day officer · ห้าม/ดี เด็ดขาดตาม 协纪辨方书 (ตำราอากง)
 * 17 พ.ค. fix · tyme4ts ส่ง yi/ji จาก dataset ไม่ filter day officer
 * ดังนั้นต้อง override ตามตำราจริง · ตัด conflict ออก */
const OFFICER_FORBID: Record<string, string[]> = {
  '建':  ['動土','破土','安葬','修造','上樑','上梁'],
  '除':  [],  /* 除 = กำจัด · ปกติดี · ไม่ห้ามอะไรเฉพาะ */
  '滿':  ['服藥','服药','治病','求醫','求医'],
  '满':  ['服藥','服药','治病','求醫','求医'],
  '平':  ['修造','動土','栽種','栽种','取土'],
  '定':  ['詞訟','词讼','訴訟','诉讼','出行'],
  '執':  ['移徙','遠行','远行','出行','開市','开市'],
  '执':  ['移徙','遠行','远行','出行','開市','开市'],
  '破':  ['嫁娶','安葬','上樑','上梁','開市','开市','立券','交易','動土','移徙','入宅','安床'],  /* 破日 = พังทุกอย่าง */
  '危':  ['登山','行船','乘船','遠行','远行'],
  '成':  [],  /* 成 = สำเร็จ · ดี · ไม่ห้าม */
  '收':  ['出行','遠行','远行','開市','开市','安葬'],
  '開':  ['安葬','破土','行喪','行丧'],
  '开':  ['安葬','破土','行喪','行丧'],
  '閉':  ['嫁娶','交易','立券','立卷','開市','开市','開光','开光','上樑','上梁','栽種','栽种','遠行','远行','出行','安門','安门','修造','動土'],
  '闭':  ['嫁娶','交易','立券','立卷','開市','开市','開光','开光','上樑','上梁','栽種','栽种','遠行','远行','出行','安門','安门','修造','動土'],
};
const OFFICER_FAVOR: Record<string, string[]> = {
  '閉': ['補垣','补垣','塞穴','築堤','筑堤','畋獵','畋猎','取漁','取渔'],  /* 闭日 = ปิด · เหมาะอุด/ปิด */
  '闭': ['補垣','补垣','塞穴','築堤','筑堤','畋獵','畋猎','取漁','取渔'],
};
function filterYiJiByOfficer(yi: string[], ji: string[], officer: string): { yi: string[]; ji: string[] } {
  const forbid = new Set(OFFICER_FORBID[officer] || []);
  const favor  = new Set(OFFICER_FAVOR[officer]  || []);
  /* ย้ายของที่ห้ามตามตำรา จาก yi → ji */
  const fixedYi = yi.filter(x => !forbid.has(x));
  const movedToJi = yi.filter(x => forbid.has(x));
  /* ย้ายของที่เหมาะ จาก ji → yi */
  const fixedJi = ji.filter(x => !favor.has(x));
  const movedToYi = ji.filter(x => favor.has(x));
  return {
    yi: [...new Set([...fixedYi, ...movedToYi])],
    ji: [...new Set([...fixedJi, ...movedToJi])],
  };
}

function levelOf(s: number): "best" | "good" | "ok" | "caution" | "avoid" {
  if (s >= 80) return "best";
  if (s >= 65) return "good";
  if (s >= 50) return "ok";
  if (s >= 35) return "caution";
  return "avoid";
}

function clip(n: number) { return Math.max(5, Math.min(95, Math.round(n))); }

function listFromSynthField(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x: any) => typeof x === "string" ? x : x?.element).filter(Boolean);
  if (typeof v === "object" && Array.isArray(v.elements)) return v.elements.filter(Boolean);
  return [];
}

function classifyWrapper7DayRole(
  stemEl: string,
  branchEl: string,
  primary: string[],
  xishen: string[],
  jishen: string[],
): { role: "yongshen" | "xishen" | "jishen" | "neutral"; element: string | null; label: string } {
  const hits = [stemEl, branchEl].filter(Boolean);
  const y = hits.find(e => primary.includes(e));
  if (y) return { role: "yongshen", element: y, label: "用神" };
  const x = hits.find(e => xishen.includes(e));
  if (x) return { role: "xishen", element: x, label: "喜神" };
  const j = hits.find(e => jishen.includes(e));
  if (j) return { role: "jishen", element: j, label: "忌神" };
  return { role: "neutral", element: null, label: "平" };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") || "0", 10);
  const month = parseInt(url.searchParams.get("month") || "0", 10);
  const dmArg = url.searchParams.get("dm") || "";
  const birthDate = url.searchParams.get("birthDate") || "";
  const birthTime = url.searchParams.get("birthTime") || "12:00";
  const birthTimeKnown = url.searchParams.get("birthTimeKnown") !== "false";
  const birthLng = parseFloat(url.searchParams.get("birthLng") || "100.5018");
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "year + month (1-12) required" }, { status: 400 });
  }

  try {
    const tyme = await import("tyme4ts");

    /* === resolve user yongshen
     * 18 พ.ค. Codex APPROVED migration · wrapper-6 → wrapper-7
     * strict policy:
     * primary_yongshen = 用神หลัก ใช้คิดคะแนน
     * xishen           = 喜神รอง ใช้บอกสถานะ/คำอธิบาย แต่ไม่ยกเป็น用神
     * jishen   = explicit จาก wrapper-7 (ไม่ใช่ "5 - friendly")
     * fallback · wrapper-6 ถ้า wrapper-7 ล้ม */
    let friendly: string[] = [];
    let primaryYongshen: string[] = [];
    let xishenElements: string[] = [];
    let userDM = dmArg;
    let source = "fallback";
    let userPillars: any = null;
    let jishenElements: string[] = [];
    let dominantJishen: string | null = null;

    if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      try {
        const { getYongshenSynth, extractFromSynth } = await import("@/lib/yongshen-cache");
        const wrapped = await getYongshenSynth(birthDate, birthTime, birthLng, { birthTimeKnown });
        if (wrapped && wrapped.synth) {
          const ex = extractFromSynth(wrapped.synth);
          primaryYongshen = listFromSynthField(wrapped.synth?.primary_yongshen);
          xishenElements = listFromSynthField(wrapped.synth?.xishen);
          userDM = wrapped.calc.pillars.day.stem;
          userPillars = wrapped.calc.pillars;
          friendly = primaryYongshen.length ? primaryYongshen : ex.yongshen; /* strict: primary only */
          jishenElements = ex.jishen;     /* explicit · ไม่ใช่ 5-friendly */
          dominantJishen = ex.dominantJishen;
          source = "wrapper-7";
        }
      } catch (e) {
        console.warn("[/api/calendar] wrapper-7 failed", e);
      }
      /* fallback · wrapper-6 ถ้า wrapper-7 ล้ม หรือ return empty */
      if (!friendly.length) {
        try {
          const { calcBazi } = await import("@/lib/bazi-calc");
          const calc = birthTimeKnown
            ? await calcBazi({
                date: birthDate,
                time: birthTime,
                longitude: birthLng,
                gmtOffsetHours: 7,
                birthTimeKnown: true,
              })
            : await calcBazi({
                date: birthDate,
                longitude: birthLng,
                gmtOffsetHours: 7,
                birthTimeKnown: false,
              });
          userDM = calc.pillars.day.stem;
          userPillars = calc.pillars;
          const top3 = ((calc.yongshen as any[]) || []).slice(0, 3);
          friendly = Array.from(new Set(top3.map((y: any) => y.element).filter(Boolean)));
          primaryYongshen = friendly.slice(0, 1);
          xishenElements = friendly.slice(1);
          const allEls = ['wood','fire','earth','metal','water'];
          jishenElements = allEls.filter(e => !friendly.includes(e));
          source = "wrapper-6-fallback";
        } catch (e) {
          console.warn("[/api/calendar] wrapper-6 fallback also failed", e);
        }
      }
    }
    if (!friendly.length && dmArg && STEM_ELEM[dmArg]) {
      /* fallback · wrapper-4 */
      try {
        const w4 = await import("../../../../data/library/wrappers/4-useful-god.js");
        const ug = w4.getUsefulGod(dmArg) as { summary?: { friendlyElements?: string[] } };
        friendly = ug?.summary?.friendlyElements || [];
        primaryYongshen = friendly.slice(0, 1);
        xishenElements = friendly.slice(1);
        source = "wrapper-4";
      } catch (_) {}
    }

    /* === build month === */
    const totalDays = new Date(year, month, 0).getDate();
    const days: DayCell[] = [];
    for (let d = 1; d <= totalDays; d++) {
      const st = tyme.SolarTime.fromYmdHms(year, month, d, 12, 0, 0);
      const lh = st.getLunarHour();
      const ld = lh.getLunarDay();
      const ec = lh.getEightChar();

      const dayPillar = ec.getDay().getName();
      const stem = dayPillar[0];
      const branch = dayPillar[1];
      const stemEl = STEM_ELEM[stem] || "earth";
      const branchEl = BRANCH_ELEM[branch] || "earth";
      const tg = userDM ? tenGodOf(userDM, stem) : null;

      let verdict: any = null;
      let goals = undefined;
      if (friendly.length) {
        /* 18 พ.ค. unified · ใช้ computeUserDayScore + ส่ง tags + flags กลับเพื่ออธิบาย */
        let score: number;
        let tags: string[] = [];
        let flags: string[] = [];
        if (userPillars) {
          const r = computeUserDayScore(userPillars, dayPillar, friendly, jishenElements);
          score = r.score;
          tags = r.tags || [];
          flags = r.flags || [];
        } else {
          const stemAligned = friendly.includes(stemEl);
          const branchAligned = friendly.includes(branchEl);
          score = 50;
          if (stemAligned) score += 18;
          if (branchAligned) score += 14;
          if (!stemAligned && !branchAligned) score -= 12;
        }
        score = clip(score);
        const lvl = levelOf(score);
        const role = classifyWrapper7DayRole(stemEl, branchEl, primaryYongshen.length ? primaryYongshen : friendly, xishenElements, jishenElements);
        verdict = {
          score,
          label: lvl.toUpperCase(),
          level: lvl,
          tags,
          flags,
          role: role.role,
          role_element: role.element,
          role_label: role.label,
        };

        /* 6 goals · base = verdict score · + ten god boost */
        const boost = tg ? GOAL_BOOST[tg] || {} : {};
        goals = {
          wealth: clip(score + (boost.wealth || 0)),
          career: clip(score + (boost.career || 0)),
          love:   clip(score + (boost.love   || 0)),
          family: clip(score + (boost.family || 0)),
          health: clip(score + (boost.health || 0)),
          travel: clip(score + (boost.travel || 0)),
        };
      }

      const godsArr = ld.getGods().slice(0, 16).map((g: { getName(): string }) => g.getName());
      /* 月柱 ของวันนี้ · ตามอากง 立春→立夏→芒種 (ถูก jieqi) */
      const dayMonthPillar = ec.getMonth().getName();
      const officerName = ld.getDuty().getName();
      const rawYi = ld.getRecommends().map((x: { getName(): string }) => x.getName());
      const rawJi = ld.getAvoids().map((x: { getName(): string }) => x.getName());
      const fixed = filterYiJiByOfficer(rawYi, rawJi, officerName);

      /* 17 พ.ค. · 4 pillars + 64卦 · Hourkey-style "สี่เสาของวันนี้" */
      const yearPillarStr = ec.getYear().getName();
      const ys = yearPillarStr[0], yb = yearPillarStr[1];
      const ms = dayMonthPillar[0], mb = dayMonthPillar[1];
      const ds = stem, db = branch;
      /* hour pillar เริ่มต้น 子時 (23:00) · 五虎遁: stem ของ 子時 ขึ้นกับ day stem
       * 甲己→甲子, 乙庚→丙子, 丙辛→戊子, 丁壬→庚子, 戊癸→壬子 */
      const HOUR_ZI_STEM: Record<string, string> = { 甲:'甲', 己:'甲', 乙:'丙', 庚:'丙', 丙:'戊', 辛:'戊', 丁:'庚', 壬:'庚', 戊:'壬', 癸:'壬' };
      const hs = HOUR_ZI_STEM[ds] || '甲', hb = '子';
      const mkHex = (s: string, b: string) => {
        const h = hexagramForStemBranch(s, b);
        if (!h?.hex) return null;
        return { num: h.num, zh: h.hex.zh, th: h.hex.th, en: h.hex.en, symbol: h.hex.symbol };
      };
      const pillars_full = {
        year:  { stem: ys, branch: yb, hex: mkHex(ys, yb) },
        month: { stem: ms, branch: mb, hex: mkHex(ms, mb) },
        day:   { stem: ds, branch: db, hex: mkHex(ds, db) },
        hour:  { stem: hs, branch: hb, hex: mkHex(hs, hb) },
      };
      /* 19 พ.ค. spec #2 · 15 หมวด intentStatus + top/worst สำหรับการ์ดวัน */
      const cls = classifyGods(godsArr);
      const userBranch = userPillars?.day?.branch || "";
      const branchClash = userBranch && SIX_CLASHES_CAL[userBranch] === branch;
      const intentStatus = computeIntentStatus(fixed.yi, fixed.ji, cls.bad, !!branchClash);
      const topWorst = pickTopWorst(intentStatus, 'th');
      /* 1 มิ.ย. · คะแนน Tongshu สากล (ไม่ขึ้นดวง user) · โหมด "ทั่วไป·黃曆" · ฉันทามติ 3 agent + พ่อ APPROVE */
      const twelveStarName = ld.getTwelveStar().getName();
      const starSummary = summarizeStars(godsArr);
      const universalVerdict = universalDayScore(officerName, twelveStarName, starSummary, fixed.yi, fixed.ji, godsArr);
      const universalGoalsObj = universalGoals(universalVerdict.score, intentStatus, universalVerdict.hardBlocked);
      days.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        pillar: dayPillar,
        month_pillar: dayMonthPillar,
        stem, branch,
        stem_element: stemEl,
        branch_element: branchEl,
        lunar: ld.toString(),
        day_officer: officerName,
        twelve_star: twelveStarName,
        ten_god: tg,
        yi: fixed.yi.slice(0, 8),
        ji: fixed.ji.slice(0, 8),
        gods: cls,
        /* 17 พ.ค. · Hourkey-style stars · ชื่อไทย + คะแนน + อธิบาย */
        stars_detail: starSummary,
        pillars_full,
        verdict,
        goals,
        /* 19 พ.ค. spec #2 · intent system */
        intentStatus,
        topIntents: topWorst.top,
        worstIntents: topWorst.worst,
        /* 1 มิ.ย. · คะแนนสากล (Tongshu · ไม่ขึ้นดวง) · โหมด "ทั่วไป·黃曆" */
        universal_verdict: universalVerdict,
        universal_goals: universalGoalsObj,
      });
    }

    /* year pillar from day 1 */
    const st1 = tyme.SolarTime.fromYmdHms(year, month, 1, 12, 0, 0);
    const ec1 = st1.getLunarHour().getEightChar();
    const yearPillar = ec1.getYear().getName();

    /* === Month-pillar transitions · ตามอากง: month pillar เปลี่ยนตรง jieqi (ไม่ใช่วันที่ 1) === */
    const transitions: { from_day: number; pillar: string; jieqi: string }[] = [];
    let lastPillar = "";
    for (let i = 0; i < days.length; i++) {
      const mp = days[i].month_pillar;
      if (mp !== lastPillar) {
        /* หา jieqi ที่เริ่ม pillar ใหม่ · ใช้ที่ day i */
        let jq = "";
        try {
          const sd = tyme.SolarTime.fromYmdHms(year, month, days[i].day, 12, 0, 0).getSolarDay();
          jq = sd.getTerm().getName();
        } catch (_) {}
        transitions.push({ from_day: days[i].day, pillar: mp, jieqi: jq });
        lastPillar = mp;
      }
    }
    const monthPillarPrimary = transitions[0]?.pillar || "";
    const monthPillarLabel = transitions.length === 1
      ? monthPillarPrimary
      : transitions.map(t => `${t.pillar}${t.from_day>1 ? ` (→${t.from_day})` : ''}`).join(" → ");

    /* 節氣 · jieqi · ของ day 1 + ทั้ง list ในเดือน (อากงสอน) */
    let jieqiCurrent = "", jieqiNext = "";
    const jieqiList: { name: string; day: number; date: string }[] = [];
    try {
      const sd = st1.getSolarDay();
      const jq = sd.getTerm();
      jieqiCurrent = jq.getName();
      jieqiNext = jq.next(2).getName();
      /* loop หา jieqi เปลี่ยนภายในเดือน */
      let lastTerm = jieqiCurrent;
      for (let i = 0; i < days.length; i++) {
        try {
          const sd2 = tyme.SolarTime.fromYmdHms(year, month, days[i].day, 0, 0, 0).getSolarDay();
          const t = sd2.getTerm().getName();
          if (t !== lastTerm) {
            jieqiList.push({ name: t, day: days[i].day, date: days[i].date });
            lastTerm = t;
          }
        } catch (_) {}
      }
    } catch (_) {}

    return NextResponse.json({
      year, month,
      dm: userDM,
      friendly_elements: friendly,
      primary_yongshen: primaryYongshen.length ? primaryYongshen : friendly,
      xishen_elements: xishenElements,
      jishen_elements: jishenElements,
      score_policy: "wrapper7-strict-primary",
      score_source: source,
      month_pillar: monthPillarPrimary,        /* backward compat */
      month_pillar_label: monthPillarLabel,    /* ใหม่ · แสดง transition */
      month_pillar_transitions: transitions,    /* รายละเอียด */
      year_pillar: yearPillar,
      jieqi_current: jieqiCurrent,
      jieqi_next: jieqiNext,
      jieqi_list: jieqiList,
      total_days: totalDays,
      days,
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
