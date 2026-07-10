-- Admin P1: tickets, session revoke, credit policies, kill switches
-- Additive only · do not touch affiliate_* tables

-- Soft session revoke (JWT carries sv; bump invalidates old tokens)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

-- Support tickets (inbox)
CREATE TABLE IF NOT EXISTS support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  email           varchar(320),
  subject         text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  status          varchar(24) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','pending','resolved','closed')),
  priority        varchar(16) NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  channel         varchar(24) NOT NULL DEFAULT 'admin'
                    CHECK (channel IN ('admin','email','line','inapp','system')),
  assignee_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_support_tickets_user ON support_tickets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  author_type varchar(16) NOT NULL DEFAULT 'admin'
                CHECK (author_type IN ('admin','user','system')),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_support_ticket_messages_ticket
  ON support_ticket_messages(ticket_id, created_at);

-- Role credit caps (ops can be higher than support)
INSERT INTO admin_action_policies(perm_key, max_abs_delta, daily_cap, require_note, meta)
VALUES
  ('admin.users.credit.adjust', 500, 2000, true, '{"role_caps":{"support":{"max_abs":500,"daily":2000},"ops":{"max_abs":5000,"daily":20000},"finance":{"max_abs":0,"daily":0}}}'::jsonb)
ON CONFLICT (perm_key) DO UPDATE SET
  meta = COALESCE(admin_action_policies.meta, '{}'::jsonb) || EXCLUDED.meta;

-- Feature kill switches + AI cost gate
INSERT INTO app_settings(key, value) VALUES
  ('feature_sifu', 'on'),
  ('feature_qimen_sifu', 'on'),
  ('feature_palmistry', 'on'),
  ('ai_kill_switch', 'off')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE support_tickets IS 'P1 admin support inbox · not affiliate';

CREATE TABLE IF NOT EXISTS admin_impersonation_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,
  ended_at        timestamptz,
  ip_address      text,
  user_agent      text
);
