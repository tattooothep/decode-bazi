/**
 * fengshui-luxing.ts · ดาวจร 玄空飛星 3 ชั้น (月盤 / 日盤 / 時盤)
 *
 * Layer: ฮวงจุ้ย add-on (Layer 2/3) · deterministic · ไม่แตะ Layer 0/1
 * ใช้สำหรับ /api/fengshui-snapshot (additive · ไม่กระทบ field เดิม)
 *
 * แหล่งสูตร (จาก research คัมภีร์ · verify worked example แล้ว):
 *  - 月盤 口訣「子午卯酉八白求，辰戌丑未五宮游，四孟之年從二黑，逆尋月份順宮流」
 *  - 日盤 口訣「冬至雨水及谷雨，陽順一七四中游。夏至處暑霜降後，九三六星逆行求」
 *  - 時盤 口訣「天一九，地四六，人七三 · 一四七陽順，三六九陰逆」(造命宗鏡集)
 *
 * ทุกค่า deterministic · คำนวณจาก 干支วัน + 節氣 (tyme4ts) ตรง ๆ ทุกครั้ง
 * ⚠️ ห้ามคำนวณแบบลูกโซ่ "วันก่อน+1" — รอยต่อ 6 節氣 ของ日盤 ดาวกระโดด
 */

import { SolarTime, SolarTerm, type SixtyCycle } from "tyme4ts";

// ── ทิศ key ตรงกับ PALACE_DIRS_GRID เดิมของ route ──
export type Dir9 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";
export type PalaceStars = Record<Exclude<Dir9, never>, number>;

// ── การบินลง 9 ช่อง (洛書) ──
// ลำดับวัง: 中5→乾6(NW)→兌7(W)→艮8(NE)→離9(S)→坎1(N)→坤2(SW)→震3(E)→巽4(SE)
// 順飛: เลข+1 ตามลำดับ · 逆飛: เลข−1 (วน 1-9)
// LUOSHU_PATH[i] = ทิศที่ลำดับ i (i=0 คือ中宮)
const LUOSHU_PATH: Dir9[] = ["C", "NW", "W", "NE", "S", "N", "SW", "E", "SE"];

function wrap9(n: number): number {
  let x = n % 9;
  if (x <= 0) x += 9;
  return x;
}

// mod9 ตามคัมภีร์: x % 9 · ถ้า 0 → 9
function mod9(x: number): number {
  const r = ((x % 9) + 9) % 9;
  return r === 0 ? 9 : r;
}

/**
 * บินดาวกลาง中宮ลง 9 ช่อง · คืน star number ต่อทิศ
 * @param center ดาวกลาง (1-9)
 * @param forward true = 順飛 (เลข+1 ตามลำดับวัง) · false = 逆飛 (เลข−1)
 */
export function flyStars(center: number, forward: boolean): PalaceStars {
  const out = {} as PalaceStars;
  LUOSHU_PATH.forEach((dir, i) => {
    out[dir] = forward ? wrap9(center + i) : wrap9(center - i);
  });
  return out;
}

// ── กลุ่ม地支 3 หมวด ──
const GROUP_ZIWUMAOYOU = new Set(["子", "午", "卯", "酉"]); // 四仲
const GROUP_CHENXUCHOUWEI = new Set(["辰", "戌", "丑", "未"]); // 四季
const GROUP_YINSHENSIHAI = new Set(["寅", "申", "巳", "亥"]); // 四孟

type ZhiGroup = "ziwumaoyou" | "chenxuchouwei" | "yinshensihai";
function zhiGroup(branch: string): ZhiGroup {
  if (GROUP_ZIWUMAOYOU.has(branch)) return "ziwumaoyou";
  if (GROUP_CHENXUCHOUWEI.has(branch)) return "chenxuchouwei";
  return "yinshensihai";
}

// 地支 寅 = 月序 1 ... 丑 = 12 (節氣月)
const MONTH_BRANCH_ORDER = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"];
function monthNoFromBranch(monthBranch: string): number {
  const i = MONTH_BRANCH_ORDER.indexOf(monthBranch);
  return i < 0 ? 1 : i + 1; // 寅月=1 ... 丑月=12
}

// 12 ยาม子=0..亥=11
const HOUR_BRANCH_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
function hourIndexFromBranch(hourBranch: string): number {
  const i = HOUR_BRANCH_ORDER.indexOf(hourBranch);
  return i < 0 ? 0 : i;
}

// ── ตัวช่วย tyme4ts ──
// สร้าง SolarTime จาก component (local civil — ตรง convention ของ route เดิม)
// ต้องส่ง s (วินาที) ด้วย · 節氣ใน tyme4ts มีวินาที (เช่น 立春 04:02:08) ถ้าตัดทิ้ง
// จะคำนวณผิดในนาทีรอยต่อ節氣
function toSolarTime(y: number, mo: number, d: number, h: number, mi: number, s: number): SolarTime {
  return SolarTime.fromYmdHms(y, mo, d, h, mi, s);
}

