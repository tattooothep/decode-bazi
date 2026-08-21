"use strict";

const runtime = require("../../src/lib/qimen-three-layer-notification.cjs");
const manifest = require("../../src/lib/qimen-canonical-source-manifest.cjs").loadCanonicalSourceManifest();
const directions = ["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"];

function layer(kind, validFrom, validUntil) {
  const sourceCode = kind === "hour" ? "QIMEN_VERIFIED_ZHUANPAN_SHIJIA" : "QIMEN_FAQIAO_FEIPAN";
  return {
    kind,
    calculationVersion: manifest.layers[kind].calculationVersion,
    sourceCode,
    schoolCode: kind === "hour" ? "zhuanpan_chai_bu" : "faqiao_feipan",
    validFrom,
    validUntil,
    centerLodgingPolicy: kind === "hour" ? "hour_engine_source_policy" : "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
    palaces: directions.map((direction, index) => ({
      palace: index + 1,
      direction,
      earthInstrument: "戊",
      heavenInstrument: "庚",
      starCode: "tian_xin",
      starZh: "天心",
      doorCode: direction === "C" ? null : "kai",
      doorZh: direction === "C" ? null : "開門",
      deityCode: direction === "C" ? null : "jiu_tian",
      deityZh: direction === "C" ? null : "九天",
      formationCodes: [],
      warningCodes: [],
      isVoid: false,
      isHorse: false,
    })),
  };
}

function build(accountId) {
  return runtime.buildQimenThreeLayerSnapshot({
    event: "qimen_three_layer",
    notificationId: "qimen_snapshot_reference_20260821",
    accountId,
    purpose: "travel",
    selectedDirection: "SE",
    createdAt: "2026-08-21T14:00:30.000Z",
    route: "/qimen/notification-detail",
    hourDecision: { direction: "SE", purpose: "travel", recommendationCode: "recommended", reasonCodes: ["hour_good"] },
    layers: {
      month: layer("month", "2026-08-07T00:00:00.000Z", "2026-09-07T00:00:00.000Z"),
      day: layer("day", "2026-08-21T00:00:00.000Z", "2026-08-22T00:00:00.000Z"),
      hour: layer("hour", "2026-08-21T14:00:00.000Z", "2026-08-21T16:00:00.000Z"),
    },
  });
}

module.exports = { build };
