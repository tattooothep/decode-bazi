"use strict";

const catalog = require("./ziwei-hourly-presentation-catalog.json");
const readableCatalog = require("./ziwei-hourly-readable-copy-catalog.json");

const PRESENTATION_VERSION = catalog.version;
const PRESENTATION_CATALOG_SHA256 = "efea1c6c05c24867ce1df8e5ce5c639266a9544118ee8dc091f69c94adbdbd88";
const MAX_LOCKSCREEN_COPY_UTF8_BYTES = 360;
const SUPPORTED_LOCALES = Object.freeze([...catalog.supportedLocales]);
const TONES = Object.freeze(["supportive", "drive", "caution", "contextual", "unavailable"]);
const PALACE_ALIASES = Object.freeze({
  命宮: "命", 命宫: "命", 命: "命", 兄弟宮: "兄弟", 兄弟宫: "兄弟", 兄弟: "兄弟", 夫妻宮: "夫妻", 夫妻宫: "夫妻", 夫妻: "夫妻",
  子女宮: "子女", 子女宫: "子女", 子女: "子女", 財帛宮: "財帛", 财帛宫: "財帛", 財帛: "財帛", 财帛: "財帛",
  疾厄宮: "疾厄", 疾厄宫: "疾厄", 疾厄: "疾厄", 遷移宮: "遷移", 迁移宫: "遷移", 遷移: "遷移", 迁移: "遷移",
  僕役宮: "僕役", 仆役宫: "僕役", 僕役: "僕役", 仆役: "僕役", 交友宮: "僕役", 交友宫: "僕役", 交友: "僕役",
  官祿宮: "官祿", 官禄宫: "官祿", 官祿: "官祿", 官禄: "官祿", 田宅宮: "田宅", 田宅宫: "田宅", 田宅: "田宅",
  福德宮: "福德", 福德宫: "福德", 福德: "福德", 父母宮: "父母", 父母宫: "父母", 父母: "父母",
});
const FLOW_STAR_ALIASES = Object.freeze({ 天钺: "天鉞", 红鸾: "紅鸞", 禄存: "祿存" });

function copyLocale(locale) {
  const value = String(locale || "").trim().toLowerCase();
  return SUPPORTED_LOCALES.includes(value) ? value : "en";
}

function resolvePalacePresentation(locale, palaceName) {
  const language = copyLocale(locale);
  const rawPalace = typeof palaceName === "string" ? palaceName.trim() : "";
  const canonicalPalace = PALACE_ALIASES[rawPalace] || null;
  return Object.freeze({
    rawPalace,
    canonicalPalace,
    topic: canonicalPalace ? catalog.palaces[canonicalPalace][language] : catalog.labels[language].unavailable,
  });
}

function resolveSihuaPresentation(locale, entry) {
  const language = copyLocale(locale);
  const rule = catalog.sihua[entry?.type];
  const focus = resolvePalacePresentation(language, entry?.palaceName);
  const tone = rule?.tone || "unavailable";
  return Object.freeze({
    raw: `${String(entry?.star || "")}化${String(entry?.type || "")}`,
    star: String(entry?.star || ""),
    transformation: String(entry?.type || ""),
    palaceName: entry?.palaceName ?? null,
    branch: entry?.branch ?? null,
    focus,
    tone,
    stateLabel: tone === "unavailable" ? catalog.labels[language].unavailable : catalog.labels[language][tone],
    meaning: rule ? rule.meanings[language] : catalog.labels[language].unavailable,
  });
}

function canonicalFlowStar(starName) {
  const raw = typeof starName === "string" ? starName.trim() : "";
  const withoutLayer = raw.replace(/^流(?:年|月|日|時|时)/u, "");
  return FLOW_STAR_ALIASES[withoutLayer] || withoutLayer;
}

function resolveFlowStarPresentation(locale, starName, palaceName = null, branch = null) {
  const language = copyLocale(locale);
  const canonicalStar = canonicalFlowStar(starName);
  const rule = catalog.flowStars[canonicalStar];
  const focus = resolvePalacePresentation(language, palaceName);
  const tone = rule?.tone || "unavailable";
  return Object.freeze({
    rawStar: typeof starName === "string" ? starName : "",
    canonicalStar,
    palaceName,
    branch,
    focus,
    tone,
    stateLabel: tone === "unavailable" ? catalog.labels[language].unavailable : catalog.labels[language][tone],
    meaning: rule ? rule.meanings[language] : catalog.labels[language].unavailable,
  });
}

function layerPresentation(language, key, layer, flowStars) {
  return Object.freeze({
    key,
    label: catalog.labels[language][key],
    role: catalog.layerRoles[key][language],
    ganzhi: layer.ganzhi,
    mingBranch: layer.mingBranch,
    focus: resolvePalacePresentation(language, layer.mingPalaceName),
    transformations: Object.freeze(layer.siHua.map((entry) => resolveSihuaPresentation(language, entry))),
    flowStars: Object.freeze(flowStars.map((entry) => resolveFlowStarPresentation(
      language, entry.star, entry.palaceName, entry.branch,
    ))),
  });
}

function groupByTone(markers) {
  return Object.freeze(Object.fromEntries(TONES.map((tone) => [
    tone, Object.freeze(markers.filter((marker) => marker.tone === tone)),
  ])));
}

