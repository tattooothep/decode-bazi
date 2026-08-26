-- Separate hourly science notification foundations. Additive and rerunnable.
-- Ziwei can progress behind a default-off producer. Qizheng remains impossible
-- to enable until a later evidence migration replaces the hard constraint.
BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_tz varchar(64),
  ADD COLUMN IF NOT EXISTS birth_tz_source varchar(32);

CREATE OR REPLACE FUNCTION hourkey_birth_timezone_valid(value text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  matched text[];
BEGIN
  IF value IS NULL OR btrim(value)<>value OR value='' OR length(value)>64 THEN RETURN false; END IF;
  matched := regexp_match(value,'^([+-])(\d{2}):(\d{2})$');
  IF matched IS NOT NULL THEN
    RETURN matched[3]::integer<=59 AND (
      matched[2]::integer<14 OR (matched[2]::integer=14 AND matched[3]::integer=0)
    );
  END IF;
  RETURN EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE lower(name)=lower(value));
END;
$$;

-- Profiles persist the reported natal wall clock by anchoring it at +07:00;
-- birth_tz carries its actual IANA/fixed-offset interpretation. Ziwei hourly
-- supports only one real natal instant and excludes the unimplemented late-Zi
-- and out-of-range natal domains.
CREATE OR REPLACE FUNCTION hourkey_ziwei_birth_wall_eligible(value timestamptz, timezone_value text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  wall timestamp;
  naive timestamptz;
  zone_name text;
  matches integer;
BEGIN
  IF value IS NULL OR NOT hourkey_birth_timezone_valid(timezone_value)
    OR (timezone_value !~ '^([+-])(\d{2}):(\d{2})$'
      AND timezone_value<>'UTC' AND position('/' IN timezone_value)=0) THEN RETURN false; END IF;
  wall := value AT TIME ZONE 'Asia/Bangkok';
  IF wall::date < DATE '1900-01-31' OR wall::date > DATE '2100-12-31'
    OR extract(hour FROM wall)=23 THEN RETURN false; END IF;
  IF timezone_value ~ '^([+-])(\d{2}):(\d{2})$' THEN RETURN true; END IF;

  SELECT name INTO zone_name FROM pg_catalog.pg_timezone_names
   WHERE lower(name)=lower(timezone_value) ORDER BY name LIMIT 1;
  IF zone_name IS NULL THEN RETURN false; END IF;
  naive := wall AT TIME ZONE 'UTC';
  WITH offsets AS (
    -- Mirror the JS/Intl resolver's minute-precision offset candidates. Zones
    -- with historical sub-minute offsets therefore fail closed in every tier
    -- instead of SQL admitting a wall clock the app/backend cannot reproduce.
    SELECT DISTINCT round(extract(epoch FROM (
      (probe AT TIME ZONE zone_name) - (probe AT TIME ZONE 'UTC')
    ))/60)::bigint * interval '1 minute' AS value
      FROM generate_series(naive-interval '36 hours',naive+interval '36 hours',interval '12 hours') probe
  ), candidates AS (
    SELECT naive-offsets.value AS instant FROM offsets
  )
  SELECT count(DISTINCT instant)::integer INTO matches FROM candidates
   WHERE instant AT TIME ZONE zone_name = wall;
  RETURN matches=1;
END;
$$;

ALTER TABLE mobile_notification_prefs
  ADD COLUMN IF NOT EXISTS ziwei_hourly_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ziwei_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qizheng_electional_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE mobile_notification_prefs
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_qizheng_electional_disabled;
ALTER TABLE mobile_notification_prefs
  ADD CONSTRAINT mobile_notification_prefs_qizheng_electional_disabled
  CHECK (qizheng_electional_enabled=false);

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS ziwei_payload_schema smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qizheng_payload_schema smallint NOT NULL DEFAULT 0;
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_ziwei_payload_schema_check,
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qizheng_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_ziwei_payload_schema_check
    CHECK (ziwei_payload_schema IN (0,1,2)),
  ADD CONSTRAINT mobile_push_tokens_qizheng_payload_schema_check
    CHECK (qizheng_payload_schema=0);

CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_producer_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton=true),
  producer_enabled boolean NOT NULL DEFAULT false,
  source_digest text NOT NULL,
  backend_commit text,
  enabled_at timestamptz,
  enabled_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_ziwei_hourly_source_digest_shape CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mobile_ziwei_hourly_enable_provenance CHECK (
    producer_enabled=false OR (
      backend_commit IS NOT NULL AND backend_commit ~ '^[0-9a-f]{40}$'
      AND enabled_at IS NOT NULL AND enabled_by IS NOT NULL AND btrim(enabled_by)<>''
    )
  )
);
INSERT INTO mobile_ziwei_hourly_producer_state(singleton,producer_enabled,source_digest)
VALUES(true,false,'b311fc6a4ff531c7b97ac80ae9d586c95008b929151b2b5115aabd0b49486b0a')
ON CONFLICT(singleton) DO UPDATE
  SET source_digest=EXCLUDED.source_digest,updated_at=now()
  WHERE mobile_ziwei_hourly_producer_state.producer_enabled=false;
