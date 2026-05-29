export type BaziElement = "wood" | "fire" | "earth" | "metal" | "water";
export type ChineseElement = "木" | "火" | "土" | "金" | "水";
export type PillarKey = "year" | "month" | "day" | "hour";
export type HehuaDistance = "adjacent" | "gap1" | "remote";

export type BaziPillarLike = {
  stem: string;
  branch: string;
};

export type BaziPillarsLike = Partial<Record<PillarKey, BaziPillarLike | null>>;

export type StemStrength = {
  pillar: PillarKey;
  stem: string;
  element: BaziElement;
  rooted: boolean;
  seasonSupported: boolean;
  distanceToCombo: HehuaDistance;
  score: number;
  verdict: "strong" | "weak";
  reasonCodes: Array<
    | "visible_stem"
    | "rooted_in_own_branch"
    | "rooted_in_other_branch"
    | "season_supports_stem_element"
    | "adjacent_to_combo"
    | "gap1_to_combo"
    | "remote_from_combo"
  >;
};

export const PILLAR_ORDER: PillarKey[] = ["year", "month", "day", "hour"];

export const STEM_ELEMENT: Record<string, BaziElement> = {
  甲: "wood", 乙: "wood",
  丙: "fire", 丁: "fire",
  戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal",
  壬: "water", 癸: "water",
};

export const ELEMENT_ZH: Record<BaziElement, ChineseElement> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

export const ELEMENT_CONTROLS: Record<BaziElement, BaziElement> = {
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
  metal: "wood",
};

export const HIDDEN_STEMS: Record<string, string[]> = {
  子: ["癸"],
  丑: ["己", "癸", "辛"],
  寅: ["甲", "丙", "戊"],
  卯: ["乙"],
  辰: ["戊", "乙", "癸"],
  巳: ["丙", "庚", "戊"],
  午: ["丁", "己"],
  未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"],
  酉: ["辛"],
  戌: ["戊", "辛", "丁"],
  亥: ["壬", "甲"],
};

export function pillarIndex(p: PillarKey): number {
  return PILLAR_ORDER.indexOf(p);
}

export function distanceFor(a: PillarKey, b: PillarKey): HehuaDistance {
  const d = Math.abs(pillarIndex(a) - pillarIndex(b));
  if (d <= 1) return "adjacent";
  if (d === 2) return "gap1";
  return "remote";
}

export function distanceToCombo(pillar: PillarKey, combo: [PillarKey, PillarKey]): HehuaDistance {
  const idx = pillarIndex(pillar);
  const min = Math.min(...combo.map(pillarIndex));
  const max = Math.max(...combo.map(pillarIndex));
  if (idx >= min - 1 && idx <= max + 1) return "adjacent";
  if (idx >= min - 2 && idx <= max + 2) return "gap1";
  return "remote";
}

export function activePillars(pillars: BaziPillarsLike): Array<{ key: PillarKey; stem: string; branch: string }> {
  return PILLAR_ORDER
    .map((key) => ({ key, stem: pillars[key]?.stem || "", branch: pillars[key]?.branch || "" }))
    .filter((p) => Boolean(p.stem && p.branch));
}

export function hasBranchRootForElement(branch: string, element: BaziElement): boolean {
  return (HIDDEN_STEMS[branch] || []).some((stem) => STEM_ELEMENT[stem] === element);
}

export function hasRootForElement(pillars: BaziPillarsLike, element: BaziElement): boolean {
  return activePillars(pillars).some((p) => hasBranchRootForElement(p.branch, element));
}

export function seasonSupportsElement(monthBranch: string, element: BaziElement): boolean {
  return hasBranchRootForElement(monthBranch, element);
}

export function assessStemStrength(input: {
  pillar: PillarKey;
  stem: string;
  branch: string;
  allPillars: BaziPillarsLike;
  comboPillars: [PillarKey, PillarKey];
  monthBranch: string;
}): StemStrength | null {
  const element = STEM_ELEMENT[input.stem];
  if (!element) return null;

  const rootedOwn = hasBranchRootForElement(input.branch, element);
  const rootedAny = hasRootForElement(input.allPillars, element);
  const seasonSupported = seasonSupportsElement(input.monthBranch, element);
  const distance = distanceToCombo(input.pillar, input.comboPillars);
  const reasonCodes: StemStrength["reasonCodes"] = ["visible_stem"];
  if (rootedOwn) reasonCodes.push("rooted_in_own_branch");
  else if (rootedAny) reasonCodes.push("rooted_in_other_branch");
  if (seasonSupported) reasonCodes.push("season_supports_stem_element");
  reasonCodes.push(distance === "adjacent" ? "adjacent_to_combo" : distance === "gap1" ? "gap1_to_combo" : "remote_from_combo");

  const score =
    (rootedOwn ? 3 : rootedAny ? 1 : 0) +
    (seasonSupported ? 2 : 0) +
    (distance === "adjacent" ? 2 : distance === "gap1" ? 1 : 0);

  return {
    pillar: input.pillar,
    stem: input.stem,
    element,
    rooted: rootedOwn || rootedAny,
    seasonSupported,
    distanceToCombo: distance,
    score,
    verdict: (rootedOwn || rootedAny) && distance === "adjacent" ? "strong" : "weak",
    reasonCodes,
  };
}
