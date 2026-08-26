import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCE_DIGEST } from "./mobile-ziwei-hourly-push-cron.mts";

const migration = readFileSync("migrations/20260826_mobile_hourly_sciences.sql", "utf8");
const rollback = readFileSync("migrations/20260826_mobile_hourly_sciences.rollback.sql", "utf8");

for (const column of ["ziwei_hourly_enabled", "ziwei_profile_id", "qizheng_electional_enabled"]) {
  assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`, "u"));
}
assert.match(migration, /CHECK \(qizheng_electional_enabled=false\)/u,
  "Qizheng electional consent remains hard-disabled until the source rulepack is approved");
assert.match(migration, /ADD COLUMN IF NOT EXISTS ziwei_payload_schema smallint/u);
assert.match(migration, /CHECK \(ziwei_payload_schema IN \(0,1,2\)\)/u,
  "schema 1 tokens remain stored but only the placement-complete schema 2 is deliverable");
assert.match(migration, /ADD COLUMN IF NOT EXISTS qizheng_payload_schema smallint/u);
assert.match(migration, /CHECK \(qizheng_payload_schema=0\)/u);

assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_producer_state/u);
assert.match(migration, new RegExp(SOURCE_DIGEST, "u"), "migration source gate must match the locked lineage manifest digest");
assert.match(migration, /producer_enabled boolean NOT NULL DEFAULT false/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_qizheng_electional_producer_state/u);
assert.match(migration, /evidence_status text NOT NULL DEFAULT 'incomplete'/u);
assert.match(migration, /mobile_qizheng_electional_producer_disabled[\s\S]*CHECK \(producer_enabled=false\)/u,
  "Qizheng producer remains structurally hard-off until a later evidence migration replaces this constraint");

assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_installations/u);
assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_occurrences/u);
assert.match(migration, /UNIQUE\(user_id,installation_id,profile_id,owner_generation,window_valid_from\)/u,
  "a material context change must be able to create a fresh same-window occurrence");
assert.doesNotMatch(migration, /UNIQUE\(user_id,installation_id,profile_id,window_valid_from\)/u,
  "the previous generation must not block a corrected same-window occurrence");
assert.match(migration, /snapshot_digest text NOT NULL CHECK \(snapshot_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
assert.match(migration, /owner_generation bigint NOT NULL/u,
  "each immutable occurrence must bind the exact profile/install generation");
assert.match(migration, /CREATE OR REPLACE FUNCTION enforce_mobile_ziwei_hourly_occurrence_immutable/u);
assert.match(migration, /CREATE OR REPLACE FUNCTION claim_mobile_ziwei_hourly_installations/u);
assert.match(migration, /FOR UPDATE SKIP LOCKED/u);
assert.match(migration, /LIMIT LEAST\(GREATEST\(p_limit,1\),10000\)/u);
assert.match(migration, /CREATE OR REPLACE FUNCTION hourkey_birth_timezone_valid/u);
assert.match(migration, /matched\[2\]::integer<14\s+OR\s+\(matched\[2\]::integer=14\s+AND\s+matched\[3\]::integer=0\)/u,
  "fixed offsets must be bounded by an absolute maximum of 14:00");
assert.match(migration, /lower\(name\)=lower\(value\)/u,
  "PostgreSQL timezone eligibility must agree with Intl on harmless IANA casing differences");
assert.match(migration, /BEFORE INSERT OR UPDATE OF[\s\S]*OR DELETE/u,
  "delete and owner/profile fact changes must reconcile before referential actions erase the binding");
assert.match(migration, /mobile-push-user:/u,
  "profile mutation and preference enable must serialize on the same account lock");
assert.doesNotMatch(migration, /GRANT[^;]*DELETE ON mobile_ziwei_hourly_occurrences/u,
  "the runtime role cannot delete immutable science occurrences directly");

assert.doesNotMatch(migration, /mobile_qizheng_electional_occurrences|claim_mobile_qizheng/u,
  "no Qizheng production occurrence/scheduler surface exists before science approval");
assert.match(rollback, /DROP TABLE IF EXISTS mobile_ziwei_hourly_occurrences/u);
assert.match(rollback, /DROP TABLE IF EXISTS mobile_ziwei_hourly_installations/u);
assert.match(rollback, /DROP TRIGGER IF EXISTS hourkey_reconcile_ziwei_hourly_profile ON profiles/u);
assert.match(rollback, /DROP FUNCTION IF EXISTS hourkey_reconcile_ziwei_hourly_profile\(\)/u);
assert.match(rollback, /DROP FUNCTION IF EXISTS hourkey_birth_timezone_valid\(text\)/u);

console.log("PASS mobile hourly science migration — separate capabilities, immutable Ziwei, hard-blocked Qizheng");
