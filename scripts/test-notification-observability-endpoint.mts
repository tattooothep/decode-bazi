import assert from "node:assert/strict";

process.env.HOURKEY_INTERNAL_JOB_TOKEN = "notification-observability-internal-test";
const { POST } = await import("../src/app/api/internal/health/notifications/route.ts");

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

const healthy = await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  collectHealth: async () => ({ ok: true, reasons: [], metrics: { retry: { overdueCount: 0 } } }),
});
assert.equal(healthy.status, 200, "authenticated internal caller receives aggregate healthy state");
assert.deepEqual(await healthy.json(), { ok: true, reasons: [], metrics: { retry: { overdueCount: 0 } } }, "endpoint preserves aggregate-only health response");

const unhealthy = await POST(request("Bearer notification-observability-internal-test"), {
  db: testDb,
  collectHealth: async () => ({ ok: false, reasons: ["worker_heartbeat_missing"], metrics: { worker: { fresh: false } } }),
});
assert.equal(unhealthy.status, 503, "authenticated internal caller receives non-2xx for unhealthy notification state");
console.log("NOTIFICATION_OBSERVABILITY_ENDPOINT_OK");
