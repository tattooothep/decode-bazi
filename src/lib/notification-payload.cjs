const ROUTES = Object.freeze({
  security: new Set(["/account"]),
  saved_date: new Set(["/datepick/saved"]),
  daily: new Set(["/today"]),
  yam: new Set(["/today"]),
  qimen: new Set(["/qimen/board"]),
  shrine: new Set(["/shrine"]),
  goal: new Set(["/calendar/goals"]),
  service: new Set(["/account", "/support", "/store", "/calendar", "/network", "/fusion"]),
  zibai: new Set(["/zibai"]),
});
const zibaiRuleRuntime = require("./zibai-three-layer-runtime.cjs");

const FACT_KEYS = Object.freeze({
  security: ["event", "url"],
  saved_date: ["savedDateId", "lead", "date", "url"],
  daily: ["slot", "date", "url"],
  yam: ["range", "quality", "date", "url"],
  qimen: ["date", "direction", "score", "url"],
  shrine: ["date", "festival", "url"],
  goal: ["goalId", "date", "url"],
  service: ["event", "referenceId", "url"],
  zibai: ["event", "referenceId", "calculationVersion", "apparentSolarDate", "shichenKey", "startAt", "endAt", "dayPalaces", "shichenPalaces", "focus", "url"],
});

function exactKeys(value, expected) {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanText(value, min = 1, max = 160) {
  return typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value;
}

const ZIBAI_DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW", "C"]);
const ZIBAI_SHICHEN = new Set(["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"]);
const ZIBAI_RELATIONS = new Set(["generates-palace", "controls-palace", "palace-generates-star", "same-element", "palace-controls-star"]);
const ZIBAI_FOCUS_KEYS = Object.freeze(["star", "dayDirection", "dayRelation", "shichenDirection", "shichenRelation", "overlaps"]);
const ZIBAI_V2_KEYS = Object.freeze([
  "snapshotSchema", "event", "referenceId", "calculationVersion", "interpretationVersion",
  "month", "day", "shichen", "sectors", "url",
]);
const ZIBAI_MONTH_KEYS = Object.freeze(["startTermCode", "endTermCode", "palaces", "startAt", "endAt"]);
const ZIBAI_DAY_KEYS = Object.freeze(["palaces", "apparentSolarDate", "startAt", "endAt"]);
const ZIBAI_SHICHEN_KEYS = Object.freeze(["palaces", "key", "startAt", "endAt"]);
const ZIBAI_SECTOR_KEYS = Object.freeze(["direction", "month", "day", "shichen", "patternCode"]);
const ZIBAI_SECTION_TERMS = Object.freeze([
  "xiaohan", "lichun", "jingzhe", "qingming", "lixia", "mangzhong",
  "xiaoshu", "liqiu", "bailu", "hanlu", "lidong", "daxue",
]);
const ZIBAI_V2_MAX_BYTES = 3.5 * 1_024;

function sameKeys(actual, expected) {
  const observed = [...actual].sort();
  const wanted = [...expected].sort();
  return observed.length === wanted.length && observed.every((key, index) => key === wanted[index]);
}

/** Capture one immutable view of an input record without invoking accessors. */
function readDataRecord(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let prototype;
  let ownKeys;
  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (ownKeys.some((key) => typeof key !== "string")) return null;
  const stringKeys = ownKeys;
  if (expectedKeys && !sameKeys(stringKeys, expectedKeys)) return null;
  const captured = {};
  for (const key of stringKeys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    captured[key] = descriptor.value;
  }
  return captured;
}

function readDataArray(value, expectedLength) {
  if (!Array.isArray(value)) return null;
  let prototype;
  let ownKeys;
  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (prototype !== Array.prototype || ownKeys.some((key) => typeof key !== "string")) return null;
  const expectedKeys = [...Array.from({ length: expectedLength }, (_, index) => String(index)), "length"];
  if (!sameKeys(ownKeys, expectedKeys)) return null;
  let lengthDescriptor;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return null;
  }
  if (!lengthDescriptor || lengthDescriptor.enumerable !== false || !("value" in lengthDescriptor)
    || lengthDescriptor.value !== expectedLength) return null;
  const captured = [];
  for (let index = 0; index < expectedLength; index += 1) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      return null;
    }
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) return null;
    captured.push(descriptor.value);
  }
  return captured;
}

function validIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function boundedDuration(startAt, endAt, minimumMs, maximumMs) {
  if (!validIso(startAt) || !validIso(endAt)) return false;
  const duration = new Date(endAt).getTime() - new Date(startAt).getTime();
  return duration >= minimumMs && duration <= maximumMs;
}

function readZibaiPalaces(value) {
  const record = readDataRecord(value, ZIBAI_DIRECTIONS);
  if (!record) return null;
  const numbers = ZIBAI_DIRECTIONS.map((direction) => record[direction]);
  if (!numbers.every((star) => Number.isInteger(star) && star >= 1 && star <= 9)
    || new Set(numbers).size !== 9) return null;
  return Object.freeze(record);
}

function readZibaiMonth(value) {
  const record = readDataRecord(value, ZIBAI_MONTH_KEYS);
  if (!record) return null;
  const startTermIndex = ZIBAI_SECTION_TERMS.indexOf(record.startTermCode);
  const expectedEndTerm = startTermIndex >= 0
    ? ZIBAI_SECTION_TERMS[(startTermIndex + 1) % ZIBAI_SECTION_TERMS.length]
    : null;
  const palaces = readZibaiPalaces(record.palaces);
  if (!palaces || record.endTermCode !== expectedEndTerm
    || !boundedDuration(record.startAt, record.endAt, 25 * 86_400_000, 35 * 86_400_000)) return null;
  return Object.freeze({ ...record, palaces });
}

function readZibaiDay(value) {
  const record = readDataRecord(value, ZIBAI_DAY_KEYS);
  if (!record) return null;
  const palaces = readZibaiPalaces(record.palaces);
  if (!palaces || !validDate(record.apparentSolarDate)
    || !boundedDuration(record.startAt, record.endAt, 23 * 3_600_000, 25 * 3_600_000)) return null;
  return Object.freeze({ ...record, palaces });
}

function readZibaiShichen(value) {
  const record = readDataRecord(value, ZIBAI_SHICHEN_KEYS);
  if (!record) return null;
  const palaces = readZibaiPalaces(record.palaces);
  if (!palaces || !ZIBAI_SHICHEN.has(record.key)
    || !boundedDuration(record.startAt, record.endAt, 90 * 60_000, 150 * 60_000)) return null;
  return Object.freeze({ ...record, palaces });
}

function compactZibaiSectors(value, month, day, shichen, includeShichen) {
  const sectors = readDataArray(value, ZIBAI_DIRECTIONS.length);
  if (!sectors) return null;
  const snapshot = Object.freeze({
    month: Object.freeze({ palaces: month.palaces }),
    day: Object.freeze({ palaces: day.palaces }),
    shichen: Object.freeze({ palaces: shichen?.palaces ?? day.palaces }),
  });
  let derived;
  try {
    derived = zibaiRuleRuntime.interpretZibaiSectors(snapshot, includeShichen);
  } catch {
    return null;
  }
  const compact = [];
  for (let index = 0; index < ZIBAI_DIRECTIONS.length; index += 1) {
    const record = readDataRecord(sectors[index], ZIBAI_SECTOR_KEYS);
    const canonical = derived[index];
    if (!record || record.direction !== canonical.direction
      || record.month !== canonical.month.star
      || record.day !== canonical.day.star
      || record.shichen !== (canonical.shichen?.star ?? null)
      || record.patternCode !== canonical.patternCode) return null;
    compact.push(Object.freeze(record));
  }
  return Object.freeze(compact);
}

