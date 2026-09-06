"use strict";

const VERSION = "ziwei-hourly-six-layer-v1";
const PALACES = Object.freeze(["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母"]);
const BRANCHES = "寅卯辰巳午未申酉戌亥子丑";
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const TYPES = ["祿", "權", "科", "忌"];
const keys = (value, expected) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...expected].sort().join("|");
const text = (value, max = 40) => typeof value === "string" && value.length > 0 && value.length <= max
  && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const oneOf = (value, values) => typeof value === "string" && value.length === 1 && values.includes(value);
const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
// JSONB may reorder object keys; compare fields, while preserving palace order.
const sameLayer = (left, right) => right === null ? left === null : Array.isArray(left)
  && left.length === right.length && left.every((entry, index) => keys(entry, ["branch", "palaceName"])
    && entry.branch === right[index].branch && entry.palaceName === right[index].palaceName);

function palaceLayer(palaces, mingBranch) {
  const ming = palaces.find((palace) => palace.branch === mingBranch);
  if (!ming) return null;
  return palaces.map((palace) => ({ branch: palace.branch, palaceName: PALACES[(ming.ground - palace.ground + 12) % 12] }));
}

function transformations(entries, palaces) {
  return Array.isArray(entries) && entries.length === 4 && new Set(entries.map((entry) => entry?.type)).size === 4
    && entries.every((entry) => {
      if (!keys(entry, ["star", "type", "palaceName", "branch"]) || !text(entry.star, 20) || !TYPES.includes(entry.type)) return false;
      if (entry.palaceName === null || entry.branch === null) return entry.palaceName === null && entry.branch === null;
      const target = palaces.find((palace) => palace.branch === entry.branch && palace.name === entry.palaceName);
      return Boolean(target && [...target.majorStars, ...target.minorStars].some((star) => star.name === entry.star));
    });
}

function star(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => ["name", "brightness", "siHua"].includes(key))
    && text(value.name, 20) && (value.brightness === undefined || text(value.brightness, 4))
    && (value.siHua === undefined || TYPES.includes(value.siHua));
}

function verifyZiweiSixLayerContext(value, facts) {
  try {
    if (!keys(value, ["schema", "version", "natal", "decade", "palaceLayers"]) || value.schema !== 1 || value.version !== VERSION) return false;
    const { natal, decade, palaceLayers } = value;
    if (!keys(natal, ["yearGanzhi", "mingBranch", "shenBranch", "wuxingJu", "siHua", "palaces"])
      || !text(natal.yearGanzhi, 2) || natal.yearGanzhi.length !== 2
      || !oneOf(natal.yearGanzhi[0], STEMS) || !oneOf(natal.yearGanzhi[1], BRANCHES)
      || !keys(natal.wuxingJu, ["name", "num"]) || !text(natal.wuxingJu.name, 12) || !integer(natal.wuxingJu.num, 2, 6)
      || !Array.isArray(natal.palaces) || natal.palaces.length !== 12) return false;
    const palaces = natal.palaces;
    if (!palaces.every((palace, index) => keys(palace, ["index", "name", "ground", "branch", "stem", "ganzhi", "majorStars", "minorStars", "isShenGong", "daXian"])
      && palace.index === index && palace.name === PALACES[index]
      && integer(palace.ground, 0, 11) && palace.branch === BRANCHES[palace.ground]
      && oneOf(palace.stem, STEMS) && palace.ganzhi === palace.stem + palace.branch
      && typeof palace.isShenGong === "boolean"
      && keys(palace.daXian, ["ageStart", "ageEnd"]) && integer(palace.daXian.ageStart, 2, 116)
      && palace.daXian.ageEnd === palace.daXian.ageStart + 9
      && Array.isArray(palace.majorStars) && palace.majorStars.length <= 14 && palace.majorStars.every(star)
      && Array.isArray(palace.minorStars) && palace.minorStars.length <= 64 && palace.minorStars.every(star))) return false;
    if (new Set(palaces.map((palace) => palace.ground)).size !== 12
      || palaces.flatMap((palace) => palace.majorStars).length !== 14
      || new Set(palaces.flatMap((palace) => palace.majorStars.map((entry) => entry.name))).size !== 14
      || palaces[0].branch !== natal.mingBranch
      || palaces.filter((palace) => palace.isShenGong).length !== 1
      || palaces.find((palace) => palace.isShenGong).branch !== natal.shenBranch
      || !transformations(natal.siHua, palaces)) return false;
    const starts = palaces.map((palace) => palace.daXian.ageStart).sort((a, b) => a - b);
    if (!starts.every((start, index) => start === natal.wuxingJu.num + index * 10)) return false;
    if (!keys(decade, ["agePolicy", "nominalAge", "selected", "unavailableReason"])
      || decade.agePolicy !== "lunar-year-nominal-v1" || !integer(decade.nominalAge, -200, 201)) return false;
    const selected = palaces.find((palace) => decade.nominalAge >= palace.daXian.ageStart && decade.nominalAge <= palace.daXian.ageEnd);
    if (!selected) {
      if (decade.selected !== null || decade.unavailableReason !== (decade.nominalAge < starts[0] ? "before_first_decade" : "outside_recorded_decades")) return false;
    } else {
      const entry = decade.selected;
      if (decade.unavailableReason !== null || !keys(entry, ["palaceName", "branch", "stem", "ageStart", "ageEnd", "siHua"])
        || entry.palaceName !== selected.name || entry.branch !== selected.branch || entry.stem !== selected.stem
        || entry.ageStart !== selected.daXian.ageStart || entry.ageEnd !== selected.daXian.ageEnd
        || !transformations(entry.siHua, palaces)) return false;
    }
    if (!keys(palaceLayers, ["natal", "decade", "year", "month", "day", "hour"])) return false;
    const focus = { natal: natal.mingBranch, decade: selected?.branch ?? null,
      year: facts?.layers?.liuNian?.mingBranch, month: facts?.layers?.liuYue?.mingBranch,
      day: facts?.layers?.liuRi?.mingBranch, hour: facts?.layers?.liuShi?.mingBranch };
    return Object.entries(focus).every(([key, branch]) => sameLayer(palaceLayers[key], branch === null ? null : palaceLayer(palaces, branch)));
  } catch { return false; }
}

module.exports = Object.freeze({ VERSION, palaceLayer, verifyZiweiSixLayerContext });
