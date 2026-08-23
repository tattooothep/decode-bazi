-- Zi Bai V3 activation phase. Compatibility migration must already exist.
-- Only V3-capable physical installations are activated; V223 and older remain
-- on V2 and are not claimed by the V3 producer.
BEGIN;

SET LOCAL lock_timeout = '55s';
SELECT pg_advisory_xact_lock(
  hashtextextended('mobile-notification-scheduler:zibai:v1'::text,0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='mobile_push_tokens'
       AND column_name='zibai_calculation_version'
  ) OR to_regclass('ux_mobile_zibai_daily_logical_slot') IS NULL
    OR to_regclass('ux_mobile_zibai_shichen_logical_slot') IS NULL THEN
    RAISE EXCEPTION 'zibai_v3_compatibility_migration_required';
  END IF;
END $$;

UPDATE mobile_zibai_installations z
   SET calculation_version='zibai-zaoming-true-solar-v3',updated_at=now()
  FROM mobile_push_tokens t
 WHERE t.user_id=z.user_id
   AND t.installation_id=z.installation_id
   AND t.enabled=true
   AND t.zibai_calculation_version='zibai-zaoming-true-solar-v3'
   AND z.calculation_version='zibai-zaoming-true-solar-v2';

COMMIT;
