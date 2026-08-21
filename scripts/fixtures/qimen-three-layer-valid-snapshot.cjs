"use strict";

const runtime = require("../../src/lib/qimen-three-layer-notification.cjs");
const manifest = require("../../src/lib/qimen-canonical-source-manifest.cjs").loadCanonicalSourceManifest();
const { buildFaqiaoFeipan } = require("../../src/lib/qimen-canonical-context-engine.cjs");
const STAR_CODES = { 天蓬: "TIAN_PENG", 天芮: "TIAN_RUI", 天衝: "TIAN_CHONG", 天輔: "TIAN_FU", 天禽: "TIAN_QIN", 天心: "TIAN_XIN", 天柱: "TIAN_ZHU", 天任: "TIAN_REN", 天英: "TIAN_YING" };
const DOOR_CODES = { 休門: "XIU_MEN", 死門: "SI_MEN", 傷門: "SHANG_MEN", 杜門: "DU_MEN", 開門: "KAI_MEN", 驚門: "JING_FEAR_MEN", 生門: "SHENG_MEN", 景門: "JING_VIEW_MEN" };
const DEITY_CODES = { 直符: "ZHI_FU", 螣蛇: "TENG_SHE", 太陰: "TAI_YIN", 六合: "LIU_HE", 勾陳: "GOU_CHEN", 朱雀: "ZHU_QUE", 白虎: "BAI_HU", 玄武: "XUAN_WU", 九地: "JIU_DI", 九天: "JIU_TIAN" };

function layer(kind, validFrom, validUntil, chartInput = {}) {
  const sourceCode = kind === "hour" ? "QIMEN_VERIFIED_ZHUANPAN_SHIJIA" : "QIMEN_FAQIAO_FEIPAN";
  const chart = buildFaqiaoFeipan({
    dun: chartInput.dun || "yang",
    ju: chartInput.ju || 1,
    subjectPillarZh: chartInput.subjectPillarZh || "庚子",
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  });
  const rawContext = kind !== "hour";
  return {
    kind,
    calculationVersion: manifest.layers[kind].calculationVersion,
    sourceCode,
    schoolCode: kind === "hour" ? "zhuanpan_chai_bu" : "faqiao_feipan",
    validFrom,
    validUntil,
    centerLodgingPolicy: kind === "hour" ? "hour_engine_source_policy" : "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
    stateCode: rawContext ? "raw_context" : "action_authority",
    explanationCodes: [rawContext ? (kind === "month" ? "MONTH_RAW_CONTEXT_ONLY" : "DAY_RAW_CONTEXT_ONLY") : "HOUR_SOLE_ACTION_AUTHORITY"],
    conflictCodes: rawContext ? ["CENTER_LODGING_SOURCE_CONFLICT_DECLARED"] : [],
    unavailableCodes: rawContext ? ["CONTEXT_VIGOR_NOT_DEFINED", "CONTEXT_CLASH_NOT_EVALUATED"] : [],
    boundaryEvidence: rawContext ? (kind === "month" ? {
      clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1", policy: "GLOBAL_JIE_MONTH_HALF_OPEN_V1",
    } : {
      clock: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1", policy: "FOUR_QI_INTERSECT_TRUE_SOLAR_DAY_HALF_OPEN_V1",
    }) : {
      clock: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1", policy: "TRUE_SOLAR_SHICHEN_HALF_OPEN_V1",
    },
    contextEvidence: kind === "hour" ? null : {
      dun: chart.dun, ju: chart.ju, subjectPillarZh: chart.subjectPillarZh,
      yearPillarZh: "丙午", monthPillarZh: "丙申", dayPillarZh: "丁卯",
      yearMonthBoundaryClock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
      dayBoundaryPolicy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
      centerEvidence: {
        policy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
        sourceConflictCode: "FAQIAO_VOL2_SEASONAL_VS_VOL6_FIXED_YINYANG",
        rawCenterPalace: 5, effectiveLodgingPalace: chart.centerLodgingPalace,
        rawDoorTargetPalace: chart.rawDoorTarget, effectiveDoorTargetPalace: chart.effectiveDoorTarget,
        rawDeityTargetPalace: chart.rawDeityTarget, effectiveDeityTargetPalace: chart.effectiveDeityTarget,
      },
    },
    palaces: chart.palaces.map((palace) => ({
      palace: palace.palace,
      direction: palace.direction,
      earthInstrument: palace.earthInstrument,
      heavenInstrument: kind === "hour" && palace.direction === "C" ? null : palace.heavenInstrument,
      starCode: STAR_CODES[palace.star],
      starZh: palace.star,
      doorCode: palace.door === null ? null : DOOR_CODES[palace.door],
      doorZh: palace.door,
      deityCode: palace.deity === null ? null : DEITY_CODES[palace.deity],
      deityZh: palace.deity,
      formationCodes: [],
      warningCodes: [],
      clashCodes: [],
      doorVigor: kind === "hour" && palace.direction !== "C" ? "相" : null,
      starVigor: kind === "hour" ? "旺" : null,
      isVoid: false,
      isHorse: false,
    })),
  };
}

function input(accountId) {
  return {
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
  };
}

function build(accountId) {
  return runtime.buildQimenThreeLayerSnapshot(input(accountId));
}

module.exports = { build, input, layer };
