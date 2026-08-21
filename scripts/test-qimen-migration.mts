import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath = new URL("../migrations/20260821_mobile_qimen_three_layer.sql", import.meta.url);
const rollbackPath = new URL("../migrations/20260821_mobile_qimen_three_layer.rollback.sql", import.meta.url);
const v3MigrationPath = new URL("../migrations/20260821_mobile_qimen_component_quality_v3.sql", import.meta.url);
const v3RollbackPath = new URL("../migrations/20260821_mobile_qimen_component_quality_v3.rollback.sql", import.meta.url);
assert.equal(fs.existsSync(migrationPath), true, "Qimen three-layer migration must exist");
assert.equal(fs.existsSync(rollbackPath), true, "Qimen three-layer rollback must exist");
assert.equal(fs.existsSync(v3MigrationPath), true, "Qimen component-quality v3 migration must exist");
assert.equal(fs.existsSync(v3RollbackPath), true, "Qimen component-quality v3 rollback must exist");

const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");
const v3Migration = fs.readFileSync(v3MigrationPath, "utf8");
const v3Rollback = fs.readFileSync(v3RollbackPath, "utf8");

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
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_qimen_logical_shichen\s+ON mobile_qimen_occurrences\(user_id,installation_id,purpose,hour_valid_from\)/u,
  "one logical installation/purpose/shichen slot cannot send twice after a version or direction change");
assert.match(migration, /push_log_id uuid REFERENCES mobile_push_log\(id\) ON DELETE CASCADE/u,
  "bounded retention deletes parent and occurrence together instead of silently detaching immutable evidence");
assert.match(migration, /OLD\.state='claimed' AND NEW\.state IN \('reserved','skipped'\)/u);
assert.match(migration, /send_deadline <= hour_valid_until/u);
assert.match(migration, /CREATE TRIGGER mobile_qimen_occurrence_immutable/u);
assert.match(migration, /OLD\.snapshot IS DISTINCT FROM NEW\.snapshot/u);
assert.match(migration, /WHERE enabled=true AND next_due_at IS NOT NULL/u);

assert.match(rollback, /producer_enabled=false/u);
assert.match(rollback, /qimen_payload_schema=1/u);
assert.doesNotMatch(rollback, /DROP TABLE/u, "rollback preserves immutable delivered evidence");
assert.doesNotMatch(rollback, /DROP COLUMN\s+(?:IF EXISTS\s+)?qimen_payload_schema/iu);

assert.match(v3Migration, /DROP CONSTRAINT IF EXISTS mobile_push_tokens_qimen_payload_schema_check/u);
assert.match(v3Migration, /CHECK \(qimen_payload_schema IN \(1,2,3\)\)/u);
assert.doesNotMatch(v3Migration, /producer_enabled\s*=\s*true/iu,
  "the capability migration must not enable the guarded producer");
assert.match(v3Rollback, /UPDATE mobile_push_tokens SET qimen_payload_schema=2 WHERE qimen_payload_schema=3/u);
assert.match(v3Rollback, /CHECK \(qimen_payload_schema IN \(1,2\)\)/u);
assert.doesNotMatch(v3Rollback, /DROP COLUMN\s+(?:IF EXISTS\s+)?qimen_payload_schema/iu);

console.log("qimen three-layer migration contract tests passed");
