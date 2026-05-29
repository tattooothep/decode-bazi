import { getBaziInteractionRule } from "./bazi-interaction-rule-registry";
import {
  activePillars,
  distanceFor,
  ELEMENT_ZH,
  HIDDEN_STEMS,
  STEM_ELEMENT,
  type BaziElement,
  type BaziPillarsLike,
  type ChineseElement,
  type HehuaDistance,
  type PillarKey,
} from "./bazi-stem-strength";

export type MukuBranch = "辰" | "戌" | "丑" | "未";
export type MukuPair = "辰戌" | "丑未";
export type MukuHiddenRole = "useful" | "avoid" | "neutral" | "mixed";
export type MukuFinalVerdict =
  | "closed"
  | "opened_favorable"
  | "opened_unfavorable"
  | "opened_mixed"
  | "opened_neutral";

export type MukuReasonCode =
  | "storage_branch_present"
  | "storage_not_clashed"
  | "storage_pair_clash_present"
  | "transit_storage_clash_present"
  | "adjacent_storage_clash"
  | "gap1_storage_clash"
  | "remote_storage_clash"
  | "luck_storage_clash"
  | "annual_storage_clash"
  | "month_storage_clash"
  | "stored_stem_visible"
  | "stores_useful_element"
  | "stores_avoid_element"
  | "earth_primary_in_four_storage"
  | "storage_clash_not_automatically_good";

export type MukuState = {
  type: "墓庫";
  branch: MukuBranch;
  pillar: PillarKey;
  storageElement: ChineseElement;
  storageElementEn: BaziElement;
  hiddenStems: Array<{ stem: string; element: ChineseElement; elementEn: BaziElement; role: MukuHiddenRole }>;
  visibleStoredStems: Array<{ pillar: PillarKey; stem: string }>;

  isClashed: boolean;
  clashPair?: MukuPair;
  clashedBy: Array<{ pillar: PillarKey; branch: MukuBranch; distance: HehuaDistance }>;
  affectedPillars: PillarKey[];

  storesUsefulElement: boolean;
  storesAvoidElement: boolean;
  usefulHiddenStems: string[];
  avoidHiddenStems: string[];

  finalVerdict: MukuFinalVerdict;
  /** legacy alias for packet/render code */
  status: MukuFinalVerdict;
  verdictZh: "閉庫" | "沖庫得用" | "沖庫成患" | "沖庫雜動" | "沖庫有動";
  reasonCodes: MukuReasonCode[];
  sourceRuleIds: string[];
  confidence: "high" | "medium" | "low";
  thaiSummary: string;
  canonicalChinese: "刑衝未必成格";
};

export type MukuTransitScope = "luck" | "annual" | "month";

export type MukuTransitInput = {
  scope: MukuTransitScope;
  label: string;
  year?: number;
  month?: number;
  pillar: { stem: string; branch: string };
};

export type MukuTransitState = {
  type: "墓庫流動";
  scope: MukuTransitScope;
  label: string;
  year?: number;
  month?: number;
  transitPillar: { stem: string; branch: string };

  /** natal storage/tomb branch being activated by transit clash */
  branch: MukuBranch;
  pillar: PillarKey;
  storageElement: ChineseElement;
  storageElementEn: BaziElement;
  hiddenStems: MukuState["hiddenStems"];
  visibleStoredStems: MukuState["visibleStoredStems"];

  clashPair: MukuPair;
  clashedByTransit: { scope: MukuTransitScope; label: string; branch: MukuBranch };
  affectedPillars: PillarKey[];

  storesUsefulElement: boolean;
  storesAvoidElement: boolean;
  usefulHiddenStems: string[];
  avoidHiddenStems: string[];

  finalVerdict: MukuFinalVerdict;
  status: MukuFinalVerdict;
  verdictZh: MukuState["verdictZh"];
  reasonCodes: MukuReasonCode[];
  sourceRuleIds: string[];
  confidence: MukuState["confidence"];
  thaiSummary: string;
  canonicalChinese: "刑衝未必成格";
};

