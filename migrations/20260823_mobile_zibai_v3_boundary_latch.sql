-- Zi Bai calculation v3: day and shichen regimes latch at their advertised
-- true-solar interval starts. Historical occurrence rows remain immutable.
BEGIN;

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

ALTER TABLE mobile_zibai_installations
  ALTER COLUMN calculation_version SET DEFAULT 'zibai-zaoming-true-solar-v3';
ALTER TABLE mobile_zibai_installations
  DROP CONSTRAINT IF EXISTS mobile_zibai_installations_calculation_version_check;
UPDATE mobile_zibai_installations
   SET calculation_version='zibai-zaoming-true-solar-v3'
 WHERE calculation_version IN ('zibai-zaoming-true-solar-v1','zibai-zaoming-true-solar-v2');
ALTER TABLE mobile_zibai_installations
  ADD CONSTRAINT mobile_zibai_installations_calculation_version_check
  CHECK (calculation_version='zibai-zaoming-true-solar-v3');

ALTER TABLE mobile_zibai_occurrences
  DROP CONSTRAINT IF EXISTS mobile_zibai_occurrences_calculation_version_check;
ALTER TABLE mobile_zibai_occurrences
  ADD CONSTRAINT mobile_zibai_occurrences_calculation_version_check
  CHECK (calculation_version IN (
    'zibai-zaoming-true-solar-v1',
    'zibai-zaoming-true-solar-v2',
    'zibai-zaoming-true-solar-v3'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_zibai_daily_logical_slot
  ON mobile_zibai_occurrences(user_id,installation_id,apparent_solar_date)
  WHERE occurrence_type='daily';
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_zibai_shichen_logical_slot
  ON mobile_zibai_occurrences(user_id,installation_id,apparent_solar_date,shichen_key)
  WHERE occurrence_type='shichen';

COMMIT;
