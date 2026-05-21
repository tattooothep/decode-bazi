-- Migration · 22 พ.ค. 2026 · chart follow-up Sifu permanent history
-- Additive only · stores successful follow-up answers per logged-in user/profile.

CREATE TABLE IF NOT EXISTS chart_sifu_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  pillars_hash varchar(80) NOT NULL,
  lang varchar(8) NOT NULL DEFAULT 'th',
  lp_idx integer NOT NULL DEFAULT 0,
  cy_year integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  answer text NOT NULL,
  daymaster_profile_key varchar(40),
  chart_snapshot jsonb,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chart_sifu_history_user_created
  ON chart_sifu_history (user_id, created_at DESC)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_chart_sifu_history_user_profile_created
  ON chart_sifu_history (user_id, profile_id, created_at DESC)
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_chart_sifu_history_pillars
  ON chart_sifu_history (user_id, pillars_hash, created_at DESC)
  WHERE is_archived = false;

COMMENT ON TABLE chart_sifu_history IS 'Permanent chart follow-up Sifu Q&A history per user/profile.';
