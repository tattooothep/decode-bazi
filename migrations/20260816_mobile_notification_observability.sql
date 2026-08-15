-- Read-only notification health and reconciliation access paths. These indexes
-- preserve the Task 2 durable-attempt invariants and do not alter data.
BEGIN;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_reserved_stale
  ON mobile_push_attempts((COALESCE(send_started_at,updated_at,created_at)),id)
  WHERE status='reserved' AND lease_token IS NULL;

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_observability_receipt_stalled
  ON mobile_push_attempts(accepted_at,id)
  WHERE provider='expo' AND status='provider_accepted'
    AND provider_ticket_id IS NOT NULL AND provider_receipt_checked_at IS NULL;

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

COMMIT;
