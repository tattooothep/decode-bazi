import { getBaziInteractionRule } from "./bazi-interaction-rule-registry";
import {
  activePillars,
  assessStemStrength,
  distanceFor,
  ELEMENT_CONTROLS,
  ELEMENT_ZH,
  hasRootForElement,
  pillarIndex,
  STEM_ELEMENT,
  type BaziElement,
  type BaziPillarLike,
  type BaziPillarsLike,
  type ChineseElement,
  type HehuaDistance,
  type PillarKey,
  type StemStrength,
} from "./bazi-stem-strength";

export type {
  BaziElement,
  BaziPillarLike,
  BaziPillarsLike,
  ChineseElement,
  HehuaDistance,
  PillarKey,
  StemStrength,
} from "./bazi-stem-strength";

export type HehuaPair = "甲己" | "乙庚" | "丙辛" | "丁壬" | "戊癸";
export type HehuaBindingStatus = "active" | "weak" | "blocked" | "contested";
export type HehuaTransformStatus = "supported_candidate" | "not_transformed" | "not_evaluated";
export type HehuaFinalVerdict =
  | "transform_supported"
  | "bound_no_transform"
  | "contested"
  | "blocked_by_intervening_stem"
  | "remote_weak";

export type HehuaReasonCode =
  | "adjacent_pillars"
  | "gap1_pillars"
  | "remote_pillars"
  | "season_supports_transform_element"
  | "season_does_not_support_transform_element"
  | "branch_root_supports_transform_element"
  | "no_branch_root_for_transform_element"
  | "intervening_stem_blocks_combination"
  | "competing_stem_combination"
  | "visible_stem_controls_transform_element"
  | "visible_stem_control_too_weak"
  | "involves_day_master";

export type HehuaVerdict = {
  type: "五合";
  pair: HehuaPair;
  transformElement: ChineseElement;
  /** legacy alias for code that still expects English element */
  targetElement: BaziElement;
  stems: Array<{ pillar: PillarKey; stem: string }>;
  pillars: [PillarKey, PillarKey];
  affectedPillars: PillarKey[];

  bindingStatus: HehuaBindingStatus;
  transformStatus: HehuaTransformStatus;
  finalVerdict: HehuaFinalVerdict;
  /** legacy alias: finalVerdict */
  status: HehuaFinalVerdict;
  verdictZh: "真化候補" | "合而不化" | "爭合妒合" | "隔合不成" | "遙合力弱";

  contenders?: string[];
  target?: string;
  distance: HehuaDistance;
  involvesDayMaster: boolean;

  seasonSupported: boolean;
  hasRootSupport: boolean;
  hasCompetingStem: boolean;
  hasInterveningBlocker: boolean;
  hasBreakerStem: boolean;
  breakerStrength?: StemStrength;

  reasonCodes: HehuaReasonCode[];
  sourceRuleIds: string[];
  confidence: "high" | "medium" | "low";
  thaiSummary: string;
  canonicalChinese?: string;
};

type PlacedPillar = { key: PillarKey; stem: string; branch: string };

const STEM_COMBO: Record<string, { partner: string; pair: HehuaPair; element: BaziElement; seasonBranches: string[] }> = {
  甲: { partner: "己", pair: "甲己", element: "earth", seasonBranches: ["辰", "戌", "丑", "未", "午"] },
  己: { partner: "甲", pair: "甲己", element: "earth", seasonBranches: ["辰", "戌", "丑", "未", "午"] },
  乙: { partner: "庚", pair: "乙庚", element: "metal", seasonBranches: ["巳", "酉", "丑", "申"] },
  庚: { partner: "乙", pair: "乙庚", element: "metal", seasonBranches: ["巳", "酉", "丑", "申"] },
  丙: { partner: "辛", pair: "丙辛", element: "water", seasonBranches: ["申", "子", "辰", "亥"] },
  辛: { partner: "丙", pair: "丙辛", element: "water", seasonBranches: ["申", "子", "辰", "亥"] },
  丁: { partner: "壬", pair: "丁壬", element: "wood", seasonBranches: ["亥", "卯", "未", "寅"] },
  壬: { partner: "丁", pair: "丁壬", element: "wood", seasonBranches: ["亥", "卯", "未", "寅"] },
  戊: { partner: "癸", pair: "戊癸", element: "fire", seasonBranches: ["寅", "午", "戌", "巳"] },
  癸: { partner: "戊", pair: "戊癸", element: "fire", seasonBranches: ["寅", "午", "戌", "巳"] },
};

