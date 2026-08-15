-- Authenticated in-app notification acknowledgement/open/action evidence.
-- app_received is an app callback only; this schema makes no OS-delivery claim.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_log_id_user
  ON mobile_push_log(id,user_id);

CREATE TABLE IF NOT EXISTS mobile_notification_engagements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  push_log_id uuid NOT NULL,
  event text NOT NULL,
  action_id text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_notification_engagements_log_owner_fk
    FOREIGN KEY(push_log_id,user_id) REFERENCES mobile_push_log(id,user_id) ON DELETE CASCADE,
  CONSTRAINT mobile_notification_engagements_event_check
    CHECK(event IN ('app_received','opened','action')),
  CONSTRAINT mobile_notification_engagements_action_check
    CHECK(
      (event='action' AND action_id ~ '^[a-z][a-z0-9_]{0,63}$')
      OR (event IN ('app_received','opened') AND action_id='')
    ),
  PRIMARY KEY(user_id,installation_id,push_log_id,event,action_id)
);

CREATE INDEX IF NOT EXISTS ix_mobile_notification_engagements_health
  ON mobile_notification_engagements(push_log_id,installation_id,event)
  INCLUDE(recorded_at);

CREATE INDEX IF NOT EXISTS ix_mobile_notification_engagements_retention
  ON mobile_notification_engagements(recorded_at,push_log_id);

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_engagement_cohort
  ON mobile_push_attempts(accepted_at,push_log_id,installation_id)
  WHERE status IN ('provider_accepted','delivered') AND accepted_at IS NOT NULL;

GRANT SELECT,INSERT,DELETE ON mobile_notification_engagements TO hourkey_app;

COMMIT;
