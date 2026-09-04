import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const payload = require("../src/lib/notification-payload.cjs");
const readiness = require("../src/lib/mobile-push-registration-readiness.cjs");

const ASTRONOMY = Object.freeze({
  v: 1,
  kind: "astronomy_fact",
  notificationId: "00000000-0000-4000-8000-000000000001",
  occurrenceId: "00000000-0000-4000-8000-000000000002",
  audience: "A9c7wP4nY2kLm8QrV5sT1u",
  mode: "civil_two_hour",
  url: "/astronomy-facts/detail",
});

assert.deepEqual(payload.parseR8ScienceProviderPayload(ASTRONOMY, ASTRONOMY.audience), ASTRONOMY);
assert.equal(Object.isFrozen(payload.parseR8ScienceProviderPayload(ASTRONOMY, ASTRONOMY.audience)), true);
assert.equal(payload.parseR8ScienceProviderPayload(ASTRONOMY, "D6c7wP4nY2kLm8QrV5sT1u"), null,
  "an installation/account audience mismatch is rejected");
for (const [name, mutation] of [
  ["account ID", { accountId: "private-account" }],
  ["profile ID", { profileId: "00000000-0000-4000-8000-000000000003" }],
  ["organization ID", { orgId: "00000000-0000-4000-8000-000000000004" }],
  ["birth value", { birthDate: "1990-01-01" }],
  ["terrestrial coordinate", { latitude: 13.75 }],
  ["judgment", { judgment: "good" }],
  ["unknown field", { extra: true }],
] as const) {
  assert.equal(payload.parseR8ScienceProviderPayload({ ...ASTRONOMY, ...mutation }, ASTRONOMY.audience), null,
    `${name} cannot enter provider data`);
}
assert.equal(payload.parseR8ScienceProviderPayload({ ...ASTRONOMY, url: "/qizheng/notification-detail" }, ASTRONOMY.audience), null);
assert.equal(payload.parseR8ScienceProviderPayload({ ...ASTRONOMY, mode: "shichen" }, ASTRONOMY.audience), null);
assert.equal(payload.parseR8ScienceProviderPayload({ ...ASTRONOMY, occurrenceId: "bad" }, ASTRONOMY.audience), null);
assert.equal(payload.parseR8ScienceProviderPayload({
  v: 0,
  kind: "qizheng",
  notificationId: ASTRONOMY.notificationId,
  occurrenceId: ASTRONOMY.occurrenceId,
  audience: ASTRONOMY.audience,
  mode: "electional_window",
  url: "/qizheng/notification-detail",
}, ASTRONOMY.audience), null, "Qizheng schema zero cannot parse a provider payload");

let getterCalls = 0;
const accessor = { ...ASTRONOMY } as Record<string, unknown>;
Object.defineProperty(accessor, "audience", { enumerable: true, get() { getterCalls += 1; return ASTRONOMY.audience; } });
assert.equal(payload.parseR8ScienceProviderPayload(accessor, ASTRONOMY.audience), null);
assert.equal(getterCalls, 0, "the parser rejects accessors without executing them");

assert.equal(readiness.effectiveAstronomyFactPayloadSchema(1), 1);
assert.equal(readiness.effectiveAstronomyFactPayloadSchema(0), 0);
assert.equal(readiness.effectiveAstronomyFactPayloadSchema(2), 0);
assert.equal(readiness.r8ScienceProviderDeliveryReady("astronomy_fact"), false);
assert.equal(readiness.r8ScienceProviderDeliveryReady("qizheng"), false);

const pushRoute = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const notificationRoute = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
assert.match(pushRoute, /astronomyFactPayloadSchema/u);
assert.match(pushRoute, /astronomy_fact_payload_schema/u);
assert.match(notificationRoute, /"astronomy_fact"/u);
assert.match(notificationRoute, /"qizheng"/u);

const mobileRoot = process.env.HOURKEY_MOBILE_ROOT;
const mobileSha = process.env.HOURKEY_MOBILE_SHA;
assert.ok(mobileRoot && mobileSha, "the exact reviewed mobile worktree and baseline SHA are required");
assert.equal(execFileSync("git", ["merge-base", "--is-ancestor", mobileSha, "HEAD"], { cwd: mobileRoot }).toString(), "",
  "the mobile implementation descends from the pinned v233 baseline");
const mobilePayload = readFileSync(join(mobileRoot, "src/navigation/notificationPayload.ts"), "utf8");
const mobilePush = readFileSync(join(mobileRoot, "src/native/push.ts"), "utf8");
assert.match(mobilePayload, /astronomy_fact/u);
assert.match(mobilePayload, /\/astronomy-facts\/detail/u);
assert.match(mobilePush, /astronomy_fact_payload_schema:\s*1/u);
assert.match(mobilePush, /qizheng_payload_schema:\s*0/u);

console.log("MOBILE_SCIENCE_PAYLOAD_R8_OK strict-separated-hard-off");
