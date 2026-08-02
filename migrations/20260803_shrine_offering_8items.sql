-- 3 ส.ค. 2569 · ขยายชนิดของถวายศาลเจ้า 4 → 8 ชนิด (additive)
-- ⚠️ ห้ามรันอัตโนมัติ · เจ้านายรันเอง
--
-- ทำไมต้องมีไฟล์นี้:
--   ตาราง shrine_offering_grants (20260726) และ shrine_offering_refunds (20260802)
--   มี CHECK จำกัด item_id ไว้ 4 ชนิดเดิม ถ้าไม่ขยาย ซื้อของชนิดใหม่จะล้มที่ฐานข้อมูล
--   ชนิดใหม่: redCandlePair · lotusFlower · luckyOranges · catFeed (ราคา 1 ยามเท่าเดิม)
--
-- ลำดับ deploy ที่ปลอดภัย: รันไฟล์นี้ "ก่อน" สลับ release ที่มี catalog 8 ชนิด
--   (รันก่อนไม่กระทบของเดิม เพราะ CHECK ใหม่ครอบ 4 ชนิดเดิมครบ)

BEGIN;

-- ชื่อ constraint เป็นชื่ออัตโนมัติของ PostgreSQL จาก CHECK แบบ inline ในไฟล์ 20260726/20260802
ALTER TABLE shrine_offering_grants
  DROP CONSTRAINT IF EXISTS shrine_offering_grants_item_id_check;
ALTER TABLE shrine_offering_grants
  ADD CONSTRAINT shrine_offering_grants_item_id_check
  CHECK (item_id IN (
    'auspiciousLamp','teaFruitOffering','talisman','vowFulfillment',
    'redCandlePair','lotusFlower','luckyOranges','catFeed'
  ));

ALTER TABLE shrine_offering_refunds
  DROP CONSTRAINT IF EXISTS shrine_offering_refunds_item_id_check;
ALTER TABLE shrine_offering_refunds
  ADD CONSTRAINT shrine_offering_refunds_item_id_check
  CHECK (item_id IN (
    'auspiciousLamp','teaFruitOffering','talisman','vowFulfillment',
    'redCandlePair','lotusFlower','luckyOranges','catFeed'
  ));

COMMIT;