UPDATE mobile_ziwei_hourly_producer_state
   SET producer_enabled=false,backend_commit=NULL,enabled_at=NULL,enabled_by=NULL,updated_at=now()
 WHERE producer_enabled=true AND (
   backend_commit IS NULL OR backend_commit !~ '^[0-9a-f]{40}$'
   OR enabled_at IS NULL OR enabled_by IS NULL OR btrim(enabled_by)=''
 );
ALTER TABLE mobile_ziwei_hourly_producer_state
  DROP CONSTRAINT IF EXISTS mobile_ziwei_hourly_enable_provenance;
ALTER TABLE mobile_ziwei_hourly_producer_state
  ADD CONSTRAINT mobile_ziwei_hourly_enable_provenance CHECK (
    producer_enabled=false OR (
      backend_commit IS NOT NULL AND backend_commit ~ '^[0-9a-f]{40}$'
      AND enabled_at IS NOT NULL AND enabled_by IS NOT NULL AND btrim(enabled_by)<>''
    )
  );

-- The provider worker holds the shared side of this gate from its final policy
-- read until the provider result is durable. Every owner/admin mutation takes
-- the exclusive transaction side automatically, including direct SQL, so a
-- disable cannot commit while an admitted Ziwei provider call is in flight.
CREATE OR REPLACE FUNCTION serialize_mobile_ziwei_hourly_producer_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('mobile-ziwei-hourly-producer-gate:v1',0)
  );
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS mobile_ziwei_hourly_producer_mutation_gate
  ON mobile_ziwei_hourly_producer_state;
CREATE TRIGGER mobile_ziwei_hourly_producer_mutation_gate
BEFORE INSERT OR UPDATE OR DELETE ON mobile_ziwei_hourly_producer_state
FOR EACH ROW EXECUTE FUNCTION serialize_mobile_ziwei_hourly_producer_mutation();

CREATE TABLE IF NOT EXISTS mobile_qizheng_electional_producer_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton=true),
  producer_enabled boolean NOT NULL DEFAULT false,
  evidence_status text NOT NULL DEFAULT 'incomplete' CHECK (evidence_status IN ('incomplete','complete')),
  source_evidence_version text NOT NULL,
  source_digest text NOT NULL,
  backend_commit text,
  enabled_at timestamptz,
  enabled_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_qizheng_electional_source_digest_shape CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mobile_qizheng_electional_producer_disabled CHECK (producer_enabled=false),
  CONSTRAINT mobile_qizheng_electional_enable_provenance CHECK (
    producer_enabled=false OR (
      backend_commit IS NOT NULL AND backend_commit ~ '^[0-9a-f]{40}$'
      AND enabled_at IS NOT NULL AND enabled_by IS NOT NULL AND btrim(enabled_by)<>''
    )
  )
);
UPDATE mobile_qizheng_electional_producer_state
   SET producer_enabled=false,updated_at=now()
 WHERE producer_enabled=true;