type PlacedPillar = { key: PillarKey; stem: string; branch: string };

const MUKU_INFO: Record<MukuBranch, { storageElement: BaziElement; clash: MukuBranch; pair: MukuPair }> = {
  辰: { storageElement: "water", clash: "戌", pair: "辰戌" },
  戌: { storageElement: "fire", clash: "辰", pair: "辰戌" },
  丑: { storageElement: "metal", clash: "未", pair: "丑未" },
  未: { storageElement: "wood", clash: "丑", pair: "丑未" },
};

function isMukuBranch(branch: string): branch is MukuBranch {
  return branch === "辰" || branch === "戌" || branch === "丑" || branch === "未";
}

function roleForElement(
  element: BaziElement,
  useful: Set<BaziElement>,
  avoid: Set<BaziElement>,
): MukuHiddenRole {
  const good = useful.has(element);
  const bad = avoid.has(element);
  if (good && bad) return "mixed";
  if (good) return "useful";
  if (bad) return "avoid";
  return "neutral";
}

function hiddenStemsForBranch(
  branch: MukuBranch,
  useful: Set<BaziElement>,
  avoid: Set<BaziElement>,
): MukuState["hiddenStems"] {
  return (HIDDEN_STEMS[branch] || [])
    .map((stem) => {
      const elementEn = STEM_ELEMENT[stem];
      if (!elementEn) return null;
      return { stem, element: ELEMENT_ZH[elementEn], elementEn, role: roleForElement(elementEn, useful, avoid) };
    })
    .filter((x): x is MukuState["hiddenStems"][number] => Boolean(x));
}

function verdictZhFor(finalVerdict: MukuFinalVerdict): MukuState["verdictZh"] {
  if (finalVerdict === "closed") return "閉庫";
  if (finalVerdict === "opened_favorable") return "沖庫得用";
  if (finalVerdict === "opened_unfavorable") return "沖庫成患";
  if (finalVerdict === "opened_mixed") return "沖庫雜動";
  return "沖庫有動";
}

function confidenceFor(finalVerdict: MukuFinalVerdict, clashedBy: MukuState["clashedBy"]): MukuState["confidence"] {
  if (finalVerdict === "closed") return "high";
  if (!clashedBy.length) return "high";
  const best = clashedBy.some((x) => x.distance === "adjacent") ? "adjacent"
    : clashedBy.some((x) => x.distance === "gap1") ? "gap1"
      : "remote";
  if (finalVerdict === "opened_mixed" || finalVerdict === "opened_neutral") return best === "remote" ? "low" : "medium";
  return best === "remote" ? "medium" : "high";
}

function summaryFor(input: {
  branch: MukuBranch;
  clash: MukuBranch;
  pair: MukuPair;
  storageElement: ChineseElement;
  finalVerdict: MukuFinalVerdict;
  usefulHiddenStems: string[];
  avoidHiddenStems: string[];
}): string {
  const label = `คลัง${input.branch} (${input.storageElement}庫)`;
  if (input.finalVerdict === "closed") {
    return `${label} ยังไม่ถูกคู่ชง${input.clash}ในผัง จึงฟันธงเป็นแรงเก็บไว้ก่อน ไม่ใช่แรงเปิดคลัง`;
  }
  const clash = `${label} ถูก${input.clash}ชง (${input.pair})`;
  if (input.finalVerdict === "opened_favorable") {
    return `${clash} และของในคลังอยู่ฝั่ง用/喜 จึงฟันธงเป็นคลังถูกกระตุ้นแล้วใช้ได้ แต่ไม่ใช่เห็นชงแล้วดีอัตโนมัติ`;
  }
  if (input.finalVerdict === "opened_unfavorable") {
    return `${clash} แต่ของในคลังอยู่ฝั่ง忌 จึงฟันธงเป็นคลังเปิดแล้วเป็นภาระ/แรงกด ไม่ใช่เปิดคลังแล้วรวย`;
  }
  if (input.finalVerdict === "opened_mixed") {
    return `${clash} มีทั้งธาตุหนุน(${input.usefulHiddenStems.join("/") || "-"})และธาตุต้าน(${input.avoidHiddenStems.join("/") || "-"}) จึงฟันธงเป็นคลังขยับแบบปน ต้องอ่านคู่กับ格局และวัยจร`;
  }
  return `${clash} แต่ยังไม่ชน用/忌ที่ engine ส่งมา จึงฟันธงเป็นแรงขยับกลางของคลัง`;
}

