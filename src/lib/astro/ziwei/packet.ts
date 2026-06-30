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
  packetVersion: "ziwei-v1";
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
    sanFangSiZheng: { palaceName: string; branch: string; relation: string }[] | null;
    liuNian: { year: number; mingBranch: string; mingPalaceName: string } | null;
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
    packetVersion: "ziwei-v1",
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
      sanFangSiZheng: chart.sanFangSiZheng,
      liuNian: chart.liuNian,
    },
    notAvailable: chart.notAvailable,
  };
}