// 干支วัน (ใช้ 子時 boundary ตาม convention ของ tyme · 23:00 เริ่มวันใหม่)
function dayPillar(st: SolarTime): SixtyCycle {
  return st.getSixtyCycleHour().getSixtyCycleDay().getSixtyCycle();
}
function hourPillar(st: SolarTime): SixtyCycle {
  return st.getSixtyCycleHour().getSixtyCycle();
}
// เสาปี/เดือน (節氣) ผ่าน EightChar
function yearMonthPillar(st: SolarTime): { year: SixtyCycle; month: SixtyCycle } {
  const ec = st.getLunarHour().getEightChar();
  return { year: ec.getYear(), month: ec.getMonth() };
}

// 干支序數 1-based (甲子=1 ... 癸亥=60) · tyme getIndex() = 0-based
function ganzhiSeq(sc: SixtyCycle): number {
  return sc.getIndex() + 1;
}

// ── 月盤 (เดือนจร) ──
// center中宮 ตามกลุ่ม地支ปี · เปลี่ยนเดือนที่ 節氣 (default · มีสำนักใช้จันทรคติ)
export type MonthStars = {
  center: number;
  direction: "順" | "逆";
  palaces: PalaceStars;
  year_branch: string;
  jieqi_month: number; // 寅月=1 ... 丑月=12
  month_branch: string;
  note: string;
};
function centerOfMonthPan(yearBranch: string, m: number): number {
  switch (zhiGroup(yearBranch)) {
    case "ziwumaoyou":
      return mod9(18 - m); // 子午卯酉 → 八白求
    case "chenxuchouwei":
      return mod9(15 - m); // 辰戌丑未 → 五宮游
    case "yinshensihai":
      return mod9(12 - m); // 寅申巳亥(四孟) → 二黑
  }
}

// ── 日盤 (วันจร) ──
// N = 日干支序數 (1-60) · period จาก 節氣 (floor(termIndex/4))
//   period 0 [冬至,雨水): 順 mod9(N)
//   period 1 [雨水,谷雨): 順 mod9(N+6)
//   period 2 [谷雨,夏至): 順 mod9(N+3)
//   period 3 [夏至,处暑): 逆 10-mod9(N)
//   period 4 [处暑,霜降): 逆 10-mod9(N+6)
//   period 5 [霜降,冬至): 逆 10-mod9(N+3)
export type DayStars = {
  center: number;
  direction: "順" | "逆";
  palaces: PalaceStars;
  dun: "yang" | "yin";
  day_pillar: string;
  ganzhi_seq: number;
  jieqi_period: number; // 0-5
  jieqi_period_name: string;
  day_school: DaySchool;
  school_flag: string;
};
const DAY_PERIOD_NAMES = ["冬至→雨水", "雨水→谷雨", "谷雨→夏至", "夏至→处暑", "处暑→霜降", "霜降→冬至"];
function dayPeriodOf(st: SolarTime): number {
  // term ปัจจุบัน (most recent <= now) · index 冬至=0..大雪=23
  const idx = st.getTerm().getIndex();
  return Math.floor(idx / 4); // 0-5
}
// day_school: 'zaoming' (default · ครึ่งร้อน逆飛 · 造命宗鏡集/นิยมสุด)
//             'shen'    (沈氏 · 順飛ตลอดทั้งปี)
export type DaySchool = "zaoming" | "shen";
function centerOfDayPan(N: number, period: number, school: DaySchool): { center: number; forward: boolean } {
  // ครึ่งหนาว (period 0-2) = 陽遁順飛 ทุกสำนัก (มั่นใจสูง)
  switch (period) {
    case 0:
      return { center: mod9(N), forward: true };
    case 1:
      return { center: mod9(N + 6), forward: true };
    case 2:
      return { center: mod9(N + 3), forward: true };
  }
  // ครึ่งร้อน (period 3-5): 2 สำนัก
  //  - zaoming (default): 陰遁逆飛 · center = 10 − mod9(...)
  //  - shen: 順飛ตลอด · center = mod9(...) เหมือนครึ่งหนาวต่อเนื่อง (起9/3/6)
  const base = period === 3 ? N : period === 4 ? N + 6 : N + 3;
  if (school === "shen") {
    // 沈氏 順飛ตลอด: 夏至甲子起9 · 处暑甲子起3 · 霜降甲子起6 · +1 順ทุกวัน
    // 甲子(N=1) → center=start · center = mod9(start + (N−1) + monthOffset)
    const start = period === 3 ? 9 : period === 4 ? 3 : 6;
    const monthOffset = period === 3 ? 0 : period === 4 ? 6 : 3;
    return { center: mod9(start + (N - 1) + monthOffset), forward: true };
  }
  // default zaoming 逆飛
  return { center: 10 - mod9(base), forward: false };
}