function readZibaiV2Facts(record) {
  if (!sameKeys(Object.keys(record), ZIBAI_V2_KEYS)
    || record.snapshotSchema !== 2
    || !["zibai_daily", "zibai_shichen"].includes(record.event)
    || record.calculationVersion !== "zibai-zaoming-true-solar-v2"
    || record.interpretationVersion !== "zibai-3layer-rule-v1"
    || typeof record.referenceId !== "string"
    || record.url !== "/zibai") return null;
  const isDaily = record.event === "zibai_daily";
  const month = readZibaiMonth(record.month);
  const day = readZibaiDay(record.day);
  const shichen = isDaily ? (record.shichen === null ? null : undefined) : readZibaiShichen(record.shichen);
  if (!month || !day || shichen === undefined || (!isDaily && !shichen)) return null;
  const reference = /^zibai\|(\d{4}-\d{2}-\d{2})\|(daily|zi|chou|yin|mao|chen|si|wu|wei|shen|you|xu|hai)\|zibai-zaoming-true-solar-v2$/u.exec(record.referenceId);
  const expectedSlot = isDaily ? "daily" : shichen.key;
  if (!reference || reference[1] !== day.apparentSolarDate || reference[2] !== expectedSlot) return null;
  const dayStart = new Date(day.startAt).getTime();
  const dayEnd = new Date(day.endAt).getTime();
  const monthStart = new Date(month.startAt).getTime();
  const monthEnd = new Date(month.endAt).getTime();
  if (dayStart >= monthEnd || dayEnd <= monthStart) return null;
  if (shichen) {
    const shichenStart = new Date(shichen.startAt).getTime();
    const shichenEnd = new Date(shichen.endAt).getTime();
    if (shichenStart < dayStart || shichenEnd > dayEnd) return null;
  }
  const sectors = compactZibaiSectors(record.sectors, month, day, shichen, !isDaily);
  if (!sectors) return null;
  return Object.freeze({ ...record, month, day, shichen, sectors });
}

function validZibaiPalaces(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactKeys(value, ZIBAI_DIRECTIONS)) return false;
  const numbers = ZIBAI_DIRECTIONS.map((direction) => value[direction]);
  return numbers.every((star) => Number.isInteger(star) && star >= 1 && star <= 9) && new Set(numbers).size === 9;
}

function directionForStar(palaces, star) {
  return ZIBAI_DIRECTIONS.find((direction) => palaces[direction] === star) || null;
}

function validZibaiFacts(facts) {
  const isDaily = facts.event === "zibai_daily";
  const referenceMatch = /^zibai\|(\d{4}-\d{2}-\d{2})\|(daily|zi|chou|yin|mao|chen|si|wu|wei|shen|you|xu|hai)\|zibai-zaoming-true-solar-v2$/u.exec(String(facts.referenceId || ""));
  const durationMs = validIso(facts.startAt) && validIso(facts.endAt)
    ? new Date(facts.endAt).getTime() - new Date(facts.startAt).getTime()
    : NaN;
  if (!["zibai_daily", "zibai_shichen"].includes(facts.event)
    || referenceMatch === null
    || facts.calculationVersion !== "zibai-zaoming-true-solar-v2"
    || !validDate(facts.apparentSolarDate)
    || !validIso(facts.startAt) || !validIso(facts.endAt)
    || durationMs <= 0
    || (isDaily
      ? durationMs < 23 * 60 * 60 * 1000 || durationMs > 25 * 60 * 60 * 1000
      : durationMs < 90 * 60 * 1000 || durationMs > 150 * 60 * 1000)
    || !validZibaiPalaces(facts.dayPalaces)
    || !Array.isArray(facts.focus) || facts.focus.length !== 4) return false;
  if (isDaily ? facts.shichenKey !== null || facts.shichenPalaces !== null : !ZIBAI_SHICHEN.has(facts.shichenKey) || !validZibaiPalaces(facts.shichenPalaces)) return false;
  const expectedReferencePart = isDaily ? "daily" : facts.shichenKey;
  if (referenceMatch[1] !== facts.apparentSolarDate || referenceMatch[2] !== expectedReferencePart) return false;
  const stars = [];
  for (const item of facts.focus) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !exactKeys(item, ZIBAI_FOCUS_KEYS)
      || ![1, 2, 5, 9].includes(item.star) || !ZIBAI_DIRECTIONS.includes(item.dayDirection)
      || !ZIBAI_RELATIONS.has(item.dayRelation) || typeof item.overlaps !== "boolean"
      || directionForStar(facts.dayPalaces, item.star) !== item.dayDirection) return false;
    if (isDaily) {
      if (item.shichenDirection !== null || item.shichenRelation !== null || item.overlaps) return false;
    } else if (!ZIBAI_DIRECTIONS.includes(item.shichenDirection) || !ZIBAI_RELATIONS.has(item.shichenRelation)
      || directionForStar(facts.shichenPalaces, item.star) !== item.shichenDirection
      || item.overlaps !== (item.dayDirection === item.shichenDirection)) return false;
    stars.push(item.star);
  }
  return stars.sort((a, b) => a - b).join(",") === "1,2,5,9";
}

