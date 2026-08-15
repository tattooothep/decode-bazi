-- Schema-only rollback for observability access paths. Durable notification
-- data, constraints, and Task 2/3 delivery-state invariants are preserved.
BEGIN;

DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_reserved_stale;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_receipt_stalled;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_status_token;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_updated;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_parent_status;
DROP INDEX IF EXISTS ix_mobile_push_tokens_observability_enabled;

COMMIT;
