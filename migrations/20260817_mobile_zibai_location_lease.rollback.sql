BEGIN;

UPDATE mobile_zibai_installations
   SET location_expires_at=LEAST(location_expires_at,location_captured_at+interval '24 hours')
 WHERE location_captured_at IS NOT NULL AND location_expires_at IS NOT NULL;
ALTER TABLE mobile_zibai_installations
  DROP CONSTRAINT IF EXISTS mobile_zibai_location_all_or_none;
ALTER TABLE mobile_zibai_installations
  ADD CONSTRAINT mobile_zibai_location_all_or_none CHECK (
    (latitude IS NULL AND longitude IS NULL AND location_timezone IS NULL
      AND location_captured_at IS NULL AND location_expires_at IS NULL)
    OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND location_timezone IS NOT NULL AND btrim(location_timezone)<>''
      AND location_captured_at IS NOT NULL AND location_expires_at IS NOT NULL
      AND location_expires_at > location_captured_at
      AND location_expires_at <= location_captured_at + interval '24 hours')
  );

COMMIT;
