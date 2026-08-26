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
    producer_enabled=false OR (backend_commit ~ '^[0-9a-f]{40}$' AND enabled_at IS NOT NULL AND btrim(enabled_by)<>'')
  )
);
INSERT INTO mobile_ziwei_hourly_producer_state(singleton,producer_enabled,source_digest)
VALUES(true,false,'a8bb96398b2b673d72fcfd2bfb71d10326e26849fc1ddc3ea3bff2ab27661e6c')
ON CONFLICT(singleton) DO UPDATE
  SET source_digest=EXCLUDED.source_digest,updated_at=now()
  WHERE mobile_ziwei_hourly_producer_state.producer_enabled=false;

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
    producer_enabled=false OR (backend_commit ~ '^[0-9a-f]{40}$' AND enabled_at IS NOT NULL AND btrim(enabled_by)<>'')
  )
);
UPDATE mobile_qizheng_electional_producer_state
   SET producer_enabled=false,updated_at=now()
 WHERE producer_enabled=true;
ALTER TABLE mobile_qizheng_electional_producer_state
  DROP CONSTRAINT IF EXISTS mobile_qizheng_electional_enable_gate,
  DROP CONSTRAINT IF EXISTS mobile_qizheng_electional_producer_disabled;
ALTER TABLE mobile_qizheng_electional_producer_state
  ADD CONSTRAINT mobile_qizheng_electional_producer_disabled CHECK (producer_enabled=false);
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
  ON mobile_ziwei_hourly_installations(installation_id);
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

GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_ziwei_hourly_installations TO hourkey_app;
GRANT SELECT,INSERT,UPDATE ON mobile_ziwei_hourly_occurrences TO hourkey_app;
GRANT SELECT,UPDATE ON mobile_ziwei_hourly_producer_state TO hourkey_app;
GRANT SELECT ON mobile_qizheng_electional_producer_state TO hourkey_app;
GRANT EXECUTE ON FUNCTION claim_mobile_ziwei_hourly_installations(timestamptz,integer) TO hourkey_app;

COMMIT;
