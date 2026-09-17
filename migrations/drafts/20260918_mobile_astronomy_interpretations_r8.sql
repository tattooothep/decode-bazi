-- ตีความดาวจริงรายยาม (เจ้านายสั่ง 18 ก.ย. 2569): AI แปล "ท้องฟ้ายามนี้แปลว่าอะไรกับคุณ"
-- เทียบดวงกำเนิด (โหราตะวันตก/七政 ที่ live บนเว็บแล้ว) — ไม่ใช่กฎเลือกยาม 七政 ที่ยังล็อก
-- หนึ่งแถวต่อ occurrence · เก็บ 3 ภาษา · หน้าอ่านและแจ้งเตือนใช้ snapshot นี้ ไม่คำนวณใหม่
BEGIN;

CREATE TABLE IF NOT EXISTS mobile_astronomy_interpretations_r8 (
  occurrence_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  locales jsonb NOT NULL CHECK (jsonb_typeof(locales) = 'object'),
  model text NOT NULL,
  facts_digest text NOT NULL CHECK (facts_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_mobile_astronomy_interpretations_user
  ON mobile_astronomy_interpretations_r8 (user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hourkey_app') THEN
    GRANT SELECT, INSERT, UPDATE ON mobile_astronomy_interpretations_r8 TO hourkey_app;
  END IF;
END $$;

COMMIT;