ALTER TABLE mobile_qizheng_electional_producer_state
  DROP CONSTRAINT IF EXISTS mobile_qizheng_electional_enable_gate,
  DROP CONSTRAINT IF EXISTS mobile_qizheng_electional_producer_disabled,
  DROP CONSTRAINT IF EXISTS mobile_qizheng_electional_enable_provenance;
ALTER TABLE mobile_qizheng_electional_producer_state
  ADD CONSTRAINT mobile_qizheng_electional_producer_disabled CHECK (producer_enabled=false),
  ADD CONSTRAINT mobile_qizheng_electional_enable_provenance CHECK (
    producer_enabled=false OR (
      backend_commit IS NOT NULL AND backend_commit ~ '^[0-9a-f]{40}$'
      AND enabled_at IS NOT NULL AND enabled_by IS NOT NULL AND btrim(enabled_by)<>''
    )
  );
INSERT INTO mobile_qizheng_electional_producer_state
  (singleton,producer_enabled,evidence_status,source_evidence_version,source_digest)
VALUES(
  true,false,'incomplete','yangzhai-dacheng-xuanshi-xiufang-v7-v16-artifacts-v4',
  'af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2'
)
ON CONFLICT(singleton) DO UPDATE
  SET source_evidence_version=EXCLUDED.source_evidence_version,
      source_digest=EXCLUDED.source_digest,updated_at=now()
  WHERE mobile_qizheng_electional_producer_state.producer_enabled=false;

CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_installations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  reference_timezone text NOT NULL,
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  next_due_at timestamptz,
  owner_generation bigint NOT NULL DEFAULT 1 CHECK (owner_generation > 0),
  last_skip_reason text,
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,installation_id),
  CONSTRAINT mobile_ziwei_hourly_timezone_shape CHECK (btrim(reference_timezone)<>'' AND length(reference_timezone)<=80),
  CONSTRAINT mobile_ziwei_hourly_enabled_due CHECK (enabled=false OR next_due_at IS NOT NULL),
  CONSTRAINT mobile_ziwei_hourly_lease_shape CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_ziwei_hourly_active_installation
  ON mobile_ziwei_hourly_installations(installation_id) WHERE enabled=true;
CREATE INDEX IF NOT EXISTS ix_mobile_ziwei_hourly_due
  ON mobile_ziwei_hourly_installations(next_due_at,user_id,installation_id)
  WHERE enabled=true AND next_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_ziwei_hourly_lease
  ON mobile_ziwei_hourly_installations(lease_expires_at)
  WHERE lease_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_ziwei_hourly_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  owner_generation bigint NOT NULL CHECK (owner_generation > 0),
  occurrence_key text NOT NULL,
  lineage text NOT NULL,
  calculation_version text NOT NULL,
  window_valid_from timestamptz NOT NULL,
  window_valid_until timestamptz NOT NULL,
  send_deadline timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','reserved','skipped')),
  skip_reason text,
  push_log_id uuid REFERENCES mobile_push_log(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,installation_id)
    REFERENCES mobile_ziwei_hourly_installations(user_id,installation_id) ON DELETE CASCADE,
  CONSTRAINT mobile_ziwei_hourly_occurrence_window CHECK (
    window_valid_from < window_valid_until
    AND send_deadline > window_valid_from
    AND send_deadline <= window_valid_until
  ),
  CONSTRAINT mobile_ziwei_hourly_snapshot_shape CHECK (jsonb_typeof(snapshot)='object'),
  CONSTRAINT mobile_ziwei_hourly_skip_shape CHECK (
    (state='skipped' AND skip_reason IS NOT NULL AND push_log_id IS NULL)
    OR (state IN ('claimed','reserved') AND skip_reason IS NULL)
  ),
  UNIQUE(user_id,installation_id,occurrence_key),
  UNIQUE(user_id,installation_id,profile_id,owner_generation,window_valid_from)
);
ALTER TABLE mobile_ziwei_hourly_occurrences
  ADD COLUMN IF NOT EXISTS owner_generation bigint;
