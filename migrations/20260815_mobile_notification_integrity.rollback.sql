-- Schema-only rollback. Token rows disabled during forward deduplication remain
-- disabled intentionally; re-enabling ambiguous ownership would be unsafe.
BEGIN;
DROP INDEX IF EXISTS ux_mobile_push_tokens_active_native;
DROP INDEX IF EXISTS ux_mobile_push_tokens_active_installation;
ALTER TABLE mobile_notification_prefs DROP COLUMN IF EXISTS privacy_preview;
-- Do not delete audit rows merely to recreate the old constraint. If no
-- rotation history exists, restore the original compatibility constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mobile_push_tokens'::regclass
       AND conname = 'mobile_push_tokens_user_id_installation_id_key'
  ) AND NOT EXISTS (
    SELECT 1
      FROM mobile_push_tokens
     GROUP BY user_id, installation_id
    HAVING count(*) > 1
  ) THEN
    ALTER TABLE mobile_push_tokens
      ADD CONSTRAINT mobile_push_tokens_user_id_installation_id_key
      UNIQUE (user_id, installation_id);
  END IF;
END $$;
COMMIT;
