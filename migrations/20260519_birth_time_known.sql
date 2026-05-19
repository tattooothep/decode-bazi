-- Migration · 19 พ.ค. 2026 · Option α · "No-hour mode"
-- Codex-approved · additive only · reversible

-- Forward
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_time_known boolean DEFAULT true;
COMMENT ON COLUMN profiles.birth_time_known IS 'false = user ไม่ทราบเวลาเกิด · ระบบ skip เสายาม (Option α)';
ALTER TABLE aj_user_profiles ALTER COLUMN hour_pillar DROP NOT NULL;

-- Rollback (manual · ห้าม drop column ถ้ามี row ใช้แล้ว)
-- ALTER TABLE profiles DROP COLUMN IF EXISTS birth_time_known;
-- UPDATE aj_user_profiles SET hour_pillar = '甲子' WHERE hour_pillar IS NULL;
-- ALTER TABLE aj_user_profiles ALTER COLUMN hour_pillar SET NOT NULL;
