-- ผลลัพธ์ 5 พิธีศาลเจ้า — 7 ส.ค. 69
-- ครอบคลุม: ตีระฆัง · ตีกลอง · เคาะปลา(木魚) · เสี่ยงเซียมซี · โยนจอกขออนุญาต
-- โยนจอกทั่วไปมีตารางเดิมอยู่แล้ว (shrine_jiaobei_questions / shrine_jiaobei_casts)
-- แฟ้มนี้ "เพิ่มใหม่ล้วน" ไม่แตะตารางเดิมแม้แต่คอลัมน์เดียว

-- ─────────────────────────────────────────────────────────────
-- 1) ตีระฆัง / ตีกลอง / เคาะปลา — บันทึกแบบเติมอย่างเดียว
--    ไม่มีการสุ่ม ผลคำนวณตรงจากจำนวนครั้งที่เคาะ จึงตรวจซ้ำได้ 100%
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shrine_ritual_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ritual text NOT NULL CHECK (ritual IN ('bell', 'drum', 'muyu')),
  -- จำนวนครั้งในรอบนี้ · เพดาน 108 ตามธรรมเนียม 108 กิเลส
  strikes int NOT NULL CHECK (strikes BETWEEN 1 AND 108),
  -- ยอดสะสมของพิธีนั้นภายในวันท้องถิ่นเดียวกัน หลังบวกรอบนี้แล้ว
  day_total int NOT NULL CHECK (day_total BETWEEN 1 AND 100000),
  session_seconds int NOT NULL DEFAULT 0 CHECK (session_seconds BETWEEN 0 AND 86400),
  -- ครบ 108 ครั้งในวันเดียว = รอบสมบูรณ์
  completed_108 boolean NOT NULL DEFAULT false,
  deity_id text NOT NULL DEFAULT 'general'
    CHECK (deity_id ~ '^[a-z][a-z0-9-]{2,39}$'),
  tz_offset_minutes int NOT NULL DEFAULT 420
    CHECK (tz_offset_minutes BETWEEN -840 AND 840),
  local_day date NOT NULL,
  hour_key varchar(16) NOT NULL,
  hour_branch text,
  day_ganzhi text,
  engine_version text NOT NULL DEFAULT 'strike-v1',
  idempotency_key varchar(45) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^strike_[0-9a-f]{32}$'),
  struck_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shrine_strikes_user_time
  ON shrine_ritual_strikes(user_id, struck_at DESC);
CREATE INDEX IF NOT EXISTS idx_shrine_strikes_user_day
  ON shrine_ritual_strikes(user_id, ritual, local_day);

-- ─────────────────────────────────────────────────────────────
-- 2) โยนจอกขออนุญาตก่อนเสี่ยงเซียมซี (ประตูตามตำรา)
--    ต้องได้ 聖筊 สามครั้งติดในชุดเดียวจึงจะจับใบได้
--    แยกตารางจากโยนจอกทั่วไป เพราะคนละวัตถุประสงค์และคนละกติกานับ
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shrine_qian_permit_casts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- รหัสรอบขออนุญาตหนึ่งรอบ (ผู้ใช้ตั้งขึ้นตอนเริ่มตั้งจิต)
  permit_session_id uuid NOT NULL,
  deity_id text NOT NULL CHECK (deity_id ~ '^[a-z][a-z0-9-]{2,39}$'),
  topic_key text NOT NULL DEFAULT 'general',
  question_hash char(64) NOT NULL,
  sequence_no int NOT NULL CHECK (sequence_no BETWEEN 1 AND 3),
  set_no int NOT NULL CHECK (set_no BETWEEN 1 AND 5),
  server_seed char(64) NOT NULL,
  client_nonce varchar(64) NOT NULL,
  face_left text NOT NULL CHECK (face_left IN ('flat', 'round', 'standing')),
  face_right text NOT NULL CHECK (face_right IN ('flat', 'round', 'standing')),
  outcome text NOT NULL CHECK (outcome IN ('sheng', 'xiao', 'yin', 'li')),
  tz_offset_minutes int NOT NULL DEFAULT 420
    CHECK (tz_offset_minutes BETWEEN -840 AND 840),
  hour_key varchar(16) NOT NULL,
  hour_branch text,
  day_ganzhi text,
  engine_version text NOT NULL DEFAULT 'qian-permit-v1',
  idempotency_key varchar(50) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^qianpermit_[0-9a-f]{32}$'),
  cast_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qian_permit_session
  ON shrine_qian_permit_casts(user_id, permit_session_id, cast_at ASC);
CREATE INDEX IF NOT EXISTS idx_qian_permit_user_time
  ON shrine_qian_permit_casts(user_id, cast_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3) ใบเซียมซีที่จับได้
--    หนึ่งรอบขออนุญาต = จับได้ใบเดียว (บังคับด้วยคีย์เดี่ยว)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shrine_qian_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permit_session_id uuid NOT NULL UNIQUE,
  slip_no int NOT NULL CHECK (slip_no BETWEEN 1 AND 60),
  deity_id text NOT NULL CHECK (deity_id ~ '^[a-z][a-z0-9-]{2,39}$'),
  topic_key text NOT NULL DEFAULT 'general',
  question_text text CHECK (question_text IS NULL OR char_length(question_text) BETWEEN 1 AND 200),
  question_hash char(64) NOT NULL,
  server_seed char(64) NOT NULL,
  client_nonce varchar(64) NOT NULL,
  tz_offset_minutes int NOT NULL DEFAULT 420
    CHECK (tz_offset_minutes BETWEEN -840 AND 840),
  hour_key varchar(16) NOT NULL,
  hour_branch text,
  day_ganzhi text,
  canon_version text NOT NULL DEFAULT '60jiazi-v1',
  engine_version text NOT NULL DEFAULT 'qian-draw-v1',
  idempotency_key varchar(48) NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^qiandraw_[0-9a-f]{32}$'),
  drawn_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qian_draws_user_time
  ON shrine_qian_draws(user_id, drawn_at DESC);

-- ประวัติพิธีเป็นหลักฐาน ห้ามแก้ย้อนหลัง
REVOKE UPDATE, DELETE ON shrine_ritual_strikes FROM PUBLIC;
REVOKE UPDATE, DELETE ON shrine_qian_permit_casts FROM PUBLIC;
REVOKE UPDATE, DELETE ON shrine_qian_draws FROM PUBLIC;
