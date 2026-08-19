import type { Dir9 } from "./fengshui-luxing";
import type {
  ZibaiElement,
  ZibaiRelation,
  ZibaiSnapshotV2,
} from "./zibai-science";
import ruleRuntime from "./zibai-three-layer-runtime.cjs";

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
  warningCodes: readonly ZibaiWarningCode[];
  actionCode: ZibaiActionCode;
}>;

/** Typed adapter over the one synchronous CJS rule kernel used by payload validation. */
export function interpretZibaiSectors(
  snapshot: ZibaiSnapshotV2,
  includeShichen: boolean,
): readonly ZibaiSectorReading[] {
  return ruleRuntime.interpretZibaiSectors(snapshot, includeShichen) as readonly ZibaiSectorReading[];
}
