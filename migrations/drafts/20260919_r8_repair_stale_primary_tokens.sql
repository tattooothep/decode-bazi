-- R8 ดาวจริง: ซ่อมการผูกเครื่องเอง (19 ก.ย. 2569)
-- เหตุ: 18 ก.ย. 19:33 ลงแอพใหม่ ตอนลงทะเบียนโทเค็นใหม่ โทเค็นเก่ายังเปิดอยู่ (ถูกปิดทีหลัง 19:35 โดยเส้นทางที่ไม่เรียกตัวย้าย)
-- → hourkey_r8_rebind_primary_token ไม่ย้าย → ยาม 20:00 หาย จนเปิดแอพอีกครั้ง 02:50
-- ตัวสร้างยามเรียกฟังก์ชันนี้ทุกนาที: สายส่งที่โทเค็นหลักตาย/หาย → ย้ายไปโทเค็นล่าสุดที่เปิดอยู่ของผู้ใช้คนเดิม
BEGIN;
CREATE OR REPLACE FUNCTION public.hourkey_r8_repair_stale_primary_tokens()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
DECLARE r record; repaired integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (c.id) c.user_id, t.id AS token_id, t.installation_id, t.astronomy_fact_audience_binding AS aud
      FROM public.mobile_science_notification_chains c
      LEFT JOIN public.mobile_push_tokens prior ON prior.id=c.primary_token_id
      JOIN public.mobile_push_tokens t ON t.user_id=c.user_id AND t.enabled=true
       AND t.device_push_token IS NOT NULL AND t.astronomy_fact_payload_schema=1
       AND t.astronomy_fact_audience_binding IS NOT NULL
     WHERE c.science_id='astronomy_fact' AND c.submode='civil_two_hour' AND c.schema_version=1
       AND c.lifecycle_state='shadow' AND (prior.id IS NULL OR prior.enabled=false)
     ORDER BY c.id, t.last_registered_at DESC NULLS LAST
  LOOP
    PERFORM public.hourkey_r8_rebind_primary_token(r.user_id, r.installation_id, r.token_id, r.aud);
    repaired := repaired + 1;
  END LOOP;
  RETURN repaired;
END;
$function$;
REVOKE ALL ON FUNCTION public.hourkey_r8_repair_stale_primary_tokens() FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hourkey_app') THEN
  GRANT EXECUTE ON FUNCTION public.hourkey_r8_repair_stale_primary_tokens() TO hourkey_app; END IF; END $$;
COMMIT;
