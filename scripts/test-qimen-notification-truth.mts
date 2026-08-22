import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const qimen = require("../src/lib/qimen-notification-advisory.cjs");

const calculation = {
  input_datetime: "2026-08-19T08:00:00.000+07:00",
  input_timezone: "Asia/Bangkok",
  corrected_datetime: "2026-08-19T07:37:59.376+07:00",
  correction_minutes: -22.01038690158242,
  apparent_solar_coordinate: "2026-08-19T07:37:59.376Z",
  engine_contract: {
    version: "QIMEN_HOUR_NOTIFICATION_PIPELINE_CLOSURE_V6",
    source_sha256: "d0abb00d9d6cff7dfb72471441eb038f9eddd1d01930d2c7e9079d1e9b4caa63",
    dependency_closure_version: "QIMEN_NOTIFICATION_PIPELINE_CLOSURE_V2",
    dependency_closure_sha256: "2abc0ddfb0fe05854db335a9f44b93a4902f50cb839473b7cbcc3ba358210d5a",
    node_runtime: "v22.22.1",
    reference_data_version: "QIMEN_SQLITE_REFERENCE_TABLES_V1",
    reference_data_sha256: "2bbe56382a78ee951da880706b3b1c895307306848319ebac026ed227d38e1c4",
    profile_id: 1,
    apparent_timeline: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1",
    equation_of_time: "NOAA_CONTINUOUS_TROPICAL_PHASE_V1",
    year_month_clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
    day_boundary_policy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
  },
  time_mode: "true_solar_time",
  ju_method: "chai_bu",
  pillars: { hourPillarZh: "庚辰", hourPillarCode: 17 },
};

function palace(overrides: Record<string, unknown>) {
  return {
    palace_id: 4,
    direction: "SE",
    display_score: 67,
    deity_code: "TAI_YIN",
    deity_zh: "太陰",
    deity_name_th: "ไท่อิน",
    deity_name_en: "Tai Yin (Great Yin)",
    door_code: "KAI_MEN",
    door_zh: "開門",
    door_name_th: "ประตูเปิด",
    door_name_en: "Kai Men (Open Gate)",
    star_code: "TIAN_FU",
    star_zh: "天輔",
    star_name_th: "ดาวเทียนฝู่",
    star_name_en: "Tian Fu (Heavenly Assistant)",
    door_action_advice_th: "เหมาะเริ่มต้น ติดต่อ และเจรจาอย่างเปิดเผย",
    door_action_advice_en: "Suitable for open initiation, contact, and negotiation.",
    door_action_advice_zh: "適合公開發起、聯繫與洽談。",
    deity_quality: "auspicious",
    door_quality: "auspicious",
    star_quality: "auspicious",
    is_void_any: false,
    classical_flags: [],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605",
      code: "usable",
      tone: "ok",
      is_actionable: true,
      hard_count: 0,
      caution_count: 0,
      reasons: [],
    },
    ...overrides,
  };
}

const response = {
  data: {
    calculation,
    chart: { wang_xiang_status: ["木", "金", "土", "水", "火"] },
    warnings: [],
    palaces: [
      palace({
        palace_id: 3,
        direction: "E",
        display_score: 82,
        is_void_any: true,
        classical_flags: [{ code: "FAN_YIN", label_zh: "反吟", severity: "caution" }],
        beginner_reading: {
          version: "qimen-beginner-reading-20260605",
          code: "caution",
          tone: "warn",
          is_actionable: true,
          hard_count: 0,
          caution_count: 2,
          reasons: [{ code: "KONG_WANG", label_zh: "空亡", tone: "warn" }, { code: "FAN_YIN", label_zh: "反吟", tone: "warn" }],
        },
      }),
      palace({}),
      palace({ palace_id: 5, direction: "C", display_score: 99 }),
    ],
  },
};

