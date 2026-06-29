import { getSolarTimeAtTST } from "./bazi-calc";
import { monthPillarBoundary, yearPillarBoundary } from "./bazi-boundary";

export type QiyunLockMode = "4p_exact" | "3p_range" | "3p_scenario" | "unavailable";
export type QiyunDirection = "forward" | "backward" | "scenario" | "unknown";

export type QiyunLuckStep = {
  index: number;
  stem: string;
  branch: string;
  ageStartRange: { min: number; max: number };
  ageEndRange: { min: number; max: number };
};

export type QiyunScenario = {
  id: string;
  localTimeStart: string;
  localTimeEnd: string;
  yearPillar: string;
  monthPillar: string;
  dayPillarStart: string;
  dayPillarEnd: string;
  direction: "forward" | "backward";
  startAgeRange: { min: number; max: number };
  representativeStartAge: number;
  luckSequence: QiyunLuckStep[];
};

export type QiyunLock = {
  tag: "HK_QIYUN_LOCK_V1";
  mode: QiyunLockMode;
  birthTimeKnown: boolean;
  authority: "tyme4ts_childlimit" | "full_day_interval" | "unavailable";
  direction: QiyunDirection;
  startAgeRange: { min: number; max: number } | null;
  representativeStartAge: number | null;
  representativeReason: string | null;
  scenarios: QiyunScenario[];
  targetYearDayun: {
    year: number;
    status: "locked" | "ambiguous" | "unavailable";
    candidates: Array<{ stem: string; branch: string; scenarioId: string }>;
  };
  aiPolicy: "read_packet_only_do_not_recompute";
  error?: string;
};

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const STEM_POLARITY: Record<string, "yang" | "yin"> = {
  甲: "yang", 丙: "yang", 戊: "yang", 庚: "yang", 壬: "yang",
  乙: "yin", 丁: "yin", 己: "yin", 辛: "yin", 癸: "yin",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function minuteToTime(minute: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minute)));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function parseIctMinuteOnDate(date: string, value?: string): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m || m[1] !== date) return null;
  return Number(m[2]) * 60 + Number(m[3]);
}

function directionFromYearStem(yearStem: string, gender: "M" | "F"): "forward" | "backward" {
  const pol = STEM_POLARITY[yearStem] || "yang";
  return (pol === "yang" && gender === "M") || (pol === "yin" && gender === "F") ? "forward" : "backward";
}

function ageFromChildLimit(cl: {
  getYearCount: () => number;
  getMonthCount: () => number;
  getDayCount: () => number;
  getHourCount?: () => number;
  getMinuteCount?: () => number;
}): number {
  const h = typeof cl.getHourCount === "function" ? cl.getHourCount() : 0;
  const mi = typeof cl.getMinuteCount === "function" ? cl.getMinuteCount() : 0;
  return round2(
    cl.getYearCount() +
    cl.getMonthCount() / 12 +
    cl.getDayCount() / 365.25 +
    h / (365.25 * 24) +
    mi / (365.25 * 24 * 60)
  );
}

function buildLuckSequence(monthPillar: string, yearStem: string, gender: "M" | "F", startAgeRange: { min: number; max: number }): QiyunLuckStep[] {
  const monthStem = monthPillar[0];
  const monthBranch = monthPillar[1];
  const direction = directionFromYearStem(yearStem, gender);
  const dir = direction === "forward" ? 1 : -1;
  const stemIdx = STEMS.indexOf(monthStem);
  const branchIdx = BRANCHES.indexOf(monthBranch);
  if (stemIdx < 0 || branchIdx < 0) return [];
  const out: QiyunLuckStep[] = [];
  for (let i = 1; i <= 8; i++) {
    const ageMin = round2(startAgeRange.min + (i - 1) * 10);
    const ageMax = round2(startAgeRange.max + (i - 1) * 10);
    out.push({
      index: i,
      stem: STEMS[(stemIdx + dir * i + 100) % 10],
      branch: BRANCHES[(branchIdx + dir * i + 120) % 12],
      ageStartRange: { min: ageMin, max: ageMax },
      ageEndRange: { min: round2(ageMin + 10), max: round2(ageMax + 10) },
    });
  }
  return out;
}

