-- Retire the legacy Yam enrichment path after C4 becomes the sole Qimen producer.
-- This is intentionally narrow, additive, and safe to rerun: removing the
-- source-facts key makes a completed row ineligible on later executions.
BEGIN;

WITH scoped AS (
  SELECT l.id
    FROM mobile_push_log l
   WHERE l.kind='yam' AND l.source_facts ? 'qimen'
   FOR UPDATE
), retired_attempts AS (
  UPDATE mobile_push_attempts a
     SET status='dead',
         next_retry_at=NULL,
         lease_token=NULL,
         lease_expires_at=NULL,
         next_receipt_at=NULL,
         last_error='legacy_yam_qimen_cutover_retired',
         updated_at=now()
    FROM scoped s
   WHERE a.push_log_id=s.id
     AND a.status IN ('reserved','retry_due','provider_accepted')
  RETURNING a.id
)
UPDATE mobile_push_log l
   SET body=split_part(body, E'\n', 1),
       source_facts=source_facts-'qimen',
       delivery_status=CASE WHEN delivery_status='pending' THEN 'failed' ELSE delivery_status END,
       next_retry_at=NULL,
       last_error='legacy_yam_qimen_cutover_retired',
       attempts_retired_at=COALESCE(attempts_retired_at, now()),
       updated_at=now()
  FROM scoped s
 WHERE l.id=s.id;

COMMIT;
