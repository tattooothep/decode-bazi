import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  interpretZibaiSectors,
  type ZibaiActionCode,
  type ZibaiCoherenceCode,
  type ZibaiPatternCode,
  type ZibaiSectorReading,
  type ZibaiWarningCode,
} from "../src/lib/zibai-three-layer-interpretation.ts";
import type {
  ZibaiElement,
  ZibaiRelation,
  ZibaiSnapshotV2,
} from "../src/lib/zibai-science.ts";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const;
const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const UNSUPPORTED_STARS = [3, 4, 6, 7, 8] as const;
const WARNING_CODES = [
  "five_yellow_caution",
  "two_black_caution",
  "palace_restrains_star",
  "star_conflicts_with_palace",
] as const satisfies readonly ZibaiWarningCode[];
const ACTION_CODES = [
  "plan_communicate_calmly",
  "reduce_strain_rest_keep_orderly",
  "keep_sector_calm_avoid_drilling_demolition_vibration",
  "use_light_visibility_creativity_thoughtfully",
  "reference_only",
] as const satisfies readonly ZibaiActionCode[];
const PATTERN_CODES = [
  "three_layer_same_star",
  "two_layer_same_star",
  "aligned",
  "supportive_contested",
  "mixed_caution_priority",
  "heightened_caution",
  "reference_only",
] as const satisfies readonly ZibaiPatternCode[];
const COHERENCE_CODES = [
  "concentrated", "repeated", "aligned", "mixed", "contested",
] as const satisfies readonly ZibaiCoherenceCode[];

const WARNING_CODE_SET: ReadonlySet<ZibaiWarningCode> = new Set(WARNING_CODES);
const ACTION_CODE_SET: ReadonlySet<ZibaiActionCode> = new Set(ACTION_CODES);
const PATTERN_CODE_SET: ReadonlySet<ZibaiPatternCode> = new Set(PATTERN_CODES);
const COHERENCE_CODE_SET: ReadonlySet<ZibaiCoherenceCode> = new Set(COHERENCE_CODES);

const PALACE_ELEMENT: Readonly<Record<(typeof DIRECTIONS)[number], ZibaiElement>> = {
  N: "water", NE: "earth", E: "wood", SE: "wood", S: "fire",
  SW: "earth", W: "metal", NW: "metal", C: "earth",
};
const STAR_ELEMENT: Readonly<Record<number, ZibaiElement>> = {
  1: "water", 2: "earth", 3: "wood", 4: "wood", 5: "earth",
  6: "metal", 7: "metal", 8: "earth", 9: "fire",
};
const GENERATES: Readonly<Record<ZibaiElement, ZibaiElement>> = {
  water: "wood", wood: "fire", fire: "earth", earth: "metal", metal: "water",
};
const CONTROLS: Readonly<Record<ZibaiElement, ZibaiElement>> = {
  water: "fire", fire: "metal", metal: "wood", wood: "earth", earth: "water",
};
const EXPRESSION_WARNING_BY_RELATION = {
  "same-element": null,
  "generates-palace": null,
  "palace-generates-star": null,
  "palace-controls-star": "palace_restrains_star",
  "controls-palace": "star_conflicts_with_palace",
} as const satisfies Readonly<Record<ZibaiRelation, ZibaiWarningCode | null>>;
const EXPRESSION_WARNING_ORDER = [
  "palace_restrains_star", "star_conflicts_with_palace",
] as const satisfies readonly ZibaiWarningCode[];

type Direction = (typeof DIRECTIONS)[number];
type Star = (typeof STARS)[number];
type LayerName = "month" | "day" | "shichen";
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
  : false;
