BEGIN;

CREATE TABLE IF NOT EXISTS mobile_zibai_installations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  daily_enabled boolean NOT NULL DEFAULT false,
  shichen_enabled boolean NOT NULL DEFAULT false,
  daily_minute smallint NOT NULL DEFAULT 420 CHECK (daily_minute BETWEEN 0 AND 1439),
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  location_permission text NOT NULL DEFAULT 'unknown'
    CHECK (location_permission IN ('unknown','foreground','background','denied')),
  latitude double precision,
  longitude double precision,
  location_timezone text,
  location_captured_at timestamptz,
  location_expires_at timestamptz,
  next_daily_at timestamptz,
  next_shichen_at timestamptz,
  calculation_version text NOT NULL DEFAULT 'zibai-zaoming-true-solar-v1'
    CHECK (calculation_version='zibai-zaoming-true-solar-v1'),
  owner_generation bigint NOT NULL DEFAULT 1 CHECK (owner_generation > 0),
  last_skip_reason text,
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,installation_id),
  CONSTRAINT mobile_zibai_location_all_or_none CHECK (
    (latitude IS NULL AND longitude IS NULL AND location_timezone IS NULL
      AND location_captured_at IS NULL AND location_expires_at IS NULL)
    OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND location_timezone IS NOT NULL AND btrim(location_timezone)<>''
      AND location_captured_at IS NOT NULL AND location_expires_at IS NOT NULL
      AND location_expires_at > location_captured_at
      AND location_expires_at <= location_captured_at + interval '24 hours')
  ),
  CONSTRAINT mobile_zibai_background_required CHECK (
    shichen_enabled=false OR location_permission='background'
  ),
  CONSTRAINT mobile_zibai_lease_shape CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_zibai_active_installation
  ON mobile_zibai_installations(installation_id);
CREATE INDEX IF NOT EXISTS ix_mobile_zibai_daily_due
  ON mobile_zibai_installations(next_daily_at,user_id,installation_id)
  WHERE daily_enabled=true AND next_daily_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_zibai_shichen_due
  ON mobile_zibai_installations(next_shichen_at,user_id,installation_id)
  WHERE shichen_enabled=true AND next_shichen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_zibai_location_expiry
  ON mobile_zibai_installations(location_expires_at,user_id,installation_id)
  WHERE location_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mobile_zibai_lease_expiry
  ON mobile_zibai_installations(lease_expires_at,user_id,installation_id)
  WHERE lease_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_zibai_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  occurrence_key text NOT NULL,
  occurrence_type text NOT NULL CHECK (occurrence_type IN ('daily','shichen')),
  apparent_solar_date date NOT NULL,
  shichen_key text CHECK (shichen_key IS NULL OR shichen_key IN ('zi','chou','yin','mao','chen','si','wu','wei','shen','you','xu','hai')),
  calculation_version text NOT NULL CHECK (calculation_version='zibai-zaoming-true-solar-v1'),
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','reserved','skipped')),
  skip_reason text,
  push_log_id uuid REFERENCES mobile_push_log(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,installation_id)
    REFERENCES mobile_zibai_installations(user_id,installation_id) ON DELETE CASCADE,
  CONSTRAINT mobile_zibai_occurrence_shape CHECK (
    (occurrence_type='daily' AND shichen_key IS NULL)
    OR (occurrence_type='shichen' AND shichen_key IS NOT NULL)
  ),
  UNIQUE(user_id,installation_id,occurrence_key)
);

CREATE INDEX IF NOT EXISTS ix_mobile_zibai_occurrence_daily_cap
  ON mobile_zibai_occurrences(user_id,installation_id,apparent_solar_date,occurrence_type,state);
CREATE INDEX IF NOT EXISTS ix_mobile_zibai_occurrence_retention
  ON mobile_zibai_occurrences(created_at,id);

GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_zibai_installations TO hourkey_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON mobile_zibai_occurrences TO hourkey_app;

COMMIT;
