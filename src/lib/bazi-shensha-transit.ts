/* 神煞 × Transit Activation (Gap 4)
   อ้าง: 三命通會·卷三 總論諸神煞 + 子平真詮 (神煞ใช้ประกอบไม่ตัดสิน)
   ไม่ใช่ engine ตัดสิน · เป็น evidence layer สำหรับซินแสอ่านวัยจร/ปีจร
*/

type PillarKey = "year" | "month" | "day" | "hour";
type Pillars = Record<PillarKey, { stem: string; branch: string } | null>;

export type ShenShaName =
  | "taoHua"        // 桃花 เสน่ห์
  | "yiMa"          // 驛馬 ม้าเดินทาง
  | "yangRen"       // 羊刃 ดาบแกะ (อันตราย/พลังเข้ม)
  | "huaGai"        // 華蓋 หลังคาฟ้า (โดดเดี่ยว/ครู/วิชา)
  | "jiangXing"     // 將星 แม่ทัพ
  | "wenChang"      // 文昌 อักษร (วิชา)
  | "xueTang"       // 學堂 หอเรียน
  | "tianYi";       // 天乙貴人 ขุนนาง

export type ShenShaTransit = {
  starKey: ShenShaName;
  starZh: string;
  starTh: string;
  natalPillar: PillarKey;            // เสาในผังที่มีดาว
  natalBranch: string;
  activatedBy: "luck" | "year" | "month" | null;
  activatorBranch: string | null;
  activatorPeriod: { kind: "luck" | "year" | "month"; label: string; ageStart?: number; year?: number };
  verdict: "activated" | "amplified" | "clashed" | "neutral";
  thaiSummary: string;
  sourceRuleIds: string[];
};

const STAR_TH: Record<ShenShaName, string> = {
  taoHua: "เสน่ห์",
  yiMa: "ม้าเดินทาง",
  yangRen: "ดาบแกะ",
  huaGai: "หลังคาฟ้า",
  jiangXing: "แม่ทัพ",
  wenChang: "อักษร",
  xueTang: "หอเรียน",
  tianYi: "ขุนนาง",
};

const STAR_ZH: Record<ShenShaName, string> = {
  taoHua: "桃花",
  yiMa: "驛馬",
  yangRen: "羊刃",
  huaGai: "華蓋",
  jiangXing: "將星",
  wenChang: "文昌",
  xueTang: "學堂",
  tianYi: "天乙",
};

/* lookup 桃花/驛馬/華蓋/將星 (อิง yearBranch หรือ dayBranch ตามตำรา) */
function lookupBy3Group(branch: string): { taoHua: string; yiMa: string; huaGai: string; jiangXing: string } | null {
  // 申子辰 → 酉(桃花)/寅(驛馬)/辰(華蓋)/子(將星)
  // 巳酉丑 → 午/亥/丑/酉
  // 寅午戌 → 卯/申/戌/午
  // 亥卯未 → 子/巳/未/卯
  if (["申", "子", "辰"].includes(branch)) return { taoHua: "酉", yiMa: "寅", huaGai: "辰", jiangXing: "子" };
  if (["巳", "酉", "丑"].includes(branch)) return { taoHua: "午", yiMa: "亥", huaGai: "丑", jiangXing: "酉" };
  if (["寅", "午", "戌"].includes(branch)) return { taoHua: "卯", yiMa: "申", huaGai: "戌", jiangXing: "午" };
  if (["亥", "卯", "未"].includes(branch)) return { taoHua: "子", yiMa: "巳", huaGai: "未", jiangXing: "卯" };
  return null;
}

/* 羊刃 ตาม day-stem (陽干 only)
   甲→卯 · 丙戊→午 · 庚→酉 · 壬→子 · 陰干ไม่มี羊刃 (มี飛刃แทน) */
function lookupYangRen(dayStem: string): string | null {
  const MAP: Record<string, string> = { 甲: "卯", 丙: "午", 戊: "午", 庚: "酉", 壬: "子" };
  return MAP[dayStem] || null;
}

