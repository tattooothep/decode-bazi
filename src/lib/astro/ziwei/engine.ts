/**
 * 紫微斗數 engine · 安星排盤 · deterministic ล้วน (ห้าม AI · ห้าม Date.now)
 *
 * ใช้ tyme4ts สำหรับปฏิทินจันทรคติ (เดือน/วัน/ปี干支)
 * อัลกอริทึม安星 cross-check กับ iztro แล้วตรงเป๊ะ (命宮/身宮/五行局/紫微/14主星/四化/大限)
 *
 * พิกัด ground index (寅=0) ดู tables.ts
 * — Ziwei engine
 */

import { SolarTime } from "tyme4ts";
import {
  BRANCHES, STEMS, PALACE_NAMES, MAJOR_STARS, type MajorStar, type PalaceName,
  ZIWEI_SERIES, TIANFU_SERIES, fix12, groundToBranch, groundToBranchIndex, groundOf,
  tigerStemIndex, stemAtGround, nayinElement, jiaziIndex, WUXING_JU,
  brightnessAt, SI_HUA, SI_HUA_TYPES, type SiHuaType,
  LU_CUN_GROUND, TIAN_MA_GROUND, KUI_YUE_GROUND, HUO_LING_START,
} from "./tables";

export type Gender = "M" | "F";

export interface StarPlacement {
  name: string;
  brightness?: string;
  siHua?: SiHuaType; // 化祿/化權/化科/化忌 (ถ้ามี)
}
export interface ZiweiPalace {
  index: number;        // ลำดับ 0=命宮 ..11=父母
  name: PalaceName;
  ground: number;       // ground index (寅=0)
  branch: string;       // 地支
  stem: string;         // 天干 (五虎遁)
  ganzhi: string;       // 干支宮
  majorStars: StarPlacement[];
  minorStars: StarPlacement[];
  isShenGong: boolean;  // เป็น身宮หรือไม่
  daXian: { ageStart: number; ageEnd: number };
}

export interface ZiweiChart {
  hasTime: boolean;
  degradeLevel: "full" | "minimal";
  /* ปฏิทิน */
  lunar: { year: string; month: number; day: number; isLeapMonth: boolean };
  yearStem: string;
  yearBranch: string;
  hourBranch: string | null;
  /* แกนดวง */
  mingGong: { ground: number; branch: string; stem: string; ganzhi: string } | null;
  shenGong: { ground: number; branch: string } | null;
  wuxingJu: { name: string; num: number } | null;
  ziweiGround: number | null;
  tianfuGround: number | null;
  /* 12 宮 */
  palaces: ZiweiPalace[];
  /* 四化 ของปีเกิด (ขึ้นกับ年干 อย่างเดียว · มีได้แม้ไม่รู้เวลา) */
  siHua: { star: string; type: SiHuaType; palaceName: PalaceName | null; branch: string | null }[];
  /* 大限四化: ใช้宮干ของแต่ละ大限宮 · AI ห้ามคำนวณเอง */
  daXianSiHua: {
    palaceName: PalaceName;
    branch: string;
    stem: string;
    ageStart: number;
    ageEnd: number;
    siHua: { star: string; type: SiHuaType; palaceName: PalaceName | null; branch: string | null }[];
  }[];
  /* 三方四正 ของ命宮 */
  sanFangSiZheng: { palaceName: PalaceName; branch: string; relation: string }[] | null;
  /* 流年 (ถ้าส่ง refDate) */
  liuNian: {
    year: number;
    ganzhi: string;
    mingBranch: string;
    mingPalaceName: PalaceName;
    siHua: { star: string; type: SiHuaType; palaceName: PalaceName | null; branch: string | null }[];
    annualStars: { star: string; palaceName: PalaceName; branch: string; source: string }[];
  } | null;
  /* 流月/流日 scaffold (ถ้าส่ง refDate) */
  liuYue: {
    year: number;
    lunarMonth: number;
    isLeapMonth: boolean;
    effectiveMonth: number;
    ganzhi: string;
    mingBranch: string;
    mingPalaceName: PalaceName;
    siHua: { star: string; type: SiHuaType; palaceName: PalaceName | null; branch: string | null }[];
    monthlyStars: { star: string; palaceName: PalaceName; branch: string; source: string }[];
    monthPalaces: { lunarMonth: number; mingBranch: string; mingPalaceName: PalaceName }[];
  } | null;
  liuRi: {
    dateISO: string;
    lunarDay: number;
    ganzhi: string;
    mingBranch: string;
    mingPalaceName: PalaceName;
    siHua: { star: string; type: SiHuaType; palaceName: PalaceName | null; branch: string | null }[];
    dailyStars: { star: string; palaceName: PalaceName; branch: string; source: string }[];
  } | null;
  notAvailable: string[];
}

