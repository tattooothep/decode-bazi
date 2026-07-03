-- migrate-push-r380.sql · Web Push Phase C (3 ก.ค. 2026)
-- backup ก่อนรัน: /root/backups/push-r380-*/schema-before.sql
-- รัน: docker exec -i decode-postgres psql -U decode_user decode_db < scripts/migrate-push-r380.sql
-- additive ทั้งหมด (CREATE TABLE IF NOT EXISTS) · ไม่แตะตารางเดิม

-- 1) subscription ของ browser แต่ละเครื่อง (endpoint unique · user ลบ = ลบตาม)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  ua text,
  created timestamptz NOT NULL DEFAULT now(),
  last_success timestamptz,
  fail_count smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_push_subs_user ON push_subscriptions (user_id);

-- 2) การตั้งค่าแจ้งเตือนรายคน (default: fusion_done เปิดอย่างเดียว)
--    quiet_start/quiet_end = ชั่วโมง 0-23 เวลาท้องถิ่นไทย (NULL = ไม่ใช้ช่วงเงียบ)
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  day_sniper boolean NOT NULL DEFAULT false,
  daily_omens boolean NOT NULL DEFAULT false,
  fusion_done boolean NOT NULL DEFAULT true,
  promo boolean NOT NULL DEFAULT false,
  quiet_start smallint CHECK (quiet_start IS NULL OR (quiet_start >= 0 AND quiet_start <= 23)),
  quiet_end smallint CHECK (quiet_end IS NULL OR (quiet_end >= 0 AND quiet_end <= 23)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) บันทึกการข้ามส่งช่วงเงียบ (คิวข้าม · เฟส cron รายวันค่อยตัดสินใจ resend)
CREATE TABLE IF NOT EXISTS push_skip_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  tag text,
  reason text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_push_skip_user ON push_skip_log (user_id, created_at DESC);

-- หมายเหตุเฟสถัดไป (ยังไม่ทำในรอบนี้):
-- * cron ยิงรายวัน (day_sniper 07:00 / daily_omens) — sender lib พร้อมแล้ว (src/lib/push-sender.ts)
-- * resend ข้อความที่ skip ช่วงเงียบหลังพ้น quiet hours