UPDATE mobile_ziwei_hourly_occurrences o
   SET owner_generation=i.owner_generation
  FROM mobile_ziwei_hourly_installations i
 WHERE o.owner_generation IS NULL AND i.user_id=o.user_id AND i.installation_id=o.installation_id;
UPDATE mobile_ziwei_hourly_occurrences SET owner_generation=1 WHERE owner_generation IS NULL;
ALTER TABLE mobile_ziwei_hourly_occurrences
  ALTER COLUMN owner_generation SET NOT NULL,
  DROP CONSTRAINT IF EXISTS mobile_ziwei_hourly_occurrence_owner_generation_check;
ALTER TABLE mobile_ziwei_hourly_occurrences
  ADD CONSTRAINT mobile_ziwei_hourly_occurrence_owner_generation_check CHECK (owner_generation>0);
CREATE INDEX IF NOT EXISTS ix_mobile_ziwei_hourly_occurrence_retention
  ON mobile_ziwei_hourly_occurrences(created_at,id);
CREATE INDEX IF NOT EXISTS ix_mobile_ziwei_hourly_occurrence_push
  ON mobile_ziwei_hourly_occurrences(push_log_id) WHERE push_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_mobile_ziwei_hourly_occurrence_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.installation_id IS DISTINCT FROM NEW.installation_id
    OR OLD.profile_id IS DISTINCT FROM NEW.profile_id
    OR OLD.owner_generation IS DISTINCT FROM NEW.owner_generation
    OR OLD.occurrence_key IS DISTINCT FROM NEW.occurrence_key
    OR OLD.lineage IS DISTINCT FROM NEW.lineage
    OR OLD.calculation_version IS DISTINCT FROM NEW.calculation_version
    OR OLD.window_valid_from IS DISTINCT FROM NEW.window_valid_from
    OR OLD.window_valid_until IS DISTINCT FROM NEW.window_valid_until
    OR OLD.send_deadline IS DISTINCT FROM NEW.send_deadline
    OR OLD.snapshot IS DISTINCT FROM NEW.snapshot
    OR OLD.snapshot_digest IS DISTINCT FROM NEW.snapshot_digest
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'mobile_ziwei_hourly_occurrence_immutable';
  END IF;
  IF OLD.state <> NEW.state AND NOT (OLD.state='claimed' AND NEW.state IN ('reserved','skipped')) THEN
    RAISE EXCEPTION 'mobile_ziwei_hourly_occurrence_state_transition_invalid';
  END IF;
  IF OLD.push_log_id IS DISTINCT FROM NEW.push_log_id
    AND NOT (OLD.push_log_id IS NULL AND NEW.push_log_id IS NOT NULL AND NEW.state='reserved') THEN
    RAISE EXCEPTION 'mobile_ziwei_hourly_occurrence_push_link_invalid';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mobile_ziwei_hourly_occurrence_immutable ON mobile_ziwei_hourly_occurrences;
CREATE TRIGGER mobile_ziwei_hourly_occurrence_immutable
BEFORE UPDATE ON mobile_ziwei_hourly_occurrences
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_ziwei_hourly_occurrence_immutable();

