import assert from "node:assert/strict";
import {
  R8_ASTRONOMY_SCHEMA,
  R8_QIZHENG_SCHEMA,
  R8_SOURCE_DIGEST,
  assertR8LaneKey,
  r8ProductionCapability,
} from "../src/lib/astro/notification-r8-contract";
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
} from "../src/lib/astro/qizheng/electional-source-manifest";

assert.equal(R8_SOURCE_DIGEST, QIZHENG_ELECTIONAL_SOURCE_DIGEST);
assert.equal(R8_ASTRONOMY_SCHEMA, 1);
assert.equal(R8_QIZHENG_SCHEMA, 0);
assert.equal(QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.length, 10);
assert.equal(
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.every(
    (artifact) => artifact.transcriptionStatus === "pending_double_verification",
  ),
  true,
  "no current artifact may silently become approved",
);
assert.deepEqual(r8ProductionCapability(), {
  astronomyFact: "pull_only",
  qizheng: "blocked_source_incomplete",
  providerSend: false,
});
assert.equal(assertR8LaneKey("astronomy_fact", "civil_two_hour", 1), "astronomy_fact:civil_two_hour:v1");
assert.equal(assertR8LaneKey("qizheng", "electional_window", 0), "qizheng:electional_window:v0");
assert.throws(() => assertR8LaneKey("qizheng", "Bad Lane", 0), /r8_submode_invalid/u);
assert.throws(() => assertR8LaneKey("astronomy_fact", "civil_two_hour", -1), /r8_schema_invalid/u);

console.log("NOTIFICATION_R8_CONTRACT_OK source-incomplete provider-off");
