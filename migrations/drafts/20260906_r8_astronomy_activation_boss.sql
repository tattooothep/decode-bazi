-- R8 astronomy ACTIVATION — boss-scoped pilot (6 ก.ย. 2569 · หลังครบ 5 ลายเซ็น)
--
-- Prerequisites applied separately first: the three draft tables
-- (delivery store, chain registry, dispatch queue). This file then:
--  1. drops ONLY the two global hard-off CHECK pins — every qizheng-specific
--     pin (schema 0, enabled=false, provider_send_enabled=false, occurrences
--     CHECK science_id='astronomy_fact') REMAINS in force;
--  2. re-points the occurrence recorder's eligibility from shadow mode to
--     live mode (subscription enabled + producer send enabled) — no other
--     line of the SECURITY DEFINER function changes;
--  3. flips provider_send_enabled for astronomy_fact/civil_two_hour/schema 1
--     only where evidence_complete already holds;
--  4. enrolls exactly one account (boss, by email) with chain + endpoint +
--     approved cohort + consented subscription. Idempotent re-run safe.

BEGIN;

ALTER TABLE mobile_science_notification_producer_state
  DROP CONSTRAINT IF EXISTS mobile_science_notification_produce_provider_send_enabled_check;
ALTER TABLE mobile_science_notification_subscriptions
  DROP CONSTRAINT IF EXISTS mobile_science_notification_subscriptions_enabled_check;

-- ── live-mode occurrence recorder (only s.enabled / p.provider_send_enabled flipped) ──
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
       AND s.enabled=true AND s.consent_generation=c.consent_generation
       AND p.provider_send_enabled=true AND p.evidence_complete=true AND p.source_digest=p_model_digest
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

UPDATE mobile_science_notification_producer_state
   SET provider_send_enabled = true, updated_at = now()
 WHERE science_id = 'astronomy_fact' AND submode = 'civil_two_hour'
   AND schema_version = 1 AND evidence_complete = true;

-- ── enroll boss only ─────────────────────────────────────────────────────
WITH boss AS (
  SELECT u.id AS user_id, u.current_org_id AS org_id, t.id AS token_id,
         t.installation_id
    FROM users u
    JOIN mobile_push_tokens t ON t.user_id = u.id AND t.enabled = true
   WHERE u.email = 'tattoothep@gmail.com'
     AND t.device_push_token IS NOT NULL AND t.astronomy_fact_payload_schema = 1
   ORDER BY t.last_registered_at DESC NULLS LAST
   LIMIT 1
)
INSERT INTO mobile_science_notification_chains
  (user_id, org_id, science_id, submode, schema_version, primary_token_id, primary_installation_id)
SELECT user_id, org_id, 'astronomy_fact', 'civil_two_hour', 1, token_id, installation_id FROM boss
ON CONFLICT (user_id, org_id, science_id, submode) DO NOTHING;

INSERT INTO mobile_science_notification_endpoints
  (chain_id, token_id, installation_id, audience_binding, target_revision, primary_endpoint, active)
SELECT c.id, c.primary_token_id, c.primary_installation_id,
       t.astronomy_fact_audience_binding, c.target_revision, true, true
  FROM mobile_science_notification_chains c
  JOIN users u ON u.id = c.user_id AND u.email = 'tattoothep@gmail.com'
  JOIN mobile_push_tokens t ON t.id = c.primary_token_id
 WHERE c.science_id = 'astronomy_fact' AND c.submode = 'civil_two_hour'
ON CONFLICT (chain_id, installation_id) DO UPDATE SET
  token_id = EXCLUDED.token_id, audience_binding = EXCLUDED.audience_binding,
  target_revision = EXCLUDED.target_revision, primary_endpoint = true, active = true, updated_at = now();

INSERT INTO mobile_science_notification_shadow_cohort
  (user_id, science_id, submode, enabled, approved_by, approved_at)
SELECT u.id, 'astronomy_fact', 'civil_two_hour', true,
       'boss-direct-order-20260906-claude-session', now()
  FROM users u WHERE u.email = 'tattoothep@gmail.com'
ON CONFLICT (user_id, science_id, submode) DO UPDATE SET
  enabled = true, approved_by = EXCLUDED.approved_by,
  approved_at = EXCLUDED.approved_at, updated_at = now();

INSERT INTO mobile_science_notification_subscriptions
  (user_id, org_id, science_id, submode, enabled, cadence, local_day_cap,
   quiet_start, quiet_end, consent_generation, locale, display_timezone, receipt)
SELECT u.id, u.current_org_id, 'astronomy_fact', 'civil_two_hour', true, 'two_hour', 12,
       22, 7, 1, 'th', 'Asia/Bangkok',
       jsonb_build_object(
         'source', 'boss-direct-order',
         'recordedAt', now()::text,
         'channel', 'claude-session-20260906',
         'statement', 'owner requested live astronomy delivery to own device for QA')
  FROM users u WHERE u.email = 'tattoothep@gmail.com'
ON CONFLICT (user_id, science_id, submode) DO UPDATE SET
  enabled = true, cadence = 'two_hour', updated_at = now();

COMMIT;