const advisory = qimen.buildQimenAdvisory(response, {
  timezone: "Asia/Bangkok",
  longitude: 100.5018,
  purpose: "travel",
});
assert.ok(advisory, "a complete engine snapshot must produce a deterministic advisory");
assert.equal(advisory.direction.code, "SE", "a caution palace must not beat a lower usable palace by score alone");
assert.equal(advisory.recommendation, "recommended");
assert.equal(advisory.decisionClass, "conditional", "raw usable is supportive but never clear-good");
assert.deepEqual(advisory.canonicalWarningCodes, []);
assert.equal(advisory.purpose, "travel");
assert.equal(advisory.deity.zh, "太陰");
assert.equal(advisory.door.zh, "開門");
assert.equal(advisory.star.zh, "天輔");
assert.equal(advisory.deity.quality, "auspicious");
assert.equal(advisory.door.quality, "auspicious");
assert.equal(advisory.star.quality, "auspicious");
assert.equal(advisory.validFrom, "2026-08-19T00:22:00.985Z");
assert.equal(advisory.validUntil, "2026-08-19T02:21:59.842Z");
assert.ok(Date.parse(advisory.validFrom) <= Date.parse("2026-08-19T01:00:00.000Z"));
assert.ok(Date.parse(advisory.validUntil) > Date.parse("2026-08-19T01:00:00.000Z"));

let canonicalRequest: { url: string; init: RequestInit } | null = null;
const fetchedAdvisory = await qimen.fetchCanonicalQimenAdvisory({
  date: "2026-08-19", time: "08:00", timezone: "Asia/Bangkok",
  instant: "2026-08-19T01:00:00.000Z", lat: 13.7563, lng: 100.5018,
}, {
  baseUrl: "http://qimen-engine.test/",
  fetchImpl: async (url: string, init: RequestInit) => {
    canonicalRequest = { url, init };
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  },
});
assert.equal(fetchedAdvisory.direction.code, "SE");
assert.equal(canonicalRequest?.url, "http://qimen-engine.test/api/qimen/calculate");
const canonicalBody = JSON.parse(String(canonicalRequest?.init.body));
assert.deepEqual(canonicalBody, {
  datetime: "2026-08-19T01:00:00.000Z", timezone: "Asia/Bangkok", instant: "2026-08-19T01:00:00.000Z",
  latitude: 13.7563, longitude: 100.5018, profile_id: 1, purpose: "travel",
  system_type: "hour", skip_save: true, source_endpoint: "mobile-notification",
});
const canonicalHeaders = new Headers(canonicalRequest?.init.headers);
assert.equal(canonicalHeaders.has("authorization"), false);
assert.equal(canonicalHeaders.has("cookie"), false);
await assert.rejects(
  qimen.fetchCanonicalQimenAdvisory({ date: "bad", time: "08:00", timezone: "Asia/Bangkok", lat: 13, lng: 100 }),
  /qimen_notification_engine_request_invalid/u,
);
await assert.rejects(
  qimen.fetchCanonicalQimenAdvisory({
    date: "2026-11-01", time: "01:30", timezone: "America/New_York",
    instant: "2026-11-01T06:30:00.000Z", lat: 40.7128, lng: -74.006,
  }, {
    baseUrl: "http://qimen-engine.test/",
    fetchImpl: async () => new Response(JSON.stringify({
      data: {
        ...response.data,
        calculation: {
          ...calculation,
          input_datetime: "2026-11-01T01:30:00.000-04:00",
          input_timezone: "America/New_York",
          corrected_datetime: "2026-11-01T01:26:00.000-04:00",
          correction_minutes: -4,
        },
      },
    }), { status: 200 }),
  }),
  /qimen_notification_engine_instant_mismatch/u,
  "the later repeated civil hour must never accept the engine's earlier occurrence",
);

for (const locale of ["th", "en", "zh"] as const) {
  const copy = qimen.buildQimenStandaloneCopy(advisory, locale);
  const yamLine = qimen.buildQimenYamLine(advisory, locale);
  assert.ok(copy.title.length >= 8 && copy.body.length >= 40);
  assert.ok(copy.body.length <= 400, `${locale} provider body must fit without truncation`);
  assert.ok(yamLine.length <= 260, `${locale} Yam enrichment must remain compact`);
  assert.match(`${copy.title} ${copy.body} ${yamLine}`, /太陰/u, `${locale} copy must identify the deity`);
  assert.match(`${copy.title} ${copy.body} ${yamLine}`, /開門/u, `${locale} copy must identify the door`);
  assert.match(`${copy.title} ${copy.body} ${yamLine}`, /天輔/u, `${locale} copy must identify the star`);
}
assert.match(qimen.buildQimenStandaloneCopy(advisory, "th").body, /การเดินทาง/u);
assert.match(qimen.buildQimenStandaloneCopy(advisory, "en").body, /travel/iu);
assert.match(qimen.buildQimenStandaloneCopy(advisory, "zh").body, /出行/u);
assert.doesNotMatch(qimen.buildQimenStandaloneCopy(advisory, "th").title, /วันนี้/u);
assert.doesNotMatch(qimen.buildQimenStandaloneCopy(advisory, "en").title, /today/iu);