function transitSummaryFor(input: {
  scope: MukuTransitScope;
  label: string;
  transitStem: string;
  transitBranch: string;
  branch: MukuBranch;
  pillar: PillarKey;
  pair: MukuPair;
  storageElement: ChineseElement;
  finalVerdict: MukuFinalVerdict;
  usefulHiddenStems: string[];
  avoidHiddenStems: string[];
}): string {
  const scopeTh: Record<MukuTransitScope, string> = { luck: "วัยจร", annual: "ปีจร", month: "เดือนจร" };
  const label = input.label.startsWith(scopeTh[input.scope]) || input.label.startsWith("大運")
    ? input.label
    : `${scopeTh[input.scope]} ${input.label}`;
  const pillarText = input.label.includes(`${input.transitStem}${input.transitBranch}`)
    ? ""
    : ` ${input.transitStem}${input.transitBranch}`;
  const base = `${label}${pillarText} ชงคลัง${input.branch} (${input.storageElement}庫) ที่เสา${input.pillar} (${input.pair})`;
  if (input.finalVerdict === "opened_favorable") {
    return `${base} ของในคลังเข้าฝั่ง用/喜 จึงอ่านเป็นจังหวะคลังถูกกระตุ้นแล้วใช้ประโยชน์ได้`;
  }
  if (input.finalVerdict === "opened_unfavorable") {
    return `${base} ของในคลังเข้าฝั่ง忌 จึงอ่านเป็นจังหวะคลังถูกกระตุ้นแล้วกลายเป็นภาระ/แรงกด`;
  }
  if (input.finalVerdict === "opened_mixed") {
    return `${base} มีทั้งฝั่งหนุน(${input.usefulHiddenStems.join("/") || "-"})และฝั่งต้าน(${input.avoidHiddenStems.join("/") || "-"}) จึงอ่านเป็นจังหวะคลังขยับแบบปน`;
  }
  return `${base} ยังไม่ชน用/忌ที่ engine ส่งมา จึงอ่านเป็นแรงขยับกลางของคลัง`;
}

function finalVerdictFor(input: {
  isClashed: boolean;
  storageElement: BaziElement;
  useful: Set<BaziElement>;
  avoid: Set<BaziElement>;
  usefulHiddenStems: string[];
  avoidHiddenStems: string[];
}): MukuFinalVerdict {
  if (!input.isClashed) return "closed";
  const storageUseful = input.useful.has(input.storageElement);
  const storageAvoid = input.avoid.has(input.storageElement);
  if ((storageUseful && storageAvoid) || (input.usefulHiddenStems.length && input.avoidHiddenStems.length)) return "opened_mixed";
  if (storageUseful || input.usefulHiddenStems.length) return "opened_favorable";
  if (storageAvoid || input.avoidHiddenStems.length) return "opened_unfavorable";
  return "opened_neutral";
}

function transitConfidenceFor(scope: MukuTransitScope, finalVerdict: MukuFinalVerdict): MukuState["confidence"] {
  if (finalVerdict === "opened_mixed" || finalVerdict === "opened_neutral") return "medium";
  return scope === "month" ? "medium" : "high";
}

function visibleStoredStems(placed: PlacedPillar[], hiddenStems: string[]): Array<{ pillar: PillarKey; stem: string }> {
  return placed
    .filter((p) => hiddenStems.includes(p.stem))
    .map((p) => ({ pillar: p.key, stem: p.stem }));
}

