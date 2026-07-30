-- ⑦ โคมถวายชื่อ 30 วัน (dedication lanterns) — r525 additive
-- ผู้ใช้จ่ายยามถวายโคมแดงแขวนชายคาวิหาร พร้อมป้ายชื่อทอง 30 วัน
-- pattern เดียวกับ 20260726_shrine_offering_shop.sql

BEGIN;

CREATE TABLE IF NOT EXISTS shrine_dedication_lanterns (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedication_name text NOT NULL
    CHECK (char_length(dedication_name) BETWEEN 1 AND 40),
  blessing text NOT NULL DEFAULT ''
    CHECK (char_length(blessing) <= 120),
  charged_yam integer NOT NULL CHECK (charged_yam > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  idempotency_key varchar(40) NOT NULL
    CHECK (idempotency_key ~ '^lantern_[0-9a-f]{32}$'),
  lantern_slot integer NOT NULL CHECK (lantern_slot >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > starts_at),
  UNIQUE (user_id, idempotency_key)
);

-- list โคม active ทั้งวัด: กรอง expires_at แล้วเรียงใหม่สุดก่อน
CREATE INDEX IF NOT EXISTS idx_shrine_dedication_lanterns_active
  ON shrine_dedication_lanterns(expires_at, starts_at DESC);

-- นับโคม active ต่อ user (เพดาน 3 ดวง) + list ของเราเสมอ
CREATE INDEX IF NOT EXISTS idx_shrine_dedication_lanterns_user
  ON shrine_dedication_lanterns(user_id, expires_at, starts_at DESC);

-- โคมเป็น record ถาวร: ไม่มี state transition — runtime role ห้าม UPDATE/DELETE
REVOKE ALL PRIVILEGES ON TABLE shrine_dedication_lanterns FROM hourkey_app;
GRANT SELECT, INSERT ON shrine_dedication_lanterns TO hourkey_app;

COMMIT;
