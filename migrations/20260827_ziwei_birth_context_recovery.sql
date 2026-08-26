-- Audited, owner-confirmed recovery for legacy Ziwei birth timezones.
-- Additive/rerunnable. No Qimen or Zi Bai objects are read or written here.
BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birth_tz_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS birth_tz_tzdb_version text,
  ADD COLUMN IF NOT EXISTS birth_place_id text,
  ADD COLUMN IF NOT EXISTS birth_location_source text,
  ADD COLUMN IF NOT EXISTS birth_location_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS birth_location_accuracy_m double precision;

ALTER TABLE mobile_ziwei_hourly_installations
  ADD COLUMN IF NOT EXISTS birth_context_fingerprint text;

ALTER TABLE mobile_ziwei_hourly_installations
  DROP CONSTRAINT IF EXISTS mobile_ziwei_hourly_birth_context_fingerprint_shape;
ALTER TABLE mobile_ziwei_hourly_installations
  ADD CONSTRAINT mobile_ziwei_hourly_birth_context_fingerprint_shape CHECK (
    birth_context_fingerprint IS NULL OR birth_context_fingerprint ~ '^[0-9a-f]{64}$'
  );

UPDATE mobile_ziwei_hourly_producer_state
   SET producer_enabled=false,
       source_digest='b311fc6a4ff531c7b97ac80ae9d586c95008b929151b2b5115aabd0b49486b0a',
       backend_commit=NULL,enabled_at=NULL,enabled_by=NULL,updated_at=now()
 WHERE singleton=true
   AND source_digest IS DISTINCT FROM 'b311fc6a4ff531c7b97ac80ae9d586c95008b929151b2b5115aabd0b49486b0a';