function hasInterveningBlocker(
  placed: PlacedPillar[],
  left: PillarKey,
  right: PillarKey,
  comboStems: string[],
): boolean {
  const li = pillarIndex(left);
  const ri = pillarIndex(right);
  const lo = Math.min(li, ri);
  const hi = Math.max(li, ri);
  if (hi - lo <= 1) return false;
  return placed.some((p) => {
    const idx = pillarIndex(p.key);
    if (idx <= lo || idx >= hi) return false;
    const el = STEM_ELEMENT[p.stem];
    if (!el) return false;
    return comboStems.some((stem) => ELEMENT_CONTROLS[el] === STEM_ELEMENT[stem]);
  });
}

function stemRef(p: Pick<PlacedPillar, "key" | "stem">): string {
  return `${p.key}.${p.stem}`;
}

function findContested(
  placed: PlacedPillar[],
  pair: HehuaPair,
): { hasCompetingStem: boolean; contenders?: string[]; target?: string } {
  const [a, b] = pair.split("");
  const as = placed.filter((p) => p.stem === a).map(stemRef);
  const bs = placed.filter((p) => p.stem === b).map(stemRef);
  if (as.length > 1 && bs.length === 1) return { hasCompetingStem: true, contenders: as, target: bs[0] };
  if (bs.length > 1 && as.length === 1) return { hasCompetingStem: true, contenders: bs, target: as[0] };
  if (as.length > 1 && bs.length > 1) return { hasCompetingStem: true, contenders: [...as, ...bs] };
  return { hasCompetingStem: false };
}

function strongestVisibleBreaker(
  placed: PlacedPillar[],
  allPillars: BaziPillarsLike,
  transformElement: BaziElement,
  comboStems: string[],
  comboPillars: [PillarKey, PillarKey],
  monthBranch: string,
): StemStrength | undefined {
  const strengths = placed
    .filter((p) => !comboStems.includes(p.stem))
    .map((p): StemStrength | null => {
      const element = STEM_ELEMENT[p.stem];
      if (!element || ELEMENT_CONTROLS[element] !== transformElement) return null;
      return assessStemStrength({
        pillar: p.key,
        stem: p.stem,
        branch: p.branch,
        allPillars,
        comboPillars,
        monthBranch,
      });
    })
    .filter((x): x is StemStrength => Boolean(x))
    .sort((a, b) => b.score - a.score);
  return strengths[0];
}

function verdictZhFor(finalVerdict: HehuaFinalVerdict): HehuaVerdict["verdictZh"] {
  if (finalVerdict === "transform_supported") return "真化候補";
  if (finalVerdict === "contested") return "爭合妒合";
  if (finalVerdict === "blocked_by_intervening_stem") return "隔合不成";
  if (finalVerdict === "remote_weak") return "遙合力弱";
  return "合而不化";
}

function bindingFor(finalVerdict: HehuaFinalVerdict): HehuaBindingStatus {
  if (finalVerdict === "contested") return "contested";
  if (finalVerdict === "blocked_by_intervening_stem") return "blocked";
  if (finalVerdict === "remote_weak") return "weak";
  return "active";
}

function transformFor(finalVerdict: HehuaFinalVerdict): HehuaTransformStatus {
  if (finalVerdict === "transform_supported") return "supported_candidate";
  if (finalVerdict === "contested" || finalVerdict === "remote_weak" || finalVerdict === "blocked_by_intervening_stem") return "not_evaluated";
  return "not_transformed";
}

