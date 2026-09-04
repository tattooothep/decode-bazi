import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeSource = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const transpiled = ts.transpileModule(routeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
let connects = 0;
const module = { exports: {} as any };
const mockRequire = (id: string) => {
  if (id === "next/server") return { NextResponse: { json: (body: unknown, init: ResponseInit = {}) => Response.json(body, init) } };
  if (id === "@/lib/db") return { pool: { connect: async () => { connects++; throw new Error("TEST_STOP_BEFORE_DB"); } } };
  if (id === "@/lib/mobile-auth") return { getMobileSession: async () => ({ userId: "11111111-1111-4111-8111-111111111111" }) };
  if (id === "@/lib/rate-limit") return { clientIp: () => "test", rateLimit: async () => ({ ok: true }) };
  if (id === "@/lib/astro/ziwei/context-resolver") return {};
  if (id === "@/lib/zibai-version-runtime.cjs") return require("../src/lib/zibai-version-runtime.cjs");
  if (id === "@/lib/mobile-push-registration-readiness.cjs") return require("../src/lib/mobile-push-registration-readiness.cjs");
  throw new Error(`unexpected dependency ${id}`);
};
new Function("require", "module", "exports", "process", transpiled)(mockRequire, module, module.exports, { env: {} });
const body = {
  expo_push_token: "ExponentPushToken[synthetic_registration_test]",
  installation_id: "22222222-2222-4222-8222-222222222222", platform: "android", locale: "th", timezone: "Asia/Bangkok",
};
const call = (patch: any) => module.exports.POST(new Request("https://example.invalid/api/mobile/v1/push", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...patch }),
}));
for (const qimenPayloadSchema of [1, 2, 3, 4]) {
  const before = connects;
  await assert.rejects(call({ qimenPayloadSchema }), /TEST_STOP_BEFORE_DB/u, `numeric schema ${qimenPayloadSchema} passes only validation`);
  assert.equal(connects, before + 1);
}
for (const qimenPayloadSchema of [0, 5, -1, 3.5, "4", null, true, {}, []]) {
  const before = connects;
  const response = await call({ qimenPayloadSchema });
  assert.equal(response.status, 400); assert.equal(connects, before);
  assert.equal((await response.json()).error, "invalid_push_registration");
}
assert.equal((await call({ qimenPayloadSchema: 4, qizhengPayloadSchema: 1 })).status, 400, "Qizheng remains hard-off");
assert.equal((await call({ qimenPayloadSchema: 4, locale: "unsupported" })).status, 400);
assert.equal((await call({ qimenPayloadSchema: 4, device_token_type: "apns", device_push_token: "x".repeat(64) })).status, 400,
  "platform/native identity guard remains unchanged");
const prefs = readFileSync("src/lib/mobile-notification-preferences.ts", "utf8");
assert.equal((routeSource.match(/\$3::smallint IN \(3,4\)/gu) || []).length, 2);
assert.equal((prefs.match(/t\.qimen_payload_schema IN \(3,4\)/gu) || []).length, 2);
for (const source of [routeSource, prefs]) {
  assert.match(source, /qimen_location_updated_at\+interval '7 days'/u);
  assert.match(source, /owner_generation=mobile_qimen_installations.owner_generation\+1/u);
}
const migration = readFileSync("migrations/20260905_mobile_qimen_schema4_compatibility.sql", "utf8");
assert.match(migration, /SET LOCAL lock_timeout = '1s';/u);
assert.match(migration, /SET LOCAL statement_timeout = '5s';/u);
assert.match(migration, /CHECK \(qimen_payload_schema IN \(1,2,3,4\)\)/u);
assert.doesNotMatch(migration, /\b(?:UPDATE|INSERT|DELETE|CREATE FUNCTION)\b/u);
assert.match(readFileSync("migrations/20260821_mobile_qimen_component_quality_v3.sql", "utf8"), /CHECK \(qimen_payload_schema IN \(1,2,3\)\)/u);
console.log("QIMEN_SCHEMA4_COMPATIBILITY_OK route_validation=PASS invalid_types=PASS unchanged_gates=PASS migration_source_only=PASS");
