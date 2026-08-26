"use strict";

const { createHash } = require("node:crypto");

const LINEAGE = "iztro_2_5_8_normal_forward_zi_v1";
const CALCULATION_VERSION = "ziwei-hourly-notification-v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactIso(value) {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function text(value, min = 1, max = 160) {
  return typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value;
}

function starPlacement(value) {
  return exactKeys(value, ["star", "palaceName", "branch", "source"])
    && text(value.star, 1, 20) && text(value.palaceName, 1, 20)
    && text(value.branch, 1, 4) && text(value.source, 1, 20);
}

function siHua(value) {
  return exactKeys(value, ["star", "type", "palaceName", "branch"])
    && text(value.star, 1, 20) && ["祿", "權", "科", "忌"].includes(value.type)
    && (value.palaceName === null || text(value.palaceName, 1, 20))
    && (value.branch === null || text(value.branch, 1, 4));
}

function baseLayer(value) {
  return text(value?.ganzhi, 2, 2) && text(value?.mingBranch, 1, 2)
    && text(value?.mingPalaceName, 1, 20)
    && Array.isArray(value?.siHua) && value.siHua.length === 4 && value.siHua.every(siHua)
    && new Set(value.siHua.map((item) => item.type)).size === 4;
}

function verifyFacts(facts) {
  if (!exactKeys(facts, [
    "discipline", "capability", "schema", "calculationVersion", "lineage",
    "decisionSupported", "productionEligible", "limitations", "reference", "layers",
  ])) return false;
  if (facts.discipline !== "ziwei" || facts.capability !== "notification_facts" || facts.schema !== 1
    || facts.calculationVersion !== CALCULATION_VERSION || facts.lineage !== LINEAGE
    || facts.decisionSupported !== false || facts.productionEligible !== true
    || !Array.isArray(facts.limitations)
    || canonicalStringify(facts.limitations) !== canonicalStringify([
      "named_software_lineage_not_classical_consensus",
      "structural_chart_facts_no_auspicious_verdict",
      "self_profile_only",
    ])) return false;
  const reference = facts.reference;
  if (!exactKeys(reference, [
    "instant", "timezone", "localDate", "calculationDate", "timeIndex", "effectiveTimeIndex",
    "boundaryPolicy", "validFrom", "validUntil", "windowKey",
  ]) || !exactIso(reference.instant) || !exactIso(reference.validFrom) || !exactIso(reference.validUntil)
    || Date.parse(reference.validUntil) - Date.parse(reference.validFrom) !== 2 * 3_600_000
    || Date.parse(reference.instant) < Date.parse(reference.validFrom)
    || Date.parse(reference.instant) >= Date.parse(reference.validUntil)
    || !text(reference.timezone, 1, 80) || !text(reference.windowKey, 1, 300)
    || reference.boundaryPolicy !== "forward_zi"
    || !Number.isInteger(reference.timeIndex) || reference.timeIndex < 0 || reference.timeIndex > 12
    || !Number.isInteger(reference.effectiveTimeIndex) || reference.effectiveTimeIndex < 0 || reference.effectiveTimeIndex > 11) return false;
  if (!exactKeys(facts.layers, ["liuNian", "liuYue", "liuRi", "liuShi"])) return false;
  const { liuNian, liuYue, liuRi, liuShi } = facts.layers;
  if (!exactKeys(liuNian, ["year", "ganzhi", "mingBranch", "mingPalaceName", "siHua", "annualStars"])
    || !baseLayer(liuNian) || !Number.isInteger(liuNian.year)
    || !Array.isArray(liuNian.annualStars) || liuNian.annualStars.length !== 10 || !liuNian.annualStars.every(starPlacement)) return false;
  if (!exactKeys(liuYue, [
    "year", "lunarMonth", "isLeapMonth", "effectiveMonth", "ganzhi", "mingBranch",
    "mingPalaceName", "siHua", "monthlyStars", "monthPalaces",
  ]) || !baseLayer(liuYue) || !Array.isArray(liuYue.monthlyStars) || liuYue.monthlyStars.length !== 10
    || !liuYue.monthlyStars.every(starPlacement) || !Array.isArray(liuYue.monthPalaces) || liuYue.monthPalaces.length !== 12) return false;
  if (!exactKeys(liuRi, ["dateISO", "lunarDay", "ganzhi", "mingBranch", "mingPalaceName", "siHua", "dailyStars"])
    || !baseLayer(liuRi) || !Array.isArray(liuRi.dailyStars) || liuRi.dailyStars.length !== 10
    || !liuRi.dailyStars.every(starPlacement)) return false;
  if (!exactKeys(liuShi, [
    "civilDateISO", "calculationDateISO", "timeIndex", "ganzhi", "mingBranch",
    "mingPalaceName", "siHua", "hourlyStars",
  ]) || !baseLayer(liuShi) || !Array.isArray(liuShi.hourlyStars) || liuShi.hourlyStars.length !== 10
    || !liuShi.hourlyStars.every(starPlacement)) return false;
  return true;
}