// ── 時盤 (ยามจร) ──
// 子時入中 ขึ้นกับกลุ่ม地支วัน + 冬至/夏至 (陽遁/陰遁) · ยาม順(陽)/逆(陰)
//   陽(冬至後): 子午卯酉日→1 · 寅申巳亥日→7 · 辰戌丑未日→4 · ยาม +1 順
//   陰(夏至後): 子午卯酉日→9 · 寅申巳亥日→3 · 辰戌丑未日→6 · ยาม −1 逆 (合十)
export type HourStars = {
  center: number;
  direction: "順" | "逆";
  palaces: PalaceStars;
  dun: "yang" | "yin";
  day_branch: string;
  hour_branch: string;
  hour_index: number;
  note: string;
};
// 陽遁 = หลัง冬至 ก่อน夏至 · ใช้ day period 0,1,2 (順) = 陽
function isYangDunForHour(dayPeriod: number): boolean {
  return dayPeriod <= 2; // [冬至..夏至) = 陽 · [夏至..冬至) = 陰
}
function ziHourCenter(dayBranch: string, yang: boolean): number {
  const g = zhiGroup(dayBranch);
  if (yang) {
    if (g === "ziwumaoyou") return 1;
    if (g === "yinshensihai") return 7;
    return 4; // chenxuchouwei
  } else {
    if (g === "ziwumaoyou") return 9;
    if (g === "yinshensihai") return 3;
    return 6; // chenxuchouwei
  }
}

/**
 * คำนวณดาวจร 3 ชั้น จากเวลา (local civil components · ตรง convention route เดิม)
 */
export function computeFlyingLayers(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s = 0,
  daySchool: DaySchool = "zaoming"
) {
  const st = toSolarTime(y, mo, d, h, mi, s);

  // เสาปี/เดือน (節氣) · 干支วัน · 干支ยาม
  const { year: yearP, month: monthP } = yearMonthPillar(st);
  const dayP = dayPillar(st);
  const hourP = hourPillar(st);

  const yearBranch = yearP.getEarthBranch().getName();
  const monthBranch = monthP.getEarthBranch().getName();
  const dayBranch = dayP.getEarthBranch().getName();
  const hourBranch = hourP.getEarthBranch().getName();

  // ── 月盤 ──
  const m = monthNoFromBranch(monthBranch);
  const monthCenter = centerOfMonthPan(yearBranch, m);
  const month_stars: MonthStars = {
    center: monthCenter,
    direction: "順",
    palaces: flyStars(monthCenter, true), // 月盤 順飛เสมอ
    year_branch: yearBranch,
    jieqi_month: m,
    month_branch: monthBranch,
    note: "中宮ตามกลุ่ม地支ปี · เปลี่ยนเดือนที่ 節氣 (寅月=立春) · มีสำนักใช้จันทรคติ แต่ default ใช้ 節氣 · 順飛",
  };

  // ── 日盤 ──
  const N = ganzhiSeq(dayP);
  const dayPeriod = dayPeriodOf(st);
  const { center: dayCenter, forward: dayForward } = centerOfDayPan(N, dayPeriod, daySchool);
  const day_stars: DayStars = {
    center: dayCenter,
    direction: dayForward ? "順" : "逆",
    palaces: flyStars(dayCenter, dayForward),
    dun: dayForward ? "yang" : "yin",
    day_pillar: dayP.getName(),
    ganzhi_seq: N,
    jieqi_period: dayPeriod,
    jieqi_period_name: DAY_PERIOD_NAMES[dayPeriod],
    day_school: daySchool,
    school_flag:
      "yin_yang_dun (ครึ่งร้อน陰遁逆飛 = default · มีสำนัก沈氏ใช้順飛ตลอด) · ดาวกลางคำนวณจาก N+ช่วง節氣ตรง ๆ ทุกวัน (ไม่ลูกโซ่)",
  };

  // ── 時盤 ──
  const hourYang = isYangDunForHour(dayPeriod);
  const ziCenter = ziHourCenter(dayBranch, hourYang);
  const hourIdx = hourIndexFromBranch(hourBranch);
  // ยาม +1順(陽) / −1逆(陰) จาก子時
  const hourCenter = hourYang ? wrap9(ziCenter + hourIdx) : wrap9(ziCenter - hourIdx);
  const hour_stars: HourStars = {
    center: hourCenter,
    direction: hourYang ? "順" : "逆",
    palaces: flyStars(hourCenter, hourYang),
    dun: hourYang ? "yang" : "yin",
    day_branch: dayBranch,
    hour_branch: hourBranch,
    hour_index: hourIdx,
    note: "子時入中ตามกลุ่ม地支วัน+冬至/夏至 · 陽遁順飛 / 陰遁逆飛 (合十) · 造命宗鏡集",
  };

  const luxing_note =
    `ดาวจร玄空飛星 3 ชั้น · ` +
    `月盤(${month_stars.month_branch}月·節氣เดือนที่${month_stars.jieqi_month}, 順飛) · ` +
    `日盤(${day_stars.jieqi_period_name}, ${day_stars.dun === "yang" ? "陽遁順飛" : "陰遁逆飛(default 造命/沈氏可順)"}) · ` +
    `時盤(${hour_stars.dun === "yang" ? "陽遁順飛" : "陰遁逆飛"}) · ` +
    `เปลี่ยนชั้นที่ 節氣 (tyme4ts) · default day_school='zaoming' (ครึ่งร้อน逆飛)`;

  return { month_stars, day_stars, hour_stars, luxing_note };
}