const allCaution = {
  data: {
    calculation,
    chart: { wang_xiang_status: ["木", "金", "土", "水", "火"] },
    warnings: [],
    palaces: [palace({
      direction: "E",
      display_score: 82,
      is_void_any: true,
      classical_flags: [{ code: "MEN_PO", label_zh: "門迫", severity: "caution" }],
      beginner_reading: {
        version: "qimen-beginner-reading-20260605",
        code: "caution",
        tone: "warn",
        is_actionable: true,
        hard_count: 0,
        caution_count: 2,
        reasons: [{ code: "KONG_WANG", label_zh: "空亡", tone: "warn" }, { code: "MEN_PO", label_zh: "門迫", tone: "warn" }],
      },
    })],
  },
};
const caution = qimen.buildQimenAdvisory(allCaution, {
  timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel",
});
assert.equal(caution.recommendation, "recommended", "two approved soft warnings remain deliverable");
assert.equal(caution.decisionClass, "conditional");
assert.deepEqual(caution.canonicalWarningCodes, ["KONG_WANG", "MEN_PO"]);
assert.deepEqual(caution.warningCodes, ["空亡", "門迫"]);
for (const locale of ["th", "en", "zh"] as const) {
  const copy = qimen.buildQimenStandaloneCopy(caution, locale);
  const yamLine = qimen.buildQimenYamLine(caution, locale);
  assert.doesNotMatch(`${copy.title} ${copy.body} ${yamLine}`, /ทิศดีสุด|Best direction|最吉方/u);
  assert.match(`${copy.title} ${copy.body} ${yamLine}`, /空亡/u);
  assert.match(`${copy.title} ${copy.body} ${yamLine}`, /門迫/u);
}

