-- Sifu source/classics sidecar audit.
-- Additive telemetry only. This table records what source catalog/chunks were
-- selected/included outside the model answer. It must not be used as prompt
-- content and does not require AI self-reporting.

CREATE TABLE IF NOT EXISTS research_ai_source_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_ai_message_id uuid NULL REFERENCES research_ai_messages(id) ON DELETE SET NULL,
  audit_run_id text NOT NULL,
  org_id uuid NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  profile_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  route text,
  mode text,
  topic text,
  lang text NOT NULL DEFAULT 'th',
  model text,
  cached boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ok',
  error text,
  prompt_hash text,
  context_hash text,
  packet_hash text,
  answer_hash text,
  candidate_plan_hash text,
  source_manifest_hash text NOT NULL,
  prompt_source_map_hash text,
  router_hash text,
  source_manifest jsonb NOT NULL,
  included_sources jsonb NOT NULL,
  preselected_sources jsonb,
  selected_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  selection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_supported_by jsonb,
  model_claimed_used jsonb,
  request_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_ai_source_audits
  ADD COLUMN IF NOT EXISTS candidate_plan_hash text,
  ADD COLUMN IF NOT EXISTS router_hash text,
  ADD COLUMN IF NOT EXISTS selected_chunk_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_research_ai_source_audits_created
  ON research_ai_source_audits (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_ai_source_audits_message
  ON research_ai_source_audits (research_ai_message_id)
  WHERE research_ai_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_ai_source_audits_manifest
  ON research_ai_source_audits (source_manifest_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_ai_source_audits_profile_created
  ON research_ai_source_audits (profile_id, created_at DESC)
  WHERE profile_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_research_ai_source_audits_status'
       AND conrelid = 'research_ai_source_audits'::regclass
  ) THEN
    ALTER TABLE research_ai_source_audits
      ADD CONSTRAINT chk_research_ai_source_audits_status
      CHECK (status IN ('ok','error','shadow','posthoc'));
  END IF;
END $$;

COMMENT ON TABLE research_ai_source_audits IS 'Sidecar audit of Sifu source/classics selection and inclusion. Does not affect model prompts or answers.';
COMMENT ON COLUMN research_ai_source_audits.audit_run_id IS 'Deterministic or caller-supplied id for joining source audit work before/after answer logging.';
COMMENT ON COLUMN research_ai_source_audits.prompt_hash IS 'Hash of the actual runtime prompt when available. Null when no runtime prompt was built.';
COMMENT ON COLUMN research_ai_source_audits.candidate_plan_hash IS 'Hash of the shadow candidate source plan. Separate from prompt_hash; never used as a prompt_hash fallback.';
COMMENT ON COLUMN research_ai_source_audits.source_manifest_hash IS 'Hash of the ordered source manifest, including selected/included flags and selection reasons.';
COMMENT ON COLUMN research_ai_source_audits.prompt_source_map_hash IS 'Hash of source ids and prompt segment hashes in the order they were included.';
COMMENT ON COLUMN research_ai_source_audits.router_hash IS 'Hash of router-side source selection output. Sidecar proof only; not model self-report.';
COMMENT ON COLUMN research_ai_source_audits.included_sources IS 'Sources actually included in the prompt/source pack; stores metadata and hashes, not full text.';
COMMENT ON COLUMN research_ai_source_audits.preselected_sources IS 'Router/source-selection decisions and reasons before prompt assembly.';
COMMENT ON COLUMN research_ai_source_audits.selected_chunk_ids IS 'Ordered router-selected chunk ids for this audit run. Sidecar proof only; not model self-report.';
COMMENT ON COLUMN research_ai_source_audits.selection_reasons IS 'Ordered router-side reasons aligned by index with selected_chunk_ids.';
COMMENT ON COLUMN research_ai_source_audits.answer_supported_by IS 'Post-hoc answer-source support audit, if run. Not proof of model cognition.';
COMMENT ON COLUMN research_ai_source_audits.model_claimed_used IS 'Optional model self-report. Treated as claim, not proof.';
