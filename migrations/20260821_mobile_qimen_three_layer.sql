BEGIN;

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS qimen_payload_schema smallint;
UPDATE mobile_push_tokens SET qimen_payload_schema=1 WHERE qimen_payload_schema IS NULL;
ALTER TABLE mobile_push_tokens
  ALTER COLUMN qimen_payload_schema SET DEFAULT 1,
  ALTER COLUMN qimen_payload_schema SET NOT NULL;
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qimen_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_qimen_payload_schema_check
  CHECK (qimen_payload_schema IN (1,2));

CREATE TABLE IF NOT EXISTS mobile_qimen_producer_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton=true),
  producer_enabled boolean NOT NULL DEFAULT false,
  source_digest text NOT NULL,
  backend_commit text,
  enabled_at timestamptz,
  enabled_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_qimen_source_digest_shape CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mobile_qimen_enable_provenance CHECK (
    producer_enabled=false OR (backend_commit ~ '^[0-9a-f]{40}$' AND enabled_at IS NOT NULL AND btrim(enabled_by)<>'')
  )
);
INSERT INTO mobile_qimen_producer_state(singleton,producer_enabled,source_digest)
VALUES(true,false,'987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460')
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS mobile_qimen_installations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  purpose text NOT NULL DEFAULT 'travel' CHECK (purpose IN ('travel')),
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  location_permission text NOT NULL DEFAULT 'unknown'
    CHECK (location_permission IN ('unknown','foreground','background','denied')),
  latitude double precision,
  longitude double precision,
  location_timezone text,
  location_captured_at timestamptz,
  location_expires_at timestamptz,
  next_due_at timestamptz,
  owner_generation bigint NOT NULL DEFAULT 1 CHECK (owner_generation > 0),
  last_skip_reason text,
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,installation_id),
  CONSTRAINT mobile_qimen_location_all_or_none CHECK (
    (latitude IS NULL AND longitude IS NULL AND location_timezone IS NULL
      AND location_captured_at IS NULL AND location_expires_at IS NULL)
    OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND location_timezone IS NOT NULL AND btrim(location_timezone)<>''
      AND location_captured_at IS NOT NULL AND location_expires_at IS NOT NULL
      AND location_expires_at > location_captured_at
      AND location_expires_at <= location_captured_at + interval '7 days')
  ),
  CONSTRAINT mobile_qimen_enabled_location CHECK (
    enabled=false OR (location_permission IN ('foreground','background') AND location_expires_at IS NOT NULL)
  ),
  CONSTRAINT mobile_qimen_lease_shape CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_qimen_active_installation
  ON mobile_qimen_installations(installation_id);