function candidateAtAge(sequence: QiyunLuckStep[], age: number): Array<{ stem: string; branch: string }> {
  const hits = sequence.filter((s) =>
    age >= s.ageStartRange.min && age < s.ageEndRange.max
  );
  return (hits.length ? hits : sequence.filter((s) =>
    age >= s.ageStartRange.max && age < s.ageEndRange.min
  )).map((s) => ({ stem: s.stem, branch: s.branch }));
}

async function sampleQiyun(input: {
  date: string;
  minute: number;
  gender: "M" | "F";
  lng: number;
  dayBoundary?: "23:00" | "00:00";
}) {
  const tyme = await import("tyme4ts");
  const time = minuteToTime(input.minute);
  const { st } = await getSolarTimeAtTST({
    date: input.date,
    time,
    longitude: input.lng,
    gmtOffsetHours: 7,
    gender: input.gender,
    dayBoundary: input.dayBoundary,
    birthTimeKnown: true,
  });
  const g = input.gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
  const cl = tyme.ChildLimit.fromSolarTime(st, g);
  const ec = st.getLunarHour().getEightChar();
  return {
    time,
    startAge: ageFromChildLimit(cl),
    yearPillar: ec.getYear().getName(),
    monthPillar: ec.getMonth().getName(),
    dayPillar: ec.getDay().getName(),
  };
}

function targetCandidates(scenarios: QiyunScenario[], birthYear: number, targetYear: number) {
  const age = targetYear - birthYear;
  const candidates: Array<{ stem: string; branch: string; scenarioId: string }> = [];
  for (const scenario of scenarios) {
    const checks = [
      ...candidateAtAge(scenario.luckSequence, age),
      ...candidateAtAge(scenario.luckSequence, age - 0.99),
      ...candidateAtAge(scenario.luckSequence, age + 0.99),
    ];
    for (const c of checks) {
      if (!candidates.some((x) => x.stem === c.stem && x.branch === c.branch && x.scenarioId === scenario.id)) {
        candidates.push({ ...c, scenarioId: scenario.id });
      }
    }
  }
  return candidates;
}