type Expect<T extends true> = T;
type WarningFieldIsExact = Expect<Equal<ZibaiSectorReading["warningCodes"], readonly ZibaiWarningCode[]>>;
type ActionFieldIsExact = Expect<Equal<ZibaiSectorReading["actionCode"], ZibaiActionCode>>;
type WarningTableIsExhaustive = Expect<Equal<ZibaiWarningCode, (typeof WARNING_CODES)[number]>>;
type ActionTableIsExhaustive = Expect<Equal<ZibaiActionCode, (typeof ACTION_CODES)[number]>>;
type CompileTimeContract = WarningFieldIsExact | ActionFieldIsExact | WarningTableIsExhaustive | ActionTableIsExhaustive;
const COMPILE_TIME_CONTRACT: CompileTimeContract = true;
assert.equal(COMPILE_TIME_CONTRACT, true);

function relationFor(star: Star, direction: Direction): ZibaiRelation {
  const starElement = STAR_ELEMENT[star];
  const palaceElement = PALACE_ELEMENT[direction];
  if (starElement === palaceElement) return "same-element";
  if (GENERATES[starElement] === palaceElement) return "generates-palace";
  if (GENERATES[palaceElement] === starElement) return "palace-generates-star";
  if (CONTROLS[starElement] === palaceElement) return "controls-palace";
  return "palace-controls-star";
}

function permutationWith(direction: Direction, star: Star): Readonly<Record<Direction, number>> {
  const remaining = STARS.filter((candidate) => candidate !== star);
  let index = 0;
  return Object.freeze(Object.fromEntries(DIRECTIONS.map((candidate) => [
    candidate,
    candidate === direction ? star : remaining[index++],
  ])) as Record<Direction, number>);
}

function snapshotFor(direction: Direction, month: Star, day: Star, shichen: Star): ZibaiSnapshotV2 {
  return Object.freeze({
    snapshotSchema: 2,
    calculationVersion: "zibai-zaoming-true-solar-v2",
    interpretationVersion: "zibai-3layer-rule-v1",
    month: Object.freeze({
      palaces: permutationWith(direction, month),
      startAt: "2026-08-07T11:42:43.000Z",
      endAt: "2026-09-07T14:41:16.000Z",
      flight: "順" as const,
      meta: Object.freeze({
        yearBranch: "午", monthBranch: "申", jieqiMonth: 7,
        startTermCode: "liqiu", endTermCode: "bailu",
      }),
    }),
    day: Object.freeze({
      palaces: permutationWith(direction, day),
      startAt: "2026-08-15T16:22:49.886Z",
      endAt: "2026-08-16T16:22:38.132Z",
      flight: "逆" as const,
      meta: Object.freeze({ apparentSolarDate: "2026-08-16", dayPillar: "壬戌" }),
    }),
    shichen: Object.freeze({
      palaces: permutationWith(direction, shichen),
      startAt: "2026-08-16T02:22:45.060Z",
      endAt: "2026-08-16T04:22:44.083Z",
      flight: "順" as const,
      meta: Object.freeze({ key: "si" as const }),
    }),
  });
}

function repeatEvidence(stars: readonly Star[], includeShichen: boolean): Readonly<{
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly LayerName[];
}> {
  const layers: readonly LayerName[] = includeShichen ? ["month", "day", "shichen"] : ["month", "day"];
  if (includeShichen && stars[0] === stars[1] && stars[1] === stars[2]) {
    return { repeatCount: 3, repeatedLayers: layers };
  }
  let repeatedStar: Star | undefined;
  if (stars[0] === stars[1]) repeatedStar = stars[0];
  else if (includeShichen && stars[0] === stars[2]) repeatedStar = stars[0];
  else if (includeShichen && stars[1] === stars[2]) repeatedStar = stars[1];
  if (repeatedStar === undefined) return { repeatCount: 1, repeatedLayers: [] };
  return {
    repeatCount: 2,
    repeatedLayers: layers.filter((_, index) => stars[index] === repeatedStar),
  };
}

function sector(readings: readonly ZibaiSectorReading[], direction: Direction): ZibaiSectorReading {
  const found = readings.find((reading) => reading.direction === direction);
  assert.ok(found, `${direction}: sector must exist`);
  return found;
}

