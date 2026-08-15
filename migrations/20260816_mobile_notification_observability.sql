-- Notification observability and bounded-retention metadata. Existing parents
-- are classified before the default changes: rows with durable attempts are
-- generation 1, while preserved pre-attempt legacy history is generation 0.
BEGIN;

ALTER TABLE mobile_push_log
  ADD COLUMN IF NOT EXISTS delivery_model_generation smallint,
  ADD COLUMN IF NOT EXISTS attempts_retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_facts_redacted_at timestamptz;

UPDATE mobile_push_log l
   SET delivery_model_generation=CASE WHEN EXISTS (
     SELECT 1 FROM mobile_push_attempts a WHERE a.push_log_id=l.id
   ) THEN 1 ELSE 0 END
 WHERE delivery_model_generation IS NULL;

ALTER TABLE mobile_push_log
  ALTER COLUMN delivery_model_generation SET DEFAULT 1,
  ALTER COLUMN delivery_model_generation SET NOT NULL;
ALTER TABLE mobile_push_log
  DROP CONSTRAINT IF EXISTS mobile_push_log_delivery_model_generation_check;
ALTER TABLE mobile_push_log
  ADD CONSTRAINT mobile_push_log_delivery_model_generation_check
  CHECK (delivery_model_generation IN (0,1));

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_retry_claimable
  ON mobile_push_attempts((COALESCE(next_retry_at,to_timestamp(0))),id)
  WHERE status='retry_due' AND send_started_at IS NULL AND lease_token IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_reserved_stale
  ON mobile_push_attempts((COALESCE(updated_at,created_at)),(COALESCE(next_retry_at,to_timestamp(0))),id)
  WHERE status='reserved' AND send_started_at IS NULL AND lease_token IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_receipt_stalled
  ON mobile_push_attempts(accepted_at,id)
  WHERE provider='expo' AND status='provider_accepted'
    AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_receipt_missing_accepted
  ON mobile_push_attempts(id)
  WHERE provider='expo' AND status='provider_accepted'
    AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL
    AND accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_lease_expired
  ON mobile_push_attempts(lease_expires_at,id)
  WHERE lease_token IS NOT NULL AND lease_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_lease_missing_expiry
  ON mobile_push_attempts(status,id)
  WHERE lease_token IS NOT NULL AND lease_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_unrecoverable_inflight
  ON mobile_push_attempts(status,id)
  WHERE status IN ('reserved','retry_due') AND send_started_at IS NOT NULL AND lease_token IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_terminal_lease
  ON mobile_push_attempts(status,id)
  WHERE status IN ('dead','delivered') AND (lease_token IS NOT NULL OR lease_expires_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_status_token
  ON mobile_push_attempts(status,token_id)
  WHERE status IN ('reserved','retry_due');

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_updated
  ON mobile_push_attempts(updated_at)
  INCLUDE(status,provider,accepted_at,send_started_at,provider_receipt_checked_at,last_error);

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_parent_status
  ON mobile_push_attempts(push_log_id,status)
  INCLUDE(provider,provider_ticket_id,delivered_at);

CREATE INDEX IF NOT EXISTS ix_mobile_push_tokens_observability_enabled
  ON mobile_push_tokens(platform,device_token_type)
  INCLUDE(device_push_token,expo_push_token)
  WHERE enabled=true;

CREATE INDEX IF NOT EXISTS ix_mobile_push_log_retention_age
  ON mobile_push_log((COALESCE(sent_at,accepted_at,updated_at)),id)
  INCLUDE(kind,delivery_status,delivery_model_generation,attempts_retired_at);

CREATE INDEX IF NOT EXISTS ix_mobile_push_log_source_facts_retention
  ON mobile_push_log((COALESCE(sent_at,accepted_at,updated_at)),id)
  WHERE source_facts_redacted_at IS NULL AND source_facts<>'{}'::jsonb;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_retention_age
  ON mobile_push_attempts(updated_at,push_log_id)
  INCLUDE(status,provider,provider_receipt_checked_at);

COMMIT;
