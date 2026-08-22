/**
 * Notification-only interpretation of canonical Qimen engine output.
 * Source contract: data/library/qmdj/auth-th/wangxiang-vigor-th.md and
 * geju-formations-th.md. This module never builds or mutates a chart: it
 * combines the engine's beginner reading, 旺相休囚死 order and detected flags.
 */
const PURPOSE = "travel";
const ENGINE_PROFILE_ID = 1;
const ENGINE_CONTRACT_VERSION = "QIMEN_HOUR_NOTIFICATION_PIPELINE_CLOSURE_V6";
const ENGINE_SOURCE_SHA256 = "d0abb00d9d6cff7dfb72471441eb038f9eddd1d01930d2c7e9079d1e9b4caa63";
const ENGINE_DEPENDENCY_CLOSURE_VERSION = "QIMEN_NOTIFICATION_PIPELINE_CLOSURE_V2";
const ENGINE_DEPENDENCY_CLOSURE_SHA256 = "2abc0ddfb0fe05854db335a9f44b93a4902f50cb839473b7cbcc3ba358210d5a";
const ENGINE_NODE_RUNTIME = "v22.22.1";
const ENGINE_REFERENCE_DATA_VERSION = "QIMEN_SQLITE_REFERENCE_TABLES_V1";
const ENGINE_REFERENCE_DATA_SHA256 = "2bbe56382a78ee951da880706b3b1c895307306848319ebac026ed227d38e1c4";
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
const VIGOR_LABELS = Object.freeze(["旺", "相", "休", "囚", "死"]);
const ACTION_SUPPORTING_VIGOR = new Set(["旺", "相"]);
const MIN_NOTIFICATION_SCORE = 60;
const MAX_NOTIFICATION_SOFT_WARNINGS = 2;
const ASCII_EVIDENCE_CODE = /^[A-Z0-9_]{2,80}$/u;
const HARD_SEVERITIES = new Set(["danger", "severe", "hard_caution"]);
const SOFT_SEVERITIES = new Set(["caution", "warning", "warn", "bad", "inauspicious"]);
const HARD_QUALITIES = new Set(["severe", "great_inauspicious", "da_xiong"]);
const SOFT_QUALITIES = new Set(["bad", "inauspicious"]);
const ENGINE_SOFT_WARNING_CODES = new Set([
  "NEAR_HOUR_BOUNDARY", "LARGE_TIME_CORRECTION", "NEAR_SOLAR_TERM_START",
]);
const HARD_WARNING_CODES = new Set([
  "FU_YIN", "FAN_YIN", "LIU_YI_JI_XING", "WU_BU_YU_TIME", "SAN_QI_RU_MU", "TIAN_WANG",
]);
const QIMEN_PLAN_CAPS = Object.freeze({
  free: Object.freeze({ timeWindowDays: 0, hoursPerDay: 1 }),
  trial: Object.freeze({ timeWindowDays: 0, hoursPerDay: 12 }),
  premium: Object.freeze({ timeWindowDays: 90, hoursPerDay: 12 }),
  master: Object.freeze({ timeWindowDays: 365, hoursPerDay: 12 }),
});
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

function equationOfTimeMinutes(instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(at.valueOf())) throw new TypeError("qimen_notification_instant_invalid");
  // Smooth tropical-year phase avoids the UTC-midnight step produced by an
  // integer day-of-year approximation. The NOAA Fourier series is periodic,
  // so A(t) remains continuous across civil days, leap days, and year ends.
  const tropicalYearMs = 365.2422 * 86_400_000;
  const j2000NoonUtc = Date.UTC(2000, 0, 1, 12);
  const gamma = 2 * Math.PI * ((at.valueOf() - j2000NoonUtc) / tropicalYearMs);
  return 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
}

/**
 * Apparent-solar time is a monotonic, timezone-free coordinate:
 *   A(t) = UTC instant + (4 × longitude + equation-of-time(t)) minutes.
 *
 * Never resolve the shifted instant through an IANA timezone. Doing so applies
 * a DST offset for a second time and can reverse/overlap shichen at a gap/fold.
 */
