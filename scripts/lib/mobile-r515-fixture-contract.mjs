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
    aliases: Object.freeze([...(options.aliases || [])]),
    variant: options.variant || "default",
    status: options.status || 200,
    contentType: options.contentType || JSON_CONTENT_TYPE,
    cacheControl: options.cacheControl || "no-store",
    requiredPointers: Object.freeze([...requiredPointers]),
    retainedClasses: Object.freeze([...(options.retainedClasses || DEFAULT_RETAINED)]),
    removedClasses: Object.freeze([...(options.removedClasses || DEFAULT_REMOVED)]),
  });
}

export const FIXTURE_SPECS = Object.freeze([
  fixtureSpec("today", "today", "today.sanitized.json", "GET|POST", "/api/mobile/v1/today", ["/ok", "/date", "/pillars/day", "/verdict/score", "/tongshu/yi"]),
  fixtureSpec("todayHours", "hours", "today-hours.sanitized.json", "GET|POST", "/api/mobile/v1/today/hours", ["/ok", "/date", "/hours/0/branch", "/hours/11/branch"]),
  fixtureSpec("todayDirections", "directions", "today-directions.sanitized.json", "GET|POST", "/api/mobile/v1/today/directions", ["/ok", "/date", "/directions/0/direction", "/directions/7/direction", "/direction_energy/scores"]),
  fixtureSpec("todayGoals", "goals", "today-goals.sanitized.json", "GET", "/api/mobile/v1/today/goals", ["/ok", "/date", "/goals/wealth", "/goals/travel", "/intent_status"]),
  fixtureSpec("chart", "chart", "chart.sanitized.json", "GET|POST", "/api/mobile/v1/chart", ["/ok", "/pillars/day/stem", "/dayMaster", "/strength/percent", "/analysis/element_counts"], { aliases: ["/api/mobile/v1/chart/[id]"] }),
  fixtureSpec("calendar", "calendar", "calendar.sanitized.json", "GET|POST", "/api/mobile/v1/calendar", ["/ok", "/year", "/month", "/days/0/date", "/days/0/goals", "/days/0/intentStatus"]),
  fixtureSpec("network", "network", "network.sanitized.json", "GET", "/api/mobile/v1/network", ["/ok", "/date", "/count", "/people"]),
  fixtureSpec("networkSifu", "network", "network-sifu.sanitized.json", "POST", "/api/mobile/v1/network/sifu", ["/ok", "/reply", "/mode"]),
  fixtureSpec("networkBulk", "network", "network-bulk.sanitized.json", "POST", "/api/mobile/v1/network/bulk", ["/ok", "/count", "/people"]),
  fixtureSpec("qimenBasic", "qimen", "qimen-basic.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/entitlement/revision", "/request_context/entitlement_revision", "/data/palaces/8/palace_id"], { variant: "basic" }),
  fixtureSpec("qimenProfessional", "qimen", "qimen-professional.sanitized.json", "POST", "/api/mobile/v1/qimen", ["/ok", "/entitlement/revision", "/request_context/entitlement_revision", "/data/palaces/8/advanced_qimen_layers"], { variant: "professional" }),
  fixtureSpec("qimenSearch", "qimen", "qimen-search.sanitized.json", "POST", "/api/mobile/v1/qimen/search", ["/ok", "/entitlement/revision", "/request_context/entitlement_revision", "/results"]),
  fixtureSpec("qimenSifu", "qimen", "qimen-sifu.sanitized.json", "POST", "/api/mobile/v1/qimen/sifu", ["/ok", "/reply"]),
  fixtureSpec("datepick", "datepick", "datepick.sanitized.json", "POST", "/api/mobile/v1/datepick", ["/ok", "/candidates/0/datetime/start", "/candidates/0/scoring/finalScore", "/funnelStats"]),
  fixtureSpec("datepickSave", "datepick", "datepick-save.sanitized.json", "POST", "/api/mobile/v1/datepick/save", ["/ok", "/saved_date/id", "/saved_date/datetime/start"], { status: 201 }),
  fixtureSpec("datepickSaved", "datepick", "datepick-saved.sanitized.json", "GET", "/api/mobile/v1/datepick/saved", ["/ok", "/count", "/saved_dates/0/id"]),
  fixtureSpec("datepickDelete", "datepick", "datepick-delete.sanitized.json", "DELETE", "/api/mobile/v1/datepick/saved/[id]", ["/ok", "/deleted", "/id"]),
  fixtureSpec("luopanRings", "luopan", "luopan-rings.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/degree", "/mountain/code", "/sections/hex64"], { variant: "locked" }),
  fixtureSpec("luopanBootstrap", "luopan", "luopan-bootstrap.sanitized.json", "GET", "/api/mobile/v1/luopan/bootstrap", ["/ok", "/ring_reference/mountains_24/0/code", "/ring_reference/mountains_24/23/code"]),
  fixtureSpec("luopanRingsW4", "luopan", "luopan-rings-w4.sanitized.json", "GET", "/api/mobile/v1/luopan/rings", ["/ok", "/hex64/id", "/fenjin120/index", "/yao384/id"], { variant: "w4-open" }),
  fixtureSpec("luopanAnalysis", "luopan", "luopan-analysis.sanitized.json", "POST", "/api/mobile/v1/luopan/analysis", ["/ok", "/measurement/pass", "/core/three_plates", "/core/xuan_kong"]),
  fixtureSpec("luopanSnapshot", "luopan", "luopan-snapshot.sanitized.json", "GET", "/api/mobile/v1/luopan/snapshot", ["/ok", "/datetime/gregorian", "/layers/flying_stars/palaces"]),
  fixtureSpec("luopanMeasurementsGet", "luopan", "luopan-measurements-get.sanitized.json", "GET", "/api/mobile/v1/luopan/measurements", ["/ok", "/rows/0/id", "/rows/0/heading_deg"]),
  fixtureSpec("luopanMeasurementsPost", "luopan", "luopan-measurements-post.sanitized.json", "POST", "/api/mobile/v1/luopan/measurements", ["/ok", "/measurement/id", "/gate/pass"], { status: 201 }),
  fixtureSpec("luopanSifu", "luopan", "luopan-sifu.sanitized.json", "POST", "/api/mobile/v1/luopan/sifu", ["/ok", "/reply"]),
  fixtureSpec("luopanVision", "luopan", "luopan-vision.sanitized.json", "POST", "/api/mobile/v1/luopan/vision", ["/ok", "/reply", "/cost_yam"]),
  fixtureSpec("sifuChat", "sifu", "sifu-chat.sanitized.json", "POST", "/api/mobile/v1/sifu/chat", ["/ok", "/reply", "/source"], { variant: "json" }),
  fixtureSpec("sifuChatStream", "sifu", "sifu-chat-stream.sanitized.json", "POST", "/api/mobile/v1/sifu/chat?stream=1", ["/ok", "/events/0/event", "/events/3/event", "/events/3/data/reply"], { variant: "sse-projection", contentType: "text/event-stream", cacheControl: "no-cache" }),
  fixtureSpec("sifuHistory", "sifu", "sifu-history.sanitized.json", "GET", "/api/mobile/v1/sifu/history", ["/ok", "/history/0/question", "/history/0/answer"]),
  fixtureSpec("sifuGroup", "sifu", "sifu-group.sanitized.json", "POST", "/api/mobile/v1/sifu/group", ["/ok", "/reply", "/mode", "/count"]),
]);

