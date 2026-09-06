-- R8 stable chain registry (integration gap: design §5.4/§8.3 · 6 ก.ย. 2569)
--
-- mobile_science_notification_chains cascade-deletes on device transfer, so the
-- account_delivery_chain_uuid minted there does not survive every lifecycle the
-- durable delivery ledger must key on. This registry owns the mapping
-- (user, org, science, submode) → chain UUID permanently: rows are never
-- updated or deleted, so ledger lineage keys and acceptance tombstones keyed by
-- chain_uuid stay resolvable across token rotation, reinstall, transfer,
-- consent edits, and re-enrollment ("same chain, new target revision").
-- Draft only — applied with the ledger migration at dispatch integration time.

BEGIN;

CREATE TABLE IF NOT EXISTS mobile_astronomy_chain_registry_r8 (
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  science_id text NOT NULL CHECK (science_id = 'astronomy_fact'),
  submode text NOT NULL CHECK (submode = 'civil_two_hour'),
  chain_uuid uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, science_id, submode)
);

CREATE OR REPLACE FUNCTION enforce_mobile_astronomy_chain_registry_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mobile_astronomy_chain_registry_immutable' USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS mobile_astronomy_chain_registry_immutable
  ON mobile_astronomy_chain_registry_r8;
CREATE TRIGGER mobile_astronomy_chain_registry_immutable
BEFORE UPDATE OR DELETE ON mobile_astronomy_chain_registry_r8
FOR EACH ROW EXECUTE FUNCTION enforce_mobile_astronomy_chain_registry_immutable();

COMMIT;
