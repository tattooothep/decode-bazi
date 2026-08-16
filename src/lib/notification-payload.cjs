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
const ZIBAI_RELATIONS = new Set(["generates-palace", "controls-palace", "drains-star", "same-element", "palace-controls-star"]);
const ZIBAI_FOCUS_KEYS = Object.freeze(["star", "dayDirection", "dayRelation", "shichenDirection", "shichenRelation", "overlaps"]);

function validIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
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
  const referenceMatch = /^zibai\|(\d{4}-\d{2}-\d{2})\|(daily|zi|chou|yin|mao|chen|si|wu|wei|shen|you|xu|hai)\|zibai-zaoming-true-solar-v1$/u.exec(String(facts.referenceId || ""));
  const durationMs = validIso(facts.startAt) && validIso(facts.endAt)
    ? new Date(facts.endAt).getTime() - new Date(facts.startAt).getTime()
    : NaN;
  if (!["zibai_daily", "zibai_shichen"].includes(facts.event)
    || referenceMatch === null
    || facts.calculationVersion !== "zibai-zaoming-true-solar-v1"
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
  if (!exactKeys(facts, keys) || !ROUTES[kind].has(facts.url)) throw new TypeError(`invalid ${kind} notification facts`);
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
  if (kind === "zibai" && !validZibaiFacts(facts)) throw new TypeError("invalid zibai notification facts");
  return Object.freeze({ v: 1, kind, accountId, ...facts });
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
