-- Disable application recovery routes before running this rollback.
BEGIN;
DROP TRIGGER IF EXISTS hourkey_reconcile_ziwei_canonical_profile ON profiles;
DROP FUNCTION IF EXISTS hourkey_reconcile_ziwei_canonical_profile();
DROP FUNCTION IF EXISTS hourkey_ziwei_birth_context_confirmed(text,timestamptz);
DROP TABLE IF EXISTS profile_birth_context_events;
DROP TABLE IF EXISTS profile_birth_context_recoveries;
DROP INDEX IF EXISTS ux_profiles_owner_profile;
ALTER TABLE mobile_ziwei_hourly_installations
  DROP COLUMN IF EXISTS birth_context_fingerprint;
ALTER TABLE profiles
  DROP COLUMN IF EXISTS birth_tz_confirmed_at,
  DROP COLUMN IF EXISTS birth_tz_tzdb_version,
  DROP COLUMN IF EXISTS birth_place_id,
  DROP COLUMN IF EXISTS birth_location_source,
  DROP COLUMN IF EXISTS birth_location_confirmed_at,
  DROP COLUMN IF EXISTS birth_location_accuracy_m;
COMMIT;
