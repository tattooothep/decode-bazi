-- R8 ดาวจริง: "เครื่องที่ลงทะเบียนล่าสุดได้รับแจ้งเตือน" (19 ก.ย. 2569)
-- เหตุ: ลงแอพรุ่นใหม่ = รหัสติดตั้งใหม่ + โทเค็นใหม่ แต่โทเค็นของตัวที่ถูกแทนที่ยัง enabled อยู่ (ระบบรู้ว่าตายก็ต่อเมื่อ
-- ผู้ให้บริการตอบ unregistered ทีหลัง) → เงื่อนไขเดิม "ย้ายเมื่อโทเค็นหลักเดิมถูกปิด" ไม่ทำงาน สายส่งชี้แอพตัวเก่า (เกิดซ้ำ 3 ครั้ง:
-- 18 ก.ย. 13:00, 19:33 และ 19 ก.ย. 12:41) · แยก "ลงแอพใหม่" กับ "เครื่องที่สอง" จากข้อมูลที่มีไม่ได้ จึงใช้กติกาเดียวที่ถูกทั้งสองกรณี:
-- ทุกครั้งที่แอพลงทะเบียนโทเค็น (เปิดแอพ) สายส่งย้ายมาเครื่องนั้น = เครื่องที่ใช้ล่าสุดได้รับแจ้งเตือน
-- ตัวซ่อมรายนาที (hourkey_r8_repair_stale_primary_tokens) ยังทำเฉพาะเมื่อโทเค็นหลักตาย จึงไม่สลับไปมาเอง
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
   WHERE c.user_id=p_user_id AND c.primary_token_id<>p_token_id AND c.lifecycle_state='shadow'
     AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour' AND c.schema_version=1;
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
