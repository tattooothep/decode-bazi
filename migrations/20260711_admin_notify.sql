-- แจ้งเตือนหลังบ้านถึงมือถือแอดมิน (web push) · 11 ก.ค. 2026 · r497
-- additive ทั้งหมด (CREATE TABLE IF NOT EXISTS) · ไม่แตะตารางเดิม
-- ใช้คู่กับ push_subscriptions เดิม (เฟส C r380) — แอดมิน subscribe เครื่องตัวเองแบบเดียวกับ user
-- รัน: docker exec -i decode-postgres psql -U decode_user decode_db < migrations/20260711_admin_notify.sql

-- 1) การตั้งค่าแจ้งเตือนต่อแอดมิน ต่อเหตุการณ์
--    event_type: user_signup (สมัครใหม่) · order_paid (เติมแพ็คเกจ) · job_fail_spike (งานพังผิดปกติ)
--    ไม่มี row = ปิด (แอดมินต้องเปิดเองที่ /admin/notify)
CREATE TABLE IF NOT EXISTS admin_notify_prefs (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('user_signup', 'order_paid', 'job_fail_spike')),
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

-- 2) log กันส่งซ้ำ (idempotent ด้วย UNIQUE (event_type, ref_id))
--    ref_id: user_signup → users.id · order_paid → orders.id · job_fail_spike → bucket เวลา 10 นาที
CREATE TABLE IF NOT EXISTS admin_notify_log (
  id         bigserial PRIMARY KEY,
  event_type text NOT NULL,
  ref_id     text NOT NULL,
  detail     jsonb,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, ref_id)
);
CREATE INDEX IF NOT EXISTS ix_admin_notify_log_sent ON admin_notify_log (sent_at DESC);
