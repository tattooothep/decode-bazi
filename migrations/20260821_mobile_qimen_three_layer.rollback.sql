BEGIN;

-- Safety rollback disables new production while preserving immutable evidence
-- already shown to users. It intentionally drops no table or column.
UPDATE mobile_qimen_producer_state
   SET producer_enabled=false,enabled_at=NULL,enabled_by=NULL,updated_at=now()
 WHERE singleton=true;
UPDATE mobile_qimen_installations
   SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
       last_skip_reason='producer_rollback',updated_at=now();
UPDATE mobile_push_tokens SET qimen_payload_schema=1 WHERE qimen_payload_schema=2;
ALTER TABLE mobile_push_tokens ALTER COLUMN qimen_payload_schema SET DEFAULT 1;

COMMIT;
