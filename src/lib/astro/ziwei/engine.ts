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
  /* 三方四正 ของ命宮 */
  sanFangSiZheng: { palaceName: PalaceName; branch: string; relation: string }[] | null;
  /* 流年 (ถ้าส่ง refDate) */
  liuNian: { year: number; mingBranch: string; mingPalaceName: PalaceName } | null;
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
      sanFangSiZheng: null,
      liuNian: null,
      notAvailable: ["命宮", "身宮", "五行局", "12宮安星", "大限", "三方四正", "流年"],
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

  /* 四化 ขยายข้อมูลตำแหน่ง */
  const siHua = yearSiHuaStars.map((star, i) => {
    const g = groundOfStar.get(star as MajorStar);
    let palaceName: PalaceName | null = null;
    let branch: string | null = null;
    if (g !== undefined) {
      const pal = palaces.find((p) => p.ground === g);
      palaceName = pal ? pal.name : null;
      branch = groundToBranch(g);
    } else {
      // ดาว文昌/文曲/左輔/右弼 (輔星) อาจรับ四化
      for (const [gg, names] of minorAtGround) {
        if (names.includes(star)) {
          const pal = palaces.find((p) => p.ground === gg);
          palaceName = pal ? pal.name : null;
          branch = groundToBranch(gg);
          break;
        }
      }
    }
    return { star, type: SI_HUA_TYPES[i], palaceName, branch };
  });

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
  if (opts.refDate) {
    const refY = opts.refDate.getUTCFullYear();
    // 太歲 branch ของปี: ((year - 4) mod 12) = branchIndex (甲子=4 ค.ศ.)
    const taisuiBranchIndex = ((refY - 4) % 12 + 12) % 12;
    const taisuiGround = groundOf(BRANCHES[taisuiBranchIndex]);
    const pal = palaces.find((p) => p.ground === taisuiGround)!;
    liuNian = { year: refY, mingBranch: BRANCHES[taisuiBranchIndex], mingPalaceName: pal.name };
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
    sanFangSiZheng: sfsz,
    liuNian,
    notAvailable: [],
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
