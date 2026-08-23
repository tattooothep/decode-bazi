-- Roll the active producer back to v2 without deleting v3 audit history or
-- removing the cross-version replay fences.
BEGIN;

ALTER TABLE mobile_zibai_installations
  ALTER COLUMN calculation_version SET DEFAULT 'zibai-zaoming-true-solar-v2';
ALTER TABLE mobile_zibai_installations
  DROP CONSTRAINT IF EXISTS mobile_zibai_installations_calculation_version_check;
UPDATE mobile_zibai_installations
   SET calculation_version='zibai-zaoming-true-solar-v2'
 WHERE calculation_version='zibai-zaoming-true-solar-v3';
ALTER TABLE mobile_zibai_installations
  ADD CONSTRAINT mobile_zibai_installations_calculation_version_check
  CHECK (calculation_version='zibai-zaoming-true-solar-v2');

ALTER TABLE mobile_zibai_occurrences
  DROP CONSTRAINT IF EXISTS mobile_zibai_occurrences_calculation_version_check;
ALTER TABLE mobile_zibai_occurrences
  ADD CONSTRAINT mobile_zibai_occurrences_calculation_version_check
  CHECK (calculation_version IN (
    'zibai-zaoming-true-solar-v1',
    'zibai-zaoming-true-solar-v2',
    'zibai-zaoming-true-solar-v3'
  ));

COMMIT;
