import { createHash } from "node:crypto";

export const SYNTHETIC_REPLY = "Synthetic fixture response.";

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
    cacheControl: options.cacheControl || "no-store",
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
  fixtureSpec("chart", "chart", "chart.sanitized.json", "GET|POST", "/api/mobile/v1/chart", ["/ok", "/pillars/day/stem", "/dayMaster", "/strength/percent", "/analysis/element_counts"], { aliases: [{ method: "GET", endpoint: "/api/mobile/v1/chart/[id]" }] }),
  fixtureSpec("calendar", "calendar", "calendar.sanitized.json", "GET|POST", "/api/mobile/v1/calendar", ["/ok", "/year", "/month", "/days/0/date", "/days/0/goals", "/days/0/intentStatus"], { syntheticPlan: "premium" }),
  fixtureSpec("network", "network", "network.sanitized.json", "GET", "/api/mobile/v1/network", ["/ok", "/date", "/count", "/people"], { syntheticPlan: "premium" }),
  fixtureSpec("networkSifu", "network", "network-sifu.sanitized.json", "POST", "/api/mobile/v1/network/sifu", ["/ok", "/reply", "/mode"], { syntheticPlan: "premium" }),
  fixtureSpec("networkBulk", "network", "network-bulk.sanitized.json", "POST", "/api/mobile/v1/network/bulk", ["/ok", "/count", "/people"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("qimenBasic", "qimen", "qimen-basic.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/entitlement/revision", "/request_context/entitlement_revision", "/data/palaces/8/palace_id"], { variant: "free-basic", syntheticPlan: "free-post-trial" }),
  fixtureSpec("qimenProfessional", "qimen", "qimen-professional.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/entitlement/revision", "/request_context/entitlement_revision", "/data/palaces/8/advanced_qimen_layers"], { variant: "master-technical", syntheticPlan: "master" }),
  fixtureSpec("qimenSearch", "qimen", "qimen-search.sanitized.json", "POST", "/api/mobile/v1/qimen/search", ["/ok", "/mode", "/dateFrom", "/dateTo", "/top", "/request_context/date_from", "/request_context/date_to", "/request_context/mode"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("qimenSifu", "qimen", "qimen-sifu.sanitized.json", "POST", "/api/mobile/v1/qimen/sifu", ["/ok", "/reply"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("datepick", "datepick", "datepick.sanitized.json", "POST", "/api/mobile/v1/datepick", ["/ok", "/candidates/0/datetime/start", "/candidates/0/scoring/finalScore", "/funnelStats"], { syntheticPlan: "premium" }),
  fixtureSpec("datepickSave", "datepick", "datepick-save.sanitized.json", "POST", "/api/mobile/v1/datepick/save", ["/ok", "/saved_date/id", "/saved_date/datetime/start"], { status: 201 }),
  fixtureSpec("datepickSaved", "datepick", "datepick-saved.sanitized.json", "GET", "/api/mobile/v1/datepick/saved", ["/ok", "/count", "/saved_dates/0/id"]),
  fixtureSpec("datepickDelete", "datepick", "datepick-delete.sanitized.json", "DELETE", "/api/mobile/v1/datepick/saved/[id]", ["/ok", "/deleted", "/id"]),
  fixtureSpec("luopanRings", "luopan", "luopan-rings.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/degree", "/mountain/code", "/sections/hex64"], { variant: "free-locked", cacheControl: "private, max-age=300", syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanBootstrap", "luopan", "luopan-bootstrap.sanitized.json", "GET", "/api/mobile/v1/luopan/bootstrap", ["/ok", "/ring_reference/mountains_24/0/code", "/ring_reference/mountains_24/23/code", "/request_context/entitlement_revision"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanRingsW4", "luopan", "luopan-rings-w4.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/hex64/id", "/fenjin120/index", "/yao384/id"], { variant: "master-open", cacheControl: "private, max-age=300", syntheticPlan: "master" }),
  fixtureSpec("luopanAnalysis", "luopan", "luopan-analysis.sanitized.json", "POST", "/api/mobile/v1/luopan/analysis", ["/ok", "/measurement/pass", "/core/facing", "/core/sitting", "/core/three_plates", "/core/tigua", "/core/xuan_kong", "/core/pin_warnings"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanSnapshot", "luopan", "luopan-snapshot.sanitized.json", "GET", "/api/mobile/v1/luopan/snapshot", ["/ok", "/datetime/gregorian", "/layers/flying_stars/palaces"], { variant: "master", syntheticPlan: "master" }),
  fixtureSpec("luopanMeasurementsGet", "luopan", "luopan-measurements-get.sanitized.json", "GET", "/api/mobile/v1/luopan/measurements", ["/ok", "/rows/0/id", "/rows/0/heading_deg"], { syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanMeasurementsPost", "luopan", "luopan-measurements-post.sanitized.json", "POST", "/api/mobile/v1/luopan/measurements", ["/ok", "/measurement/id", "/gate/pass"], { status: 201, syntheticPlan: "free-post-trial" }),
  fixtureSpec("luopanSifu", "luopan", "luopan-sifu.sanitized.json", "POST", "/api/mobile/v1/luopan/sifu", ["/ok", "/reply"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("luopanVision", "luopan", "luopan-vision.sanitized.json", "POST", "/api/mobile/v1/luopan/vision", ["/ok", "/reply", "/cost_yam"], { variant: "premium", syntheticPlan: "premium" }),
  fixtureSpec("sifuChat", "sifu", "sifu-chat.sanitized.json", "POST", "/api/mobile/v1/sifu/chat", ["/ok", "/reply", "/source"], { variant: "json" }),
  fixtureSpec("sifuChatStream", "sifu", "sifu-chat-stream.sanitized.json", "POST", "/api/mobile/v1/sifu/chat?stream=1", ["/ok", "/events/0/event", "/events/3/event", "/events/3/data/reply"], { variant: "sse-projection", contentType: "text/event-stream", cacheControl: "no-cache" }),
  fixtureSpec("sifuHistory", "sifu", "sifu-history.sanitized.json", "GET", "/api/mobile/v1/sifu/history", ["/ok", "/history/0/question", "/history/0/answer"]),
  fixtureSpec("sifuGroup", "sifu", "sifu-group.sanitized.json", "POST", "/api/mobile/v1/sifu/group", ["/ok", "/reply", "/mode", "/count"]),
]);

const SPEC_BY_KEY = new Map(FIXTURE_SPECS.map((spec) => [spec.key, spec]));
const FIXTURE_DATE = "2026-07-14";
const SAVED_DATE_ID = "fixture-saved-date-01";
const MEASUREMENT_ID = "fixture-measurement-01";

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
const PALACE_DIRECTIONS = Object.freeze(["SE", "S", "SW", "E", "C", "W", "NE", "N", "NW"]);
const DOORS = Object.freeze(["杜門", "景門", "死門", "傷門", "中門", "驚門", "生門", "休門", "開門"]);
const STARS = Object.freeze(["天輔", "天英", "天芮", "天沖", "天禽", "天柱", "天任", "天蓬", "天心"]);
const DEITIES = Object.freeze(["九地", "九天", "玄武", "六合", "值符", "白虎", "太陰", "螣蛇", "值使"]);
const QIMEN_STEMS = Object.freeze(["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function accessState(plan) {
  return {
    in_trial: false,
    legacy_free: false,
    sub_active: plan === "premium" || plan === "master",
    trial_ends_at: plan === "free" ? "2026-06-30T17:00:00.000Z" : null,
    sub_expires_at: plan === "premium" || plan === "master" ? "2027-07-13T17:00:00.000Z" : null,
  };
}

function syntheticDigest(value) {
  return `sha256:${sha256(JSON.stringify(canonicalize(value)))}`;
}

function featureEntitlement(plan, feature) {
  const contract_version = "entitlements-v3-20260711";
  const access_state = accessState(plan);
  const caps = clone(PLAN_CAPS[plan][feature]);
  const caps_hash = syntheticDigest({ plan, projected_caps: { [feature]: caps } });
  const revision = syntheticDigest({ access_state, caps_hash, contract_version, plan });
  return { access_state, caps, caps_hash, contract_version, feature, plan, revision };
}

function qimenEntitlement(plan) {
  return featureEntitlement(plan, "qimen");
}

function qimenContext(plan, systemType = "hour") {
  return {
    date: FIXTURE_DATE,
    entitlement_revision: qimenEntitlement(plan).revision,
    location_source: "mobile_explicit",
    school: "chaibu",
    system_type: systemType,
    time: "09:00",
  };
}

function qimenPalaces(professional) {
  return Array.from({ length: 9 }, (_, index) => {
    const palace = {
    advanced_qimen_layers: professional ? [{ code: `fixture-layer-${index + 1}`, status: "ready" }] : [],
    beginner_reading: {
      code: `fixture-reading-${index + 1}`,
      has_engine_score: true,
      is_actionable: true,
      label_th: `วังตัวอย่าง ${index + 1}`,
      no_score_mutation: true,
      summary_th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา",
      verdict_allowed: true,
    },
    deity_name_th: `เทพตัวอย่าง ${index + 1}`,
    deity_zh: DEITIES[index],
    direction: PALACE_DIRECTIONS[index],
    display_level: index >= 6 ? "good" : "neutral",
    display_score: 52 + index * 4,
    door_action_advice_th: "ใช้ตรวจรูปแบบข้อมูลเท่านั้น",
    door_name_th: `ประตูตัวอย่าง ${index + 1}`,
    door_quality: index >= 6 ? "good" : "neutral",
    door_zh: DOORS[index],
    earth_stem_zh: QIMEN_STEMS[index],
    grid_col: index % 3,
    grid_row: Math.floor(index / 3),
    heaven_stem_zh: QIMEN_STEMS[(index + 3) % QIMEN_STEMS.length],
    is_traveling_horse: index === 6,
    is_void_any: index === 1,
    palace_id: index + 1,
    star_name_th: `ดาวตัวอย่าง ${index + 1}`,
    star_zh: STARS[index],
    trigram_zh: ["巽", "離", "坤", "震", "中", "兌", "艮", "坎", "乾"][index],
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
  return {
    data: {
      ...(professional ? { calculation: { input_timezone: "Asia/Bangkok", readiness: { status: "ready" } } } : {}),
      chart: {
        chief_star_code: "天心",
        dun_type: "陽遁",
        ju_number: 5,
        pillar_zh: "甲子",
        system_type: "hour",
        void_hour_zh: ["戌", "亥"],
        zhi_shi_door_code: "開門",
      },
      palaces: qimenPalaces(professional),
    },
    entitlement: qimenEntitlement(plan),
    ok: true,
    product: {
      plan,
      qimen: clone(caps),
    },
    request_context: qimenContext(plan),
  };
}

function hourRows() {
  return BRANCHES.map((branch, index) => ({
    branch,
    clash_reasons: index === 6 ? ["fixture-clash"] : [],
    element: ["water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water"][index],
    isNow: index === 4,
    label: `${String(index * 2).padStart(2, "0")}:00–${String((index * 2 + 1) % 24).padStart(2, "0")}:59`,
    locked: false,
    name_th: `ยาม${branch}`,
    quality: ["good", "ok", "best", "good", "best", "good", "bad", "ok", "good", "best", "ok", "good"][index],
    range: `${String(index * 2).padStart(2, "0")}:00-${String((index * 2 + 2) % 24).padStart(2, "0")}:00`,
    reason_th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา",
    stem: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸", "甲", "乙"][index],
  }));
}

function directionRows() {
  return DIRECTIONS.map((direction, index) => ({
    direction,
    direction_th: ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"][index],
    direction_zh: ["北", "東北", "東", "東南", "南", "西南", "西", "西北"][index],
    element: ["water", "earth", "wood", "wood", "fire", "earth", "metal", "metal"][index],
    quality: index === 2 ? "best" : index === 6 ? "avoid" : index % 2 === 0 ? "good" : "ok",
    stars: [{ good: index !== 6, han: STARS[index], name: `ดาวตัวอย่าง ${index + 1}` }],
  }));
}

function directionEnergy() {
  return DIRECTIONS.map((direction, index) => ({
    direction,
    label: index === 2 ? "best" : index === 6 ? "avoid" : "good",
    locked: false,
    qimen: { score: 60 + index, signal: `fixture-qimen-${index + 1}` },
    reasons: ["ข้อมูลสังเคราะห์สำหรับตรวจสัญญา"],
    score: index === 2 ? 88 : index === 6 ? 32 : 60 + index,
    zibai: { score: 58 + index, signal: `fixture-zibai-${index + 1}` },
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
    pillars: { day: { branch: "子", stem: "甲" }, hour: { branch: "巳", stem: "己" } },
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

function fixtureValues() {
  const calendarDay = {
    branch: "子",
    date: FIXTURE_DATE,
    day: 14,
    day_officer: "建",
    goals: clone(GOALS),
    gods: { bad: ["fixture-bad-god"], good: ["fixture-good-god"], unknown: [] },
    intentStatus: clone(INTENT_STATUS),
    ji: ["กิจกรรมตัวอย่างที่ควรเลี่ยง"],
    lunar: "六月初一",
    nine_star: 6,
    pillar: "甲子",
    stem: "甲",
    topIntents: [{ icon: "◎", id: "wealth", tier: "good" }],
    twenty_eight_star: "角",
    twelve_star: "建",
    verdict: { label: "吉", level: "favorable", score: 72, tags: ["fixture"] },
    worstIntents: [{ icon: "△", id: "love", tier: "neutral" }],
    yi: ["กิจกรรมตัวอย่างที่เหมาะสม"],
  };

  return {
    today: {
      date: FIXTURE_DATE,
      entitlement: { ...clone(PLAN_CAPS.premium.today), plan: "premium" },
      hex: { changing_line: 1, en: "Creative", num: 1, symbol: "䷀", th: "สร้างสรรค์", zh: "乾" },
      ok: true,
      pillars: { day: "甲子", month: "乙未", year: "丙午" },
      profile: null,
      request_context: { date: FIXTURE_DATE, location_source: "mobile_explicit", timezone: "Asia/Bangkok" },
      source: "api/today",
      tongshu: { day_officer: "建", gods: ["fixture-good-god"], ji: ["กิจกรรมตัวอย่างที่ควรเลี่ยง"], lunar: "六月初一", nine_star: "六白", twelve_star: "建", twentyeight_star: "角", yi: ["กิจกรรมตัวอย่างที่เหมาะสม"] },
      userSummary: { confidence: 0.8, dm_element: "wood", dm_label_th: "ไม้หยาง", dm_stem: "甲", jishen: [{ el: "metal", th: "ทอง" }], primary: [{ el: "wood", is_dominant: true, th: "ไม้" }], strategy: "fixture", structure: "balanced", xishen: [{ el: "water", th: "น้ำ" }] },
      verdict: { flags: [], jishen: ["metal"], label: "吉", level: "favorable", score: 72, source: "calendar-engine", tags: ["fixture"], targetDate: FIXTURE_DATE, yongshen: ["water"] },
    },
    todayHours: {
      avoid_window: { end: "15:00", start: "13:00" },
      calm_window: { end: "19:00", start: "17:00" },
      clash_branch: "午",
      date: FIXTURE_DATE,
      day_branch: "子",
      day_pillar: "甲子",
      golden_window: { end: "11:00", start: "09:00" },
      hours: hourRows(),
      entitlement: { detailed_hours: 12, plan: "premium", technical: false, total_hours: 12 },
      jishen: ["metal"],
      liushi: null,
      ok: true,
      profile: null,
      source: "/api/today/hours",
      user_branch: null,
      yongshen: ["water"],
    },
    todayDirections: {
      date: FIXTURE_DATE,
      direction_energy: { avoid: [directionEnergy()[6]], best: [directionEnergy()[2]], school: "chaibu", school_label: "拆補", scores: directionEnergy(), source: { degraded: false, qimen: "r515", zibai: "r515" } },
      directions: directionRows(),
      entitlement: { detailed_directions: PLAN_CAPS.premium.today.directions, plan: "premium", total_directions: 8 },
      ok: true,
      profile: null,
      request_context: { date: FIXTURE_DATE, local_time: "09:00", location_source: "mobile_explicit", school: "chaibu", timezone: "Asia/Bangkok" },
      source: "/api/today/directions",
      summary: { avoid: ["W"], good: ["E", "SE"] },
    },
    todayGoals: {
      complete: true,
      date: FIXTURE_DATE,
      entitlement: { ...clone(PLAN_CAPS.premium.today), plan: "premium" },
      goals: clone(GOALS),
      intent_status: clone(INTENT_STATUS),
      locked_goals: [],
      ok: true,
      profile: null,
      source: "/api/calendar",
    },
    chart: {
      analysis: { element_counts: { earth: 2, fire: 1, metal: 1, water: 2, wood: 2 }, geJu: { structure: "fixture-balanced" }, ten_gods_map: { day: "比肩", hour: "正財", month: "正印", year: "食神" }, tiao_hou: { status: "ready" }, useful_god: ["water"] },
      dayMaster: "甲",
      ok: true,
      pillars: { day: { branch: "子", stem: "甲" }, hour: { branch: "巳", stem: "己" }, month: { branch: "未", stem: "乙" }, year: { branch: "午", stem: "丙" } },
      profile: null,
      source: "mobile-r515-synthetic-contract",
      strength: { level: "balanced", percent: 58 },
      yongshen: ["water"],
    },
    calendar: {
      days: [calendarDay],
      dm: null,
      entitlement: { goals: "all", plan: "premium" },
      friendly_elements: ["water", "wood"],
      month: 7,
      month_pillar: "乙未",
      month_pillar_label: "เดือน乙未",
      ok: true,
      personal_available: false,
      primary_yongshen: ["water"],
      profile: null,
      score_policy: "r515",
      score_source: "calendar-engine",
      source: "mobile-r515-synthetic-contract",
      total_days: 1,
      year: 2026,
      year_pillar: "丙午",
    },
    network: {
      active_profile: { day_master: "甲", name: "Fixture Center" },
      count: 2,
      date: FIXTURE_DATE,
      entitlement: {
        saved_profiles: 10, visualization_profiles: 10, groups: 4, group_people: 10,
        pair_compare: "full", team_analysis: false, team_people: 0, pair_ai: "full",
        team_ai: false, bulk_ai: false, plan: "premium",
      },
      locked_people: [],
      meta: { locked_profiles: 0, scored_profiles: 2, total_profiles: 3 },
      ok: true,
      people: [
        { day_master: "丙", guidance: null, name: "Fixture Person A", scores: { day: 74, overall: 70 }, tags: ["support"] },
        { day_master: "辛", guidance: null, name: "Fixture Person B", scores: { day: 48, overall: 55 }, tags: ["caution"] },
      ],
      source: "api/network/score",
      version: "r515",
    },
    networkSifu: { balance_after: 99, mode: "pair", ok: true, reply: SYNTHETIC_REPLY, source: "/api/network/sifu", spent: 1 },
    networkBulk: { balance_after: 100, count: 0, ok: true, people: [], raw_count: 0, spent: 0 },
    qimenBasic: qimenFixture("free"),
    qimenProfessional: qimenFixture("master"),
    qimenSearch: {
      activity: "wealth",
      dateFrom: FIXTURE_DATE,
      dateTo: "2026-07-16",
      mode: "activity",
      ok: true,
      request_context: { date_from: FIXTURE_DATE, date_to: "2026-07-16", location_source: "mobile_explicit", mode: "activity", school: "chaibu" },
      school: "chaibu",
      filters: { peopleBranches: [], useBazi: false, useFly9: true, useHeluo: true, useJianchu: true, useShen12: true, useTaisui: true, useTongshu: true, useXiu28: true },
      stats: { bazi_cut: 0, fly9_cut: 0, heluo_cut: 0, jianchu_cut: 0, shen12_cut: 0, taisui_cut: 0, tongshu_cut: 0, xiu28_cut: 0, yongshen_cut: 0 },
      today_failed_dates: 0,
      today_loaded_dates: 3,
      top: [{ date: FIXTURE_DATE, datetime: "2026-07-14T09:00:00+07:00", deity: "九天", direction: "E", door: "生門", earth_stem: "戊", heaven_stem: "丙", ju_number: 5, ju_pole: "陽遁", matches: ["生門"], palace_id: 4, score: 82, star: "天任", time: "09:00", tongshu: { day_officer: "建", ji: [], yi: ["กิจกรรมตัวอย่างที่เหมาะสม"] }, yongshen_intent: "wealth", yongshen_targets: ["water"] }],
      total_matched: 1,
      total_scanned: 36,
    },
    qimenSifu: { balance_after: 99, ok: true, reply: SYNTHETIC_REPLY, spent: 1 },
    datepick: {
      allCut: false,
      candidates: [{
        calendar: { gregorianDate: "2026-07-20", shichen: 5, shichenBranch: "巳" },
        datetime: { end: "2026-07-20T11:00:00+07:00", start: "2026-07-20T09:00:00+07:00", timezone: "Asia/Bangkok" },
        display: { badges: [{ color: "gold", emoji: "◎", label: "fixture" }], guardrails: ["ข้อมูลสังเคราะห์"], summary: "Synthetic auspicious candidate." },
        donggong: { jianchu: "建", level: "good", missing: false, th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา" },
        huangdao: { deity_th: "เทพตัวอย่าง", deity_zh: "青龍", good: true, path_th: "วิถีตัวอย่าง", path_zh: "黃道" },
        id: "fixture-candidate-01",
        modules: { qi_men: { raw: { deity: "九天", direction: "E", door: "生門", ju_number: 5, palace_id: 4, star: "天任" } }, twelve_officers: { raw: { officer: "建" } } },
        pillars: { day: { branch: "子", stem: "甲" }, hour: { branch: "巳", stem: "己" }, month: { branch: "未", stem: "乙" }, year: { branch: "午", stem: "丙" } },
        richong: { clash_branch_zh: "午", zodiac_th: "ม้า", zodiac_zh: "馬" },
        scoring: { action: "use", activeModules: ["qi_men", "twelve_officers"], finalScore: 82, moduleScores: { qi_men: 84, twelve_officers: 80 }, reasonsDown: [], reasonsUp: [{ code: "fixture-up", delta: 4, thai: "เหตุผลสังเคราะห์" }], tier: "A", warnings: [] },
      }],
      cutSlots: [],
      funnelStats: { baseTotal: 12, finalCount: 1, perModule: { qi_men: { failed: 2, passed: 10 } }, personCut: 0, personHard: false, total: 12, vetoCut: 0 },
      meta: { activityType: "開市", durationMs: 12, entitlement: { max_range_days: 90, max_results: 50, modules_allowed: ["qi_men"], modules_stripped: [], plan: "premium" } },
      ok: true,
      source: "mobile-r515-synthetic-contract",
    },
    datepickSave: { ok: true, saved_date: savedDate() },
    datepickSaved: { count: 1, ok: true, saved_dates: [savedDate()] },
    datepickDelete: { deleted: true, id: SAVED_DATE_ID, ok: true },
    luopanRings: ringFixture(false),
    luopanBootstrap: {
      contract_version: "mobile-luopan-v1",
      entitlement: {
        ...featureEntitlement("master", "luopan"),
        house_limit: PLAN_CAPS.master.fengshui.houses,
        mode: PLAN_CAPS.master.luopan.mode,
        multi_profile: PLAN_CAPS.master.fengshui.multi_profile,
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
      request_context: { entitlement_revision: featureEntitlement("master", "luopan").revision },
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
      datetime: { day_pillar: "甲子", gregorian: "2026-07-14T02:00:00.000Z", hour_pillar: "己巳", month_pillar: "乙未", shichen: "巳", solar_term: "小暑", year_pillar: "丙午" },
      entitlement: { ...clone(PLAN_CAPS.master.fengshui), plan: "master" },
      house: { face_angle: "150.000", facing_direction: "SE", facing_mountain: "巳", family_members: [], lat: null, lng: null, name: "Fixture House", sit_angle: "330.000" },
      layers: {
        ai_xing: { mountain_star: 2, period_star: 9, sitting_mountain: "亥", water_star: 5 },
        ba_zhai: [],
        day_stars: null,
        flying_stars: { annual_center: 1, annual_center_source: "json_centre_star", feng_shui_year: 2026, palaces: snapshotPalaces(), period: 9 },
        hour_stars: null,
        luxing_note: null,
        month_stars: null,
        qi_men: { dun_type: "陽遁", ju_number: 5 },
        sixty_four: { facing_hex: 27 },
        twenty_four: { face_angle: 150, facing: "巳", mountains: MOUNTAINS_24.map((row) => row.name), sitting: "亥" },
        year_stars: null,
      },
      ok: true,
      recommendations: [],
      today: { five_element: "土", twelve_officers: null, twelve_spirits: null, twenty_eight: null },
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
    sifuChat: { balance_after: 99, cached: false, ms: 12, ok: true, reply: SYNTHETIC_REPLY, source: "mobile-r515-synthetic-contract", spent: 1 },
    sifuChatStream: {
      cacheControl: "no-cache",
      contentType: "text/event-stream",
      events: [
        { data: { source: "mobile-r515-synthetic-contract" }, event: "meta" },
        { data: { text: "Synthetic " }, event: "first" },
        { data: { text: "fixture response." }, event: "chunk" },
        { data: { reply: SYNTHETIC_REPLY }, event: "done" },
      ],
      ok: true,
    },
    sifuHistory: { history: [{ answer: null, cached: false, created_at: "2026-07-14T02:00:00.000Z", feature: "sifu", id: "fixture-history-01", lang: "th", mode: "single", profile_id: null, question: null, topic: "overview" }], ok: true, source: "mobile-r515-synthetic-contract" },
    sifuGroup: { balance_after: 99, count: 2, mode: "group", ok: true, reply: SYNTHETIC_REPLY, source: "mobile-r515-synthetic-contract", spent: 1 },
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

const FORBIDDEN_IDENTITY_KEYS = new Set([
  "authorization", "cookie", "set_cookie", "access_token", "refresh_token", "token",
  "auth_token", "session_token", "api_key", "client_secret", "password", "passcode",
  "secret", "credential", "credentials", "session_id", "email", "email_address", "phone",
  "phone_number", "address", "home_address", "birth_date", "birth_datetime", "birth_date_time", "birth_time",
  "org_id", "organization_id", "user_id", "account_id", "device_id", "profile_id",
  "people_ids", "latitude", "longitude", "lat", "lng", "gps", "coordinates",
  "image_base64", "image_url",
]);
const PRIVATE_TEXT_KEYS = new Set(["question", "prompt", "query", "message", "answer", "guidance", "private_note", "content", "response", "transcript"]);
const APPROVED_SYNTHETIC_NAMES = new Set(["Fixture Center", "Fixture Person A", "Fixture Person B", "Fixture House"]);
const SNAPSHOT_WARNING_TEXT = new Set([
  "五黃 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "二黑 อยู่ทิศ NW · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "三煞 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "太歲 อยู่ทิศ S · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
  "歲破 อยู่ทิศ N · ข้อมูลสังเคราะห์เพื่อทดสอบสัญญา",
]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BEARER_PATTERN = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/;
const SECRET_PATTERN = /\b(?:sk|pk|sec|tok)[_-][A-Za-z0-9_-]{8,}\b/i;
const CREDENTIAL_KEY_PATTERN = /(?:^|_)(?:auth|authorization|cookie|credential|credentials|passcode|password|secret|token)(?:_|$)|(?:^|_)api_key(?:_|$)/;
const IDENTITY_KEY_PATTERN = /(?:^|_)(?:account|device|org|organization|profile|session|user)_(?:id|ids|uuid|uuids)(?:_|$)/;
const COORDINATE_KEY_PATTERN = /(?:^|_)(?:coordinate|coordinates|gps|lat|latitude|lng|longitude)(?:_|$)/;

export function scanFixturePrivacy(key, value) {
  const findings = [];
  const normalizeKey = (input) => input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const visit = (current, pointer) => {
    if (typeof current === "string") {
      if (EMAIL_PATTERN.test(current)) findings.push(`${pointer || "/"}:email`);
      if (UUID_PATTERN.test(current)) findings.push(`${pointer || "/"}:uuid`);
      if (BEARER_PATTERN.test(current) || JWT_PATTERN.test(current) || SECRET_PATTERN.test(current)) findings.push(`${pointer || "/"}:secret-shape`);
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    for (const [childKey, childValue] of Object.entries(current)) {
      const normalized = normalizeKey(childKey);
      const childPointer = `${pointer}/${childKey}`;
      const normalizedParents = pointer.split("/").filter(Boolean).map(normalizeKey);
      const identityParent = normalizedParents.some((segment) => [
        "account", "active_profile", "house", "houses", "people", "profile", "profiles", "user",
      ].includes(segment));
      const sensitiveKey = FORBIDDEN_IDENTITY_KEYS.has(normalized)
        || CREDENTIAL_KEY_PATTERN.test(normalized)
        || IDENTITY_KEY_PATTERN.test(normalized)
        || COORDINATE_KEY_PATTERN.test(normalized)
        || (normalized === "id" && identityParent);
      if (sensitiveKey && childValue !== null && childValue !== "") {
        findings.push(`${childPointer}:forbidden-key`);
      }
      if (PRIVATE_TEXT_KEYS.has(normalized) && childValue !== null && childValue !== "") findings.push(`${childPointer}:private-text`);
      if (normalized === "reply" && childValue !== null && childValue !== SYNTHETIC_REPLY) findings.push(`${childPointer}:reply`);
      if (normalized === "text" && childValue !== null && childValue !== "") {
        const approvedStream = key === "sifuChatStream"
          && ((childPointer === "/events/1/data/text" && childValue === "Synthetic ")
            || (childPointer === "/events/2/data/text" && childValue === "fixture response."));
        const approvedWarning = key === "luopanSnapshot"
          && /^\/warnings\/\d+\/text$/.test(childPointer)
          && SNAPSHOT_WARNING_TEXT.has(childValue);
        if (!approvedStream && !approvedWarning) findings.push(`${childPointer}:private-text`);
      }
      if (normalized === "name" && identityParent && typeof childValue === "string" && !APPROVED_SYNTHETIC_NAMES.has(childValue)) {
        findings.push(`${childPointer}:personal-name`);
      }
      visit(childValue, childPointer);
    }
  };
  visit(value, "");
  return { key, ok: findings.length === 0, findings };
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
  if (key === "todayHours" && value.hours.length !== 12) return contractFailure(key, "/hours");
  if (key === "todayDirections" && value.directions.length !== 8) return contractFailure(key, "/directions");
  if ((key === "qimenBasic" || key === "qimenProfessional") && value.data.palaces.length !== 9) return contractFailure(key, "/data/palaces");
  if (key === "luopanBootstrap" && value.ring_reference.mountains_24.length !== 24) return contractFailure(key, "/ring_reference/mountains_24");
  if (key === "sifuChatStream") {
    if (!Array.isArray(value.events) || value.events.length !== 4) return contractFailure(key, "/events");
    const expectedEvents = ["meta", "first", "chunk", "done"];
    if (value.events.some((event, index) => !event || typeof event !== "object" || event.event !== expectedEvents[index] || !event.data || typeof event.data !== "object")) return contractFailure(key, "/events");
    if (value.events[1].data.text !== "Synthetic " || value.events[2].data.text !== "fixture response." || value.events[3].data.reply !== SYNTHETIC_REPLY) return contractFailure(key, "/events");
    if (`${value.events[1].data.text}${value.events[2].data.text}` !== SYNTHETIC_REPLY) return contractFailure(key, "/events");
  }
  const privacy = scanFixturePrivacy(key, value);
  if (!privacy.ok) return contractFailure(key, privacy.findings[0].split(":")[0]);
  return { ok: true };
}

export function validateFixtureSet(values) {
  try {
    if (!values || typeof values !== "object" || Array.isArray(values)) return contractFailure("set", "/");
    const keys = Object.keys(values).sort();
    const expected = FIXTURE_SPECS.map((spec) => spec.key).sort();
    if (canonicalJson(keys) !== canonicalJson(expected)) return contractFailure("set", "/keys");
    for (const spec of FIXTURE_SPECS) {
      const result = validateFixture(spec.key, values[spec.key]);
      if (!result.ok) return result;
    }
    if (canonicalJson(values.todayGoals.goals) !== canonicalJson(values.calendar.days[0].goals)) return contractFailure("set", "/goals");
    if (canonicalJson(values.todayGoals.intent_status) !== canonicalJson(values.calendar.days[0].intentStatus)) return contractFailure("set", "/intent-status");
    if (values.datepickSave.saved_date.id !== values.datepickSaved.saved_dates[0].id || values.datepickDelete.id !== values.datepickSave.saved_date.id) return contractFailure("set", "/saved-date-id");
    for (const qimenKey of ["qimenBasic", "qimenProfessional"]) {
      if (values[qimenKey].entitlement.revision !== values[qimenKey].request_context.entitlement_revision) return contractFailure("set", `/qimen-revision/${qimenKey}`);
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