function permutations(values: readonly Star[]): readonly (readonly Star[])[] {
  if (values.length === 1) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((tail) => [value, ...tail]));
}

function expressionWarnings(stars: readonly Star[], direction: Direction): readonly ZibaiWarningCode[] {
  const present = new Set<ZibaiWarningCode>();
  for (const star of stars) {
    const warning = EXPRESSION_WARNING_BY_RELATION[relationFor(star, direction)];
    if (warning !== null) present.add(warning);
  }
  return EXPRESSION_WARNING_ORDER.filter((warning) => present.has(warning));
}

let exhaustiveCount = 0;
for (const direction of DIRECTIONS) {
  for (const month of STARS) {
    for (const day of STARS) {
      for (const shichen of STARS) {
        const stars = [month, day, shichen] as const;
        const snapshot = snapshotFor(direction, month, day, shichen);
        const inputBefore = JSON.stringify(snapshot);
        const first = interpretZibaiSectors(snapshot, true);
        const second = interpretZibaiSectors(snapshot, true);
        const reading = sector(first, direction);
        const repeat = repeatEvidence(stars, true);

        assert.equal(first.length, 9, `${direction} ${stars.join("-")}: exactly nine sectors`);
        assert.deepEqual(first.map((item) => item.direction), DIRECTIONS, `${direction} ${stars.join("-")}: stable direction order`);
        assert.deepEqual(first, second, `${direction} ${stars.join("-")}: deterministic output`);
        assert.equal(JSON.stringify(snapshot), inputBefore, `${direction} ${stars.join("-")}: input is not mutated`);
        assert.deepEqual(reading.month, {
          star: month,
          starElement: STAR_ELEMENT[month],
          relation: relationFor(month, direction),
        });
        assert.deepEqual(reading.day, {
          star: day,
          starElement: STAR_ELEMENT[day],
          relation: relationFor(day, direction),
        });
        assert.deepEqual(reading.shichen, {
          star: shichen,
          starElement: STAR_ELEMENT[shichen],
          relation: relationFor(shichen, direction),
        });
        assert.equal(reading.palaceElement, PALACE_ELEMENT[direction]);
        assert.equal(reading.repeatCount, repeat.repeatCount);
        assert.deepEqual(reading.repeatedLayers, repeat.repeatedLayers);
        assert.ok(PATTERN_CODE_SET.has(reading.patternCode), `${direction} ${stars.join("-")}: fixed pattern code`);
        assert.ok(COHERENCE_CODE_SET.has(reading.coherenceCode), `${direction} ${stars.join("-")}: fixed coherence code`);
        assert.ok(ACTION_CODE_SET.has(reading.actionCode), `${direction} ${stars.join("-")}: fixed action code`);
        assert.equal(new Set(reading.warningCodes).size, reading.warningCodes.length, `${direction} ${stars.join("-")}: warnings are unique`);
        for (const warning of reading.warningCodes) {
          assert.ok(WARNING_CODE_SET.has(warning), `${direction} ${stars.join("-")}: fixed warning code`);
        }
        if (stars.includes(5)) assert.ok(reading.warningCodes.includes("five_yellow_caution"), `${direction} ${stars.join("-")}: Five Yellow cannot be cancelled`);
        if (stars.includes(2)) assert.ok(reading.warningCodes.includes("two_black_caution"), `${direction} ${stars.join("-")}: Two Black cannot be cancelled`);
        assert.ok(Object.isFrozen(first) && Object.isFrozen(reading), `${direction} ${stars.join("-")}: output is immutable`);
        assert.ok(Object.isFrozen(reading.month) && Object.isFrozen(reading.day) && Object.isFrozen(reading.shichen), `${direction} ${stars.join("-")}: evidence is immutable`);
        assert.ok(Object.isFrozen(reading.repeatedLayers) && Object.isFrozen(reading.warningCodes), `${direction} ${stars.join("-")}: arrays are immutable`);
        assert.deepEqual(Object.keys(reading).sort(), [
          "actionCode", "coherenceCode", "day", "direction", "month", "palaceElement",
          "patternCode", "repeatCount", "repeatedLayers", "shichen", "warningCodes",
        ].sort(), `${direction} ${stars.join("-")}: no scalar fields`);
        exhaustiveCount += 1;
      }
    }
  }
}
assert.equal(exhaustiveCount, 6_561, "9^3 stars across nine palaces are exhaustive");

