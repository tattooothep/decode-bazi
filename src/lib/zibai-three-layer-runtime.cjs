"use strict";

const DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"]);
const PALACE_ELEMENT = Object.freeze({
  N: "water", NE: "earth", E: "wood", SE: "wood", S: "fire",
  SW: "earth", W: "metal", NW: "metal", C: "earth",
});
const STAR_ELEMENT = Object.freeze({
  1: "water", 2: "earth", 3: "wood", 4: "wood", 5: "earth",
  6: "metal", 7: "metal", 8: "earth", 9: "fire",
});
const GENERATES = Object.freeze({
  water: "wood", wood: "fire", fire: "earth", earth: "metal", metal: "water",
});
const CONTROLS = Object.freeze({
  water: "fire", fire: "metal", metal: "wood", wood: "earth", earth: "water",
});
const PRACTICAL_STARS = new Set([1, 2, 5, 9]);
const SUPPORT_STARS = new Set([1, 9]);
const CAUTION_STARS = new Set([2, 5]);
const CONTESTED_RELATIONS = new Set(["palace-controls-star", "controls-palace"]);

function starElementFor(star) {
  const element = STAR_ELEMENT[star];
  if (!element) throw new TypeError("zibai_invalid_star");
  return element;
}

function starPalaceRelation(star, direction) {
  const starElement = starElementFor(star);
  const palaceElement = PALACE_ELEMENT[direction];
  if (!palaceElement) throw new TypeError("zibai_invalid_star_or_direction");
  if (starElement === palaceElement) return "same-element";
  if (GENERATES[starElement] === palaceElement) return "generates-palace";
  if (GENERATES[palaceElement] === starElement) return "palace-generates-star";
  if (CONTROLS[starElement] === palaceElement) return "controls-palace";
  return "palace-controls-star";
}

function evidence(star, direction) {
  return Object.freeze({
    star,
    starElement: starElementFor(star),
    relation: starPalaceRelation(star, direction),
  });
}

function repetition(layers) {
  const [month, day, shichen] = layers;
  if (shichen && month.evidence.star === day.evidence.star && day.evidence.star === shichen.evidence.star) {
    return Object.freeze({ repeatCount: 3, repeatedLayers: Object.freeze(layers.map((layer) => layer.name)) });
  }
  let repeatedStar;
  if (month.evidence.star === day.evidence.star) repeatedStar = month.evidence.star;
  else if (shichen && month.evidence.star === shichen.evidence.star) repeatedStar = month.evidence.star;
  else if (shichen && day.evidence.star === shichen.evidence.star) repeatedStar = day.evidence.star;
  if (repeatedStar === undefined) return Object.freeze({ repeatCount: 1, repeatedLayers: Object.freeze([]) });
  return Object.freeze({
    repeatCount: 2,
    repeatedLayers: Object.freeze(layers.filter((layer) => layer.evidence.star === repeatedStar).map((layer) => layer.name)),
  });
}

function patternFor(layers, repeatCount) {
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

function coherenceFor(patternCode) {
  if (patternCode === "three_layer_same_star") return "concentrated";
  if (patternCode === "two_layer_same_star") return "repeated";
  if (patternCode === "aligned") return "aligned";
  if (patternCode === "mixed_caution_priority" || patternCode === "reference_only") return "mixed";
  return "contested";
}

function warningsFor(layers) {
  const stars = layers.map((layer) => layer.evidence.star);
  const practicalRelations = layers.filter((layer) => PRACTICAL_STARS.has(layer.evidence.star)).map((layer) => layer.evidence.relation);
  const warningCodes = [];
  if (stars.includes(5)) warningCodes.push("five_yellow_caution");
  if (stars.includes(2)) warningCodes.push("two_black_caution");
  if (practicalRelations.includes("palace-controls-star")) warningCodes.push("palace_restrains_star");
  if (practicalRelations.includes("controls-palace")) warningCodes.push("star_conflicts_with_palace");
  return Object.freeze(warningCodes);
}

function actionFor(layers, patternCode) {
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

function readingFor(snapshot, direction, includeShichen) {
  const month = evidence(snapshot.month.palaces[direction], direction);
  const day = evidence(snapshot.day.palaces[direction], direction);
  const shichen = includeShichen ? evidence(snapshot.shichen.palaces[direction], direction) : null;
  const layers = shichen
    ? Object.freeze([
      Object.freeze({ name: "month", evidence: month }),
      Object.freeze({ name: "day", evidence: day }),
      Object.freeze({ name: "shichen", evidence: shichen }),
    ])
    : Object.freeze([
      Object.freeze({ name: "month", evidence: month }),
      Object.freeze({ name: "day", evidence: day }),
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

function interpretZibaiSectors(snapshot, includeShichen) {
  return Object.freeze(DIRECTIONS.map((direction) => readingFor(snapshot, direction, includeShichen)));
}

module.exports = Object.freeze({ interpretZibaiSectors, starElementFor, starPalaceRelation });
