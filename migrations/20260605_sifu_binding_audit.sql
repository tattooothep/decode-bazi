-- Sifu profile/packet binding audit.
-- Additive telemetry only. Old rows stay nullable and should be treated as legacy/unbound.

ALTER TABLE research_ai_messages
  ADD COLUMN IF NOT EXISTS profile_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pillars_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS packet_hash text,
  ADD COLUMN IF NOT EXISTS packet_snapshot_safe jsonb,
  ADD COLUMN IF NOT EXISTS context_hash text,
  ADD COLUMN IF NOT EXISTS prompt_hash text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS knowledge_hashes jsonb,
  ADD COLUMN IF NOT EXISTS fact_lock text,
  ADD COLUMN IF NOT EXISTS pillar_lock text,
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS thread_profile_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS history_profile_ids jsonb,
  ADD COLUMN IF NOT EXISTS identity_check_result text,
  ADD COLUMN IF NOT EXISTS prediction_phase text,
  ADD COLUMN IF NOT EXISTS prediction_rows jsonb,
  ADD COLUMN IF NOT EXISTS history_dropped_count integer,
  ADD COLUMN IF NOT EXISTS profile_binding_status text,
  ADD COLUMN IF NOT EXISTS audit_quality text;

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_packet_hash
  ON research_ai_messages (packet_hash)
  WHERE packet_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_binding_created
  ON research_ai_messages (profile_binding_status, created_at DESC)
  WHERE profile_binding_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_prediction_created
  ON research_ai_messages (prediction_phase, created_at DESC)
  WHERE prediction_phase IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_research_ai_messages_prediction_phase'
       AND conrelid = 'research_ai_messages'::regclass
  ) THEN
    ALTER TABLE research_ai_messages
      ADD CONSTRAINT chk_research_ai_messages_prediction_phase
      CHECK (prediction_phase IS NULL OR prediction_phase IN ('before_prediction','post_feedback','clarification','general'));
  END IF;
END $$;

COMMENT ON COLUMN research_ai_messages.profile_snapshot IS 'Safe profile facts captured when the answer was generated.';
COMMENT ON COLUMN research_ai_messages.pillars_snapshot IS 'Day master and pillar lock facts captured from the prompt context.';
COMMENT ON COLUMN research_ai_messages.packet_hash IS 'Hash of the safe packet evidence sent to the model.';
COMMENT ON COLUMN research_ai_messages.packet_snapshot_safe IS 'Redacted/safe packet evidence, not the full prompt.';
COMMENT ON COLUMN research_ai_messages.context_hash IS 'Hash of the rendered BaZi context.';
COMMENT ON COLUMN research_ai_messages.prompt_hash IS 'Hash of the rendered prompt when a model was spawned.';
COMMENT ON COLUMN research_ai_messages.thread_id IS 'Client/server thread id used for this Q&A turn.';
COMMENT ON COLUMN research_ai_messages.identity_check_result IS 'Result of Sifu identity-lock for this answer.';
COMMENT ON COLUMN research_ai_messages.prediction_rows IS 'Structured prediction intent rows for before/after feedback audit.';
COMMENT ON COLUMN research_ai_messages.audit_quality IS 'Whether this row has enough evidence for profile/packet audit.';
