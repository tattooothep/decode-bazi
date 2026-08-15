-- Removes only app engagement evidence and its supporting owner index.
BEGIN;

DROP TABLE IF EXISTS mobile_notification_engagements;
DROP INDEX IF EXISTS ix_mobile_push_attempts_engagement_cohort;
DROP INDEX IF EXISTS ux_mobile_push_log_id_user;

COMMIT;
