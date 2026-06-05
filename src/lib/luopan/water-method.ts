import { findMountain24, normalizeDeg } from "./mountains";
import type { Dir8, Mountain24 } from "./mountains";
import { buildBashaContext } from "./najia-basha";

export type WaterFlowRole = "incoming" | "outgoing" | "static" | "unknown";
export type WaterMethodInput = {
  houseLocked: boolean;
  facingDeg?: number;
  waterFeatures?: Array<{
    type?: "pond" | "fountain" | "river" | "drain" | "pool" | "door_water_mouth" | "unknown";
    bearingDeg?: number;
    sourceDeg?: number;
    mouthDeg?: number;
    flowRole?: WaterFlowRole;
    flowDirection?: "left_to_right" | "right_to_left" | "unknown";
    isRealWater?: boolean;
    confidence?: "measured" | "estimated" | "unknown";
  }>;
};

export type WaterMethodResult = {
  status: "ready" | "partial" | "missing";
  pass: boolean;
  score: number;
  tags: string[];
  warnings: string[];
  hits: Array<{
    code: string;
    thai: string;
    zh: string;
    mountain?: Mountain24;
    severity: "info" | "warning" | "critical";
  }>;
  raw: Record<string, unknown>;
};

const WATER_MOUTH局: Record<string, { ju: "水局" | "火局" | "金局" | "木局"; sanhe: string; thai: string }> = {
  辰: { ju: "水局", sanhe: "申子辰", thai: "水局 · กลุ่มน้ำ" },
  戌: { ju: "火局", sanhe: "寅午戌", thai: "火局 · กลุ่มไฟ" },
  丑: { ju: "金局", sanhe: "巳酉丑", thai: "金局 · กลุ่มทอง" },
  未: { ju: "木局", sanhe: "亥卯未", thai: "木局 · กลุ่มไม้" },
};

export function waterMouthJu(mouthDeg: number | undefined) {
  if (!Number.isFinite(Number(mouthDeg))) return null;
  const m = findMountain24(Number(mouthDeg));
  return WATER_MOUTH局[m.name] ? { mountain: m, ...WATER_MOUTH局[m.name] } : { mountain: m, ju: null, sanhe: null, thai: "ยังไม่เข้าปากน้ำ四大局หลัก" };
}

export function evaluateWaterMethod(input: WaterMethodInput): WaterMethodResult {
  if (!input.houseLocked || !Number.isFinite(Number(input.facingDeg))) {
    return {
      status: "missing",
      pass: true,
      score: 50,
      tags: ["WATER_METHOD_MISSING_HOUSE"],
      warnings: ["ล็อกบ้านก่อนจึงใช้水法ได้ · 先定坐向"],
      hits: [],
      raw: {},
    };
  }

  const features = (input.waterFeatures || []).filter((f) => f && f.isRealWater === true);
  if (!features.length) {
    return {
      status: "missing",
      pass: true,
      score: 50,
      tags: ["WATER_METHOD_NO_WATER"],
      warnings: ["ยังไม่มีจุดน้ำจริง จึงไม่ตัดสิน水法 · 無水不論水法"],
      hits: [],
      raw: { facingDeg: normalizeDeg(Number(input.facingDeg)) },
    };
  }

  const ctx = buildBashaContext(Number(input.facingDeg));
  const hits: WaterMethodResult["hits"] = [];
  const tags: string[] = [];
  const warnings: string[] = [];
  let score = 50;
  let pass = true;
  let partial = false;

  for (const f of features) {
    const bearing = Number(f.bearingDeg ?? f.mouthDeg ?? f.sourceDeg);
    const m = Number.isFinite(bearing) ? findMountain24(bearing) : null;
    if (!m) {
      partial = true;
      warnings.push("มีจุดน้ำแต่ยังไม่มีองศา · 水位缺度數");
      continue;
    }
    const flowRole = f.flowRole || "unknown";
    const mouth = waterMouthJu(f.mouthDeg);

    if (ctx.huangQuanMountain && m.name === ctx.huangQuanMountain.name) {
      const hard = flowRole !== "unknown";
      tags.push("HUANG_QUAN_WATER_HIT");
      score -= hard ? 35 : 22;
      pass = false;
      partial = partial || !hard;
      hits.push({
        code: hard ? "HUANG_QUAN_WATER_DANGER" : "HUANG_QUAN_WATER_UNKNOWN",
        thai: hard
          ? `น้ำจริงโดน黃泉: 向 ${ctx.facingMountain.name} ห้ามน้ำที่ ${m.name}`
          : `น้ำอยู่黃泉 แต่ทิศไหลยังไม่ครบ ห้ามสรุปว่าดี`,
        zh: hard ? `黃泉水忌` : `黃泉水流向未明`,
        mountain: m,
        severity: hard ? "critical" : "warning",
      });
    }

    if (mouth?.ju) {
      tags.push(`WATER_MOUTH_${mouth.ju}`);
      hits.push({
        code: "WATER_MOUTH_JU",
        thai: `水口 ${mouth.mountain.name} เข้า ${mouth.thai} (${mouth.sanhe})`,
        zh: `${mouth.mountain.name}水口定${mouth.ju}`,
        mountain: mouth.mountain,
        severity: "info",
      });
    } else if (f.mouthDeg != null) {
      partial = true;
      warnings.push("水口 ยังไม่ใช่辰戌丑未หลัก ต้องให้ซินแสตรวจเพิ่ม");
    }

    if (flowRole === "unknown") {
      partial = true;
      warnings.push(`จุดน้ำ ${m.name} ยังไม่รู้來水/去水 จึงไม่ให้คะแนนดี`);
    }
  }

  return {
    status: partial ? "partial" : "ready",
    pass,
    score: Math.max(0, Math.min(100, score)),
    tags,
    warnings,
    hits,
    raw: {
      facing: ctx.facingMountain.name,
      sitting: ctx.sittingMountain.name,
      huangQuan: ctx.huangQuanMountain?.name || null,
      featureCount: features.length,
    },
  };
}

export function dayShaDirLabel(dir: Dir8 | null): string {
  const TH: Record<Dir8, string> = { N: "ทิศเหนือ", NE: "ทิศตะวันออกเฉียงเหนือ", E: "ทิศตะวันออก", SE: "ทิศตะวันออกเฉียงใต้", S: "ทิศใต้", SW: "ทิศตะวันตกเฉียงใต้", W: "ทิศตะวันตก", NW: "ทิศตะวันตกเฉียงเหนือ" };
  return dir ? TH[dir] : "ไม่ระบุทิศ";
}
