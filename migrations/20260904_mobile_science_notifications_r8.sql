-- R8 astronomy/Qizheng notification foundations.
-- Additive, rerunnable, and deliberately incapable of provider submission.
BEGIN;

ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS astronomy_fact_payload_schema smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS astronomy_fact_audience_binding text;
UPDATE mobile_push_tokens
   SET astronomy_fact_audience_binding=
       translate(rtrim(encode(gen_random_bytes(24),'base64'),'='),'+/','-_')
 WHERE astronomy_fact_audience_binding IS NULL
    OR astronomy_fact_audience_binding !~ '^[A-Za-z0-9_-]{22,64}$';
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_astronomy_fact_payload_schema_check,
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_qizheng_payload_schema_check,
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_astronomy_fact_audience_binding_check;
ALTER TABLE mobile_push_tokens
  ALTER COLUMN astronomy_fact_audience_binding SET DEFAULT
    (translate(rtrim(encode(gen_random_bytes(24),'base64'),'='),'+/','-_')),
  ALTER COLUMN astronomy_fact_audience_binding SET NOT NULL,
  ADD CONSTRAINT mobile_push_tokens_astronomy_fact_payload_schema_check
    CHECK (astronomy_fact_payload_schema IN (0,1)),
  ADD CONSTRAINT mobile_push_tokens_qizheng_payload_schema_check
    CHECK (qizheng_payload_schema=0),
  ADD CONSTRAINT mobile_push_tokens_astronomy_fact_audience_binding_check
    CHECK (astronomy_fact_audience_binding ~ '^[A-Za-z0-9_-]{22,64}$');
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_tokens_astronomy_fact_audience
  ON mobile_push_tokens(astronomy_fact_audience_binding);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_tokens_r8_id_audience
  ON mobile_push_tokens(id,astronomy_fact_audience_binding);

CREATE TABLE IF NOT EXISTS mobile_science_notification_producer_state (
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL CHECK (submode ~ '^[a-z][a-z0-9_]{0,31}$'),
  schema_version smallint NOT NULL CHECK (schema_version BETWEEN 0 AND 32),
  rollout_epoch bigint NOT NULL DEFAULT 1 CHECK (rollout_epoch > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  evidence_complete boolean NOT NULL DEFAULT false,
  provider_send_enabled boolean NOT NULL DEFAULT false CHECK (provider_send_enabled=false),
  last_shadow_run_at timestamptz,
  last_shadow_count integer NOT NULL DEFAULT 0 CHECK (last_shadow_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (science_id,submode,schema_version),
  CHECK (science_id<>'qizheng' OR (schema_version=0 AND evidence_complete=false AND provider_send_enabled=false))
);

INSERT INTO mobile_science_notification_producer_state
  (science_id,submode,schema_version,source_digest,evidence_complete,provider_send_enabled)
VALUES
  ('astronomy_fact','civil_two_hour',1,'6a4228e9f654062b3b131db3d434172243930151ed025193ae14449e7615964e',true,false),
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
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
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
  CHECK (quiet_start<>quiet_end),
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
  primary_token_id uuid NOT NULL,
  primary_installation_id uuid NOT NULL,
  consent_generation bigint NOT NULL DEFAULT 1 CHECK (consent_generation > 0),
  target_revision bigint NOT NULL DEFAULT 1 CHECK (target_revision > 0),
  lifecycle_state text NOT NULL DEFAULT 'shadow',
  active boolean NOT NULL DEFAULT false CHECK (active=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id,org_id,science_id,submode),
  UNIQUE (id,science_id,submode,schema_version),
  CHECK (science_id<>'qizheng' OR (schema_version=0 AND active=false))
);
ALTER TABLE mobile_science_notification_chains
  ADD COLUMN IF NOT EXISTS primary_token_id uuid,
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'shadow';
UPDATE mobile_science_notification_chains c
   SET primary_token_id=(
     SELECT t.id FROM mobile_push_tokens t
      WHERE t.user_id=c.user_id AND t.installation_id=c.primary_installation_id
      ORDER BY t.enabled DESC,t.id LIMIT 1
   )
 WHERE c.primary_token_id IS NULL;
ALTER TABLE mobile_science_notification_chains
  ALTER COLUMN primary_token_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS mobile_science_notification_chains_user_id_primary_installation_id_fkey,
  DROP CONSTRAINT IF EXISTS fk_mobile_science_chain_primary_token,
  DROP CONSTRAINT IF EXISTS mobile_science_notification_chains_lifecycle_state_check;
ALTER TABLE mobile_science_notification_chains
  ADD CONSTRAINT fk_mobile_science_chain_primary_token
    FOREIGN KEY (primary_token_id) REFERENCES mobile_push_tokens(id) ON DELETE CASCADE,
  ADD CONSTRAINT mobile_science_notification_chains_lifecycle_state_check
    CHECK (lifecycle_state IN ('shadow','revoked','rollback'));

CREATE OR REPLACE FUNCTION enforce_mobile_science_notification_chain_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mobile_push_tokens t
     WHERE t.id=NEW.primary_token_id AND t.user_id=NEW.user_id
       AND t.installation_id=NEW.primary_installation_id
  ) THEN
    RAISE EXCEPTION 'mobile_science_notification_chain_owner_mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mobile_science_notification_chain_owner
  ON mobile_science_notification_chains;
