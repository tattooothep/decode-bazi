-- โยนจอก (โปยปัว) 4 ส.ค. 69 — ตามพิมพ์เขียว goal 3 ส.ค.
-- casts = append-only (ลอกแบบ shrine_dedication_lanterns) · questions = ลบได้ตาม PDPA

CREATE TABLE IF NOT EXISTS shrine_jiaobei_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_text text NOT NULL CHECK (char_length(question_text) BETWEEN 1 AND 200),
  topic_key text NOT NULL DEFAULT 'general',
  deity_id text NOT NULL,
  question_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jiaobei_questions_user
  ON shrine_jiaobei_questions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shrine_jiaobei_casts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- FK อ่อนโดยตั้งใจ: คำถามลบได้ (PDPA) แต่ประวัติการโยนต้องคงอยู่
  question_id uuid,
  question_hash char(64) NOT NULL,
  deity_id text NOT NULL CHECK (deity_id ~ '^[a-z][a-z0-9-]{2,39}$'),
  topic_key text NOT NULL DEFAULT 'general',
  purpose text NOT NULL DEFAULT 'general'
    CHECK (purpose IN ('general','qian_confirm','vow')),
  qian_slip_no int CHECK (qian_slip_no BETWEEN 1 AND 60),
  attempt_no int NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
  sequence_no int NOT NULL DEFAULT 1 CHECK (sequence_no BETWEEN 1 AND 3),
  set_no int NOT NULL DEFAULT 1 CHECK (set_no BETWEEN 1 AND 5),
  server_seed char(64) NOT NULL,
  client_nonce varchar(64) NOT NULL,
  face_left text NOT NULL CHECK (face_left IN ('flat','round','standing')),
  face_right text NOT NULL CHECK (face_right IN ('flat','round','standing')),
  outcome text NOT NULL CHECK (outcome IN ('sheng','xiao','yin','li')),
  cast_at timestamptz NOT NULL DEFAULT now(),
  tz_offset_minutes int NOT NULL DEFAULT 420
    CHECK (tz_offset_minutes BETWEEN -840 AND 840),
  -- กุญแจยามท้องถิ่น YYYYMMDD-ชื่อยาม — กันถามซ้ำในยามเดียวตามธรรมเนียม
  hour_key varchar(16) NOT NULL,
  hour_branch text,
  day_ganzhi text,
  engine_version text NOT NULL DEFAULT 'jiaobei-v1',
  idempotency_key varchar(46) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^jiaobei_[0-9a-f]{32}$')
);
CREATE INDEX IF NOT EXISTS idx_jiaobei_casts_user_hour
  ON shrine_jiaobei_casts(user_id, hour_key, question_hash);
CREATE INDEX IF NOT EXISTS idx_jiaobei_casts_user_time
  ON shrine_jiaobei_casts(user_id, cast_at DESC);
CREATE INDEX IF NOT EXISTS idx_jiaobei_casts_qian
  ON shrine_jiaobei_casts(user_id, qian_slip_no, cast_at DESC)
  WHERE purpose = 'qian_confirm';

REVOKE UPDATE, DELETE ON shrine_jiaobei_casts FROM PUBLIC;