function canonicalFor(finalVerdict: HehuaFinalVerdict, involvesDayMaster: boolean): string {
  if (involvesDayMaster) return "本身之合";
  if (finalVerdict === "transform_supported") return "合化之義";
  if (finalVerdict === "contested") return "爭合妒合";
  if (finalVerdict === "blocked_by_intervening_stem") return "隔於有所間";
  if (finalVerdict === "remote_weak") return "隔位太遠";
  return "合而不化";
}

function summaryFor(v: {
  finalVerdict: HehuaFinalVerdict;
  pair: HehuaPair;
  transformElement: ChineseElement;
  involvesDayMaster: boolean;
  contenders?: string[];
  target?: string;
  breakerStrength?: StemStrength;
}): string {
  const dm = v.involvesDayMaster ? " และเป็น本身之合ของ日主" : "";
  if (v.finalVerdict === "transform_supported") {
    return `${v.pair} ฮะกันและมีเงื่อนไขหนุนให้แปรเป็นธาตุ${v.transformElement}${dm} — ฟันธงระดับก้านฟ้าว่าแรงแปรมีน้ำหนัก แต่ยังไม่ใช่ประกาศ化氣格ทั้งดวง`;
  }
  if (v.finalVerdict === "contested") {
    const detail = v.contenders?.length ? ` (${v.contenders.join(" + ")} แย่ง ${v.target || "คู่ฮะ"})` : "";
    return `${v.pair} มีแรงฮะ แต่เกิด爭合妒合${detail} จึงฟันธงว่าแรงฮะรวน ไม่ตัดเป็นแปรธาตุ`;
  }
  if (v.finalVerdict === "blocked_by_intervening_stem") {
    return `${v.pair} มีแรงฮะ แต่มีตัวคั่นขวางแรง จึงฟันธงเป็น隔合不成`;
  }
  if (v.finalVerdict === "remote_weak") {
    return `${v.pair} อยู่ห่างกัน แรงฮะอ่อน จึงฟันธงเป็น遙合力弱 ไม่ตัดเป็นแปรธาตุ`;
  }
  const breaker = v.breakerStrength?.verdict === "strong" ? ` ก้าน${v.breakerStrength.stem}คุมธาตุ${v.transformElement}แรงพอ` : "";
  return `${v.pair} ฮะกันจริง แต่ไม่เข้าเงื่อนไขแปรธาตุ${breaker}${dm} จึงฟันธงเป็น合而不化`;
}