function snapshotDigest(snapshotWithoutDigest) {
  return createHash("sha256").update(canonicalStringify(snapshotWithoutDigest)).digest("hex");
}

function verifyZiweiHourlyNotificationSnapshot(snapshot) {
  if (!exactKeys(snapshot, [
    "snapshotSchema", "discipline", "event", "accountId", "profile", "interpretation",
    "facts", "snapshotDigest",
  ]) || snapshot.snapshotSchema !== 1 || snapshot.discipline !== "ziwei"
    || snapshot.event !== "ziwei_hourly" || snapshot.interpretation !== "none_structural_chart_only"
    || !UUID_RE.test(snapshot.accountId) || !/^[0-9a-f]{64}$/u.test(snapshot.snapshotDigest)
    || !exactKeys(snapshot.profile, ["id", "name", "isSelf"])
    || !UUID_RE.test(snapshot.profile.id) || !text(snapshot.profile.name, 0, 120)
    || snapshot.profile.isSelf !== true || !verifyFacts(snapshot.facts)) return false;
  const { snapshotDigest: declared, ...unsigned } = snapshot;
  return snapshotDigest(unsigned) === declared;
}

function buildZiweiHourlyNotificationSnapshot(input) {
  const unsigned = JSON.parse(JSON.stringify({
    snapshotSchema: 1,
    discipline: "ziwei",
    event: "ziwei_hourly",
    accountId: input?.accountId,
    profile: input?.profile,
    interpretation: "none_structural_chart_only",
    facts: input?.facts,
  }));
  const snapshot = Object.freeze({ ...unsigned, snapshotDigest: snapshotDigest(unsigned) });
  if (!verifyZiweiHourlyNotificationSnapshot(snapshot)) throw new TypeError("ziwei_hourly_snapshot_invalid");
  return snapshot;
}

function compactLayer(layer, flowStars, identity) {
  return Object.freeze({
    ...identity,
    ganzhi: layer.ganzhi,
    mingBranch: layer.mingBranch,
    mingPalaceName: layer.mingPalaceName,
    siHua: Object.freeze(layer.siHua.map((item) => Object.freeze([
      item.star, item.type, item.palaceName, item.branch,
    ]))),
    flowStars: Object.freeze(flowStars.map((item) => Object.freeze([
      item.star, item.palaceName, item.branch,
    ]))),
  });
}

function compactSnapshot(snapshot) {
  return Object.freeze({
    v: 2,
    kind: "ziwei",
    event: "ziwei_hourly",
    accountId: snapshot.accountId,
    profileId: snapshot.profile.id,
    lineage: snapshot.facts.lineage,
    calculationVersion: snapshot.facts.calculationVersion,
    windowKey: snapshot.facts.reference.windowKey,
    validFrom: snapshot.facts.reference.validFrom,
    validUntil: snapshot.facts.reference.validUntil,
    month: compactLayer(snapshot.facts.layers.liuYue, snapshot.facts.layers.liuYue.monthlyStars, {
      lunarMonth: snapshot.facts.layers.liuYue.lunarMonth,
      isLeapMonth: snapshot.facts.layers.liuYue.isLeapMonth,
      effectiveMonth: snapshot.facts.layers.liuYue.effectiveMonth,
    }),
    day: compactLayer(snapshot.facts.layers.liuRi, snapshot.facts.layers.liuRi.dailyStars, {
      dateISO: snapshot.facts.layers.liuRi.dateISO,
      lunarDay: snapshot.facts.layers.liuRi.lunarDay,
    }),
    hour: compactLayer(snapshot.facts.layers.liuShi, snapshot.facts.layers.liuShi.hourlyStars, {
      civilDateISO: snapshot.facts.layers.liuShi.civilDateISO,
      calculationDateISO: snapshot.facts.layers.liuShi.calculationDateISO,
      timeIndex: snapshot.facts.layers.liuShi.timeIndex,
    }),
    snapshotDigest: snapshot.snapshotDigest,
    url: "/ziwei/hourly",
  });
}

