import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  interpretZibaiSectors,
  type ZibaiSectorReading,
} from "../src/lib/zibai-three-layer-interpretation.ts";
import type {
  ZibaiElement,
  ZibaiRelation,
  ZibaiSnapshotV2,
} from "../src/lib/zibai-science.ts";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"] as const;
const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const PRACTICAL_STARS = new Set<number>([1, 2, 5, 9]);
const SUPPORT_STARS = new Set<number>([1, 9]);
const CAUTION_STARS = new Set<number>([2, 5]);
const CONTESTED_RELATIONS = new Set<ZibaiRelation>(["palace-controls-star", "controls-palace"]);

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

type Direction = (typeof DIRECTIONS)[number];
type Star = (typeof STARS)[number];
type LayerName = "month" | "day" | "shichen";

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

function expectedPattern(stars: readonly Star[], direction: Direction, includeShichen: boolean) {
  const repeat = repeatEvidence(stars, includeShichen);
  const activeStars = includeShichen ? stars : stars.slice(0, 2);
  const allSameStar = includeShichen && repeat.repeatCount === 3;
  const hasFive = activeStars.includes(5);
  const hasSupport = activeStars.some((star) => SUPPORT_STARS.has(star));
  const hasCaution = activeStars.some((star) => CAUTION_STARS.has(star));
  const allGuidanceSupported = activeStars.every((star) => PRACTICAL_STARS.has(star));
  const hasRestrainingRelation = activeStars.some((star) => CONTESTED_RELATIONS.has(relationFor(star, direction)));
  if (allSameStar) return "three_layer_same_star" as const;
  if (repeat.repeatCount === 2 && hasFive) return "heightened_caution" as const;
  if (repeat.repeatCount === 2) return "two_layer_same_star" as const;
  if (hasSupport && hasCaution) return "mixed_caution_priority" as const;
  if (hasCaution) return "heightened_caution" as const;
  if (allGuidanceSupported && hasRestrainingRelation) return "supportive_contested" as const;
  if (allGuidanceSupported) return "aligned" as const;
  return "reference_only" as const;
}

function expectedWarnings(stars: readonly Star[], direction: Direction, includeShichen: boolean): readonly string[] {
  const activeStars = includeShichen ? stars : stars.slice(0, 2);
  const warnings: string[] = [];
  if (activeStars.includes(5)) warnings.push("five_yellow_caution");
  if (activeStars.includes(2)) warnings.push("two_black_caution");
  const practicalRelations = activeStars
    .filter((star) => PRACTICAL_STARS.has(star))
    .map((star) => relationFor(star, direction));
  if (practicalRelations.includes("palace-controls-star")) warnings.push("palace_restrains_star");
  if (practicalRelations.includes("controls-palace")) warnings.push("star_conflicts_with_palace");
  return warnings;
}

function expectedAction(stars: readonly Star[], direction: Direction, includeShichen: boolean): string {
  const pattern = expectedPattern(stars, direction, includeShichen);
  if (pattern === "reference_only") return "reference_only";
  const activeStars = (includeShichen ? stars : stars.slice(0, 2)).slice().reverse();
  const star = activeStars.find((candidate) => CAUTION_STARS.has(candidate))
    ?? activeStars.find((candidate) => SUPPORT_STARS.has(candidate));
  if (star === 5) return "keep_sector_calm_avoid_drilling_demolition_vibration";
  if (star === 2) return "reduce_strain_rest_keep_orderly";
  if (star === 1) return "plan_communicate_calmly";
  if (star === 9) return "use_light_visibility_creativity_thoughtfully";
  return "reference_only";
}

function expectedCoherence(patternCode: ZibaiSectorReading["patternCode"]): ZibaiSectorReading["coherenceCode"] {
  if (patternCode === "three_layer_same_star") return "concentrated";
  if (patternCode === "two_layer_same_star") return "repeated";
  if (patternCode === "aligned") return "aligned";
  if (patternCode === "mixed_caution_priority" || patternCode === "reference_only") return "mixed";
  return "contested";
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
        const patternCode = expectedPattern(stars, direction, true);

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
        assert.equal(reading.patternCode, patternCode);
        assert.equal(reading.coherenceCode, expectedCoherence(patternCode));
        assert.deepEqual(reading.warningCodes, expectedWarnings(stars, direction, true));
        assert.equal(reading.actionCode, expectedAction(stars, direction, true));
        assert.ok(Object.isFrozen(first) && Object.isFrozen(reading), `${direction} ${stars.join("-")}: output is immutable`);
        assert.ok(Object.isFrozen(reading.month) && Object.isFrozen(reading.day) && Object.isFrozen(reading.shichen), `${direction} ${stars.join("-")}: evidence is immutable`);
        assert.ok(Object.isFrozen(reading.repeatedLayers) && Object.isFrozen(reading.warningCodes), `${direction} ${stars.join("-")}: arrays are immutable`);
        assert.deepEqual(Object.keys(reading).sort(), [
          "actionCode", "coherenceCode", "day", "direction", "month", "palaceElement",
          "patternCode", "repeatCount", "repeatedLayers", "shichen", "warningCodes",
        ].sort(), `${direction} ${stars.join("-")}: no scalar score/weight fields`);

        if (stars.includes(5)) assert.ok(reading.warningCodes.includes("five_yellow_caution"), `${direction} ${stars.join("-")}: Nine Purple never cancels Five Yellow`);
        if (stars.includes(2)) assert.ok(reading.warningCodes.includes("two_black_caution"), `${direction} ${stars.join("-")}: Nine Purple never cancels Two Black`);
        if (reading.patternCode === "reference_only") assert.equal(reading.actionCode, "reference_only", `${direction} ${stars.join("-")}: reference-only has no practical action`);
        exhaustiveCount += 1;
      }
    }
  }
}
assert.equal(exhaustiveCount, 6_561, "9^3 stars across nine palaces are exhaustive");

