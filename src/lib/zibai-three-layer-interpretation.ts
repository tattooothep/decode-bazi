import type { Dir9 } from "./fengshui-luxing";
import {
  starPalaceRelation,
  type ZibaiElement,
  type ZibaiRelation,
  type ZibaiSnapshotV2,
} from "./zibai-science";

export type ZibaiStar = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ZibaiLayerName = "month" | "day" | "shichen";

export type ZibaiPatternCode =
  | "three_layer_same_star"
  | "two_layer_same_star"
  | "aligned"
  | "supportive_contested"
  | "mixed_caution_priority"
  | "heightened_caution"
  | "reference_only";

export type ZibaiCoherenceCode = "concentrated" | "repeated" | "aligned" | "mixed" | "contested";

export type ZibaiWarningCode =
  | "five_yellow_caution"
  | "two_black_caution"
  | "palace_restrains_star"
  | "star_conflicts_with_palace";

export type ZibaiActionCode =
  | "plan_communicate_calmly"
  | "reduce_strain_rest_keep_orderly"
  | "keep_sector_calm_avoid_drilling_demolition_vibration"
  | "use_light_visibility_creativity_thoughtfully"
  | "reference_only";

export type ZibaiLayerEvidence = Readonly<{
  star: ZibaiStar;
  starElement: ZibaiElement;
  relation: ZibaiRelation;
}>;

export type ZibaiSectorReading = Readonly<{
  direction: Dir9;
  palaceElement: ZibaiElement;
  month: ZibaiLayerEvidence;
  day: ZibaiLayerEvidence;
  shichen: ZibaiLayerEvidence | null;
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly ZibaiLayerName[];
  patternCode: ZibaiPatternCode;
  coherenceCode: ZibaiCoherenceCode;
  warningCodes: readonly string[];
  actionCode: string;
}>;

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const satisfies readonly Dir9[];

const PALACE_ELEMENT: Readonly<Record<Dir9, ZibaiElement>> = Object.freeze({
  N: "water", NE: "earth", E: "wood", SE: "wood", S: "fire",
  SW: "earth", W: "metal", NW: "metal", C: "earth",
});

const STAR_ELEMENT: Readonly<Record<ZibaiStar, ZibaiElement>> = Object.freeze({
  1: "water", 2: "earth", 3: "wood", 4: "wood", 5: "earth",
  6: "metal", 7: "metal", 8: "earth", 9: "fire",
});

const PRACTICAL_STARS: ReadonlySet<ZibaiStar> = new Set([1, 2, 5, 9]);
const SUPPORT_STARS: ReadonlySet<ZibaiStar> = new Set([1, 9]);
const CAUTION_STARS: ReadonlySet<ZibaiStar> = new Set([2, 5]);
const CONTESTED_RELATIONS: ReadonlySet<ZibaiRelation> = new Set(["palace-controls-star", "controls-palace"]);

type ActiveLayer = Readonly<{ name: ZibaiLayerName; evidence: ZibaiLayerEvidence }>;

function evidence(
  star: number,
  direction: Dir9,
): ZibaiLayerEvidence {
  const canonicalStar = star as ZibaiStar;
  return Object.freeze({
    star: canonicalStar,
    starElement: STAR_ELEMENT[canonicalStar],
    relation: starPalaceRelation(canonicalStar, direction),
  });
}

function repetition(layers: readonly ActiveLayer[]): Readonly<{
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly ZibaiLayerName[];
}> {
  const [month, day, shichen] = layers;
  if (shichen && month.evidence.star === day.evidence.star && day.evidence.star === shichen.evidence.star) {
    return Object.freeze({
      repeatCount: 3,
      repeatedLayers: Object.freeze(layers.map((layer) => layer.name)),
    });
  }
  let repeatedStar: ZibaiStar | undefined;
  if (month.evidence.star === day.evidence.star) repeatedStar = month.evidence.star;
  else if (shichen && month.evidence.star === shichen.evidence.star) repeatedStar = month.evidence.star;
  else if (shichen && day.evidence.star === shichen.evidence.star) repeatedStar = day.evidence.star;
  if (repeatedStar === undefined) {
    return Object.freeze({ repeatCount: 1, repeatedLayers: Object.freeze([]) });
  }
  return Object.freeze({
    repeatCount: 2,
    repeatedLayers: Object.freeze(layers
      .filter((layer) => layer.evidence.star === repeatedStar)
      .map((layer) => layer.name)),
  });
}

