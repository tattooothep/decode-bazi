-- แจ้งเตือนสรุปดวงเช้า AI fusion (goal สาย ข · 6 ก.ย. 2569)
-- snapshot สรุปดวงรายวันต่อคนต่อดวง สร้างกลางคืน → ตัวยิงเช้าหยิบไปส่ง →
-- หน้าอ่านในแอพเปิดจาก snapshot เดิม ไม่คำนวณใหม่
-- additive ล้วน: ตารางใหม่ ไม่มี FK cascade ไปตารางเดิม ไม่แตะ schema เดิม

CREATE TABLE IF NOT EXISTS mobile_daily_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  forecast_date date NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  -- ผลเครื่องยนต์ที่ใช้สร้าง (แต้ม/ยาม/ทิศ/เหมาะ-ห้าม) — หน้าอ่านใช้ส่วนนี้แสดงตัวเลข
  facts jsonb NOT NULL,
  facts_digest text NOT NULL CHECK (facts_digest ~ '^[a-f0-9]{64}$'),
  -- คำ AI 3 ภาษา {th,en,zh} ผ่าน validator แล้วเท่านั้น (ฟันธง/ชีวิต5ด้าน/ควรทำ-เลี่ยง/เหตุผลรายศาสตร์)
  summary jsonb,
  model text NOT NULL DEFAULT 'claude-max-cli',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_daily_ai_summaries_ready_has_summary
    CHECK (status <> 'ready' OR summary IS NOT NULL),
  UNIQUE (user_id, profile_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS mobile_daily_ai_summaries_date_idx
  ON mobile_daily_ai_summaries (forecast_date);
