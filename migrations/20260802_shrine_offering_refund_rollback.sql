-- ถอยกลับไฟล์ 20260802_shrine_offering_refund.sql
-- ⚠️ ถอยได้ก็ต่อเมื่อ "ไม่มีการคืนยามเกิดขึ้นแล้ว" หรือยอมเก็บตารางบันทึกไว้เป็นหลักฐาน
-- ลำดับที่ปลอดภัย: ปิดสิทธิ์ลบก่อน → ค่อยพิจารณาตารางบันทึก
BEGIN;

-- 1) ตัดสิทธิ์ลบของในย่าม (กลับไปสภาพเดิมที่ลบไม่ได้)
REVOKE DELETE ON shrine_offering_grants FROM hourkey_app;
DROP TRIGGER IF EXISTS shrine_offering_grant_delete_guard ON shrine_offering_grants;
DROP FUNCTION IF EXISTS enforce_shrine_offering_grant_delete();

-- 2) ตารางบันทึกการคืน — แนะนำให้ "เก็บไว้" เพราะเป็นหลักฐานการเงิน
--    จะลบก็ต่อเมื่อไม่เคยมีแถวเลยเท่านั้น (ปลดคอมเมนต์เอง)
-- REVOKE ALL ON shrine_offering_refunds FROM hourkey_app;
-- DROP TABLE IF EXISTS shrine_offering_refunds;

COMMIT;
