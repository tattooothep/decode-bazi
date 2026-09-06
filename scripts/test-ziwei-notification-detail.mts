import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";
import { buildZiweiHourlySixLayerSnapshot } from "../src/lib/astro/ziwei/hourly-six-layer";

const require = createRequire(import.meta.url);
const helperUrl = new URL("../src/lib/mobile-ziwei-notification-detail.cjs", import.meta.url);
assert.ok(existsSync(helperUrl), "authenticated stored Ziwei notification detail is not implemented");
const detail = require(helperUrl.pathname);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const notificationId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const owner = { accountId, profile: { id: profileId, name: "Owner", isSelf: true } };
const input = { birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok", birthLocation: null,
  gender: "M" as const, referenceInstant: new Date("2026-09-06T12:01:00.000Z"), referenceTimezone: "Asia/Bangkok" };
const snapshots = [runtime.buildZiweiHourlyNotificationSnapshot({ ...owner, facts: buildZiweiHourlyNotificationFacts(input) }),
  buildZiweiHourlySixLayerSnapshot(input, owner)];
assert.deepEqual(snapshots.map((snapshot) => snapshot.snapshotSchema), [1, 2]);
const rowFor = (snapshot: any) => ({ notification_id: notificationId, profile_id: profileId,
  snapshot, snapshot_digest: snapshot.snapshotDigest });
const dbFor = (row: any) => ({ async query() { return { rows: row ? [row] : [] }; } });
const isError = (code: string, status: number) => (error: any) => error instanceof detail.ZiweiNotificationDetailError
  && error.code === code && error.status === status;

for (const snapshot of snapshots) {
  assert.ok(runtime.verifyZiweiHourlyNotificationSnapshot(snapshot));
  const before = JSON.stringify(snapshot);
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = { async query(sql: string, params: unknown[]) { queries.push({ sql, params }); return { rows: [rowFor(snapshot)] }; } };
  const result = await detail.readZiweiNotificationDetail(db, accountId, notificationId);
  assert.deepEqual(result, { notificationId, snapshot });
  assert.equal(result.snapshot, snapshot, "return the exact stored chart, never recompute or upgrade history");
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(queries[0].params, [notificationId, accountId]);
  assert.equal(queries.length, 1, "one stored-row query; no current profile/time lookup");
  const sql = queries[0].sql;
  assert.match(sql, /JOIN mobile_ziwei_hourly_occurrences o ON o\.push_log_id=l\.id/u);
  for (const fragment of ["l.id=$1", "l.user_id=$2", "o.user_id=$2", "l.kind='ziwei'",
    "l.delivery_status IN ('accepted','delivered')", "o.state='reserved'", "o.profile_id"]) assert.ok(sql.includes(fragment));
  assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|users|profiles|now\(/iu);
  for (const row of [
    { ...rowFor(snapshot), notification_id: otherId },
    { ...rowFor(snapshot), profile_id: otherId },
    { ...rowFor(snapshot), snapshot_digest: "0".repeat(64) },
    { ...rowFor(snapshot), snapshot: { ...snapshot, accountId: otherId } },
    { ...rowFor(snapshot), snapshot: { ...snapshot, snapshotSchema: 99 } },
  ]) await assert.rejects(() => detail.readZiweiNotificationDetail(dbFor(row), accountId, notificationId),
    isError("ziwei_notification_snapshot_invalid", 409));
  for (const changedOwner of [{ ...owner, accountId: otherId }, { ...owner, profile: { ...owner.profile, id: otherId } }]) {
    const foreign = runtime.buildZiweiHourlyNotificationSnapshot({ ...changedOwner, facts: snapshot.facts,
      ...(snapshot.sixLayers ? { sixLayers: snapshot.sixLayers } : {}) });
    assert.ok(runtime.verifyZiweiHourlyNotificationSnapshot(foreign), "wrong-owner/profile fixture has a valid digest");
    await assert.rejects(() => detail.readZiweiNotificationDetail(dbFor({ ...rowFor(foreign), profile_id: profileId }), accountId, notificationId),
      isError("ziwei_notification_snapshot_invalid", 409));
  }
}
await assert.rejects(() => detail.readZiweiNotificationDetail(dbFor(null), accountId, notificationId), isError("ziwei_notification_not_found", 404));
let invalidQueries = 0;
const forbiddenDb = { async query() { invalidQueries++; throw new Error("invalid inputs reached SQL"); } };
await assert.rejects(() => detail.readZiweiNotificationDetail(forbiddenDb, "bad", notificationId), isError("ziwei_account_id_invalid", 400));
await assert.rejects(() => detail.readZiweiNotificationDetail(forbiddenDb, accountId, "' OR true --"), isError("ziwei_notification_id_invalid", 400));
assert.equal(invalidQueries, 0);

