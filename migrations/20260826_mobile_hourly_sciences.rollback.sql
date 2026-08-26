BEGIN;

DROP TRIGGER IF EXISTS mobile_ziwei_push_attempt_integrity ON mobile_push_attempts;
DROP FUNCTION IF EXISTS enforce_mobile_ziwei_push_attempt_integrity();
DROP TRIGGER IF EXISTS mobile_ziwei_push_parent_integrity ON mobile_push_log;
DROP FUNCTION IF EXISTS enforce_mobile_ziwei_push_parent_integrity();
DROP TRIGGER IF EXISTS hourkey_reconcile_ziwei_hourly_profile ON profiles;
DROP FUNCTION IF EXISTS hourkey_reconcile_ziwei_hourly_profile();
DROP FUNCTION IF EXISTS claim_mobile_ziwei_hourly_installations(timestamptz,integer);
DROP TABLE IF EXISTS mobile_ziwei_hourly_occurrences;
DROP FUNCTION IF EXISTS enforce_mobile_ziwei_hourly_occurrence_immutable();
DROP TABLE IF EXISTS mobile_ziwei_hourly_installations;
DROP TRIGGER IF EXISTS mobile_ziwei_hourly_producer_mutation_gate
  ON mobile_ziwei_hourly_producer_state;
DROP FUNCTION IF EXISTS serialize_mobile_ziwei_hourly_producer_mutation();
DROP TABLE IF EXISTS mobile_ziwei_hourly_producer_state;
DROP TABLE IF EXISTS mobile_qizheng_electional_producer_state;

ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_ziwei_payload_schema_check,
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qizheng_payload_schema_check,
  DROP COLUMN IF EXISTS ziwei_payload_schema,
  DROP COLUMN IF EXISTS qizheng_payload_schema;
ALTER TABLE mobile_notification_prefs
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_qizheng_electional_disabled,
  DROP COLUMN IF EXISTS ziwei_hourly_enabled,
  DROP COLUMN IF EXISTS ziwei_profile_id,
  DROP COLUMN IF EXISTS qizheng_electional_enabled;

DROP FUNCTION IF EXISTS hourkey_ziwei_birth_wall_eligible(timestamptz,text);
DROP FUNCTION IF EXISTS hourkey_birth_timezone_valid(text);

COMMIT;
