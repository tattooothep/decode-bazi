import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SYNTHETIC_REPLY = "Synthetic fixture response.";

function readAuditedWireSource(filename) {
  return JSON.parse(readFileSync(new URL(`../data/${filename}`, import.meta.url), "utf8"));
}

const AUDITED_TODAY_WIRE = readAuditedWireSource("mobile-r515-today-wire.json");
const AUDITED_CALENDAR_META = readAuditedWireSource("mobile-r515-calendar-meta.json");
const AUDITED_CALENDAR_DAYS = Object.freeze([
  ...readAuditedWireSource("mobile-r515-calendar-days-01-10.json"),
  ...readAuditedWireSource("mobile-r515-calendar-days-11-20.json"),
  ...readAuditedWireSource("mobile-r515-calendar-days-21-31.json"),
]);
const AUDITED_QIMEN_NETWORK_WIRE = readAuditedWireSource("mobile-r515-qimen-network-wire.json");

const JSON_CONTENT_TYPE = "application/json";
const DEFAULT_RETAINED = Object.freeze(["contract-envelope", "structured-science", "entitlement-state"]);
const DEFAULT_REMOVED = Object.freeze(["authentication", "identity", "private-free-text", "exact-location"]);

function fixtureSpec(key, family, filename, method, endpoint, requiredPointers, options = {}) {
  return Object.freeze({
    key,
    family,
    filename,
    method,
    endpoint,
    aliases: Object.freeze((options.aliases || []).map((alias) => Object.freeze({
      endpoint: alias.endpoint,
      method: alias.method,
    }))),
    variant: options.variant || "default",
    syntheticPlan: options.syntheticPlan || "plan-neutral",
    status: options.status || 200,
    contentType: options.contentType || JSON_CONTENT_TYPE,
    cacheControl: options.cacheControl || "no-store, max-age=0",
    requiredPointers: Object.freeze([...requiredPointers]),
    retainedClasses: Object.freeze([...(options.retainedClasses || DEFAULT_RETAINED)]),
    removedClasses: Object.freeze([...(options.removedClasses || DEFAULT_REMOVED)]),
  });
}