/* 文昌 ตาม day-stem · ตำราดั้งเดิม */
function lookupWenChang(dayStem: string): string | null {
  const MAP: Record<string, string> = { 甲: "巳", 乙: "午", 丙: "申", 丁: "酉", 戊: "申", 己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯" };
  return MAP[dayStem] || null;
}

/* 學堂 ตาม dm element + 長生 */
function lookupXueTang(dayStem: string): string | null {
  const MAP: Record<string, string> = { 甲: "亥", 乙: "午", 丙: "寅", 丁: "酉", 戊: "寅", 己: "酉", 庚: "巳", 辛: "子", 壬: "申", 癸: "卯" };
  return MAP[dayStem] || null;
}

/* 天乙貴人 ตาม day-stem (2 ตำแหน่ง) */
function lookupTianYi(dayStem: string): string[] {
  const MAP: Record<string, string[]> = {
    甲: ["丑", "未"], 戊: ["丑", "未"], 庚: ["丑", "未"],
    乙: ["子", "申"], 己: ["子", "申"],
    丙: ["酉", "亥"], 丁: ["酉", "亥"],
    壬: ["卯", "巳"], 癸: ["卯", "巳"],
    辛: ["寅", "午"],
  };
  return MAP[dayStem] || [];
}

/* 六沖 table — ตรวจ activation type */
const SIX_CLASHES: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

/* คำนวณ star map ของผัง · แล้ว cross กับ luck/year branch */
export function buildShenShaTransit(
  pillars: Pillars,
  opts: {
    luckBranch?: string | null;
    luckLabel?: string;
    luckAgeStart?: number;
    yearBranch?: string | null;
    yearLabel?: string;
    yearValue?: number;
  } = {},
): ShenShaTransit[] {
  const dayStem = pillars.day?.stem || "";
  const yearBr = pillars.year?.branch || "";
  const dayBr = pillars.day?.branch || "";
  if (!dayStem || !dayBr) return [];

  // 桃花/驛馬/華蓋/將星 → ตำรา default ใช้ year-branch (บางสำนัก dayBranch · เราใช้ year+day fallback)
  const group3 = lookupBy3Group(yearBr) || lookupBy3Group(dayBr);
  const yangRen = lookupYangRen(dayStem);
  const wenChang = lookupWenChang(dayStem);
  const xueTang = lookupXueTang(dayStem);
  const tianYi = lookupTianYi(dayStem);

  // หา natal location ของแต่ละดาว
  const findInPillars = (targetBranch: string): PillarKey[] => {
    const hits: PillarKey[] = [];
    const keys: PillarKey[] = ["year", "month", "day", "hour"];
    for (const k of keys) {
      if (pillars[k]?.branch === targetBranch) hits.push(k);
    }
    return hits;
  };

  const candidates: Array<{ key: ShenShaName; targetBranches: string[] }> = [];
  if (group3) {
    candidates.push({ key: "taoHua", targetBranches: [group3.taoHua] });
    candidates.push({ key: "yiMa", targetBranches: [group3.yiMa] });
    candidates.push({ key: "huaGai", targetBranches: [group3.huaGai] });
    candidates.push({ key: "jiangXing", targetBranches: [group3.jiangXing] });
  }
  if (yangRen) candidates.push({ key: "yangRen", targetBranches: [yangRen] });
  if (wenChang) candidates.push({ key: "wenChang", targetBranches: [wenChang] });
  if (xueTang) candidates.push({ key: "xueTang", targetBranches: [xueTang] });
  if (tianYi.length) candidates.push({ key: "tianYi", targetBranches: tianYi });

  const result: ShenShaTransit[] = [];

  for (const cand of candidates) {
    for (const targetBranch of cand.targetBranches) {
      const natalHits = findInPillars(targetBranch);
      if (natalHits.length === 0) {
        // ไม่อยู่ใน 4 เสา · ตรวจ transit incoming
        if (opts.luckBranch === targetBranch && opts.luckLabel) {
          result.push({
            starKey: cand.key, starZh: STAR_ZH[cand.key], starTh: STAR_TH[cand.key],
            natalPillar: "year", natalBranch: targetBranch,
            activatedBy: "luck",
            activatorBranch: opts.luckBranch,
            activatorPeriod: { kind: "luck", label: opts.luckLabel, ageStart: opts.luckAgeStart },
            verdict: "activated",
            thaiSummary: `วัยจรนำ ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) เข้ามาในผัง · ก่อนหน้านี้ดวงไม่มี`,
            sourceRuleIds: ["SMTG-Vol3", "HK-SHENSHA-TRANSIT-001"],
          });
        }
        if (opts.yearBranch === targetBranch && opts.yearLabel) {
          result.push({
            starKey: cand.key, starZh: STAR_ZH[cand.key], starTh: STAR_TH[cand.key],
            natalPillar: "year", natalBranch: targetBranch,
            activatedBy: "year",
            activatorBranch: opts.yearBranch,
            activatorPeriod: { kind: "year", label: opts.yearLabel, year: opts.yearValue },
            verdict: "activated",
            thaiSummary: `ปีจรนำ ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) มาเปิดในผัง 1 ปี`,
            sourceRuleIds: ["SMTG-Vol3", "HK-SHENSHA-TRANSIT-002"],
          });
        }
        continue;
      }
      // ดาวอยู่ในผัง · ตรวจว่า luck/year เข้ามา activate / amplify / clash หรือไม่
      for (const natalKey of natalHits) {
        const natalBranch = pillars[natalKey]?.branch || "";
        let activated: ShenShaTransit["activatedBy"] = null;
        let activatorBranch: string | null = null;
        let activatorPeriod: ShenShaTransit["activatorPeriod"] = { kind: "luck", label: "" };
        let verdict: ShenShaTransit["verdict"] = "neutral";
        let summary = `${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) อยู่ที่เสา${natalKey} (${natalBranch})`;

        // luck activation
        if (opts.luckBranch === natalBranch) {
          activated = "luck"; activatorBranch = opts.luckBranch;
          activatorPeriod = { kind: "luck", label: opts.luckLabel || "", ageStart: opts.luckAgeStart };
          verdict = "amplified";
          summary = `วัยจรซ้ำกิ่งเดิม → ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) ที่เสา${natalKey}เด่นขึ้นช่วงนี้ (伏吟 amplify)`;
        } else if (opts.luckBranch && SIX_CLASHES[opts.luckBranch] === natalBranch) {
          activated = "luck"; activatorBranch = opts.luckBranch;
          activatorPeriod = { kind: "luck", label: opts.luckLabel || "", ageStart: opts.luckAgeStart };
          verdict = "clashed";
          summary = `วัยจร${opts.luckBranch}ชนเสา${natalKey}(${natalBranch}) → ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) ถูกกระตุก/เปิดออก`;
        }

        // year activation (override ถ้ามี · ปีจร > วัยจรในเรื่อง intensity แต่สั้น)
        if (opts.yearBranch === natalBranch) {
          activated = "year"; activatorBranch = opts.yearBranch;
          activatorPeriod = { kind: "year", label: opts.yearLabel || "", year: opts.yearValue };
          verdict = "amplified";
          summary = `ปีจรซ้ำกิ่งเดิม → ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) ที่เสา${natalKey}เด่นในปีนั้น (流年伏吟)`;
        } else if (opts.yearBranch && SIX_CLASHES[opts.yearBranch] === natalBranch) {
          activated = "year"; activatorBranch = opts.yearBranch;
          activatorPeriod = { kind: "year", label: opts.yearLabel || "", year: opts.yearValue };
          verdict = "clashed";
          summary = `ปีจร${opts.yearBranch}ชนเสา${natalKey}(${natalBranch}) → ${STAR_TH[cand.key]} (${STAR_ZH[cand.key]}) ถูกเปิดในปีนั้น`;
        }

        if (activated || verdict === "neutral") {
          result.push({
            starKey: cand.key, starZh: STAR_ZH[cand.key], starTh: STAR_TH[cand.key],
            natalPillar: natalKey, natalBranch,
            activatedBy: activated, activatorBranch, activatorPeriod,
            verdict,
            thaiSummary: summary,
            sourceRuleIds: ["SMTG-Vol3", "HK-SHENSHA-TRANSIT-003"],
          });
        }
      }
    }
  }

  // เก็บเฉพาะที่ activated (verdict !== "neutral") หรือถ้าไม่มีอะไร activate ให้ return list ทั้งหมดสั้นๆ
  const activatedOnly = result.filter((r) => r.verdict !== "neutral");
  return activatedOnly.length ? activatedOnly : result.slice(0, 4);
}
