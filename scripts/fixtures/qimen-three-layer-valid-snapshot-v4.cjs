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
  return value;
}

function build(accountId, explicitDoorMethod) {
  return runtime.buildQimenThreeLayerSnapshotV4(input(accountId, explicitDoorMethod));
}

module.exports = { input, build, contextLayer };