function apparentSolarCoordinate(longitude, instant) {
  const at = instant instanceof Date ? new Date(instant.valueOf()) : new Date(instant);
  const lng = Number(longitude);
  if (!Number.isFinite(at.valueOf())) throw new TypeError("qimen_notification_instant_invalid");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new TypeError("qimen_notification_longitude_invalid");
  const equationOfTime = equationOfTimeMinutes(at);
  const coordinate = new Date(at.valueOf() + (4 * lng + equationOfTime) * 60_000);
  return Object.freeze({
    coordinate,
    equationOfTimeMinutes: equationOfTime,
    longitudeMinutes: 4 * lng,
    parts: Object.freeze({
      year: coordinate.getUTCFullYear(), month: coordinate.getUTCMonth() + 1,
      day: coordinate.getUTCDate(), hour: coordinate.getUTCHours(),
      minute: coordinate.getUTCMinutes(), second: coordinate.getUTCSeconds(),
    }),
  });
}

// Same deterministic equation used by the canonical Qimen engine. This helper
// determines only the validity boundary; it never calculates a chart.
function qimenCorrectionMinutes(timezone, longitude, instant) {
  const lng = Number(longitude);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new TypeError("qimen_notification_longitude_invalid");
  const apparent = apparentSolarCoordinate(lng, instant);
  return apparent.longitudeMinutes
    + apparent.equationOfTimeMinutes
    - timezoneOffsetMinutes(timezone, instant);
}

