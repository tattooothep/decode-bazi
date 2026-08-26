import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import readiness from "../src/lib/mobile-push-registration-readiness.cjs";

const { effectiveZiweiPayloadSchema, expoIosPushReady } = readiness;

assert.equal(expoIosPushReady({}), false, "Expo iOS delivery is fail-closed without an explicit readiness flag");
assert.equal(expoIosPushReady({ EXPO_IOS_PUSH_READY: "TRUE" }), false, "only the exact reviewed flag value enables Expo iOS delivery");
assert.equal(expoIosPushReady({ EXPO_IOS_PUSH_READY: "true" }), true);

assert.equal(effectiveZiweiPayloadSchema("ios", 2, {}), 0,
  "an iOS registration cannot advertise Ziwei delivery while Expo iOS is unready");
assert.equal(effectiveZiweiPayloadSchema("ios", 2, { EXPO_IOS_PUSH_READY: "true" }), 2,
  "a ready iOS registration preserves its negotiated Ziwei schema");
assert.equal(effectiveZiweiPayloadSchema("android", 2, {}), 2,
  "Android Ziwei capability is unchanged by the Expo iOS gate");

const route = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
assert.match(route, /effectiveZiweiPayloadSchema\(platform,\s*requestedZiweiPayloadSchema,\s*process\.env\)/u,
  "push registration persists the effective, platform-gated Ziwei schema");
assert.match(route, /effectiveZiweiPayloadSchema[\s\S]+?INSERT INTO mobile_ziwei_hourly_installations/u,
  "the effective schema also controls Ziwei installation enablement");

console.log("MOBILE_PUSH_IOS_READINESS_OK");
