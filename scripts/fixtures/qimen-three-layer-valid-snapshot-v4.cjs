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
function selectSupportingDirection(value) {
  const palace = value.layers.hour.palaces.find((candidate) => candidate.direction !== "C"
    && ["旺", "相"].includes(candidate.starVigor) && ["旺", "相"].includes(candidate.doorVigor));
  if (!palace) throw new Error("qimen_fixture_no_supporting_direction");
  value.selectedDirection = palace.direction;
  value.hourDecision.direction = palace.direction;
  return value;
}

// TEST MATRIX ONLY: deliberately construct a different synthetic arrangement
// by exchanging complete door tuples. Callers must first assert that the
// original has no supporting pair. This is not a prediction or producer fallback;
// no seasonal label is changed independently of its associated door component.
function arrangeSyntheticSupportingDoor(value) {
  const palaces = value.layers.hour.palaces.filter((palace) => palace.direction !== "C");
  if (palaces.some((palace) => ["旺", "相"].includes(palace.starVigor)
    && ["旺", "相"].includes(palace.doorVigor))) throw new Error("qimen_fixture_supporting_pair_already_exists");
  const starPalace = palaces.find((palace) => ["旺", "相"].includes(palace.starVigor));
  const doorPalace = palaces.find((palace) => ["旺", "相"].includes(palace.doorVigor));
  if (!starPalace || !doorPalace) throw new Error("qimen_fixture_no_supporting_components");
  const fields = ["doorCode", "doorZh", "doorVigor"];
  if (Object.hasOwn(starPalace, "doorBaseQuality")) fields.push("doorBaseQuality");
  for (const field of fields) [starPalace[field], doorPalace[field]] = [doorPalace[field], starPalace[field]];
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

module.exports = { input, build, contextLayer, selectSupportingDirection, arrangeSyntheticSupportingDoor };
