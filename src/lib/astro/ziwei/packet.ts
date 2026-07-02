/**
 * 紫微斗數 packet · envelope structured JSON สำหรับ AI สรุปภาษา
 * (engine คำนวณเสร็จก่อน · AI แค่บรรยาย · ห้ามเดาดาว/化)
 * — Ziwei engine
 */

import { ziweiChart, type Gender, type ZiweiChart, type ZiweiOptions } from "./engine";
import type { PalaceName } from "./tables";

export interface ZiweiPacketPalace {
  name: PalaceName;
  branch: string;
  stem: string;
  ganzhi: string;
  isShenGong: boolean;
  majorStars: { name: string; brightness: string }[];
  minorStars: { name: string }[];
  siHua: { star: string; type: string }[];
  daXian: { ageStart: number; ageEnd: number };
}

export interface ZiweiPacket {
  discipline: "ziwei";
  packetVersion: "ziwei-v3";
  hasBirthTime: boolean;
  degradeLevel: "full" | "minimal";
  data: {
    lunar: ZiweiChart["lunar"];
    yearGanzhi: string;
    hourBranch: string | null;
    mingGong: { branch: string; stem: string; ganzhi: string } | null;
    shenGong: { branch: string } | null;
    wuxingJu: { name: string; num: number } | null;
    ziweiBranch: string | null;
    palaces: ZiweiPacketPalace[];
    siHua: { star: string; type: string; palaceName: string | null; branch: string | null }[];
    daXianSiHua: {
      palaceName: string;
      branch: string;
      stem: string;
      ageStart: number;
      ageEnd: number;
      siHua: { star: string; type: string; palaceName: string | null; branch: string | null }[];
    }[];
    sanFangSiZheng: { palaceName: string; branch: string; relation: string }[] | null;
    liuNian: {
      year: number;
      ganzhi: string;
      mingBranch: string;
      mingPalaceName: string;
      siHua: { star: string; type: string; palaceName: string | null; branch: string | null }[];
      annualStars: { star: string; palaceName: string; branch: string; source: string }[];
    } | null;
    liuYue: {
      year: number;
      lunarMonth: number;
      isLeapMonth: boolean;
      effectiveMonth: number;
      ganzhi: string;
      mingBranch: string;
      mingPalaceName: string;
      siHua: { star: string; type: string; palaceName: string | null; branch: string | null }[];
      monthlyStars: { star: string; palaceName: string; branch: string; source: string }[];
      monthPalaces: { lunarMonth: number; mingBranch: string; mingPalaceName: string }[];
    } | null;
    liuRi: {
      dateISO: string;
      lunarDay: number;
      ganzhi: string;
      mingBranch: string;
      mingPalaceName: string;
      siHua: { star: string; type: string; palaceName: string | null; branch: string | null }[];
      dailyStars: { star: string; palaceName: string; branch: string; source: string }[];
    } | null;
  };
  notAvailable: string[];
}

const branchOfGround = (chart: ZiweiChart, ground: number | null): string | null =>
  ground === null ? null : chart.palaces.find((p) => p.ground === ground)?.branch ?? null;

export function buildZiweiPacket(
  dtUTC: Date,
  lat: number,
  lng: number,
  gender: Gender,
  hasTime = true,
  opts: ZiweiOptions = {},
): ZiweiPacket {
  const chart = ziweiChart(dtUTC, lat, lng, gender, hasTime, opts);

  const palaces: ZiweiPacketPalace[] = chart.palaces.map((p) => ({
    name: p.name,
    branch: p.branch,
    stem: p.stem,
    ganzhi: p.ganzhi,
    isShenGong: p.isShenGong,
    majorStars: p.majorStars.map((s) => ({ name: s.name, brightness: s.brightness ?? "" })),
    minorStars: p.minorStars.map((s) => ({ name: s.name })),
    siHua: [
      ...p.majorStars.filter((s) => s.siHua).map((s) => ({ star: s.name, type: s.siHua! })),
      ...p.minorStars.filter((s) => s.siHua).map((s) => ({ star: s.name, type: s.siHua! })),
    ],
    daXian: p.daXian,
  }));

  return {
    discipline: "ziwei",
    packetVersion: "ziwei-v3",
    hasBirthTime: chart.hasTime,
    degradeLevel: chart.degradeLevel,
    data: {
      lunar: chart.lunar,
      yearGanzhi: chart.yearStem + chart.yearBranch,
      hourBranch: chart.hourBranch,
      mingGong: chart.mingGong
        ? { branch: chart.mingGong.branch, stem: chart.mingGong.stem, ganzhi: chart.mingGong.ganzhi }
        : null,
      shenGong: chart.shenGong ? { branch: chart.shenGong.branch } : null,
      wuxingJu: chart.wuxingJu,
      ziweiBranch: branchOfGround(chart, chart.ziweiGround),
      palaces,
      siHua: chart.siHua.map((s) => ({
        star: s.star, type: s.type, palaceName: s.palaceName, branch: s.branch,
      })),
      daXianSiHua: chart.daXianSiHua.map((dx) => ({
        palaceName: dx.palaceName,
        branch: dx.branch,
        stem: dx.stem,
        ageStart: dx.ageStart,
        ageEnd: dx.ageEnd,
        siHua: dx.siHua.map((s) => ({ star: s.star, type: s.type, palaceName: s.palaceName, branch: s.branch })),
      })),
      sanFangSiZheng: chart.sanFangSiZheng,
      liuNian: chart.liuNian,
      liuYue: chart.liuYue,
      liuRi: chart.liuRi,
    },
    notAvailable: chart.notAvailable,
  };
}
