import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.HOURKEY_INTERNAL_JOB_TOKEN = "notification-observability-internal-test";
const { notificationHealthPost: POST } = await import("../src/lib/notification-health-route.ts");

function request(authorization?: string) {
  return new Request("http://localhost/api/internal/health/notifications", {
    method: "POST", headers: authorization ? { authorization } : {},
  });
}

let collectorCalls = 0;
const testDb = {};
const unauthorized = await POST(request(), { db: testDb, collectHealth: async () => { collectorCalls += 1; return { ok: true }; } });
assert.equal(unauthorized.status, 404, "notification health endpoint is hidden without the internal bearer secret");
assert.deepEqual(await unauthorized.json(), { ok: false, error: "not_found" }, "unauthorized response exposes no operational health details");
assert.equal(collectorCalls, 0, "unauthorized endpoint request never reaches health collection");

const failure = await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  collectHealth: async () => { throw new Error("private-token-must-not-escape"); },
});
assert.equal(failure.status, 503, "health dependency failure fails closed");
const failedBody = await failure.text();
assert.equal(failedBody.includes("private-token-must-not-escape"), false, "health dependency failure never exposes exception data");
assert.equal(failedBody.includes("ExponentPushToken"), false, "health dependency failure never exposes a raw provider token");

let healthyInput: Record<string, any> | undefined;
const healthy = await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  env: {
    HOURKEY_INTERNAL_JOB_TOKEN: "notification-observability-internal-test",
    FCM_SERVICE_ACCOUNT_PATH: "/definitely-not-a-real-hourkey-fcm-credential.json",
  },
  collectHealth: async (_db, input) => { healthyInput = input; return { ok: true, reasons: [], metrics: { retry: { overdueCount: 0 } } }; },
});
assert.equal(healthy.status, 200, "authenticated internal caller receives aggregate healthy state");
assert.deepEqual(await healthy.json(), { ok: true, reasons: [], metrics: { retry: { overdueCount: 0 } } }, "endpoint preserves aggregate-only health response");
assert.deepEqual(Object.keys(healthyInput?.heartbeat?.schedulers || {}), [
  "yam", "daily-fortune", "auspicious", "personal-reminders", "monthly-report", "network-morning",
  "zibai", "qimen", "ziwei-hourly",
], "authenticated endpoint supplies one heartbeat slot for every notification scheduler");
assert.deepEqual(healthyInput?.providerReady, { fcm: false, expoIos: false, expoAndroid: false },
  "internal notification health reports each provider platform independently and fail closed by default");

let readyInput: Record<string, any> | undefined;
await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  env: {
    HOURKEY_INTERNAL_JOB_TOKEN: "notification-observability-internal-test",
    FCM_SERVICE_ACCOUNT_PATH: "/definitely-not-a-real-hourkey-fcm-credential.json",
    EXPO_IOS_PUSH_READY: "true",
    EXPO_ANDROID_PUSH_READY: "true",
  },
  collectHealth: async (_db, input) => { readyInput = input; return { ok: true }; },
});
assert.deepEqual(readyInput?.providerReady, { fcm: false, expoIos: true, expoAndroid: true },
  "internal notification health reflects independent exact Expo platform readiness flags");
assert.equal(readyInput?.ziweiRuntime?.producerEnabled, false,
  "internal notification health passes the fail-closed Ziwei runtime producer gate");
assert.equal(typeof readyInput?.ziweiRuntime?.sourceReady, "boolean",
  "internal notification health passes verified Ziwei source readiness");

const unhealthy = await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  collectHealth: async () => ({ ok: false, reasons: ["worker_heartbeat_missing"], metrics: { worker: { fresh: false } } }),
});
assert.equal(unhealthy.status, 503, "authenticated internal caller receives non-2xx for unhealthy notification state");
const routeSource = readFileSync("src/lib/notification-health-route.ts", "utf8");
assert.match(routeSource, /readZiweiRuntimeContext\(env,\s*\{\s*repositoryRoot:\s*process\.cwd\(\)\s*\}\)/u,
  "the bundled Next route passes the immutable release working directory instead of using bundle __dirname");
console.log("NOTIFICATION_OBSERVABILITY_ENDPOINT_OK");
