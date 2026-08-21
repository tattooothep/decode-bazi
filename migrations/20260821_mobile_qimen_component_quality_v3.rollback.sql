BEGIN;

UPDATE mobile_push_tokens SET qimen_payload_schema=2 WHERE qimen_payload_schema=3;
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qimen_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_qimen_payload_schema_check
  CHECK (qimen_payload_schema IN (1,2));

COMMIT;