CREATE OR REPLACE FUNCTION hourkey_ziwei_birth_context_confirmed(
  source_value text,
  confirmed_at_value timestamptz
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT confirmed_at_value IS NOT NULL
    AND source_value IN ('user_confirmed_iana','user_confirmed_exact_offset','verified_import')
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_owner_profile
  ON profiles(created_by_user_id,id);

CREATE TABLE IF NOT EXISTS profile_birth_context_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  status text NOT NULL
    CHECK (status IN ('confirmation_required','confirmed','expired','manual_review')),
  observed_location_name text,
  observed_birth_tz text,
  candidate_display_name text,
  candidate_place_id text,
  candidate_latitude double precision,
  candidate_longitude double precision,
  candidate_timezone text,
  candidate_provider text,
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^[0-9a-f]{64}$'),
  evidence_kind text NOT NULL,
  confirmation_token_digest text NOT NULL
    CHECK (confirmation_token_digest ~ '^[0-9a-f]{64}$'),
  profile_updated_at_seen timestamptz NOT NULL,
  chart_change_required boolean NOT NULL DEFAULT false,
  old_natal_fingerprint text,
  candidate_natal_fingerprint text,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  applied_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id,profile_id)
    REFERENCES profiles(created_by_user_id,id) ON DELETE CASCADE,
  CONSTRAINT profile_birth_context_candidate_coordinate_pair CHECK (
    (candidate_latitude IS NULL)=(candidate_longitude IS NULL)
  ),
  CONSTRAINT profile_birth_context_candidate_coordinate_range CHECK (
    candidate_latitude IS NULL OR (
      candidate_latitude BETWEEN -90 AND 90
      AND candidate_longitude BETWEEN -180 AND 180
    )
  ),
  CONSTRAINT profile_birth_context_confirmation_shape CHECK (
    (status='confirmed')=(confirmed_at IS NOT NULL AND applied_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_birth_context_pending
  ON profile_birth_context_recoveries(user_id,profile_id)
  WHERE status='confirmation_required';
CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_birth_context_confirmation_token
  ON profile_birth_context_recoveries(confirmation_token_digest);
CREATE INDEX IF NOT EXISTS ix_profile_birth_context_expiry
  ON profile_birth_context_recoveries(expires_at)
  WHERE status='confirmation_required';

CREATE TABLE IF NOT EXISTS profile_birth_context_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_id uuid NOT NULL REFERENCES profile_birth_context_recoveries(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('timezone_confirmed','timezone_reconfirmed')),
  before_context jsonb NOT NULL,
  after_context jsonb NOT NULL,
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^[0-9a-f]{64}$'),
  resolver_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id,profile_id)
    REFERENCES profiles(created_by_user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_profile_birth_context_events_owner
  ON profile_birth_context_events(user_id,profile_id,created_at DESC);

-- Database defence-in-depth. The backend resolver remains authoritative, but
-- an unconfirmed/imported string must never leave stale consent runnable.
CREATE OR REPLACE FUNCTION hourkey_reconcile_ziwei_canonical_profile()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_id uuid;
  facts_changed boolean;
  context_ready boolean;
BEGIN
  owner_id := NEW.created_by_user_id;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mobile-push-user:'||owner_id::text,0));

  facts_changed := TG_OP='INSERT'
    OR NEW.birth_datetime IS DISTINCT FROM OLD.birth_datetime
    OR NEW.birth_time_known IS DISTINCT FROM OLD.birth_time_known
    OR NEW.birth_tz IS DISTINCT FROM OLD.birth_tz
    OR NEW.birth_tz_source IS DISTINCT FROM OLD.birth_tz_source
    OR NEW.birth_tz_confirmed_at IS DISTINCT FROM OLD.birth_tz_confirmed_at
    OR NEW.gender IS DISTINCT FROM OLD.gender
    OR NEW.relationship_type IS DISTINCT FROM OLD.relationship_type
    OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id;
  IF NOT facts_changed THEN RETURN NEW; END IF;

  context_ready := COALESCE(NEW.is_archived,false)=false
    AND NEW.birth_datetime IS NOT NULL
    AND NEW.birth_time_known=true
    AND hourkey_birth_timezone_valid(NEW.birth_tz)
    AND hourkey_ziwei_birth_wall_eligible(NEW.birth_datetime,NEW.birth_tz)
    AND hourkey_ziwei_birth_context_confirmed(NEW.birth_tz_source,NEW.birth_tz_confirmed_at)
    AND NEW.gender IN ('M','F')
    AND (NEW.relationship_type IS NULL OR btrim(NEW.relationship_type)='');

  -- Every canonical source-fact change requires an explicit enrolment write.
  -- This fences a leased/queued old snapshot without changing other sciences.
  UPDATE mobile_notification_prefs
     SET ziwei_hourly_enabled=false,updated_at=now()
   WHERE user_id=owner_id AND ziwei_profile_id=NEW.id AND ziwei_hourly_enabled=true;
  UPDATE mobile_ziwei_hourly_installations
     SET enabled=false,next_due_at=NULL,lease_token=NULL,lease_expires_at=NULL,
         birth_context_fingerprint=NULL,
         last_skip_reason=CASE WHEN context_ready
           THEN 'birth_context_changed_reenroll_required'
           ELSE 'birth_context_unconfirmed' END,
         owner_generation=owner_generation+1,updated_at=now()
   WHERE user_id=owner_id AND profile_id=NEW.id
     AND (enabled=true OR next_due_at IS NOT NULL OR lease_token IS NOT NULL
       OR birth_context_fingerprint IS NOT NULL);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hourkey_reconcile_ziwei_canonical_profile ON profiles;
CREATE TRIGGER hourkey_reconcile_ziwei_canonical_profile
AFTER INSERT OR UPDATE OF birth_datetime,birth_time_known,birth_tz,birth_tz_source,
  birth_tz_confirmed_at,gender,relationship_type,is_archived,created_by_user_id
ON profiles FOR EACH ROW EXECUTE FUNCTION hourkey_reconcile_ziwei_canonical_profile();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE profile_birth_context_recoveries,profile_birth_context_events FROM PUBLIC, hourkey_app';
    EXECUTE 'GRANT SELECT,INSERT,UPDATE ON TABLE profile_birth_context_recoveries TO hourkey_app';
    EXECUTE 'GRANT SELECT,INSERT ON TABLE profile_birth_context_events TO hourkey_app';
  ELSE
    REVOKE ALL PRIVILEGES ON TABLE profile_birth_context_recoveries,profile_birth_context_events FROM PUBLIC;
  END IF;
END $$;

COMMIT;
