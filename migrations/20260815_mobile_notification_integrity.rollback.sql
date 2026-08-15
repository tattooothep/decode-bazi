-- Schema-only rollback. Token rows disabled during forward deduplication remain
-- disabled intentionally; re-enabling ambiguous ownership would be unsafe.
BEGIN;
-- Active global ownership remains enforced during schema rollback. Dropping it
-- would make a successful rollback unsafe while historical rows are retained.
ALTER TABLE mobile_notification_prefs DROP COLUMN IF EXISTS privacy_preview;
ALTER TABLE mobile_notification_prefs DROP COLUMN IF EXISTS locale;
COMMIT;
