/**
 * Notification-only interpretation of canonical Qimen engine output.
 * Source contract: data/library/qmdj/auth-th/wangxiang-vigor-th.md and
 * geju-formations-th.md. This module never builds or mutates a chart: it
 * combines the engine's beginner reading, 旺相休囚死 order and detected flags.
 */
const PURPOSE = "travel";
const ENGINE_PROFILE_ID = 1;
const ADVISORY_VERSION = "qimen-notification-advisory-v1";
const DIRECTION = Object.freeze({
  N: Object.freeze({ th: "เหนือ", en: "north", zh: "北方" }),
  NE: Object.freeze({ th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北方" }),
  E: Object.freeze({ th: "ตะวันออก", en: "east", zh: "東方" }),
  SE: Object.freeze({ th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南方" }),
  S: Object.freeze({ th: "ใต้", en: "south", zh: "南方" }),
  SW: Object.freeze({ th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南方" }),
  W: Object.freeze({ th: "ตะวันตก", en: "west", zh: "西方" }),
  NW: Object.freeze({ th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北方" }),
});
const SHICHEN = Object.freeze(["zi", "chou", "yin", "mao", "chen", "si", "wu", "wei", "shen", "you", "xu", "hai"]);
const RECOMMENDED_CODES = new Set(["suitable", "usable"]);
const VIGOR_LABELS = Object.freeze(["旺", "相", "休", "囚", "死"]);
const STAR_ELEMENT = Object.freeze({
  TIAN_PENG: "水", TIAN_REN: "土", TIAN_CHONG: "木", TIAN_FU: "木", TIAN_YING: "火",
  TIAN_RUI: "土", TIAN_ZHU: "金", TIAN_XIN: "金", TIAN_QIN: "土",
});
const DOOR_ELEMENT = Object.freeze({
  XIU_MEN: "水", SHENG_MEN: "土", SHANG_MEN: "木", DU_MEN: "木",
  JING_VIEW_MEN: "火", SI_MEN: "土", JING_FEAR_MEN: "金", KAI_MEN: "金",
});
const FORMATTERS = new Map();

function formatter(timezone, withSeconds = false) {
  const key = `${timezone}|${withSeconds ? "seconds" : "minutes"}`;
  if (!FORMATTERS.has(key)) {
    FORMATTERS.set(key, new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...(withSeconds ? { second: "2-digit" } : {}),
      hourCycle: "h23",
    }));
  }
  return FORMATTERS.get(key);
}

function validTimezone(value) {
  const timezone = typeof value === "string" ? value.trim() : "";
  if (!timezone) return null;
  try {
    formatter(timezone).format(new Date(0));
    return timezone;
  } catch {
    return null;
  }
}

function zonedParts(timezone, instant, withSeconds = false) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(at.valueOf())) throw new TypeError("qimen_notification_instant_invalid");
  return Object.fromEntries(formatter(timezone, withSeconds).formatToParts(at)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

function dateKey(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function previousDateKey(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1)).toISOString().slice(0, 10);
}

function timezoneOffsetMinutes(timezone, instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const p = zonedParts(timezone, at, true);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((localAsUtc - Math.floor(at.valueOf() / 1_000) * 1_000) / 60_000);
}

function dayOfYear(parts) {
  return Math.floor((Date.UTC(parts.year, parts.month - 1, parts.day) - Date.UTC(parts.year, 0, 1)) / 86_400_000) + 1;
}

// Same deterministic equation used by the canonical Qimen engine. This helper
// determines only the validity boundary; it never calculates a chart.
function qimenCorrectionMinutes(timezone, longitude, instant) {
  const lng = Number(longitude);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new TypeError("qimen_notification_longitude_invalid");
  const parts = zonedParts(timezone, instant);
  const b = (2 * Math.PI * (dayOfYear(parts) - 81)) / 364;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const standardMeridian = (timezoneOffsetMinutes(timezone, instant) / 60) * 15;
  return 4 * (lng - standardMeridian) + equationOfTime;
}

function apparentShichen(timezone, longitude, instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const correction = qimenCorrectionMinutes(timezone, longitude, at);
  const apparent = new Date(at.valueOf() + correction * 60_000);
  const parts = zonedParts(timezone, apparent);
  const index = parts.hour === 23 ? 0 : Math.floor((parts.hour + 1) / 2);
  const startDate = parts.hour === 0 ? previousDateKey(parts) : dateKey(parts);
  return Object.freeze({
    key: `${startDate}|${SHICHEN[index]}`,
    shichenKey: SHICHEN[index],
    apparentDate: dateKey(parts),
    apparentTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    correctionMinutes: correction,
  });
}

function boundary(timezone, longitude, instant, direction) {
  const atMs = instant.valueOf();
  const current = apparentShichen(timezone, longitude, instant).key;
  let outside = atMs + direction * 4 * 3_600_000;
  if (apparentShichen(timezone, longitude, new Date(outside)).key === current) {
    throw new RangeError("qimen_notification_boundary_unavailable");
  }
  let left = direction < 0 ? outside : atMs;
  let right = direction < 0 ? atMs : outside;
  while (right - left > 500) {
    const middle = Math.floor((left + right) / 2);
    const same = apparentShichen(timezone, longitude, new Date(middle)).key === current;
    if (direction < 0) {
      if (same) right = middle; else left = middle;
    } else if (same) left = middle; else right = middle;
  }
  return new Date(right);
}

function trueSolarShichenWindow(input) {
  const timezone = validTimezone(input?.timezone);
  const longitude = Number(input?.longitude);
  const instant = new Date(input?.instant);
  if (!timezone || !Number.isFinite(longitude) || !Number.isFinite(instant.valueOf())) {
    throw new TypeError("qimen_notification_window_invalid");
  }
  const apparent = apparentShichen(timezone, longitude, instant);
  const start = boundary(timezone, longitude, instant, -1);
  const end = boundary(timezone, longitude, instant, 1);
  return Object.freeze({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    shichenKey: apparent.shichenKey,
    apparentDate: apparent.apparentDate,
    apparentTime: apparent.apparentTime,
    correctionMinutes: apparent.correctionMinutes,
  });
}

function civilInstant(date, time, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(date || "")) || !/^\d{2}:\d{2}$/u.test(String(time || ""))) {
    throw new TypeError("qimen_notification_civil_time_invalid");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new TypeError("qimen_notification_civil_time_invalid");
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(target);
  for (let i = 0; i < 4; i += 1) {
    candidate = new Date(target - timezoneOffsetMinutes(timezone, candidate) * 60_000);
  }
  const wanted = `${date}|${time}`;
  const candidates = [candidate.valueOf() - 3_600_000, candidate.valueOf(), candidate.valueOf() + 3_600_000]
    .map((value) => new Date(value))
    .filter((value) => {
      const p = zonedParts(timezone, value);
      return `${dateKey(p)}|${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` === wanted;
    })
    .sort((left, right) => left.valueOf() - right.valueOf());
  if (candidates.length === 0) throw new RangeError("qimen_notification_civil_time_unavailable");
  return candidates[0];
}

function civilRangeWindow(date, range, timezoneInput) {
  const timezone = validTimezone(timezoneInput);
  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/u.exec(String(range || ""));
  if (!timezone || !match) throw new TypeError("qimen_notification_range_invalid");
  const start = civilInstant(date, match[1], timezone);
  let end = civilInstant(date, match[2], timezone);
  if (end <= start) {
    const nextDate = new Date(`${date}T12:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    end = civilInstant(nextDate.toISOString().slice(0, 10), match[2], timezone);
  }
  return Object.freeze({ startAt: start.toISOString(), endAt: end.toISOString() });
}

function normalizedResult(result) {
  const root = result?.data?.data && typeof result.data.data === "object" ? result.data.data : result?.data;
  return root && typeof root === "object" ? root : null;
}

function vigorMap(raw) {
  if (!Array.isArray(raw) || raw.length !== VIGOR_LABELS.length || new Set(raw).size !== VIGOR_LABELS.length) return null;
  const values = raw.map((value) => String(value || "").trim());
  if (!values.every((value) => ["木", "火", "土", "金", "水"].includes(value))) return null;
  return Object.freeze(Object.fromEntries(values.map((element, index) => [element, VIGOR_LABELS[index]])));
}

function component(row, kind, vigor) {
  const prefix = kind === "deity" ? "deity" : kind;
  const code = String(row?.[`${prefix}_code`] || "").trim();
  const zh = String(row?.[`${prefix}_zh`] || "").trim();
  const th = String(row?.[`${prefix}_name_th`] || zh || code).trim();
  const en = String(row?.[`${prefix}_name_en`] || zh || code).trim();
  if (!code || !zh || !th || !en) return null;
  const quality = String(row?.[`${prefix}_quality`] || "").trim() || null;
  const element = kind === "star" ? STAR_ELEMENT[code] || null : kind === "door" ? DOOR_ELEMENT[code] || null : null;
  if (vigor && (kind === "star" || kind === "door") && !element) return null;
  return Object.freeze({ code, zh, th, en, quality, element, vigor: element && vigor ? vigor[element] || null : null });
}

function warningCode(reason) {
  const zh = String(reason?.label_zh || "").trim();
  if (zh && /[\u3400-\u9fff]/u.test(zh)) return zh.slice(0, 20);
  const code = String(reason?.code || "").trim().toUpperCase();
  const known = {
    KONG_WANG: "空亡", MEN_PO: "門迫", FAN_YIN: "反吟", FU_YIN: "伏吟",
    RU_MU: "入墓", JI_XING: "擊刑", LIU_YI_JI_XING: "六儀擊刑", WU_BU_YU_TIME: "五不遇時",
  };
  return known[code] || (/^[A-Z0-9_]{2,40}$/u.test(code) ? code : null);
}

function warningCodes(row, engineWarnings) {
  const values = [];
  for (const reason of row?.beginner_reading?.reasons || []) {
    if (!["warn", "bad"].includes(String(reason?.tone || ""))) continue;
    const code = warningCode(reason);
    if (code && !values.includes(code)) values.push(code);
  }
  for (const flag of row?.classical_flags || []) {
    if (!["caution", "warning", "warn", "danger", "severe", "hard_caution"].includes(String(flag?.severity || "").toLowerCase())) continue;
    const code = warningCode(flag);
    if (code && !values.includes(code)) values.push(code);
  }
  for (const warning of engineWarnings || []) {
    const code = String(warning?.type || "").trim().toUpperCase();
    if (code && !values.includes(code)) values.push(code);
  }
  return Object.freeze(values.slice(0, 4));
}

function buildQimenAdvisory(result, options = {}) {
  const root = normalizedResult(result);
  const calculation = root?.calculation;
  const timezone = validTimezone(options.timezone || calculation?.input_timezone);
  const longitude = Number(options.longitude);
  const purpose = String(options.purpose || "").trim();
  const inputAt = new Date(calculation?.input_datetime);
  if (!root || !timezone || purpose !== PURPOSE || !Number.isFinite(longitude) || !Number.isFinite(inputAt.valueOf())) return null;
  if (calculation?.time_mode !== "true_solar_time" || calculation?.ju_method !== "chai_bu") return null;
  const vigor = vigorMap(root?.chart?.wang_xiang_status);
  if (!vigor) return null;
  const rows = (Array.isArray(root.palaces) ? root.palaces : []).map((row) => {
    const code = String(row?.direction || "").toUpperCase();
    const score = Number(row?.display_score);
    const deity = component(row, "deity", vigor);
    const door = component(row, "door", vigor);
    const star = component(row, "star", vigor);
    if (!DIRECTION[code] || !Number.isFinite(score) || !deity || !door || !star) return null;
    const readingCode = String(row?.beginner_reading?.code || "context");
    const weakVigor = [door.vigor, star.vigor].some((value) => value === "囚" || value === "死");
    const recommended = RECOMMENDED_CODES.has(readingCode)
      && row?.beginner_reading?.is_actionable === true
      && Number(row?.beginner_reading?.hard_count || 0) === 0
      && !weakVigor;
    return { row, code, score, deity, door, star, readingCode, recommended, weakVigor };
  }).filter(Boolean).sort((left, right) => right.score - left.score || Number(left.row.palace_id) - Number(right.row.palace_id));
  const selected = rows.find((row) => row.recommended) || rows[0];
  if (!selected) return null;
  const window = trueSolarShichenWindow({ timezone, longitude, instant: inputAt });
  const corrected = new Date(calculation.corrected_datetime);
  const engineCorrection = Number(calculation.correction_minutes);
  const expectedCorrection = qimenCorrectionMinutes(timezone, longitude, inputAt);
  if (!Number.isFinite(corrected.valueOf()) || !Number.isFinite(engineCorrection)
    || Math.abs(engineCorrection - expectedCorrection) > 0.02
    || Math.abs(corrected.valueOf() - (inputAt.valueOf() + engineCorrection * 60_000)) > 1_500) return null;
  const warningValues = [...warningCodes(selected.row, root.warnings)];
  for (const [kind, item] of [["DOOR", selected.door], ["STAR", selected.star]]) {
    if (item.vigor === "囚" || item.vigor === "死") warningValues.push(`${kind}_VIGOR_${item.vigor === "囚" ? "QIU" : "SI"}`);
  }
  const warnings = Object.freeze([...new Set(warningValues)].slice(0, 4));
  const recommendation = selected.recommended && warnings.length === 0 ? "recommended" : "caution";
  return Object.freeze({
    version: ADVISORY_VERSION,
    purpose,
    profileId: ENGINE_PROFILE_ID,
    school: "chaibu",
    systemType: "hour",
    recommendation,
    direction: Object.freeze({ code: selected.code, ...DIRECTION[selected.code] }),
    score: selected.score,
    palaceId: Number(selected.row.palace_id),
    deity: selected.deity,
    door: selected.door,
    star: selected.star,
    advice: Object.freeze({
      th: String(selected.row.door_action_advice_th || "").trim(),
      en: String(selected.row.door_action_advice_en || "").trim(),
      zh: String(selected.row.door_action_advice_zh || "").trim(),
    }),
    warningCodes: warnings,
    readingCode: selected.readingCode,
    readingVersion: String(selected.row?.beginner_reading?.version || "").trim() || null,
    wangXiangOrder: vigor ? Object.freeze([...root.chart.wang_xiang_status]) : null,
    inputAt: inputAt.toISOString(),
    correctedAt: corrected.toISOString(),
    correctionMinutes: engineCorrection,
    hourPillarZh: String(calculation?.pillars?.hourPillarZh || "").trim() || null,
    shichenKey: window.shichenKey,
    validFrom: window.startAt,
    validUntil: window.endAt,
    timezone,
  });
}

async function fetchCanonicalQimenAdvisory(input, options = {}) {
  const date = String(input?.date || "");
  const time = String(input?.time || "");
  const timezone = validTimezone(input?.timezone);
  const latitude = Number(input?.lat ?? input?.latitude);
  const longitude = Number(input?.lng ?? input?.longitude);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !/^\d{2}:\d{2}$/u.test(time)
    || !timezone || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError("qimen_notification_engine_request_invalid");
  }
  options.signal?.throwIfAborted();
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = String(options.baseUrl || process.env.QIMEN_API_URL || "http://127.0.0.1:4090").replace(/\/+$/u, "");
  const timeout = AbortSignal.timeout(8_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetchImpl(`${baseUrl}/api/qimen/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "hourkey-mobile-notification/1.0" },
    body: JSON.stringify({
      datetime: `${date}T${time}:00`, timezone, instant: input?.instant,
      latitude, longitude, profile_id: ENGINE_PROFILE_ID, purpose: PURPOSE,
      system_type: "hour", skip_save: true, source_endpoint: "mobile-notification",
    }),
    signal,
  });
  if (!response?.ok) throw new Error(`qimen_notification_engine_http_${Number(response?.status) || 0}`);
  const result = await response.json();
  options.signal?.throwIfAborted();
  return buildQimenAdvisory(result, { timezone, longitude, purpose: PURPOSE });
}

function localeOf(locale) {
  const value = String(locale || "th").toLowerCase();
  if (value === "th") return "th";
  if (value === "zh" || value === "cn" || value.startsWith("zh-")) return "zh";
  return "en";
}

function windowLabel(advisory) {
  // A minute-only label must never claim that the chart started before its
  // calculated boundary or remains valid after it. Round inward.
  const startValue = new Date(advisory.validFrom).valueOf();
  const start = zonedParts(advisory.timezone, new Date(Math.ceil(startValue / 60_000) * 60_000));
  const end = zonedParts(advisory.timezone, new Date(advisory.validUntil));
  const startClock = `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`;
  const endClock = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`;
  return dateKey(start) === dateKey(end)
    ? `${startClock}–${endClock}`
    : `${String(start.day).padStart(2, "0")}/${String(start.month).padStart(2, "0")} ${startClock}–${String(end.day).padStart(2, "0")}/${String(end.month).padStart(2, "0")} ${endClock}`;
}

function names(advisory, locale) {
  if (locale === "zh") return `神${advisory.deity.zh} · 門${advisory.door.zh} · 星${advisory.star.zh}`;
  if (locale === "en") return `Deity ${advisory.deity.en} ${advisory.deity.zh} · Gate ${advisory.door.en} ${advisory.door.zh} · Star ${advisory.star.en} ${advisory.star.zh}`;
  return `เทพ${advisory.deity.th} ${advisory.deity.zh} · ${advisory.door.th} ${advisory.door.zh} · ${advisory.star.th} ${advisory.star.zh}`;
}

function warningLabel(code, locale) {
  const localized = {
    NEAR_HOUR_BOUNDARY: { th: "ใกล้ขอบยาม", en: "near an hour boundary", zh: "近時辰交界" },
    LARGE_TIME_CORRECTION: { th: "เวลาสุริยะต่างมาก—ควรตรวจพิกัด", en: "large solar-time correction—check location", zh: "真太陽時校正較大—請核對位置" },
    NEAR_SOLAR_TERM_START: { th: "ใกล้จุดเปลี่ยน節氣", en: "near a solar-term change", zh: "近節氣交界" },
    DOOR_VIGOR_QIU: { th: "ประตูอยู่ภาวะ囚", en: "gate qi is imprisoned 囚", zh: "門氣囚" },
    DOOR_VIGOR_SI: { th: "ประตูอยู่ภาวะ死", en: "gate qi is dead 死", zh: "門氣死" },
    STAR_VIGOR_QIU: { th: "ดาวอยู่ภาวะ囚", en: "star qi is imprisoned 囚", zh: "星氣囚" },
    STAR_VIGOR_SI: { th: "ดาวอยู่ภาวะ死", en: "star qi is dead 死", zh: "星氣死" },
  }[code];
  return localized?.[locale] || code;
}

function warningLabels(advisory, locale) {
  return advisory.warningCodes.map((code) => warningLabel(code, locale)).join("/");
}

function buildQimenStandaloneCopy(advisory, localeInput) {
  const locale = localeOf(localeInput);
  const period = windowLabel(advisory);
  const componentNames = names(advisory, locale);
  const warnings = warningLabels(advisory, locale);
  if (locale === "zh") return advisory.recommendation === "recommended" ? {
    title: "🧭 奇門時盤 · 出行方位",
    body: `${period} · ${advisory.direction.zh} · ${componentNames} · 系統出行分 ${advisory.score}/100 · 點開查看完整時盤；不保證結果`,
  } : {
    title: "⚠️ 奇門時盤 · 暫無明確推薦方位",
    body: `${period} · 最高候選 ${advisory.direction.zh} · ${componentNames} · 注意 ${warnings || "格局條件"} · 點開查看完整時盤`,
  };
  if (locale === "en") return advisory.recommendation === "recommended" ? {
    title: "🧭 Qimen hour chart · travel direction",
    body: `${period} · ${advisory.direction.en} · ${componentNames} · system travel score ${advisory.score}/100 · Open the full hour chart; outcomes are not guaranteed`,
  } : {
    title: "⚠️ Qimen hour chart · no clear travel direction",
    body: `${period} · top candidate ${advisory.direction.en} · ${componentNames} · Caution ${warnings || "chart conditions"} · Open the full hour chart`,
  };
  return advisory.recommendation === "recommended" ? {
    title: "🧭 ผังฉีเหมินยาม · ทิศเดินทาง",
    body: `${period} · ${advisory.direction.th} · ${componentNames} · คะแนนระบบด้านการเดินทาง ${advisory.score}/100 · เปิดดูผังยามเต็ม ผลลัพธ์ไม่รับประกัน`,
  } : {
    title: "⚠️ ผังฉีเหมินยาม · ยังไม่มีทิศแนะนำชัด",
    body: `${period} · ตัวเลือกคะแนนสูงสุด ${advisory.direction.th} · ${componentNames} · ระวัง ${warnings || "เงื่อนไขของผัง"} · เปิดดูผังยามเต็ม`,
  };
}

function buildQimenYamLine(advisory, localeInput) {
  if (!advisory) return "";
  const locale = localeOf(localeInput);
  const period = windowLabel(advisory);
  const componentNames = names(advisory, locale);
  const warnings = warningLabels(advisory, locale);
  if (locale === "zh") return advisory.recommendation === "recommended"
    ? `\n🧭 奇門出行 ${period}: ${advisory.direction.zh} · ${componentNames}`
    : `\n⚠️ 奇門 ${period}: 暫無明確推薦 · 候選${advisory.direction.zh} · ${componentNames} · ${warnings || "需看局"}`;
  if (locale === "en") return advisory.recommendation === "recommended"
    ? `\n🧭 Qimen travel ${period}: ${advisory.direction.en} · ${componentNames}`
    : `\n⚠️ Qimen ${period}: no clear travel direction · candidate ${advisory.direction.en} · ${componentNames} · ${warnings || "check chart"}`;
  return advisory.recommendation === "recommended"
    ? `\n🧭 ฉีเหมินด้านการเดินทาง ${period}: ${advisory.direction.th} · ${componentNames}`
    : `\n⚠️ ฉีเหมิน ${period}: ยังไม่มีทิศแนะนำชัด · ตัวเลือก ${advisory.direction.th} · ${componentNames} · ${warnings || "ต้องดูผัง"}`;
}

function qimenSourceFacts(advisory, extra = {}) {
  const qimen = Object.freeze({
    version: advisory.version,
    purpose: advisory.purpose,
    profileId: advisory.profileId,
    school: advisory.school,
    systemType: advisory.systemType,
    recommendation: advisory.recommendation,
    palaceId: advisory.palaceId,
    direction: advisory.direction.code,
    score: advisory.score,
    deity: advisory.deity,
    door: advisory.door,
    star: advisory.star,
    warningCodes: advisory.warningCodes,
    readingCode: advisory.readingCode,
    readingVersion: advisory.readingVersion,
    wangXiangOrder: advisory.wangXiangOrder,
    inputAt: advisory.inputAt,
    correctedAt: advisory.correctedAt,
    correctionMinutes: advisory.correctionMinutes,
    hourPillarZh: advisory.hourPillarZh,
    shichen: advisory.shichenKey,
    validFrom: advisory.validFrom,
    validUntil: advisory.validUntil,
    timezone: advisory.timezone,
  });
  return Object.freeze({ ...extra, eventStartAt: advisory.validFrom, eventEndAt: advisory.validUntil, qimen });
}

function earliestExpiry(...values) {
  const parsed = values.map((value) => new Date(value)).filter((value) => Number.isFinite(value.valueOf()));
  if (parsed.length === 0) return null;
  return new Date(Math.min(...parsed.map((value) => value.valueOf()))).toISOString();
}

module.exports = {
  ADVISORY_VERSION,
  PURPOSE,
  buildQimenAdvisory,
  buildQimenStandaloneCopy,
  buildQimenYamLine,
  civilRangeWindow,
  earliestExpiry,
  fetchCanonicalQimenAdvisory,
  qimenSourceFacts,
  trueSolarShichenWindow,
};
