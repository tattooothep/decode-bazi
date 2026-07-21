-- Run with the schema owner so the configured ALTER DEFAULT PRIVILEGES grants app DML:
-- docker exec -i decode-postgres psql -U decode_user -d decode_db < scripts/migrate-auth-delivery-outbox.sql
CREATE TABLE IF NOT EXISTS auth_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('password_reset')),
  payload_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','processing','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_delivery_outbox_ready ON auth_delivery_outbox(status,available_at,created_at);
REVOKE ALL ON auth_delivery_outbox FROM PUBLIC;
