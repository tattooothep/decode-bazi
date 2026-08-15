-- Schema-only rollback for observability access paths. Durable notification
-- data, constraints, and Task 2/3 delivery-state invariants are preserved.
BEGIN;

DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_retry_claimable;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_reserved_stale;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_receipt_stalled;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_receipt_missing_accepted;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_lease_expired;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_lease_missing_expiry;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_unrecoverable_inflight;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_terminal_lease;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_status_token;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_updated;
DROP INDEX IF EXISTS ix_mobile_push_attempts_observability_parent_status;
DROP INDEX IF EXISTS ix_mobile_push_tokens_observability_enabled;
DROP INDEX IF EXISTS ix_mobile_push_log_retention_age;
DROP INDEX IF EXISTS ix_mobile_push_log_source_facts_retention;
DROP INDEX IF EXISTS ix_mobile_push_attempts_retention_age;

-- The three mobile_push_log metadata columns intentionally remain in place.
-- Dropping them would erase the legacy/new cutover and retention audit markers,
-- causing a forward reapply to misclassify already-retired generation-1 rows.

COMMIT;