// Execute this one route with in-memory adapters. No Next server, auth service,
// rate-limit service or production database is imported by this test.
const ts = require("typescript");
const routeCode = ts.transpileModule(readFileSync(new URL("../src/app/api/mobile/v1/ziwei/notification-detail/route.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function route(options: { authenticated?: boolean; limited?: boolean; row?: any; dbError?: boolean; authError?: boolean; limitError?: boolean } = {}) {
  const calls: string[] = [];
  const pool = { async query() { calls.push("db"); if (options.dbError) throw new Error("private database/token details"); return { rows: options.row ? [options.row] : [] }; } };
  const adapters: Record<string, any> = {
    "next/server": { NextResponse: { json: (value: any, init: ResponseInit) => new Response(JSON.stringify(value), init) } },
    "@/lib/db": { pool },
    "@/lib/mobile-auth": { getMobileSession: async () => { calls.push("auth"); if (options.authError) throw new Error("private auth data"); return options.authenticated === false ? null : { userId: accountId }; } },
    "@/lib/rate-limit": { clientIp: () => "192.0.2.1", rateLimit: async (key: string, count: number, interval: number) => {
      calls.push("limit"); assert.equal(key, `mobile-ziwei-notification:${accountId}:192.0.2.1`);
      assert.equal(count, 30); assert.equal(interval, 60_000);
      if (options.limitError) throw new Error("private limiter data"); return { ok: options.limited !== true };
    } },
    "@/lib/mobile-ziwei-notification-detail.cjs": detail,
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", routeCode)((id: string) => {
    assert.ok(Object.hasOwn(adapters, id), `unexpected route import: ${id}`); return adapters[id];
  }, module, module.exports);
  assert.equal(module.exports.dynamic, "force-dynamic"); assert.equal(module.exports.runtime, "nodejs");
  return { get: module.exports.GET, calls };
}
const request = (id = notificationId) => new Request(`https://api.example.test/api/mobile/v1/ziwei/notification-detail?notification_id=${encodeURIComponent(id)}`);
for (const snapshot of snapshots) {
  const handler = route({ row: rowFor(snapshot) });
  const response = await handler.get(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), { ok: true, notificationId, snapshot });
  assert.deepEqual(handler.calls, ["auth", "limit", "db"]);
}
for (const [options, id, status, error, calls] of [
  [{ authenticated: false }, notificationId, 401, "not_authorized", ["auth"]],
  [{ limited: true }, notificationId, 429, "rate_limited", ["auth", "limit"]],
  [{}, "invalid", 400, "ziwei_notification_id_invalid", ["auth", "limit"]],
  [{}, notificationId, 404, "ziwei_notification_not_found", ["auth", "limit", "db"]],
  [{ row: { ...rowFor(snapshots[0]), profile_id: otherId } }, notificationId, 409, "ziwei_notification_snapshot_invalid", ["auth", "limit", "db"]],
  [{ dbError: true }, notificationId, 500, "ziwei_notification_detail_failed", ["auth", "limit", "db"]],
  [{ authError: true }, notificationId, 500, "ziwei_notification_detail_failed", ["auth"]],
  [{ limitError: true }, notificationId, 500, "ziwei_notification_detail_failed", ["auth", "limit"]],
] as const) {
  const handler = route(options), response = await handler.get(request(id));
  assert.equal(response.status, status); assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), { ok: false, error }, "errors are sanitized and contain no snapshot/service details");
  assert.deepEqual(handler.calls, calls);
}
console.log("ZIWEI_NOTIFICATION_DETAIL_OK stored_schemas=1,2 owner_profile_id_digest=PASS SQL_scope=PASS route_auth_rate_limit_no_store_all_statuses=PASS (in-memory only)");
