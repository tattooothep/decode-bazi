"use strict";

// Synthetic arrangement contract fixture, not an external-engine calculation.
// Keep the historical V3 fixture immutable; callers must choose a door profile.
const runtime = require("../../src/lib/qimen-three-layer-notification.cjs");
const seasonal = require("../../src/lib/qimen-seasonal-vigor.cjs");
const v3Fixture = require("./qimen-three-layer-valid-snapshot-v3.cjs");
const v2Fixture = require("./qimen-three-layer-valid-snapshot.cjs");
const catalog = require("../../src/lib/qimen-component-catalog.cjs");
const { canonicalQimenPillars } = require("../../src/lib/qimen-canonical-pillars.cjs");
const { solarTermMonthWindow } = require("../../src/lib/zibai-solar-term-runtime.cjs");

function contextLayer(kind, validFrom, validUntil, pillars) {
  const layer = v2Fixture.layer(kind, validFrom, validUntil, {
    subjectPillarZh: pillars[kind === "month" ? "monthPillarZh" : "dayPillarZh"],
  });
  for (const key of ["yearPillarZh", "monthPillarZh", "dayPillarZh"]) layer.contextEvidence[key] = pillars[key];
  for (const palace of layer.palaces) {
    for (const component of ["deity", "door", "star"]) {
      const entry = catalog.resolveQimenComponent(component, palace[`${component}Code`]);
      if (entry) palace[`${component}Zh`] = entry.zh;
    }
  }
  return layer;
}

// Select only an existing pair. No state rewriting, arrangement fallback or
// claim that an ineligible chart contains a recommended direction is allowed.
function intrinsicConditions(palace) {
  const entries = ["deity", "door", "star"].map((kind) => ({
    kind, component: catalog.resolveQimenComponent(kind, palace[`${kind}Code`]),
  }));
  return {
    severe: entries.some(({ component }) => !component || component.baseQuality === "severe"),
    warnings: entries.filter(({ component }) => component?.baseQuality === "inauspicious")
      .map(({ kind }) => `INTRINSIC_${kind.toUpperCase()}_BAD`),
  };
}

function supportingDirectionStatus(value) {
  const pairs = value.layers.hour.palaces.filter((candidate) => candidate.direction !== "C"
    && ["旺", "相"].includes(candidate.starVigor) && ["旺", "相"].includes(candidate.doorVigor));
  if (pairs.length === 0) return { kind: "no_supporting_pair", palace: null };
  const palace = pairs.find((candidate) => {
    const conditions = intrinsicConditions(candidate);
    return !conditions.severe && conditions.warnings.length <= 2;
  });
  return { kind: palace ? "admissible" : "hard_ineligible", palace: palace || null };
}

function selectSupportingDirection(value) {
  const selection = supportingDirectionStatus(value);
  if (selection.kind === "no_supporting_pair") throw new Error("qimen_fixture_no_supporting_direction");
  if (selection.kind !== "admissible") throw new Error("qimen_fixture_supporting_directions_intrinsically_ineligible");
  const palace = selection.palace;
  value.selectedDirection = palace.direction;
  value.hourDecision.direction = palace.direction;
  value.hourDecision.reasonCodes = ["hour_conditional_good", "hour_reading_usable",
    ...intrinsicConditions(palace).warnings.map((code) => `hour_warning_${code}`)];
  return value;
}

// Historical fixture-helper alias. It now creates a complete admissible
// synthetic arrangement rather than exchanging only a door into a severe star.
// Callers must first assert that the original has no supporting pair.
function arrangeSyntheticSupportingDoor(value) {
  if (supportingDirectionStatus(value).kind !== "no_supporting_pair") {
    throw new Error("qimen_fixture_supporting_pair_already_exists");
  }
  return arrangeSyntheticAdmissibleDirection(value);
}

// TEST MATRIX ONLY: construct a *different* arrangement after the original is
// explicitly rejected for no seasonal pair or unavoidable intrinsic severity.
// Swap entire component tuples, never just a name, quality, or vigor label.
function arrangeSyntheticAdmissibleDirection(value) {
  if (supportingDirectionStatus(value).kind === "admissible") throw new Error("qimen_fixture_admissible_direction_already_exists");
  const palaces = value.layers.hour.palaces.filter((palace) => palace.direction !== "C");
  const target = palaces[0];
  for (const kind of ["star", "door", "deity"]) {
    const donor = palaces.find((palace) => {
      const component = catalog.resolveQimenComponent(kind, palace[`${kind}Code`]);
      return component && component.baseQuality !== "severe" && component.baseQuality !== "inauspicious"
        && (kind === "deity" || ["旺", "相"].includes(palace[`${kind}Vigor`]));
    });
    if (!donor) throw new Error("qimen_fixture_no_admissible_components");
    const fields = [`${kind}Code`, `${kind}Zh`];
    if (kind !== "deity") fields.push(`${kind}Vigor`);
    if (Object.hasOwn(target, `${kind}BaseQuality`)) fields.push(`${kind}BaseQuality`);
    for (const field of fields) [target[field], donor[field]] = [donor[field], target[field]];
  }
  return selectSupportingDirection(value);
}

function input(accountId, explicitDoorMethod) {
  const value = v3Fixture.input(accountId);
  const pillars = canonicalQimenPillars({ instant: value.createdAt, longitude: 0 });
  const monthWindow = solarTermMonthWindow(new Date(value.createdAt));
  value.layers.month = contextLayer("month", monthWindow.startAt, monthWindow.endAt, pillars);
  value.layers.day = contextLayer("day", value.layers.day.validFrom, value.layers.day.validUntil, pillars);
  const month = value.layers.month;
  const maps = seasonal.separatedVigorForMonthPillar(month.contextEvidence.monthPillarZh, explicitDoorMethod);
  value.layers.hour.calculationVersion = seasonal.SEASONAL_HOUR_CALCULATION_VERSION;
  value.layers.hour.contextEvidence = seasonal.buildSeasonalVigorEvidence({
    monthPillarZh: month.contextEvidence.monthPillarZh,
    monthBoundaryClock: month.boundaryEvidence.clock,
    monthValidFrom: month.validFrom,
    monthValidUntil: month.validUntil,
    doorMethod: explicitDoorMethod,
  });
  for (const palace of value.layers.hour.palaces) {
    palace.starVigor = maps.star.byStarCode[palace.starCode];
    palace.doorVigor = palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode];
  }
  return selectSupportingDirection(value);
}

function build(accountId, explicitDoorMethod) {
  return runtime.buildQimenThreeLayerSnapshotV4(input(accountId, explicitDoorMethod));
}

module.exports = { input, build, contextLayer, intrinsicConditions, supportingDirectionStatus,
  selectSupportingDirection, arrangeSyntheticSupportingDoor, arrangeSyntheticAdmissibleDirection };
