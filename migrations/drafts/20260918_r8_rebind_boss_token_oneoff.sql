-- ผูกสายส่งดาวจริง (R8) ของเจ้านายเข้ากับโทเค็นเครื่องใหม่ (ฉบับแก้: ทำทีละขั้น — ปลดปลายทางเก่าก่อน ค่อยใส่ตัวใหม่)
-- ย้อนกลับ: /root/backups/r8-chains-endpoints-tokens-before-rebind-20260918.sql
BEGIN;
CREATE TEMP TABLE _r8_target ON COMMIT DROP AS
  SELECT c.id AS chain_id, t.id AS token_id, t.installation_id, t.astronomy_fact_audience_binding AS aud, c.target_revision + 1 AS rev
    FROM mobile_science_notification_chains c
    JOIN mobile_push_tokens t ON t.user_id = c.user_id AND t.enabled = true
     AND t.device_push_token IS NOT NULL AND t.astronomy_fact_payload_schema = 1
     AND t.astronomy_fact_audience_binding IS NOT NULL
   WHERE c.id = 'fbda117e-1d9d-491d-9880-5f03e91d1c48'
   ORDER BY t.last_registered_at DESC NULLS LAST LIMIT 1;
SELECT 'target_rows (ต้องเป็น 1)' AS check, count(*) FROM _r8_target;
-- 1) ปลดปลายทางเก่า
UPDATE mobile_science_notification_endpoints e SET active = false, primary_endpoint = false, updated_at = now()
  FROM _r8_target t WHERE e.chain_id = t.chain_id AND e.installation_id <> t.installation_id;
-- 2) ชี้สายส่งไปโทเค็น/เครื่องใหม่ + ขยับรุ่นเป้าหมาย
UPDATE mobile_science_notification_chains c
   SET primary_token_id = t.token_id, primary_installation_id = t.installation_id, target_revision = t.rev
  FROM _r8_target t WHERE c.id = t.chain_id;
-- 3) ใส่ปลายทางใหม่เป็นตัวหลัก
INSERT INTO mobile_science_notification_endpoints (chain_id, token_id, installation_id, audience_binding, target_revision, primary_endpoint, active)
SELECT chain_id, token_id, installation_id, aud, rev, true, true FROM _r8_target
ON CONFLICT (chain_id, installation_id) DO UPDATE SET token_id = EXCLUDED.token_id, audience_binding = EXCLUDED.audience_binding,
  target_revision = EXCLUDED.target_revision, primary_endpoint = true, active = true, updated_at = now();
SELECT 'eligible_now (ต้องเป็น 1)' AS check, count(*) FROM mobile_science_notification_chains c
  JOIN mobile_push_tokens t ON t.id=c.primary_token_id AND t.user_id=c.user_id AND t.installation_id=c.primary_installation_id AND t.enabled=true
  JOIN mobile_science_notification_endpoints e ON e.chain_id=c.id AND e.token_id=t.id AND e.installation_id=c.primary_installation_id
   AND e.audience_binding=t.astronomy_fact_audience_binding AND e.primary_endpoint=true AND e.active=true AND e.target_revision=c.target_revision
 WHERE c.id='fbda117e-1d9d-491d-9880-5f03e91d1c48';
COMMIT;