const FIXED_LATTICE_CASES = [
  {
    id: "ordinary-repeat-precedes-unsupported",
    direction: "N", stars: [9, 9, 6], includeShichen: true,
    repeatCount: 2, repeatedLayers: ["month", "day"],
    patternCode: "two_layer_same_star", coherenceCode: "repeated",
    warningCodes: ["palace_restrains_star"],
    actionCode: "use_light_visibility_creativity_thoughtfully",
  },
  {
    id: "five-precedes-ordinary-repeat",
    direction: "E", stars: [5, 9, 9], includeShichen: true,
    repeatCount: 2, repeatedLayers: ["day", "shichen"],
    patternCode: "heightened_caution", coherenceCode: "contested",
    warningCodes: ["five_yellow_caution", "palace_restrains_star"],
    actionCode: "keep_sector_calm_avoid_drilling_demolition_vibration",
  },
  {
    id: "unique-cautions-without-support",
    direction: "E", stars: [5, 2, 6], includeShichen: true,
    repeatCount: 1, repeatedLayers: [],
    patternCode: "heightened_caution", coherenceCode: "contested",
    warningCodes: ["five_yellow_caution", "two_black_caution", "palace_restrains_star"],
    actionCode: "reduce_strain_rest_keep_orderly",
  },
  {
    id: "mixed-support-and-caution",
    direction: "E", stars: [9, 5, 2], includeShichen: true,
    repeatCount: 1, repeatedLayers: [],
    patternCode: "mixed_caution_priority", coherenceCode: "mixed",
    warningCodes: ["five_yellow_caution", "two_black_caution", "palace_restrains_star"],
    actionCode: "reduce_strain_rest_keep_orderly",
  },
  {
    id: "daily-supported-but-restrained",
    direction: "N", stars: [1, 9, 6], includeShichen: false,
    repeatCount: 1, repeatedLayers: [],
    patternCode: "supportive_contested", coherenceCode: "contested",
    warningCodes: ["palace_restrains_star"],
    actionCode: "use_light_visibility_creativity_thoughtfully",
  },
  {
    id: "daily-aligned-support",
    direction: "E", stars: [1, 9, 6], includeShichen: false,
    repeatCount: 1, repeatedLayers: [],
    patternCode: "aligned", coherenceCode: "aligned",
    warningCodes: [],
    actionCode: "use_light_visibility_creativity_thoughtfully",
  },
  {
    id: "unsupported-mix",
    direction: "N", stars: [1, 6, 8], includeShichen: true,
    repeatCount: 1, repeatedLayers: [],
    patternCode: "reference_only", coherenceCode: "mixed",
    warningCodes: [],
    actionCode: "reference_only",
  },
] as const satisfies readonly Readonly<{
  id: string;
  direction: Direction;
  stars: readonly [Star, Star, Star];
  includeShichen: boolean;
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly LayerName[];
  patternCode: ZibaiPatternCode;
  coherenceCode: ZibaiCoherenceCode;
  warningCodes: readonly ZibaiWarningCode[];
  actionCode: ZibaiActionCode;
}>[];

