-- Bind every new Qian confirmation sequence to one authoritative fortune draw.
-- Existing legacy casts remain NULL and continue in their isolated legacy scope.

ALTER TABLE shrine_jiaobei_casts
  ADD COLUMN IF NOT EXISTS qian_draw_id varchar(39);

ALTER TABLE shrine_jiaobei_casts
  DROP CONSTRAINT IF EXISTS shrine_jiaobei_casts_qian_draw_id_check;
ALTER TABLE shrine_jiaobei_casts
  ADD CONSTRAINT shrine_jiaobei_casts_qian_draw_id_check
  CHECK (qian_draw_id IS NULL OR qian_draw_id ~ '^ritual_[0-9a-f]{32}$');

ALTER TABLE shrine_jiaobei_casts
  DROP CONSTRAINT IF EXISTS shrine_jiaobei_casts_qian_draw_owner_fkey;
ALTER TABLE shrine_jiaobei_casts
  ADD CONSTRAINT shrine_jiaobei_casts_qian_draw_owner_fkey
  FOREIGN KEY (user_id, qian_draw_id)
  REFERENCES shrine_hourkey_ritual_results(user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_jiaobei_casts_qian_draw
  ON shrine_jiaobei_casts(user_id, qian_draw_id, cast_at)
  WHERE purpose = 'qian_confirm' AND qian_draw_id IS NOT NULL;