-- Generic notification DML remains available to the runtime role, therefore
-- Ziwei's parent attestation and attempt state machine need their own database
-- boundary. A row cannot be relabelled into/out of Ziwei, provenance cannot be
-- rewritten while delivery is live, and terminal attempts cannot be reopened.
CREATE OR REPLACE FUNCTION enforce_mobile_ziwei_push_parent_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  terminal_redaction boolean;
  no_open_attempt boolean;
  owner_exists boolean;
  attempts_retirable boolean;
  zero_attempt_terminal boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.kind<>'ziwei' THEN RETURN OLD; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.users WHERE id=$1)',TG_TABLE_SCHEMA)
      INTO owner_exists USING OLD.user_id;
    zero_attempt_terminal := OLD.delivery_model_generation=1
      AND OLD.delivery_status='failed'
      AND OLD.last_error='no_deliverable_installation'
      AND OLD.attempt_count=0
      AND OLD.next_retry_at IS NULL
      AND OLD.accepted_at IS NULL
      AND OLD.sent_at IS NULL
      AND COALESCE(OLD.sent_at,OLD.accepted_at,OLD.updated_at)<now()-interval '180 days';
    IF zero_attempt_terminal THEN
      EXECUTE format(
        'SELECT NOT EXISTS (SELECT 1 FROM %1$I.mobile_push_attempts WHERE push_log_id=$1)
            AND NOT EXISTS (SELECT 1 FROM %1$I.mobile_ziwei_hourly_occurrences WHERE push_log_id=$1)',
        TG_TABLE_SCHEMA
      ) INTO zero_attempt_terminal USING OLD.id;
    END IF;
    IF OLD.attempts_retired_at IS NULL AND owner_exists
      AND NOT COALESCE(zero_attempt_terminal,false) THEN
      RAISE EXCEPTION 'mobile_ziwei_push_parent_delete_unretired';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.kind<>'ziwei' AND NEW.kind<>'ziwei' THEN RETURN NEW; END IF;
  IF OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.yam_key IS DISTINCT FROM NEW.yam_key
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.body IS DISTINCT FROM NEW.body
    OR OLD.payload IS DISTINCT FROM NEW.payload THEN
    RAISE EXCEPTION 'mobile_ziwei_push_parent_immutable';
  END IF;
  IF NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'mobile_ziwei_push_parent_time_regression';
  END IF;
  IF OLD.attempts_retired_at IS DISTINCT FROM NEW.attempts_retired_at THEN
    EXECUTE format(
      'SELECT count(*)>0 AND bool_and(
         created_at<now()-interval ''90 days''
         AND updated_at<now()-interval ''90 days''
         AND status NOT IN (''reserved'',''retry_due'')
         AND lease_token IS NULL AND lease_expires_at IS NULL
       ) FROM %I.mobile_push_attempts WHERE push_log_id=$1',
      TG_TABLE_SCHEMA
    ) INTO attempts_retirable USING OLD.id;
    IF OLD.attempts_retired_at IS NOT NULL OR NEW.attempts_retired_at IS NULL
      OR NOT COALESCE(attempts_retirable,false) THEN
      RAISE EXCEPTION 'mobile_ziwei_push_parent_retirement_invalid';
    END IF;
  END IF;
  EXECUTE format(
    'SELECT NOT EXISTS (SELECT 1 FROM %I.mobile_push_attempts WHERE push_log_id=$1 AND status IN (''reserved'',''retry_due''))',
    TG_TABLE_SCHEMA
  ) INTO no_open_attempt USING OLD.id;
  terminal_redaction := OLD.source_facts IS DISTINCT FROM NEW.source_facts
    AND NEW.source_facts='{}'::jsonb
    AND OLD.delivery_status IN ('accepted','delivered','failed')
    AND NEW.delivery_status IN ('accepted','delivered','failed')
    AND no_open_attempt;
  IF OLD.source_facts IS DISTINCT FROM NEW.source_facts AND NOT terminal_redaction THEN
    RAISE EXCEPTION 'mobile_ziwei_push_parent_source_facts_immutable';
  END IF;
  IF OLD.delivery_status IN ('delivered','failed')
    AND OLD.delivery_status IS DISTINCT FROM NEW.delivery_status THEN
    RAISE EXCEPTION 'mobile_ziwei_push_parent_terminal';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mobile_ziwei_push_parent_integrity ON mobile_push_log;
