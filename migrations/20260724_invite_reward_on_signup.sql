-- 20260724_invite_reward_on_signup.sql · วงจรเชิญเพื่อน เวฟ 4 (ปรับจังหวะจ่ายยาม)
-- เพิ่มใหม่ล้วน (additive) — ไม่ทับตารางเดิม ไม่แตะ ref_* ไม่แตะ affiliate_*
--
-- เปลี่ยนนโยบาย (เจ้านายเคาะ 24 ก.ค.):
--   เดิม  ยามคนเชิญออกตอน "เพื่อนยืนยันวันเกิด" (confirmed) → คนกรอกเล่นๆ ปั่นได้
--   ใหม่  ยามทั้งสองฝั่งออกตอน "เพื่อนสมัครบัญชีจริง" (ผูก user id) → status = 'rewarded'
--
-- ต้องอนุญาตสถานะใหม่ 'rewarded' ใน CHECK constraint ของตาราง invites
-- (เดิม pending | confirmed | revoked · เพิ่ม rewarded — widen เท่านั้น ไม่ลบสถานะเดิม)

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_status_check;
ALTER TABLE invites
  ADD CONSTRAINT invites_status_check
  CHECK (status IN ('pending', 'confirmed', 'revoked', 'rewarded'));

COMMENT ON COLUMN invites.status IS
  'pending=ส่งลิงก์แล้ว · confirmed=เพื่อนยืนยันวันเกิด(ได้ดวงฟรี ยังไม่จ่ายยาม) · rewarded=เพื่อนสมัครบัญชีจริง จ่ายยามสองฝั่งแล้ว · revoked=ยกเลิก';
