-- Schema-only rollback. Token rows disabled during forward deduplication remain
-- disabled intentionally; re-enabling ambiguous ownership would be unsafe.
BEGIN;
DROP TABLE IF EXISTS mobile_push_attempts;
DROP FUNCTION IF EXISTS protect_mobile_push_attempt_message();
UPDATE mobile_push_log SET delivery_status='accepted' WHERE delivery_status='delivered';
ALTER TABLE mobile_push_log
  DROP CONSTRAINT IF EXISTS mobile_push_log_delivery_status_check;
ALTER TABLE mobile_push_log
  ADD CONSTRAINT mobile_push_log_delivery_status_check
  CHECK (delivery_status IN ('pending', 'accepted', 'failed'));
-- Active global ownership remains enforced during schema rollback. Dropping it
-- would make a successful rollback unsafe while historical rows are retained.
ALTER TABLE mobile_notification_prefs DROP COLUMN IF EXISTS privacy_preview;
ALTER TABLE mobile_notification_prefs DROP COLUMN IF EXISTS locale;
ALTER TABLE mobile_push_log DROP COLUMN IF EXISTS source_facts;
COMMIT;