for (const testCase of FIXED_LATTICE_CASES) {
  const [month, day, shichen] = testCase.stars;
  const reading = sector(
    interpretZibaiSectors(snapshotFor(testCase.direction, month, day, shichen), testCase.includeShichen),
    testCase.direction,
  );
  assert.deepEqual({
    repeatCount: reading.repeatCount,
    repeatedLayers: reading.repeatedLayers,
    patternCode: reading.patternCode,
    coherenceCode: reading.coherenceCode,
    warningCodes: reading.warningCodes,
    actionCode: reading.actionCode,
  }, {
    repeatCount: testCase.repeatCount,
    repeatedLayers: testCase.repeatedLayers,
    patternCode: testCase.patternCode,
    coherenceCode: testCase.coherenceCode,
    warningCodes: testCase.warningCodes,
    actionCode: testCase.actionCode,
  }, testCase.id);
}

const TRIPLE_CASES = [
  { star: 1, baseWarnings: [], actionCode: "plan_communicate_calmly" },
  { star: 2, baseWarnings: ["two_black_caution"], actionCode: "reduce_strain_rest_keep_orderly" },
  { star: 5, baseWarnings: ["five_yellow_caution"], actionCode: "keep_sector_calm_avoid_drilling_demolition_vibration" },
  { star: 9, baseWarnings: [], actionCode: "use_light_visibility_creativity_thoughtfully" },
] as const satisfies readonly Readonly<{
  star: Star;
  baseWarnings: readonly ZibaiWarningCode[];
  actionCode: ZibaiActionCode;
}>[];
const ALL_RELATIONS = [
  "same-element", "generates-palace", "palace-generates-star", "palace-controls-star", "controls-palace",
] as const satisfies readonly ZibaiRelation[];

for (const testCase of TRIPLE_CASES) {
  const observedRelations = new Set<ZibaiRelation>();
  for (const direction of DIRECTIONS) {
    const reading = sector(
      interpretZibaiSectors(snapshotFor(direction, testCase.star, testCase.star, testCase.star), true),
      direction,
    );
    const relation = relationFor(testCase.star, direction);
    observedRelations.add(relation);
    const relationWarning = EXPRESSION_WARNING_BY_RELATION[relation];
    const warningCodes = relationWarning === null
      ? testCase.baseWarnings
      : [...testCase.baseWarnings, relationWarning];
    assert.deepEqual({
      repeatCount: reading.repeatCount,
      repeatedLayers: reading.repeatedLayers,
      patternCode: reading.patternCode,
      coherenceCode: reading.coherenceCode,
      warningCodes: reading.warningCodes,
      actionCode: reading.actionCode,
    }, {
      repeatCount: 3,
      repeatedLayers: ["month", "day", "shichen"],
      patternCode: "three_layer_same_star",
      coherenceCode: "concentrated",
      warningCodes,
      actionCode: testCase.actionCode,
    }, `${direction} ${testCase.star}-${testCase.star}-${testCase.star}: exact relation-aware triple`);
    for (const warning of testCase.baseWarnings) {
      assert.ok(reading.warningCodes.includes(warning), `${direction}: relation changes cannot erase ${warning}`);
    }
  }
  assert.deepEqual([...observedRelations].sort(), [...ALL_RELATIONS].sort(), `${testCase.star}-${testCase.star}-${testCase.star}: all five relations exercised`);
}

const MIXED_952_CASES = [
  { stars: [9, 5, 2], actionCode: "reduce_strain_rest_keep_orderly" },
  { stars: [9, 2, 5], actionCode: "keep_sector_calm_avoid_drilling_demolition_vibration" },
  { stars: [5, 9, 2], actionCode: "reduce_strain_rest_keep_orderly" },
  { stars: [5, 2, 9], actionCode: "reduce_strain_rest_keep_orderly" },
  { stars: [2, 9, 5], actionCode: "keep_sector_calm_avoid_drilling_demolition_vibration" },
  { stars: [2, 5, 9], actionCode: "keep_sector_calm_avoid_drilling_demolition_vibration" },
] as const satisfies readonly Readonly<{
  stars: readonly [Star, Star, Star];
  actionCode: ZibaiActionCode;
}>[];

