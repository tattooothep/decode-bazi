import assert from "node:assert/strict";
import { shapeChartPayload } from "../src/lib/chart-product-shape.ts";
import { PRODUCT_PAGE_ENTITLEMENTS } from "../src/lib/product-page-entitlements.ts";

const luck = Array.from({ length: 8 }, (_, index) => ({ stem: `S${index}`, branch: `B${index}` }));
const aligned = Array.from({ length: 8 }, (_, index) => ({ index }));
const raw = {
  pillars: { day: { stem: "己", branch: "巳" } },
  analysis: {
    ge_ju: { structure: "demo" },
    useful_god: { private: "guided" },
    strength_yongshen: { strength: { level: "balanced" } },
    element_counts: { earth: 2 },
    daymaster_profile: { key: "ji" },
    carries: [{ private: "full" }],
    personal_stars: [{ private: "full" }],
    luck_pillars: luck,
    current_luck_idx: 3,
    luck_decade_drilldown: aligned,
    lp_natal_interactions: aligned,
    liu_nian_timeline: [{ year: 2026 }],
  },
  yongshen_v2: {
    structure_label: "normal",
    primary_yongshen: ["fire"],
    xishen: ["earth"],
    jishen: ["water"],
    diseases: ["cold"],
    medicine: ["warmth"],
    explain_log: ["technical trace"],
  },
  heluo_astrology: { private: "full" },
  solar_terms_birth: { private: "full" },
};

for (const plan of ["free", "trial", "premium", "master"]) {
  const caps = PRODUCT_PAGE_ENTITLEMENTS[plan].chart;
  const shaped = shapeChartPayload(structuredClone(raw), plan, caps);
  assert.equal(shaped.entitlement.plan, plan);
  assert.equal(shaped.entitlement.detail, caps.detail);
  assert.equal(shaped.entitlement.luck_cycles, caps.luck_cycles);
  const allLuckVisible = caps.luck_cycles === "all" || caps.luck_cycles === "technical";
  assert.equal(shaped.analysis.current_luck_idx, allLuckVisible ? 3 : 0);
  assert.equal(shaped.analysis.luck_pillars[0].original_index, allLuckVisible ? 0 : 3);
}

const free = shapeChartPayload(structuredClone(raw), "free", PRODUCT_PAGE_ENTITLEMENTS.free.chart);
assert.equal(free.analysis.luck_pillars.length, 1);
assert.equal(free.analysis.useful_god, undefined);
assert.equal(free.analysis.carries, undefined);
assert.deepEqual(free.analysis.liu_nian_timeline, []);
assert.equal(free.yongshen_v2.diseases, undefined);
assert.equal(free.heluo_astrology, null);

const trial = shapeChartPayload(structuredClone(raw), "trial", PRODUCT_PAGE_ENTITLEMENTS.trial.chart);
assert.equal(trial.analysis.luck_pillars.length, 2);
assert.ok(trial.analysis.useful_god);
assert.equal(trial.analysis.carries, undefined);
assert.deepEqual(trial.yongshen_v2.diseases, ["cold"]);
assert.equal(trial.yongshen_v2.explain_log, undefined);

const premium = shapeChartPayload(structuredClone(raw), "premium", PRODUCT_PAGE_ENTITLEMENTS.premium.chart);
assert.equal(premium.analysis.luck_pillars.length, 8);
assert.ok(premium.analysis.carries);
assert.ok(premium.heluo_astrology);
assert.equal(premium.entitlement.technical_detail, false);

const master = shapeChartPayload(structuredClone(raw), "master", PRODUCT_PAGE_ENTITLEMENTS.master.chart);
assert.equal(master.analysis.luck_pillars.length, 8);
assert.equal(master.entitlement.technical_detail, true);
assert.deepEqual(master.yongshen_v2.explain_log, ["technical trace"]);

console.log("response shape PASS · chart free/trial/premium/master");