function compactLayerValid(value) {
  return text(value?.ganzhi, 2, 2) && text(value?.mingBranch, 1, 2)
    && text(value?.mingPalaceName, 1, 20) && Array.isArray(value?.siHua)
    && value.siHua.length === 4 && value.siHua.every((item) => (
      Array.isArray(item) && item.length === 4
      && text(item[0], 1, 20) && ["祿", "權", "科", "忌"].includes(item[1])
      && (item[2] === null || text(item[2], 1, 20))
      && (item[3] === null || text(item[3], 1, 4))
    )) && new Set(value.siHua.map((item) => item[1])).size === 4
    && Array.isArray(value.flowStars) && value.flowStars.length === 10
    && value.flowStars.every((star) => Array.isArray(star) && star.length === 3
      && text(star[0], 1, 20) && text(star[1], 1, 20) && text(star[2], 1, 4));
}

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function buildZiweiHourlyProviderData(snapshot) {
  if (!verifyZiweiHourlyNotificationSnapshot(snapshot)) throw new TypeError("ziwei_hourly_snapshot_invalid");
  const encoded = Buffer.from(canonicalStringify(compactSnapshot(snapshot)), "utf8").toString("base64url");
  return Object.freeze({ ziweiHourlyV2: encoded });
}

function parseZiweiHourlyProviderData(data) {
  if (!exactKeys(data, ["ziweiHourlyV2"]) || typeof data.ziweiHourlyV2 !== "string") return null;
  let value;
  try {
    const raw = Buffer.from(data.ziweiHourlyV2, "base64url").toString("utf8");
    if (Buffer.from(raw, "utf8").toString("base64url") !== data.ziweiHourlyV2) return null;
    value = JSON.parse(raw);
  } catch { return null; }
  if (!exactKeys(value, [
    "v", "kind", "event", "accountId", "profileId", "lineage", "calculationVersion", "windowKey",
    "validFrom", "validUntil", "month", "day", "hour", "snapshotDigest", "url",
  ]) || value.v !== 2 || value.kind !== "ziwei" || value.event !== "ziwei_hourly"
    || !UUID_RE.test(value.accountId) || !UUID_RE.test(value.profileId)
    || value.lineage !== LINEAGE || value.calculationVersion !== CALCULATION_VERSION
    || !exactIso(value.validFrom) || !exactIso(value.validUntil) || value.url !== "/ziwei/hourly"
    || !/^[0-9a-f]{64}$/u.test(value.snapshotDigest) || !text(value.windowKey, 1, 300)) return null;
  if (!exactKeys(value.month, [
    "lunarMonth", "isLeapMonth", "effectiveMonth", "ganzhi", "mingBranch", "mingPalaceName", "siHua", "flowStars",
  ]) || !compactLayerValid(value.month) || !Number.isInteger(value.month.lunarMonth)
    || value.month.lunarMonth < 1 || value.month.lunarMonth > 12 || typeof value.month.isLeapMonth !== "boolean"
    || !Number.isInteger(value.month.effectiveMonth) || value.month.effectiveMonth < 1 || value.month.effectiveMonth > 12) return null;
  if (!exactKeys(value.day, [
    "dateISO", "lunarDay", "ganzhi", "mingBranch", "mingPalaceName", "siHua", "flowStars",
  ]) || !compactLayerValid(value.day) || !calendarDate(value.day.dateISO)
    || !Number.isInteger(value.day.lunarDay) || value.day.lunarDay < 1 || value.day.lunarDay > 30) return null;
  if (!exactKeys(value.hour, [
    "civilDateISO", "calculationDateISO", "timeIndex", "ganzhi", "mingBranch", "mingPalaceName", "siHua", "flowStars",
  ]) || !compactLayerValid(value.hour) || !calendarDate(value.hour.civilDateISO)
    || !calendarDate(value.hour.calculationDateISO) || !Number.isInteger(value.hour.timeIndex)
    || value.hour.timeIndex < 0 || value.hour.timeIndex > 12) return null;
  return Object.freeze(value);
}

