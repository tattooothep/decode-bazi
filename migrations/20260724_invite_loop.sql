-- 20260724_invite_loop.sql · วงจรเชิญเพื่อน (เวฟ 4)
-- เพิ่มใหม่ล้วน (additive) — ไม่แตะตารางเดิม ไม่แตะ ref_* ไม่แตะ affiliate_*
--
-- วงจร: คนเชิญสร้างลิงก์ → เพื่อนเปิดลิงก์บนเว็บ → เพื่อนกรอกวันเกิดตัวเอง
--       → เพื่อนได้ดวงฟรีทันที → คนเชิญได้ยาม (เฉพาะตอนเพื่อนยืนยันแล้ว)
--       → เพื่อนสมัคร/ล็อกอิน แล้วขอรับยามของตัวเอง
--
-- กันปั่น (บังคับที่ชั้น DB · โค้ดบังคับซ้ำอีกชั้น):
--   1. code UNIQUE + สุ่มเข้ารหัส (ไม่ผูกกับ user id)
--   2. ux_invites_friend_user  — 1 บัญชี รับเชิญได้ครั้งเดียวตลอดกาล
--   3. ux_invites_accept_device — 1 อุปกรณ์ ยืนยันวันเกิดได้ครั้งเดียว
--   4. เพดานต่อวัน/ตลอดกาล บังคับในโค้ด (อ่านค่าจาก app_settings)
--   5. การจ่ายยามใช้ hour_transactions.ref_payment_id (UNIQUE อยู่แล้ว) = จ่ายซ้ำไม่ได้

CREATE TABLE IF NOT EXISTS invites (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- โค้ดเชิญ: สุ่มแบบเข้ารหัส (crypto.randomBytes) ไม่ใช่ id ผู้ใช้
  code                     varchar(32) NOT NULL,
  inviter_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ชื่อที่คนเชิญ "ตั้งให้ตัวเอง" เพื่อโชว์บนหน้ารับเชิญ (ไม่ดึงชื่อ/อีเมลจริงจาก users)
  inviter_alias            varchar(40),
  -- ช่องในเครือข่ายของคนเชิญที่จะเอาวันเกิดจริงไปแทนที่ค่าที่เคยเดา (ไม่บังคับ)
  inviter_profile_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status                   varchar(16) NOT NULL DEFAULT 'pending',   -- pending | confirmed | revoked
  created_ip_hash          varchar(64),
  created_device_hash      varchar(64),
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,

  -- ฝั่งเพื่อน (เติมตอนเพื่อนกรอกวันเกิดตัวเองเท่านั้น)
  accepted_at              timestamptz,
  accepted_ip_hash         varchar(64),
  accepted_device_hash     varchar(64),
  friend_display_name      varchar(60),
  friend_birth_datetime    timestamptz,
  friend_birth_tz          varchar(64),
  friend_birth_time_known  boolean NOT NULL DEFAULT true,
  friend_gender            varchar(1),
  friend_birth_place       varchar(160),
  friend_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,

  -- ยามที่จ่ายไปจริง (0 = ยังไม่จ่าย) — ตัวเลขจริงอยู่ที่ hour_transactions
  inviter_reward_hours     integer NOT NULL DEFAULT 0,
  inviter_rewarded_at      timestamptz,
  friend_reward_hours      integer NOT NULL DEFAULT 0,
  friend_rewarded_at       timestamptz,

  -- ค่าวันเกิดเดิมของ profile ก่อนถูกแทนที่ (ย้อนกลับได้ · ห้ามทับข้อมูลแบบไร้ร่องรอย)
  prev_profile_birth_datetime timestamptz,
  prev_profile_birth_source   varchar(40),
  profile_updated_at          timestamptz,

  fraud_flags              jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT invites_status_check CHECK (status IN ('pending', 'confirmed', 'revoked')),
  CONSTRAINT invites_no_self_friend CHECK (friend_user_id IS NULL OR friend_user_id <> inviter_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_code ON invites (code);
CREATE INDEX IF NOT EXISTS ix_invites_inviter ON invites (inviter_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_invites_inviter_status ON invites (inviter_user_id, status);
-- 1 บัญชีรับเชิญได้ครั้งเดียวตลอดกาล
CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_friend_user ON invites (friend_user_id) WHERE friend_user_id IS NOT NULL;
-- 1 อุปกรณ์ยืนยันวันเกิดได้ครั้งเดียว (กันเปิดลิงก์ตัวเองรัวๆ)
CREATE UNIQUE INDEX IF NOT EXISTS ux_invites_accept_device ON invites (accepted_device_hash) WHERE accepted_device_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_invites_accept_ip ON invites (accepted_ip_hash, accepted_at DESC) WHERE accepted_ip_hash IS NOT NULL;

COMMENT ON TABLE invites IS 'วงจรเชิญเพื่อน r525 · ยามออกเฉพาะตอนอีกฝ่ายยืนยันวันเกิดตัวเองแล้ว';
