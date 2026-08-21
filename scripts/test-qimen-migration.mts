import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = new URL("../migrations/20260821_mobile_qimen_three_layer.sql", import.meta.url);
const rollbackPath = new URL("../migrations/20260821_mobile_qimen_three_layer.rollback.sql", import.meta.url);
assert.equal(fs.existsSync(migrationPath), true, "Qimen three-layer migration must exist");
assert.equal(fs.existsSync(rollbackPath), true, "Qimen three-layer rollback must exist");

const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");

for (const required of [
  "qimen_payload_schema",
  "mobile_qimen_installations",
  "mobile_qimen_occurrences",
  "mobile_qimen_producer_state",
  "location_expires_at <= location_captured_at + interval '7 days'",
  "next_due_at",
  "purpose",
  "hour_valid_from",
  "hour_valid_until",
  "send_deadline",
  "selected_direction",
  "version_tuple",
  "source_tuple",
  "snapshot",
  "snapshot_digest",
  "occurrence_key",
  "FOR UPDATE SKIP LOCKED",
  "producer_enabled",
]) assert.ok(migration.includes(required), `migration must include ${required}`);

assert.match(migration, /CHECK \(qimen_payload_schema IN \(1,2\)\)/u);
assert.match(migration, /CHECK \(purpose IN \('travel'\)\)/u);
assert.match(migration, /CHECK \(selected_direction IS NULL OR selected_direction IN \('N','NE','E','SE','S','SW','W','NW'\)\)/u);
assert.match(migration, /CHECK \(state IN \('claimed','reserved','skipped'\)\)/u);
assert.match(migration, /UNIQUE\(user_id,installation_id,occurrence_key\)/u);
assert.match(migration, /jsonb_typeof\(snapshot\)='object'/u);
assert.match(migration, /snapshot_digest ~ '\^\[0-9a-f\]\{64\}\$'/u);
assert.match(migration, /send_deadline <= hour_valid_until/u);
assert.match(migration, /CREATE TRIGGER mobile_qimen_occurrence_immutable/u);
assert.match(migration, /OLD\.snapshot IS DISTINCT FROM NEW\.snapshot/u);
assert.match(migration, /WHERE enabled=true AND next_due_at IS NOT NULL/u);

assert.match(rollback, /producer_enabled=false/u);
assert.match(rollback, /qimen_payload_schema=1/u);
assert.doesNotMatch(rollback, /DROP TABLE/u, "rollback preserves immutable delivered evidence");
assert.doesNotMatch(rollback, /DROP COLUMN\s+(?:IF EXISTS\s+)?qimen_payload_schema/iu);

console.log("qimen three-layer migration contract tests passed");
