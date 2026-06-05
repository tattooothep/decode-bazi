import { MOUNTAIN_BY_NAME, findMountain24, isNearMountainBoundary, normalizeDeg } from "./mountains";
import type { Mountain24 } from "./mountains";

export type PinFeatureCategory =
  | "water"
  | "incoming_water"
  | "outgoing_water"
  | "water_mouth"
  | "drain"
  | "door_gate"
  | "sharp_form"
  | "tall_form"
  | "road_rush"
  | "stove"
  | "bed"
  | "desk"
  | "neutral";

export type LuopanPinInput = {
  type?: string;
  degree?: number;
  bearingDeg?: number;
  featureCategory?: PinFeatureCategory;
  waterFlow?: "incoming" | "outgoing" | "static" | "unknown";
};

export type BashaHit = {
  code: "LONG_SHA_HIT" | "HUANG_QUAN_HIT" | "BOUNDARY_CAUTION";
  severity: "info" | "warning" | "critical";
  pass: boolean;
  mountain: Mountain24;
  thai: string;
  zh: string;
  applies: boolean;
  reason: string;
};

export type BashaContext = {
  facingMountain: Mountain24;
  sittingMountain: Mountain24;
  longShaMountain: Mountain24;
  huangQuanMountain: Mountain24 | null;
};

const GUA_MOUNTAINS: Record<string, string[]> = {
  坎: ["壬", "子", "癸"],
  坤: ["未", "坤", "申"],
  震: ["甲", "卯", "乙"],
  巽: ["辰", "巽", "巳"],
  乾: ["戌", "乾", "亥"],
  兌: ["庚", "酉", "辛"],
  艮: ["丑", "艮", "寅"],
  離: ["丙", "午", "丁"],
};

export const NAJIA_STEMS: Record<string, string[]> = {
  乾: ["甲", "壬"],
  坤: ["乙", "癸"],
  震: ["庚"],
  巽: ["辛"],
  坎: ["戊"],
  離: ["己"],
  艮: ["丙"],
  兌: ["丁"],
};

export const NAJIA_GUAN_GUI: Record<string, string> = {
  坎: "辰",
  坤: "卯",
  震: "申",
  巽: "酉",
  乾: "午",
  兌: "巳",
  艮: "寅",
  離: "亥",
};

export const HUANG_QUAN: Record<string, string> = {
  庚: "坤",
  丁: "坤",
  乙: "巽",
  丙: "巽",
  甲: "艮",
  癸: "艮",
  辛: "乾",
  壬: "乾",
};

const LONG_SHA_APPLIES = new Set<PinFeatureCategory>(["sharp_form", "tall_form", "road_rush", "water", "incoming_water", "outgoing_water", "water_mouth"]);
const HUANG_QUAN_APPLIES = new Set<PinFeatureCategory>(["water", "incoming_water", "outgoing_water", "water_mouth", "drain", "door_gate"]);

export function resolvePinCategory(pin: LuopanPinInput): PinFeatureCategory {
  if (pin.featureCategory) return pin.featureCategory;
  const t = String(pin.type || "").toLowerCase();
  if (t === "water") return "water";
  if (t === "drain") return "drain";
  if (t === "door") return "door_gate";
  if (t === "window") return "neutral";
  if (t === "stove") return "stove";
  if (t === "bed") return "bed";
  if (t === "desk") return "desk";
  if (t === "sharp" || t === "pole" || t === "corner") return "sharp_form";
  if (t === "tall" || t === "tree" || t === "tower") return "tall_form";
  if (t === "road") return "road_rush";
  return "neutral";
}

export function najiaForMountain(mountainName: string) {
  const m = MOUNTAIN_BY_NAME[mountainName];
  if (!m) return null;
  return {
    mountain: m,
    gua: m.trigram,
    stems: NAJIA_STEMS[m.trigram] || [],
    guanGui: NAJIA_GUAN_GUI[m.trigram] || null,
    groupMountains: GUA_MOUNTAINS[m.trigram] || [],
  };
}

export function buildBashaContext(facingDeg: number): BashaContext {
  const facingMountain = findMountain24(facingDeg);
  const sittingMountain = findMountain24(normalizeDeg(facingDeg + 180));
  const longShaName = NAJIA_GUAN_GUI[sittingMountain.trigram];
  const longShaMountain = MOUNTAIN_BY_NAME[longShaName];
  const huangQuanName = HUANG_QUAN[facingMountain.name];
  const huangQuanMountain = huangQuanName ? MOUNTAIN_BY_NAME[huangQuanName] || null : null;
  if (!longShaMountain) throw new Error(`ไม่พบ龍上八煞ของ坐山 ${sittingMountain.name}`);
  return { facingMountain, sittingMountain, longShaMountain, huangQuanMountain };
}

export function evaluateBashaHuangQuan(facingDeg: number, pin: LuopanPinInput): { context: BashaContext; pinMountain: Mountain24 | null; hits: BashaHit[] } {
  const context = buildBashaContext(facingDeg);
  const deg = Number(pin.degree ?? pin.bearingDeg);
  const pinMountain = Number.isFinite(deg) ? findMountain24(deg) : null;
  const hits: BashaHit[] = [];
  if (!pinMountain) return { context, pinMountain, hits };

  const category = resolvePinCategory(pin);
  if (isNearMountainBoundary(deg, 1)) {
    hits.push({
      code: "BOUNDARY_CAUTION",
      severity: "warning",
      pass: true,
      mountain: pinMountain,
      thai: `ใกล้เส้นแบ่งซาน ${pinMountain.name} · ควรวัดองศาซ้ำก่อนตัดสิน`,
      zh: `近24山分界，宜重測`,
      applies: true,
      reason: "boundary",
    });
  }

  if (pinMountain.name === context.longShaMountain.name) {
    const applies = LONG_SHA_APPLIES.has(category);
    hits.push({
      code: "LONG_SHA_HIT",
      severity: applies ? "critical" : "warning",
      pass: !applies,
      mountain: pinMountain,
      thai: applies
        ? `โดน龍上八煞: บ้าน坐 ${context.sittingMountain.name} ห้ามกระตุ้นทิศ ${pinMountain.name} ด้วยของแหลม/ของสูง/ทางพุ่ง`
        : `ทิศนี้เป็น龍上八煞 แต่ pin ชนิดนี้ยังไม่ใช่ตัวกระตุ้นหลัก`,
      zh: `龍上八煞 · 坐${context.sittingMountain.name}忌${pinMountain.name}`,
      applies,
      reason: `category=${category}`,
    });
  }

  if (context.huangQuanMountain && pinMountain.name === context.huangQuanMountain.name) {
    const applies = HUANG_QUAN_APPLIES.has(category);
    hits.push({
      code: "HUANG_QUAN_HIT",
      severity: applies ? "critical" : "warning",
      pass: !applies,
      mountain: pinMountain,
      thai: applies
        ? `โดน黃泉: บ้าน向 ${context.facingMountain.name} ห้ามน้ำ/ท่อ/ประตูน้ำที่ ${pinMountain.name}`
        : `ทิศนี้เป็น黃泉ของ向 ${context.facingMountain.name} แต่ pin นี้ไม่ใช่น้ำหรือประตูน้ำ`,
      zh: `黃泉 · 向${context.facingMountain.name}忌${pinMountain.name}`,
      applies,
      reason: `category=${category}`,
    });
  }

  return { context, pinMountain, hits };
}