CREATE TRIGGER mobile_science_notification_chain_owner
BEFORE INSERT OR UPDATE OF primary_token_id,user_id,primary_installation_id
ON mobile_science_notification_chains
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_science_notification_chain_owner();

CREATE TABLE IF NOT EXISTS mobile_science_notification_endpoints (
  chain_id uuid NOT NULL REFERENCES mobile_science_notification_chains(id) ON DELETE CASCADE,
  token_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  audience_binding text NOT NULL UNIQUE
    CHECK (audience_binding ~ '^[A-Za-z0-9_-]{22,64}$'),
  target_revision bigint NOT NULL DEFAULT 1 CHECK (target_revision > 0),
  primary_endpoint boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id,installation_id)
);
ALTER TABLE mobile_science_notification_endpoints
  ADD COLUMN IF NOT EXISTS token_id uuid;
UPDATE mobile_science_notification_endpoints e
   SET token_id=COALESCE((
     SELECT t.id FROM mobile_push_tokens t
      JOIN mobile_science_notification_chains owner ON owner.id=e.chain_id
      WHERE t.user_id=owner.user_id AND t.installation_id=e.installation_id
      ORDER BY t.enabled DESC,t.id LIMIT 1
   ),(
     SELECT c.primary_token_id FROM mobile_science_notification_chains c WHERE c.id=e.chain_id
   ))
 WHERE e.token_id IS NULL;
ALTER TABLE mobile_science_notification_endpoints
  ALTER COLUMN token_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS fk_mobile_science_endpoint_token_audience;
ALTER TABLE mobile_science_notification_endpoints
  ADD CONSTRAINT fk_mobile_science_endpoint_token_audience
    FOREIGN KEY (token_id,audience_binding)
    REFERENCES mobile_push_tokens(id,astronomy_fact_audience_binding) ON DELETE CASCADE;
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
  suppression_reason text CHECK (suppression_reason IN ('quiet_hours','local_day_cap','rolling_24h_cap')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND pg_column_size(snapshot)<=131072),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  scheduled_for timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_mobile_science_occurrence_chain
    FOREIGN KEY (chain_id,science_id,submode,schema_version)
    REFERENCES mobile_science_notification_chains(id,science_id,submode,schema_version) ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (chain_id,notification_unit_id),
  UNIQUE (identity_hash),
  UNIQUE (result_revision_hash),
  CHECK (scheduled_for<expires_at),
  CHECK ((state='shadowed' AND suppression_reason IS NULL)
      OR (state='expired' AND suppression_reason IS NOT NULL)
      OR state IN ('revoked','rollback'))
);

DO $$
DECLARE fk_name text;
BEGIN
  FOR fk_name IN
    SELECT conname FROM pg_constraint
     WHERE conrelid='mobile_science_notification_occurrences'::regclass
       AND confrelid='mobile_science_notification_chains'::regclass
       AND contype='f' AND conname<>'fk_mobile_science_occurrence_chain'
  LOOP
    EXECUTE format('ALTER TABLE mobile_science_notification_occurrences DROP CONSTRAINT %I',fk_name);
  END LOOP;
END $$;
ALTER TABLE mobile_science_notification_occurrences
  DROP CONSTRAINT IF EXISTS fk_mobile_science_occurrence_chain;
ALTER TABLE mobile_science_notification_occurrences
  ADD CONSTRAINT fk_mobile_science_occurrence_chain
    FOREIGN KEY (chain_id,science_id,submode,schema_version)
    REFERENCES mobile_science_notification_chains(id,science_id,submode,schema_version) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION enforce_mobile_science_notification_occurrence_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN
    RETURN OLD;
  END IF;
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
CREATE INDEX IF NOT EXISTS ix_mobile_science_notification_occurrence_scheduled
  ON mobile_science_notification_occurrences(scheduled_for,chain_id)
  WHERE state='shadowed';
CREATE INDEX IF NOT EXISTS ix_mobile_science_notification_shadow_enabled
  ON mobile_science_notification_shadow_cohort(science_id,submode,user_id)
  WHERE enabled=true;

