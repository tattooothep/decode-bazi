/* HK_SIFU_CRITICAL_EVIDENCE_GATE_V1
 * hard gate แบบจำกัดวง: ถ้าผู้ใช้ถามปี/ช่วงวัยชัด และ packet มี hit สำคัญของปีนั้น
 * คำตอบต้องเอ่ยหลักฐานนั้นอย่างน้อยในรูป marker จีน/ไทยสั้น ๆ
 * ไม่ใช้แทนการตัดสินของซินแส; ใช้กัน "มีข้อมูลใน packet แต่ไม่หยิบ" */

export type CriticalEvidenceItem = {
  code: string;
  label: string;
  anyOf: string[];
};

export type CriticalEvidenceCheck = {
  ok: boolean;
  skipped: boolean;
  years: number[];
  required: CriticalEvidenceItem[];
  missing: CriticalEvidenceItem[];
};

const SYSTEM_Q_RE = /กี่เล่ม|กี่คัมภีร์|มีคัมภีร์|ระบบ|prompt|packet|แพ็กเก็ต|engine|โค้ด|debug|admin/i;

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function normalizeText(s: string): string {
  return (s || "").replace(/\s+/g, "");
}

export function extractAskedYears(message: string, nowYear = new Date().getFullYear()): number[] {
  const text = message || "";
  const years = (text.match(/\b20[0-9]{2}\b/g) || []).map((x) => Number(x)).filter((x) => x >= 2000 && x <= 2099);
  if (/ปีนี้|ปีจรนี้|this year/i.test(text)) years.push(nowYear);
  if (/ปีหน้า|ปีถัดไป|ปีจรถัด|next year/i.test(text)) years.push(nowYear + 1);
  return uniq(years).sort((a, b) => a - b);
}

function addIf(ctx: string, required: CriticalEvidenceItem[], cond: boolean, item: CriticalEvidenceItem): void {
  if (ctx && cond && !required.some((x) => x.code === item.code)) {
    required.push(item);
  }
}

export function extractCriticalEvidence(ctx: string, years: number[]): CriticalEvidenceItem[] {
  const required: CriticalEvidenceItem[] = [];
  for (const y of years) {
    addIf(ctx, required, ctx.includes(`丙辛(ปีจร${y}`), {
      code: `${y}:丙辛`,
      label: `${y} 丙辛合`,
      anyOf: ["丙辛", "ปิ่งซิน", "ปิ่งฮะซิน"],
    });
    addIf(ctx, required, ctx.includes(`丁壬(ปีจร${y}`), {
      code: `${y}:丁壬`,
      label: `${y} 丁壬合`,
      anyOf: ["丁壬", "ติ่งหยิม", "ติงเหริน"],
    });
    addIf(ctx, required, new RegExp(`四庫全[^\\n]*${y}|${y}[^\\n]*四庫全`).test(ctx), {
      code: `${y}:四庫全`,
      label: `${y} 四庫全`,
      anyOf: ["四庫", "四库", "辰戌丑未", "สี่คลัง"],
    });
    addIf(ctx, required, new RegExp(`ปีจร${y}[^\\n◆]*六害/(午丑|丑午)|ปีจร${y}[^\\n◆]*(午丑害|丑午害)`).test(ctx), {
      code: `${y}:午丑害`,
      label: `${y} 午丑害`,
      anyOf: ["午丑", "丑午", "六害", "ทำร้าย", "害"],
    });
    addIf(ctx, required, new RegExp(`ปีจร${y}[^\\n◆]*六破/(未戌|戌未)|ปีจร${y}[^\\n◆]*(未戌破|戌未破)`).test(ctx), {
      code: `${y}:未戌破`,
      label: `${y} 未戌破`,
      anyOf: ["未戌", "戌未", "六破", "破"],
    });
    addIf(ctx, required, new RegExp(`ปีจร${y}[^\\n◆]*六害/(子未|未子)|ปีจร${y}[^\\n◆]*(子未害|未子害)`).test(ctx), {
      code: `${y}:子未害`,
      label: `${y} 子未害`,
      anyOf: ["子未", "未子", "六害", "害"],
    });
  }
  return required;
}

export function extractAskedLuckMarkers(message: string): string[] {
  const text = message || "";
  const out: string[] = [];
  if (/乙巳|35\s*[–-]\s*45|35.*45|วัยจร|大運|da\s*yun/i.test(text)) out.push("乙巳");
  return uniq(out);
}

export function extractCriticalLuckEvidence(ctx: string, markers: string[]): CriticalEvidenceItem[] {
  const required: CriticalEvidenceItem[] = [];
  if (markers.includes("乙巳") && /วัยจรถัดไป乙巳[\s\S]*巳酉丑三合/.test(ctx)) {
    required.push({
      code: "luck:乙巳:巳酉丑",
      label: "วัย乙巳 巳酉丑三合金",
      anyOf: ["乙巳", "巳酉丑", "สามฮะทอง", "三合金"],
    });
  }
  if (markers.includes("乙巳") && /วัยจรถัดไป乙巳/.test(ctx)) {
    required.push({
      code: "luck:乙巳:乙傷官",
      label: "วัย乙巳 乙傷官",
      anyOf: ["乙傷官", "傷官", "伤官", "ชางกวน"],
    });
  }
  return required;
}

export function checkSifuCriticalEvidence(
  reply: string,
  message: string,
  ctx: string,
  opts: { hasPacket?: boolean; nowYear?: number } = {},
): CriticalEvidenceCheck {
  if (!opts.hasPacket || SYSTEM_Q_RE.test(message || "")) {
    return { ok: true, skipped: true, years: [], required: [], missing: [] };
  }
  const years = extractAskedYears(message, opts.nowYear);
  const required = [
    ...extractCriticalEvidence(ctx, years),
    ...extractCriticalLuckEvidence(ctx, extractAskedLuckMarkers(message)),
  ];
  if (!required.length) return { ok: true, skipped: true, years, required, missing: [] };
  const normalizedReply = normalizeText(reply);
  const missing = required.filter((item) => !item.anyOf.some((token) => normalizedReply.includes(normalizeText(token))));
  return { ok: missing.length === 0, skipped: false, years, required, missing };
}