assert.deepEqual(MIXED_952_CASES.map((testCase) => testCase.stars), permutations([9, 5, 2]), "9-5-2 table lists all six layer permutations once");
for (const testCase of MIXED_952_CASES) {
  for (const direction of DIRECTIONS) {
    const [month, day, shichen] = testCase.stars;
    const reading = sector(interpretZibaiSectors(snapshotFor(direction, month, day, shichen), true), direction);
    assert.equal(reading.patternCode, "mixed_caution_priority", `${direction} ${testCase.stars.join("-")}: exact mixed pattern`);
    assert.equal(reading.coherenceCode, "mixed", `${direction} ${testCase.stars.join("-")}: exact mixed coherence`);
    assert.deepEqual(reading.warningCodes, [
      "five_yellow_caution",
      "two_black_caution",
      ...expressionWarnings(testCase.stars, direction),
    ], `${direction} ${testCase.stars.join("-")}: exact non-cancelling warnings`);
    assert.equal(reading.actionCode, testCase.actionCode, `${direction} ${testCase.stars.join("-")}: nearest current-layer caution wins exactly`);
  }
}

for (const cautionStar of [2, 5] as const) {
  const cautionCode: ZibaiWarningCode = cautionStar === 2 ? "two_black_caution" : "five_yellow_caution";
  for (const direction of DIRECTIONS) {
    const withoutNine = sector(interpretZibaiSectors(snapshotFor(direction, cautionStar, 3, 8), true), direction);
    assert.ok(withoutNine.warningCodes.includes(cautionCode), `${direction} ${cautionStar}: baseline caution`);
    for (const stars of permutations([cautionStar, 9, 3])) {
      const [month, day, shichen] = stars as readonly [Star, Star, Star];
      const movedNine = sector(interpretZibaiSectors(snapshotFor(direction, month, day, shichen), true), direction);
      assert.ok(movedNine.warningCodes.includes(cautionCode), `${direction} ${stars.join("-")}: adding or moving Nine cannot erase caution`);
    }
  }
}

for (const unsupportedStar of UNSUPPORTED_STARS) {
  const otherUnsupported = UNSUPPORTED_STARS.find((candidate) => candidate !== unsupportedStar);
  assert.ok(otherUnsupported !== undefined);
  for (const direction of DIRECTIONS) {
    const triple = sector(
      interpretZibaiSectors(snapshotFor(direction, unsupportedStar, unsupportedStar, unsupportedStar), true),
      direction,
    );
    assert.equal(triple.patternCode, "three_layer_same_star", `${direction} ${unsupportedStar}: structural triple remains visible`);
    assert.equal(triple.actionCode, "reference_only", `${direction} ${unsupportedStar}: unsupported triple has no practical action`);
    assert.deepEqual(triple.warningCodes, [], `${direction} ${unsupportedStar}: unsupported triple has no invented warning`);
    for (const pair of [
      [unsupportedStar, unsupportedStar, otherUnsupported],
      [unsupportedStar, otherUnsupported, unsupportedStar],
      [otherUnsupported, unsupportedStar, unsupportedStar],
    ] as const) {
      const paired = sector(interpretZibaiSectors(snapshotFor(direction, ...pair), true), direction);
      assert.equal(paired.patternCode, "two_layer_same_star", `${direction} ${pair.join("-")}: unsupported repeat remains structural metadata`);
      assert.equal(paired.actionCode, "reference_only", `${direction} ${pair.join("-")}: unsupported pair has no practical action`);
      assert.deepEqual(paired.warningCodes, [], `${direction} ${pair.join("-")}: unsupported pair has no invented warning`);
    }
  }
}
for (const month of UNSUPPORTED_STARS) {
  for (const day of UNSUPPORTED_STARS) {
    if (day === month) continue;
    for (const shichen of UNSUPPORTED_STARS) {
      if (shichen === month || shichen === day) continue;
      const selected = [month, day, shichen] as const;
      for (const direction of DIRECTIONS) {
        const reading = sector(interpretZibaiSectors(snapshotFor(direction, ...selected), true), direction);
        assert.equal(reading.patternCode, "reference_only", `${direction} ${selected.join("-")}: distinct unsupported stars remain reference-only`);
        assert.equal(reading.actionCode, "reference_only", `${direction} ${selected.join("-")}: no unsupported action`);
        assert.deepEqual(reading.warningCodes, [], `${direction} ${selected.join("-")}: no unsupported warning`);
      }
    }
  }
}

