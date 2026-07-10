-- r481+ · บันทึก fingerprint ตอนสมัคร (hash เท่านั้น · ไม่เก็บ IP ดิบ)
-- ใช้ให้หลังบ้านเห็นเครื่อง/IP ซ้ำ · ยังไม่บล็อกสมัคร
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip_hash character varying(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_device_hash character varying(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ua text;

CREATE INDEX IF NOT EXISTS ix_users_signup_ip_hash
  ON users (signup_ip_hash) WHERE signup_ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_signup_device_hash
  ON users (signup_device_hash) WHERE signup_device_hash IS NOT NULL;
