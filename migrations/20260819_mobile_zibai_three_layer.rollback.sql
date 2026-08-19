-- Schema-only rollback. Token ownership/registration rows remain intact.
BEGIN;
ALTER TABLE mobile_push_tokens
  DROP COLUMN IF EXISTS zibai_payload_schema;
COMMIT;