function buildZiweiHourlyPresentation(locale, snapshot) {
  const language = copyLocale(locale);
  const layers = snapshot?.facts?.layers;
  if (!layers?.liuYue || !layers?.liuRi || !layers?.liuShi) throw new TypeError("ziwei_hourly_presentation_snapshot_invalid");
  const projectedLayers = Object.freeze({
    month: layerPresentation(language, "month", layers.liuYue, layers.liuYue.monthlyStars),
    day: layerPresentation(language, "day", layers.liuRi, layers.liuRi.dailyStars),
    hour: layerPresentation(language, "hour", layers.liuShi, layers.liuShi.hourlyStars),
  });
  const hourMarkers = [...projectedLayers.hour.transformations, ...projectedLayers.hour.flowStars];
  return Object.freeze({
    version: PRESENTATION_VERSION,
    locale: language,
    copy: catalog.labels[language],
    layers: projectedLayers,
    summary: Object.freeze({ hour: groupByTone(hourMarkers) }),
  });
}

function rawTransformation(marker) {
  return `${marker.raw}→${marker.focus.rawPalace || "?"}`;
}

function buildZiweiHourlyTypeCCopy(locale, snapshot) {
  const view = buildZiweiHourlyPresentation(locale, snapshot);
  const L = view.copy;
  const C = catalog.compactLabels[view.locale];
  const hour = view.layers.hour;
  const detailedTitle = `${L.title} · ${L.hour} ${hour.ganzhi} · ${hour.focus.rawPalace} ${hour.focus.topic}`;
  const rawTitle = `${L.title} · ${L.hour} ${hour.ganzhi} · ${hour.focus.rawPalace}`;
  let title = detailedTitle.length <= 120 ? detailedTitle : rawTitle;
  const transformations = groupByTone(hour.transformations);
  const contextualStars = view.summary.hour.contextual.map((marker) => marker.canonicalStar).join("/");
  const segments = (format) => [
    `${C.supportive}:${transformations.supportive.map(format).join("/")}`,
    `${C.drive}:${transformations.drive.map(format).join("/")}`,
    `${C.caution}:${transformations.caution.map(format).join("/")}`,
    `${C.contextual}:${contextualStars}`,
    `${C.focus}:${C.month} ${view.layers.month.focus.rawPalace}/${C.day} ${view.layers.day.focus.rawPalace}/${C.hour} ${hour.focus.rawPalace}`,
  ];
  let body = segments(rawTransformation).join("|");
  const copyBytes = () => Buffer.byteLength(JSON.stringify({ title, body }), "utf8");
  if (copyBytes() > MAX_LOCKSCREEN_COPY_UTF8_BYTES) {
    title = rawTitle;
    body = segments((marker) => marker.raw).join("|");
  }
  if (title.length > 120 || body.length > 400 || copyBytes() > MAX_LOCKSCREEN_COPY_UTF8_BYTES) {
    throw new RangeError("ziwei_hourly_copy_too_long");
  }
  return Object.freeze({ title, body });
}

// Opt-in only: the legacy V2 transport does not leave enough room for readable
// copy. Callers must select this together with the lossless V3 wire capability.
// No truncation/raw-only fallback: every visible transformation keeps a meaning
// and its actual target palace; all three layer focuses stay independently named.
function buildZiweiHourlyReadableCopy(locale, snapshot) {
  const view = buildZiweiHourlyPresentation(locale, snapshot);
  const C = readableCatalog.locales[view.locale];
  const types = view.layers.hour.transformations.map((marker) => marker.transformation);
  if (types.length !== 4 || new Set(types).size !== 4 || types.some((type) => !Object.hasOwn(catalog.sihua, type))) {
    throw new TypeError("ziwei_hourly_readable_transformations_invalid");
  }
  const shortFocus = (focus) => C.topics[focus.canonicalPalace] || C.unavailable;
  // Unsupported names have no sourced palace meaning. Show that explicitly;
  // their exact input still lives in the immutable offline detail payload.
  const rawPalace = (focus) => focus.canonicalPalace ? focus.rawPalace : "?";
  const focusWithRaw = (focus) => `${shortFocus(focus)}(${rawPalace(focus)})`;
  const format = (marker) => `${marker.meaning}→${shortFocus(marker.focus)}(${marker.raw}/${rawPalace(marker.focus)})`;
  const transformations = groupByTone(view.layers.hour.transformations);
  const title = `${C.title} · ${view.layers.hour.ganzhi}`;
  const body = [
    `${C.supportive}: ${transformations.supportive.map(format).join("; ")}`,
    `${C.drive}: ${transformations.drive.map(format).join("; ")}`,
    `${C.caution}: ${transformations.caution.map(format).join("; ")}`,
    `${C.focus}: ${["month", "day", "hour"].map((key) => `${C[key]} ${focusWithRaw(view.layers[key].focus)}`).join(" · ")}`,
  ].join("\n");
  if (title.length > 120 || body.length > 400) throw new RangeError("ziwei_hourly_readable_copy_too_long");
  return Object.freeze({ title, body });
}

module.exports = Object.freeze({
  PRESENTATION_VERSION,
  PRESENTATION_CATALOG_SHA256,
  MAX_LOCKSCREEN_COPY_UTF8_BYTES,
  SUPPORTED_LOCALES,
  buildZiweiHourlyPresentation,
  buildZiweiHourlyTypeCCopy,
  buildZiweiHourlyReadableCopy,
  READABLE_COPY_VERSION: readableCatalog.version,
  READABLE_COPY_CATALOG_SHA256: "23ea576b5cd9fb95c7102315620980dff1637e11540d7f07d10d090eb1f732e6",
  resolveFlowStarPresentation,
  resolvePalacePresentation,
  resolveSihuaPresentation,
});