export async function computeQiyunLock(input: {
  date: string;
  time?: string;
  gender: "M" | "F";
  lng?: number;
  birthTimeKnown: boolean;
  dayBoundary?: "23:00" | "00:00";
  targetYear?: number;
}): Promise<QiyunLock> {
  const lng = Number.isFinite(Number(input.lng)) ? Number(input.lng) : 100.5018;
  const targetYear = input.targetYear || new Date().getFullYear();
  const birthYear = Number(input.date.slice(0, 4));
  try {
    if (input.birthTimeKnown) {
      const rawTime = (input.time || "12:00").slice(0, 5);
      const minute = Number(rawTime.slice(0, 2)) * 60 + Number(rawTime.slice(3, 5));
      const sample = await sampleQiyun({ date: input.date, minute, gender: input.gender, lng, dayBoundary: input.dayBoundary });
      const direction = directionFromYearStem(sample.yearPillar[0], input.gender);
      const startAgeRange = { min: sample.startAge, max: sample.startAge };
      const scenario: QiyunScenario = {
        id: "exact",
        localTimeStart: rawTime,
        localTimeEnd: rawTime,
        yearPillar: sample.yearPillar,
        monthPillar: sample.monthPillar,
        dayPillarStart: sample.dayPillar,
        dayPillarEnd: sample.dayPillar,
        direction,
        startAgeRange,
        representativeStartAge: sample.startAge,
        luckSequence: buildLuckSequence(sample.monthPillar, sample.yearPillar[0], input.gender, startAgeRange),
      };
      const candidates = targetCandidates([scenario], birthYear, targetYear);
      const uniqueCandidate = new Set(candidates.map((c) => `${c.stem}${c.branch}`));
      return {
        tag: "HK_QIYUN_LOCK_V1",
        mode: "4p_exact",
        birthTimeKnown: true,
        authority: "tyme4ts_childlimit",
        direction,
        startAgeRange,
        representativeStartAge: sample.startAge,
        representativeReason: "exact_birth_time_childlimit",
        scenarios: [scenario],
        targetYearDayun: {
          year: targetYear,
          status: uniqueCandidate.size === 1 ? "locked" : (candidates.length ? "ambiguous" : "unavailable"),
          candidates,
        },
        aiPolicy: "read_packet_only_do_not_recompute",
      };
    }

    const splitPoints = new Set<number>([0, 1440]);
    const mb = monthPillarBoundary(input.date);
    const yb = yearPillarBoundary(input.date);
    const mMinute = parseIctMinuteOnDate(input.date, mb.jieqiIctApprox);
    const yMinute = parseIctMinuteOnDate(input.date, yb.jieqiIctApprox);
    for (const m of [mMinute, yMinute]) {
      if (m != null && m > 0 && m < 1440) splitPoints.add(m);
    }
    const sorted = Array.from(splitPoints).sort((a, b) => a - b);
    const scenarios: QiyunScenario[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const endExclusive = sorted[i + 1];
      if (endExclusive <= start) continue;
      const end = Math.max(start, endExclusive - 1);
      const mid = Math.floor((start + end) / 2);
      const a = await sampleQiyun({ date: input.date, minute: start, gender: input.gender, lng, dayBoundary: input.dayBoundary });
      const b = await sampleQiyun({ date: input.date, minute: end, gender: input.gender, lng, dayBoundary: input.dayBoundary });
      const m = await sampleQiyun({ date: input.date, minute: mid, gender: input.gender, lng, dayBoundary: input.dayBoundary });
      const min = Math.min(a.startAge, b.startAge, m.startAge);
      const max = Math.max(a.startAge, b.startAge, m.startAge);
      const startAgeRange = { min, max };
      const direction = directionFromYearStem(m.yearPillar[0], input.gender);
      scenarios.push({
        id: `s${scenarios.length + 1}`,
        localTimeStart: minuteToTime(start),
        localTimeEnd: minuteToTime(end),
        yearPillar: m.yearPillar,
        monthPillar: m.monthPillar,
        dayPillarStart: a.dayPillar,
        dayPillarEnd: b.dayPillar,
        direction,
        startAgeRange,
        representativeStartAge: round2((min + max) / 2),
        luckSequence: buildLuckSequence(m.monthPillar, m.yearPillar[0], input.gender, startAgeRange),
      });
    }
    const overallMin = Math.min(...scenarios.map((s) => s.startAgeRange.min));
    const overallMax = Math.max(...scenarios.map((s) => s.startAgeRange.max));
    const representative = scenarios.find((s) => {
      const noon = 12 * 60;
      const start = Number(s.localTimeStart.slice(0, 2)) * 60 + Number(s.localTimeStart.slice(3, 5));
      const end = Number(s.localTimeEnd.slice(0, 2)) * 60 + Number(s.localTimeEnd.slice(3, 5));
      return noon >= start && noon <= end;
    }) || scenarios[0] || null;
    const directions = Array.from(new Set(scenarios.map((s) => s.direction)));
    const candidates = targetCandidates(scenarios, birthYear, targetYear);
    const uniqueCandidate = new Set(candidates.map((c) => `${c.stem}${c.branch}`));
    return {
      tag: "HK_QIYUN_LOCK_V1",
      mode: scenarios.length > 1 ? "3p_scenario" : "3p_range",
      birthTimeKnown: false,
      authority: "full_day_interval",
      direction: directions.length === 1 ? directions[0] : "scenario",
      startAgeRange: Number.isFinite(overallMin) && Number.isFinite(overallMax) ? { min: overallMin, max: overallMax } : null,
      representativeStartAge: representative?.representativeStartAge ?? null,
      representativeReason: representative ? `date_only_representative_for_existing_engine:${representative.id}` : null,
      scenarios,
      targetYearDayun: {
        year: targetYear,
        status: uniqueCandidate.size === 1 ? "locked" : (candidates.length ? "ambiguous" : "unavailable"),
        candidates,
      },
      aiPolicy: "read_packet_only_do_not_recompute",
    };
  } catch (e) {
    return {
      tag: "HK_QIYUN_LOCK_V1",
      mode: "unavailable",
      birthTimeKnown: input.birthTimeKnown,
      authority: "unavailable",
      direction: "unknown",
      startAgeRange: null,
      representativeStartAge: null,
      representativeReason: null,
      scenarios: [],
      targetYearDayun: { year: targetYear, status: "unavailable", candidates: [] },
      aiPolicy: "read_packet_only_do_not_recompute",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
