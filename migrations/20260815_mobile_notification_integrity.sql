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

ALTER TABLE mobile_notification_prefs
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_locale_check;
ALTER TABLE mobile_notification_prefs
  ADD CONSTRAINT mobile_notification_prefs_locale_check
  CHECK (locale IN ('th', 'en', 'zh', 'cn', 'vi', 'ja', 'ru', 'ko', 'es'));

GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_notification_prefs TO hourkey_app;

COMMIT;