for (const direction of DIRECTIONS) {
  for (const star of [1, 2, 5, 9] as const) {
    const reading = sector(interpretZibaiSectors(snapshotFor(direction, star, star, star), true), direction);
    assert.equal(reading.patternCode, "three_layer_same_star", `${direction} ${star}-${star}-${star}: structural convergence survives presentation state`);
    assert.equal(reading.repeatCount, 3);
    assert.deepEqual(reading.repeatedLayers, ["month", "day", "shichen"]);
    if (star === 2) {
      assert.ok(reading.warningCodes.includes("two_black_caution"));
      assert.equal(reading.actionCode, "reduce_strain_rest_keep_orderly");
    }
    if (star === 5) {
      assert.ok(reading.warningCodes.includes("five_yellow_caution"));
      assert.equal(reading.actionCode, "keep_sector_calm_avoid_drilling_demolition_vibration");
      assert.notEqual(reading.actionCode, "use_light_visibility_creativity_thoughtfully", `${direction} 5-5-5 never looks auspicious`);
    }
  }
}

const restrainedNine = sector(interpretZibaiSectors(snapshotFor("N", 9, 9, 9), true), "N");
assert.equal(restrainedNine.patternCode, "three_layer_same_star", "restraining water palace preserves 9-9-9 structure");
assert.deepEqual(restrainedNine.warningCodes, ["palace_restrains_star"], "restraining water palace coexists with explicit caution evidence");

for (const stars of permutations([9, 5, 2])) {
  for (const direction of DIRECTIONS) {
    const [month, day, shichen] = stars as readonly [Star, Star, Star];
    const reading = sector(interpretZibaiSectors(snapshotFor(direction, month, day, shichen), true), direction);
    assert.equal(reading.patternCode, "mixed_caution_priority", `${direction} ${stars.join("-")}: caution-first mixed pattern`);
    assert.ok(reading.warningCodes.includes("five_yellow_caution"), `${direction} ${stars.join("-")}: Five Yellow retained`);
    assert.ok(reading.warningCodes.includes("two_black_caution"), `${direction} ${stars.join("-")}: Two Black retained`);
    assert.notEqual(reading.actionCode, "use_light_visibility_creativity_thoughtfully", `${direction} ${stars.join("-")}: Nine Purple never wins the action`);
  }
}

for (const stars of permutations([1, 6, 8])) {
  for (const direction of DIRECTIONS) {
    const [month, day, shichen] = stars as readonly [Star, Star, Star];
    const reading = sector(interpretZibaiSectors(snapshotFor(direction, month, day, shichen), true), direction);
    assert.equal(reading.patternCode, "reference_only", `${direction} ${stars.join("-")}: unsupported stars remain reference-only`);
    assert.equal(reading.actionCode, "reference_only", `${direction} ${stars.join("-")}: unsupported mix emits no practical action`);
  }
}

const dailySnapshot = snapshotFor("NW", 9, 9, 5);
const dailyBefore = JSON.stringify(dailySnapshot);
const daily = interpretZibaiSectors(dailySnapshot, false);
const dailyNorthwest = sector(daily, "NW");
assert.equal(daily.length, 9);
assert.ok(daily.every((reading) => reading.shichen === null), "daily mode never samples or exposes shichen evidence");
assert.deepEqual(dailyNorthwest.repeatedLayers, ["month", "day"]);
assert.equal(dailyNorthwest.repeatCount, 2);
assert.equal(dailyNorthwest.patternCode, "two_layer_same_star");
assert.ok(!dailyNorthwest.warningCodes.includes("five_yellow_caution"), "daily mode ignores the snapshot shichen star completely");
assert.equal(JSON.stringify(dailySnapshot), dailyBefore, "daily mode does not mutate the science snapshot");

const centre = sector(interpretZibaiSectors(snapshotFor("C", 1, 1, 1), true), "C");
assert.doesNotMatch(centre.actionCode, /travel|toward|direction/u, "centre guidance is spatial, never a travel direction");

const implementation = readFileSync(new URL("../src/lib/zibai-three-layer-interpretation.ts", import.meta.url), "utf8");
assert.doesNotMatch(implementation, /Period\s*9|period[_-]?9|ยุค\s*9/iu, "interpreter imports no Period-9 valuation");
assert.doesNotMatch(implementation, /\b(?:score|weight|weighted|percentage|percentile)\b/iu, "interpreter has no scalar scoring or weights");

console.log(`ZIBAI_THREE_LAYER_INTERPRETATION_OK ${exhaustiveCount}`);
