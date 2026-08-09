DROP INDEX IF EXISTS idx_jiaobei_casts_qian_draw;
ALTER TABLE shrine_jiaobei_casts
  DROP CONSTRAINT IF EXISTS shrine_jiaobei_casts_qian_draw_owner_fkey;
ALTER TABLE shrine_jiaobei_casts
  DROP CONSTRAINT IF EXISTS shrine_jiaobei_casts_qian_draw_id_check;
ALTER TABLE shrine_jiaobei_casts
  DROP COLUMN IF EXISTS qian_draw_id;
