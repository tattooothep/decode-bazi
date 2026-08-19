-- Explicit Zi Bai payload capability negotiation (19 Aug 2026).
-- Additive and rerunnable: existing/legacy installations fail safely to v1.
BEGIN;

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS zibai_payload_schema smallint;

UPDATE mobile_push_tokens
   SET zibai_payload_schema=1
 WHERE zibai_payload_schema IS NULL;

ALTER TABLE mobile_push_tokens
  ALTER COLUMN zibai_payload_schema SET DEFAULT 1,
  ALTER COLUMN zibai_payload_schema SET NOT NULL;

ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_zibai_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_zibai_payload_schema_check
  CHECK (zibai_payload_schema IN (1,2));

COMMIT;
