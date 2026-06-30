-- 30 มิ.ย. 2026 · Master Fusion history filters
-- Keep this as additive indexes only; no schema or behavior changes.

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_sifu_fusion_user_profile_created
  ON research_ai_messages (user_id, profile_id, created_at DESC)
  WHERE feature = 'sifu_fusion';

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_sifu_fusion_topic_mode_created
  ON research_ai_messages (user_id, profile_id, topic, mode, created_at DESC)
  WHERE feature = 'sifu_fusion';

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_sifu_fusion_status_created
  ON research_ai_messages (
    user_id,
    profile_id,
    (COALESCE(
      response_meta->>'fusion_status',
      CASE
        WHEN status = 'error' THEN 'fail'
        WHEN response_meta->>'degraded' = 'true' THEN 'degraded'
        ELSE 'done'
      END
    )),
    created_at DESC
  )
  WHERE feature = 'sifu_fusion';

CREATE INDEX IF NOT EXISTS idx_research_ai_messages_sifu_fusion_user_flags_created
  ON research_ai_messages (
    user_id,
    profile_id,
    (COALESCE(response_meta #>> '{user_state,pinned}', 'false')),
    (COALESCE(response_meta #>> '{user_state,favorite}', 'false')),
    created_at DESC
  )
  WHERE feature = 'sifu_fusion';
