import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const qimen = require("../src/lib/qimen-notification-advisory.cjs");

const calculation = {
  input_datetime: "2026-08-19T08:00:00.000+07:00",
  input_timezone: "Asia/Bangkok",
  corrected_datetime: "2026-08-19T07:38:48.779+07:00",
  correction_minutes: -21.187005305031846,
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
assert.equal(advisory.purpose, "travel");
assert.equal(advisory.deity.zh, "太陰");
assert.equal(advisory.door.zh, "開門");
assert.equal(advisory.star.zh, "天輔");
assert.equal(advisory.deity.quality, "auspicious");
assert.equal(advisory.door.quality, "auspicious");
assert.equal(advisory.star.quality, "auspicious");
assert.match(advisory.validFrom, /^2026-08-19T00:2[01]:/u);
assert.match(advisory.validUntil, /^2026-08-19T02:2[12]:/u);
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
  datetime: "2026-08-19T08:00:00", timezone: "Asia/Bangkok", instant: "2026-08-19T01:00:00.000Z",
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
assert.equal(caution.recommendation, "caution");
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
assert.equal(boundaryWarning.recommendation, "caution");
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
