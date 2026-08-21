import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const builder = require("../src/lib/qimen-canonical-occurrence-builder.cjs") as {
  buildCanonicalQimenOccurrence(row: Record<string, unknown>, at: Date, options: Record<string, unknown>): Promise<any>;
};
const advisoryRuntime = require("../src/lib/qimen-notification-advisory.cjs");
const snapshotRuntime = require("../src/lib/qimen-three-layer-notification.cjs");

const at = new Date("2026-08-21T06:00:00.000Z");
const row = {
  user_id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  purpose: "travel",
  latitude: 13.7563,
  longitude: 100.5018,
  location_timezone: "Asia/Bangkok",
};
const hourWindow = advisoryRuntime.trueSolarShichenWindow({
  timezone: row.location_timezone, longitude: row.longitude, instant: at,
});
const directions = ["N", "SW", "E", "SE", "C", "NW", "W", "NE", "S"];
const instruments = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
const stars = [
  ["TIAN_PENG", "天蓬"], ["TIAN_RUI", "天芮"], ["TIAN_CHONG", "天衝"],
  ["TIAN_FU", "天輔"], ["TIAN_QIN", "天禽"], ["TIAN_XIN", "天心"],
  ["TIAN_ZHU", "天柱"], ["TIAN_REN", "天任"], ["TIAN_YING", "天英"],
];
const doors = [
  ["XIU_MEN", "休門"], ["SI_MEN", "死門"], ["SHANG_MEN", "傷門"], ["DU_MEN", "杜門"],
  [null, null], ["KAI_MEN", "開門"], ["JING_FEAR_MEN", "驚門"], ["SHENG_MEN", "生門"], ["JING_VIEW_MEN", "景門"],
];
const deities = [
  ["ZHI_FU", "直符"], ["TENG_SHE", "螣蛇"], ["TAI_YIN", "太陰"], ["LIU_HE", "六合"],
  [null, null], ["XUAN_WU", "玄武"], ["BAI_HU", "白虎"], ["JIU_DI", "九地"], ["JIU_TIAN", "九天"],
];
const engineSnapshot = {
  advisory: {
    purpose: "travel", recommendation: "recommended", direction: { code: "SE" },
    readingCode: "usable", warningCodes: [], validFrom: hourWindow.startAt, validUntil: hourWindow.endAt,
  },
  result: {
    chart: { wang_xiang_status: ["木", "金", "土", "水", "火"] },
    calculation: {
      pillars: { yearPillarZh: "丙午", monthPillarZh: "丙申", dayPillarZh: "丁卯", hourPillarZh: "丙午" },
      engine_contract: {
        version: "QIMEN_HOUR_ENGINE_CANONICAL_CLOCKS_V2",
        source_sha256: "7848711e49126054883a37b53e229d2e294eff07ba5eb0db38b08bb824e0db84",
        profile_id: 1,
        apparent_timeline: "UTC_PLUS_LONGITUDE_EOT_MONOTONIC_V1",
        year_month_clock: "PINNED_TYME4TS_BJT_JIE_GLOBAL_V1",
        day_boundary_policy: "TRUE_SOLAR_MIDNIGHT_ZI_HOUR_23_V1",
      },
    },
    palaces: directions.map((direction, index) => ({
      palace_id: index + 1, direction,
      earth_stem_zh: instruments[index], heaven_stem_zh: instruments[(index + 1) % 9],
      star_code: stars[index][0], star_zh: stars[index][1],
      door_code: doors[index][0], door_zh: doors[index][1],
      deity_code: deities[index][0], deity_zh: deities[index][1],
      classical_flags: [], beginner_reading: { reasons: [] },
      is_void_any: false, is_traveling_horse: false,
    })),
  },
};

const snapshot = await builder.buildCanonicalQimenOccurrence(row, at, {
  fetchCanonicalQimenEngineSnapshot: async () => engineSnapshot,
});
assert.ok(snapshotRuntime.verifyQimenThreeLayerSnapshot(snapshot));
assert.equal(snapshot.accountId, row.user_id);
assert.equal(snapshot.selectedDirection, "SE");
assert.equal(snapshot.layers.hour.validFrom, hourWindow.startAt);
assert.equal(snapshot.layers.hour.validUntil, hourWindow.endAt);
assert.equal(snapshot.layers.day.calculationVersion, "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1");
assert.equal(snapshot.layers.day.decisionRole, "raw_context_only");
assert.equal(snapshot.layers.hour.decisionRole, "sole_action_authority");
assert.equal(snapshot.layers.day.palaces[4].doorZh, null);
assert.equal(snapshot.layers.hour.palaces[4].deityZh, null);
assert.equal(snapshot.selectedEvidence.hour.doorZh, "杜門");
assert.ok(Date.parse(snapshot.layers.month.validFrom) <= Date.parse(hourWindow.startAt));
assert.ok(Date.parse(snapshot.layers.month.validUntil) >= Date.parse(hourWindow.endAt));
assert.ok(Date.parse(snapshot.layers.day.validFrom) <= Date.parse(hourWindow.startAt));
assert.ok(Date.parse(snapshot.layers.day.validUntil) >= Date.parse(hourWindow.endAt));
assert.deepEqual(snapshot.sourceTuple.hour, {
  code: "QIMEN_VERIFIED_ZHUANPAN_SHIJIA",
  engineContractVersion: "QIMEN_HOUR_ENGINE_CANONICAL_CLOCKS_V2",
  engineSourceDigest: "7848711e49126054883a37b53e229d2e294eff07ba5eb0db38b08bb824e0db84",
  engineProfile: 1,
});

assert.equal(await builder.buildCanonicalQimenOccurrence(row, at, {
  fetchCanonicalQimenEngineSnapshot: async () => ({
    ...engineSnapshot, advisory: { ...engineSnapshot.advisory, recommendation: "caution" },
  }),
}), null, "only an auspicious hour direction may create C4");

await assert.rejects(
  builder.buildCanonicalQimenOccurrence({ ...row, user_id: "" }, at, {
    fetchCanonicalQimenEngineSnapshot: async () => engineSnapshot,
  }),
  /QIMEN_CANONICAL_OCCURRENCE_INVALID/u,
);

await assert.rejects(
  builder.buildCanonicalQimenOccurrence(row, at, {
    fetchCanonicalQimenEngineSnapshot: async () => ({
      ...engineSnapshot,
      result: {
        ...engineSnapshot.result,
        calculation: {
          ...engineSnapshot.result.calculation,
          engine_contract: { ...engineSnapshot.result.calculation.engine_contract, source_sha256: "0".repeat(64) },
        },
      },
    }),
  }),
  /QIMEN_HOUR_ENGINE_CONTRACT_NOT_ALLOWED/u,
  "a valid-looking but unpinned hour engine digest fails closed",
);

console.log("qimen canonical three-layer occurrence builder tests passed");