export const FIXTURE_SPECS = Object.freeze([
  fixtureSpec("today", "today", "today.sanitized.json", "GET|POST", "/api/mobile/v1/today", ["/ok", "/date", "/pillars/day", "/verdict/score", "/tongshu/yi"], { syntheticPlan: "premium" }),
  fixtureSpec("todayHours", "hours", "today-hours.sanitized.json", "GET|POST", "/api/mobile/v1/today/hours", ["/ok", "/date", "/hours/0/branch", "/hours/11/branch"], { syntheticPlan: "premium" }),
  fixtureSpec("todayDirections", "directions", "today-directions.sanitized.json", "GET|POST", "/api/mobile/v1/today/directions", ["/ok", "/date", "/directions/0/direction", "/directions/7/direction", "/direction_energy/scores"], { syntheticPlan: "premium" }),
  fixtureSpec("todayGoals", "goals", "today-goals.sanitized.json", "GET", "/api/mobile/v1/today/goals", ["/ok", "/date", "/goals/wealth", "/goals/travel", "/intent_status"], { syntheticPlan: "premium" }),
  fixtureSpec("chart", "chart", "chart.sanitized.json", "GET|POST", "/api/mobile/v1/chart", ["/ok", "/pillars/day/stem", "/dayMaster", "/strength/percent", "/analysis/ge_ju", "/analysis/element_counts", "/entitlement/plan", "/request_context/profile_source"], { aliases: [{ method: "GET", endpoint: "/api/mobile/v1/chart/[id]" }], syntheticPlan: "premium" }),
  fixtureSpec("calendar", "calendar", "calendar.sanitized.json", "GET|POST", "/api/mobile/v1/calendar", ["/ok", "/year", "/month", "/days/0/date", "/days/0/goals", "/days/0/intentStatus", "/entitlement/allowed_intents"], { syntheticPlan: "premium" }),
  fixtureSpec("network", "network", "network.sanitized.json", "GET", "/api/mobile/v1/network", ["/ok", "/date", "/count", "/people"], { syntheticPlan: "premium" }),
  fixtureSpec("networkSifu", "network", "network-sifu.sanitized.json", "POST", "/api/mobile/v1/network/sifu", ["/ok", "/reply", "/mode"], { syntheticPlan: "premium" }),
  fixtureSpec("networkBulk", "network", "network-bulk.sanitized.json", "POST", "/api/mobile/v1/network/bulk", ["/ok", "/count", "/people"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("qimenBasic", "qimen", "qimen-basic.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/source", "/input/school", "/product/qimen/detail", "/request_context/location_source", "/data/palaces/8/palace_id"], { variant: "free-basic", syntheticPlan: "free-post-trial" }),
  fixtureSpec("qimenProfessional", "qimen", "qimen-professional.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/source", "/input/school", "/product/qimen/detail", "/request_context/location_source", "/data/palaces/8/advanced_qimen_layers"], { variant: "master-technical", syntheticPlan: "master" }),
  fixtureSpec("qimenSearch", "qimen", "qimen-search.sanitized.json", "POST", "/api/mobile/v1/qimen/search", ["/ok", "/mode", "/dateFrom", "/dateTo", "/top", "/request_context/date_from", "/request_context/date_to", "/request_context/mode"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("qimenSifu", "qimen", "qimen-sifu.sanitized.json", "POST", "/api/mobile/v1/qimen/sifu", ["/ok", "/reply"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("datepick", "datepick", "datepick.sanitized.json", "POST", "/api/mobile/v1/datepick", ["/ok", "/source", "/people_ids", "/candidates/0/datetime/start", "/candidates/0/scoring/finalScore", "/funnelStats"], { syntheticPlan: "premium" }),
  fixtureSpec("datepickSave", "datepick", "datepick-save.sanitized.json", "POST", "/api/mobile/v1/datepick/save", ["/ok", "/saved_date/id", "/saved_date/datetime/start"], { status: 201 }),
  fixtureSpec("datepickSaved", "datepick", "datepick-saved.sanitized.json", "GET", "/api/mobile/v1/datepick/saved", ["/ok", "/count", "/saved_dates/0/id"]),
  fixtureSpec("datepickDelete", "datepick", "datepick-delete.sanitized.json", "DELETE", "/api/mobile/v1/datepick/saved/[id]", ["/ok", "/deleted", "/id"]),
  fixtureSpec("luopanRings", "luopan", "luopan-rings.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/degree", "/mountain/code", "/sections/hex64"], { variant: "free-locked", cacheControl: "private, max-age=300", syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanBootstrap", "luopan", "luopan-bootstrap.sanitized.json", "GET", "/api/mobile/v1/luopan/bootstrap", ["/ok", "/ring_reference/mountains_24/0/code", "/ring_reference/mountains_24/23/code", "/entitlement/plan"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanRingsW4", "luopan", "luopan-rings-w4.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/hex64/id", "/fenjin120/index", "/yao384/id"], { variant: "master-open", cacheControl: "private, max-age=300", syntheticPlan: "master" }),
  fixtureSpec("luopanAnalysis", "luopan", "luopan-analysis.sanitized.json", "POST", "/api/mobile/v1/luopan/analysis", ["/ok", "/measurement/pass", "/core/facing", "/core/sitting", "/core/three_plates", "/core/tigua", "/core/xuan_kong", "/core/pin_warnings"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanSnapshot", "luopan", "luopan-snapshot.sanitized.json", "GET", "/api/mobile/v1/luopan/snapshot", ["/ok", "/datetime/gregorian", "/layers/flying_stars/palaces"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanMeasurementsGet", "luopan", "luopan-measurements-get.sanitized.json", "GET", "/api/mobile/v1/luopan/measurements", ["/ok", "/rows/0/id", "/rows/0/heading_deg"], { syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanMeasurementsPost", "luopan", "luopan-measurements-post.sanitized.json", "POST", "/api/mobile/v1/luopan/measurements", ["/ok", "/measurement/id", "/gate/pass"], { status: 201, syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanSifu", "luopan", "luopan-sifu.sanitized.json", "POST", "/api/mobile/v1/luopan/sifu", ["/ok", "/reply"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("luopanVision", "luopan", "luopan-vision.sanitized.json", "POST", "/api/mobile/v1/luopan/vision", ["/ok", "/reply", "/cost_yam"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("sifuChat", "sifu", "sifu-chat.sanitized.json", "POST", "/api/mobile/v1/sifu/chat", ["/ok", "/reply", "/source"], { variant: "json" }),
  fixtureSpec("sifuChatStream", "sifu", "sifu-chat-stream.sanitized.json", "POST", "/api/mobile/v1/sifu/chat?stream=1", ["/ok", "/events/0/event", "/events/3/event", "/events/3/data/chars"], { variant: "sse-projection", contentType: "text/event-stream; charset=utf-8", cacheControl: "no-cache, no-store, max-age=0, must-revalidate" }),
  fixtureSpec("sifuHistory", "sifu", "sifu-history.sanitized.json", "GET", "/api/mobile/v1/sifu/history", ["/ok", "/history/0/question", "/history/0/answer", "/history/0/request_payload", "/history/0/response_meta"]),
  fixtureSpec("sifuGroup", "sifu", "sifu-group.sanitized.json", "POST", "/api/mobile/v1/sifu/group", ["/ok", "/reply", "/spent", "/balance_after", "/source"]),
]);

const SPEC_BY_KEY = new Map(FIXTURE_SPECS.map((spec) => [spec.key, spec]));
const FIXTURE_DATE = "2026-07-14";
const SAVED_DATE_ID = "00000000-0000-4000-8000-000000000001";
const MEASUREMENT_ID = "00000000-0000-4000-8000-000000000002";

const PLAN_CAPS = Object.freeze({
  free: Object.freeze({
    qimen: Object.freeze({ time_window_days: 0, hours_per_day: 1, detail: "basic", search_days: 0, search_results: 0, compare_locations: false, sifu: false }),
    luopan: Object.freeze({ mode: "core", pins: "basic", vision: false, vision_limit: 0, vision_period: "none", sifu: false }),
  }),
  premium: Object.freeze({
    today: Object.freeze({ day_window: 30, detailed_hours: 12, directions: 8, goals: "all", multi_profile: false }),
    qimen: Object.freeze({ time_window_days: 90, hours_per_day: 12, detail: "pro", search_days: 7, search_results: 10, compare_locations: false, sifu: true }),
    luopan: Object.freeze({ mode: "pro", pins: "full", vision: true, vision_limit: 10, vision_period: "day", sifu: true }),
  }),
  master: Object.freeze({
    today: Object.freeze({ day_window: 365, detailed_hours: 12, directions: 8, goals: "technical", multi_profile: true }),
    network: Object.freeze({ saved_profiles: 100, visualization_profiles: 30, groups: 20, group_people: 30, pair_compare: "full", team_analysis: true, team_people: 12, pair_ai: "full", team_ai: true, bulk_ai: true }),
    qimen: Object.freeze({ time_window_days: 365, hours_per_day: 12, detail: "technical", search_days: 30, search_results: 30, compare_locations: true, sifu: true }),
    fengshui: Object.freeze({ houses: 999, layers: "professional", multi_profile: true }),
    luopan: Object.freeze({ mode: "full", pins: "full", vision: true, vision_limit: 10, vision_period: "day", sifu: true }),
  }),
});

const GOALS = Object.freeze({ wealth: 72, career: 68, love: 64, health: 76, family: 70, travel: 66 });
const INTENT_STATUS = Object.freeze({ wealth: "good", career: "good", love: "neutral", health: "good", family: "good", travel: "neutral" });
const CALENDAR_INTENT_IDS = Object.freeze([
  "start_work", "sign_contract", "open_business", "negotiate", "invest", "loan",
  "marriage", "engagement", "gathering", "move_house", "construct", "renovate",
  "install_bed", "travel", "pray_heal", "medical",
]);
const CALENDAR_INTENT_STATUS = Object.freeze(Object.fromEntries(
  CALENDAR_INTENT_IDS.map((id, index) => [id, index % 5 === 0 ? "bad" : index % 3 === 0 ? "neutral" : "good"]),
));
const DATEPICK_MODULES = Object.freeze([
  "ba_zi", "ze_ri", "dong_gong", "tai_sui", "qi_men", "tian_xing",
  "moon_void", "moon_sign", "retro_window", "eclipse_zone", "rahu_kalam",
  "panchanga", "yong_shen", "tara_bala", "twelve_officers", "twenty_eight",
  "twelve_spirits", "nine_stars", "he_luo", "hex64",
]);
const CALENDAR_SCIENCE = Object.freeze([
  ["2026-07-01", "丙子", "破", "金匱", "箕", 6, "農曆丙午年五月十七"],
  ["2026-07-02", "丁丑", "危", "天德", "斗", 5, "農曆丙午年五月十八"],
  ["2026-07-03", "戊寅", "成", "白虎", "牛", 4, "農曆丙午年五月十九"],
  ["2026-07-04", "己卯", "收", "玉堂", "女", 3, "農曆丙午年五月二十"],
  ["2026-07-05", "庚辰", "開", "天牢", "虛", 2, "農曆丙午年五月廿一"],
  ["2026-07-06", "辛巳", "閉", "玄武", "危", 1, "農曆丙午年五月廿二"],
  ["2026-07-07", "壬午", "閉", "天牢", "室", 9, "農曆丙午年五月廿三"],
  ["2026-07-08", "癸未", "建", "玄武", "壁", 8, "農曆丙午年五月廿四"],
  ["2026-07-09", "甲申", "除", "司命", "奎", 7, "農曆丙午年五月廿五"],
  ["2026-07-10", "乙酉", "滿", "勾陳", "婁", 6, "農曆丙午年五月廿六"],
  ["2026-07-11", "丙戌", "平", "青龍", "胃", 5, "農曆丙午年五月廿七"],
  ["2026-07-12", "丁亥", "定", "明堂", "昴", 4, "農曆丙午年五月廿八"],
  ["2026-07-13", "戊子", "執", "天刑", "畢", 3, "農曆丙午年五月廿九"],
  ["2026-07-14", "己丑", "破", "朱雀", "觜", 2, "農曆丙午年六月初一"],
  ["2026-07-15", "庚寅", "危", "金匱", "參", 1, "農曆丙午年六月初二"],
  ["2026-07-16", "辛卯", "成", "天德", "井", 9, "農曆丙午年六月初三"],
  ["2026-07-17", "壬辰", "收", "白虎", "鬼", 8, "農曆丙午年六月初四"],
  ["2026-07-18", "癸巳", "開", "玉堂", "柳", 7, "農曆丙午年六月初五"],
  ["2026-07-19", "甲午", "閉", "天牢", "星", 6, "農曆丙午年六月初六"],
  ["2026-07-20", "乙未", "建", "玄武", "張", 5, "農曆丙午年六月初七"],
  ["2026-07-21", "丙申", "除", "司命", "翼", 4, "農曆丙午年六月初八"],
  ["2026-07-22", "丁酉", "滿", "勾陳", "軫", 3, "農曆丙午年六月初九"],
  ["2026-07-23", "戊戌", "平", "青龍", "角", 2, "農曆丙午年六月初十"],
  ["2026-07-24", "己亥", "定", "明堂", "亢", 1, "農曆丙午年六月十一"],
  ["2026-07-25", "庚子", "執", "天刑", "氐", 9, "農曆丙午年六月十二"],
  ["2026-07-26", "辛丑", "破", "朱雀", "房", 8, "農曆丙午年六月十三"],
  ["2026-07-27", "壬寅", "危", "金匱", "心", 7, "農曆丙午年六月十四"],
  ["2026-07-28", "癸卯", "成", "天德", "尾", 6, "農曆丙午年六月十五"],
  ["2026-07-29", "甲辰", "收", "白虎", "箕", 5, "農曆丙午年六月十六"],
  ["2026-07-30", "乙巳", "開", "玉堂", "斗", 4, "農曆丙午年六月十七"],
  ["2026-07-31", "丙午", "閉", "天牢", "牛", 3, "農曆丙午年六月十八"],
]);
const BRANCHES = Object.freeze(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const MOUNTAINS_24 = Object.freeze([
  { name: "壬", code: "N1", type: "干", element: "water", elementZh: "水", trigram: "坎", yuan: "地元", yinYang: "陽", startDeg: 337.5, endDeg: 352.5, centerDeg: 345, dir8: "N" },
  { name: "子", code: "N2", type: "支", element: "water", elementZh: "水", trigram: "坎", yuan: "天元", yinYang: "陰", startDeg: 352.5, endDeg: 7.5, centerDeg: 0, dir8: "N" },
  { name: "癸", code: "N3", type: "干", element: "water", elementZh: "水", trigram: "坎", yuan: "人元", yinYang: "陰", startDeg: 7.5, endDeg: 22.5, centerDeg: 15, dir8: "N" },
  { name: "丑", code: "NE1", type: "支", element: "earth", elementZh: "土", trigram: "艮", yuan: "地元", yinYang: "陰", startDeg: 22.5, endDeg: 37.5, centerDeg: 30, dir8: "NE" },
  { name: "艮", code: "NE2", type: "卦", element: "earth", elementZh: "土", trigram: "艮", yuan: "天元", yinYang: "陽", startDeg: 37.5, endDeg: 52.5, centerDeg: 45, dir8: "NE" },
  { name: "寅", code: "NE3", type: "支", element: "wood", elementZh: "木", trigram: "艮", yuan: "人元", yinYang: "陽", startDeg: 52.5, endDeg: 67.5, centerDeg: 60, dir8: "NE" },
  { name: "甲", code: "E1", type: "干", element: "wood", elementZh: "木", trigram: "震", yuan: "地元", yinYang: "陽", startDeg: 67.5, endDeg: 82.5, centerDeg: 75, dir8: "E" },
  { name: "卯", code: "E2", type: "支", element: "wood", elementZh: "木", trigram: "震", yuan: "天元", yinYang: "陰", startDeg: 82.5, endDeg: 97.5, centerDeg: 90, dir8: "E" },
  { name: "乙", code: "E3", type: "干", element: "wood", elementZh: "木", trigram: "震", yuan: "人元", yinYang: "陰", startDeg: 97.5, endDeg: 112.5, centerDeg: 105, dir8: "E" },
  { name: "辰", code: "SE1", type: "支", element: "earth", elementZh: "土", trigram: "巽", yuan: "地元", yinYang: "陰", startDeg: 112.5, endDeg: 127.5, centerDeg: 120, dir8: "SE" },
  { name: "巽", code: "SE2", type: "卦", element: "wood", elementZh: "木", trigram: "巽", yuan: "天元", yinYang: "陽", startDeg: 127.5, endDeg: 142.5, centerDeg: 135, dir8: "SE" },
  { name: "巳", code: "SE3", type: "支", element: "fire", elementZh: "火", trigram: "巽", yuan: "人元", yinYang: "陽", startDeg: 142.5, endDeg: 157.5, centerDeg: 150, dir8: "SE" },
  { name: "丙", code: "S1", type: "干", element: "fire", elementZh: "火", trigram: "離", yuan: "地元", yinYang: "陽", startDeg: 157.5, endDeg: 172.5, centerDeg: 165, dir8: "S" },
  { name: "午", code: "S2", type: "支", element: "fire", elementZh: "火", trigram: "離", yuan: "天元", yinYang: "陰", startDeg: 172.5, endDeg: 187.5, centerDeg: 180, dir8: "S" },
  { name: "丁", code: "S3", type: "干", element: "fire", elementZh: "火", trigram: "離", yuan: "人元", yinYang: "陰", startDeg: 187.5, endDeg: 202.5, centerDeg: 195, dir8: "S" },
  { name: "未", code: "SW1", type: "支", element: "earth", elementZh: "土", trigram: "坤", yuan: "地元", yinYang: "陰", startDeg: 202.5, endDeg: 217.5, centerDeg: 210, dir8: "SW" },
  { name: "坤", code: "SW2", type: "卦", element: "earth", elementZh: "土", trigram: "坤", yuan: "天元", yinYang: "陽", startDeg: 217.5, endDeg: 232.5, centerDeg: 225, dir8: "SW" },
  { name: "申", code: "SW3", type: "支", element: "metal", elementZh: "金", trigram: "坤", yuan: "人元", yinYang: "陽", startDeg: 232.5, endDeg: 247.5, centerDeg: 240, dir8: "SW" },
  { name: "庚", code: "W1", type: "干", element: "metal", elementZh: "金", trigram: "兌", yuan: "地元", yinYang: "陽", startDeg: 247.5, endDeg: 262.5, centerDeg: 255, dir8: "W" },
  { name: "酉", code: "W2", type: "支", element: "metal", elementZh: "金", trigram: "兌", yuan: "天元", yinYang: "陰", startDeg: 262.5, endDeg: 277.5, centerDeg: 270, dir8: "W" },
  { name: "辛", code: "W3", type: "干", element: "metal", elementZh: "金", trigram: "兌", yuan: "人元", yinYang: "陰", startDeg: 277.5, endDeg: 292.5, centerDeg: 285, dir8: "W" },
  { name: "戌", code: "NW1", type: "支", element: "earth", elementZh: "土", trigram: "乾", yuan: "地元", yinYang: "陰", startDeg: 292.5, endDeg: 307.5, centerDeg: 300, dir8: "NW" },
  { name: "乾", code: "NW2", type: "卦", element: "metal", elementZh: "金", trigram: "乾", yuan: "天元", yinYang: "陽", startDeg: 307.5, endDeg: 322.5, centerDeg: 315, dir8: "NW" },
  { name: "亥", code: "NW3", type: "支", element: "water", elementZh: "水", trigram: "乾", yuan: "人元", yinYang: "陽", startDeg: 322.5, endDeg: 337.5, centerDeg: 330, dir8: "NW" },
].map((row, index) => Object.freeze({ index, ...row })));
const QIMEN_PALACES = Object.freeze([
  { palace_id: 4, direction: "SE", trigram_zh: "巽", grid_row: 1, grid_col: 1, star_code: "TIAN_REN", star_zh: "天任", door_code: "SI_MEN", door_zh: "死門", deity_code: "BAI_HU", deity_zh: "白虎", earth_stem_zh: "己", heaven_stem_zh: "丁", is_void_any: false, is_traveling_horse: false, advanced: ["TARGET_PALACE", "PALACE_GEJU"] },
  { palace_id: 9, direction: "S", trigram_zh: "離", grid_row: 1, grid_col: 2, star_code: "TIAN_CHONG", star_zh: "天沖", door_code: "JING_FEAR_MEN", door_zh: "驚門", deity_code: "LIU_HE", deity_zh: "六合", earth_stem_zh: "癸", heaven_stem_zh: "庚", is_void_any: false, is_traveling_horse: false, advanced: ["PALACE_GEJU"] },
  { palace_id: 2, direction: "SW", trigram_zh: "坤", grid_row: 1, grid_col: 3, star_code: "TIAN_FU", star_zh: "天輔", door_code: "KAI_MEN", door_zh: "開門", deity_code: "TAI_YIN", deity_zh: "太陰", earth_stem_zh: "辛", heaven_stem_zh: "己", is_void_any: true, is_traveling_horse: false, advanced: ["TARGET_PALACE", "PALACE_GEJU"] },
  { palace_id: 3, direction: "E", trigram_zh: "震", grid_row: 2, grid_col: 1, star_code: "TIAN_PENG", star_zh: "天蓬", door_code: "JING_VIEW_MEN", door_zh: "景門", deity_code: "XUAN_WU", deity_zh: "玄武", earth_stem_zh: "庚", heaven_stem_zh: "壬", is_void_any: true, is_traveling_horse: false, advanced: ["PALACE_GEJU"] },
  { palace_id: 5, direction: "C", trigram_zh: "中", grid_row: 2, grid_col: 2, star_code: "TIAN_QIN", star_zh: "天禽", door_code: "DU_MEN", door_zh: "杜門", deity_code: "ZHI_FU", deity_zh: "值符", earth_stem_zh: "戊", heaven_stem_zh: null, is_void_any: false, is_traveling_horse: false, advanced: ["PALACE_GEJU"] },
  { palace_id: 7, direction: "W", trigram_zh: "兌", grid_row: 2, grid_col: 3, star_code: "TIAN_YING", star_zh: "天英", door_code: "XIU_MEN", door_zh: "休門", deity_code: "TENG_SHE", deity_zh: "螣蛇", earth_stem_zh: "丙", heaven_stem_zh: "癸", is_void_any: true, is_traveling_horse: false, advanced: ["PALACE_GEJU"] },
  { palace_id: 8, direction: "NE", trigram_zh: "艮", grid_row: 3, grid_col: 1, star_code: "TIAN_XIN", star_zh: "天心", door_code: "DU_MEN", door_zh: "杜門", deity_code: "JIU_DI", deity_zh: "九地", earth_stem_zh: "丁", heaven_stem_zh: "乙", is_void_any: true, is_traveling_horse: false, advanced: ["PALACE_GEJU"] },
  { palace_id: 1, direction: "N", trigram_zh: "坎", grid_row: 3, grid_col: 2, star_code: "TIAN_ZHU", star_zh: "天柱", door_code: "SHANG_MEN", door_zh: "傷門", deity_code: "JIU_TIAN", deity_zh: "九天", earth_stem_zh: "壬", heaven_stem_zh: "丙", is_void_any: false, is_traveling_horse: false, advanced: ["SAN_SHENG_COMPONENT", "PALACE_GEJU"] },
  { palace_id: 6, direction: "NW", trigram_zh: "乾", grid_row: 3, grid_col: 3, star_code: "TIAN_RUI", star_zh: "天芮", door_code: "SHENG_MEN", door_zh: "生門", deity_code: "ZHI_FU", deity_zh: "值符", earth_stem_zh: "乙", heaven_stem_zh: "辛", is_void_any: true, is_traveling_horse: true, advanced: ["SAN_SHENG_COMPONENT", "TIAN_YI_ZHI_FU", "TARGET_PALACE", "PALACE_GEJU"] },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function qimenContext(systemType = "hour") {
  return {
    date: FIXTURE_DATE,
    latitude: 0,
    location_source: "mobile_explicit",
    longitude: 0,
    school: "chaibu",
    system_type: systemType,
    time: "09:00",
  };
}

function qimenPalaces(professional) {
  return QIMEN_PALACES.map((meta) => {
    const palace = {
    advanced_qimen_layers: professional ? meta.advanced.map((code) => ({ active: true, code })) : [],
    beginner_reading: {
      code: `fixture-reading-${meta.palace_id}`,
      has_engine_score: true,
      is_actionable: true,
      label_th: `วังตัวอย่าง ${meta.palace_id}`,
      no_score_mutation: true,
      summary_th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา",
      verdict_allowed: true,
    },
    deity_code: meta.deity_code,
    deity_name_th: meta.deity_zh ? `เทพตัวอย่าง ${meta.palace_id}` : null,
    deity_zh: meta.deity_zh,
    direction: meta.direction,
    display_level: meta.door_code === "SHENG_MEN" || meta.door_code === "KAI_MEN" ? "good" : "neutral",
    display_score: meta.door_code === "SHENG_MEN" ? 76 : meta.door_code === "KAI_MEN" ? 72 : 52,
    door_action_advice_th: "ใช้ตรวจรูปแบบข้อมูลเท่านั้น",
    door_code: meta.door_code,
    door_name_th: meta.door_zh ? `ประตูตัวอย่าง ${meta.palace_id}` : null,
    door_quality: meta.door_code === "SHENG_MEN" || meta.door_code === "KAI_MEN" ? "good" : "neutral",
    door_zh: meta.door_zh,
    earth_stem_zh: meta.earth_stem_zh,
    grid_col: meta.grid_col,
    grid_row: meta.grid_row,
    heaven_stem_zh: meta.heaven_stem_zh,
    is_traveling_horse: meta.is_traveling_horse,
    is_void_any: meta.is_void_any,
    palace_id: meta.palace_id,
    star_code: meta.star_code,
    star_name_th: `ดาวตัวอย่าง ${meta.palace_id}`,
    star_zh: meta.star_zh,
    trigram_zh: meta.trigram_zh,
    };
    if (professional) return palace;
    const {
      advanced_qimen_layers: _advanced,
      beginner_reading: _beginner,
      door_action_advice_th: _advice,
      ...basic
    } = palace;
    return basic;
  });
}

function qimenFixture(plan) {
  const professional = plan === "master";
  const caps = PLAN_CAPS[plan].qimen;
  const audited = professional
    ? AUDITED_QIMEN_NETWORK_WIRE.qimen.professional
    : AUDITED_QIMEN_NETWORK_WIRE.qimen.basic;
  return {
    data: professional
      ? {
          calculation: clone(audited.calculation),
          chart: clone(audited.chart),
          palaces: clone(audited.palaces),
        }
      : {
          chart: clone(audited.chart),
          palaces: clone(audited.palaces),
        },
    input: { date: FIXTURE_DATE, lat: 0, lng: 0, school: "chaibu", system_type: "hour", time: "09:00" },
    ok: true,
    product: {
      plan,
      qimen: clone(caps),
    },
    request_context: clone(AUDITED_QIMEN_NETWORK_WIRE.qimen.request_context),
    source: "qimen-api",
  };
}

function hourRows() {
  const ranges = [
    "23:00-01:00", "01:00-03:00", "03:00-05:00", "05:00-07:00",
    "07:00-09:00", "09:00-11:00", "11:00-13:00", "13:00-15:00",
    "15:00-17:00", "17:00-19:00", "19:00-21:00", "21:00-23:00",
  ];
  const names = [
    "ชวด · ดึก", "ฉลู · ดึกมาก", "ขาล · ก่อนรุ่ง", "เถาะ · รุ่งเช้า",
    "มะโรง · เช้า", "มะเส็ง · สาย", "มะเมีย · เที่ยง", "มะแม · บ่าย",
    "วอก · บ่าย-เย็น", "ระกา · เย็น", "จอ · ค่ำ", "กุน · ดึก-ต้น",
  ];
  // The deployed mobile wrapper currently omits profileId when it calls the
  // shared Today Hours route.  That route therefore emits the generic
  // day/hour layer: 六合 boosts 子, 六沖 blocks 未, and every other hour stays
  // neutral for the fixed 己丑 fixture date.
  const qualities = ["good", "ok", "ok", "ok", "ok", "ok", "ok", "bad", "ok", "ok", "ok", "ok"];
  const labels = { best: "ดีมาก", good: "ดี", ok: "กลาง", bad: "ห้าม" };
  const labelsEn = { best: "best", good: "good", ok: "neutral", bad: "avoid" };
  const labelsZh = { best: "大吉", good: "吉", ok: "中", bad: "忌" };
  const elements = ["water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water"];
  const elementTh = { water: "น้ำ", earth: "ดิน", wood: "ไม้", fire: "ไฟ", metal: "ทอง" };
  const elementEn = { water: "Water", earth: "Earth", wood: "Wood", fire: "Fire", metal: "Metal" };
  const elementZh = { water: "水", earth: "土", wood: "木", fire: "火", metal: "金" };
  return BRANCHES.map((branch, index) => {
    const element = elements[index];
    const clashReasons = branch === "子"
      ? ["合丑 · ผสานกิ่งวัน"]
      : branch === "午"
        ? ["害丑 · ทำร้ายกิ่งวัน"]
        : branch === "未"
          ? ["沖丑 · ปะทะกิ่งวัน"]
          : [];
    const suffix = branch === "子"
      ? { th: "จับคู่กับวัน · ลื่นไหล", en: "Combines with day · smooth", zh: "六合 · 順" }
      : branch === "午"
        ? { th: "เบียดวัน · ลดทอนนิดหน่อย", en: "Harm with day · slight reduction", zh: "相害 · 略損" }
        : branch === "未"
          ? { th: "ปะทะวันนี้ · ห้ามทำเรื่องสำคัญ", en: "Clash with today · avoid important", zh: "沖日支(時) · 慎重大事" }
          : null;
    const reasonTh = `${elementTh[element]}ทั่วไป · ใช้ได้ปกติ`;
    const reasonEn = `${elementEn[element]} neutral · usable`;
    const reasonZh = `${elementZh[element]}中性 · 可用`;
    return {
      branch,
      clash_reasons: clashReasons,
      element,
      isNow: false,
      label: labels[qualities[index]],
      label_en: labelsEn[qualities[index]],
      label_zh: labelsZh[qualities[index]],
      locked: false,
      name_th: names[index],
      quality: qualities[index],
      range: ranges[index],
      reason_en: suffix ? `${reasonEn} · ${suffix.en}` : reasonEn,
      reason_th: suffix ? `${reasonTh} · ${suffix.th}` : reasonTh,
      reason_zh: suffix ? `${reasonZh} · ${suffix.zh}` : reasonZh,
      stem: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙"][index],
    };
  });
}

function directionRows() {
  const starMap = {
    N: [{ good: true, han: "陽貴", name: "陽貴" }],
    NE: [{ good: true, han: "喜神", name: "喜神" }],
    E: [],
    SE: [{ good: true, han: "福神", name: "福神" }],
    S: [{ good: true, han: "財神", name: "財神" }],
    SW: [{ good: true, han: "陰貴", name: "陰貴" }],
    W: [],
    NW: [],
  };
  return DIRECTIONS.map((direction, index) => ({
    direction,
    direction_en: ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"][index],
    direction_th: ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"][index],
    direction_th_long: ["ทิศเหนือ", "ทิศตะวันออกเฉียงเหนือ", "ทิศตะวันออก", "ทิศตะวันออกเฉียงใต้", "ทิศใต้", "ทิศตะวันตกเฉียงใต้", "ทิศตะวันตก", "ทิศตะวันตกเฉียงเหนือ"][index],
    direction_zh: ["北", "東北", "東", "東南", "南", "西南", "西", "西北"][index],
    element: ["water", "earth", "wood", "wood", "fire", "earth", "metal", "metal"][index],
    locked: false,
    quality: index === 2 ? "best" : index === 6 ? "avoid" : index % 2 === 0 ? "good" : "ok",
    stars: starMap[direction],
  }));
}

function directionEnergy() {
  const signals = ["++", "0", "++++", "++", "---", "--", "----", "0"];
  return DIRECTIONS.map((direction, index) => ({
    caps: [],
    caps_en: [],
    caps_zh: [],
    direction,
    direction_en: ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"][index],
    direction_th: ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"][index],
    direction_th_long: ["ทิศเหนือ", "ทิศตะวันออกเฉียงเหนือ", "ทิศตะวันออก", "ทิศตะวันออกเฉียงใต้", "ทิศใต้", "ทิศตะวันตกเฉียงใต้", "ทิศตะวันตก", "ทิศตะวันตกเฉียงเหนือ"][index],
    direction_zh: ["北", "東北", "東", "東南", "南", "西南", "西", "西北"][index],
    label: index === 2 ? "best" : index === 6 ? "avoid" : "good",
    locked: false,
    qimen: { score: 60 + index, signal: signals[index] },
    reasons: ["ข้อมูลสังเคราะห์สำหรับตรวจสัญญา"],
    reasons_en: ["Deterministic synthetic science explanation."],
    reasons_zh: ["合成科學說明"],
    score: index === 2 ? 88 : index === 6 ? 32 : 60 + index,
    zibai: { day: null, hour: null, score: 58 + index, signal: signals[(index + 2) % signals.length] },
  }));
}

function mountainRows() {
  return MOUNTAINS_24.map(({ name, code, elementZh, trigram, yuan, yinYang, centerDeg, dir8 }) => ({
    name, code, elementZh, trigram, yuan, yinYang, centerDeg, dir8,
  }));
}

function savedDate() {
  return {
    activityType: "開市",
    candidateId: "fixture-candidate-01",
    created_at: "2026-07-14T02:00:00.000Z",
    datetime: { end: "2026-07-20T11:00:00+07:00", start: "2026-07-20T09:00:00+07:00" },
    id: SAVED_DATE_ID,
    pillars: {
      day: { branch: "未", stem: "乙" },
      hour: { branch: "巳", stem: "辛" },
      month: { branch: "未", stem: "乙" },
      year: { branch: "午", stem: "丙" },
    },
    summary: "Synthetic saved date.",
  };
}

function ringFixture(open) {
  const mountain = clone(MOUNTAINS_24.find((row) => row.name === "巳"));
  return {
    degree: 150,
    entitlement: { mode: open ? "full" : "core", plan: open ? "master" : "free" },
    ...(open ? {
      fenjin120: {
        deg_end: 151.5, deg_start: 148.5, ganzhi: "己巳", index: 57,
        interp_en: "Synthetic scientific interpretation.", interp_th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", interp_zh: "合成科學解讀",
        mountain: "巳", nayin: "大林木", score: 1,
        status: { en: "tortoise-shell void / fire-pit", py: "guī-jiǎ kōng-wáng", th: "กุยกะคงบ๊วง", zh: "龜甲空亡" },
        usable: false,
      },
      hex64: {
        baseHouseScore: 3, homeAdvice: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", homeAdvice_en: "Synthetic scientific guidance.", homeAdvice_zh: "合成科學建議",
        homeUse: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", homeUse_en: "Synthetic scientific use.", homeUse_zh: "合成科學用途",
        id: 9, name: "風天小畜", thaiName: "สะสมเล็ก", thaiName_en: "Small Accumulation", thaiName_zh: "風天小畜",
        tone: "neutral", xkdg: { guaQi: 2, guaYun: 8 },
      },
    } : {}),
    mountain,
    ok: true,
    sections: { fenjin120: open ? "open" : "locked", hex64: open ? "open" : "locked", yao384: open ? "open" : "locked" },
    ...(open ? { yao384: {
      general: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", general_en: "Synthetic scientific interpretation.", general_zh: "合成科學解讀",
      gua: "小畜", hex_num: 9, home: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", home_en: "Synthetic scientific home guidance.", home_zh: "合成科學家居建議",
      id: 55, jixiong: "平", line_type: "yang", pos: "九五", score: 3,
      th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", th_en: "Synthetic scientific line text.", th_zh: "合成科學爻辭", yao_ci: "有孚攣如，富以其鄰。",
    } } : {}),
  };
}

function fullMountain(name) {
  const row = MOUNTAINS_24.find((item) => item.name === name);
  if (!row) throw new Error("fixture_mountain_missing");
  return clone(row);
}

function measurementGate() {
  return {
    boundaryDistanceDeg: 7.5,
    facingMountain: fullMountain("巳"),
    headingDeg: 150,
    nearBoundary: false,
    pass: true,
    reasons: [],
    sittingMountain: fullMountain("亥"),
    uncertaintyDeg: 1,
  };
}

function flightDecision(mountain, inputDeg) {
  return {
    centerDeg: mountain.centerDeg,
    deltaFromCenter: 0,
    inputDeg,
    mode: "下卦",
    mountain: clone(mountain),
    nearBoundary: false,
    reasonTh: "องศาอยู่กลางซาน 9° ใช้ผัง下卦ตามปกติ",
    reasonZh: "正中九度，用下卦",
    school: "full_24",
    trigger: "center",
  };
}

function xuanKongFixture() {
  const facing = fullMountain("巳");
  const sitting = fullMountain("亥");
  const waterFlight = {
    centerStar: 8,
    decision: flightDecision(facing, 150),
    direction: "forward",
    noteTh: "ใช้下卦: ดาวเดิม 8 อ้างอิง 寅 陽 → 順飛",
    noteZh: "下卦 順飛",
    referenceMountain: fullMountain("寅"),
    seedStar: 8,
  };
  const mountainFlight = {
    centerStar: 1,
    decision: flightDecision(sitting, 330),
    direction: "reverse",
    noteTh: "ใช้下卦: ดาวเดิม 1 อ้างอิง 癸 陰 → 逆飛",
    noteZh: "下卦 逆飛",
    referenceMountain: fullMountain("癸"),
    seedStar: 1,
  };
  return {
    base: [5, 6, 7, 8, 9, 1, 2, 3, 4],
    mountain: [5, 4, 3, 2, 1, 9, 8, 7, 6],
    mountain_flight: mountainFlight,
    version: "xuan-kong-chart-v1",
    water: [4, 5, 6, 7, 8, 9, 1, 2, 3],
    water_flight: waterFlight,
  };
}

function snapshotPalaces() {
  const stars = { SE: 9, S: 5, SW: 7, E: 8, C: 1, W: 3, NE: 4, N: 6, NW: 2 };
  const base = {
    1: ["白", "อำนาจ · ปัญญา · ตำแหน่ง", "growing_qi_sheng", "生氣", 4, "ดาวเจริญรุ่งเรืองใกล้", "Near-prosperous growing qi", "water"],
    2: ["黒", "โรค · ห่วย · ระวัง", "future_distant_prosperous", "進氣 / 遠生氣", 3.5, "ดาวรุ่งเรืองไกล", "Distant future prosperity", "earth"],
    3: ["碧", "โต้แย้ง · ฟ้องร้อง", "dead_killing_qi", "死 / 煞氣", 1.5, "ดาวเสียยาม", "Untimely star", "wood"],
    4: ["綠", "การเรียน · เสน่ห์", "dead_killing_qi", "死 / 煞氣", 1.5, "ดาวเสียยาม", "Untimely star", "wood"],
    5: ["黄", "หายนะ · ภัยพิบัติ", "great_killing_sha", "大煞 / 五黃煞 / 正關煞", 1, "ดาวมรณะนิรันดร์", "Perpetual great killer", "earth"],
    6: ["白", "ราชการ · อำนาจ", "dead_qi_three_periods_retired", "死氣", 1.5, "ดาวสิ้นพลัง", "Fully exhausted star", "metal"],
    7: ["赤", "การเงิน(เก่า) · ขโมย(ใหม่)", "dead_qi", "死氣", 1.5, "ดาวโพจวินดับสนิท", "Dead qi star", "metal"],
    8: ["白", "การเงิน(ปัจจุบัน) · มั่งคั่ง", "retreating_just_retired_from_p8", "退氣", 2.5, "ดาว 8 กำลังเสื่อม", "Retreating star", "earth"],
    9: ["紫", "ชื่อเสียง · ความรัก", "current_prosperous_wang", "旺氣", 5, "ดาวรุ่งเรืองปัจจุบัน", "Reigning prosperous star", "fire"],
  };
  return Object.fromEntries(Object.entries(stars).map(([direction, annual]) => {
    const [color, meaning, p9_status, p9_status_zh, p9_score, p9_label_th, p9_label_en, p9_element] = base[annual];
    const quality = p9_score >= 3.5 ? "good" : p9_score <= 1.5 ? "bad" : "neutral";
    return [direction, { annual, color, meaning, p9_element, p9_label_en, p9_label_th, p9_score, p9_status, p9_status_zh, quality }];
  }));
}

function calendarDays() {
  const stemElement = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
  const branchElement = { 子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire", 午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water" };
  return CALENDAR_SCIENCE.map(([date, pillar, officer, spirit, mansion, nineStar, lunar], index) => ({
    branch: pillar[1],
    branch_element: branchElement[pillar[1]],
    date,
    day: index + 1,
    day_officer: officer,
    goals: clone(GOALS),
    gods: { bad: ["fixture-bad-god"], good: ["fixture-good-god"], unknown: [] },
    intentStatus: clone(CALENDAR_INTENT_STATUS),
    intent_scores: {
      personal: Object.fromEntries(CALENDAR_INTENT_IDS.map((id) => [id, { score: 68, tier: CALENDAR_INTENT_STATUS[id] }])),
      universal: Object.fromEntries(CALENDAR_INTENT_IDS.map((id) => [id, { score: 62, tier: CALENDAR_INTENT_STATUS[id] }])),
    },
    ji: ["กิจกรรมตัวอย่างที่ควรเลี่ยง"],
    lunar,
    month_pillar: index < 6 ? "甲午" : "乙未",
    nine_star: nineStar,
    pillar,
    pillars_full: {
      day: { branch: pillar[1], stem: pillar[0] },
      hour: { branch: "子", reference_time: "23:00", stem: index % 2 ? "甲" : "丙" },
      month: { branch: index < 6 ? "午" : "未", stem: index < 6 ? "甲" : "乙" },
      year: { branch: "午", stem: "丙" },
    },
    stars_detail: [],
    stem: pillar[0],
    stem_element: stemElement[pillar[0]],
    ten_god: "比肩",
    topIntents: [{ icon: "◎", id: "start_work", tier: "good" }],
    twelve_star: spirit,
    twenty_eight_star: mansion,
    universal_goals: Object.fromEntries(Object.entries(GOALS).map(([id, score]) => [id, { level: score >= 70 ? "good" : "neutral", score }])),
    universal_intent_status: clone(CALENDAR_INTENT_STATUS),
    universal_top_intents: [{ icon: "◎", id: "start_work", tier: "good" }],
    universal_verdict: { hardBlocked: officer === "破", level: officer === "破" ? "avoid" : "good", score: officer === "破" ? 32 : 68 },
    universal_worst_intents: [{ icon: "△", id: "loan", tier: "bad" }],
    verdict: { label: officer === "破" ? "凶" : "吉", level: officer === "破" ? "avoid" : "good", score: officer === "破" ? 34 : 72, tags: ["fixture"] },
    worstIntents: [{ icon: "△", id: "loan", tier: "bad" }],
    yi: ["กิจกรรมตัวอย่างที่เหมาะสม"],
  }));
}

function datepickModule(module, normalized, confidence, raw, options = {}) {
  return {
    confidence,
    module,
    pass: options.pass !== false,
    raw,
    reasons: {
      down: clone(options.down || []),
      up: clone(options.up || []),
      warning: clone(options.warning || []),
    },
    score: { normalized, raw: normalized, weight: 1 },
    status: "ready",
    tags: [...(options.tags || [])],
  };
}

function datepickModules() {
  return {
    he_luo: datepickModule("he_luo", 72, 0.8, {
      day_element: "fire",
      pattern: "二旺一殺",
      pattern_th: "二旺一殺",
      period: 9,
    }, {
      tags: ["period9_fav", "heluo_二旺一殺"],
      up: [
        { code: "P9_FAV", delta: 10, en: "🌟 Period 9 favors Fire (He Luo)", thai: "🌟 ยุค9 fire ดี (河洛)", zh: "🌟 九運火吉 (河洛)" },
        { code: "HL_PAT", delta: -3, en: "📊 二旺一殺 pattern (He Luo)", thai: "📊 二旺一殺", zh: "📊 二旺一殺 (河洛)" },
      ],
    }),
    nine_stars: datepickModule("nine_stars", 65, 0.75, { star: 4 }, {
      tags: ["flystar_4"],
      up: [{ code: "STAR_GOOD", delta: 15, en: "🌟 4 White Star (Flying Stars)", thai: "🌟 4白 (飛星)", zh: "🌟 4白 (飛星)" }],
    }),
    qi_men: datepickModule("qi_men", 68, 0.9, {
      bad_door: false,
      computed_from: "2026-07-21T10:00:00+07:00",
      deity: "六合",
      direction: "NW",
      door: "開門",
      engine_hour_pillar: "癸巳",
      fallback: false,
      headline: { deity: "六合", direction: "NW", door: "開門", palace_id: 6, palace_zh: "乾六宮", role: "zhi_shi", star: "天英" },
      ju_number: 8,
      palace_id: 6,
      palace_zh: "乾六宮",
      palaces: [
        { deity: "太陰", deity_code: "TAI_YIN", direction: "N", door: "休門", door_code: "XIU_MEN", palace_id: 1, palace_zh: "坎一宮", star: "天芮", star_code: "TIAN_RUI" },
        { deity: "玄武", deity_code: "XUAN_WU", direction: "SW", door: "死門", door_code: "SI_MEN", palace_id: 2, palace_zh: "坤二宮", star: "天沖", star_code: "TIAN_CHONG" },
        { deity: "值符", deity_code: "ZHI_FU", direction: "E", door: "傷門", door_code: "SHANG_MEN", palace_id: 3, palace_zh: "震三宮", star: "天心", star_code: "TIAN_XIN" },
        { deity: "九天", deity_code: "JIU_TIAN", direction: "SE", door: "杜門", door_code: "DU_MEN", palace_id: 4, palace_zh: "巽四宮", star: "天蓬", star_code: "TIAN_PENG" },
        { deity: "值符", deity_code: "ZHI_FU", direction: "C", door: "杜門", door_code: "DU_MEN", palace_id: 5, palace_zh: "中五宮", star: "天禽", star_code: "TIAN_QIN" },
        { deity: "六合", deity_code: "LIU_HE", direction: "NW", door: "開門", door_code: "KAI_MEN", palace_id: 6, palace_zh: "乾六宮", star: "天英", star_code: "TIAN_YING" },
        { deity: "白虎", deity_code: "BAI_HU", direction: "W", door: "驚門", door_code: "JING_FEAR_MEN", palace_id: 7, palace_zh: "兌七宮", star: "天輔", star_code: "TIAN_FU" },
        { deity: "螣蛇", deity_code: "TENG_SHE", direction: "NE", door: "生門", door_code: "SHENG_MEN", palace_id: 8, palace_zh: "艮八宮", star: "天柱", star_code: "TIAN_ZHU" },
        { deity: "九地", deity_code: "JIU_DI", direction: "S", door: "景門", door_code: "JING_VIEW_MEN", palace_id: 9, palace_zh: "離九宮", star: "天任", star_code: "TIAN_REN" },
      ],
      star: "天英",
    }, {
      tags: ["door_開門", "star_天英", "deity_六合"],
      up: [{ code: "QM_DOOR", delta: 30, en: "🚪 Open Gate 開門 (Qi Men)", thai: "🚪 開門 (奇門)", zh: "🚪 開門 (奇門)" }],
      down: [{ code: "QM_STAR", delta: 5, en: "⭐ 天英 star (Qi Men)", thai: "⭐ 天英 (奇門星)", zh: "⭐ 天英 (奇門星)" }],
    }),
    tai_sui: datepickModule("tai_sui", 75, 0.9, { year_branch: "午" }, {
      tags: ["taisui_safe"],
      up: [{ code: "TS_SAFE", delta: 0, en: "✓ Clear of Tai Sui (太歲)", thai: "✓ 太歲ปลอดภัย", zh: "✓ 太歲無犯" }],
    }),
    twelve_officers: datepickModule("twelve_officers", 65, 0.85, { officer: "除" }, {
      tags: ["officer_除"],
      up: [{ code: "OFFICER_GOOD", delta: 15, en: "✓ 除 Day (Twelve Day Officers)", thai: "✓ 除日 (12建除)", zh: "✓ 除日 (十二建除)" }],
    }),
    twelve_spirits: datepickModule("twelve_spirits", 70, 0.8, { spirit: "司命" }, {
      tags: ["spirit_司命"],
      up: [{ code: "SPIRIT_GOOD", delta: 20, en: "✨ 司命 (Twelve Day Spirits)", thai: "✨ 司命 (12神煞)", zh: "✨ 司命 (十二神煞)" }],
    }),
    twenty_eight: datepickModule("twenty_eight", 55, 0.8, { star: "翼" }, { tags: ["xiu_翼"] }),
    ze_ri: datepickModule("ze_ri", 50, 0.85, {
      dayBranch: "申",
      hourBranch: "巳",
      monthBranch: "未",
      yearBranch: "午",
    }),
  };
}

function fixtureValues() {
  return {
    today: clone(AUDITED_TODAY_WIRE.today),
    todayHours: (() => {
      const value = clone(AUDITED_TODAY_WIRE.today_hours);
      value.hours = value.hours.map((hour) => Object.hasOwn(hour, "isNow") ? { ...hour, isNow: false } : hour);
      return value;
    })(),
    todayDirections: clone(AUDITED_TODAY_WIRE.today_directions),
    todayGoals: clone(AUDITED_TODAY_WIRE.today_goals),
    chart: {
      analysis: {
        current_luck_idx: 0,
        element_counts: { earth: 3.5, fire: 4.5, metal: 0.5, water: 1.5, wood: 2.5 },
        ge_ju: { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
        luck_pillars: [
          {
            age_end: 16.8, age_end_detail: "16 ปี 9 เดือน 22 วัน", age_start: 6.81, age_start_detail: "6 ปี 9 เดือน 22 วัน",
            branch: "申", direction: "forward", direction_th: "เดินหน้า順", element: "fire", end_date: "1923-05-11", original_index: 0,
            qi_phase: "絕", start_date: "1913-05-11", stem: "丙", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1923, year_start: 1912,
          },
          {
            age_end: 26.8, age_end_detail: "26 ปี 9 เดือน 22 วัน", age_start: 16.81, age_start_detail: "16 ปี 9 เดือน 22 วัน",
            branch: "酉", direction: "forward", direction_th: "เดินหน้า順", element: "fire", end_date: "1933-05-11", original_index: 1,
            qi_phase: "胎", start_date: "1923-05-11", stem: "丁", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1933, year_start: 1922,
          },
          {
            age_end: 36.8, age_end_detail: "36 ปี 9 เดือน 22 วัน", age_start: 26.81, age_start_detail: "26 ปี 9 เดือน 22 วัน",
            branch: "戌", direction: "forward", direction_th: "เดินหน้า順", element: "earth", end_date: "1943-05-11", original_index: 2,
            qi_phase: "養", start_date: "1933-05-11", stem: "戊", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1943, year_start: 1932,
          },
          {
            age_end: 46.8, age_end_detail: "46 ปี 9 เดือน 22 วัน", age_start: 36.81, age_start_detail: "36 ปี 9 เดือน 22 วัน",
            branch: "亥", direction: "forward", direction_th: "เดินหน้า順", element: "earth", end_date: "1953-05-11", original_index: 3,
            qi_phase: "長生", start_date: "1943-05-11", stem: "己", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1953, year_start: 1942,
          },
          {
            age_end: 56.8, age_end_detail: "56 ปี 9 เดือน 22 วัน", age_start: 46.81, age_start_detail: "46 ปี 9 เดือน 22 วัน",
            branch: "子", direction: "forward", direction_th: "เดินหน้า順", element: "metal", end_date: "1963-05-11", original_index: 4,
            qi_phase: "沐浴", start_date: "1953-05-11", stem: "庚", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1963, year_start: 1952,
          },
          {
            age_end: 66.8, age_end_detail: "66 ปี 9 เดือน 22 วัน", age_start: 56.81, age_start_detail: "56 ปี 9 เดือน 22 วัน",
            branch: "丑", direction: "forward", direction_th: "เดินหน้า順", element: "metal", end_date: "1973-05-11", original_index: 5,
            qi_phase: "冠帶", start_date: "1963-05-11", stem: "辛", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1973, year_start: 1962,
          },
          {
            age_end: 76.8, age_end_detail: "76 ปี 9 เดือน 22 วัน", age_start: 66.81, age_start_detail: "66 ปี 9 เดือน 22 วัน",
            branch: "寅", direction: "forward", direction_th: "เดินหน้า順", element: "water", end_date: "1983-05-11", original_index: 6,
            qi_phase: "臨官", start_date: "1973-05-11", stem: "壬", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1983, year_start: 1972,
          },
          {
            age_end: 86.8, age_end_detail: "86 ปี 9 เดือน 22 วัน", age_start: 76.81, age_start_detail: "76 ปี 9 เดือน 22 วัน",
            branch: "卯", direction: "forward", direction_th: "เดินหน้า順", element: "water", end_date: "1993-05-11", original_index: 7,
            qi_phase: "帝旺", start_date: "1983-05-11", stem: "癸", timing_method: "tyme4ts ChildLimit.fromSolarTime → age_start; date = birth datetime + age_start",
            year_end: 1993, year_start: 1982,
          },
        ],
        ten_gods_map: {
          day: { stem: "甲", ten_god: "日主" },
          hour: { stem: "己", ten_god: "正財" },
          month: { stem: "乙", ten_god: "劫財" },
          year: { stem: "丙", ten_god: "食神" },
        },
        tiao_hou: {
          activeList: ["壬", "癸", "子", "亥"], bridge: "metal", bridgeName: { en: "Metal", th: "ทอง", zh: "金" },
          climate: "scorched", climateName: { en: "Scorched (Hot Chart)", th: "ร้อน (ดวงไหม้)", zh: "燥熱格" },
          counts: { earth: 2, fire: 3, metal: 0, water: 1, wood: 2 }, monthBranch: "未", regulator: "water",
          regulatorName: { en: "Water", th: "น้ำ", zh: "水" }, severity: 5, tier: "SS",
          tierDesc: { en: "Severe · strong impact", th: "รุนแรง · กระทบมาก", zh: "嚴重" },
        },
        useful_god: {
          dayMaster: "甲", dmElement: "wood",
          ranks: [
            { element: "wood", elementName: { en: "Wood", th: "ไม้", zh: "木" }, polarity: "yang", priority: { en: "Primary · most needed", th: "อันดับหนึ่ง · ขาดไม่ได้", zh: "首要" }, rank: 1, stem: "甲", tenGod: "比肩", tenGodName: { en: "Friend", th: "เพื่อน", zh: "比肩" } },
            { element: "wood", elementName: { en: "Wood", th: "ไม้", zh: "木" }, polarity: "yin", priority: { en: "Secondary · strong support", th: "อันดับสอง · เสริมแกร่ง", zh: "次要" }, rank: 2, stem: "乙", tenGod: "劫財", tenGodName: { en: "Rob Wealth", th: "ขัดทรัพย์", zh: "劫財" } },
            { element: "metal", elementName: { en: "Metal", th: "ทอง", zh: "金" }, polarity: "yang", priority: { en: "Tertiary · useful boost", th: "อันดับสาม · เสริมพลัง", zh: "第三" }, rank: 3, stem: "庚", tenGod: "七殺", tenGodName: { en: "Seven Killings", th: "ผู้คุมเข้ม", zh: "七殺" } },
            { element: "water", elementName: { en: "Water", th: "น้ำ", zh: "水" }, polarity: "yang", priority: { en: "Supportive · mild", th: "สนับสนุน · เบา", zh: "輔助" }, rank: 4, stem: "壬", tenGod: "偏印", tenGodName: { en: "Indirect Resource", th: "ครูสายลับ", zh: "偏印" } },
            { element: "water", elementName: { en: "Water", th: "น้ำ", zh: "水" }, polarity: "yin", priority: { en: "Optional · niche", th: "เลือกได้ · เฉพาะกรณี", zh: "備用" }, rank: 5, stem: "癸", tenGod: "正印", tenGodName: { en: "Direct Resource", th: "ครูสายตรง", zh: "正印" } },
          ],
          summary: { friendlyElements: ["wood", "metal", "water"], primary: "甲", primaryElement: "wood" },
        },
      },
      dayMaster: "甲",
      day_master: "甲",
      entitlement: { ai_summary_pdf: true, detail: "full", locked_sections: ["technical_chart"], luck_cycles: "all", luck_total: 8, luck_visible: 8, plan: "premium", technical_detail: false },
      geJu: { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
      ge_ju: { basis: "DM 甲 + 己 (hour) → earth", confidence: "high", raw_structure: "化土格", structure: "化土格" },
      input: { birthTimeKnown: true, date: null, gender: null, longitude: null, time: null },
      ok: true,
      pillars: { day: { branch: "子", stem: "甲" }, hour: { branch: "巳", stem: "己" }, month: { branch: "未", stem: "乙" }, year: { branch: "午", stem: "丙" } },
      profile: { id: null, is_self: true, name: "Fixture Center", nickname: null },
      request_context: { profile_id: null, profile_source: "account_self", requested_profile_id: null },
      source: "/api/chart",
      strength: { level: "very_weak", percent: 32 },
      yongshen: [{ element: "water", stem: "壬" }, { element: "water", stem: "癸" }, { element: "wood", stem: "甲" }],
    },
    calendar: {
      ...clone(AUDITED_CALENDAR_META),
      days: clone(AUDITED_CALENDAR_DAYS),
    },
    network: clone(AUDITED_QIMEN_NETWORK_WIRE.network),
    networkSifu: { balance_after: 99, mode: "pair", ok: true, reply: SYNTHETIC_REPLY, source: "/api/network/sifu", spent: 1 },
    networkBulk: clone(AUDITED_QIMEN_NETWORK_WIRE.network_bulk),
    qimenBasic: qimenFixture("free"),
    qimenProfessional: qimenFixture("master"),
    qimenSearch: clone(AUDITED_QIMEN_NETWORK_WIRE.qimen.search),
    qimenSifu: { balance_after: 99, ok: true, reply: SYNTHETIC_REPLY, spent: 1 },
    datepick: {
      allCut: false,
      candidates: [{
        calendar: { gregorianDate: "2026-07-21", shichen: 5, shichenBranch: "巳" },
        datetime: { end: "2026-07-21T11:00:00+07:00", start: "2026-07-21T09:00:00+07:00", timezone: "Asia/Bangkok" },
        display: { badges: [{ color: "#ba7517", emoji: "🟡", label: "ฤกษ์ปานกลาง" }], guardrails: [], summary: "🟡 ฤกษ์ปานกลาง · คะแนน 62" },
        donggong: {
          base: "—",
          en: "Good · Remove",
          fromException: true,
          jcMeaning: { en: "Clearing-out day — good for new starts, healing, ending old things.", th: "วันปัดกวาดของเก่า — เหมาะเริ่มสิ่งใหม่ รักษาโรค เลิก/ทิ้งของเดิม แต่ระวังเรื่องที่ต้องความมั่นคง", zh: "除舊布新，宜療病出舊。" },
          jianchu: "除",
          jianchuEn: "Remove",
          jianchuTh: "วันกำจัดสิ่งเก่า",
          ji: [],
          jiPairs: [],
          level: "good",
          missing: false,
          monthIdx: 6,
          note: "",
          noteTh: "",
          shensha: [],
          shenshaPairs: [],
          th: "ดี · วันกำจัดสิ่งเก่า",
          verdict: "吉",
          verdictEn: "Good",
          verdictTh: "ดี",
          yi: ["伐木", "拴架"],
          yiPairs: [{ th: "เตรียมไม้-วัสดุสร้างบ้าน", zh: "伐木" }, { th: "ขึ้นโครงสร้างบ้าน", zh: "拴架" }],
          zh: "吉 · 除日",
        },
        huangdao: { deity_en: "Heavenly Virtue", deity_th: "เทียนเต๋อ (คุณธรรมฟ้า)", deity_zh: "天德", good: true, path_th: "ยามทอง", path_zh: "黃道" },
        id: "fixture-candidate-01",
        modules: datepickModules(),
        people: [],
        pillars: { day: { branch: "申", stem: "丙" }, hour: { branch: "巳", stem: "癸" }, month: { branch: "未", stem: "乙" }, year: { branch: "午", stem: "丙" } },
        richong: { ages: [5, 17, 29, 41, 53, 65, 77, 89], birth_years: [2022, 2010, 1998, 1986, 1974, 1962, 1950, 1938], clash_branch_zh: "寅", zodiac_en: "Tiger", zodiac_th: "เสือ", zodiac_zh: "虎" },
        scoring: {
          action: "neutral",
          activeModules: ["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "he_luo", "hex64"],
          caps: [],
          finalScore: 62,
          moduleScores: { he_luo: 72, nine_stars: 65, tai_sui: 75, twelve_officers: 65, twelve_spirits: 70, twenty_eight: 55, ze_ri: 50 },
          reasonsDown: [],
          reasonsUp: [
            { code: "DONGGONG_VERDICT_UP", delta: 1, en: "Dong Gong supports the day overall · Good · Remove (除日)", severity: "info", source: "ze_ri", thai: "ตงกงหนุนภาพรวม · ดี วันกำจัดสิ่งเก่า", zh: "董公整體看好 · 吉 · 除日" },
            { code: "SPIRIT_GOOD", delta: 20, en: "✨ 司命 (Twelve Day Spirits)", thai: "✨ 司命 (12神煞)", zh: "✨ 司命 (十二神煞)" },
            { code: "OFFICER_GOOD", delta: 15, en: "✓ 除 Day (Twelve Day Officers)", thai: "✓ 除日 (12建除)", zh: "✓ 除日 (十二建除)" },
            { code: "STAR_GOOD", delta: 15, en: "🌟 4 White Star (Flying Stars)", thai: "🌟 4白 (飛星)", zh: "🌟 4白 (飛星)" },
            { code: "P9_FAV", delta: 10, en: "🌟 Period 9 favors Fire (He Luo)", thai: "🌟 ยุค9 fire ดี (河洛)", zh: "🌟 九運火吉 (河洛)" },
            { code: "HL_PAT", delta: -3, en: "📊 二旺一殺 pattern (He Luo)", thai: "📊 二旺一殺", zh: "📊 二旺一殺 (河洛)" },
            { code: "TS_SAFE", delta: 0, en: "✓ Clear of Tai Sui (太歲)", thai: "✓ 太歲ปลอดภัย", zh: "✓ 太歲無犯" },
          ],
          tier: "neutral",
          vetoes: [],
          warnings: [],
        },
        zodiacClash: ["子 ", "寅 "],
      }],
      cutSlots: [],
      funnelStats: {
        baseTotal: 12,
        finalCount: 1,
        perModule: Object.fromEntries(["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "qi_men", "he_luo"].map((key) => [key, { failed: 0, passed: 12 }])),
        personCut: 0,
        personHard: false,
        total: 12,
        vetoCut: 0,
      },
      meta: {
        activityProfile: null,
        activityType: "開市",
        cache: "miss",
        cacheHits: 0,
        cacheMisses: 0,
        donggongScoringPolicy: "v1_overlay",
        durationMs: 12,
        entitlement: { max_range_days: 90, max_results: 50, modules_allowed: [...DATEPICK_MODULES], modules_stripped: [], plan: "premium" },
        eventLocation: { source: "default_bkk" },
        hardModules: ["ze_ri", "tai_sui"],
        mergedHardModules: ["ze_ri", "tai_sui"],
        qimenScoringPolicy: {
          baseScoreExcludesQiMen: true,
          caveatTh: "คะแนนหลักตัดจากศาสตร์อื่นก่อน แล้วฉีเหมินค่อยปรับแบบมีเหตุผลเฉพาะกิจกรรมและมีเพดานกันฟันธงเกินข้อมูล",
          chartScopeTh: "ใช้เฉพาะผังยาม 時家 ที่ระบบอนุญาตให้ตัดสินได้; ผังวัน/เดือน/ปีใช้เป็นบริบท ไม่เอามาคิดคะแนนฤกษ์ยาม",
          enabled: true,
          evidenceTh: "ใช้เฉพาะประตู ดาว เทพ ก้าน และสัญญาณจากผังจริงที่อนุญาตให้ให้คะแนน; ป้ายแสดงผลหรือข้อมูลอ่านประกอบไม่เอามาคิดคะแนน",
          mode: "guard_only",
          noGenericAveraging: true,
          targetDirection: null,
          useTh: "ไม่มีภารกิจย่อยเฉพาะ: ฉีเหมินใช้เป็นตัวจำกัดเมื่อผังไม่รับ ไม่ใช่คะแนนบวกกลาง",
          version: "datepick-qimen-policy-20260606",
        },
        relaxDoors: false,
        skyModules: [],
        skyScoringPolicy: "off",
        sqlHardModules: ["ze_ri", "tai_sui"],
      },
      ok: true,
      people_ids: [],
      source: "/api/auspicious",
    },
    datepickSave: { ok: true, saved_date: savedDate() },
    datepickSaved: { count: 1, ok: true, saved_dates: [savedDate()] },
    datepickDelete: { deleted: true, id: SAVED_DATE_ID, ok: true },
    luopanRings: ringFixture(false),
    luopanBootstrap: {
      contract_version: "mobile-luopan-v1",
      entitlement: {
        house_limit: PLAN_CAPS.master.fengshui.houses,
        mode: PLAN_CAPS.master.luopan.mode,
        multi_profile: PLAN_CAPS.master.fengshui.multi_profile,
        plan: "master",
        pins: PLAN_CAPS.master.luopan.pins,
        sifu: PLAN_CAPS.master.luopan.sifu,
        vision: PLAN_CAPS.master.luopan.vision,
        vision_limit: PLAN_CAPS.master.luopan.vision_limit,
      },
      formula_version: "luopan-core-v1-xuankong-chart-v1",
      houses: [],
      north_reference_default: "magnetic",
      ok: true,
      profiles: [],
      ring_reference: { mountains_24: mountainRows() },
    },
    luopanRingsW4: ringFixture(true),
    luopanAnalysis: {
      core: {
        facing: fullMountain("巳"),
        north_reference: "magnetic",
        period: 9,
        pin_warnings: [],
        professional: {
          najia_basha: {
            facingMountain: fullMountain("巳"),
            huangQuanMountain: null,
            longShaMountain: fullMountain("午"),
            sittingMountain: fullMountain("亥"),
          },
          water_method: {
            hits: [],
            pass: true,
            raw: { facingDeg: 150 },
            score: 50,
            status: "missing",
            tags: ["WATER_METHOD_NO_WATER"],
            warnings: ["ยังไม่มีจุดน้ำจริง จึงไม่ตัดสิน水法 · 無水不論水法"],
          },
        },
        school: "full_24",
        sitting: fullMountain("亥"),
        three_plates: { degree: 150, earth: fullMountain("巳"), heaven: fullMountain("巳"), human: fullMountain("丙") },
        tigua: { facing: xuanKongFixture().water_flight.decision, sitting: xuanKongFixture().mountain_flight.decision },
        xuan_kong: xuanKongFixture(),
      },
      entitlement: { locked_sections: [], mode: "full", pins: "full", plan: "master" },
      excluded_unverified_layers: ["pseudo_time_star", "simplified_kua", "sequential_hex64", "low_confidence_star_pairs"],
      formula_version: "luopan-core-v1-xuankong-chart-v1-three-plates-v1",
      measurement: measurementGate(),
      ok: true,
      verdict_scope: "verified_core_only",
    },
    luopanSnapshot: {
      datetime: { day_pillar: "己丑", gregorian: "2026-07-14T02:00:00.000Z", hour_pillar: "己巳", month_pillar: "乙未", shichen: "巳", solar_term: "小暑", year_pillar: "丙午" },
      entitlement: { ...clone(PLAN_CAPS.master.fengshui), plan: "master" },
      house: { face_angle: "150.000", facing_direction: "SE", facing_mountain: "巳", family_members: [], id: null, lat: null, lng: null, name: "Fixture House", sit_angle: "330.000" },
      layers: {
        ai_xing: { mountain_star: 2, period_star: 9, sitting_mountain: "亥", water_star: 5 },
        ba_zhai: null,
        day_stars: { center: 2, day_pillar: "己丑", day_school: "zaoming", direction: "逆", dun: "yin", ganzhi_seq: 26, jieqi_period: 3, jieqi_period_name: "夏至→處暑", palaces: { C: 2, E: 4, N: 6, NE: 8, NW: 1, S: 7, SE: 3, SW: 5, W: 9 }, school_flag: "fixture" },
        flying_stars: { annual_center: 1, annual_center_source: "json_centre_star", feng_shui_year: 2026, palaces: snapshotPalaces(), period: 9 },
        hour_stars: { center: 1, day_branch: "丑", direction: "逆", dun: "yin", hour_branch: "巳", hour_index: 5, note: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", palaces: { C: 1, E: 3, N: 5, NE: 7, NW: 9, S: 6, SE: 2, SW: 4, W: 8 } },
        luxing_note: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา",
        month_stars: { center: 3, direction: "順", jieqi_month: 6, month_branch: "未", note: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", palaces: { C: 3, E: 1, N: 8, NE: 6, NW: 4, S: 7, SE: 2, SW: 9, W: 5 }, year_branch: "午" },
        qi_men: { note: "simplified fallback", palace_gates: { E: "驚", N: "景", NE: "死", NW: "杜", S: "休", SE: "開", SW: "生", W: "傷" } },
        sixty_four: { facing_hex: 27 },
        twenty_four: { face_angle: 150, facing: "巳", mountains: MOUNTAINS_24.map((row) => row.name), sitting: "亥" },
        year_stars: { center: 1, direction: "順", palaces: { C: 1, E: 8, N: 6, NE: 4, NW: 2, S: 5, SE: 9, SW: 7, W: 3 }, year_branch: "午" },
      },
      ok: true,
      recommendations: [],
      today: { five_element: "土", twelve_officers: "破", twelve_spirits: "朱雀", twenty_eight: "觜" },
      warnings: [
        { code: "WU_HUANG_S", dirs: ["S"], severity: "critical", text: "五黃 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา" },
        { code: "ER_HEI_NW", dirs: ["NW"], severity: "warning", text: "二黑 อยู่ทิศ NW · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา" },
        { code: "SAN_SHA_N", dirs: ["N"], severity: "critical", text: "三煞 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา" },
        { code: "TAISUI_S", dirs: ["S"], severity: "critical", text: "太歲 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา" },
        { code: "SUI_PO_N", dirs: ["N"], severity: "warning", text: "歲破 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา" },
      ],
    },
    luopanMeasurementsGet: { ok: true, rows: [{ accuracy_class: 3, accuracy_deg: "1.000", boundary_distance_deg: "7.500", circular_std_deg: "0.500", client_measurement_id: "fixture-client-measurement-01", created_at: "2026-07-14T02:00:00.000Z", facing_mountain: "巳", formula_version: "luopan-core-v1-xuankong-chart-v1", heading_deg: "150.000", house_id: null, id: MEASUREMENT_ID, max_tilt_deg: "2.000", method: "sensor", north_reference: "magnetic", quality_reasons: [], quality_status: "pass", repeat_spread_deg: "0.500", sample_count: 24, sitting_mountain: "亥" }] },
    luopanMeasurementsPost: { gate: measurementGate(), measurement: { created_at: "2026-07-14T02:00:00.000Z", facing_mountain: "巳", heading_deg: "150.000", id: MEASUREMENT_ID, quality_reasons: [], quality_status: "pass", sitting_mountain: "亥" }, ok: true },
    luopanSifu: { cached: false, key: "fixture1", ms: 12, ok: true, reply: SYNTHETIC_REPLY },
    luopanVision: { cost_yam: 1, credit_yam: 99, ok: true, reply: SYNTHETIC_REPLY },
    sifuChat: { cached: false, key: "fixture1", ms: 12, ok: true, reply: SYNTHETIC_REPLY, source: "/api/sifu" },
    sifuChatStream: {
      cacheControl: "no-cache, no-store, max-age=0, must-revalidate",
      contentType: "text/event-stream; charset=utf-8",
      events: [
        { data: { cached: false, key: "fixture1", startedAt: 1783990800000, timing: { contextCache: "miss", ctxMs: 4, promptChars: 128, promptMs: 3 } }, event: "meta" },
        { data: { ms: 12 }, event: "first" },
        { data: { text: SYNTHETIC_REPLY }, event: "chunk" },
        { data: { cached: false, chars: 27, ms: 24 }, event: "done" },
      ],
      ok: true,
    },
    sifuHistory: { history: [{ answer: null, cached: false, created_at: "2026-07-14T02:00:00.000Z", feature: "sifu_master", id: null, lang: "th", mode: null, profile_id: null, question: null, request_payload: null, response_meta: null, topic: "overview" }], ok: true, source: "/api/sifu/history" },
    sifuGroup: { balance_after: 99, ok: true, reply: SYNTHETIC_REPLY, source: "/api/sifu/group", spent: 1 },
  };
}

function canonicalize(value, pointer = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`fixture_non_finite ${pointer || "/"}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${pointer}/${index}`));
  if (typeof value !== "object") throw new Error(`fixture_non_json_value ${pointer || "/"}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`fixture_non_plain_object ${pointer || "/"}`);
  const output = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    output[key] = canonicalize(value[key], `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
  }
  return output;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pointerValue(root, pointer) {
  let current = root;
  for (const segment of pointer.split("/").slice(1)) {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

const PRIVATE_TEXT_KEYS = new Set([
  "answer", "body", "content", "delta", "guidance", "memo", "message", "private_note",
  "prompt", "query", "question", "response", "summary", "transcript",
]);
const SNAPSHOT_WARNING_TEXT = new Set([
  "五黃 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "二黑 อยู่ทิศ NW · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "三煞 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "太歲 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "歲破 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
]);
const EMAIL_PATTERN = /(?:[\p{L}\p{M}\p{N}._%+-]+@[\p{L}\p{M}\p{N}.-]+\.[\p{L}\p{M}]{2,}|[\p{L}\p{M}\p{N}._%+-]+@\[(?:IPv6:)?[0-9A-F:.]+\])/iu;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const BEARER_PATTERN = /(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/;
const SECRET_PATTERN = /(?:(?:sk|pk|sec|tok)[_-][A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const PHONE_PATTERN = /^\s*(?:\+\d(?:[\s().-]*\d){7,14}|0\d(?:[\s().-]*\d){8,10})\s*$/u;
const CREDENTIAL_COMPACT_KEYS = new Set([
  "accesskey", "accesskeyid", "accesstoken", "apikey", "authorization", "authtoken",
  "awsaccesskeyid", "clientsecret", "cookie", "credential", "credentials", "passcode",
  "password", "refreshtoken", "secret", "secretaccesskey", "sessiontoken", "setcookie", "token",
]);
const IDENTITY_COMPACT_KEYS = new Set([
  "accountid", "accountids", "deviceid", "deviceids", "email", "emailaddress",
  "contact", "customerid", "displayname", "dob", "familyname", "firstname", "givenname",
  "homeaddress", "lastname", "legalname", "memberid", "organizationid", "orgid",
  "personid", "phone", "phonenumber", "profileid", "surname",
  "profileids", "sessionid", "userid", "userids",
]);
const EXACT_LOCATION_COMPACT_KEYS = new Set(["coordinate", "coordinates", "gps", "lat", "latitude", "lng", "location", "longitude", "position"]);
const IDENTITY_PARENT_KEYS = new Set(["account", "activeprofile", "house", "houses", "people", "person", "profile", "profilecontext", "profiles", "user"]);

const APPROVED_UUID_PATHS = new Map([
  [`datepickSave:/saved_date/id`, SAVED_DATE_ID],
  [`datepickSaved:/saved_dates/0/id`, SAVED_DATE_ID],
  [`datepickDelete:/id`, SAVED_DATE_ID],
  [`luopanMeasurementsGet:/rows/0/id`, MEASUREMENT_ID],
  [`luopanMeasurementsPost:/measurement/id`, MEASUREMENT_ID],
]);
const APPROVED_COORDINATE_PATHS = new Set([
  "qimenBasic:/input/lat", "qimenBasic:/input/lng", "qimenBasic:/request_context/latitude", "qimenBasic:/request_context/longitude",
  "qimenProfessional:/input/lat", "qimenProfessional:/input/lng", "qimenProfessional:/request_context/latitude", "qimenProfessional:/request_context/longitude",
  "qimenSearch:/lat", "qimenSearch:/lng", "qimenSearch:/request_context/latitude", "qimenSearch:/request_context/longitude",
  "todayDirections:/request_context/latitude", "todayDirections:/request_context/longitude",
]);
const APPROVED_NAME_PATHS = new Map([
  ["today:/profile/name", "Fixture Center"],
  ["todayHours:/profile/name", "Fixture Center"],
  ["todayDirections:/profile/name", "Fixture Center"],
  ["todayGoals:/profile/name", "Fixture Center"],
  ["chart:/profile/name", "Fixture Center"],
  ["calendar:/profile/name", "Fixture Center"],
  ["calendar:/profile_context/name", "Fixture Center"],
  ["network:/active_profile/name", "Fixture Center"],
  ["network:/people/0/name", "Fixture Person A"],
  ["network:/people/1/name", "Fixture Person B"],
  ["luopanSnapshot:/house/name", "Fixture House"],
]);
const APPROVED_PRIVATE_TEXT_PATHS = new Map([
  ["datepick:/candidates/0/display/summary", "🟡 ฤกษ์ปานกลาง · คะแนน 62"],
  ["datepickSave:/saved_date/summary", "Synthetic saved date."],
  ["datepickSaved:/saved_dates/0/summary", "Synthetic saved date."],
  ["networkSifu:/reply", SYNTHETIC_REPLY],
  ["qimenSifu:/reply", SYNTHETIC_REPLY],
  ["luopanSifu:/reply", SYNTHETIC_REPLY],
  ["luopanVision:/reply", SYNTHETIC_REPLY],
  ["sifuChat:/reply", SYNTHETIC_REPLY],
  ["sifuChatStream:/events/2/data/text", SYNTHETIC_REPLY],
  ["sifuGroup:/reply", SYNTHETIC_REPLY],
]);

function escapedPointerSegment(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function normalizedUnicode(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u3002\uFF0E\uFF61]/g, ".")
    .replace(/\p{Cf}/gu, "");
}

function normalizedKey(value) {
  return normalizedUnicode(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function compactKey(value) {
  return normalizedKey(value).replace(/[^\p{L}\p{N}]/gu, "");
}

function hasSecretShape(value) {
  const normalized = normalizedUnicode(value);
  return EMAIL_PATTERN.test(normalized) || BEARER_PATTERN.test(normalized) || JWT_PATTERN.test(normalized) || SECRET_PATTERN.test(normalized);
}

export function scanFixturePrivacy(key, value) {
  const findings = new Set();
  const add = (category) => findings.add(category);
  const visit = (current, pointer, parents = []) => {
    if (typeof current === "string") {
      const normalized = normalizedUnicode(current);
      if (EMAIL_PATTERN.test(normalized)) add("email");
      if (PHONE_PATTERN.test(normalized)) add("phone");
      if (BEARER_PATTERN.test(normalized) || JWT_PATTERN.test(normalized) || SECRET_PATTERN.test(normalized)) add("secret-shape");
      if (UUID_PATTERN.test(normalized) && APPROVED_UUID_PATHS.get(`${key}:${pointer || "/"}`) !== current) add("uuid");
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (Array.isArray(current)) {
      const keys = Object.keys(current);
      if (keys.length !== current.length || keys.some((item, index) => item !== String(index))) add("unsafe-structure");
      current.forEach((item, index) => visit(item, `${pointer}/${index}`, parents));
      return;
    }
    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      add("unsafe-structure");
      return;
    }
    for (const childKey of Reflect.ownKeys(current)) {
      if (typeof childKey !== "string") {
        add("unsafe-structure");
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, childKey);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        add("unsafe-structure");
        continue;
      }
      const childValue = descriptor.value;
      const normalized = normalizedKey(childKey);
      const compact = compactKey(childKey);
      const childPointer = `${pointer}/${escapedPointerSegment(childKey)}`;
      const pathKey = `${key}:${childPointer}`;
      const identityParent = parents.some((segment) => IDENTITY_PARENT_KEYS.has(segment));

      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(childKey) || ["__proto__", "constructor", "prototype"].includes(childKey)) add("unsafe-key");
      if (hasSecretShape(childKey) || CREDENTIAL_COMPACT_KEYS.has(compact) || /(?:accesskey|apikey|authorization|cookie|credential|passcode|password|secret|token)$/.test(compact)) add("credential");
      if ((IDENTITY_COMPACT_KEYS.has(compact) || /(?:account|device|org|organization|profile|session|user)(?:id|ids|uuid|uuids)$/.test(compact)) && childValue !== null && childValue !== "") add("identity");
      if (["address", "avatar", "avatarurl", "birthdate", "birthdatetime", "birthlocationname", "birthtime", "fullname", "homeaddress", "image", "imagebase64", "imageurl", "ownername", "photo", "photourl", "portraiturl"].includes(compact) && childValue !== null && childValue !== "") add("identity");
      if (compact === "identifier" && identityParent && childValue !== null && childValue !== "") add("identity");
      if (compact === "id" && identityParent && childValue !== null && childValue !== "") add("identity");
      if (compact === "peopleids" && (!Array.isArray(childValue) || childValue.length !== 0)) add("identity");
      if ((EXACT_LOCATION_COMPACT_KEYS.has(compact) || compact === "geocoordinates") && childValue !== null && childValue !== "") {
        if (childValue !== 0 || !APPROVED_COORDINATE_PATHS.has(pathKey)) add("exact-location");
      }
      if (compact === "houseid" && childValue !== null && childValue !== "") add("identity");
      if (normalized === "name" && identityParent && childValue !== null && APPROVED_NAME_PATHS.get(pathKey) !== childValue) add("personal-name");
      if (UUID_PATTERN.test(typeof childValue === "string" ? childValue : "") && APPROVED_UUID_PATHS.get(pathKey) !== childValue) add("uuid");

      if (typeof childValue === "string" && (PRIVATE_TEXT_KEYS.has(normalized) || normalized === "reply" || normalized === "text")) {
        const approvedWarning = key === "luopanSnapshot" && /^\/warnings\/\d+\/text$/.test(childPointer) && SNAPSHOT_WARNING_TEXT.has(childValue);
        if (!approvedWarning && APPROVED_PRIVATE_TEXT_PATHS.get(pathKey) !== childValue) add("private-text");
      }
      visit(childValue, childPointer, [...parents, compact]);
    }
  };
  visit(value, "");
  return { key, ok: findings.size === 0, findings: [...findings].sort() };
}

function shapeDescriptor(value, seen = new Set()) {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "invalid-number";
  if (typeof value !== "object" || seen.has(value)) return "invalid";
  seen.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((item, index) => item !== String(index))) return "invalid-array";
    const result = { array_length: value.length, items: value.map((item) => shapeDescriptor(item, seen)) };
    seen.delete(value);
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return "invalid-object";
  const result = {};
  for (const childKey of Reflect.ownKeys(value).sort((a, b) => String(a).localeCompare(String(b)))) {
    if (typeof childKey !== "string") return "invalid-symbol";
    const descriptor = Object.getOwnPropertyDescriptor(value, childKey);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return "invalid-descriptor";
    result[childKey] = shapeDescriptor(descriptor.value, seen);
  }
  seen.delete(value);
  return result;
}

function stringLeaves(value, pointer = "", output = []) {
  if (typeof value === "string") {
    output.push([pointer || "/", value]);
    return output;
  }
  if (value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => stringLeaves(item, `${pointer}/${index}`, output));
    return output;
  }
  for (const childKey of Object.keys(value).sort()) {
    stringLeaves(value[childKey], `${pointer}/${escapedPointerSegment(childKey)}`, output);
  }
  return output;
}

function fixtureFingerprints(value) {
  return {
    payload: sha256(canonicalJson(value)),
    shape: sha256(canonicalJson(shapeDescriptor(value))),
    strings: sha256(canonicalJson(stringLeaves(value))),
  };
}

const EXPECTED_FIXTURE_FINGERPRINTS = Object.freeze({
  today: { payload: "280067d853da96f00611529524ce827be9ed9e8865b519c3c0e12ecbd3e96604", shape: "618fbf39165b71c1a9003a0a7a1554e53ba4cacf9ec977a1c56c3d2a2441cff8", strings: "8e39c3ebf6a0f79ab95750673d4c63191b32db48b755fc31e696ac6466737f18" },
  todayHours: { payload: "fcbcb3f8cea14011a1d43cf8dd776a21bf67de5118cc1dce7893c4c2fdac31f3", shape: "c797e486a07903692249fd0fc97fa276fa1f6a1b89304eb30f263ed53f543ef9", strings: "1f3d180d8f9ca4f27fbee503327833ba438537b278700800b323f3afb3a2cd99" },
  todayDirections: { payload: "50429fd2d70f947f4a19d16e702a40d6d63d095d1e38fe86a8b2c6b17cc6064c", shape: "4a04f67346a6eb73c7814a5b529ae0834b03379763788f2d6feb23eb2640c0fe", strings: "99a38cfc6ce140172b498efca56fb8495a61b38e08ba5d5b9584517c0a9dc6f9" },
  todayGoals: { payload: "fb2a157462918059f43ab057cc0610beaddc53d500ee9edf62ce9a89f8f28231", shape: "73f72f598521dfcfdab174dcb15568b6e3065a85c35c6687caff03d6da774b77", strings: "24ec31497c44a9574b5b8c2c5982b9b810b04fbd7716bee1ab5c2ab3b9f1175f" },
  chart: { payload: "be5b99a0f20f01606f3eb246c14b09141323c58b15c7c8c37459002c42fde2ef", shape: "16d1edbda0a3154886555c2ba48a4e995fb90dc25234973e340ab0a21b71cfa5", strings: "d0bc091428adaa10aef4a1e851a7ea4a00b90dbdcf800d19df769fef9286003e" },
  calendar: { payload: "4c079a0e0761277f57c04e55caba4565d46132a7c030c649de14f59089dfaed7", shape: "a072ee86c6baccca7c4e4d5fa3eb1dc9dfec05878b41634f0dd5c7b4f5749d87", strings: "0c3afdc43f05529d374069b1310d77b52de9dbedab0525598878f46f07847858" },
  network: { payload: "7eb6355bb936e68b74dd2355e5e491a712632631420a1ae1a6cb20d93479ab70", shape: "21a42c91731ccf2783f2567aad8f21d6d9af716eecd0a8dee273a56f92f11e31", strings: "6b8cf45667f5a7160b128e390195b1aa0c15dd1c3b29a865cbc7df2af420394f" },
  networkSifu: { payload: "c1419e613456280d98566ecd9d59e92b63c0f34f372bd8b929095a908827bca2", shape: "caed079f4322d3be548279b449e0cee8bd20c6300ca17872d4365806b8521841", strings: "5cdefecb52189f7529724990644bdd01e86c628dd1f2e40a31bf288ba2036c65" },
  networkBulk: { payload: "9b44a54bcf280f1be22309bb5c7e92a964dddbb7d4f6dd18cf4dceb30198ec84", shape: "14b46f901c100615b4ca910eef6896ebaaeb60f06b45c434d7f4c3ad1049dc52", strings: "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570" },
  qimenBasic: { payload: "2008f1d555d0c40a8ea691d64c29c84caf9c583a2459cb59ba3bb3618a5607e9", shape: "65055388e116962f32c41ebb6c69fa46a940e190883709567292d35252d70b04", strings: "7b7523e386866803cff5a59841579fe3f4dffa3af739ea51a5854791a7e4593e" },
  qimenProfessional: { payload: "66d40275100e76ebc5099ecc4095de87b1582b2bba233ce2942be925f0cee3ed", shape: "0c3e8611b0aa98e9e0fd725f10b9332b2dca9605e93e35e1021105de2c39b01c", strings: "ac9ae97925ea083e54e20044dfb68128d1833318065de6165bfea9491fa93e6e" },
  qimenSearch: { payload: "841f99b60c00fc32fb56544c6aa4c8363ea8f730d2d540d987fceb8d4c459d08", shape: "c9f5f50a816642afd5653b286016bcccf36680c5dd97cdb4a8df0b793762f6d7", strings: "3bb5e4f2b10daf52398494a853b5885a9c4f5924ab4564c2ad93564523abcc08" },
  qimenSifu: { payload: "ab5f2d79a7506370a4d95402f4ae849f55f044c425d13f10124bdaa902b2b53d", shape: "21b1408cb8688dd2eae78ee2ed496656fea3f367a2dd9b4b3de055a84e3924ca", strings: "682b81d34956f71cbed8daefe57f3787964fc79138428adda8dbc871b305dda2" },
  datepick: { payload: "7e1b44dfca917c1a9fe60452f931fc8436a1d4a4b4154f6344ba7cbc3a0dce63", shape: "b1f40a75f287e09a75521320f7883c2a031f351cdecb24fe1505e79f46bcd720", strings: "099abe5fdcf1d7940766e6a36c767485f369ddf6a5d6139294a47120586dbdd0" },
  datepickSave: { payload: "407ff106798c4bcf611eac263b234eec381980fe1dd3fce2d0c4df64d298f22a", shape: "909044c0d2037899fe62e5434a806cedd90f5b8e7cf229f04d2787a7e7b0c46c", strings: "88ed8c561002ae67b6839f0468e5dcd0a9369fed637e7435be987bd0d55a1d91" },
  datepickSaved: { payload: "4fc79e570d3551fb3613eeca76a38db9281d1282ddb8aeaf617d2aaebc9f687c", shape: "3efe57e33587509dd7e6530831184d7256c490f498764813859a8a7f67b5f636", strings: "01efa50f5b4628fdd288f9bf5c4eb353a8ec18ad6ac3d52a429c86c35d46520a" },
  datepickDelete: { payload: "b6eabfda4a8040a8253fe0aa6533017a8d42fb4193f61f6568eddbbddfce7833", shape: "accc2ef3f75675b07dd1654e833aa5f62c102592613586cfddf2dd28ed2ebd3b", strings: "0c6bb8645e79018a74c65a1086a37da19312bf8f4ef7623f95a1383e798cc3b2" },
  luopanRings: { payload: "e6d281231dc8cd9730356761e6e7600b7802eda0935a76772196e7581a1ea04b", shape: "4892386789bdbb71e4cef75da6d75eb05efb9fe8ebdd25497c3ebeb87a901982", strings: "d7efb082e3bc8415abb9a458a0b20be4dc1d9b22a451f2e65cce174f3e7a0dcb" },
  luopanBootstrap: { payload: "873c7d34361286a16d3043c875d4ce2ad636f81c9e6571229f32bfef9e943186", shape: "4bf26019c0f9b8dd5d8d1d564f7cc72b614ab941b7ea579c5211ff06abfb1191", strings: "8c7cd921d188f161eefb8ae7580082bd721071aed4cf401c8c732700a5203418" },
  luopanRingsW4: { payload: "453d02ea4a4d667437186f3350abbc4eb8bc980098294fbad706edd4b14c7468", shape: "ce13702eb31b39a4536817588c8f04c2db78bbdf057d8dc6159ce1b0e6d68e3b", strings: "f11fd3d1c018faf87b70638907591aea3e696112b0768e47ae64a7cb164c0fba" },
  luopanAnalysis: { payload: "29221e5707fee21e19dd53ffde2acf0e9143012827077b88c73de4a1d8f5932b", shape: "5a14eba88ddcd4f911a202e083e0819a6accc9bc270161484c96ea8b63753331", strings: "23bdcfefe36b4084b30e258c4476eed07ee13fa0d0a7da8fdb5a19d0f16907a7" },
  luopanSnapshot: { payload: "58d0e6afb1964f62b6f4a62100f08244fae9cfe59c79b67c5e13b89a2e265912", shape: "7a38aed90f9ef2f65aa15b18fe13f2dc3a6a2c4413a70316aa5c1f20213c2225", strings: "ef793e89628e8a33ae4a179c159e945ba0dfaedce70c5b7b791dcc51ae03cc64" },
  luopanMeasurementsGet: { payload: "f312aa2a702093b6d3768cb6b8a4a400ac6a3f71a449e37363ef680b944f5b4a", shape: "df35dc1249305258bb0b791bf9fc7566f4f9ef15fe18dc4af4554973e301d048", strings: "992bb35130a16e2f08820aff88c0607c344616822bffcee2694db3a68f0548b3" },
  luopanMeasurementsPost: { payload: "0edcf045643986f07f02091591331ce342ff11d1fb1194b6e2e04335c082c6f0", shape: "f815416acaa14a908a2ee1feed40c599e782c2955d312591cd56dc8e6262c012", strings: "ee03f867eeb72f1314a93b68f885ed837c5e72201aec4abfc7236b7f9e8ec0ab" },
  luopanSifu: { payload: "47b25e0a27ec159cc08276179b8af0c5f947a6d0a66b6d5b99fc6c12a617391a", shape: "76cf10da46b470b37cd1c44aec8fad60d0f74fac80fe718ef1954a198a0cff38", strings: "1e9da1950fd67b59f9632296da4bd19f887f00222da92c54b4cd8a8b88d722f2" },
  luopanVision: { payload: "630b8c96d2174b80917338fc652d00937780c9883a733a81c8fa12cf83c8606e", shape: "48b7372b339a4c18d6b8e61db49ac3a753d986afba652f142f4c3f3d83b42217", strings: "682b81d34956f71cbed8daefe57f3787964fc79138428adda8dbc871b305dda2" },
  sifuChat: { payload: "2441aaef9d822fbc649eea48118bc85556db0bf08d603e533e4d0436c8c351e5", shape: "6e27574b88654b2bb5551844a0915e384e961d03a5cf27742f89d3ecfe7c36f2", strings: "ab6c2e1ff9ab4aa4ef71f750be5804c0c7494adbe83fe204609ed3206f48da86" },
  sifuChatStream: { payload: "a3cb7240b9d72150bbb6974a1393982095b52530da01ef70920e1d4d891c7d86", shape: "3218c6106b70718eef99f2807ec13b562e7b3b9b62478b32a3c3576c8d313348", strings: "858551e902117fb97a5b1c3a7290bb32da8af9b3a659ed2cb11ac4556c465966" },
  sifuHistory: { payload: "8d524347bdadf825684e06c1542b116e20b3ee80b7fcf7c3f517b5744ddccb4d", shape: "4a1aded3219a2ce56d22b23d48e574358a0e6df68c4d33410c28afbd18796327", strings: "03ef83a307d59b4864e53e4ed192c2b7b000a4e874c3239180adb5492ac20d3f" },
  sifuGroup: { payload: "c0a32dec4d4ad364644b9862272af70ed764692970cb7e1608022202473a6478", shape: "2bc2a141793b8ccf35f5cbd0d32d9b1ee4442c2a9a4d0a2d18dcfe221b12c942", strings: "e60c0ca5ffa165ebfbc6a6d883fd0560ad97a55f628a7654b18ad42e29773368" },
});

export function fixtureFingerprintsForReview() {
  return Object.fromEntries(Object.entries(fixtureValues()).map(([key, value]) => [key, fixtureFingerprints(value)]));
}

function contractFailure(key, pointer) {
  return { ok: false, error: `fixture_contract ${key} ${pointer}` };
}

export function validateFixture(key, value) {
  const spec = SPEC_BY_KEY.get(key);
  if (!spec) return contractFailure(key, "/unknown-key");
  if (!value || typeof value !== "object" || Array.isArray(value)) return contractFailure(key, "/");
  if (value.ok !== true) return contractFailure(key, "/ok");
  if (key === "todayHours" && !Array.isArray(value.hours)) return contractFailure(key, "/hours");
  if (key === "todayDirections" && !Array.isArray(value.directions)) return contractFailure(key, "/directions");
  if (key === "calendar" && !Array.isArray(value.days)) return contractFailure(key, "/days");
  if (key === "network" && !Array.isArray(value.people)) return contractFailure(key, "/people");
  if ((key === "qimenBasic" || key === "qimenProfessional") && (!value.data || !Array.isArray(value.data.palaces))) return contractFailure(key, "/data/palaces");
  if (key === "luopanBootstrap" && (!value.ring_reference || !Array.isArray(value.ring_reference.mountains_24))) return contractFailure(key, "/ring_reference/mountains_24");
  if (key === "sifuChatStream" && !Array.isArray(value.events)) return contractFailure(key, "/events");
  for (const pointer of spec.requiredPointers) {
    const resolved = pointerValue(value, pointer);
    if (!resolved.found) return contractFailure(key, pointer);
  }
  const privacy = scanFixturePrivacy(key, value);
  if (!privacy.ok) return contractFailure(key, "/privacy");
  const expectedFingerprint = EXPECTED_FIXTURE_FINGERPRINTS[key];
  const actualFingerprint = fixtureFingerprints(value);
  if (
    !expectedFingerprint
    || actualFingerprint.payload !== expectedFingerprint.payload
    || actualFingerprint.shape !== expectedFingerprint.shape
    || actualFingerprint.strings !== expectedFingerprint.strings
  ) {
    return contractFailure(key, "/shape");
  }
  if (key === "todayHours" && value.hours.length !== 12) return contractFailure(key, "/hours");
  if (key === "todayDirections" && value.directions.length !== 8) return contractFailure(key, "/directions");
  if (key === "calendar" && (value.days.length !== 31 || value.total_days !== 31)) return contractFailure(key, "/days");
  if ((key === "qimenBasic" || key === "qimenProfessional") && value.data.palaces.length !== 9) return contractFailure(key, "/data/palaces");
  if (key === "luopanBootstrap" && value.ring_reference.mountains_24.length !== 24) return contractFailure(key, "/ring_reference/mountains_24");
  if (key === "sifuChatStream") {
    if (!Array.isArray(value.events) || value.events.length !== 4) return contractFailure(key, "/events");
    const expectedEvents = ["meta", "first", "chunk", "done"];
    if (value.events.some((event, index) => !event || typeof event !== "object" || event.event !== expectedEvents[index] || !event.data || typeof event.data !== "object")) return contractFailure(key, "/events");
    if (typeof value.events[1].data.ms !== "number" || value.events[2].data.text !== SYNTHETIC_REPLY || value.events[3].data.chars !== SYNTHETIC_REPLY.length) return contractFailure(key, "/events");
    if (Object.hasOwn(value.events[1].data, "text") || Object.hasOwn(value.events[3].data, "reply") || Object.hasOwn(value.events[0].data, "model")) return contractFailure(key, "/events");
  }
  return { ok: true };
}

export function validateFixtureSet(values) {
  try {
    if (!values || typeof values !== "object" || Array.isArray(values)) return contractFailure("set", "/");
    const keys = Object.keys(values).sort();
    const expected = FIXTURE_SPECS.map((spec) => spec.key).sort();
    if (canonicalJson(keys) !== canonicalJson(expected)) return contractFailure("set", "/keys");
    const selectedCalendarDay = values.calendar?.days?.find((day) => day?.date === FIXTURE_DATE);
    if (!selectedCalendarDay || canonicalJson(values.todayGoals?.goals) !== canonicalJson(selectedCalendarDay.goals)) return contractFailure("set", "/goals");
    if (canonicalJson(values.todayGoals?.intent_status) !== canonicalJson(selectedCalendarDay.intentStatus)) return contractFailure("set", "/intent-status");
    for (const spec of FIXTURE_SPECS) {
      const result = validateFixture(spec.key, values[spec.key]);
      if (!result.ok) return result;
    }
    if (values.datepickSave.saved_date.id !== values.datepickSaved.saved_dates[0].id || values.datepickDelete.id !== values.datepickSave.saved_date.id) return contractFailure("set", "/saved-date-id");
    if (values.luopanMeasurementsGet.rows[0].id !== values.luopanMeasurementsPost.measurement.id) return contractFailure("set", "/measurement-id");
    for (const qimenKey of ["qimenBasic", "qimenProfessional"]) {
      if (values[qimenKey].input.lat !== values[qimenKey].request_context.latitude || values[qimenKey].input.lng !== values[qimenKey].request_context.longitude) return contractFailure("set", `/qimen-location/${qimenKey}`);
    }
    if (values.network.count !== values.network.people.length) return contractFailure("set", "/network-count");
    if (canonicalJson(values.luopanBootstrap.ring_reference.mountains_24.map((item) => item.name)) !== canonicalJson(MOUNTAINS_24.map((item) => item.name))) return contractFailure("set", "/mountain-order");
    if (values.luopanRingsW4.mountain.code !== "SE3" || values.luopanAnalysis.measurement.facingMountain.code !== "SE3" || values.luopanAnalysis.measurement.sittingMountain.code !== "NW3") return contractFailure("set", "/luopan-degree-150");
    if (values.luopanSnapshot.layers.twenty_four.facing !== "巳" || values.luopanSnapshot.layers.twenty_four.sitting !== "亥") return contractFailure("set", "/snapshot-twenty-four");
    return { ok: true };
  } catch {
    return contractFailure("set", "/invalid");
  }
}

export function buildFixtureSet() {
  const values = fixtureValues();
  const validation = validateFixtureSet(values);
  if (!validation.ok) throw new Error(validation.error);
  return values;
}
