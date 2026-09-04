-- Containment rollback for R8 foundations. Evidence is preserved.
BEGIN;

UPDATE mobile_science_notification_producer_state
   SET provider_send_enabled=false,rollout_epoch=rollout_epoch+1,updated_at=now()
 WHERE provider_send_enabled<>false;

UPDATE mobile_science_notification_subscriptions
   SET enabled=false,consent_generation=consent_generation+1,updated_at=now()
 WHERE enabled<>false;

UPDATE mobile_science_notification_shadow_cohort
   SET enabled=false,updated_at=now()
 WHERE enabled=true;

UPDATE mobile_science_notification_chains
   SET active=false,target_revision=target_revision+1,updated_at=now()
 WHERE active=true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
    REVOKE INSERT,UPDATE,DELETE ON mobile_science_notification_producer_state FROM hourkey_app;
    REVOKE INSERT,UPDATE,DELETE ON mobile_science_notification_shadow_cohort FROM hourkey_app;
    REVOKE INSERT,UPDATE,DELETE ON mobile_science_notification_occurrences FROM hourkey_app;
  END IF;
END $$;

COMMIT;
