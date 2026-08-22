"use strict";

const runtime = require("../../src/lib/qimen-three-layer-notification.cjs");
const componentCatalog = require("../../src/lib/qimen-component-catalog.cjs");
const v2Fixture = require("./qimen-three-layer-valid-snapshot.cjs");

function input(accountId) {
  const value = v2Fixture.input(accountId);
  value.selectedDirection = "N";
  value.hourDecision.direction = "N";
  value.hourDecision.reasonCodes = ["hour_conditional_good", "hour_reading_usable"];
  for (const layer of Object.values(value.layers)) {
    for (const palace of layer.palaces) {
      for (const kind of ["deity", "door", "star"]) {
        const entry = componentCatalog.resolveQimenComponent(kind, palace[`${kind}Code`]);
        if (entry) palace[`${kind}Zh`] = entry.zh;
      }
    }
  }
  return value;
}

function build(accountId) {
  return runtime.buildQimenThreeLayerSnapshotV3(input(accountId));
}

module.exports = { build, input };