const COPY = Object.freeze({
  th: Object.freeze({ title: "紫微流時", month: "เดือน", day: "วัน", hour: "ยาม", palace: "เรือน", detail: "แตะดูผัง 3 ชั้นและหลักฐาน" }),
  en: Object.freeze({ title: "Ziwei hour", month: "Month", day: "Day", hour: "Hour", palace: "palace", detail: "Open the three layers and evidence" }),
  zh: Object.freeze({ title: "紫微流時", month: "月", day: "日", hour: "時", palace: "宮", detail: "查看月日時三層與依據" }),
  cn: Object.freeze({ title: "紫微流时", month: "月", day: "日", hour: "时", palace: "宫", detail: "查看月日时三层与依据" }),
  vi: Object.freeze({ title: "Tử Vi lưu thời", month: "Tháng", day: "Ngày", hour: "Giờ", palace: "cung", detail: "Mở ba tầng tháng–ngày–giờ và căn cứ lá số" }),
  ja: Object.freeze({ title: "紫微流時", month: "月", day: "日", hour: "時辰", palace: "宮", detail: "月・日・時の三層と算出根拠を確認" }),
  ru: Object.freeze({ title: "Цзывэй по часу", month: "Месяц", day: "День", hour: "Час", palace: "дворец", detail: "Откройте три слоя и данные расчёта" }),
  ko: Object.freeze({ title: "자미두수 시진", month: "월", day: "일", hour: "시진", palace: "궁", detail: "월·일·시진 3개 층과 계산 근거 보기" }),
  es: Object.freeze({ title: "Ziwei por hora", month: "Mes", day: "Día", hour: "Hora", palace: "palacio", detail: "Abre las tres capas y la evidencia del cálculo" }),
});

const PRIVATE_COPY = Object.freeze({
  th: Object.freeze({ title: "การแจ้งเตือนส่วนตัว", body: "เปิด HourKey เพื่อดูรายละเอียด" }),
  en: Object.freeze({ title: "Private notification", body: "Open HourKey to view details" }),
  zh: Object.freeze({ title: "私人通知", body: "開啟 HourKey 查看詳情" }),
  cn: Object.freeze({ title: "私人通知", body: "打开 HourKey 查看详情" }),
  vi: Object.freeze({ title: "Thông báo riêng tư", body: "Mở HourKey để xem chi tiết" }),
  ja: Object.freeze({ title: "個人向け通知", body: "HourKeyを開いて詳細を確認" }),
  ru: Object.freeze({ title: "Личное уведомление", body: "Откройте HourKey, чтобы увидеть подробности" }),
  ko: Object.freeze({ title: "개인 알림", body: "자세한 내용을 보려면 HourKey를 여세요" }),
  es: Object.freeze({ title: "Notificación privada", body: "Abre HourKey para ver los detalles" }),
});

function copyLocale(locale) {
  const value = String(locale || "").trim().toLowerCase();
  return Object.hasOwn(COPY, value) ? value : "en";
}

function buildZiweiHourlyCopy(locale, snapshot) {
  if (!verifyZiweiHourlyNotificationSnapshot(snapshot)) throw new TypeError("ziwei_hourly_snapshot_invalid");
  const language = copyLocale(locale);
  const copy = COPY[language];
  const layers = snapshot.facts.layers;
  const title = `${copy.title} · ${layers.liuShi.ganzhi} · ${copy.palace}${layers.liuShi.mingPalaceName}`;
  const body = [
    `${copy.month} ${layers.liuYue.ganzhi} · ${copy.palace}${layers.liuYue.mingPalaceName}`,
    `${copy.day} ${layers.liuRi.ganzhi} · ${copy.palace}${layers.liuRi.mingPalaceName}`,
    `${copy.hour} ${layers.liuShi.ganzhi} · ${copy.palace}${layers.liuShi.mingPalaceName}`,
    copy.detail,
  ].join(" | ");
  if (title.length > 120 || body.length > 400) throw new RangeError("ziwei_hourly_copy_too_long");
  return Object.freeze({ title, body });
}

function buildZiweiHourlyPrivateCopy(locale) {
  return PRIVATE_COPY[copyLocale(locale)];
}

module.exports = Object.freeze({
  LINEAGE,
  CALCULATION_VERSION,
  buildZiweiHourlyCopy,
  buildZiweiHourlyPrivateCopy,
  buildZiweiHourlyNotificationSnapshot,
  buildZiweiHourlyProviderData,
  canonicalStringify,
  parseZiweiHourlyProviderData,
  verifyZiweiHourlyNotificationSnapshot,
});
