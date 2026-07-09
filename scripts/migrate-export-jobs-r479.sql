-- migrate-export-jobs-r479.sql · "Export สรุป PDF ด้วย AI" (นำร่องหน้า chart · 50 ยาม/ครั้ง)
-- async job แบบเดียวกับ natal_books/palm_jobs · additive · ไม่แตะตารางเดิม
-- id types = text (ตรงกับ users.id/profiles.id · session.userId เป็น text)
-- cache: 1 (user_id,page,lang,data_hash) done ที่ยังไม่หมดอายุ = reuse ฟรี ไม่หักยาม
-- ⚠️ ห้ามรันจนกว่าเจ้านาย review + apply เอง
-- รัน (เจ้านายเท่านั้น): docker exec -i decode-postgres psql -U decode_user -d decode_db < scripts/migrate-export-jobs-r479.sql

CREATE TABLE IF NOT EXISTS export_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL,
  org_id        text,
  page          text NOT NULL,                       -- นำร่อง 'chart' (เผื่อ today/fusion/... ภายหลัง)
  lang          text NOT NULL DEFAULT 'th',          -- th/en/zh/cn/vi/ja/ko/ru/es (9 ภาษา)
  data_hash     text NOT NULL,                       -- sha256(page + lang + JSON.stringify(inputs)) · cache key
  status        text NOT NULL DEFAULT 'running',     -- running|done|error
  result        jsonb,                               -- {markdown, cover:{...}, figs:[svg...], meta:{...}}
  yam_charged   int NOT NULL DEFAULT 0,
  yam_refunded  int NOT NULL DEFAULT 0,
  error         text,
  seen_at       timestamptz,                         -- deliver-once (poll ส่ง done ครั้งเดียว)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- cache lookup + dedup (user,page,lang,data_hash) · หา done/running เดิม
CREATE INDEX IF NOT EXISTS idx_export_jobs_cache   ON export_jobs(user_id, page, lang, data_hash);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status  ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created ON export_jobs(created_at);
