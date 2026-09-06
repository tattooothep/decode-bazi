-- DRAFT: apply only to a disposable test cluster until separately reviewed.
-- No producer activation, existing-table mutation or runtime-role grant.
-- Opaque chain UUIDs intentionally have NO FK to shadow chains/tokens: those
-- cascade-delete on transfer and must not erase accepted/uncertain tombstones.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';

CREATE TABLE IF NOT EXISTS mobile_astronomy_delivery_ledgers_r8 (
  chain_uuid uuid NOT NULL,
  notification_unit_id text COLLATE "C" NOT NULL
    CHECK (length(notification_unit_id) BETWEEN 1 AND 512 AND btrim(notification_unit_id)=notification_unit_id),
  lane text NOT NULL DEFAULT 'astronomy_fact:civil_two_hour:v1'
    CHECK (lane='astronomy_fact:civil_two_hour:v1'),
  initial_input jsonb NOT NULL CHECK (jsonb_typeof(initial_input)='object' AND octet_length(initial_input::text)<=8192),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  current_state jsonb NOT NULL CHECK (jsonb_typeof(current_state)='object' AND octet_length(current_state::text)<=262144),
  provider_dispatch_enabled boolean NOT NULL DEFAULT false CHECK (provider_dispatch_enabled=false),
  PRIMARY KEY (chain_uuid,notification_unit_id),
  CHECK ((current_state->>'chainId'=chain_uuid::text) IS TRUE),
  CHECK ((current_state->>'notificationUnitId'=notification_unit_id) IS TRUE),
  CHECK ((current_state->>'lane'=lane) IS TRUE)
);

CREATE TABLE IF NOT EXISTS mobile_astronomy_delivery_events_r8 (
  chain_uuid uuid NOT NULL,
  notification_unit_id text COLLATE "C" NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  event_id uuid NOT NULL UNIQUE,
  event_json jsonb NOT NULL CHECK (jsonb_typeof(event_json)='object' AND octet_length(event_json::text)<=8192),
  event_digest text NOT NULL CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  state_before jsonb NOT NULL CHECK (jsonb_typeof(state_before)='object' AND octet_length(state_before::text)<=262144),
  state_after jsonb NOT NULL CHECK (jsonb_typeof(state_after)='object' AND octet_length(state_after::text)<=262144),
  state_digest text NOT NULL CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (chain_uuid,notification_unit_id,revision),
  FOREIGN KEY (chain_uuid,notification_unit_id)
    REFERENCES mobile_astronomy_delivery_ledgers_r8(chain_uuid,notification_unit_id)
);

CREATE OR REPLACE FUNCTION hourkey_r8_delivery_event_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'r8_delivery_event_immutable' USING ERRCODE='23514';
END;
$$;
DROP TRIGGER IF EXISTS hourkey_r8_delivery_event_immutable ON mobile_astronomy_delivery_events_r8;
CREATE TRIGGER hourkey_r8_delivery_event_immutable BEFORE UPDATE OR DELETE
ON mobile_astronomy_delivery_events_r8 FOR EACH ROW EXECUTE FUNCTION hourkey_r8_delivery_event_immutable();

CREATE OR REPLACE FUNCTION hourkey_r8_delivery_checkpoint_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'r8_delivery_ledger_immutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.chain_uuid,NEW.notification_unit_id,NEW.lane,NEW.initial_input,NEW.provider_dispatch_enabled)
    IS DISTINCT FROM ROW(OLD.chain_uuid,OLD.notification_unit_id,OLD.lane,OLD.initial_input,OLD.provider_dispatch_enabled)
    OR NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'r8_delivery_revision_or_identity_immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mobile_astronomy_delivery_events_r8 e
    WHERE e.chain_uuid=NEW.chain_uuid AND e.notification_unit_id=NEW.notification_unit_id
      AND e.revision=NEW.revision AND e.state_before=OLD.current_state AND e.state_after=NEW.current_state
  ) THEN
    RAISE EXCEPTION 'r8_delivery_checkpoint_event_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hourkey_r8_delivery_checkpoint_guard ON mobile_astronomy_delivery_ledgers_r8;
CREATE TRIGGER hourkey_r8_delivery_checkpoint_guard BEFORE UPDATE OR DELETE
ON mobile_astronomy_delivery_ledgers_r8 FOR EACH ROW EXECUTE FUNCTION hourkey_r8_delivery_checkpoint_guard();

-- An event INSERT cannot commit without the corresponding checkpoint update.
CREATE OR REPLACE FUNCTION hourkey_r8_delivery_event_checkpoint_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mobile_astronomy_delivery_ledgers_r8 l
    WHERE l.chain_uuid=NEW.chain_uuid AND l.notification_unit_id=NEW.notification_unit_id
      AND l.revision>=NEW.revision
  ) THEN
    RAISE EXCEPTION 'r8_delivery_event_checkpoint_missing' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hourkey_r8_delivery_event_checkpoint_guard ON mobile_astronomy_delivery_events_r8;
CREATE CONSTRAINT TRIGGER hourkey_r8_delivery_event_checkpoint_guard
AFTER INSERT ON mobile_astronomy_delivery_events_r8 DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION hourkey_r8_delivery_event_checkpoint_guard();

REVOKE ALL ON mobile_astronomy_delivery_ledgers_r8,mobile_astronomy_delivery_events_r8 FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
    REVOKE ALL ON mobile_astronomy_delivery_ledgers_r8,mobile_astronomy_delivery_events_r8 FROM hourkey_app;
  END IF;
END $$;
COMMIT;
