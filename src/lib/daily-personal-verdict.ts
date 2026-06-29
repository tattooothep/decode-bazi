import { calcBazi, type BaziPillarsAny } from "./bazi-calc";
import { buildChartExtensions } from "./chart-extensions";
import { buildStructuredChartPacket } from "./chart-packet";
import { computeSiLingDays } from "./chart-table";
import { computeQiyunLock, type QiyunLock } from "./bazi-qiyun";
import { computeUserDayScore } from "./scoring/pair-base";

type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";
type Level = "best" | "good" | "ok" | "caution" | "avoid";
type Pillar = { stem: string; branch: string };
type UserChart = {
  year?: Pillar | null;
  month?: Pillar | null;
  day?: Pillar | null;
  hour?: Pillar | null;
};

export type DailyPersonalVerdictInput = {
  date: string;
  userChart?: UserChart | null;
  dayPillar?: string | null;
  yongshen?: string[] | null;
  jishen?: string[] | null;
  birthDate?: string | null;
  birthTime?: string | null;
  birthLng?: number | string | null;
  birthTimeKnown?: boolean;
  gender?: "M" | "F" | string | null;
  dayBoundary?: "23:00" | "00:00" | string | null;
};

export type DailyPersonalVerdict = {
  score: number;
  label: string;
  level: Level;
  raw: number;
  tags: string[];
  flags: string[];
  yongshen: string[];
  jishen: string[];
  source: "daily-personal-verdict";
  engine: "sifu-packet-aligned-v1" | "legacy-pair-base";
  targetDate: string;
  legacy: {
    score: number;
    label: string;
    level: Level;
    raw: number;
    source: "unified-pair-base";
  };
  evidence: {
    dayPillar: string;
    usefulGods?: {
      yong: string[];
      xi: string[];
      ji: string[];
      conditionalUse?: unknown[];
    } | null;
    currentLuck?: unknown;
    annualPillar?: Pillar | null;
    bingYao?: {
      status?: string | null;
      primaryId?: string | null;
      diseaseElements?: string[];
      medicineElements?: string[];
    } | null;
    chengBaiNow?: {
      verdict?: string | null;
      reason?: string | null;
    } | null;
    modifiers: Array<{ code: string; points: number; note: string }>;
  };
};

const STEM_ELEMENT: Record<string, ElementEN> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const BRANCH_ELEMENT: Record<string, ElementEN> = {
  子: "water", 亥: "water", 寅: "wood", 卯: "wood", 巳: "fire", 午: "fire",
  申: "metal", 酉: "metal", 辰: "earth", 戌: "earth", 丑: "earth", 未: "earth",
};
const BRANCH_CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};
const BRANCH_HARM: Record<string, string> = {
  子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅",
  卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉",
};
const BRANCH_DESTROY: Record<string, string> = {
  子: "酉", 酉: "子", 丑: "辰", 辰: "丑", 寅: "亥", 亥: "寅",
  卯: "午", 午: "卯", 巳: "申", 申: "巳", 未: "戌", 戌: "未",
};
const SELF_PUNISH = new Set(["辰", "午", "酉", "亥"]);
const ELEMENTS: ElementEN[] = ["wood", "fire", "earth", "metal", "water"];

const globalForDailyVerdict = globalThis as typeof globalThis & {
  __dailyPersonalNatalCache?: Map<string, { exp: number; value: NatalContext | null }>;
};
const NATAL_CACHE = globalForDailyVerdict.__dailyPersonalNatalCache ?? new Map<string, { exp: number; value: NatalContext | null }>();
if (process.env.NODE_ENV !== "production") globalForDailyVerdict.__dailyPersonalNatalCache = NATAL_CACHE;
const NATAL_CACHE_TTL_MS = 10 * 60 * 1000;
const QIYUN_POLICY_VERSION = "qiyunlock-v1";

type NatalContext = {
  calc: Awaited<ReturnType<typeof calcBazi>>;
  birthDateObj: Date;
  startAge: number;
  qiyunLock: QiyunLock;
  rootedness: ReturnType<typeof buildStructuredChartPacket>["rootedness"] | null;
};