const SPEC_BY_KEY = new Map(FIXTURE_SPECS.map((spec) => [spec.key, spec]));
const FIXTURE_DATE = "2026-07-14";
const ENTITLEMENT_REVISION = `sha256:${"1".repeat(64)}`;
const CAPS_HASH = `sha256:${"2".repeat(64)}`;
const SAVED_DATE_ID = "fixture-saved-date-01";
const MEASUREMENT_ID = "fixture-measurement-01";

const GOALS = Object.freeze({ wealth: 72, career: 68, love: 64, health: 76, family: 70, travel: 66 });
const INTENT_STATUS = Object.freeze({ wealth: "good", career: "good", love: "neutral", health: "good", family: "good", travel: "neutral" });
const BRANCHES = Object.freeze(["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]);
const DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const MOUNTAINS = Object.freeze(["子", "癸", "丑", "艮", "寅", "甲", "卯", "乙", "辰", "巽", "巳", "丙", "午", "丁", "未", "坤", "申", "庚", "酉", "辛", "戌", "乾", "亥", "壬"]);
const PALACE_DIRECTIONS = Object.freeze(["SE", "S", "SW", "E", "C", "W", "NE", "N", "NW"]);
const DOORS = Object.freeze(["杜門", "景門", "死門", "傷門", "中門", "驚門", "生門", "休門", "開門"]);
const STARS = Object.freeze(["天輔", "天英", "天芮", "天沖", "天禽", "天柱", "天任", "天蓬", "天心"]);
const DEITIES = Object.freeze(["九地", "九天", "玄武", "六合", "值符", "白虎", "太陰", "螣蛇", "值使"]);
const QIMEN_STEMS = Object.freeze(["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function qimenEntitlement(detail) {
  return {
    access_state: {
      in_trial: false,
      legacy_free: false,
      sub_active: true,
      trial_ends_at: null,
      sub_expires_at: null,
    },
    caps: { detail, search: true, sifu: true },
    caps_hash: CAPS_HASH,
    contract_version: "mobile-entitlement/v1",
    feature: "qimen",
    plan: "premium",
    revision: ENTITLEMENT_REVISION,
  };
}

function qimenContext(systemType = "hour") {
  return {
    date: FIXTURE_DATE,
    entitlement_revision: ENTITLEMENT_REVISION,
    location_source: "mobile_explicit",
    school: "chaibu",
    system_type: systemType,
    time: "09:00",
  };
}

function qimenPalaces(professional) {
  return Array.from({ length: 9 }, (_, index) => ({
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
  }));
}

function qimenFixture(professional) {
  const detail = professional ? "technical" : "basic";
  return {
    data: {
      calculation: { input_timezone: "Asia/Bangkok", readiness: { status: "ready" } },
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
    entitlement: qimenEntitlement(detail),
    ok: true,
    product: {
      plan: "premium",
      qimen: { compare_locations: true, detail, hours_per_day: 12, pro: professional, search_days: 30, search_results: 12, sifu: true, time_window_days: 30 },
    },
    request_context: qimenContext(),
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
  const dir8 = ["N", "N", "NE", "NE", "NE", "E", "E", "E", "SE", "SE", "SE", "S", "S", "S", "SW", "SW", "SW", "W", "W", "W", "NW", "NW", "NW", "N"];
  return MOUNTAINS.map((name, index) => ({
    centerDeg: index * 15,
    code: `mountain-${String(index + 1).padStart(2, "0")}`,
    dir8: dir8[index],
    elementZh: ["水", "水", "土", "土", "木", "木", "木", "木", "土", "木", "火", "火", "火", "火", "土", "土", "金", "金", "金", "金", "土", "金", "水", "水"][index],
    name,
    trigram: ["坎", "坎", "艮", "艮", "艮", "震", "震", "震", "巽", "巽", "巽", "離", "離", "離", "坤", "坤", "坤", "兌", "兌", "兌", "乾", "乾", "乾", "坎"][index],
    yinYang: index % 2 === 0 ? "yang" : "yin",
    yuan: ["earth", "human", "heaven"][index % 3],
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
  return {
    degree: 150,
    entitlement: { mode: open ? "full" : "core", plan: open ? "premium" : "free" },
    fenjin120: open ? { ganzhi: "甲子", index: 58, interp_th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", mountain: "巳", score: 78, usable: true } : null,
    hex64: open ? { baseHouseScore: 78, homeAdvice: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", id: 1, name: "乾", thaiName: "เฉียน", tone: "good" } : null,
    mountain: { code: "mountain-11", dir8: "SE", element: "fire", name: "巳", trigram: "巽", yuan: "human" },
    ok: true,
    sections: { fenjin120: open ? "open" : "locked", hex64: open ? "open" : "locked", yao384: open ? "open" : "locked" },
    yao384: open ? { gua: "乾", hex_num: 1, home: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา", id: 6, jixiong: "吉", pos: "初", score: 76, th: "ข้อมูลสังเคราะห์สำหรับตรวจสัญญา" } : null,
  };
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

  const qimenSearchEntitlement = qimenEntitlement("pro");
  const flyPalaces = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
    String(index + 1),
    { annual: (index + 6) % 9 + 1, mountain: (index + 2) % 9 + 1, water: (index + 4) % 9 + 1 },
  ]));

  return {
    today: {
      date: FIXTURE_DATE,
      entitlement: { day_window: 30, detailed_hours: 12, directions: 8, goals: "all", multi_profile: true, plan: "premium" },
      hex: { changing_line: 1, en: "Creative", num: 1, symbol: "䷀", th: "สร้างสรรค์", zh: "乾" },
      ok: true,
      pillars: { day: "甲子", month: "乙未", year: "丙午" },
      profile: null,
      source: "mobile-r515-synthetic-contract",
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
      jishen: ["metal"],
      ok: true,
      profile: null,
      source: "mobile-r515-synthetic-contract",
      user_branch: null,
      yongshen: ["water"],
    },
    todayDirections: {
      date: FIXTURE_DATE,
      direction_energy: { avoid: [directionEnergy()[6]], best: [directionEnergy()[2]], school: "chaibu", school_label: "拆補", scores: directionEnergy(), source: { degraded: false, qimen: "r515", zibai: "r515" } },
      directions: directionRows(),
      entitlement: { detailed_directions: 8, plan: "premium", total_directions: 8 },
      ok: true,
      profile: null,
      request_context: { date: FIXTURE_DATE, local_time: "09:00", location_source: "synthetic-contract", school: "chaibu", timezone: "Asia/Bangkok" },
      source: "mobile-r515-synthetic-contract",
      summary: { avoid: ["W"], good: ["E", "SE"] },
    },
    todayGoals: {
      complete: true,
      date: FIXTURE_DATE,
      entitlement: { day_window: 30, detailed_hours: 12, directions: 8, goals: "all", multi_profile: true, plan: "premium" },
      goals: clone(GOALS),
      intent_status: clone(INTENT_STATUS),
      locked_goals: [],
      ok: true,
      profile: null,
      source: "mobile-calendar-projection",
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
      entitlement: { bulk_ai: true, pair_ai: "full", plan: "premium", team_ai: true, team_analysis: true, visualization_profiles: 12 },
      meta: { locked_profiles: 0, scored_profiles: 2, total_profiles: 2 },
      ok: true,
      people: [
        { day_master: "丙", guidance: null, name: "Fixture Person A", scores: { day: 74, overall: 70 }, tags: ["support"] },
        { day_master: "辛", guidance: null, name: "Fixture Person B", scores: { day: 48, overall: 55 }, tags: ["caution"] },
      ],
      source: "mobile-r515-synthetic-contract",
      version: "r515",
    },
    networkSifu: { balance_after: 99, mode: "pair", ok: true, reply: SYNTHETIC_REPLY, source: "mobile-r515-synthetic-contract", spent: 1 },
    networkBulk: { balance_after: 100, count: 0, ok: true, people: [], spent: 0 },
    qimenBasic: qimenFixture(false),
    qimenProfessional: qimenFixture(true),
    qimenSearch: {
      entitlement: qimenSearchEntitlement,
      ok: true,
      request_context: qimenContext(),
      results: [{ date: FIXTURE_DATE, direction: "E", palace_id: 4, score: 82, slots: [{ end: "11:00", start: "09:00" }] }],
      source: "mobile-r515-synthetic-contract",
    },
    qimenSifu: { balance_after: 99, ok: true, reply: SYNTHETIC_REPLY, source: "mobile-r515-synthetic-contract", spent: 1 },
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
      meta: { activityType: "開市", durationMs: 12, entitlement: { max_range_days: 30, max_results: 12, modules_allowed: ["qi_men"], modules_stripped: [], plan: "premium" } },
      ok: true,
      source: "mobile-r515-synthetic-contract",
    },
    datepickSave: { ok: true, saved_date: savedDate() },
    datepickSaved: { count: 1, ok: true, saved_dates: [savedDate()] },
    datepickDelete: { deleted: true, id: SAVED_DATE_ID, ok: true },
    luopanRings: ringFixture(false),
    luopanBootstrap: {
      contract_version: "mobile-luopan/v1",
      entitlement: { house_limit: 3, mode: "full", multi_profile: true, pins: "full", plan: "premium", sifu: true, vision: true, vision_limit: 5 },
      formula_version: "r515",
      houses: [],
      north_reference_default: "magnetic",
      ok: true,
      profiles: [],
      ring_reference: { mountains_24: mountainRows() },
    },
    luopanRingsW4: ringFixture(true),
    luopanAnalysis: {
      core: { north_reference: "magnetic", period: 9, professional: { najia_basha: { facingMountain: { code: "mountain-11" } }, water_method: { hits: [], pass: true, score: 80, status: "ready", tags: ["fixture"], warnings: [] } }, school: "xuan-kong", three_plates: { degree: 150, earth: { mountain: "巳" }, heaven: { mountain: "丙" }, human: { mountain: "巽" } }, xuan_kong: { base: [1, 2, 3, 4, 5, 6, 7, 8, 9], mountain: [9, 1, 2, 3, 4, 5, 6, 7, 8], version: "r515", water: [2, 3, 4, 5, 6, 7, 8, 9, 1] } },
      entitlement: { locked_sections: [], mode: "full", plan: "premium" },
      excluded_unverified_layers: [],
      formula_version: "r515",
      measurement: { boundaryDistanceDeg: 7.5, facingMountain: { centerDeg: 150, code: "mountain-11", name: "巳" }, headingDeg: 150, nearBoundary: false, pass: true, reasons: [], sittingMountain: { centerDeg: 330, code: "mountain-23", name: "亥" }, uncertaintyDeg: 1 },
      ok: true,
      verdict_scope: "verified_core_only",
    },
    luopanSnapshot: {
      datetime: { day_pillar: "甲子", gregorian: `${FIXTURE_DATE}T09:00:00+07:00`, hour_pillar: "己巳", month_pillar: "乙未", shichen: "巳", solar_term: "小暑", year_pillar: "丙午" },
      entitlement: { layers: "professional", multi_profile: true, plan: "premium" },
      layers: { flying_stars: { annual_center: 6, feng_shui_year: 2026, palaces: flyPalaces, period: 9 }, qi_men: { dun_type: "陽遁", ju_number: 5 }, twenty_four: mountainRows() },
      ok: true,
      recommendations: [{ code: "fixture-recommendation", severity: "info" }],
      warnings: [{ code: "fixture-warning", severity: "low" }],
    },
    luopanMeasurementsGet: { ok: true, rows: [{ client_measurement_id: "fixture-client-measurement-01", created_at: "2026-07-14T02:00:00.000Z", facing_mountain: "巳", formula_version: "r515", heading_deg: 150, house_id: null, id: MEASUREMENT_ID, method: "sensor", north_reference: "magnetic", quality_reasons: [], quality_status: "pass", sitting_mountain: "亥" }] },
    luopanMeasurementsPost: { gate: { boundaryDistanceDeg: 7.5, headingDeg: 150, nearBoundary: false, pass: true, reasons: [], uncertaintyDeg: 1 }, measurement: { heading_deg: 150, id: MEASUREMENT_ID, method: "sensor", north_reference: "magnetic", quality_status: "pass" }, ok: true },
    luopanSifu: { credit_yam: 99, ok: true, reply: SYNTHETIC_REPLY },
    luopanVision: { cost_yam: 1, credit_yam: 99, max: 5, ok: true, reply: SYNTHETIC_REPLY, used: 1 },
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
  const output = {};
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
  "authorization", "cookie", "set-cookie", "access_token", "refresh_token", "token",
  "password", "secret", "credential", "session_id", "email", "phone", "address",
  "birth_date", "birth_datetime", "birth_time", "org_id", "user_id", "account_id",
  "device_id", "latitude", "longitude", "lat", "lng", "gps", "image_base64", "image_url",
]);
const PRIVATE_TEXT_KEYS = new Set(["question", "prompt", "query", "message", "answer", "guidance", "private_note"]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const BEARER_PATTERN = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/;
const SECRET_PATTERN = /\b(?:sk|pk|sec|tok)_[A-Za-z0-9_-]{12,}\b/i;

export function scanFixturePrivacy(key, value) {
  const findings = [];
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
      const normalized = childKey.toLowerCase();
      const childPointer = `${pointer}/${childKey}`;
      if (FORBIDDEN_IDENTITY_KEYS.has(normalized) && childValue !== null && childValue !== "") {
        findings.push(`${childPointer}:forbidden-key`);
      }
      if (normalized === "profile_id" && childValue !== null) findings.push(`${childPointer}:profile-id`);
      if (PRIVATE_TEXT_KEYS.has(normalized) && childValue !== null && childValue !== "") findings.push(`${childPointer}:private-text`);
      if (normalized === "reply" && childValue !== null && childValue !== SYNTHETIC_REPLY) findings.push(`${childPointer}:reply`);
      if (normalized === "name" && /\/(?:people|active_profile|profiles|house)(?:\/|$)/.test(pointer) && typeof childValue === "string" && !childValue.startsWith("Fixture ")) {
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
  for (const pointer of spec.requiredPointers) {
    const resolved = pointerValue(value, pointer);
    if (!resolved.found) return contractFailure(key, pointer);
  }
  const privacy = scanFixturePrivacy(key, value);
  if (!privacy.ok) return contractFailure(key, privacy.findings[0].split(":")[0]);

  if (key === "todayHours" && value.hours.length !== 12) return contractFailure(key, "/hours");
  if (key === "todayDirections" && value.directions.length !== 8) return contractFailure(key, "/directions");
  if ((key === "qimenBasic" || key === "qimenProfessional") && value.data.palaces.length !== 9) return contractFailure(key, "/data/palaces");
  if (key === "luopanBootstrap" && value.ring_reference.mountains_24.length !== 24) return contractFailure(key, "/ring_reference/mountains_24");
  return { ok: true };
}

export function validateFixtureSet(values) {
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
  for (const key of ["qimenBasic", "qimenProfessional", "qimenSearch"]) {
    if (values[key].entitlement.revision !== values[key].request_context.entitlement_revision) return contractFailure("set", `/qimen-revision/${key}`);
  }
  if (values.network.count !== values.network.people.length) return contractFailure("set", "/network-count");
  if (canonicalJson(values.luopanBootstrap.ring_reference.mountains_24.map((item) => item.name)) !== canonicalJson(MOUNTAINS)) return contractFailure("set", "/mountain-order");
  const eventNames = values.sifuChatStream.events.map((event) => event.event);
  if (canonicalJson(eventNames) !== canonicalJson(["meta", "first", "chunk", "done"])) return contractFailure("set", "/stream-events");
  const streamed = values.sifuChatStream.events.slice(1, 3).map((event) => event.data.text).join("");
  if (streamed !== SYNTHETIC_REPLY || values.sifuChatStream.events[3].data.reply !== SYNTHETIC_REPLY) return contractFailure("set", "/stream-reply");
  return { ok: true };
}

export function buildFixtureSet() {
  const values = fixtureValues();
  const validation = validateFixtureSet(values);
  if (!validation.ok) throw new Error(validation.error);
  return values;
}