function buildNotificationPayload(kind, accountId, facts) {
  const keys = FACT_KEYS[kind];
  if (!keys || !cleanText(accountId, 1, 128) || !facts || typeof facts !== "object" || Array.isArray(facts)) {
    throw new TypeError("invalid notification payload envelope");
  }
  let canonicalFacts = facts;
  if (kind === "zibai") {
    const captured = readDataRecord(facts);
    if (!captured) throw new TypeError("invalid zibai notification facts");
    if (Object.prototype.hasOwnProperty.call(captured, "snapshotSchema")) {
      const v2Facts = readZibaiV2Facts(captured);
      if (!v2Facts) throw new TypeError("invalid zibai notification facts");
      const payload = Object.freeze({ v: 1, kind, accountId, ...v2Facts });
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > ZIBAI_V2_MAX_BYTES) {
        throw new TypeError("invalid zibai notification facts");
      }
      return payload;
    }
    if (!sameKeys(Object.keys(captured), keys)) throw new TypeError("invalid zibai notification facts");
    canonicalFacts = captured;
  }
  if (kind !== "zibai" && (!exactKeys(facts, keys) || !ROUTES[kind].has(facts.url))) throw new TypeError(`invalid ${kind} notification facts`);
  if (kind === "zibai" && !ROUTES[kind].has(canonicalFacts.url)) throw new TypeError("invalid zibai notification facts");
  if (["saved_date", "daily", "yam", "qimen", "shrine", "goal"].includes(kind) && !validDate(facts.date)) {
    throw new TypeError(`invalid ${kind} date`);
  }
  if (kind === "security" && !cleanText(facts.event, 1, 80)) throw new TypeError("invalid security event");
  if (kind === "saved_date" && (!cleanText(facts.savedDateId, 8, 100) || !Number.isInteger(facts.lead) || facts.lead < 0 || facts.lead > 10_080)) throw new TypeError("invalid saved date facts");
  if (kind === "daily" && facts.slot !== "morning" && facts.slot !== "evening") throw new TypeError("invalid daily slot");
  if (kind === "yam" && (!cleanText(facts.range, 3, 80) || !["best", "good"].includes(facts.quality))) throw new TypeError("invalid yam facts");
  if (kind === "qimen" && (!cleanText(facts.direction, 1, 32) || !Number.isFinite(facts.score) || facts.score < 0 || facts.score > 100)) throw new TypeError("invalid qimen facts");
  if (kind === "shrine" && !cleanText(facts.festival, 1, 120)) throw new TypeError("invalid shrine facts");
  if (kind === "goal" && !cleanText(facts.goalId, 8, 100)) throw new TypeError("invalid goal facts");
  if (kind === "service") {
    if (!cleanText(facts.event, 1, 80) || !cleanText(facts.referenceId, 8, 120)) {
      throw new TypeError("invalid service facts");
    }
    const exactDestination = facts.url === "/calendar"
      ? facts.event === "monthly_report_ready" && /^monthly\|\d{4}-\d{2}$/u.test(facts.referenceId)
      : facts.url === "/network"
        ? facts.event === "network_morning" && /^network\|\d{4}-\d{2}-\d{2}\|[^|]{1,80}$/u.test(facts.referenceId)
        : facts.url === "/fusion"
          ? facts.event === "fusion_ready"
            && /^fusion\|(job|book)\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(facts.referenceId)
          : true;
    if (!exactDestination) throw new TypeError("invalid service destination facts");
  }
  if (kind === "zibai" && !validZibaiFacts(canonicalFacts)) throw new TypeError("invalid zibai notification facts");
  return Object.freeze({ v: 1, kind, accountId, ...canonicalFacts });
}

const REDACTED = Object.freeze({
  th: Object.freeze({ title: "การแจ้งเตือนส่วนตัว", body: "เปิด HourKey เพื่อดูรายละเอียด" }),
  en: Object.freeze({ title: "Private notification", body: "Open HourKey to view details" }),
  zh: Object.freeze({ title: "私人通知", body: "開啟 HourKey 查看詳情" }),
});

function normalizedLocale(value) {
  const locale = String(value || "th").toLowerCase();
  if (locale === "th") return "th";
  if (locale === "zh" || locale === "cn" || locale.startsWith("zh-")) return "zh";
  return "en";
}

function previewCopy(kind, privacyPreview, fullCopy, locale) {
  if (privacyPreview === true) return Object.freeze({ ...fullCopy });
  return REDACTED[normalizedLocale(locale)];
}

module.exports = { buildNotificationPayload, normalizedLocale, previewCopy };