function patternFor(layers: readonly ActiveLayer[], repeatCount: 1 | 2 | 3): ZibaiPatternCode {
  const stars = layers.map((layer) => layer.evidence.star);
  const allSameStar = layers.length === 3 && repeatCount === 3;
  const hasFive = stars.includes(5);
  const hasSupport = stars.some((star) => SUPPORT_STARS.has(star));
  const hasCaution = stars.some((star) => CAUTION_STARS.has(star));
  const allGuidanceSupported = stars.every((star) => PRACTICAL_STARS.has(star));
  const hasRestrainingRelation = layers.some((layer) => CONTESTED_RELATIONS.has(layer.evidence.relation));
  if (allSameStar) return "three_layer_same_star";
  if (repeatCount === 2 && hasFive) return "heightened_caution";
  if (repeatCount === 2) return "two_layer_same_star";
  if (hasSupport && hasCaution) return "mixed_caution_priority";
  if (hasCaution) return "heightened_caution";
  if (allGuidanceSupported && hasRestrainingRelation) return "supportive_contested";
  if (allGuidanceSupported) return "aligned";
  return "reference_only";
}

function coherenceFor(patternCode: ZibaiPatternCode): ZibaiCoherenceCode {
  if (patternCode === "three_layer_same_star") return "concentrated";
  if (patternCode === "two_layer_same_star") return "repeated";
  if (patternCode === "aligned") return "aligned";
  if (patternCode === "mixed_caution_priority" || patternCode === "reference_only") return "mixed";
  return "contested";
}

function warningsFor(layers: readonly ActiveLayer[]): readonly ZibaiWarningCode[] {
  const stars = layers.map((layer) => layer.evidence.star);
  const practicalRelations = layers
    .filter((layer) => PRACTICAL_STARS.has(layer.evidence.star))
    .map((layer) => layer.evidence.relation);
  const warningCodes: ZibaiWarningCode[] = [];
  if (stars.includes(5)) warningCodes.push("five_yellow_caution");
  if (stars.includes(2)) warningCodes.push("two_black_caution");
  if (practicalRelations.includes("palace-controls-star")) warningCodes.push("palace_restrains_star");
  if (practicalRelations.includes("controls-palace")) warningCodes.push("star_conflicts_with_palace");
  return Object.freeze(warningCodes);
}

function actionFor(layers: readonly ActiveLayer[], patternCode: ZibaiPatternCode): ZibaiActionCode {
  if (patternCode === "reference_only") return "reference_only";
  const currentFirst = [...layers].reverse();
  const selected = currentFirst.find((layer) => CAUTION_STARS.has(layer.evidence.star))
    ?? currentFirst.find((layer) => SUPPORT_STARS.has(layer.evidence.star));
  if (selected?.evidence.star === 5) return "keep_sector_calm_avoid_drilling_demolition_vibration";
  if (selected?.evidence.star === 2) return "reduce_strain_rest_keep_orderly";
  if (selected?.evidence.star === 1) return "plan_communicate_calmly";
  if (selected?.evidence.star === 9) return "use_light_visibility_creativity_thoughtfully";
  return "reference_only";
}

function readingFor(snapshot: ZibaiSnapshotV2, direction: Dir9, includeShichen: boolean): ZibaiSectorReading {
  const month = evidence(snapshot.month.palaces[direction], direction);
  const day = evidence(snapshot.day.palaces[direction], direction);
  const shichen = includeShichen
    ? evidence(snapshot.shichen.palaces[direction], direction)
    : null;
  const layers: readonly ActiveLayer[] = shichen
    ? Object.freeze([
      Object.freeze({ name: "month" as const, evidence: month }),
      Object.freeze({ name: "day" as const, evidence: day }),
      Object.freeze({ name: "shichen" as const, evidence: shichen }),
    ])
    : Object.freeze([
      Object.freeze({ name: "month" as const, evidence: month }),
      Object.freeze({ name: "day" as const, evidence: day }),
    ]);
  const repeat = repetition(layers);
  const patternCode = patternFor(layers, repeat.repeatCount);
  return Object.freeze({
    direction,
    palaceElement: PALACE_ELEMENT[direction],
    month,
    day,
    shichen,
    repeatCount: repeat.repeatCount,
    repeatedLayers: repeat.repeatedLayers,
    patternCode,
    coherenceCode: coherenceFor(patternCode),
    warningCodes: warningsFor(layers),
    actionCode: actionFor(layers, patternCode),
  });
}

export function interpretZibaiSectors(
  snapshot: ZibaiSnapshotV2,
  includeShichen: boolean,
): readonly ZibaiSectorReading[] {
  return Object.freeze(DIRECTIONS.map((direction) => readingFor(snapshot, direction, includeShichen)));
}