export function buildMukuStates(
  pillars: BaziPillarsLike,
  opts: { usefulElements?: BaziElement[]; avoidElements?: BaziElement[] } = {},
): MukuState[] {
  const placed = activePillars(pillars);
  const useful = new Set(opts.usefulElements || []);
  const avoid = new Set(opts.avoidElements || []);
  const out: MukuState[] = [];

  for (const p of placed) {
    if (!isMukuBranch(p.branch)) continue;
    const info = MUKU_INFO[p.branch];
    const hiddenStemNames = HIDDEN_STEMS[p.branch] || [];
    const hiddenStems = hiddenStemsForBranch(p.branch, useful, avoid);

    const clashedBy = placed
      .filter((q) => q.key !== p.key && q.branch === info.clash)
      .map((q) => ({ pillar: q.key, branch: q.branch as MukuBranch, distance: distanceFor(p.key, q.key) }));
    const isClashed = clashedBy.length > 0;
    const visible = visibleStoredStems(placed, hiddenStemNames);
    const usefulHiddenStems = hiddenStems.filter((h) => h.role === "useful" || h.role === "mixed").map((h) => h.stem);
    const avoidHiddenStems = hiddenStems.filter((h) => h.role === "avoid" || h.role === "mixed").map((h) => h.stem);
    const finalVerdict = finalVerdictFor({
      isClashed,
      storageElement: info.storageElement,
      useful,
      avoid,
      usefulHiddenStems,
      avoidHiddenStems,
    });

    const reasonCodes: MukuReasonCode[] = ["storage_branch_present", "earth_primary_in_four_storage"];
    if (isClashed) {
      reasonCodes.push("storage_pair_clash_present", "storage_clash_not_automatically_good");
      const bestDistance = clashedBy.some((x) => x.distance === "adjacent") ? "adjacent"
        : clashedBy.some((x) => x.distance === "gap1") ? "gap1"
          : "remote";
      reasonCodes.push(bestDistance === "adjacent" ? "adjacent_storage_clash" : bestDistance === "gap1" ? "gap1_storage_clash" : "remote_storage_clash");
    } else {
      reasonCodes.push("storage_not_clashed");
    }
    if (visible.length) reasonCodes.push("stored_stem_visible");
    if (usefulHiddenStems.length) reasonCodes.push("stores_useful_element");
    if (avoidHiddenStems.length) reasonCodes.push("stores_avoid_element");

    out.push({
      type: "墓庫",
      branch: p.branch,
      pillar: p.key,
      storageElement: ELEMENT_ZH[info.storageElement],
      storageElementEn: info.storageElement,
      hiddenStems,
      visibleStoredStems: visible,
      isClashed,
      clashPair: isClashed ? info.pair : undefined,
      clashedBy,
      affectedPillars: Array.from(new Set([p.key, ...clashedBy.map((x) => x.pillar)])),
      storesUsefulElement: usefulHiddenStems.length > 0,
      storesAvoidElement: avoidHiddenStems.length > 0,
      usefulHiddenStems,
      avoidHiddenStems,
      finalVerdict,
      status: finalVerdict,
      verdictZh: verdictZhFor(finalVerdict),
      reasonCodes,
      sourceRuleIds: ["ZPZQ-MK-001"],
      confidence: confidenceFor(finalVerdict, clashedBy),
      thaiSummary: summaryFor({
        branch: p.branch,
        clash: info.clash,
        pair: info.pair,
        storageElement: ELEMENT_ZH[info.storageElement],
        finalVerdict,
        usefulHiddenStems,
        avoidHiddenStems,
      }),
      canonicalChinese: "刑衝未必成格",
    });
  }

  return out;
}

