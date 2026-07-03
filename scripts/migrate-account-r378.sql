-- migrate-account-r378.sql · Account Phase 1 (3 ก.ค. 2026)
-- backup ก่อนรัน: /root/backups/account-r378-20260703-141210/users-full.sql
-- รัน: docker exec -i decode-postgres psql -U decode_user decode_db < scripts/migrate-account-r378.sql
-- additive ทั้งหมด (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS) · ไม่แตะคอลัมน์เดิม

-- 1) รูปโปรไฟล์เก็บใน DB (webp 256px · ~10-25KB/คน)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;

-- 2) PDPA soft-delete 30 วัน
--    deleted_at = เวลากดลบ · deleted_snapshot = เก็บ email/hash/oauth เดิมไว้กู้คืนโดย admin ภายใน 30 วัน
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_snapshot jsonb;

-- 3) อุปกรณ์ที่ล็อกอิน (best-effort log จาก /api/account/ping · ไม่ใช่ session store จริง)
CREATE TABLE IF NOT EXISTS user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash varchar(64) NOT NULL,
  ua text,
  ip_hash varchar(32),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_hash)
);
CREATE INDEX IF NOT EXISTS ix_user_devices_user ON user_devices (user_id, last_seen DESC);

-- หมายเหตุเฟสถัดไป (ยังไม่ทำในรอบนี้):
-- * purge จริงหลัง 30 วัน (cron: DELETE users WHERE deleted_at < now()-interval '30 days')
-- * token_version / logout ทุกเครื่อง ต้องแก้ verifySession ใน src/lib/auth.ts (LOCKED)
