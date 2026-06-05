import type { ActivityType, EarthlyBranch, ModuleResult } from "../luck-engine/types";
import type { Dir8 } from "./mountains";

export const MONTH_SHA_BY_MONTH_BRANCH: Record<EarthlyBranch, EarthlyBranch> = {
  寅: "丑",
  卯: "戌",
  辰: "未",
  巳: "辰",
  午: "丑",
  未: "戌",
  申: "未",
  酉: "辰",
  戌: "丑",
  亥: "戌",
  子: "未",
  丑: "辰",
};

const DAY_SHA_DIR_BY_GROUP: Array<{ branches: EarthlyBranch[]; dir: Dir8; zh: string; thai: string }> = [
  { branches: ["巳", "酉", "丑"], dir: "E", zh: "煞東", thai: "ซาทิศตะวันออก" },
  { branches: ["亥", "卯", "未"], dir: "W", zh: "煞西", thai: "ซาทิศตะวันตก" },
  { branches: ["申", "子", "辰"], dir: "S", zh: "煞南", thai: "ซาทิศใต้" },
  { branches: ["寅", "午", "戌"], dir: "N", zh: "煞北", thai: "ซาทิศเหนือ" },
];

const HEAVY_ACTIVITY = new Set<ActivityType>(["動土", "搬家", "開市", "出行"]);
const GROUND_ACTIVITY = new Set<ActivityType>(["動土", "搬家"]);

export function dayShaDirection(dayBranch: EarthlyBranch): { dir: Dir8; zh: string; thai: string } | null {
  const row = DAY_SHA_DIR_BY_GROUP.find((x) => x.branches.includes(dayBranch));
  return row ? { dir: row.dir, zh: row.zh, thai: row.thai } : null;
}

export function evaluateMonthDaySha(input: {
  monthBranch: EarthlyBranch;
  dayBranch: EarthlyBranch;
  activityType: ActivityType;
  targetDirection?: Dir8 | null;
}): Pick<ModuleResult, "tags" | "reasons" | "caps" | "pass"> & { delta: number; raw: Record<string, unknown> } {
  const tags: string[] = [];
  const up: ModuleResult["reasons"]["up"] = [];
  const down: ModuleResult["reasons"]["down"] = [];
  const warning: ModuleResult["reasons"]["warning"] = [];
  const caps: NonNullable<ModuleResult["caps"]> = [];
  let pass = true;
  let delta = 0;

  const monthSha = MONTH_SHA_BY_MONTH_BRANCH[input.monthBranch];
  if (monthSha === input.dayBranch) {
    const heavy = GROUND_ACTIVITY.has(input.activityType);
    tags.push("month_sha_hit");
    delta -= heavy ? 28 : 12;
    if (heavy) {
      pass = false;
      caps.push({
        type: "max",
        value: 42,
        reason: `月煞ตรงวัน (${input.monthBranch}月 ${input.dayBranch}日) งานขุด/ย้าย/เปิดพื้นที่ไม่ควรดันคะแนนสูง`,
        source: "ze_ri",
      });
    }
    warning.push({
      code: "MONTH_SHA_HIT",
      thai: heavy
        ? `ติด月煞: เดือน${input.monthBranch} เจอวัน${input.dayBranch} งานแตะพื้นดินควรเลี่ยง`
        : `ติด月煞: ใช้เป็นสัญญาณระวัง ไม่ใช่ตัวตัดงานคนล้วน`,
      zh: `月煞 ${input.monthBranch}月忌${input.dayBranch}日`,
      delta: heavy ? -28 : -12,
      severity: heavy ? "critical" : "warning",
      source: "ze_ri",
    });
  }

  const daySha = dayShaDirection(input.dayBranch);
  if (daySha) {
    tags.push(`day_sha_${daySha.dir}`);
    if (input.targetDirection && input.targetDirection === daySha.dir && HEAVY_ACTIVITY.has(input.activityType)) {
      pass = false;
      delta -= 20;
      caps.push({
        type: "max",
        value: 48,
        reason: `日煞${daySha.thai} ตรงทิศเป้าหมาย`,
        source: "ze_ri",
      });
      warning.push({
        code: "DAY_SHA_DIRECTION_HIT",
        thai: `ติด日煞: วันนี้${daySha.thai} ไม่เหมาะใช้ทิศนี้กับงานเดินทาง/ย้าย/ขุด`,
        zh: daySha.zh,
        delta: -20,
        severity: "critical",
        source: "ze_ri",
      });
    } else {
      warning.push({
        code: "DAY_SHA_DIRECTION_NOTE",
        thai: `日煞วันนี้อยู่${daySha.thai} ถ้างานต้องใช้ทิศนี้ให้ระวัง`,
        zh: daySha.zh,
        delta: 0,
        severity: "info",
        source: "ze_ri",
      });
    }
  }

  return {
    tags,
    reasons: { up, down, warning },
    caps,
    pass,
    delta,
    raw: { monthSha, daySha },
  };
}
