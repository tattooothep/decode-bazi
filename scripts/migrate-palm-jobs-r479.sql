-- migrate-palm-jobs-r479.sql · ศาสตร์ที่ 7 ลายมือ → async job (งานวิ่งต่อฝั่ง server แม้ user พับจอ/ปิดแอป)
-- เลียนแบบ fusion5_jobs ทุกประการ · guest ใช้ได้ (user_id NULL) · ไม่มี yam/credit (ลายมือไม่คิดยาม)
-- ⚠️ ห้ามรันจนกว่าเจ้านาย review + apply เอง

CREATE TABLE IF NOT EXISTS palm_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NULL,           -- null = guest (ลายมืออ่านได้โดยไม่ต้อง login)
  org_id  text NULL,
  status  text NOT NULL DEFAULT 'running',  -- running|done|error
  lang    text,
  job_dir text,                -- โฟลเดอร์รูปชั่วคราวสำหรับ background (/var/tmp/palm-jobs/<id>) · ลบทิ้งหลังอ่านเสร็จ
  image_count int DEFAULT 0,
  result  jsonb,               -- {ok,engine,lang,clarity_hints,reading,reshoot,image_count}
  engine  text,
  error   text,
  seen_at timestamptz NULL,    -- deliver-once (poll ส่ง done ครั้งเดียว)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_palm_jobs_status ON palm_jobs(status);
CREATE INDEX IF NOT EXISTS idx_palm_jobs_created ON palm_jobs(created_at);