const boundaryWarning = qimen.buildQimenAdvisory({
  data: { ...response.data, warnings: [{ type: "near_hour_boundary", severity: "medium" }], palaces: [palace({})] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(boundaryWarning.recommendation, "recommended");
assert.equal(boundaryWarning.decisionClass, "conditional");
assert.deepEqual(boundaryWarning.canonicalWarningCodes, ["NEAR_HOUR_BOUNDARY"]);
assert.deepEqual(boundaryWarning.warningCodes, ["NEAR_HOUR_BOUNDARY"]);
assert.match(qimen.buildQimenStandaloneCopy(boundaryWarning, "th").body, /ใกล้ขอบยาม/u);
assert.match(qimen.buildQimenStandaloneCopy(boundaryWarning, "en").body, /near an hour boundary/u);
assert.match(qimen.buildQimenStandaloneCopy(boundaryWarning, "zh").body, /近時辰交界/u);
assert.doesNotMatch(qimen.buildQimenStandaloneCopy(boundaryWarning, "en").body, /NEAR_HOUR_BOUNDARY/u);

const weakVigor = qimen.buildQimenAdvisory({
  data: { ...response.data, chart: { wang_xiang_status: ["土", "金", "火", "木", "水"] }, palaces: [palace({})] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(weakVigor.star.element, "木");
assert.equal(weakVigor.star.vigor, "囚");
assert.equal(weakVigor.door.element, "金");
assert.equal(weakVigor.door.vigor, "相");
assert.equal(weakVigor.recommendation, "caution", "囚/死 component vigor must prevent an unqualified recommendation");
assert.ok(weakVigor.warningCodes.includes("STAR_VIGOR_QIU"));
assert.match(qimen.buildQimenStandaloneCopy(weakVigor, "th").body, /ดาวอยู่ภาวะ囚/u);

const strongVigor = qimen.buildQimenAdvisory({
  data: { ...response.data, chart: { wang_xiang_status: ["木", "金", "土", "水", "火"] }, palaces: [palace({})] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(strongVigor.star.vigor, "旺");
assert.equal(strongVigor.door.vigor, "相");
assert.equal(strongVigor.recommendation, "recommended");

const clearGood = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "suitable", tone: "good",
      is_actionable: true, hard_count: 0, caution_count: 0, reasons: [],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(clearGood.recommendation, "recommended");
assert.equal(clearGood.decisionClass, "clear");
assert.deepEqual(clearGood.canonicalWarningCodes, []);

const clearBeatsHigherConditional = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [
    palace({ palace_id: 3, direction: "E", display_score: 88 }),
    palace({
      palace_id: 4, direction: "SE", display_score: 61,
      beginner_reading: {
        version: "qimen-beginner-reading-20260605", code: "suitable", tone: "good",
        is_actionable: true, hard_count: 0, caution_count: 0, reasons: [],
      },
    }),
  ] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(clearBeatsHigherConditional.direction.code, "SE",
  "CLEAR wins before score-ranked CONDITIONAL candidates");
assert.equal(clearBeatsHigherConditional.decisionClass, "clear");

const dedupedSoft = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    is_void_any: true,
    classical_flags: [
      { code: "RU_MU_HEAVEN_STEM", label_zh: "入墓", severity: "caution" },
      { code: "RU_MU", label_zh: "入墓", severity: "caution" },
    ],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 3,
      reasons: [
        { kind: "void", code: "KONG_WANG", label_zh: "空亡", tone: "warn" },
        { kind: "flag", code: "入墓", label_zh: "入墓", tone: "warn" },
        { kind: "source_trace", code: "RU_MU_HEAVEN_STEM", label_zh: "入墓", tone: "warn" },
        { kind: "source_trace", code: "RU_MU", label_zh: "入墓", tone: "warn" },
      ],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(dedupedSoft.recommendation, "recommended", "semantic aliases dedupe before the two-warning cap");
assert.deepEqual(dedupedSoft.canonicalWarningCodes, ["KONG_WANG", "RU_MU"]);

const typedStemSoft = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    stem_response: {
      is_source_governed: true, code: "GUI_OVER_REN", notation_zh: "癸加壬",
      title_zh: "復見螣蛇", quality: "inauspicious", severity: "bad", rating_zh: "凶",
    },
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 1,
      reasons: [{ kind: "stem_response", code: "癸加壬", label_zh: "復見螣蛇", tone: "warn" }],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(typedStemSoft.recommendation, "recommended");
assert.deepEqual(typedStemSoft.canonicalWarningCodes, ["STEM_RESPONSE_GUI_OVER_REN"]);

const exactLabelSoft = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    qimen_trace: [
      { code: "RI_QI_FU_YIN", name_zh: "日奇伏吟", severity: "caution" },
      { code: "FU_YIN_TIAN_TING", name_zh: "伏吟天庭", severity: "warning" },
    ],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 2,
      reasons: [
        { kind: "source_trace", code: "RI_QI_FU_YIN", label_zh: "日奇伏吟", tone: "warn" },
        { kind: "source_trace", code: "FU_YIN_TIAN_TING", label_zh: "伏吟天庭", tone: "warn" },
      ],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(exactLabelSoft.recommendation, "recommended",
  "hard Han aliases are exact labels; longer typed formation names remain soft");
assert.deepEqual(exactLabelSoft.canonicalWarningCodes, ["RI_QI_FU_YIN", "FU_YIN_TIAN_TING"]);

const derivativeReasonsIgnored = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "suitable", tone: "good",
      is_actionable: true, hard_count: 0, caution_count: 2,
      reasons: [
        { kind: "yongshen", code: "YONGSHEN_WARNING", label_zh: "用神", tone: "warn" },
        { kind: "score", code: "ENGINE_SCORE", label_zh: "分數", tone: "warn" },
      ],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(derivativeReasonsIgnored.decisionClass, "clear");
assert.deepEqual(derivativeReasonsIgnored.canonicalWarningCodes, [],
  "derivative yongshen/score explanations are not independently counted warnings");

const displayOnlyUiFlagsIgnored = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    display_score: 75,
    is_men_po: true,
    ui_flags: [
      { active: true, code: "GUI_REN", tone: "good" },
      { active: true, code: "MEN_PO", tone: "warn" },
      { active: true, code: "RI_SHI_CHONG", tone: "warn" },
    ],
    stem_response: {
      is_source_governed: true, code: "JI_OVER_DING", notation_zh: "己加丁",
      title_zh: "朱雀入墓", quality: "inauspicious", severity: "bad", rating_zh: "凶",
    },
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 4,
      reasons: [
        { kind: "flag", code: "MEN_PO", label_zh: "門迫", tone: "warn" },
        { kind: "stem_response", code: "己加丁", label_zh: "朱雀入墓", tone: "warn" },
        { kind: "yongshen", code: "YONGSHEN", label_zh: "用神", tone: "warn" },
        { kind: "yongshen_warning", code: "YONGSHEN_WARNING", label_zh: "用神警示", tone: "warn" },
      ],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(displayOnlyUiFlagsIgnored.recommendation, "recommended",
  "display-only ui/context flags and derivative Yongshen explanations must not create extra vetoes");
assert.deepEqual(displayOnlyUiFlagsIgnored.canonicalWarningCodes, ["MEN_PO", "STEM_RESPONSE_JI_OVER_DING"],
  "the normalized source gate keeps exactly the two independent typed warnings");

const directBooleanSoft = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({ is_men_po: true, is_ru_mu: true })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(directBooleanSoft.recommendation, "recommended");
assert.deepEqual(directBooleanSoft.canonicalWarningCodes, ["MEN_PO", "RU_MU"]);

const directBooleanHard = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({ is_fu_yin: true })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(directBooleanHard.recommendation, "caution",
  "direct engine hard booleans veto even when beginner reasons omit them");

const rawNonActionableStillEligible = qimen.buildQimenAdvisory({
  data: { ...response.data, palaces: [palace({
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "usable", tone: "ok",
      is_actionable: false, hard_count: 0, caution_count: 0, reasons: [],
    },
  })] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(rawNonActionableStillEligible.recommendation, "recommended",
  "notification eligibility is score/vigor/hard/soft only; raw actionability is retained evidence, not a gate");

const fifthStoredFormationHard = qimen.buildQimenAdvisory({
  data: {
    ...response.data,
    stored_formations: [
      { scope: "palace", scope_ref: 4, formation_code: "GOOD_ONE", base_quality: "auspicious" },
      { scope: "palace", scope_ref: 4, formation_code: "GOOD_TWO", base_quality: "auspicious" },
      { scope: "palace", scope_ref: 4, formation_code: "GOOD_THREE", base_quality: "auspicious" },
      { scope: "palace", scope_ref: 4, formation_code: "GOOD_FOUR", base_quality: "auspicious" },
      { scope: "palace", scope_ref: 4, formation_code: "TIAN_WANG", base_quality: "severe", name_zh: "天網四張" },
    ],
    palaces: [palace({})],
  },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(fifthStoredFormationHard.recommendation, "caution",
  "a fifth hard source item must veto before any display truncation");

for (const blocked of [
  palace({ display_score: 59 }),
  palace({
    classical_flags: [{ code: "FU_YIN", label_zh: "伏吟", severity: "caution" }],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 1,
      reasons: [{ kind: "source_trace", code: "FU_YIN", label_zh: "伏吟", tone: "warn" }],
    },
  }),
  palace({
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 1,
      reasons: [{ kind: "mystery", code: "未知", label_zh: "未知", tone: "warn" }],
    },
  }),
  palace({
    is_void_any: true,
    classical_flags: [
      { code: "MEN_PO", label_zh: "門迫", severity: "caution" },
      { code: "RU_MU", label_zh: "入墓", severity: "caution" },
    ],
    beginner_reading: {
      version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
      is_actionable: true, hard_count: 0, caution_count: 3,
      reasons: [
        { kind: "void", code: "KONG_WANG", label_zh: "空亡", tone: "warn" },
        { kind: "source_trace", code: "MEN_PO", label_zh: "門迫", tone: "warn" },
        { kind: "source_trace", code: "RU_MU", label_zh: "入墓", tone: "warn" },
      ],
    },
  }),
]) {
  const rejected = qimen.buildQimenAdvisory({ data: { ...response.data, palaces: [blocked] } }, {
    timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel",
  });
  assert.equal(rejected.recommendation, "caution", "score, hard-veto, unknown, and >2-warning candidates fail closed");
}

for (const hardSource of [
  { code: "FU_YIN_DOOR", label_zh: "門伏吟" },
  { code: "FAN_YIN_STAR", label_zh: "星反吟" },
  { code: "JI_XING", label_zh: "六儀擊刑" },
  { code: "FIVE_NOT_MEET", label_zh: "五不遇時" },
  { code: "SOURCE_TRACE", label_zh: "三奇入墓" },
  { code: "SOURCE_TRACE", label_zh: "天網四張" },
]) {
  const vetoed = qimen.buildQimenAdvisory({
    data: { ...response.data, palaces: [palace({
      qimen_trace: [{ ...hardSource, severity: "caution" }],
      beginner_reading: {
        version: "qimen-beginner-reading-20260605", code: "caution", tone: "warn",
        is_actionable: true, hard_count: 0, caution_count: 1,
        reasons: [{ kind: "source_trace", ...hardSource, tone: "warn" }],
      },
    })] },
  }, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
  assert.equal(vetoed.recommendation, "caution", `${hardSource.code}/${hardSource.label_zh} must hard-veto`);
}

for (const quality of ["hard_caution"]) {
  const vetoed = qimen.buildQimenAdvisory({
    data: { ...response.data, palaces: [palace({ deity_quality: quality })] },
  }, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
  assert.equal(vetoed.recommendation, "caution", `hard quality alias ${quality} must veto`);
}
for (const quality of ["xiong", "avoid", "danger"]) {
  const conditionalAlias = qimen.buildQimenAdvisory({
    data: { ...response.data, palaces: [palace({ deity_quality: quality })] },
  }, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
  assert.equal(conditionalAlias.recommendation, "recommended", `soft quality alias ${quality} remains conditional`);
  assert.equal(conditionalAlias.decisionClass, "conditional");
  assert.deepEqual(conditionalAlias.canonicalWarningCodes, ["INTRINSIC_DEITY_BAD"]);
}

const restingVigor = qimen.buildQimenAdvisory({
  data: { ...response.data, chart: { wang_xiang_status: ["土", "金", "木", "水", "火"] }, palaces: [palace({})] },
}, { timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel" });
assert.equal(restingVigor.star.vigor, "休");
assert.equal(restingVigor.door.vigor, "相");
assert.equal(restingVigor.recommendation, "caution", "travel may proceed only when both door and star are 旺/相");
assert.ok(restingVigor.warningCodes.includes("STAR_VIGOR_XIU"));
assert.match(qimen.buildQimenStandaloneCopy(restingVigor, "th").body, /ดาวอยู่ภาวะ休/u);

const accessAt = "2026-08-19T01:05:00.000Z";
const freeUser = { id: "acct-free", tier: "free", sub_expires_at: null, trial_ends_at: "2026-08-18T00:00:00.000Z" };
assert.deepEqual(qimen.qimenNotificationEntitlement(freeUser, {
  date: "2026-08-19", time: "08:05", timezone: "Asia/Bangkok", instant: accessAt,
}), { allow: true, plan: "free", reason: null });
assert.equal(qimen.qimenNotificationEntitlement(freeUser, {
  date: "2026-08-19", time: "10:00", timezone: "Asia/Bangkok", instant: accessAt,
}).reason, "qimen_hour_locked");
assert.equal(qimen.qimenNotificationEntitlement({ ...freeUser, trial_ends_at: "2026-08-20T00:00:00.000Z" }, {
  date: "2026-08-19", time: "10:00", timezone: "Asia/Bangkok", instant: accessAt,
}).allow, true);
assert.equal(qimen.qimenNotificationEntitlement({
  ...freeUser, tier: "premium", sub_expires_at: "2026-10-01T00:00:00.000Z",
}, {
  date: "2026-08-20", time: "00:00", timezone: "Asia/Bangkok", instant: accessAt,
}).allow, true);

const facts = qimen.qimenSourceFacts(advisory, { profileId: "profile-safe-id" });
assert.equal(facts.eventStartAt, advisory.validFrom);
assert.equal(facts.eventEndAt, advisory.validUntil);
assert.equal(facts.qimen.purpose, "travel");
assert.equal(facts.qimen.palaceId, 4);
assert.equal(facts.qimen.deity.code, "TAI_YIN");
assert.equal(facts.qimen.door.code, "KAI_MEN");
assert.equal(facts.qimen.star.code, "TIAN_FU");
assert.equal(facts.qimen.shichen, advisory.shichenKey);
assert.equal(Object.isFrozen(facts.qimen), true);

const yamWindow = qimen.civilRangeWindow("2026-08-19", "09:00-11:00", "Asia/Bangkok");
assert.deepEqual(yamWindow, {
  startAt: "2026-08-19T02:00:00.000Z",
  endAt: "2026-08-19T04:00:00.000Z",
});
assert.equal(
  qimen.earliestExpiry(yamWindow.endAt, advisory.validUntil),
  advisory.validUntil,
  "a combined Yam/Qimen notice must expire when its earliest time-bound claim ends",
);

console.log("QIMEN_NOTIFICATION_TRUTH_OK");
