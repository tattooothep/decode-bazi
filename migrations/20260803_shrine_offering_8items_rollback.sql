-- ถอยกลับไฟล์ 20260803_shrine_offering_8items.sql (กลับไปจำกัด 4 ชนิดเดิม)
-- ⚠️ ถอยได้ก็ต่อเมื่อ "ไม่มีแถวของชนิดใหม่" ค้างอยู่ในทั้งสองตาราง
--    (ADD CONSTRAINT จะ validate แถวเดิมทั้งหมด ถ้ามีชนิดใหม่ค้าง จะล้มทั้งก้อนเอง = fail closed)

BEGIN;

-- ด่านตรวจก่อนถอย: มีของ/บันทึกคืนชนิดใหม่ค้างอยู่ = ห้ามถอย
DO $$
DECLARE
  leftover_count integer;
BEGIN
  SELECT (
    (SELECT COUNT(*) FROM shrine_offering_grants
      WHERE item_id IN ('redCandlePair','lotusFlower','luckyOranges','catFeed'))
    +
    (SELECT COUNT(*) FROM shrine_offering_refunds
      WHERE item_id IN ('redCandlePair','lotusFlower','luckyOranges','catFeed'))
  ) INTO leftover_count;
  IF leftover_count > 0 THEN
    RAISE EXCEPTION 'rollback_blocked: ยังมีแถวชนิดใหม่ค้างอยู่ % แถว ถอยไม่ได้', leftover_count;
  END IF;
END;
$$;

ALTER TABLE shrine_offering_grants
  DROP CONSTRAINT IF EXISTS shrine_offering_grants_item_id_check;
ALTER TABLE shrine_offering_grants
  ADD CONSTRAINT shrine_offering_grants_item_id_check
  CHECK (item_id IN ('auspiciousLamp','teaFruitOffering','talisman','vowFulfillment'));

ALTER TABLE shrine_offering_refunds
  DROP CONSTRAINT IF EXISTS shrine_offering_refunds_item_id_check;
ALTER TABLE shrine_offering_refunds
  ADD CONSTRAINT shrine_offering_refunds_item_id_check
  CHECK (item_id IN ('auspiciousLamp','teaFruitOffering','talisman','vowFulfillment'));

COMMIT;
