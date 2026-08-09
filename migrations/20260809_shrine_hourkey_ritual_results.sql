-- Durable authoritative results for every HourKey in-app shrine ritual.
-- Private wish text is intentionally not stored; request_hash binds retries.

CREATE TABLE IF NOT EXISTS shrine_hourkey_ritual_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ritual_id varchar(64) NOT NULL,
  locale varchar(2) NOT NULL
    CHECK (locale IN ('th','en','zh','cn','vi','ja','ru','ko','es')),
  intent_category varchar(16),
  request_hash char(64) NOT NULL
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result_code varchar(64) NOT NULL,
  result_json jsonb NOT NULL,
  idempotency_key varchar(39) NOT NULL
    CHECK (idempotency_key ~ '^ritual_[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_shrine_hourkey_results_user_time
  ON shrine_hourkey_ritual_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shrine_hourkey_results_user_ritual_time
  ON shrine_hourkey_ritual_results(user_id, ritual_id, created_at DESC);

REVOKE UPDATE, DELETE ON shrine_hourkey_ritual_results FROM PUBLIC;
