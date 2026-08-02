-- 2 ส.ค. 2569 · เส้นทางคืนยามศาลเจ้า (ยกเลิกภายใน 60 วินาที) + เพดานย่าม
-- ⚠️ ห้ามรันอัตโนมัติ · เจ้านายรันเอง (แตะสิทธิ์ตารางเงิน)
--
-- ทำไมต้องมีไฟล์นี้:
--   ของเดิม 20260726_shrine_offering_shop.sql ให้สิทธิ์แค่ SELECT/INSERT/UPDATE(state,offered_at)
--   = ลบของในย่ามไม่ได้เลย ดังนั้นถึงหลังบ้านจะเติมยามคืนได้ ผู้ใช้ก็ได้ทั้งเงินทั้งของ
--   ไฟล์นี้เปิดสิทธิ์ลบ "เฉพาะของที่ยังไม่ถวาย" พร้อมตัวดักระดับฐานข้อมูล
--   และเพิ่มตารางบันทึกการคืน = คืนซ้ำไม่ได้แม้โค้ดพลาด

BEGIN;

-- ── ตารางบันทึกการคืนยาม ── เป็นทั้งหลักฐานตรวจย้อนหลังและกุญแจกันคืนซ้ำ
CREATE TABLE IF NOT EXISTS shrine_offering_refunds (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ของถูกลบไปแล้วจึงไม่ผูก foreign key กลับไปที่ shrine_offering_grants
  grant_id uuid NOT NULL UNIQUE,      -- ของหนึ่งชิ้นคืนได้ครั้งเดียวตลอดกาล
  purchase_id uuid NOT NULL UNIQUE,   -- การซื้อหนึ่งครั้งคืนได้ครั้งเดียวตลอดกาล
  item_id text NOT NULL
    CHECK (item_id IN ('auspiciousLamp','teaFruitOffering','talisman','vowFulfillment')),
  refunded_yam integer NOT NULL CHECK (refunded_yam > 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  idempotency_key varchar(39) NOT NULL
    CHECK (idempotency_key ~ '^shrine_[0-9a-f]{32}$'),
  -- กุญแจของ "การซื้อ" ที่ถูกยกเลิก · เก็บไว้กันแอพยิงคำสั่งซื้อค้างคิวซ้ำหลังคืนเงิน
  -- (ของถูกลบไปแล้ว ถ้าไม่มีร่องรอยนี้ คำสั่งซื้อเดิมจะกลายเป็นการซื้อใหม่ = หักซ้ำ)
  purchase_idempotency_key varchar(39) NOT NULL
    CHECK (purchase_idempotency_key ~ '^shrine_[0-9a-f]{32}$'),
  purchased_at timestamptz NOT NULL,
  refunded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)   -- กดยกเลิกรัวๆ ด้วยกุญแจเดิม = คืนครั้งเดียว
);

CREATE INDEX IF NOT EXISTS idx_shrine_offering_refunds_user_time
  ON shrine_offering_refunds(user_id, refunded_at DESC);

-- กุญแจซื้อหนึ่งครั้ง คืนได้ครั้งเดียว และใช้ค้นตอนซื้อซ้ำ
CREATE UNIQUE INDEX IF NOT EXISTS uq_shrine_offering_refunds_purchase_key
  ON shrine_offering_refunds(user_id, purchase_idempotency_key);

-- ── ตัวดักการลบ ── ห้ามลบของที่ถวายไปแล้วเด็ดขาด (ถวายแล้วคือถวายแล้ว)
-- ยกเว้นตอนลบบัญชีผู้ใช้ (cascade) ซึ่งแถวผู้ใช้หายไปก่อนแล้ว มิฉะนั้นลบบัญชีไม่ได้
CREATE OR REPLACE FUNCTION enforce_shrine_offering_grant_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=OLD.user_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.state='purchased' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'invalid_shrine_offering_grant_delete'
    USING ERRCODE='23514';
END;
$$;

DROP TRIGGER IF EXISTS shrine_offering_grant_delete_guard
  ON shrine_offering_grants;
CREATE TRIGGER shrine_offering_grant_delete_guard
BEFORE DELETE ON shrine_offering_grants
FOR EACH ROW
EXECUTE FUNCTION enforce_shrine_offering_grant_delete();

-- ── สิทธิ์ ── เปิด DELETE บนของในย่าม (ตัวดักข้างบนคุมว่าลบได้เฉพาะที่ยังไม่ถวาย)
GRANT DELETE ON shrine_offering_grants TO hourkey_app;
GRANT SELECT, INSERT ON shrine_offering_refunds TO hourkey_app;

-- ตรวจแล้ว 2 ส.ค.: รุ่นที่ให้บริการจริงเชื่อมฐานข้อมูลด้วยผู้ใช้ hourkey_app (PGUSER ใน .env.local ของ release)
-- จึงให้สิทธิ์ตรงกับผู้ใช้ตัวนี้ · ทดสอบจริงแล้วในฐานข้อมูลทดสอบแยก shrine_migration_ci (ลบทิ้งแล้ว)

COMMIT;
