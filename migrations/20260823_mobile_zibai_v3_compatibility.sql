-- Zi Bai V3 compatibility phase. This does not activate the V3 producer.
-- It permanently expands readers/history, records an exact client capability,
-- and installs version-independent replay fences.
BEGIN;

SET LOCAL lock_timeout = '55s';
SELECT pg_advisory_xact_lock(
  hashtextextended('mobile-notification-scheduler:zibai:v1'::text,0)
);

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS zibai_calculation_version text;
UPDATE mobile_push_tokens
   SET zibai_calculation_version='zibai-zaoming-true-solar-v2'
 WHERE zibai_calculation_version IS NULL;
ALTER TABLE mobile_push_tokens
  ALTER COLUMN zibai_calculation_version SET DEFAULT 'zibai-zaoming-true-solar-v2',
  ALTER COLUMN zibai_calculation_version SET NOT NULL;
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_zibai_calculation_version_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_zibai_calculation_version_check
  CHECK (zibai_calculation_version IN (
    'zibai-zaoming-true-solar-v2',
    'zibai-zaoming-true-solar-v3'
  ));

ALTER TABLE mobile_zibai_installations
  ALTER COLUMN calculation_version SET DEFAULT 'zibai-zaoming-true-solar-v2';
ALTER TABLE mobile_zibai_installations
  DROP CONSTRAINT IF EXISTS mobile_zibai_installations_calculation_version_check;
UPDATE mobile_zibai_installations
   SET calculation_version='zibai-zaoming-true-solar-v2'
 WHERE calculation_version='zibai-zaoming-true-solar-v1';
ALTER TABLE mobile_zibai_installations
  ADD CONSTRAINT mobile_zibai_installations_calculation_version_check
  CHECK (calculation_version IN (
    'zibai-zaoming-true-solar-v2',
    'zibai-zaoming-true-solar-v3'
  ));

ALTER TABLE mobile_zibai_occurrences
  DROP CONSTRAINT IF EXISTS mobile_zibai_occurrences_calculation_version_check;
ALTER TABLE mobile_zibai_occurrences
  ADD CONSTRAINT mobile_zibai_occurrences_calculation_version_check
  CHECK (calculation_version IN (
    'zibai-zaoming-true-solar-v1',
    'zibai-zaoming-true-solar-v2',
    'zibai-zaoming-true-solar-v3'
  ));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM mobile_zibai_occurrences
     WHERE occurrence_type='daily'
     GROUP BY user_id,installation_id,apparent_solar_date
    HAVING count(*) > 1
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'zibai_v3_duplicate_daily_logical_slot';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM mobile_zibai_occurrences
     WHERE occurrence_type='shichen'
     GROUP BY user_id,installation_id,apparent_solar_date,shichen_key
    HAVING count(*) > 1
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'zibai_v3_duplicate_shichen_logical_slot';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_zibai_daily_logical_slot
  ON mobile_zibai_occurrences(user_id,installation_id,apparent_solar_date)
  WHERE occurrence_type='daily';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_zibai_shichen_logical_slot
  ON mobile_zibai_occurrences(user_id,installation_id,apparent_solar_date,shichen_key)
  WHERE occurrence_type='shichen';

COMMIT;
