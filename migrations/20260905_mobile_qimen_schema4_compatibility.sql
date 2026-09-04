-- Permanent compatibility expansion for source-separated seasonal Qimen V4.
-- Apply only with V4 readers/reservation/retry/producer already staged, before
-- mobile capability4 enrollment. Application rollback must retain those
-- readers and this domain; never demote existing registrations/history.
BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qimen_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_qimen_payload_schema_check
    CHECK (qimen_payload_schema IN (1,2,3,4));

COMMIT;