CREATE TRIGGER mobile_ziwei_push_parent_integrity
BEFORE UPDATE OR DELETE ON mobile_push_log
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_ziwei_push_parent_integrity();

CREATE OR REPLACE FUNCTION enforce_mobile_ziwei_push_attempt_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_parent_kind text;
  new_parent_kind text;
  parent_retired_at timestamptz;
  occurrence_ready boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    EXECUTE format('SELECT kind,attempts_retired_at FROM %I.mobile_push_log WHERE id=$1',TG_TABLE_SCHEMA)
      INTO new_parent_kind,parent_retired_at USING NEW.push_log_id;
    IF new_parent_kind<>'ziwei' THEN RETURN NEW; END IF;
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1 FROM %1$I.mobile_push_log l
         JOIN %1$I.mobile_ziwei_hourly_occurrences o
           ON o.user_id=l.user_id AND o.occurrence_key=l.yam_key
        WHERE l.id=$1 AND o.installation_id=$2
          AND o.state=''claimed'' AND o.push_log_id IS NULL
       )',
      TG_TABLE_SCHEMA
    ) INTO occurrence_ready USING NEW.push_log_id,NEW.installation_id;
    IF parent_retired_at IS NOT NULL OR NOT occurrence_ready THEN
      RAISE EXCEPTION 'mobile_ziwei_push_attempt_insert_unowned';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    EXECUTE format('SELECT kind,attempts_retired_at FROM %I.mobile_push_log WHERE id=$1',TG_TABLE_SCHEMA)
      INTO old_parent_kind,parent_retired_at USING OLD.push_log_id;
    IF old_parent_kind='ziwei' AND parent_retired_at IS NULL THEN
      RAISE EXCEPTION 'mobile_ziwei_push_attempt_delete_unretired';
    END IF;
    RETURN OLD;
  END IF;
  EXECUTE format('SELECT kind FROM %I.mobile_push_log WHERE id=$1',TG_TABLE_SCHEMA)
    INTO old_parent_kind USING OLD.push_log_id;
  EXECUTE format('SELECT kind FROM %I.mobile_push_log WHERE id=$1',TG_TABLE_SCHEMA)
    INTO new_parent_kind USING NEW.push_log_id;
  IF old_parent_kind<>'ziwei' AND new_parent_kind<>'ziwei' THEN RETURN NEW; END IF;
  IF OLD.push_log_id IS DISTINCT FROM NEW.push_log_id
    OR OLD.installation_id IS DISTINCT FROM NEW.installation_id
    OR OLD.provider IS DISTINCT FROM NEW.provider
    OR OLD.provider_message IS DISTINCT FROM NEW.provider_message
    OR OLD.message_sha256 IS DISTINCT FROM NEW.message_sha256
    OR OLD.privacy_safe IS DISTINCT FROM NEW.privacy_safe
    OR OLD.transactional IS DISTINCT FROM NEW.transactional
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_immutable';
  END IF;
  IF OLD.status IN ('dead','delivered') AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_terminal';
  END IF;
  IF OLD.status='provider_accepted' AND NEW.status IN ('reserved','retry_due') THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_resurrection';
  END IF;
  IF NEW.send_count<OLD.send_count THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_send_count_regression';
  END IF;
  IF NEW.updated_at<OLD.updated_at THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_time_regression';
  END IF;
  IF OLD.send_started_at IS NOT NULL AND NEW.send_started_at IS NULL
    AND NOT (OLD.status IN ('reserved','retry_due') AND NEW.status='retry_due') THEN
    RAISE EXCEPTION 'mobile_ziwei_push_attempt_send_boundary_regression';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mobile_ziwei_push_attempt_integrity ON mobile_push_attempts;
CREATE TRIGGER mobile_ziwei_push_attempt_integrity
BEFORE INSERT OR UPDATE OR DELETE ON mobile_push_attempts
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_ziwei_push_attempt_integrity();

