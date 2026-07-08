-- ศาสตร์ที่ 7 · ลายมือ — เก็บผลอ่านที่ user เลือกบันทึก (เข้า fusion ต่อได้)
-- รูปฝ่ามือ (biometric) ไม่เก็บ · เก็บเฉพาะผล reading (jsonb) ที่ผ่านคัมภีร์แล้ว
CREATE TABLE IF NOT EXISTS palm_readings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  org_id      text,
  lang        text NOT NULL DEFAULT 'th',
  reading     jsonb NOT NULL,
  clarity     int,
  engine      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_palm_readings_user ON palm_readings(user_id, created_at DESC);
