-- Notification integrity hardening (15 Aug 2026)
-- Additive and rerunnable. This migration does not send notifications.
BEGIN;

-- Resolve historical active duplicates deterministically before enforcing one
-- active owner per installation/native token. Keep the most recently
-- registered row active and retain older rows as disabled audit history.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY installation_id
           ORDER BY last_registered_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
         ) AS ordinal
    FROM mobile_push_tokens
   WHERE enabled=true
)
UPDATE mobile_push_tokens t
   SET enabled=false, disabled_at=COALESCE(t.disabled_at, now()), updated_at=now()
  FROM ranked r
 WHERE t.id=r.id AND r.ordinal>1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY device_push_token
           ORDER BY last_registered_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
         ) AS ordinal
    FROM mobile_push_tokens
   WHERE enabled=true AND device_push_token IS NOT NULL
)
UPDATE mobile_push_tokens t
   SET enabled=false, disabled_at=COALESCE(t.disabled_at, now()), updated_at=now()
  FROM ranked r
 WHERE t.id=r.id AND r.ordinal>1;

-- The deployed per-account installation constraint prevents retaining disabled
-- rotation history. Replace it with the active-owner index below; no token row
-- is removed, and the partial indexes are stricter for live delivery.
ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_user_id_installation_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_tokens_active_installation
  ON mobile_push_tokens(installation_id) WHERE enabled=true;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_tokens_active_native
  ON mobile_push_tokens(device_push_token) WHERE enabled=true AND device_push_token IS NOT NULL;

ALTER TABLE mobile_notification_prefs
  ADD COLUMN IF NOT EXISTS privacy_preview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'th';

ALTER TABLE mobile_push_log
  ADD COLUMN IF NOT EXISTS source_facts jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE mobile_notification_prefs
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_locale_check;
ALTER TABLE mobile_notification_prefs
  ADD CONSTRAINT mobile_notification_prefs_locale_check
  CHECK (locale IN ('th', 'en', 'zh', 'cn', 'vi', 'ja', 'ru', 'ko', 'es'));

-- One immutable provider payload per logical notification/installation. Raw
-- provider credentials remain on mobile_push_tokens and are never copied here.
ALTER TABLE mobile_push_log
  DROP CONSTRAINT IF EXISTS mobile_push_log_delivery_status_check;
ALTER TABLE mobile_push_log
  ADD CONSTRAINT mobile_push_log_delivery_status_check
  CHECK (delivery_status IN ('pending', 'accepted', 'delivered', 'failed'));

CREATE TABLE IF NOT EXISTS mobile_push_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  push_log_id uuid NOT NULL REFERENCES mobile_push_log(id) ON DELETE CASCADE,
  token_id uuid REFERENCES mobile_push_tokens(id) ON DELETE SET NULL,
  installation_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('fcm', 'expo')),
  provider_message jsonb NOT NULL,
  message_sha256 text NOT NULL CHECK (message_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'provider_accepted', 'delivered', 'retry_due', 'dead')),
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  next_retry_at timestamptz,
  lease_token text,
  lease_expires_at timestamptz,
  send_started_at timestamptz,
  provider_message_id text,
  provider_ticket_id text,
  next_receipt_at timestamptz,
  receipt_poll_count integer NOT NULL DEFAULT 0 CHECK (receipt_poll_count >= 0),
  last_error text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(push_log_id, installation_id)
);

-- Keep the migration upgrade-safe when an earlier Task 2 draft created the
-- table before the committed external-send boundary was added.
ALTER TABLE mobile_push_attempts
  ADD COLUMN IF NOT EXISTS send_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_receipt_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_poll_count integer NOT NULL DEFAULT 0;
ALTER TABLE mobile_push_attempts
  DROP CONSTRAINT IF EXISTS mobile_push_attempts_receipt_poll_count_check;
ALTER TABLE mobile_push_attempts
  ADD CONSTRAINT mobile_push_attempts_receipt_poll_count_check CHECK (receipt_poll_count >= 0);

CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_due
  ON mobile_push_attempts(next_retry_at, created_at)
  WHERE status IN ('reserved', 'retry_due');
CREATE INDEX IF NOT EXISTS ix_mobile_push_attempts_stale_lease
  ON mobile_push_attempts(lease_expires_at)
  WHERE lease_token IS NOT NULL;
DROP INDEX IF EXISTS ix_mobile_push_attempts_expo_receipt;
CREATE INDEX ix_mobile_push_attempts_expo_receipt
  ON mobile_push_attempts(next_receipt_at, accepted_at)
  WHERE status='provider_accepted' AND provider='expo' AND provider_ticket_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_attempts_provider_ticket
  ON mobile_push_attempts(provider_ticket_id) WHERE provider_ticket_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mobile_push_attempts_provider_message
  ON mobile_push_attempts(provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_mobile_push_attempt_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_message IS DISTINCT FROM OLD.provider_message
     OR NEW.message_sha256 IS DISTINCT FROM OLD.message_sha256 THEN
    RAISE EXCEPTION 'mobile push attempt message is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mobile_push_attempt_message_immutable ON mobile_push_attempts;
CREATE TRIGGER mobile_push_attempt_message_immutable
BEFORE UPDATE ON mobile_push_attempts
FOR EACH ROW EXECUTE FUNCTION protect_mobile_push_attempt_message();

GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_notification_prefs TO hourkey_app;
GRANT SELECT, INSERT, UPDATE ON mobile_push_log TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_push_attempts TO hourkey_app;

COMMIT;