-- One eligibility lifecycle for every profile mutation path (mobile, web,
-- admin or future imports). Ineligible facts atomically turn consent and all
-- installations off; changed-but-still-eligible facts fence any old claim and
-- schedule a fresh immutable snapshot without rewriting occurrence history.
CREATE OR REPLACE FUNCTION hourkey_reconcile_ziwei_hourly_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  eligible boolean;
  old_owner uuid;
  new_owner uuid;
BEGIN
  old_owner := CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.created_by_user_id END;
  new_owner := CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.created_by_user_id END;
  IF old_owner IS NOT NULL AND new_owner IS NOT NULL AND old_owner<>new_owner THEN
    IF old_owner::text<new_owner::text THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||old_owner::text,0));
      PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||new_owner::text,0));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||new_owner::text,0));
      PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||old_owner::text,0));
    END IF;
  ELSIF COALESCE(old_owner,new_owner) IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||COALESCE(old_owner,new_owner)::text,0));
  END IF;

  IF TG_OP='UPDATE'
    AND NEW.birth_datetime IS NOT DISTINCT FROM OLD.birth_datetime
    AND NEW.birth_time_known IS NOT DISTINCT FROM OLD.birth_time_known
    AND NEW.birth_tz IS NOT DISTINCT FROM OLD.birth_tz
    AND NEW.gender IS NOT DISTINCT FROM OLD.gender
    AND NEW.relationship_type IS NOT DISTINCT FROM OLD.relationship_type
    AND NEW.is_archived IS NOT DISTINCT FROM OLD.is_archived
    AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP='DELETE' OR old_owner IS DISTINCT FROM new_owner THEN
    UPDATE mobile_notification_prefs
       SET ziwei_hourly_enabled=false,updated_at=now()
     WHERE user_id=old_owner AND ziwei_profile_id=OLD.id AND ziwei_hourly_enabled=true;
    UPDATE mobile_ziwei_hourly_installations
       SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
           last_skip_reason='profile_ineligible',owner_generation=owner_generation+1,updated_at=now()
     WHERE user_id=old_owner AND profile_id=OLD.id
       AND (enabled=true OR lease_token IS NOT NULL OR next_due_at IS NOT NULL);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;

  eligible := COALESCE(NEW.is_archived,false)=false
    AND NEW.birth_datetime IS NOT NULL
    AND NEW.birth_time_known=true
    AND hourkey_birth_timezone_valid(NEW.birth_tz)
    AND hourkey_ziwei_birth_wall_eligible(NEW.birth_datetime,NEW.birth_tz)
    AND NEW.gender IN ('M','F')
    AND (NEW.relationship_type IS NULL OR btrim(NEW.relationship_type)='');

  IF NOT COALESCE(eligible,false) THEN
    UPDATE mobile_notification_prefs
       SET ziwei_hourly_enabled=false,updated_at=now()
     WHERE user_id=NEW.created_by_user_id AND ziwei_profile_id=NEW.id
       AND ziwei_hourly_enabled=true;
    UPDATE mobile_ziwei_hourly_installations
       SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
           last_skip_reason='profile_ineligible',owner_generation=owner_generation+1,updated_at=now()
     WHERE user_id=NEW.created_by_user_id AND profile_id=NEW.id
       AND (enabled=true OR lease_token IS NOT NULL OR next_due_at IS NOT NULL);
  ELSIF TG_OP='UPDATE' THEN
    UPDATE mobile_ziwei_hourly_installations
       SET next_due_at=now(),lease_token=NULL,lease_expires_at=NULL,
           last_skip_reason='profile_changed',owner_generation=owner_generation+1,updated_at=now()
     WHERE user_id=NEW.created_by_user_id AND profile_id=NEW.id AND enabled=true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hourkey_reconcile_ziwei_hourly_profile ON profiles;