export function buildMukuTransitStates(
  pillars: BaziPillarsLike,
  transits: MukuTransitInput[],
  opts: { usefulElements?: BaziElement[]; avoidElements?: BaziElement[] } = {},
): MukuTransitState[] {
  const placed = activePillars(pillars);
  const useful = new Set(opts.usefulElements || []);
  const avoid = new Set(opts.avoidElements || []);
  const natalStorage = placed.filter((p): p is PlacedPillar & { branch: MukuBranch } => isMukuBranch(p.branch));
  const out: MukuTransitState[] = [];
  const seen = new Set<string>();

  for (const t of transits) {
    if (!t?.pillar?.branch) continue;
    for (const p of natalStorage) {
      const info = MUKU_INFO[p.branch];
      if (t.pillar.branch !== info.clash) continue;
      const key = `${t.scope}|${t.label}|${p.key}|${p.branch}|${t.pillar.stem}${t.pillar.branch}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const hiddenStemNames = HIDDEN_STEMS[p.branch] || [];
      const hiddenStems = hiddenStemsForBranch(p.branch, useful, avoid);
      const visible = visibleStoredStems(placed, hiddenStemNames);
      const usefulHiddenStems = hiddenStems.filter((h) => h.role === "useful" || h.role === "mixed").map((h) => h.stem);
      const avoidHiddenStems = hiddenStems.filter((h) => h.role === "avoid" || h.role === "mixed").map((h) => h.stem);
      const finalVerdict = finalVerdictFor({
        isClashed: true,
        storageElement: info.storageElement,
        useful,
        avoid,
        usefulHiddenStems,
        avoidHiddenStems,
      });
      const reasonCodes: MukuReasonCode[] = [
        "storage_branch_present",
        "transit_storage_clash_present",
        "storage_clash_not_automatically_good",
        "earth_primary_in_four_storage",
        t.scope === "luck" ? "luck_storage_clash" : t.scope === "annual" ? "annual_storage_clash" : "month_storage_clash",
      ];
      if (visible.length) reasonCodes.push("stored_stem_visible");
      if (usefulHiddenStems.length) reasonCodes.push("stores_useful_element");
      if (avoidHiddenStems.length) reasonCodes.push("stores_avoid_element");

      out.push({
        type: "墓庫流動",
        scope: t.scope,
        label: t.label,
        year: t.year,
        month: t.month,
        transitPillar: { stem: t.pillar.stem, branch: t.pillar.branch },
        branch: p.branch,
        pillar: p.key,
        storageElement: ELEMENT_ZH[info.storageElement],
        storageElementEn: info.storageElement,
        hiddenStems,
        visibleStoredStems: visible,
        clashPair: info.pair,
        clashedByTransit: { scope: t.scope, label: t.label, branch: t.pillar.branch as MukuBranch },
        affectedPillars: [p.key],
        storesUsefulElement: usefulHiddenStems.length > 0,
        storesAvoidElement: avoidHiddenStems.length > 0,
        usefulHiddenStems,
        avoidHiddenStems,
        finalVerdict,
        status: finalVerdict,
        verdictZh: verdictZhFor(finalVerdict),
        reasonCodes,
        sourceRuleIds: ["ZPZQ-MK-001"],
        confidence: transitConfidenceFor(t.scope, finalVerdict),
        thaiSummary: transitSummaryFor({
          scope: t.scope,
          label: t.label,
          transitStem: t.pillar.stem,
          transitBranch: t.pillar.branch,
          branch: p.branch,
          pillar: p.key,
          pair: info.pair,
          storageElement: ELEMENT_ZH[info.storageElement],
          finalVerdict,
          usefulHiddenStems,
          avoidHiddenStems,
        }),
        canonicalChinese: "刑衝未必成格",
      });
    }
  }

  return out;
}

export function explainMukuState(v: MukuState): string {
  const rules = v.sourceRuleIds.map((id) => getBaziInteractionRule(id)?.thaiSummary || id).join(" · ");
  const clash = v.clashedBy.length
    ? `clash=${v.clashedBy.map((x) => `${x.pillar}.${x.branch}/${x.distance}`).join(",")}`
    : "no clash";
  return [
    `${v.branch} ${v.verdictZh}`,
    `final=${v.finalVerdict}`,
    clash,
    v.thaiSummary,
    `เหตุผล ${v.reasonCodes.join(", ")}`,
    `rule ${v.sourceRuleIds.join("/")}`,
    rules,
  ].filter(Boolean).join(" · ");
}
