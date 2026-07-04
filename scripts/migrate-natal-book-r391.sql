-- r391-book · หนังสือดวงชะตา 6 ศาสตร์ (Natal Book · 命書)
-- additive · ไม่แตะตารางเดิม · id types = text (ตรงกับ fusion5_jobs · session.userId/profileId เป็น text)
-- รัน: docker exec -i decode-postgres psql -U decode_user -d decode_db < scripts/migrate-natal-book-r391.sql
CREATE TABLE IF NOT EXISTS natal_books (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  org_id           text,
  profile_id       text NOT NULL,                 -- ดวงเจ้าของเล่ม (org-scoped)
  status           text NOT NULL DEFAULT 'running',  -- running|done|degraded|error
  lang             text NOT NULL DEFAULT 'th',
  sciences         text[] NOT NULL DEFAULT '{}',   -- ศาสตร์ที่รันจริง (หลัง filter needsBirthTime)
  result           jsonb,                          -- {version,cover,chapters[],synthesis,timing,appendix,meta}
  error            text,
  yam_charged      int NOT NULL DEFAULT 0,
  yam_refunded     int NOT NULL DEFAULT 0,
  profile_snapshot jsonb,                          -- ชื่อ/วันเกิด/เสา ณ ออกเล่ม (กันดวงถูกแก้ทีหลัง)
  seen_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_natal_books_user    ON natal_books(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_natal_books_profile ON natal_books(profile_id);
-- r397 · กันสร้างซ้ำ + เช็คเล่มล่าสุด (user,profile,lang,status) · dedup POST + GET ?profileId
CREATE INDEX IF NOT EXISTS idx_natal_books_dedup   ON natal_books(user_id, profile_id, lang, status);