function apparentShichen(timezone, longitude, instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const correction = qimenCorrectionMinutes(timezone, longitude, at);
  const parts = apparentSolarCoordinate(longitude, at).parts;
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
  while (right - left > 1) {
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

function apparentDayKey(timezone, longitude, instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  return dateKey(apparentSolarCoordinate(longitude, at).parts);
}

function apparentDayBoundary(timezone, longitude, instant, direction) {
  const atMs = instant.valueOf();
  const current = apparentDayKey(timezone, longitude, instant);
  const outside = atMs + direction * 30 * 3_600_000;
  if (apparentDayKey(timezone, longitude, new Date(outside)) === current) {
    throw new RangeError("qimen_notification_day_boundary_unavailable");
  }
  let left = direction < 0 ? outside : atMs;
  let right = direction < 0 ? atMs : outside;
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    const same = apparentDayKey(timezone, longitude, new Date(middle)) === current;
    if (direction < 0) {
      if (same) right = middle; else left = middle;
    } else if (same) left = middle; else right = middle;
  }
  return new Date(right);
}

function trueSolarDayWindow(input) {
  const timezone = validTimezone(input?.timezone);
  const longitude = Number(input?.longitude);
  const instant = new Date(input?.instant);
  if (!timezone || !Number.isFinite(longitude) || !Number.isFinite(instant.valueOf())) {
    throw new TypeError("qimen_notification_day_window_invalid");
  }
  const start = apparentDayBoundary(timezone, longitude, instant, -1);
  const end = apparentDayBoundary(timezone, longitude, instant, 1);
  return Object.freeze({
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    apparentDate: apparentDayKey(timezone, longitude, instant),
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

function qimenProductPlan(user, now) {
  const tier = String(user?.tier || "free").toLowerCase();
  const subExpiresAt = new Date(user?.sub_expires_at || 0);
  const trialEndsAt = new Date(user?.trial_ends_at || 0);
  if ((tier === "master" || tier === "premium") && Number.isFinite(subExpiresAt.valueOf()) && subExpiresAt > now) return tier;
  if (Number.isFinite(trialEndsAt.valueOf()) && trialEndsAt > now) return "trial";
  return "free";
}

function civilShichen(time) {
  const match = /^(\d{2}):(\d{2})$/u.exec(String(time || ""));
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return -1;
  return hour === 23 ? 0 : Math.floor((hour + 1) / 2);
}

function qimenNotificationEntitlement(user, input) {
  const timezone = validTimezone(input?.timezone);
  const now = new Date(input?.now ?? input?.instant);
  const date = String(input?.date || "");
  const time = String(input?.time || "");
  const plan = qimenProductPlan(user, now);
  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    return Object.freeze({ allow: false, plan, reason: "qimen_not_entitled" });
  }
  if (!timezone || !Number.isFinite(now.valueOf()) || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || civilShichen(time) < 0) {
    return Object.freeze({ allow: false, plan, reason: "qimen_request_invalid" });
  }
  const current = zonedParts(timezone, now);
  const currentDate = dateKey(current);
  const requestedDay = Date.parse(`${date}T00:00:00.000Z`);
  const currentDay = Date.parse(`${currentDate}T00:00:00.000Z`);
  const dayDistance = Math.abs(Math.round((requestedDay - currentDay) / 86_400_000));
  const caps = QIMEN_PLAN_CAPS[plan];
  if (!Number.isFinite(dayDistance) || dayDistance > caps.timeWindowDays) {
    return Object.freeze({ allow: false, plan, reason: "qimen_time_window_locked" });
  }
  const currentTime = `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}`;
  if (caps.hoursPerDay <= 1 && (date !== currentDate || civilShichen(time) !== civilShichen(currentTime))) {
    return Object.freeze({ allow: false, plan, reason: "qimen_hour_locked" });
  }
  return Object.freeze({ allow: true, plan, reason: null });
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

function asciiCode(value) {
  const code = String(value || "").normalize("NFKC").trim().toUpperCase().replace(/[\s-]+/gu, "_");
  return ASCII_EVIDENCE_CODE.test(code) ? code : null;
}

function evidenceIdentityValues(item) {
  return [
    item?.code, item?.formation_code, item?.type, item?.rule_id, item?.detector, item?.flag,
    item?.label_zh, item?.name_zh, item?.title_zh, item?.notation_zh,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function normalizedSemanticCode(value) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw) return null;
  const code = asciiCode(raw);
  const text = raw.replace(/\s+/gu, "");
  const exactHan = new Map([
    ["三奇入墓", "SAN_QI_RU_MU"], ["三奇入庫", "SAN_QI_RU_MU"], ["三奇入库", "SAN_QI_RU_MU"],
    ["時干入墓", "SHI_GAN_RU_MU"], ["时干入墓", "SHI_GAN_RU_MU"],
    ["六儀擊刑", "LIU_YI_JI_XING"], ["六仪击刑", "LIU_YI_JI_XING"],
    ["五不遇時", "WU_BU_YU_TIME"], ["五不遇时", "WU_BU_YU_TIME"], ["五不遇", "WU_BU_YU_TIME"],
    ["伏吟", "FU_YIN"], ["反吟", "FAN_YIN"],
    ["天網四張", "TIAN_WANG"], ["天网四张", "TIAN_WANG"],
    ["大格", "DA_GE"], ["刑格", "XING_GE"], ["上格", "SHANG_GE"],
    ["白入熒", "BAI_RU_YING"], ["白入荧", "BAI_RU_YING"],
    ["熒入白", "YING_RU_BAI"], ["荧入白", "YING_RU_BAI"],
  ]);
  if (exactHan.has(text)) return exactHan.get(text);
  if (["SAN_QI_RU_MU", "SAN_QI_RU_MU_HEAVEN", "SAN_QI_RU_MU_EARTH"].includes(code)) return "SAN_QI_RU_MU";
  if (["SHI_GAN_RU_MU", "SHI_GAN_RU_MU_HEAVEN", "SHI_GAN_RU_MU_EARTH"].includes(code)) return "SHI_GAN_RU_MU";
  if (["JI_XING", "LIU_YI_JI_XING", "LIU_YI_JI_XING_HEAVEN", "LIU_YI_JI_XING_EARTH", "YS_LIU_YI_JI_XING"].includes(code)) return "LIU_YI_JI_XING";
  if (["WU_BU_YU", "WU_BU_YU_TIME", "WU_BU_YU_SHI", "FIVE_NO_MEET", "FIVE_NOT_MEET"].includes(code)) return "WU_BU_YU_TIME";
  if (["FU_YIN", "FU_YIN_STAR", "FU_YIN_DOOR"].includes(code)) return "FU_YIN";
  if (["FAN_YIN", "FAN_YIN_STAR", "FAN_YIN_DOOR"].includes(code)) return "FAN_YIN";
  if (code === "TIAN_WANG") return "TIAN_WANG";
  if (code === "DA_GE") return "DA_GE";
  if (code === "XING_GE") return "XING_GE";
  if (code === "SHANG_GE") return "SHANG_GE";
  if (code === "GENG_OVER_SAN_QI") return code;
  if (code === "BAI_RU_YING") return "BAI_RU_YING";
  if (code === "YING_RU_BAI") return "YING_RU_BAI";
  if (code === "FOUR_OMINOUS") return code;
  if (text === "空亡" || code?.startsWith("KONG_WANG")) return "KONG_WANG";
  if (["門迫", "门迫"].includes(text) || code?.startsWith("MEN_PO")) return "MEN_PO";
  if (text === "入墓" || code?.startsWith("RU_MU")) return "RU_MU";
  return code;
}

function hardSemanticCode(item) {
  for (const value of evidenceIdentityValues(item)) {
    const code = normalizedSemanticCode(value);
    if (code && HARD_WARNING_CODES.has(code)) return code;
  }
  return null;
}

function zhEvidenceLabel(item, fallback) {
  const value = [item?.label_zh, item?.name_zh, item?.title_zh, item?.notation_zh]
    .map((entry) => String(entry || "").trim())
    .find((entry) => /[\u3400-\u9fff]/u.test(entry));
  return value ? value.slice(0, 24) : fallback;
}

function palaceFormationApplies(item, palaceId) {
  const scope = String(item?.scope || "").toLowerCase();
  if (!scope || scope === "chart") return true;
  if (scope !== "palace") return false;
  return Number(item?.scope_ref) === palaceId;
}

function softWarningRank(code) {
  if (code === "KONG_WANG") return 0;
  if (code === "MEN_PO") return 1;
  if (code === "RU_MU") return 2;
  if (code === "YONGSHEN_WARNING") return 3;
  if (code.startsWith("INTRINSIC_")) return 4;
  if (code.startsWith("STEM_RESPONSE_")) return 5;
  if (ENGINE_SOFT_WARNING_CODES.has(code)) return 6;
  return 7;
}

function warningEvidence(root, row, components) {
  const soft = new Map();
  const hard = new Set();
  const structured = new Set();
  let invalid = false;
  const addSoft = (code, label = code) => {
    if (!code || !ASCII_EVIDENCE_CODE.test(code)) {
      invalid = true;
      return;
    }
    if (!soft.has(code)) soft.set(code, label || code);
  };
  const addHard = (code) => hard.add(code || "UNCLASSIFIED_HARD_WARNING");

  for (const [kind, item] of Object.entries(components)) {
    const quality = String(item?.quality || "").trim().toLowerCase();
    if (HARD_QUALITIES.has(quality)) addHard(`INTRINSIC_${kind.toUpperCase()}_SEVERE`);
    else if (SOFT_QUALITIES.has(quality)) {
      addSoft(`INTRINSIC_${kind.toUpperCase()}_BAD`, item.zh);
      structured.add(`INTRINSIC_${kind.toUpperCase()}_BAD`);
    }
  }

  const palaceId = Number(row?.palace_id);
  const structuredItems = [
    ...(Array.isArray(row?.classical_flags) ? row.classical_flags : []),
    ...(Array.isArray(row?.qimen_trace) ? row.qimen_trace : []),
    ...[root?.stored_formations, root?.compound_formations, root?.source_formations]
      .flatMap((items) => Array.isArray(items) ? items.filter((item) => palaceFormationApplies(item, palaceId)) : []),
  ];
  for (const item of structuredItems) {
    if (!item || typeof item !== "object" || item.active === false) continue;
    const hardCode = hardSemanticCode(item);
    const severities = [item.severity, item.tone].map((value) => String(value || "").trim().toLowerCase());
    const qualities = [item.quality, item.effective_quality, item.base_quality]
      .map((value) => String(value || "").trim().toLowerCase());
    const rating = String(item.rating_zh || "").trim();
    const isHard = Boolean(hardCode) || severities.some((value) => HARD_SEVERITIES.has(value))
      || qualities.some((value) => HARD_QUALITIES.has(value)) || rating === "大凶";
    if (isHard) {
      addHard(hardCode || evidenceIdentityValues(item).map(normalizedSemanticCode).find(Boolean));
      continue;
    }
    const isSoft = severities.some((value) => SOFT_SEVERITIES.has(value))
      || qualities.some((value) => SOFT_QUALITIES.has(value));
    if (!isSoft) continue;
    const code = evidenceIdentityValues(item).map(normalizedSemanticCode).find(Boolean);
    if (!code) {
      invalid = true;
      continue;
    }
    structured.add(code);
    addSoft(code, zhEvidenceLabel(item, code));
  }

  const stem = row?.stem_response;
  let stemCode = null;
  if (stem && typeof stem === "object") {
    const severity = String(stem.severity || "").trim().toLowerCase();
    const quality = String(stem.quality || "").trim().toLowerCase();
    const rating = String(stem.rating_zh || "").trim();
    const negative = HARD_SEVERITIES.has(severity) || SOFT_SEVERITIES.has(severity)
      || HARD_QUALITIES.has(quality) || SOFT_QUALITIES.has(quality) || rating === "大凶";
    if (negative) {
      const rawCode = asciiCode(stem.code);
      if (stem.is_source_governed !== true || !rawCode) invalid = true;
      else {
        stemCode = `STEM_RESPONSE_${rawCode}`;
        if (HARD_SEVERITIES.has(severity) || HARD_QUALITIES.has(quality) || rating === "大凶") addHard(stemCode);
        else {
          structured.add(stemCode);
          addSoft(stemCode, zhEvidenceLabel(stem, stemCode));
        }
      }
    }
  }

  if (row?.is_void_any === true) addSoft("KONG_WANG", "空亡");
  if (row?.is_men_po === true) addSoft("MEN_PO", "門迫");
  if (row?.is_ru_mu === true) addSoft("RU_MU", "入墓");
  for (const [field, code] of [
    ["is_fu_yin", "FU_YIN"], ["is_fan_yin", "FAN_YIN"],
    ["is_liu_yi_ji_xing", "LIU_YI_JI_XING"], ["is_wu_bu_yu_time", "WU_BU_YU_TIME"],
  ]) {
    if (row?.[field] === true) addHard(code);
  }
  for (const reason of row?.beginner_reading?.reasons || []) {
    if (!["warn", "bad"].includes(String(reason?.tone || "").trim().toLowerCase())) continue;
    const hardCode = hardSemanticCode(reason);
    if (hardCode) {
      addHard(hardCode);
      continue;
    }
    const kind = String(reason?.kind || "").trim().toLowerCase();
    const code = evidenceIdentityValues(reason).map(normalizedSemanticCode).find(Boolean);
    if (["KONG_WANG", "MEN_PO", "RU_MU"].includes(code)) {
      addSoft(code, zhEvidenceLabel(reason, code));
    } else if (kind.includes("yongshen") || code === "YONGSHEN" || code === "YONGSHEN_WARNING"
      || kind.includes("score") || code === "ENGINE_SCORE") {
      // Beginner-layer derivative explanations are not independent science warnings.
      // A typed source with the same canonical code was already counted above.
    } else if (kind === "stem_response" && stemCode) {
      // The structured, source-governed stem response above is authoritative.
    } else if (["deity", "door", "star"].includes(kind)
      && structured.has(`INTRINSIC_${kind.toUpperCase()}_BAD`)) {
      // The component quality above is authoritative and already counted once.
    } else if (code && structured.has(code)) {
      // A beginner explanation may repeat a typed structured source item.
    } else {
      invalid = true;
    }
  }

  for (const warning of root?.warnings || []) {
    const code = asciiCode(warning?.type || warning?.code);
    if (!code || !ENGINE_SOFT_WARNING_CODES.has(code)) invalid = true;
    else addSoft(code, code);
  }
  const canonicalSoftCodes = [...soft.keys()].sort((left, right) => softWarningRank(left) - softWarningRank(right));
  return Object.freeze({
    invalid,
    hardCodes: Object.freeze([...hard]),
    canonicalSoftCodes: Object.freeze(canonicalSoftCodes),
    displaySoftCodes: Object.freeze(canonicalSoftCodes.map((code) => soft.get(code))),
  });
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
    const weakVigor = [door.vigor, star.vigor].some((value) => !ACTION_SUPPORTING_VIGOR.has(value));
    const evidence = warningEvidence(root, row, { deity, door, star });
    const hardCount = Number(row?.beginner_reading?.hard_count);
    const eligible = score >= MIN_NOTIFICATION_SCORE
      && hardCount === 0
      && !weakVigor
      && !evidence.invalid
      && evidence.hardCodes.length === 0
      && evidence.canonicalSoftCodes.length <= MAX_NOTIFICATION_SOFT_WARNINGS;
    return { row, code, score, deity, door, star, readingCode, eligible, weakVigor, evidence };
  }).filter(Boolean).sort((left, right) => right.score - left.score || Number(left.row.palace_id) - Number(right.row.palace_id));
  const selected = rows.find((row) => row.eligible
    && row.readingCode === "suitable" && row.evidence.canonicalSoftCodes.length === 0)
    || rows.find((row) => row.eligible) || rows[0];
  if (!selected) return null;
  const window = trueSolarShichenWindow({ timezone, longitude, instant: inputAt });
  const corrected = new Date(calculation.corrected_datetime);
  const engineCoordinate = new Date(calculation.apparent_solar_coordinate);
  const expectedCoordinate = apparentSolarCoordinate(longitude, inputAt).coordinate;
  const engineCorrection = Number(calculation.correction_minutes);
  const expectedCorrection = qimenCorrectionMinutes(timezone, longitude, inputAt);
  const engineContract = calculation.engine_contract;
  if (!Number.isFinite(corrected.valueOf()) || !Number.isFinite(engineCorrection)
    || Math.abs(engineCorrection - expectedCorrection) > 0.02
    || !Number.isFinite(engineCoordinate.valueOf())
    || Math.abs(engineCoordinate.valueOf() - expectedCoordinate.valueOf()) > 1_500
    || engineContract?.version !== ENGINE_CONTRACT_VERSION
    || engineContract?.source_sha256 !== ENGINE_SOURCE_SHA256
    || engineContract?.dependency_closure_version !== ENGINE_DEPENDENCY_CLOSURE_VERSION
    || engineContract?.dependency_closure_sha256 !== ENGINE_DEPENDENCY_CLOSURE_SHA256
    || engineContract?.node_runtime !== ENGINE_NODE_RUNTIME
    || engineContract?.reference_data_version !== ENGINE_REFERENCE_DATA_VERSION
    || engineContract?.reference_data_sha256 !== ENGINE_REFERENCE_DATA_SHA256
    || engineContract?.profile_id !== ENGINE_PROFILE_ID
    || engineContract?.apparent_timeline !== "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1"
    || engineContract?.equation_of_time !== "NOAA_CONTINUOUS_TROPICAL_PHASE_V1"
    || engineContract?.year_month_clock !== "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1"
    || engineContract?.day_boundary_policy !== "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1") return null;
  const warningValues = [...selected.evidence.displaySoftCodes];
  for (const [kind, item] of [["DOOR", selected.door], ["STAR", selected.star]]) {
    if (!ACTION_SUPPORTING_VIGOR.has(item.vigor)) {
      const suffix = item.vigor === "休" ? "XIU" : item.vigor === "囚" ? "QIU" : "SI";
      warningValues.push(`${kind}_VIGOR_${suffix}`);
    }
  }
  const warnings = Object.freeze([...new Set(warningValues)].slice(0, 4));
  const recommendation = selected.eligible ? "recommended" : "caution";
  const canonicalWarningCodes = Object.freeze([...selected.evidence.canonicalSoftCodes]);
  const decisionClass = selected.eligible
    ? (selected.readingCode === "suitable" && canonicalWarningCodes.length === 0 ? "clear" : "conditional")
    : null;
  return Object.freeze({
    version: ADVISORY_VERSION,
    purpose,
    profileId: ENGINE_PROFILE_ID,
    school: "chaibu",
    systemType: "hour",
    recommendation,
    decisionClass,
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
    canonicalWarningCodes,
    readingCode: selected.readingCode,
    readingVersion: String(selected.row?.beginner_reading?.version || "").trim() || null,
    wangXiangOrder: vigor ? Object.freeze([...root.chart.wang_xiang_status]) : null,
    inputAt: inputAt.toISOString(),
    correctedAt: corrected.toISOString(),
    correctionMinutes: engineCorrection,
    engineContract: Object.freeze({ ...engineContract }),
    hourPillarZh: String(calculation?.pillars?.hourPillarZh || "").trim() || null,
    shichenKey: window.shichenKey,
    validFrom: window.startAt,
    validUntil: window.endAt,
    timezone,
  });
}

async function fetchCanonicalQimenEngineSnapshot(input, options = {}) {
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
  const requestedInstant = input?.instant == null || input.instant === ""
    ? civilInstant(date, time, timezone)
    : new Date(input.instant);
  if (!Number.isFinite(requestedInstant.valueOf())) throw new TypeError("qimen_notification_engine_request_invalid");
  const requestedParts = zonedParts(timezone, requestedInstant);
  const requestedClock = `${String(requestedParts.hour).padStart(2, "0")}:${String(requestedParts.minute).padStart(2, "0")}`;
  if (dateKey(requestedParts) !== date || requestedClock !== time) {
    throw new RangeError("qimen_notification_engine_instant_mismatch");
  }
  options.signal?.throwIfAborted();
  const request = {
    datetime: requestedInstant.toISOString(), timezone, instant: requestedInstant.toISOString(),
    latitude, longitude, profile_id: ENGINE_PROFILE_ID, purpose: PURPOSE,
    system_type: "hour", skip_save: true, source_endpoint: "mobile-notification",
  };
  let result;
  if (typeof options.calculateImpl === "function") {
    result = { data: await options.calculateImpl(request, { signal: options.signal }) };
  } else {
    const fetchImpl = options.fetchImpl || fetch;
    const baseUrl = String(options.baseUrl || process.env.QIMEN_API_URL || "http://127.0.0.1:4090").replace(/\/+$/u, "");
    const timeout = AbortSignal.timeout(8_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await fetchImpl(`${baseUrl}/api/qimen/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "hourkey-mobile-notification/1.0" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response?.ok) throw new Error(`qimen_notification_engine_http_${Number(response?.status) || 0}`);
    result = await response.json();
  }
  options.signal?.throwIfAborted();
  const engineInputAt = new Date(normalizedResult(result)?.calculation?.input_datetime);
  if (!Number.isFinite(engineInputAt.valueOf())
    || Math.abs(engineInputAt.valueOf() - requestedInstant.valueOf()) > 1_500) {
    throw new RangeError("qimen_notification_engine_instant_mismatch");
  }
  const advisory = buildQimenAdvisory(result, { timezone, longitude, purpose: PURPOSE });
  if (advisory && Math.abs(new Date(advisory.inputAt).valueOf() - requestedInstant.valueOf()) > 1_500) {
    throw new RangeError("qimen_notification_engine_instant_mismatch");
  }
  return Object.freeze({ advisory, result: normalizedResult(result) });
}

async function fetchCanonicalQimenAdvisory(input, options = {}) {
  const snapshot = await fetchCanonicalQimenEngineSnapshot(input, options);
  return snapshot.advisory;
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
    DOOR_VIGOR_XIU: { th: "ประตูอยู่ภาวะ休", en: "gate qi is resting 休", zh: "門氣休" },
    STAR_VIGOR_QIU: { th: "ดาวอยู่ภาวะ囚", en: "star qi is imprisoned 囚", zh: "星氣囚" },
    STAR_VIGOR_SI: { th: "ดาวอยู่ภาวะ死", en: "star qi is dead 死", zh: "星氣死" },
    STAR_VIGOR_XIU: { th: "ดาวอยู่ภาวะ休", en: "star qi is resting 休", zh: "星氣休" },
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
  const clear = advisory.recommendation === "recommended" && advisory.decisionClass === "clear";
  const conditional = advisory.recommendation === "recommended" && advisory.decisionClass === "conditional";
  if (locale === "zh") return clear ? {
    title: "🧭 奇門時盤 · 出行方位",
    body: `${period} · ${advisory.direction.zh} · ${componentNames} · 系統出行分 ${advisory.score}/100 · 點開查看完整時盤；不保證結果`,
  } : conditional ? {
    title: "🟠 奇門時盤 · 條件可用出行方位",
    body: `${period} · 出行${advisory.direction.zh} · ${componentNames} · 條件 ${warnings || advisory.readingCode} · 點開查看完整時盤`,
  } : {
    title: "⚠️ 奇門時盤 · 暫無明確推薦方位",
    body: `${period} · 最高候選 ${advisory.direction.zh} · ${componentNames} · 注意 ${warnings || "格局條件"} · 點開查看完整時盤`,
  };
  if (locale === "en") return clear ? {
    title: "🧭 Qimen hour chart · travel direction",
    body: `${period} · ${advisory.direction.en} · ${componentNames} · system travel score ${advisory.score}/100 · Open the full hour chart; outcomes are not guaranteed`,
  } : conditional ? {
    title: "🟠 Qimen hour chart · conditional travel direction",
    body: `${period} · travel ${advisory.direction.en} · ${componentNames} · Conditions ${warnings || advisory.readingCode} · Open the full hour chart`,
  } : {
    title: "⚠️ Qimen hour chart · no clear travel direction",
    body: `${period} · top candidate ${advisory.direction.en} · ${componentNames} · Caution ${warnings || "chart conditions"} · Open the full hour chart`,
  };
  return clear ? {
    title: "🧭 ผังฉีเหมินยาม · ทิศเดินทาง",
    body: `${period} · ${advisory.direction.th} · ${componentNames} · คะแนนระบบด้านการเดินทาง ${advisory.score}/100 · เปิดดูผังยามเต็ม ผลลัพธ์ไม่รับประกัน`,
  } : conditional ? {
    title: "🟠 ผังฉีเหมินยาม · ทิศเดินทางแบบมีเงื่อนไข",
    body: `${period} · การเดินทาง ${advisory.direction.th} · ${componentNames} · เงื่อนไข ${warnings || advisory.readingCode} · เปิดดูผังยามเต็ม`,
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
  const clear = advisory.recommendation === "recommended" && advisory.decisionClass === "clear";
  const conditional = advisory.recommendation === "recommended" && advisory.decisionClass === "conditional";
  if (locale === "zh") return clear
    ? `\n🧭 奇門出行 ${period}: ${advisory.direction.zh} · ${componentNames}`
    : conditional ? `\n🟠 奇門出行 ${period}: 條件可用 ${advisory.direction.zh} · ${componentNames} · ${warnings || advisory.readingCode}`
    : `\n⚠️ 奇門 ${period}: 暫無明確推薦 · 候選${advisory.direction.zh} · ${componentNames} · ${warnings || "需看局"}`;
  if (locale === "en") return clear
    ? `\n🧭 Qimen travel ${period}: ${advisory.direction.en} · ${componentNames}`
    : conditional ? `\n🟠 Qimen travel ${period}: conditional ${advisory.direction.en} · ${componentNames} · ${warnings || advisory.readingCode}`
    : `\n⚠️ Qimen ${period}: no clear travel direction · candidate ${advisory.direction.en} · ${componentNames} · ${warnings || "check chart"}`;
  return clear
    ? `\n🧭 ฉีเหมินด้านการเดินทาง ${period}: ${advisory.direction.th} · ${componentNames}`
    : conditional ? `\n🟠 ฉีเหมินเดินทาง ${period}: มีเงื่อนไข ${advisory.direction.th} · ${componentNames} · ${warnings || advisory.readingCode}`
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
    decisionClass: advisory.decisionClass,
    palaceId: advisory.palaceId,
    direction: advisory.direction.code,
    score: advisory.score,
    deity: advisory.deity,
    door: advisory.door,
    star: advisory.star,
    warningCodes: advisory.warningCodes,
    canonicalWarningCodes: advisory.canonicalWarningCodes,
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
  ENGINE_CONTRACT_VERSION,
  ENGINE_SOURCE_SHA256,
  PURPOSE,
  QIMEN_PLAN_CAPS,
  buildQimenAdvisory,
  buildQimenStandaloneCopy,
  buildQimenYamLine,
  apparentSolarCoordinate,
  civilInstant,
  civilRangeWindow,
  earliestExpiry,
  fetchCanonicalQimenAdvisory,
  fetchCanonicalQimenEngineSnapshot,
  qimenNotificationEntitlement,
  qimenSourceFacts,
  trueSolarShichenWindow,
  trueSolarDayWindow,
};