export function buildHehuaVerdicts(pillars: BaziPillarsLike): HehuaVerdict[] {
  const placed = activePillars(pillars);
  const out: HehuaVerdict[] = [];
  const seen = new Set<string>();
  const monthBranch = pillars.month?.branch || "";

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const info = STEM_COMBO[a.stem];
      if (!info || info.partner !== b.stem) continue;

      const pair = info.pair;
      const contested = findContested(placed, pair);
      const seenKey = contested.hasCompetingStem ? `contested-${pair}-${contested.target || "multi"}` : `${a.key}-${b.key}-${pair}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);

      const comboPillars: [PillarKey, PillarKey] = [a.key, b.key];
      const comboStems = [a.stem, b.stem];
      const distance = distanceFor(a.key, b.key);
      const seasonSupported = info.seasonBranches.includes(monthBranch);
      const hasRootSupport = hasRootForElement(pillars, info.element);
      const hasIntervening = hasInterveningBlocker(placed, a.key, b.key, comboStems);
      const breakerStrength = strongestVisibleBreaker(placed, pillars, info.element, comboStems, comboPillars, monthBranch);
      const hasBreakerStem = Boolean(breakerStrength);
      const strongBreaker = breakerStrength?.verdict === "strong";
      const involvesDayMaster = a.key === "day" || b.key === "day";

      const reasonCodes: HehuaReasonCode[] = [];
      const sourceRuleIds = new Set<string>(["ZPZQ-HE-000"]);

      if (distance === "adjacent") reasonCodes.push("adjacent_pillars");
      else {
        reasonCodes.push(distance === "gap1" ? "gap1_pillars" : "remote_pillars");
        sourceRuleIds.add("ZPZQ-HE-002");
      }
      if (hasIntervening) {
        reasonCodes.push("intervening_stem_blocks_combination");
        sourceRuleIds.add("ZPZQ-HE-001");
      }
      if (contested.hasCompetingStem) {
        reasonCodes.push("competing_stem_combination");
        sourceRuleIds.add("ZPZQ-HE-004");
      }
      if (seasonSupported) reasonCodes.push("season_supports_transform_element");
      else reasonCodes.push("season_does_not_support_transform_element");
      if (hasRootSupport) reasonCodes.push("branch_root_supports_transform_element");
      else reasonCodes.push("no_branch_root_for_transform_element");
      if (breakerStrength) reasonCodes.push(strongBreaker ? "visible_stem_controls_transform_element" : "visible_stem_control_too_weak");
      if (breakerStrength) sourceRuleIds.add("HK-HE-CTRL-001");
      if (involvesDayMaster) {
        reasonCodes.push("involves_day_master");
        sourceRuleIds.add("ZPZQ-HE-003");
      }

      let finalVerdict: HehuaFinalVerdict;
      if (contested.hasCompetingStem) {
        finalVerdict = "contested";
      } else if (hasIntervening) {
        finalVerdict = "blocked_by_intervening_stem";
      } else if (distance !== "adjacent") {
        finalVerdict = "remote_weak";
      } else if (strongBreaker || !seasonSupported) {
        finalVerdict = "bound_no_transform";
      } else {
        // 月令เป็นราชา: ได้ฤดูแล้วให้แปรมีน้ำหนัก แม้ root detail อื่นยังต้องให้ layer 化氣格 ตัดสินต่อ
        finalVerdict = "transform_supported";
      }

      const confidence: HehuaVerdict["confidence"] =
        finalVerdict === "transform_supported" && !hasRootSupport ? "medium" : "high";
      const transformElement = ELEMENT_ZH[info.element];
      const verdictZh = verdictZhFor(finalVerdict);
      const canonicalChinese = canonicalFor(finalVerdict, involvesDayMaster);
      const thaiSummary = summaryFor({
        finalVerdict,
        pair,
        transformElement,
        involvesDayMaster,
        contenders: contested.contenders,
        target: contested.target,
        breakerStrength,
      });

      out.push({
        type: "五合",
        pair,
        transformElement,
        targetElement: info.element,
        stems: comboPillars.map((pillar, idx) => ({ pillar, stem: comboStems[idx] })),
        pillars: comboPillars,
        affectedPillars: [...comboPillars],
        bindingStatus: bindingFor(finalVerdict),
        transformStatus: transformFor(finalVerdict),
        finalVerdict,
        status: finalVerdict,
        verdictZh,
        contenders: contested.contenders,
        target: contested.target,
        distance,
        involvesDayMaster,
        seasonSupported,
        hasRootSupport,
        hasCompetingStem: contested.hasCompetingStem,
        hasInterveningBlocker: hasIntervening,
        hasBreakerStem,
        breakerStrength,
        reasonCodes,
        sourceRuleIds: Array.from(sourceRuleIds),
        confidence,
        thaiSummary,
        canonicalChinese,
      });
    }
  }

  return out;
}

export function explainHehuaVerdict(v: HehuaVerdict): string {
  const rules = v.sourceRuleIds.map((id) => getBaziInteractionRule(id)?.thaiSummary || id).join(" · ");
  const parts = [
    `${v.pair} ${v.verdictZh}`,
    `final=${v.finalVerdict}`,
    `binding=${v.bindingStatus}`,
    `transform=${v.transformStatus}`,
    v.thaiSummary,
    `เหตุผล ${v.reasonCodes.join(", ")}`,
    `rule ${v.sourceRuleIds.join("/")}`,
  ];
  return `${parts.join(" · ")}${rules ? ` · ${rules}` : ""}`;
}
