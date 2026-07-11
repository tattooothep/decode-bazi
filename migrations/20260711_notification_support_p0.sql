-- P0 Admin Notifications + Two-way Support Inbox
-- Additive migration. No astrology, pricing, credit, or payment fulfillment changes.

ALTER TABLE support_reports
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

UPDATE support_reports
   SET last_message_at = COALESCE(last_message_at, created_at)
 WHERE last_message_at IS NULL;

CREATE TABLE IF NOT EXISTS support_report_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id bigint NOT NULL REFERENCES support_reports(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('user','admin','system')),
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  client_message_id text,
  read_by_user_at timestamptz,
  read_by_admin_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_support_report_messages_thread
  ON support_report_messages(report_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_support_report_messages_client
  ON support_report_messages(report_id, author_type, client_message_id)
  WHERE client_message_id IS NOT NULL;

INSERT INTO support_report_messages
  (report_id, author_type, author_user_id, visibility, body, client_message_id,
   read_by_user_at, created_at)
SELECT r.id, 'user', CASE WHEN r.user_id ~* '^[0-9a-f-]{36}$' THEN r.user_id::uuid ELSE NULL END,
       'public', r.message, 'legacy-initial-' || r.id::text, r.created_at, r.created_at
  FROM support_reports r
 WHERE NOT EXISTS (SELECT 1 FROM support_report_messages m WHERE m.report_id=r.id);

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  audience_kind text NOT NULL CHECK (audience_kind IN ('admin','user')),
  audience_roles text[] NOT NULL DEFAULT '{}',
  required_permission text,
  recipient_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL UNIQUE,
  target_url text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','expanded','sent','dead')),
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_notification_events_pending
  ON notification_events(status, available_at, created_at)
  WHERE status IN ('pending','expanded');

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','sent','dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  push_status text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS ix_notification_deliveries_ready
  ON notification_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('pending','retry','processing');

CREATE TABLE IF NOT EXISTS notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_url text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS ix_notification_inbox_user
  ON notification_inbox(recipient_user_id, read_at, created_at DESC);

ALTER TABLE admin_notify_prefs
  DROP CONSTRAINT IF EXISTS admin_notify_prefs_event_type_check;
ALTER TABLE admin_notify_prefs
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'immediate';

COMMENT ON TABLE notification_events IS 'Transactional outbox for admin and user notifications';
COMMENT ON TABLE notification_deliveries IS 'Per-recipient retry/idempotency state';
COMMENT ON TABLE support_report_messages IS 'Immutable public/internal support conversation messages';

GRANT SELECT, INSERT, UPDATE, DELETE ON support_report_messages TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_events TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO hourkey_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_inbox TO hourkey_app;
