type RuntimeZibaiDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";
type RuntimeZibaiStar = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type RuntimeZibaiElement = "water" | "wood" | "fire" | "earth" | "metal";
type RuntimeZibaiRelation = "generates-palace" | "controls-palace" | "palace-generates-star" | "same-element" | "palace-controls-star";
type RuntimeZibaiLayerName = "month" | "day" | "shichen";
type RuntimeZibaiPatternCode = "three_layer_same_star" | "two_layer_same_star" | "aligned" | "supportive_contested" | "mixed_caution_priority" | "heightened_caution" | "reference_only";
type RuntimeZibaiCoherenceCode = "concentrated" | "repeated" | "aligned" | "mixed" | "contested";
type RuntimeZibaiWarningCode = "five_yellow_caution" | "two_black_caution" | "palace_restrains_star" | "star_conflicts_with_palace";
type RuntimeZibaiActionCode = "plan_communicate_calmly" | "reduce_strain_rest_keep_orderly" | "keep_sector_calm_avoid_drilling_demolition_vibration" | "use_light_visibility_creativity_thoughtfully" | "reference_only";
type RuntimeZibaiLayerEvidence = Readonly<{ star: RuntimeZibaiStar; starElement: RuntimeZibaiElement; relation: RuntimeZibaiRelation }>;
type RuntimeZibaiSectorReading = Readonly<{
  direction: RuntimeZibaiDirection;
  palaceElement: RuntimeZibaiElement;
  month: RuntimeZibaiLayerEvidence;
  day: RuntimeZibaiLayerEvidence;
  shichen: RuntimeZibaiLayerEvidence | null;
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly RuntimeZibaiLayerName[];
  patternCode: RuntimeZibaiPatternCode;
  coherenceCode: RuntimeZibaiCoherenceCode;
  warningCodes: readonly RuntimeZibaiWarningCode[];
  actionCode: RuntimeZibaiActionCode;
}>;
type RuntimeZibaiSnapshot = Readonly<{
  month: Readonly<{ palaces: Readonly<Record<RuntimeZibaiDirection, number>> }>;
  day: Readonly<{ palaces: Readonly<Record<RuntimeZibaiDirection, number>> }>;
  shichen: Readonly<{ palaces: Readonly<Record<RuntimeZibaiDirection, number>> }>;
}>;
declare const api: Readonly<{
  interpretZibaiSectors(snapshot: RuntimeZibaiSnapshot, includeShichen: boolean): readonly RuntimeZibaiSectorReading[];
  starElementFor(star: number): RuntimeZibaiElement;
  starPalaceRelation(star: number, direction: RuntimeZibaiDirection): RuntimeZibaiRelation;
}>;
export = api;
