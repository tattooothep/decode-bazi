BEGIN;

CREATE TABLE IF NOT EXISTS mobile_saved_dates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_saved_dates_user_created
  ON mobile_saved_dates (org_id, user_id, created_at DESC, id DESC);

REVOKE UPDATE ON mobile_saved_dates FROM hourkey_app;
GRANT SELECT, INSERT, DELETE ON mobile_saved_dates TO hourkey_app;

COMMENT ON TABLE mobile_saved_dates IS 'R515 mobile date-picking selections; payload is a client-selected candidate snapshot.';

COMMIT;