CREATE TRIGGER hourkey_reconcile_ziwei_hourly_profile
BEFORE INSERT OR UPDATE OF birth_datetime,birth_time_known,birth_tz,gender,relationship_type,is_archived,created_by_user_id OR DELETE
ON profiles FOR EACH ROW EXECUTE FUNCTION hourkey_reconcile_ziwei_hourly_profile();

-- Heal legacy/imported stale ON states once when installing the lifecycle gate.
UPDATE mobile_notification_prefs np
   SET ziwei_hourly_enabled=false,updated_at=now()
 WHERE np.ziwei_hourly_enabled=true AND (
   np.ziwei_profile_id IS NULL OR NOT EXISTS(
     SELECT 1 FROM profiles p WHERE p.id=np.ziwei_profile_id AND p.created_by_user_id=np.user_id
       AND COALESCE(p.is_archived,false)=false AND p.birth_datetime IS NOT NULL
       AND p.birth_time_known=true AND hourkey_birth_timezone_valid(p.birth_tz)
       AND hourkey_ziwei_birth_wall_eligible(p.birth_datetime,p.birth_tz)
       AND p.gender IN ('M','F')
       AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
   )
 );
UPDATE mobile_ziwei_hourly_installations i
   SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
       last_skip_reason='profile_ineligible',owner_generation=owner_generation+1,updated_at=now()
 WHERE (i.enabled=true OR i.lease_token IS NOT NULL OR i.next_due_at IS NOT NULL)
   AND NOT EXISTS(
     SELECT 1 FROM mobile_notification_prefs np JOIN profiles p ON p.id=np.ziwei_profile_id
      WHERE np.user_id=i.user_id AND np.ziwei_hourly_enabled=true AND p.id=i.profile_id
        AND p.created_by_user_id=i.user_id AND COALESCE(p.is_archived,false)=false
        AND p.birth_datetime IS NOT NULL AND p.birth_time_known=true
        AND hourkey_birth_timezone_valid(p.birth_tz) AND p.gender IN ('M','F')
        AND hourkey_ziwei_birth_wall_eligible(p.birth_datetime,p.birth_tz)
        AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
   );

CREATE OR REPLACE FUNCTION claim_mobile_ziwei_hourly_installations(p_at timestamptz, p_limit integer)
RETURNS SETOF mobile_ziwei_hourly_installations LANGUAGE sql AS $$
  WITH candidate AS (
    SELECT user_id,installation_id
      FROM mobile_ziwei_hourly_installations
     WHERE enabled=true AND next_due_at IS NOT NULL AND next_due_at<=p_at
       AND (lease_token IS NULL OR lease_expires_at<=p_at)
     ORDER BY next_due_at,user_id,installation_id
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(p_limit,1),10000)
  )
  UPDATE mobile_ziwei_hourly_installations z
     SET lease_token=gen_random_uuid(),lease_expires_at=p_at+interval '5 minutes',updated_at=p_at
    FROM candidate c
   WHERE z.user_id=c.user_id AND z.installation_id=c.installation_id
  RETURNING z.*;
$$;

REVOKE DELETE ON TABLE mobile_ziwei_hourly_installations FROM PUBLIC,hourkey_app;
REVOKE DELETE ON TABLE users, profiles FROM hourkey_app;
GRANT SELECT,INSERT,UPDATE ON mobile_ziwei_hourly_installations TO hourkey_app;
GRANT SELECT,INSERT,UPDATE ON mobile_ziwei_hourly_occurrences TO hourkey_app;
REVOKE UPDATE ON mobile_ziwei_hourly_producer_state FROM hourkey_app;
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON mobile_ziwei_hourly_producer_state FROM hourkey_app;
GRANT SELECT ON mobile_ziwei_hourly_producer_state TO hourkey_app;
GRANT SELECT ON mobile_qizheng_electional_producer_state TO hourkey_app;
REVOKE ALL ON FUNCTION claim_mobile_ziwei_hourly_installations(timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_mobile_ziwei_hourly_installations(timestamptz,integer) TO hourkey_app;

COMMIT;