/* ดึงเวลาท้องถิ่น (civil) จาก dtUTC + offset */
function localCivil(dtUTC: Date, gmtOffsetHours: number) {
  const ms = dtUTC.getTime() + gmtOffsetHours * 3_600_000;
  const d = new Date(ms);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(),
  };
}

/** hourBranchIndex (子=0); 23:00-00:59 = 子 */
function hourBranchIndexOf(h: number): number {
  return Math.floor((h + 1) / 2) % 12;
}

function splitGanzhi(ganzhi: string): { stem: string; branch: string } {
  return { stem: ganzhi.slice(0, 1), branch: ganzhi.slice(1, 2) };
}

export interface ZiweiOptions {
  gmtOffsetHours?: number; // default = Math.round(lng/15) (เขตเวลามาตรฐาน)
  refDate?: Date;          // สำหรับ流年 (deterministic · ห้ามใช้ Date.now ใน engine)
}

/**
 * คำนวณดวง紫微斗數
 * @param dtUTC  ช่วงเวลาเกิดเป็น UTC
 * @param lat    ละติจูด (เก็บไว้ใน metadata · ไม่กระทบ安星)
 * @param lng    ลองจิจูด (ใช้ประเมินเขตเวลา default)
 * @param gender "M" | "F"
 * @param hasTime ทราบเวลาเกิดหรือไม่ (ไม่ทราบ → degrade)
 */
