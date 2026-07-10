BEGIN;

CREATE TABLE IF NOT EXISTS hourkey_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  org_id text,
  feature text NOT NULL,
  queue_name text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  priority integer NOT NULL DEFAULT 50,
  idempotency_key text,
  request_hash text,
  provider text,
  provider_model text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_ref text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hourkey_jobs_user_feature_idempotency_uq
  ON hourkey_jobs(user_id, feature, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS hourkey_jobs_queue_status_created_idx
  ON hourkey_jobs(queue_name, status, created_at);
CREATE INDEX IF NOT EXISTS hourkey_jobs_user_created_idx
  ON hourkey_jobs(user_id, created_at DESC);

ALTER TABLE palm_jobs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE palm_jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE palm_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE palm_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS palm_jobs_user_idempotency_uq
  ON palm_jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS palm_jobs_recovery_idx
  ON palm_jobs(status, updated_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'legacy';
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS yam_reserved integer NOT NULL DEFAULT 0;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS yam_charged integer NOT NULL DEFAULT 0;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS yam_refunded integer NOT NULL DEFAULT 0;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS yam_extra integer NOT NULL DEFAULT 0;
ALTER TABLE fusion5_jobs ADD COLUMN IF NOT EXISTS billed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS fusion5_jobs_user_idempotency_uq
  ON fusion5_jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fusion5_jobs_recovery_idx
  ON fusion5_jobs(status, updated_at)
  WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS hour_transactions_fusion5_billing_ref_uq
  ON hour_transactions(ref_payment_id)
  WHERE ref_payment_id LIKE 'fusion5_job:%';

COMMIT;
