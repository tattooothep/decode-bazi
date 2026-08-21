"use strict";

const crypto = require("node:crypto");
const advisoryRuntime = require("./qimen-notification-advisory.cjs");
const dayBoundaryRuntime = require("./qimen-canonical-day-boundary.cjs");
const sourceManifestRuntime = require("./qimen-canonical-source-manifest.cjs");
const { resolveMonthYearJu } = require("./qimen-canonical-tables.cjs");
const { buildFaqiaoFeipan } = require("./qimen-canonical-context-engine.cjs");
const { solarTermMonthWindow } = require("./zibai-solar-term-runtime.cjs");
const snapshotRuntime = require("./qimen-three-layer-notification.cjs");

const DIRECTIONS = Object.freeze(["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"]);
const STAR_CODES = Object.freeze({
  天蓬: "TIAN_PENG", 天芮: "TIAN_RUI", 天衝: "TIAN_CHONG", 天輔: "TIAN_FU", 天禽: "TIAN_QIN",
  天心: "TIAN_XIN", 天柱: "TIAN_ZHU", 天任: "TIAN_REN", 天英: "TIAN_YING",
});
const DOOR_CODES = Object.freeze({
  休門: "XIU_MEN", 死門: "SI_MEN", 傷門: "SHANG_MEN", 杜門: "DU_MEN",
  開門: "KAI_MEN", 驚門: "JING_FEAR_MEN", 生門: "SHENG_MEN", 景門: "JING_VIEW_MEN",
});
const DEITY_CODES = Object.freeze({
  直符: "ZHI_FU", 值符: "ZHI_FU", 螣蛇: "TENG_SHE", 太陰: "TAI_YIN", 六合: "LIU_HE",
  勾陳: "GOU_CHEN", 朱雀: "ZHU_QUE", 白虎: "BAI_HU", 玄武: "XUAN_WU", 九地: "JIU_DI", 九天: "JIU_TIAN",
});
const CENTER_POLICY = "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1";