export function ziweiChart(
  dtUTC: Date,
  lat: number,
  lng: number,
  gender: Gender,
  hasTime = true,
  opts: ZiweiOptions = {},
): ZiweiChart {
  const gmtOffsetHours = opts.gmtOffsetHours ?? Math.round(lng / 15);
  const loc = localCivil(dtUTC, gmtOffsetHours);

  /* ปฏิทินจันทรคติจาก anchor เที่ยงวัน (กันการข้ามวันที่ 23:00 ของ tyme) */
  const stNoon = SolarTime.fromYmdHms(loc.y, loc.m, loc.d, 12, 0, 0);
  const lunarDayObj = stNoon.getLunarHour().getLunarDay();
  const lunarMonthObj = lunarDayObj.getLunarMonth();
  const yearSC = lunarMonthObj.getLunarYear().getSixtyCycle();

  const lunarDay = lunarDayObj.getDay();                  // 1-30
  const rawMonth = lunarMonthObj.getMonthWithLeap();      // tyme: ค่าติดลบถ้าเป็นเดือนอธิกมาส
  const isLeapMonth = lunarMonthObj.isLeap();
  const lunarMonth = Math.abs(rawMonth);                  // เลขเดือนฐาน 1-12
  /* 安星 ใช้เดือนปรับอธิกมาส: เดือนอธิกมาส วันที่ >15 นับเป็นเดือนถัดไป (ตรง iztro fixLeap) */
  const effectiveMonth = lunarMonth + (isLeapMonth && lunarDay > 15 ? 1 : 0);
  const yearStemIndex = yearSC.getHeavenStem().getIndex();
  const yearBranchIndex = yearSC.getEarthBranch().getIndex();
  const yearStem = STEMS[yearStemIndex];
  const yearBranch = BRANCHES[yearBranchIndex];

  /* 四化 ของปีเกิด — มีเสมอ (ขึ้นกับ年干อย่างเดียว) */
  const yearSiHuaStars = SI_HUA[yearStem];

  /* ───── ไม่ทราบเวลา → degrade minimal (命宮ต้องเวลา) ───── */
  if (!hasTime) {
    return {
      hasTime: false,
      degradeLevel: "minimal",
      lunar: { year: yearSC.getName(), month: lunarMonth, day: lunarDay, isLeapMonth },
      yearStem, yearBranch, hourBranch: null,
      mingGong: null, shenGong: null, wuxingJu: null, ziweiGround: null, tianfuGround: null,
      palaces: [],
      siHua: yearSiHuaStars.map((star, i) => ({
        star, type: SI_HUA_TYPES[i], palaceName: null, branch: null,
      })),
      daXianSiHua: [],
      sanFangSiZheng: null,
      liuNian: null,
      liuYue: null,
      liuRi: null,
      notAvailable: ["命宮", "身宮", "五行局", "12宮安星", "大限", "大限四化", "三方四正", "流年", "流年四化", "流年星", "流月", "流日"],
    };
  }

  /* ───── ทราบเวลา → full chart ───── */
  const hourBranchIndex = hourBranchIndexOf(loc.h); // 子=0
  const hourBranch = BRANCHES[hourBranchIndex];

  /* 命宮: 寅起正月順數至生月 → 逆數至生時 (ground) */
  const mingGround = fix12((effectiveMonth - 1) - hourBranchIndex);
  /* 身宮: 寅起正月順數至生月 → 順數至生時 */
  const shenGround = fix12((effectiveMonth - 1) + hourBranchIndex);

  /* 五虎遁 ก้านของ命宮 + 五行局 จาก納音 */
  const mingStemIndex = stemAtGround(yearStemIndex, mingGround);
  const mingBranchIndex = groundToBranchIndex(mingGround);
  const mingElement = nayinElement(jiaziIndex(mingStemIndex, mingBranchIndex));
  const wuxingJu = WUXING_JU[mingElement];

  /* 安紫微 (五行局 × วันจันทรคติ) — อัลกอริทึม商數法 (ตรง iztro) */
  const ziweiGround = locateZiwei(lunarDay, wuxingJu.num);
  const tianfuGround = fix12(12 - ziweiGround); // 天府 สมมาตรแกน 寅申

  /* วาง 14 主星 ลง ground */
  const starAtGround: Map<number, MajorStar[]> = new Map();
  const groundOfStar: Map<MajorStar, number> = new Map();
  const placeMajor = (star: MajorStar, g: number) => {
    const gg = fix12(g);
    if (!starAtGround.has(gg)) starAtGround.set(gg, []);
    starAtGround.get(gg)!.push(star);
    groundOfStar.set(star, gg);
  };
  for (const { star, offset } of ZIWEI_SERIES) placeMajor(star, ziweiGround + offset);
  for (const { star, offset } of TIANFU_SERIES) placeMajor(star, tianfuGround + offset);

  /* 輔星/煞星 (ground) */
  const minorAtGround: Map<number, string[]> = new Map();
  const placeMinor = (name: string, g: number) => {
    const gg = fix12(g);
    if (!minorAtGround.has(gg)) minorAtGround.set(gg, []);
    minorAtGround.get(gg)!.push(name);
  };
  // 左輔右弼 (เดือน · ใช้เดือนปรับอธิกมาส)
  placeMinor("左輔", groundOf("辰") + (effectiveMonth - 1));
  placeMinor("右弼", groundOf("戌") - (effectiveMonth - 1));
  // 文昌文曲 (時)
  placeMinor("文昌", groundOf("戌") - hourBranchIndex);
  placeMinor("文曲", groundOf("辰") + hourBranchIndex);
  // 祿存/擎羊/陀羅 (年干)
  const luGround = LU_CUN_GROUND[yearStem];
  placeMinor("祿存", luGround);
  placeMinor("擎羊", luGround + 1);
  placeMinor("陀羅", luGround - 1);
  // 天馬 (年支)
  placeMinor("天馬", TIAN_MA_GROUND[yearBranch]);
  // 天魁天鉞 (年干)
  const ky = KUI_YUE_GROUND[yearStem];
  placeMinor("天魁", ky.kui);
  placeMinor("天鉞", ky.yue);
  // 火星鈴星 (年支 + 時)
  const hl = HUO_LING_START[yearBranch];
  placeMinor("火星", hl.huo + hourBranchIndex);
  placeMinor("鈴星", hl.ling + hourBranchIndex);
  // 地空地劫 (時)
  placeMinor("地空", groundOf("亥") - hourBranchIndex);
  placeMinor("地劫", groundOf("亥") + hourBranchIndex);
  // 紅鸞天喜 (年支)
  const hongluan = fix12(groundOf("卯") - yearBranchIndex);
  placeMinor("紅鸞", hongluan);
  placeMinor("天喜", hongluan + 6);

  /* 四化: star → type, mark บนดาวที่อยู่ในผัง */
  const starSiHua: Map<string, SiHuaType> = new Map();
  yearSiHuaStars.forEach((star, i) => starSiHua.set(star, SI_HUA_TYPES[i]));

  /* 大限 ทิศ: 陽男陰女順 / 陰男陽女逆 */
  const yangYear = yearStemIndex % 2 === 0;
  const forward = (yangYear && gender === "M") || (!yangYear && gender === "F");
  const ju = wuxingJu.num;

  /* สร้าง 12 宮 (命宮 → ทวนเข็ม = ground ลดลง) */
  const palaces: ZiweiPalace[] = [];
  for (let i = 0; i < 12; i++) {
    const g = fix12(mingGround - i);
    const stemIdx = stemAtGround(yearStemIndex, g);
    const branch = groundToBranch(g);
    const stem = STEMS[stemIdx];
    const majors: StarPlacement[] = (starAtGround.get(g) || []).map((s) => ({
      name: s,
      brightness: brightnessAt(s, g),
      ...(starSiHua.has(s) ? { siHua: starSiHua.get(s)! } : {}),
    }));
    const minors: StarPlacement[] = (minorAtGround.get(g) || []).map((s) => ({
      name: s,
      ...(starSiHua.has(s) ? { siHua: starSiHua.get(s)! } : {}),
    }));
    // 大限 ระยะ k จาก命宮 ตามทิศ
    const k = forward ? fix12(g - mingGround) : fix12(mingGround - g);
    const ageStart = ju + 10 * k;
    palaces.push({
      index: i,
      name: PALACE_NAMES[i],
      ground: g,
      branch,
      stem,
      ganzhi: stem + branch,
      majorStars: majors,
      minorStars: minors,
      isShenGong: g === shenGround,
      daXian: { ageStart, ageEnd: ageStart + 9 },
    });
  }

  const starLocation = (star: string): { palaceName: PalaceName | null; branch: string | null } => {
    const g = groundOfStar.get(star as MajorStar);
    if (g !== undefined) {
      const pal = palaces.find((p) => p.ground === g);
      return { palaceName: pal ? pal.name : null, branch: groundToBranch(g) };
    }
    // ดาว文昌/文曲/左輔/右弼 (輔星) อาจรับ四化
    for (const [gg, names] of minorAtGround) {
      if (names.includes(star)) {
        const pal = palaces.find((p) => p.ground === gg);
        return { palaceName: pal ? pal.name : null, branch: groundToBranch(gg) };
      }
    }
    return { palaceName: null, branch: null };
  };

  const siHuaForStem = (stem: string) => (SI_HUA[stem] || []).map((star, i) => {
    const loc = starLocation(star);
    return { star, type: SI_HUA_TYPES[i], palaceName: loc.palaceName, branch: loc.branch };
  });

  /* 四化 ขยายข้อมูลตำแหน่ง */
  const siHua = siHuaForStem(yearStem);
  const daXianSiHua = palaces.map((p) => ({
    palaceName: p.name,
    branch: p.branch,
    stem: p.stem,
    ageStart: p.daXian.ageStart,
    ageEnd: p.daXian.ageEnd,
    siHua: siHuaForStem(p.stem),
  }));

  const palaceByGround = (g: number): ZiweiPalace => palaces.find((p) => p.ground === fix12(g))!;
  const annualStar = (star: string, g: number, source: string) => {
    const p = palaceByGround(g);
    return { star, palaceName: p.name, branch: p.branch, source };
  };
  const flowStarsFor = (prefix: "流月" | "流日", stem: string, branch: string) => {
    const luGround = LU_CUN_GROUND[stem];
    const ky = KUI_YUE_GROUND[stem];
    const branchIndex = BRANCHES.indexOf(branch as any);
    const hongluan = fix12(groundOf("卯") - branchIndex);
    return [
      annualStar(`${prefix}祿存`, luGround, `${prefix}干`),
      annualStar(`${prefix}擎羊`, luGround + 1, `${prefix}干`),
      annualStar(`${prefix}陀羅`, luGround - 1, `${prefix}干`),
      annualStar(`${prefix}天魁`, ky.kui, `${prefix}干`),
      annualStar(`${prefix}天鉞`, ky.yue, `${prefix}干`),
      annualStar(`${prefix}天馬`, TIAN_MA_GROUND[branch], `${prefix}支`),
      annualStar(`${prefix}紅鸞`, hongluan, `${prefix}支`),
      annualStar(`${prefix}天喜`, hongluan + 6, `${prefix}支`),
    ];
  };

  /* 三方四正 ของ命宮: 財帛(三合-4) 官祿(三合+4) 遷移(對宮+6) */
  const sfsz = [
    { g: mingGround, relation: "本宮" },
    { g: fix12(mingGround + 4), relation: "三合(官祿)" },
    { g: fix12(mingGround - 4), relation: "三合(財帛)" },
    { g: fix12(mingGround + 6), relation: "對宮(遷移)" },
  ].map(({ g, relation }) => {
    const pal = palaces.find((p) => p.ground === g)!;
    return { palaceName: pal.name, branch: pal.branch, relation };
  });

  /* 流年 (option) */
  let liuNian: ZiweiChart["liuNian"] = null;
  let liuYue: ZiweiChart["liuYue"] = null;
  let liuRi: ZiweiChart["liuRi"] = null;
  if (opts.refDate) {
    const refLoc = localCivil(opts.refDate, gmtOffsetHours);
    const refSt = SolarTime.fromYmdHms(refLoc.y, refLoc.m, refLoc.d, refLoc.h, refLoc.mi, 0);
    const refLunarHour = refSt.getLunarHour();
    const refLunarDay = refLunarHour.getLunarDay();
    const refLunarMonth = refLunarDay.getLunarMonth();
    const refYearGanzhi = splitGanzhi(refLunarHour.getYearSixtyCycle().getName());
    const refStem = refYearGanzhi.stem;
    const refBranch = refYearGanzhi.branch;
    const taisuiBranchIndex = BRANCHES.indexOf(refBranch as any);
    const taisuiGround = groundOf(BRANCHES[taisuiBranchIndex]);
    const pal = palaces.find((p) => p.ground === taisuiGround)!;
    const luGround = LU_CUN_GROUND[refStem];
    const ky = KUI_YUE_GROUND[refStem];
    const hongluan = fix12(groundOf("卯") - taisuiBranchIndex);
    liuNian = {
      year: refLoc.y,
      ganzhi: refStem + refBranch,
      mingBranch: refBranch,
      mingPalaceName: pal.name,
      siHua: siHuaForStem(refStem),
      annualStars: [
        annualStar("流年祿存", luGround, "流年年干"),
        annualStar("流年擎羊", luGround + 1, "流年年干"),
        annualStar("流年陀羅", luGround - 1, "流年年干"),
        annualStar("流年天魁", ky.kui, "流年年干"),
        annualStar("流年天鉞", ky.yue, "流年年干"),
        annualStar("流年天馬", TIAN_MA_GROUND[refBranch], "流年年支"),
        annualStar("流年紅鸞", hongluan, "流年年支"),
        annualStar("流年天喜", hongluan + 6, "流年年支"),
      ],
    };

    const refRawMonth = refLunarMonth.getMonthWithLeap();
    const refIsLeapMonth = refLunarMonth.isLeap();
    const refMonth = Math.abs(refRawMonth);
    const refDay = refLunarDay.getDay();
    const refEffectiveMonth = refMonth + (refIsLeapMonth && refDay > 15 ? 1 : 0);
    const monthlyGanzhi = refLunarDay.getMonthSixtyCycle().getName();
    const dailyGanzhi = refLunarDay.getSixtyCycle().getName();
    const monthlyGz = splitGanzhi(monthlyGanzhi);
    const dailyGz = splitGanzhi(dailyGanzhi);
    const monthlyGround = fix12(taisuiGround - effectiveMonth + hourBranchIndex + refEffectiveMonth);
    const dailyGround = fix12(monthlyGround + refDay - 1);
    const monthPalaces = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const g = fix12(taisuiGround - effectiveMonth + hourBranchIndex + m);
      const p = palaceByGround(g);
      return { lunarMonth: m, mingBranch: p.branch, mingPalaceName: p.name };
    });
    const monthlyPalace = palaceByGround(monthlyGround);
    const dailyPalace = palaceByGround(dailyGround);
    liuYue = {
      year: refLoc.y,
      lunarMonth: refMonth,
      isLeapMonth: refIsLeapMonth,
      effectiveMonth: refEffectiveMonth,
      ganzhi: monthlyGanzhi,
      mingBranch: monthlyPalace.branch,
      mingPalaceName: monthlyPalace.name,
      siHua: siHuaForStem(monthlyGz.stem),
      monthlyStars: flowStarsFor("流月", monthlyGz.stem, monthlyGz.branch),
      monthPalaces,
    };
    liuRi = {
      dateISO: opts.refDate.toISOString().slice(0, 10),
      lunarDay: refDay,
      ganzhi: dailyGanzhi,
      mingBranch: dailyPalace.branch,
      mingPalaceName: dailyPalace.name,
      siHua: siHuaForStem(dailyGz.stem),
      dailyStars: flowStarsFor("流日", dailyGz.stem, dailyGz.branch),
    };
  }

  return {
    hasTime: true,
    degradeLevel: "full",
    lunar: { year: yearSC.getName(), month: lunarMonth, day: lunarDay, isLeapMonth },
    yearStem, yearBranch, hourBranch,
    mingGong: {
      ground: mingGround, branch: groundToBranch(mingGround),
      stem: STEMS[mingStemIndex], ganzhi: STEMS[mingStemIndex] + groundToBranch(mingGround),
    },
    shenGong: { ground: shenGround, branch: groundToBranch(shenGround) },
    wuxingJu,
    ziweiGround,
    tianfuGround,
    palaces,
    siHua,
    daXianSiHua,
    sanFangSiZheng: sfsz,
    liuNian,
    liuYue,
    liuRi,
    notAvailable: opts.refDate ? [] : ["流年", "流年四化", "流年星", "流月", "流日"],
  };
}

/**
 * 安紫微星訣 (商數法) — ตรง iztro getStartIndex
 * คืน ground index (寅=0) ของ紫微
 */
function locateZiwei(lunarDay: number, ju: number): number {
  let offset = -1;
  let quotient = 0;
  let remainder = -1;
  do {
    offset++;
    const divisor = lunarDay + offset;
    quotient = Math.floor(divisor / ju);
    remainder = divisor % ju;
  } while (remainder !== 0);
  quotient %= 12;
  let ziweiIndex = quotient - 1;
  if (offset % 2 === 0) ziweiIndex += offset;
  else ziweiIndex -= offset;
  return fix12(ziweiIndex);
}
