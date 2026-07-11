-- Community news and user-reported issues.
-- Schema changes belong in migrations; the runtime DB role intentionally has no CREATE privilege.

CREATE TABLE IF NOT EXISTS news_items (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'update',
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  cta_label JSONB NOT NULL DEFAULT '{}'::jsonb,
  cta_url TEXT,
  media_url TEXT,
  video_url TEXT,
  badge TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  publish_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_public_idx
  ON news_items(active, publish_at, expires_at, sort);

CREATE TABLE IF NOT EXISTS support_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  page_path TEXT,
  locale TEXT,
  severity TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  user_agent TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_reports_status_created_idx
  ON support_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_reports_user_created_idx
  ON support_reports(user_id, created_at DESC);
