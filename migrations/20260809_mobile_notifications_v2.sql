BEGIN;

-- Provider-aware native registration. Android uses its FCM token directly;
-- iOS keeps its APNs token for diagnostics while delivery uses the Expo token
-- until an APNs provider is configured server-side.
ALTER TABLE mobile_push_tokens
  ADD COLUMN IF NOT EXISTS device_token_type text,
  ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE mobile_push_tokens
  DROP CONSTRAINT IF EXISTS mobile_push_tokens_device_token_type_check;
ALTER TABLE mobile_push_tokens
  ADD CONSTRAINT mobile_push_tokens_device_token_type_check
  CHECK (device_token_type IS NULL OR device_token_type IN ('fcm', 'apns'));

CREATE INDEX IF NOT EXISTS ix_mobile_push_tokens_native_enabled
  ON mobile_push_tokens(platform, device_token_type, enabled)
  WHERE enabled = true;

-- Eight product categories. Security and service are transactional and remain
-- enabled; the six advisory categories require explicit opt-in.
ALTER TABLE mobile_notification_prefs
  ADD COLUMN IF NOT EXISTS security_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saved_date_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qimen_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS yam_min_quality text NOT NULL DEFAULT 'best',
  ADD COLUMN IF NOT EXISTS yam_lead_minutes smallint NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS daily_slot text NOT NULL DEFAULT 'morning',
  ADD COLUMN IF NOT EXISTS qimen_latitude double precision,
  ADD COLUMN IF NOT EXISTS qimen_longitude double precision,
  ADD COLUMN IF NOT EXISTS qimen_location_updated_at timestamptz;

-- Preserve existing consent exactly once. Keeping this in an existence guard
-- makes the whole migration safe to rerun without overwriting later choices.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'mobile_notification_prefs'
       AND column_name = 'shrine_enabled'
  ) THEN
    ALTER TABLE mobile_notification_prefs
      ADD COLUMN shrine_enabled boolean NOT NULL DEFAULT false;
    UPDATE mobile_notification_prefs SET shrine_enabled = auspicious_enabled;
  END IF;
END $$;

ALTER TABLE mobile_notification_prefs
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_yam_min_quality_check,
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_yam_lead_minutes_check,
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_daily_slot_check,
  DROP CONSTRAINT IF EXISTS mobile_notification_prefs_qimen_location_check;
ALTER TABLE mobile_notification_prefs
  ADD CONSTRAINT mobile_notification_prefs_yam_min_quality_check
    CHECK (yam_min_quality IN ('best', 'good')),
  ADD CONSTRAINT mobile_notification_prefs_yam_lead_minutes_check
    CHECK (yam_lead_minutes IN (15, 30, 60)),
  ADD CONSTRAINT mobile_notification_prefs_daily_slot_check
    CHECK (daily_slot IN ('morning', 'evening', 'both')),
  ADD CONSTRAINT mobile_notification_prefs_qimen_location_check
    CHECK (
      (qimen_latitude IS NULL AND qimen_longitude IS NULL)
      OR (qimen_latitude BETWEEN -90 AND 90 AND qimen_longitude BETWEEN -180 AND 180)
    );

-- A log row is visible to users and counts toward the daily cap only after at
-- least one provider accepted it. Failed reservations can be retried safely.
ALTER TABLE mobile_push_log
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE mobile_push_log
   SET accepted_at = COALESCE(accepted_at, sent_at)
 WHERE delivery_status = 'accepted' AND accepted_at IS NULL;

ALTER TABLE mobile_push_log
  DROP CONSTRAINT IF EXISTS mobile_push_log_delivery_status_check;
ALTER TABLE mobile_push_log
  ADD CONSTRAINT mobile_push_log_delivery_status_check
    CHECK (delivery_status IN ('pending', 'accepted', 'failed'));

CREATE INDEX IF NOT EXISTS ix_mobile_push_log_user_accepted
  ON mobile_push_log(user_id, sent_at DESC)
  WHERE delivery_status = 'accepted';
CREATE INDEX IF NOT EXISTS ix_mobile_push_log_retry
  ON mobile_push_log(next_retry_at)
  WHERE delivery_status = 'failed';

GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_push_tokens TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_notification_prefs TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_push_log TO hourkey_app;

COMMIT;
