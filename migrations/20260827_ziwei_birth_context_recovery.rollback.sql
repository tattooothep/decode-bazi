-- Disable application recovery routes before running this rollback.
-- This is a non-destructive containment rollback: retained columns, candidate
-- records and audit events are additive and safe for the previous release to
-- ignore. Keeping them is required for forensic traceability and later resume.
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
       birth_context_fingerprint=NULL,last_skip_reason='rollback_disabled',
       owner_generation=owner_generation+1,updated_at=now()
 WHERE enabled=true OR next_due_at IS NOT NULL OR lease_token IS NOT NULL
    OR birth_context_fingerprint IS NOT NULL;

UPDATE profile_birth_context_recoveries
   SET status='manual_review',failure_code='rollback_disabled',updated_at=now()
 WHERE status='confirmation_required';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app')
     AND to_regprocedure('claim_mobile_ziwei_hourly_installations(timestamptz,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION claim_mobile_ziwei_hourly_installations(timestamptz,integer) FROM PUBLIC, hourkey_app';
  END IF;
END $$;

COMMIT;
