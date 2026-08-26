BEGIN;

-- The scheduler role already has SELECT/UPDATE on immutable Ziwei occurrences.
-- Retention adds only bounded deletion; producer-state control remains outside
-- the application role.
GRANT DELETE ON mobile_ziwei_hourly_occurrences TO hourkey_app;

COMMIT;
