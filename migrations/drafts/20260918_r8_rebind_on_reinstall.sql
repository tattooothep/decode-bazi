-- R8 ดาวจริง: ย้ายสายส่งเมื่อ "ลงแอพใหม่" (18 ก.ย. 2569)
-- เหตุ: hourkey_r8_rebind_primary_token เดิมย้ายเฉพาะเมื่อรหัสติดตั้งเดิม (โทเค็นหมุนในเครื่องเดิม)
-- ลงแอพใหม่ = รหัสติดตั้งใหม่ + โทเค็นเก่าถูกปิด → สายส่งชี้โทเค็นตาย → ตัวสร้างยามคัดผู้รับไม่เจอ → แจ้งเตือนเงียบ
-- (เกิดจริงกับเจ้านาย 18 ก.ย. 13:00–18:55) · ฉบับนี้เพิ่มเงื่อนไข: โทเค็นหลักเดิมถูกปิดแล้ว = ย้ายมาเครื่องที่เพิ่งลงทะเบียน
-- ไม่แย่งสายส่งจากเครื่องที่โทเค็นหลักยังเปิดใช้งานอยู่ (ผู้ใช้หลายเครื่อง) · ลายเซ็น/สิทธิ์ฟังก์ชันเดิมไม่เปลี่ยน
BEGIN;
CREATE OR REPLACE FUNCTION public.hourkey_r8_rebind_primary_token(p_user_id uuid, p_installation_id uuid, p_token_id uuid, p_audience text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE affected integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mobile_push_tokens t
     WHERE t.id=p_token_id AND t.user_id=p_user_id AND t.installation_id=p_installation_id
       AND t.astronomy_fact_audience_binding=p_audience AND t.enabled=true
  ) THEN
    RAISE EXCEPTION 'r8_primary_token_binding_invalid' USING ERRCODE='23514';
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _r8_rebind_chains (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _r8_rebind_chains;
  INSERT INTO _r8_rebind_chains
  SELECT c.id
    FROM public.mobile_science_notification_chains c
    LEFT JOIN public.mobile_push_tokens prior ON prior.id=c.primary_token_id
   WHERE c.user_id=p_user_id AND c.primary_token_id<>p_token_id AND c.lifecycle_state='shadow'
     AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour' AND c.schema_version=1
     AND (c.primary_installation_id=p_installation_id          -- โทเค็นหมุนในเครื่องเดิม (พฤติกรรมเดิม)
          OR prior.id IS NULL OR prior.enabled=false);         -- ลงแอพใหม่: โทเค็นหลักเดิมถูกปิดแล้ว
  DELETE FROM public.mobile_science_notification_endpoints e
   USING _r8_rebind_chains r WHERE e.chain_id=r.id;
  UPDATE public.mobile_science_notification_chains c
     SET primary_token_id=p_token_id,primary_installation_id=p_installation_id,
         target_revision=c.target_revision+1,updated_at=now()
    FROM _r8_rebind_chains r WHERE c.id=r.id;
  INSERT INTO public.mobile_science_notification_endpoints
    (chain_id,token_id,installation_id,audience_binding,target_revision,primary_endpoint,active)
  SELECT c.id,p_token_id,p_installation_id,p_audience,c.target_revision,true,true
    FROM public.mobile_science_notification_chains c
    JOIN _r8_rebind_chains r ON r.id=c.id
  ON CONFLICT(chain_id,installation_id) DO UPDATE SET
    token_id=EXCLUDED.token_id,audience_binding=EXCLUDED.audience_binding,
    target_revision=EXCLUDED.target_revision,primary_endpoint=true,active=true,updated_at=now();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$function$;
COMMIT;