function canonicalError(code = "QIMEN_CANONICAL_OCCURRENCE_INVALID") {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function civilClock(timezone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return Object.freeze({
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  });
}

function cleanEngineCodes(values) {
  return Object.freeze([...new Set(values.map((value) => String(value || "").trim())
    .filter((value) => /^[A-Za-z0-9_:-]{1,96}$/u.test(value)))].slice(0, 16));
}

function contextLayer(kind, chart, calculationVersion, validFrom, validUntil) {
  const palaces = chart.palaces.map((palace) => Object.freeze({
    palace: palace.palace,
    direction: palace.direction,
    earthInstrument: palace.earthInstrument,
    heavenInstrument: palace.heavenInstrument,
    starCode: STAR_CODES[palace.star],
    starZh: palace.star,
    doorCode: palace.door === null ? null : DOOR_CODES[palace.door],
    doorZh: palace.door,
    deityCode: palace.deity === null ? null : DEITY_CODES[palace.deity],
    deityZh: palace.deity,
    formationCodes: Object.freeze([]),
    warningCodes: Object.freeze([]),
    isVoid: false,
    isHorse: false,
  }));
  if (palaces.some((palace) => !palace.starCode
    || (palace.direction !== "C" && (!palace.doorCode || !palace.deityCode)))) {
    throw canonicalError();
  }
  return Object.freeze({
    kind, calculationVersion, sourceCode: "QIMEN_FAQIAO_FEIPAN", schoolCode: "faqiao_feipan",
    validFrom, validUntil, centerLodgingPolicy: CENTER_POLICY, palaces: Object.freeze(palaces),
  });
}

function hourLayer(result, version, validFrom, validUntil) {
  const input = Array.isArray(result?.palaces) ? result.palaces : [];
  const byPalace = new Map();
  for (const row of input) {
    const palace = Number(row?.palace_id);
    if (!Number.isInteger(palace) || palace < 1 || palace > 9 || byPalace.has(palace)) throw canonicalError();
    byPalace.set(palace, row);
  }
  const palaces = DIRECTIONS.map((direction, index) => {
    const palace = index + 1;
    const row = byPalace.get(palace);
    const center = direction === "C";
    if (!row || String(row.direction || "").toUpperCase() !== direction
      || !/^[乙丙丁戊己庚辛壬癸]$/u.test(String(row.earth_stem_zh || ""))
      || !/^[乙丙丁戊己庚辛壬癸]$/u.test(String(row.heaven_stem_zh || ""))
      || !/^[A-Za-z0-9_:-]{1,96}$/u.test(String(row.star_code || ""))
      || !/^[\u3400-\u9fff]{2,8}$/u.test(String(row.star_zh || ""))) throw canonicalError();
    if (!center && (!/^[A-Za-z0-9_:-]{1,96}$/u.test(String(row.door_code || ""))
      || !/^[\u3400-\u9fff]{2,8}$/u.test(String(row.door_zh || ""))
      || !/^[A-Za-z0-9_:-]{1,96}$/u.test(String(row.deity_code || ""))
      || !/^[\u3400-\u9fff]{2,8}$/u.test(String(row.deity_zh || "")))) throw canonicalError();
    const classical = Array.isArray(row.classical_flags) ? row.classical_flags : [];
    const ui = Array.isArray(row.ui_flags) ? row.ui_flags : [];
    const reasons = Array.isArray(row?.beginner_reading?.reasons) ? row.beginner_reading.reasons : [];
    return Object.freeze({
      palace, direction,
      earthInstrument: row.earth_stem_zh,
      heavenInstrument: row.heaven_stem_zh,
      starCode: row.star_code,
      starZh: row.star_zh,
      doorCode: center ? null : row.door_code,
      doorZh: center ? null : row.door_zh,
      deityCode: center ? null : row.deity_code,
      deityZh: center ? null : row.deity_zh,
      formationCodes: cleanEngineCodes([...classical, ...ui]
        .filter((flag) => flag?.active !== false && !["caution", "warning", "warn", "danger", "severe", "hard_caution"].includes(String(flag?.severity || "").toLowerCase()))
        .map((flag) => flag?.code)),
      warningCodes: cleanEngineCodes([
        ...classical.filter((flag) => ["caution", "warning", "warn", "danger", "severe", "hard_caution"].includes(String(flag?.severity || "").toLowerCase())),
        ...reasons.filter((reason) => ["warn", "bad"].includes(String(reason?.tone || "").toLowerCase())),
      ].map((entry) => entry?.code)),
      isVoid: row.is_void_any === true,
      isHorse: row.is_traveling_horse === true,
    });
  });
  return Object.freeze({
    kind: "hour", calculationVersion: version,
    sourceCode: "QIMEN_VERIFIED_ZHUANPAN_SHIJIA", schoolCode: "zhuanpan_chai_bu",
    validFrom, validUntil, centerLodgingPolicy: "hour_engine_source_policy", palaces: Object.freeze(palaces),
  });
}

function intersection(first, second) {
  const start = Math.max(Date.parse(first.startAt), Date.parse(second.validFrom));
  const end = Math.min(Date.parse(first.endAt), Date.parse(second.validUntil));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw canonicalError();
  return Object.freeze({ validFrom: new Date(start).toISOString(), validUntil: new Date(end).toISOString() });
}

async function buildCanonicalQimenOccurrence(row, value, options = {}) {
  const at = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  const accountId = String(row?.user_id || "");
  const installationId = String(row?.installation_id || "");
  const purpose = String(row?.purpose || "");
  const timezone = String(row?.location_timezone || "");
  const latitude = Number(row?.latitude);
  const longitude = Number(row?.longitude);
  if (!Number.isFinite(at.valueOf()) || !/^[a-f0-9-]{36}$/iu.test(accountId)
    || !/^[a-f0-9-]{36}$/iu.test(installationId) || purpose !== "travel"
    || !timezone || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw canonicalError();

  sourceManifestRuntime.verifyCanonicalSourceEvidence();
  const manifest = sourceManifestRuntime.loadCanonicalSourceManifest();
  const clock = civilClock(timezone, at);
  const fetchSnapshot = options.fetchCanonicalQimenEngineSnapshot || advisoryRuntime.fetchCanonicalQimenEngineSnapshot;
  const engine = await fetchSnapshot({
    ...clock, timezone, instant: at.toISOString(), lat: latitude, lng: longitude,
  }, { signal: options.signal });
  if (!engine?.advisory || !engine?.result || engine.advisory.purpose !== purpose) throw canonicalError();
  if (engine.advisory.recommendation !== "recommended") return null;
  const selectedDirection = String(engine.advisory.direction?.code || "");
  if (!DIRECTIONS.includes(selectedDirection) || selectedDirection === "C") throw canonicalError();

  const canonicalHourWindow = advisoryRuntime.trueSolarShichenWindow({ timezone, longitude, instant: at });
  if (engine.advisory.validFrom !== canonicalHourWindow.startAt || engine.advisory.validUntil !== canonicalHourWindow.endAt) {
    throw canonicalError("QIMEN_CANONICAL_HOUR_WINDOW_MISMATCH");
  }
  const pillars = engine.result?.calculation?.pillars;
  const yearPillarZh = String(pillars?.yearPillarZh || "");
  const monthPillarZh = String(pillars?.monthPillarZh || "");
  const dayPillarZh = String(pillars?.dayPillarZh || "");
  if (![yearPillarZh, monthPillarZh, dayPillarZh].every((pillar) => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u.test(pillar))) {
    throw canonicalError();
  }

  const monthWindow = solarTermMonthWindow(at);
  const monthJu = resolveMonthYearJu(yearPillarZh);
  const monthChart = buildFaqiaoFeipan({
    dun: monthJu.dun, ju: monthJu.ju, subjectPillarZh: monthPillarZh, centerLodgingPolicy: CENTER_POLICY,
  });
  const dayJu = dayBoundaryRuntime.resolveFaqiaoDayJu(at);
  const dayWindow = advisoryRuntime.trueSolarDayWindow({ timezone, longitude, instant: at });
  const dayValidity = intersection(dayWindow, dayJu);
  if (Date.parse(dayValidity.validFrom) > Date.parse(canonicalHourWindow.startAt)
    || Date.parse(dayValidity.validUntil) < Date.parse(canonicalHourWindow.endAt)) {
    throw canonicalError("QIMEN_CONTEXT_TRANSITION_INSIDE_HOUR");
  }
  const dayChart = buildFaqiaoFeipan({
    dun: dayJu.dun, ju: dayJu.ju, subjectPillarZh: dayPillarZh, centerLodgingPolicy: CENTER_POLICY,
  });

  const layers = {
    month: contextLayer("month", monthChart, manifest.layers.month.calculationVersion, monthWindow.startAt, monthWindow.endAt),
    day: contextLayer("day", dayChart, manifest.layers.day.calculationVersion, dayValidity.validFrom, dayValidity.validUntil),
    hour: hourLayer(engine.result, manifest.layers.hour.calculationVersion, canonicalHourWindow.startAt, canonicalHourWindow.endAt),
  };
  const referenceHash = crypto.createHash("sha256").update(snapshotRuntime.canonicalStringify({
    accountId, installationId, purpose, hourValidFrom: canonicalHourWindow.startAt,
  })).digest("hex");
  return snapshotRuntime.buildQimenThreeLayerSnapshot({
    event: "qimen_three_layer",
    notificationId: `qimen_ref_${referenceHash}`,
    accountId,
    purpose,
    selectedDirection,
    createdAt: at.toISOString(),
    route: "/qimen/notification-detail",
    hourDecision: {
      direction: selectedDirection, purpose, recommendationCode: "recommended",
      reasonCodes: [`hour_${String(engine.advisory.readingCode || "recommended").replace(/[^A-Za-z0-9_:-]/gu, "_")}`],
    },
    layers,
  });
}

module.exports = Object.freeze({ buildCanonicalQimenOccurrence });
