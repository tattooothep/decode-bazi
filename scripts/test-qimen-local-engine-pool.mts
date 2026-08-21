import assert from "node:assert/strict";
import { createRequire } from "node:module";
import poolRuntime from "../src/lib/qimen-local-engine-pool.cjs";

const require = createRequire(import.meta.url);
const advisory = require("../src/lib/qimen-notification-advisory.cjs");
const pool = poolRuntime.createQimenLocalEnginePool({ size: 2 });
try {
  const [yang, yin] = await Promise.all([
    pool.calculate({
      datetime: "2026-01-06T18:30:00.000Z", timezone: "Asia/Bangkok",
      latitude: 13.7563, longitude: 100.5018, profile_id: 1, purpose: "travel",
      system_type: "hour", skip_save: true, source_endpoint: "mobile-notification",
    }),
    pool.calculate({
      datetime: "2026-08-02T10:30:00.000Z", timezone: "Asia/Bangkok",
      latitude: 13.7563, longitude: 100.5021, profile_id: 1, purpose: "travel",
      system_type: "hour", skip_save: true, source_endpoint: "mobile-notification",
    }),
  ]);
  for (const result of [yang, yin]) {
    assert.equal(result.calculation.engine_contract.version, "QIMEN_HOUR_NOTIFICATION_PIPELINE_CLOSURE_V6");
    assert.equal(result.calculation.engine_contract.dependency_closure_version, "QIMEN_NOTIFICATION_PIPELINE_CLOSURE_V2");
    assert.equal(result.palaces.length, 9);
    assert.deepEqual(Object.keys(result.chart).sort(), ["dun_type", "ju_number", "wang_xiang_status"]);
    assert.ok(result.palaces.some((palace: any) => Number.isFinite(palace.display_score)));
    assert.ok(result.palaces.some((palace: any) => palace.beginner_reading?.code === "suitable"));
  }
  const input = {
    date: "2026-01-07", time: "01:30", timezone: "Asia/Bangkok",
    instant: "2026-01-06T18:30:00.000Z", lat: 13.7563, lng: 100.5018,
  };
  const [local, http] = await Promise.all([
    advisory.fetchCanonicalQimenEngineSnapshot(input, { calculateImpl: pool.calculate }),
    advisory.fetchCanonicalQimenEngineSnapshot(input),
  ]);
  assert.deepEqual(local.advisory, http.advisory,
    "worker and live HTTP route must produce the same canonical notification decision");
  assert.deepEqual(
    local.result.palaces.map((palace: any) => [palace.palace_id, palace.display_score, palace.beginner_reading?.code]),
    http.result.palaces.map((palace: any) => [palace.palace_id, palace.display_score, palace.beginner_reading?.code]),
    "worker and live HTTP route must preserve identical score/reading facts for every palace",
  );
} finally {
  await pool.close();
}

console.log("QIMEN_LOCAL_ENGINE_POOL_OK workers=2 cases=yang+yin pipeline=governed");
