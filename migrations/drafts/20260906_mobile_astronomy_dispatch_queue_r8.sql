-- R8 dispatch queue sidecar (6 ก.ย. 2569)
--
-- The delivery reducer's `result` event deliberately carries no retry timing
-- or token disposition (review finding: they must travel out-of-band). This
-- queue is that band: one row per in-flight lineage holding when the next
-- claim may run and whether the provider issued structured UNREGISTERED
-- evidence. Terminal lineages delete their row. Draft only — applied together
-- with the ledger/registry migrations at dispatch integration time.

BEGIN;

CREATE TABLE IF NOT EXISTS mobile_astronomy_dispatch_queue_r8 (
  chain_uuid uuid NOT NULL,
  notification_unit_id text NOT NULL CHECK (btrim(notification_unit_id) <> '' AND length(notification_unit_id) <= 320),
  occurrence_id uuid NOT NULL,
  next_attempt_at timestamptz,
  token_disposition text NOT NULL DEFAULT 'unchanged'
    CHECK (token_disposition IN ('unchanged', 'unregistered')),
  last_outcome text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_uuid, notification_unit_id)
);

CREATE INDEX IF NOT EXISTS ix_mobile_astronomy_dispatch_due
  ON mobile_astronomy_dispatch_queue_r8 (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

COMMIT;