for (const stars of permutations([1, 6, 8])) {
  const [month, day, shichen] = stars as readonly [Star, Star, Star];
  for (const direction of DIRECTIONS) {
    const reading = sector(interpretZibaiSectors(snapshotFor(direction, month, day, shichen), true), direction);
    const oneWhiteExpression = EXPRESSION_WARNING_BY_RELATION[relationFor(1, direction)];
    assert.deepEqual({
      patternCode: reading.patternCode,
      coherenceCode: reading.coherenceCode,
      warningCodes: reading.warningCodes,
      actionCode: reading.actionCode,
    }, {
      patternCode: "reference_only",
      coherenceCode: "mixed",
      warningCodes: oneWhiteExpression === null ? [] : [oneWhiteExpression],
      actionCode: "reference_only",
    }, `${direction} ${stars.join("-")}: exact 1-6-8 reference-only permutation`);
  }
}

for (const direction of DIRECTIONS) {
  let dailyReference: readonly ZibaiSectorReading[] | undefined;
  for (const ignoredShichen of STARS) {
    const snapshot = snapshotFor(direction, 9, 9, ignoredShichen);
    const before = JSON.stringify(snapshot);
    const daily = interpretZibaiSectors(snapshot, false);
    const reading = sector(daily, direction);
    assert.ok(daily.every((item) => item.shichen === null), `${direction} ignored ${ignoredShichen}: every daily sector excludes shichen`);
    assert.deepEqual({
      repeatCount: reading.repeatCount,
      repeatedLayers: reading.repeatedLayers,
      patternCode: reading.patternCode,
    }, {
      repeatCount: 2,
      repeatedLayers: ["month", "day"],
      patternCode: "two_layer_same_star",
    }, `${direction} ignored ${ignoredShichen}: daily repeat is month/day only`);
    assert.ok(!reading.warningCodes.includes("five_yellow_caution"), `${direction} ignored ${ignoredShichen}: ignored Five Yellow cannot leak`);
    assert.ok(!reading.warningCodes.includes("two_black_caution"), `${direction} ignored ${ignoredShichen}: ignored Two Black cannot leak`);
    assert.equal(JSON.stringify(snapshot), before, `${direction} ignored ${ignoredShichen}: daily input is unchanged`);
    if (dailyReference === undefined) dailyReference = daily;
    else assert.deepEqual(daily, dailyReference, `${direction}: every ignored shichen map produces identical daily output`);
  }
}

const centre = sector(interpretZibaiSectors(snapshotFor("C", 1, 1, 1), true), "C");
assert.doesNotMatch(centre.actionCode, /travel|toward|direction/u, "centre guidance is spatial, never a travel direction");

const implementation = readFileSync(new URL("../src/lib/zibai-three-layer-interpretation.ts", import.meta.url), "utf8");
assert.doesNotMatch(implementation, /Period\s*9|period[_-]?9|ยุค\s*9/iu, "interpreter imports no Period-9 valuation");
assert.doesNotMatch(implementation, /\b(?:score|weight|weighted|percentage|percentile)\b/iu, "interpreter has no scalar scoring or weights");

console.log(`ZIBAI_THREE_LAYER_INTERPRETATION_OK ${exhaustiveCount}`);
