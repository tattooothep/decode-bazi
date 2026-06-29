-- หลังบ้านเต็มระบบ: แพ็คเกจ · คูปอง · ออเดอร์ · ตั้งค่าเว็บ
-- 29 มิ.ย. 2026 · ต่อยอดของเดิม (users.tier/hour_balance/sub_expires_at + hour_transactions + ai_usage มีอยู่แล้ว)

-- แพ็คเกจ (เติมยาม / สมาชิก)
CREATE TABLE IF NOT EXISTS packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          varchar UNIQUE NOT NULL,
  name_th       varchar NOT NULL,
  name_en       varchar,
  name_zh       varchar,
  kind          varchar NOT NULL DEFAULT 'topup',   -- topup | subscription
  price_thb     integer NOT NULL DEFAULT 0,         -- ราคา (บาท)
  yam           integer NOT NULL DEFAULT 0,         -- ยามที่ได้
  bonus_yam     integer NOT NULL DEFAULT 0,         -- ยามโบนัส
  duration_days integer,                            -- อายุ (วัน) · null = ไม่หมด
  grants_tier   varchar,                            -- เปลี่ยน tier (null = ไม่เปลี่ยน)
  sort          integer NOT NULL DEFAULT 0,
  badge         varchar,                            -- ป้าย เช่น "คุ้มสุด"
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- คูปอง / โปรโมชั่น
CREATE TABLE IF NOT EXISTS coupons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar UNIQUE NOT NULL,
  kind        varchar NOT NULL DEFAULT 'bonus_yam', -- bonus_yam | percent_off | fixed_off
  value       integer NOT NULL DEFAULT 0,
  max_uses    integer,                              -- null = ไม่จำกัด
  used_count  integer NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ออเดอร์ (ประวัติซื้อ/เติม)
CREATE TABLE IF NOT EXISTS orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id   uuid REFERENCES packages(id),
  package_code varchar,
  amount_thb   integer NOT NULL DEFAULT 0,
  yam_granted  integer NOT NULL DEFAULT 0,
  coupon_code  varchar,
  status       varchar NOT NULL DEFAULT 'pending',  -- pending | paid | failed | refunded
  pay_method   varchar,                             -- mock | promptpay | stripe | manual
  pay_ref      varchar,
  note         text,
  created_at   timestamptz DEFAULT now(),
  paid_at      timestamptz
);
CREATE INDEX IF NOT EXISTS ix_orders_user   ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status, created_at DESC);

-- ตั้งค่าเว็บ (key-value)
CREATE TABLE IF NOT EXISTS app_settings (
  key        varchar PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now(),
  updated_by varchar
);

-- ค่าตั้งต้น (ON CONFLICT DO NOTHING = ไม่ทับของเดิมถ้ารันซ้ำ)
INSERT INTO app_settings(key, value) VALUES
  ('credit_start',          '500'),   -- ยามเริ่มต้นผู้ใช้ใหม่
  ('credit_chars_per_yam',  '30'),    -- กี่ตัวอักษร = 1 ยาม
  ('maintenance_mode',      'off'),   -- on | off
  ('announcement',          ''),      -- แบนเนอร์ประกาศ (ว่าง = ไม่แสดง)
  ('feature_vision',        'on'),    -- เปิด VLM แปลนบ้าน
  ('feature_fusion',        'on'),    -- เปิด fusion
  ('signup_open',           'on')     -- เปิดรับสมัคร
ON CONFLICT (key) DO NOTHING;
