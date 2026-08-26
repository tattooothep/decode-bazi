-- Non-destructive containment rollback.
-- The previous application release ignores these additive objects. Preserve
-- immutable occurrences and delivery evidence so an operational rollback can
-- never erase user/audit data merely to restore service.
BEGIN;

UPDATE mobile_ziwei_hourly_producer_state
   SET producer_enabled=false,backend_commit=NULL,enabled_at=NULL,enabled_by=NULL,
       updated_at=now()
 WHERE singleton=true;

UPDATE mobile_notification_prefs
   SET ziwei_hourly_enabled=false,updated_at=now()
 WHERE ziwei_hourly_enabled=true;

UPDATE mobile_ziwei_hourly_installations
   SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
       last_skip_reason='rollback_disabled',owner_generation=owner_generation+1,
       updated_at=now()
 WHERE enabled=true OR next_due_at IS NOT NULL OR lease_token IS NOT NULL;

UPDATE mobile_push_attempts a
   SET status='dead',next_retry_at=NULL,lease_token=NULL,lease_expires_at=NULL,
       last_error='ziwei_rollback_disabled',updated_at=now()
  FROM mobile_push_log l
 WHERE l.id=a.push_log_id AND l.kind='ziwei'
   AND a.status IN ('reserved','retry_due') AND a.send_started_at IS NULL;

UPDATE mobile_push_log l
   SET delivery_status='failed',next_retry_at=NULL,
       last_error='ziwei_rollback_disabled',updated_at=now()
 WHERE l.kind='ziwei' AND l.delivery_status='pending'
   AND NOT EXISTS (
     SELECT 1 FROM mobile_push_attempts a
      WHERE a.push_log_id=l.id AND a.status IN ('reserved','retry_due')
   );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app')
     AND to_regprocedure('claim_mobile_ziwei_hourly_installations(timestamptz,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION claim_mobile_ziwei_hourly_installations(timestamptz,integer) FROM PUBLIC, hourkey_app';
  END IF;
END $$;

COMMIT;