CREATE OR REPLACE FUNCTION hourkey_r8_remove_transferred_bindings(
  p_new_user_id uuid,p_new_installation_id uuid,p_expo_push_token text,p_device_push_token text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  DELETE FROM public.mobile_science_notification_chains c
   USING public.mobile_push_tokens t
   WHERE c.primary_token_id=t.id
     AND (t.expo_push_token=p_expo_push_token
       OR t.installation_id=p_new_installation_id
       OR (p_device_push_token IS NOT NULL AND t.device_push_token=p_device_push_token))
     AND (t.user_id<>p_new_user_id OR t.installation_id<>p_new_installation_id);
  DELETE FROM public.mobile_science_notification_endpoints e
   USING public.mobile_push_tokens t
   WHERE e.token_id=t.id
     AND (t.expo_push_token=p_expo_push_token
       OR t.installation_id=p_new_installation_id
       OR (p_device_push_token IS NOT NULL AND t.device_push_token=p_device_push_token))
     AND (t.user_id<>p_new_user_id OR t.installation_id<>p_new_installation_id);
END;
$$;

CREATE OR REPLACE FUNCTION hourkey_r8_rebind_primary_token(
  p_user_id uuid,p_installation_id uuid,p_token_id uuid,p_audience text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE affected integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mobile_push_tokens t
     WHERE t.id=p_token_id AND t.user_id=p_user_id AND t.installation_id=p_installation_id
       AND t.astronomy_fact_audience_binding=p_audience AND t.enabled=true
  ) THEN
    RAISE EXCEPTION 'r8_primary_token_binding_invalid' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.mobile_science_notification_endpoints e
   USING public.mobile_science_notification_chains c
   WHERE e.chain_id=c.id AND c.user_id=p_user_id
     AND c.primary_installation_id=p_installation_id
     AND c.primary_token_id<>p_token_id AND c.lifecycle_state='shadow'
     AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour'
     AND c.schema_version=1;
  UPDATE public.mobile_science_notification_chains c
     SET primary_token_id=p_token_id,target_revision=c.target_revision+1,updated_at=now()
   WHERE c.user_id=p_user_id AND c.primary_installation_id=p_installation_id
     AND c.primary_token_id<>p_token_id AND c.lifecycle_state='shadow'
     AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour'
     AND c.schema_version=1;
  INSERT INTO public.mobile_science_notification_endpoints
    (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint,active)
  SELECT c.id,p_token_id,p_installation_id,p_audience,c.target_revision,true,true
    FROM public.mobile_science_notification_chains c
   WHERE c.user_id=p_user_id AND c.primary_installation_id=p_installation_id
     AND c.primary_token_id=p_token_id AND c.lifecycle_state='shadow'
     AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour'
     AND c.schema_version=1
  ON CONFLICT(chain_id,installation_id) DO UPDATE SET
    token_id=EXCLUDED.token_id,audience_binding=EXCLUDED.audience_binding,
    target_revision=EXCLUDED.target_revision,primary_endpoint=true,active=true,updated_at=now();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION hourkey_r8_revoke_delivery_scope(
  p_user_id uuid,p_installation_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE affected integer := 0;
BEGIN
  UPDATE public.mobile_science_notification_chains c
     SET active=false,lifecycle_state='revoked',target_revision=c.target_revision+1,updated_at=now()
   WHERE c.user_id=p_user_id
     AND (p_installation_id IS NULL OR c.primary_installation_id=p_installation_id)
     AND c.lifecycle_state<>'rollback';
  GET DIAGNOSTICS affected=ROW_COUNT;
  DELETE FROM public.mobile_science_notification_endpoints e
   USING public.mobile_science_notification_chains c
   WHERE e.chain_id=c.id AND c.user_id=p_user_id
     AND (p_installation_id IS NULL OR e.installation_id=p_installation_id);
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION hourkey_r8_record_astronomy_shadow_occurrence(
  p_chain_id uuid,p_notification_unit_id text,p_identity_cbor bytea,p_identity_hash bytea,
  p_result_revision_hash bytea,p_rollout_epoch bigint,p_state text,p_suppression_reason text,
  p_snapshot jsonb,p_snapshot_digest text,p_scheduled_for timestamptz,p_expires_at timestamptz,
  p_model_digest text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  inserted_id uuid;
  locked_user_id uuid;
BEGIN
  SELECT c.user_id INTO locked_user_id
    FROM public.mobile_science_notification_chains c
   WHERE c.id=p_chain_id;
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM 1
    FROM public.users u
   WHERE u.id=locked_user_id
     AND u.deleted_at IS NULL
     AND u.is_active IS DISTINCT FROM false
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  WITH eligible AS (
    SELECT c.id
      FROM public.mobile_science_notification_chains c
      JOIN public.users u ON u.id=c.user_id
       AND u.deleted_at IS NULL AND u.is_active IS DISTINCT FROM false
      JOIN public.mobile_science_notification_shadow_cohort h
        ON h.user_id=c.user_id AND h.science_id=c.science_id AND h.submode=c.submode
      JOIN public.mobile_science_notification_subscriptions s
        ON s.user_id=c.user_id AND s.org_id=c.org_id
       AND s.science_id=c.science_id AND s.submode=c.submode
      JOIN public.mobile_science_notification_producer_state p
        ON p.science_id=c.science_id AND p.submode=c.submode AND p.schema_version=c.schema_version
      JOIN public.mobile_push_tokens t ON t.id=c.primary_token_id AND t.user_id=c.user_id
       AND t.installation_id=c.primary_installation_id AND t.enabled=true
      JOIN public.mobile_science_notification_endpoints e ON e.chain_id=c.id AND e.token_id=t.id
       AND e.installation_id=c.primary_installation_id
       AND e.audience_binding=t.astronomy_fact_audience_binding
       AND e.primary_endpoint=true AND e.active=true AND e.target_revision=c.target_revision
     WHERE c.id=p_chain_id AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour'
       AND c.schema_version=1 AND c.lifecycle_state='shadow' AND c.active=false
       AND h.enabled=true AND h.approved_by IS NOT NULL AND h.approved_at IS NOT NULL
       AND s.enabled=false AND s.consent_generation=c.consent_generation
       AND p.provider_send_enabled=false AND p.evidence_complete=true AND p.source_digest=p_model_digest
     FOR UPDATE OF c
  )
  INSERT INTO public.mobile_science_notification_occurrences
    (chain_id,science_id,submode,schema_version,notification_unit_id,identity_cbor,identity_hash,
     result_revision_hash,rollout_epoch,state,suppression_reason,snapshot,snapshot_digest,scheduled_for,expires_at)
  SELECT id,'astronomy_fact','civil_two_hour',1,p_notification_unit_id,p_identity_cbor,p_identity_hash,
         p_result_revision_hash,p_rollout_epoch,p_state,p_suppression_reason,p_snapshot,p_snapshot_digest,
         p_scheduled_for,p_expires_at FROM eligible
  ON CONFLICT DO NOTHING RETURNING id INTO inserted_id;
  RETURN inserted_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION hourkey_r8_mark_astronomy_shadow_run(
  p_run_at timestamptz,p_count integer,p_model_digest text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.mobile_science_notification_producer_state
     SET last_shadow_run_at=p_run_at,last_shadow_count=p_count,updated_at=now()
   WHERE science_id='astronomy_fact' AND submode='civil_two_hour' AND schema_version=1
     AND provider_send_enabled=false AND evidence_complete=true AND source_digest=p_model_digest;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION hourkey_r8_remove_transferred_bindings(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hourkey_r8_rebind_primary_token(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hourkey_r8_revoke_delivery_scope(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hourkey_r8_record_astronomy_shadow_occurrence(uuid,text,bytea,bytea,bytea,bigint,text,text,jsonb,text,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hourkey_r8_mark_astronomy_shadow_run(timestamptz,integer,text) FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON mobile_science_notification_producer_state,mobile_science_notification_subscriptions,
     mobile_science_notification_shadow_cohort,mobile_science_notification_chains,
     mobile_science_notification_endpoints,mobile_science_notification_occurrences
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
    GRANT SELECT ON mobile_science_notification_producer_state TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_subscriptions TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_shadow_cohort TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_chains TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_endpoints TO hourkey_app;
    GRANT SELECT ON mobile_science_notification_occurrences TO hourkey_app;
    REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON mobile_science_notification_producer_state,mobile_science_notification_subscriptions,
         mobile_science_notification_shadow_cohort,mobile_science_notification_chains,
         mobile_science_notification_endpoints,mobile_science_notification_occurrences
      FROM hourkey_app;
    GRANT EXECUTE ON FUNCTION hourkey_r8_remove_transferred_bindings(uuid,uuid,text,text) TO hourkey_app;
    GRANT EXECUTE ON FUNCTION hourkey_r8_rebind_primary_token(uuid,uuid,uuid,text) TO hourkey_app;
    GRANT EXECUTE ON FUNCTION hourkey_r8_revoke_delivery_scope(uuid,uuid) TO hourkey_app;
    GRANT EXECUTE ON FUNCTION hourkey_r8_record_astronomy_shadow_occurrence(uuid,text,bytea,bytea,bytea,bigint,text,text,jsonb,text,timestamptz,timestamptz,text) TO hourkey_app;
    GRANT EXECUTE ON FUNCTION hourkey_r8_mark_astronomy_shadow_run(timestamptz,integer,text) TO hourkey_app;
  END IF;
END $$;

COMMIT;
