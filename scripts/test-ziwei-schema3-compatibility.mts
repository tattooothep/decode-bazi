import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import readiness from "../src/lib/mobile-push-registration-readiness.cjs";

const read = (path: string) => readFileSync(path, "utf8");
const historicalMigration = read("migrations/20260826_mobile_hourly_sciences.sql");
const expansionMigrationPath = "migrations/20260905_mobile_ziwei_schema3_compatibility.sql";
const expansionMigration = existsSync(expansionMigrationPath) ? read(expansionMigrationPath) : "";
const pushRoute = read("src/app/api/mobile/v1/push/route.ts");
const preferences = read("src/lib/mobile-notification-preferences.ts");
const observability = read("src/lib/notification-observability.cjs");
const recoveryPreflight = read("scripts/preflight-ziwei-birth-context-recovery.mts");

assert.match(historicalMigration, /CHECK \(ziwei_payload_schema IN \(0,1,2\)\)/u,
  "historical migration evidence remains unchanged");
assert.match(expansionMigration, /BEGIN;[\s\S]*DROP CONSTRAINT IF EXISTS mobile_push_tokens_ziwei_payload_schema_check/u);
assert.match(expansionMigration, /SET LOCAL lock_timeout = '1s';/u,
  "compatibility DDL fails fast instead of queuing an access-exclusive lock behind live traffic");
assert.match(expansionMigration, /SET LOCAL statement_timeout = '5s';/u,
  "compatibility DDL has a bounded execution window");
assert.equal((expansionMigration.match(/\bBEGIN;/gu) || []).length, 1,
  "migration has no in-transaction retry loop or service-pause choreography");
assert.match(expansionMigration, /CHECK \(ziwei_payload_schema IN \(0,1,2,3\)\)/u,
  "the additive compatibility migration accepts only the existing values plus schema 3");
assert.match(expansionMigration, /COMMIT;/u);
assert.doesNotMatch(expansionMigration, /\b(?:UPDATE|INSERT|DELETE)\b/u,
  "capability expansion never rewrites registrations or user preferences");
assert.doesNotMatch(expansionMigration, /CREATE(?: OR REPLACE)? FUNCTION/u,
  "no database function needs replacement when none filters the token capability");

const post = pushRoute.slice(pushRoute.indexOf("export async function POST"), pushRoute.indexOf("export async function DELETE"));
const beforeMutation = post.slice(0, post.indexOf("const client = await pool.connect()"));
assert.match(beforeMutation, /!\[0, 1, 2, 3\]\.includes\(requestedZiweiPayloadSchema\)/u,
  "registration accepts schema 3 but rejects arbitrary future schemas before mutation");
assert.match(post,
  /ziweiEnrolled = ziweiPayloadSchema === 2 \|\| ziweiPayloadSchema === 3;/u,
  "the effective platform-gated schema controls compatibility enrollment");
assert.ok(post.indexOf("effectiveZiweiPayloadSchema") < post.indexOf("const client = await pool.connect()"),
  "iOS readiness gating remains before registration mutation");

assert.equal(readiness.effectiveZiweiPayloadSchema("android", 3, {}), 3,
  "Android preserves an explicitly validated schema-3 capability");
assert.equal(readiness.effectiveZiweiPayloadSchema("ios", 3, {}), 0,
  "iOS schema 3 remains fail-closed before Expo iOS readiness");
assert.equal(readiness.effectiveZiweiPayloadSchema("ios", 3, { EXPO_IOS_PUSH_READY: "true" }), 3,
  "ready iOS preserves the negotiated schema without changing the gate");

assert.equal((preferences.match(/t\.ziwei_payload_schema IN \(2,3\)/gu) || []).length, 2,
  "preference enrollment and next-due scheduling both recognize V2 and V3 installations");
assert.match(observability, /t\.enabled=true AND t\.ziwei_payload_schema IN \(2,3\)/u,
  "health inventory includes both compatible Ziwei schemas");
assert.match(recoveryPreflight, /enabled=true AND ziwei_payload_schema IN \(2,3\)/u,
  "birth-context recovery preflight includes all enrolled compatible installations");

for (const source of [pushRoute, preferences, observability, recoveryPreflight]) {
  assert.doesNotMatch(source, /ziwei_payload_schema\s*=\s*4\b/u,
    "compatibility readers must not admit an unreviewed future schema");
  assert.doesNotMatch(source, /ziwei_payload_schema\s+IN\s*\([^)]*(?:,\s*4\b|\b4\s*,)[^)]*\)/u,
    "compatibility readers must not admit an unreviewed future schema");
}

console.log("ZIWEI_SCHEMA3_COMPATIBILITY_OK");
