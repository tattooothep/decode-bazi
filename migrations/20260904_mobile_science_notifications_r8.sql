-- R8 astronomy/Qizheng notification foundations.
-- Additive, rerunnable, and deliberately incapable of provider submission.
BEGIN;

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS astronomy_fact_payload_schema smallint NOT NULL DEFAULT 0;
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_astronomy_fact_payload_schema_check,
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qizheng_payload_schema_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_astronomy_fact_payload_schema_check
    CHECK (astronomy_fact_payload_schema IN (0,1)),
  ADD CONSTRAINT mobile_push_tokens_qizheng_payload_schema_check
    CHECK (qizheng_payload_schema=0);

CREATE TABLE IF NOT EXISTS mobile_science_notification_producer_state (
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL CHECK (submode ~ '^[a-z][a-z0-9_]{0,31}$'),
  schema_version smallint NOT NULL CHECK (schema_version BETWEEN 0 AND 32),
  rollout_epoch bigint NOT NULL DEFAULT 1 CHECK (rollout_epoch > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  evidence_complete boolean NOT NULL DEFAULT false,
  provider_send_enabled boolean NOT NULL DEFAULT false CHECK (provider_send_enabled=false),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (science_id,submode,schema_version),
  CHECK (science_id<>'qizheng' OR (schema_version=0 AND evidence_complete=false AND provider_send_enabled=false))
);

INSERT INTO mobile_science_notification_producer_state
  (science_id,submode,schema_version,source_digest,evidence_complete,provider_send_enabled)
VALUES
  ('astronomy_fact','civil_two_hour',1,'6f65f1cf1e8ecea4f007b18122cb3df4b161f9d7267faf10ff88d3392dfc195a',true,false),
  ('qizheng','electional_window',0,'af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2',false,false),
  ('qizheng','rule_event',0,'af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2',false,false),
  ('qizheng','solar_month',0,'af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2',false,false),
  ('qizheng','annual_limit',0,'af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2',false,false)
ON CONFLICT (science_id,submode,schema_version) DO UPDATE
  SET source_digest=EXCLUDED.source_digest,
      evidence_complete=EXCLUDED.evidence_complete,
      provider_send_enabled=false,
      updated_at=now()
  WHERE mobile_science_notification_producer_state.provider_send_enabled=false;

CREATE TABLE IF NOT EXISTS mobile_science_notification_subscriptions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL CHECK (submode ~ '^[a-z][a-z0-9_]{0,31}$'),
  enabled boolean NOT NULL DEFAULT false CHECK (enabled=false),
  cadence text NOT NULL CHECK (cadence IN ('two_hour','event','daily','weekly','solar_month','annual_limit')),
  local_day_cap smallint NOT NULL CHECK (local_day_cap BETWEEN 1 AND 12),
  consent_generation bigint NOT NULL DEFAULT 1 CHECK (consent_generation > 0),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  profile_revision bigint,
  locale text NOT NULL CHECK (locale IN ('th','en','zh-Hans','zh-Hant','vi','ja','ru','ko','es')),
  display_timezone text NOT NULL CHECK (btrim(display_timezone)<>'' AND length(display_timezone)<=80),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,science_id,submode),
  CHECK ((profile_id IS NULL AND profile_revision IS NULL)
      OR (profile_id IS NOT NULL AND profile_revision IS NOT NULL AND profile_revision>0)),
  CHECK (science_id<>'qizheng' OR (enabled=false AND profile_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS mobile_science_notification_shadow_cohort (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  science_id text NOT NULL CHECK (science_id='astronomy_fact'),
  submode text NOT NULL CHECK (submode='civil_two_hour'),
  enabled boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,science_id,submode),
  CHECK (enabled=false OR (
    approved_by IS NOT NULL AND btrim(approved_by)<>'' AND length(approved_by)<=160
    AND approved_at IS NOT NULL
  ))
);

CREATE TABLE IF NOT EXISTS mobile_science_notification_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_delivery_chain_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL CHECK (submode ~ '^[a-z][a-z0-9_]{0,31}$'),
  schema_version smallint NOT NULL CHECK (schema_version BETWEEN 0 AND 32),
  primary_installation_id uuid NOT NULL,
  target_revision bigint NOT NULL DEFAULT 1 CHECK (target_revision > 0),
  active boolean NOT NULL DEFAULT false CHECK (active=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id,primary_installation_id)
    REFERENCES mobile_push_tokens(user_id,installation_id) ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (user_id,org_id,science_id,submode),
  UNIQUE (id,science_id,submode,schema_version),
  CHECK (science_id<>'qizheng' OR (schema_version=0 AND active=false))
);

CREATE TABLE IF NOT EXISTS mobile_science_notification_endpoints (
  chain_id uuid NOT NULL REFERENCES mobile_science_notification_chains(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL,
  audience_binding text NOT NULL UNIQUE
    CHECK (audience_binding ~ '^[A-Za-z0-9_-]{22,64}$'),
  target_revision bigint NOT NULL DEFAULT 1 CHECK (target_revision > 0),
  primary_endpoint boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id,installation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_science_notification_primary_endpoint
  ON mobile_science_notification_endpoints(chain_id)
  WHERE primary_endpoint=true AND active=true;

CREATE TABLE IF NOT EXISTS mobile_science_notification_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL,
  science_id text NOT NULL CHECK (science_id='astronomy_fact'),
  submode text NOT NULL CHECK (submode='civil_two_hour'),
  schema_version smallint NOT NULL CHECK (schema_version=1),
  notification_unit_id text NOT NULL CHECK (btrim(notification_unit_id)<>'' AND length(notification_unit_id)<=320),
  identity_cbor bytea NOT NULL CHECK (octet_length(identity_cbor) BETWEEN 1 AND 4096),
  identity_hash bytea NOT NULL CHECK (octet_length(identity_hash)=32),
  result_revision_hash bytea NOT NULL CHECK (octet_length(result_revision_hash)=32),
  rollout_epoch bigint NOT NULL CHECK (rollout_epoch > 0),
  state text NOT NULL CHECK (state IN ('shadowed','expired','revoked','rollback')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND pg_column_size(snapshot)<=131072),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (chain_id,science_id,submode,schema_version)
    REFERENCES mobile_science_notification_chains(id,science_id,submode,schema_version) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT (chain_id,notification_unit_id),
  UNIQUE (identity_hash),
  UNIQUE (result_revision_hash)
);

CREATE OR REPLACE FUNCTION enforce_mobile_science_notification_occurrence_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mobile_science_notification_occurrence_immutable' USING ERRCODE='23514';
END;
$$;
DROP TRIGGER IF EXISTS mobile_science_notification_occurrence_immutable
  ON mobile_science_notification_occurrences;
CREATE TRIGGER mobile_science_notification_occurrence_immutable
BEFORE UPDATE OR DELETE ON mobile_science_notification_occurrences
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_science_notification_occurrence_immutable();

CREATE INDEX IF NOT EXISTS ix_mobile_science_notification_occurrence_chain_created
  ON mobile_science_notification_occurrences(chain_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_mobile_science_notification_shadow_enabled
  ON mobile_science_notification_shadow_cohort(science_id,submode,user_id)
  WHERE enabled=true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
    GRANT SELECT ON mobile_science_notification_producer_state TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_subscriptions TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_shadow_cohort TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_chains TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_endpoints TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_occurrences TO hourkey_app;
  END IF;
END $$;

COMMIT;