CREATE INDEX IF NOT EXISTS ix_mobile_qimen_due
  ON mobile_qimen_installations(next_due_at,user_id,installation_id)
  WHERE enabled=true AND next_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_qimen_location_expiry
  ON mobile_qimen_installations(location_expires_at,user_id,installation_id)
  WHERE location_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_qimen_lease_expiry
  ON mobile_qimen_installations(lease_expires_at,user_id,installation_id)
  WHERE lease_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_qimen_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  occurrence_key text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('travel')),
  hour_valid_from timestamptz NOT NULL,
  hour_valid_until timestamptz NOT NULL,
  send_deadline timestamptz NOT NULL,
  selected_direction text CHECK (selected_direction IS NULL OR selected_direction IN ('N','NE','E','SE','S','SW','W','NW')),
  version_tuple jsonb NOT NULL,
  source_tuple jsonb NOT NULL,
  snapshot jsonb,
  snapshot_digest text,
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','reserved','skipped')),
  skip_reason text,
  push_log_id uuid REFERENCES mobile_push_log(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,installation_id)
    REFERENCES mobile_qimen_installations(user_id,installation_id) ON DELETE CASCADE,
  CONSTRAINT mobile_qimen_occurrence_window CHECK (
    hour_valid_from < hour_valid_until
    AND send_deadline > hour_valid_from
    AND send_deadline <= hour_valid_until
  ),
  CONSTRAINT mobile_qimen_tuple_shape CHECK (
    jsonb_typeof(version_tuple)='object' AND jsonb_typeof(source_tuple)='object'
  ),
  CONSTRAINT mobile_qimen_snapshot_shape CHECK (
    (snapshot IS NULL AND snapshot_digest IS NULL AND state='skipped')
    OR
    (jsonb_typeof(snapshot)='object' AND snapshot_digest ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT mobile_qimen_skip_shape CHECK (
    (state='skipped' AND skip_reason IS NOT NULL AND push_log_id IS NULL)
    OR (state IN ('claimed','reserved') AND skip_reason IS NULL AND selected_direction IS NOT NULL)
  ),
  UNIQUE(user_id,installation_id,occurrence_key)
);

CREATE INDEX IF NOT EXISTS ix_mobile_qimen_occurrence_retention
  ON mobile_qimen_occurrences(created_at,id);
CREATE INDEX IF NOT EXISTS ix_mobile_qimen_occurrence_window
  ON mobile_qimen_occurrences(user_id,installation_id,hour_valid_from,state);
CREATE INDEX IF NOT EXISTS ix_mobile_qimen_occurrence_push_log
  ON mobile_qimen_occurrences(push_log_id) WHERE push_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_mobile_qimen_occurrence_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.installation_id IS DISTINCT FROM NEW.installation_id
    OR OLD.occurrence_key IS DISTINCT FROM NEW.occurrence_key
    OR OLD.purpose IS DISTINCT FROM NEW.purpose
    OR OLD.hour_valid_from IS DISTINCT FROM NEW.hour_valid_from
    OR OLD.hour_valid_until IS DISTINCT FROM NEW.hour_valid_until
    OR OLD.send_deadline IS DISTINCT FROM NEW.send_deadline
    OR OLD.selected_direction IS DISTINCT FROM NEW.selected_direction
    OR OLD.version_tuple IS DISTINCT FROM NEW.version_tuple
    OR OLD.source_tuple IS DISTINCT FROM NEW.source_tuple
    OR OLD.snapshot IS DISTINCT FROM NEW.snapshot
    OR OLD.snapshot_digest IS DISTINCT FROM NEW.snapshot_digest
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'mobile_qimen_occurrence_immutable';
  END IF;
  IF OLD.state <> NEW.state AND NOT (OLD.state='claimed' AND NEW.state='reserved') THEN
    RAISE EXCEPTION 'mobile_qimen_occurrence_state_transition_invalid';
  END IF;
  IF OLD.push_log_id IS DISTINCT FROM NEW.push_log_id
    AND NOT (OLD.push_log_id IS NULL AND NEW.push_log_id IS NOT NULL AND NEW.state='reserved') THEN
    RAISE EXCEPTION 'mobile_qimen_occurrence_push_link_invalid';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mobile_qimen_occurrence_immutable ON mobile_qimen_occurrences;
CREATE TRIGGER mobile_qimen_occurrence_immutable
BEFORE UPDATE ON mobile_qimen_occurrences
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_qimen_occurrence_immutable();

-- Atomic indexed claim used by the dedicated per-minute scheduler. The
-- candidate SELECT deliberately uses FOR UPDATE SKIP LOCKED for safe workers.
CREATE OR REPLACE FUNCTION claim_mobile_qimen_installations(p_at timestamptz, p_limit integer)
RETURNS SETOF mobile_qimen_installations LANGUAGE sql AS $$
  WITH candidate AS (
    SELECT user_id,installation_id
      FROM mobile_qimen_installations
     WHERE enabled=true AND next_due_at IS NOT NULL AND next_due_at<=p_at
       AND (lease_token IS NULL OR lease_expires_at<=p_at)
     ORDER BY next_due_at,user_id,installation_id
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(p_limit,1),1000)
  )
  UPDATE mobile_qimen_installations q
     SET lease_token=gen_random_uuid(),lease_expires_at=p_at+interval '5 minutes',updated_at=p_at
    FROM candidate c
   WHERE q.user_id=c.user_id AND q.installation_id=c.installation_id
  RETURNING q.*;
$$;

GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_qimen_installations TO hourkey_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_qimen_occurrences TO hourkey_app;
GRANT SELECT,UPDATE ON mobile_qimen_producer_state TO hourkey_app;
GRANT EXECUTE ON FUNCTION claim_mobile_qimen_installations(timestamptz,integer) TO hourkey_app;

COMMIT;
