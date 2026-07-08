-- palm_readings: profile_id (บันทึกลายมือเข้าดวงคนใน network) · r478
ALTER TABLE palm_readings ADD COLUMN IF NOT EXISTS profile_id uuid;
CREATE INDEX IF NOT EXISTS idx_palm_readings_profile ON palm_readings(profile_id, created_at DESC);
