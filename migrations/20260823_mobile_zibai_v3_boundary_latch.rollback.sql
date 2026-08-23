-- Roll the active producer back to v2 without deleting v3 audit history or
-- removing the cross-version replay fences.
BEGIN;

SET LOCAL lock_timeout = '55s';
SELECT pg_advisory_xact_lock(
  hashtextextended('mobile-notification-scheduler:zibai:v1'::text,0)
);

ALTER TABLE mobile_zibai_installations
  ALTER COLUMN calculation_version SET DEFAULT 'zibai-zaoming-true-solar-v2';
UPDATE mobile_zibai_installations
   SET calculation_version='zibai-zaoming-true-solar-v2',updated_at=now()
 WHERE calculation_version='zibai-zaoming-true-solar-v3';

COMMIT;