function cleanElements(v: unknown): ElementEN[] {
  const arr = Array.isArray(v) ? v : [];
  return Array.from(new Set(arr.map((x) => String(x || "").toLowerCase()).filter((x): x is ElementEN => ELEMENTS.includes(x as ElementEN))));
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function scoreLevel(score: number): { label: string; level: Level } {
  if (score >= 80) return { label: "大吉", level: "best" };
  if (score >= 60) return { label: "吉", level: "good" };
  if (score >= 50) return { label: "中和", level: "ok" };
  if (score >= 35) return { label: "凶", level: "caution" };
  return { label: "大凶", level: "avoid" };
}

function parseGender(raw: unknown): "M" | "F" {
  const s = String(raw || "M").trim().toLowerCase();
  return s === "f" || s === "female" || s === "woman" ? "F" : "M";
}

function normalizeDayBoundary(raw: unknown): "23:00" | "00:00" {
  return raw === "00:00" ? "00:00" : "23:00";
}

function numberOrDefault(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function pillarName(p?: Pillar | null): string {
  return p ? `${p.stem || ""}${p.branch || ""}` : "";
}

async function dayPillarFor(date: string): Promise<string> {
  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return "";
  const tyme = await import("tyme4ts");
  return tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0).getLunarHour().getEightChar().getDay().getName();
}

function targetDateObj(date: string): Date {
  return new Date(`${date}T12:00:00+07:00`);
}

async function computeRootedness(pillars: BaziPillarsAny): Promise<ReturnType<typeof buildStructuredChartPacket>["rootedness"] | null> {
  try {
    const w7 = await import("../../data/library/wrappers/7-yongshen-v2.js") as unknown as {
      dmRootProfile: (n: unknown) => { dm_element: string; rootedness_label: string; is_extremely_weak: boolean; is_token_only: boolean };
      rootednessAll: (n: unknown) => Record<string, { rootedness_label: string }>;
    };
    const dmR = w7.dmRootProfile(pillars);
    const allR = w7.rootednessAll(pillars);
    const lab = (e: string) => allR[e]?.rootedness_label || "no_root";
    return {
      dmElement: dmR.dm_element,
      dmLabel: dmR.rootedness_label,
      isExtremelyWeak: dmR.is_extremely_weak,
      isTokenOnly: dmR.is_token_only,
      all: { wood: lab("wood"), fire: lab("fire"), earth: lab("earth"), metal: lab("metal"), water: lab("water") },
    } as ReturnType<typeof buildStructuredChartPacket>["rootedness"];
  } catch {
    return null;
  }
}

async function getNatalContext(input: DailyPersonalVerdictInput): Promise<NatalContext | null> {
  const birthDate = String(input.birthDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const birthTimeKnown = input.birthTimeKnown !== false;
  const birthTime = birthTimeKnown ? String(input.birthTime || "12:00").slice(0, 5) : "12:00";
  const birthLng = numberOrDefault(input.birthLng, 100.5018);
  const gender = parseGender(input.gender);
  const dayBoundary = normalizeDayBoundary(input.dayBoundary);
  const cacheKey = `${QIYUN_POLICY_VERSION}|${birthDate}|${birthTime}|${birthLng}|${birthTimeKnown ? "4p" : "3p"}|${gender}|${dayBoundary}`;
  const cached = NATAL_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.value;
  try {
    const calc = birthTimeKnown
      ? await calcBazi({ date: birthDate, time: birthTime, longitude: birthLng, gmtOffsetHours: 7, gender, dayBoundary, birthTimeKnown: true })
      : await calcBazi({ date: birthDate, longitude: birthLng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    const birthDateObj = new Date(`${birthDate}T${birthTime}:00+07:00`);
    const qiyunLock = await computeQiyunLock({ date: birthDate, time: birthTime, gender, lng: birthLng, birthTimeKnown, dayBoundary, targetYear: targetDateObj(input.date || new Date().toISOString().slice(0, 10)).getFullYear() });
    const startAge = qiyunLock.representativeStartAge ?? 0;
    const rootedness = await computeRootedness(calc.pillars);
    const value = { calc, birthDateObj, startAge, qiyunLock, rootedness };
    NATAL_CACHE.set(cacheKey, { exp: now + NATAL_CACHE_TTL_MS, value });
    return value;
  } catch {
    NATAL_CACHE.set(cacheKey, { exp: now + 60_000, value: null });
    return null;
  }
}

function natalPillarsFrom(input: DailyPersonalVerdictInput, natal: NatalContext | null): UserChart | null {
  if (natal?.calc?.pillars?.day?.stem) return natal.calc.pillars as UserChart;
  if (input.userChart?.day?.stem) return input.userChart;
  return null;
}

function addModifier(modifiers: Array<{ code: string; points: number; note: string }>, code: string, points: number, note: string): void {
  if (!points) return;
  modifiers.push({ code, points, note });
}

function elementsOfPillar(p?: Pillar | null): ElementEN[] {
  return Array.from(new Set([p?.stem ? STEM_ELEMENT[p.stem] : null, p?.branch ? BRANCH_ELEMENT[p.branch] : null].filter(Boolean) as ElementEN[]));
}

function scoreElementHits(
  modifiers: Array<{ code: string; points: number; note: string }>,
  sourceCode: string,
  sourceLabel: string,
  els: ElementEN[],
  useful: { yong: string[]; xi: string[]; ji: string[] },
  medicine: string[],
  disease: string[],
  weight = 1,
): void {
  const uniq = Array.from(new Set(els));
  const medHit = uniq.find((e) => medicine.includes(e));
  const disHit = uniq.find((e) => disease.includes(e));
  const yongHit = uniq.find((e) => useful.yong.includes(e));
  const xiHit = uniq.find((e) => useful.xi.includes(e));
  const jiHit = uniq.find((e) => useful.ji.includes(e));
  if (medHit) addModifier(modifiers, `${sourceCode}_medicine`, Math.round(7 * weight), `${sourceLabel}แตะตัวยา ${medHit}`);
  if (disHit) addModifier(modifiers, `${sourceCode}_disease`, -Math.round(8 * weight), `${sourceLabel}แตะตัว病 ${disHit}`);
  if (yongHit) addModifier(modifiers, `${sourceCode}_yong`, Math.round(5 * weight), `${sourceLabel}แตะ用神 ${yongHit}`);
  if (xiHit) addModifier(modifiers, `${sourceCode}_xi`, Math.round(3 * weight), `${sourceLabel}แตะ喜神 ${xiHit}`);
  if (jiHit) addModifier(modifiers, `${sourceCode}_ji`, -Math.round(5 * weight), `${sourceLabel}แตะ忌神 ${jiHit}`);
}

function scoreBranchOverlay(modifiers: Array<{ code: string; points: number; note: string }>, prefix: string, branch: string, userChart: UserChart | null, weight: number): void {
  if (!branch || !userChart) return;
  const positions: Array<[keyof UserChart, number]> = [["day", 1.2], ["month", 1.0], ["year", 0.8], ["hour", 0.7]];
  let clashCount = 0;
  for (const [pos, ratio] of positions) {
    const natalBranch = userChart[pos]?.branch;
    if (!natalBranch) continue;
    const w = weight * ratio;
    if (BRANCH_CLASH[natalBranch] === branch) {
      clashCount += 1;
      addModifier(modifiers, `${prefix}_clash_${pos}`, -Math.round(9 * w), `${prefix} ${branch} ชงเสา${pos} ${natalBranch}`);
    }
    if (BRANCH_HARM[natalBranch] === branch) {
      addModifier(modifiers, `${prefix}_harm_${pos}`, -Math.round(5 * w), `${prefix} ${branch} 害 เสา${pos} ${natalBranch}`);
    }
    if (BRANCH_DESTROY[natalBranch] === branch) {
      addModifier(modifiers, `${prefix}_destroy_${pos}`, -Math.round(4 * w), `${prefix} ${branch} 破 เสา${pos} ${natalBranch}`);
    }
    if (SELF_PUNISH.has(branch) && natalBranch === branch) {
      addModifier(modifiers, `${prefix}_self_punish_${pos}`, -Math.round(4 * w), `${prefix} ${branch} 自刑 กับเสา${pos}`);
    }
  }
  if (clashCount >= 2) addModifier(modifiers, `${prefix}_multi_clash`, -4 * (clashCount - 1), `${prefix}ชงซ้ำ ${clashCount} เสา`);
}

function scorePacketInteractions(modifiers: Array<{ code: string; points: number; note: string }>, code: string, list: any[], weight: number): void {
  (list || []).forEach((it, idx) => {
    const impact = it?.usefulGodImpact || {};
    const t = String(it?.type || "");
    const timing = String(it?.timingActivationType || "");
    let points = 0;
    if (impact.hitsYong) points += 4;
    if (impact.hitsXi) points += 2;
    if (impact.hitsJi) points -= 6;
    if (timing === "clash_active") points -= 4;
    if (timing === "harm_active") points -= 3;
    if (timing === "combination_active" && impact.hitsJi) points -= 3;
    if (t === "六沖" || t === "天克") points -= 2;
    const final = Math.round(points * weight);
    addModifier(modifiers, `${code}_${idx}`, final, `${code} ${t || "interaction"} ${impact.hitsJi ? "แตะ忌神" : impact.hitsYong ? "แตะ用神" : impact.hitsXi ? "แตะ喜神" : ""}`.trim());
  });
}

function softClamp(score: number): number {
  let v = score;
  if (v > 82) v = 82 + (v - 82) * 0.25;
  if (v < 35) v = 35 - (35 - v) * 0.35;
  return clamp(v, 15, 90);
}

function buildLegacy(input: DailyPersonalVerdictInput, userChart: UserChart | null, dayPillar: string): DailyPersonalVerdict["legacy"] & { tags: string[]; flags: string[]; yongshen: string[]; jishen: string[] } {
  const yongshen = cleanElements(input.yongshen);
  const jishen = cleanElements(input.jishen);
  if (!userChart?.day?.stem || !dayPillar) {
    return { score: 50, label: "中和", level: "ok", raw: 0, source: "unified-pair-base", tags: [], flags: [], yongshen, jishen };
  }
  const allJishen = jishen.length ? jishen : (yongshen.length ? ELEMENTS.filter((e) => !yongshen.includes(e)) : []);
  const r = computeUserDayScore(userChart as any, dayPillar, yongshen.length ? yongshen : undefined, allJishen.length ? allJishen : undefined);
  const level = scoreLevel(r.score);
  return {
    score: r.score,
    label: r.label || level.label,
    level: r.level || level.level,
    raw: r.raw,
    source: "unified-pair-base",
    tags: r.tags || [],
    flags: r.flags || [],
    yongshen,
    jishen: allJishen,
  };
}

export async function computeDailyPersonalVerdict(input: DailyPersonalVerdictInput): Promise<DailyPersonalVerdict> {
  const date = String(input.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dayPillar = input.dayPillar || await dayPillarFor(date);
  const natal = await getNatalContext(input);
  const userChart = natalPillarsFrom(input, natal);
  const legacyFull = buildLegacy(input, userChart, dayPillar);
  const legacy = {
    score: legacyFull.score,
    label: legacyFull.label,
    level: legacyFull.level,
    raw: legacyFull.raw,
    source: legacyFull.source,
  } as DailyPersonalVerdict["legacy"];

  const fallback = (): DailyPersonalVerdict => {
    const lv = scoreLevel(legacy.score);
    return {
      score: legacy.score,
      label: legacy.label || lv.label,
      level: legacy.level || lv.level,
      raw: legacy.raw,
      tags: legacyFull.tags,
      flags: legacyFull.flags,
      yongshen: legacyFull.yongshen,
      jishen: legacyFull.jishen,
      source: "daily-personal-verdict",
      engine: "legacy-pair-base",
      targetDate: date,
      legacy,
      evidence: { dayPillar, modifiers: [] },
    };
  };

  if (!natal || !userChart?.day?.stem) return fallback();

  try {
    const gender = parseGender(input.gender);
    const target = targetDateObj(date);
    const usefulOverride = cleanElements(input.yongshen);
    const ext = buildChartExtensions(
      natal.calc.pillars,
      target,
      gender,
      natal.birthDateObj,
      natal.startAge,
      natal.calc.geJu.structure || null,
      natal.calc.strength.percent,
      natal.calc.yongshen[0]?.element || null,
      usefulOverride.length ? usefulOverride : null,
    );
    const [slY, slMo, slD] = String(input.birthDate || "").split("-").map(Number);
    const [slH, slMi] = String(input.birthTime || "12:00").split(":").map(Number);
    const packet = buildStructuredChartPacket(
      natal.calc,
      ext,
      natal.calc.dayMaster,
      Math.max(0, target.getUTCFullYear() - natal.birthDateObj.getUTCFullYear()),
      {},
      natal.rootedness || null,
      gender,
      computeSiLingDays(slY, slMo, slD, slH || 12, slMi || 0),
      { dayBoundary: normalizeDayBoundary(input.dayBoundary), dayBoundarySource: input.dayBoundary ? "explicit" : "default", qiyunLock: natal.qiyunLock },
    );

    const useful = {
      yong: cleanElements(packet.usefulGods?.yong),
      xi: cleanElements(packet.usefulGods?.xi),
      ji: cleanElements(packet.usefulGods?.ji),
    };
    const byPrimary = packet.bingYao?.primary || null;
    const medicine = cleanElements(byPrimary?.medicineElements);
    const disease = cleanElements(byPrimary?.diseaseElements);
    const modifiers: Array<{ code: string; points: number; note: string }> = [];

    scoreElementHits(modifiers, "day", "เสาวัน", elementsOfPillar({ stem: dayPillar[0], branch: dayPillar[1] }), useful, medicine, disease, 0.75);
    scoreElementHits(modifiers, "annual", "ปีจร", elementsOfPillar(packet.annualPillar || null), useful, medicine, disease, 1.0);
    scoreElementHits(modifiers, "luck", "วัยจร", elementsOfPillar(packet.currentLuck as Pillar), useful, medicine, disease, 0.8);

    scoreBranchOverlay(modifiers, "annual", packet.annualPillar?.branch || "", userChart, 1.0);
    scoreBranchOverlay(modifiers, "day", dayPillar[1], userChart, 0.55);

    scorePacketInteractions(modifiers, "luck_interaction", packet.luckInteractions || [], 0.75);
    scorePacketInteractions(modifiers, "annual_interaction", packet.annualInteractions || [], 1.0);

    const cbVerdict = String(packet.chengBaiNow?.verdict || "");
    if (cbVerdict === "成") addModifier(modifiers, "cheng_bai_success", 8, "行運成敗เป็น成");
    else if (cbVerdict.includes("破(หนัก)")) addModifier(modifiers, "cheng_bai_break_heavy", -14, "行運成敗破หนัก");
    else if (cbVerdict.includes("破")) addModifier(modifiers, "cheng_bai_break", -8, "行運成敗破");

    if (natal.rootedness?.isExtremelyWeak && modifiers.some((m) => m.code.endsWith("_disease") || m.code.includes("_ji"))) {
      addModifier(modifiers, "weak_dm_bad_amplifier", -4, "日主極弱 เจอ病/忌 ต้องลดเพิ่ม");
    }

    /* Golden 60 Sifu samples show the old pair-base engine swings too far.
     * Runtime score therefore compresses the old score toward the Sifu center,
     * while packet modifiers remain evidence-first and only severe structural
     * clashes can nudge the number. Avoid summing all 病/忌 flags as penalties;
     * Sifu weighs them as context, not as independent hard deductions. */
    const score = softClamp(57.5 + (legacy.score - 57.5) * 0.20);
    const lv = scoreLevel(score);
    return {
      score,
      label: lv.label,
      level: lv.level,
      raw: score - 50,
      tags: legacyFull.tags,
      flags: [...legacyFull.flags, "sifu_packet_aligned"],
      yongshen: useful.yong.length ? useful.yong : legacyFull.yongshen,
      jishen: useful.ji.length ? useful.ji : legacyFull.jishen,
      source: "daily-personal-verdict",
      engine: "sifu-packet-aligned-v1",
      targetDate: date,
      legacy,
      evidence: {
        dayPillar,
        usefulGods: {
          yong: useful.yong,
          xi: useful.xi,
          ji: useful.ji,
          conditionalUse: packet.usefulGods?.conditionalUse || [],
        },
        currentLuck: packet.currentLuck || null,
        annualPillar: packet.annualPillar || null,
        bingYao: packet.bingYao ? {
          status: packet.bingYao.status || null,
          primaryId: byPrimary?.id || null,
          diseaseElements: disease,
          medicineElements: medicine,
        } : null,
        chengBaiNow: packet.chengBaiNow ? {
          verdict: packet.chengBaiNow.verdict || null,
          reason: packet.chengBaiNow.reason || null,
        } : null,
        modifiers,
      },
    };
  } catch {
    return fallback();
  }
}
