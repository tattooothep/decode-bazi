-- Permanent compatibility expansion for the opt-in, lossless Ziwei V3 wire.
-- Deploy with schema-3-capable readers before any schema-3 mobile enrollment.
-- Application rollback must keep this expanded domain so existing registrations
-- and their immutable delivery history remain readable and eligible.
BEGIN;

SET LOCAL lock_timeout = '55s';

ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_ziwei_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_ziwei_payload_schema_check
    CHECK (ziwei_payload_schema IN (0,1,2,3));

COMMIT;
