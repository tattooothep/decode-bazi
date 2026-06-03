-- Research console · volunteers/traffic/AI Q&A observability.
-- Additive only. No scoring, prompt, or engine behavior changes.

CREATE TABLE IF NOT EXISTS research_participants (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  cohort text,
  consent_at timestamptz,
  notes text,
  labels text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_research_participants_org_status
  ON research_participants (org_id, status);

CREATE TABLE IF NOT EXISTS research_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  profile_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  page_path text,
  referrer text,
  session_key text,
  ip_address text,
  user_agent text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_events_created
  ON research_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_events_org_created
  ON research_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_events_user_created
  ON research_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_events_name_created
  ON research_events (event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS research_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  profile_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  mode text,
  topic text,
  lang text NOT NULL DEFAULT 'th',
  conversation_key text,
  question text NOT NULL,
  answer text,
  history jsonb,
  request_payload jsonb,
  response_meta jsonb,
  model text,
  status text NOT NULL DEFAULT 'ok',
  error text,
  spent integer,
  balance_after integer,
  duration_ms integer,
  cached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_created
  ON research_ai_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_ai_messages_org_created
  ON research_ai_messages (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_ai_messages_user_created
  ON research_ai_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_ai_messages_feature_created
  ON research_ai_messages (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_ai_messages_conversation
  ON research_ai_messages (conversation_key, created_at DESC)
  WHERE conversation_key IS NOT NULL;

COMMENT ON TABLE research_participants IS 'Research volunteer status and notes per user.';
COMMENT ON TABLE research_events IS 'Low-cardinality research traffic/events captured from protected pages.';
COMMENT ON TABLE research_ai_messages IS 'Research Q&A log across Sifu surfaces; additive telemetry only.';
