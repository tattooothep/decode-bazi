-- ระบบเครดิต "ยาม" · 29 มิ.ย. 2026
-- หน่วย = ยาม · เริ่มต้น 500 ยาม/org · หักตามจำนวนตัวอักษร "คำตอบ" ของ AI (÷30 ตัวอักษร = 1 ยาม)
-- ใช้กับคำตอบ AI ซินแส (/api/sifu) + VLM แปลนบ้าน (/api/luopan/vision) · ไม่หักการคำนวณ engine

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS credit_yam integer NOT NULL DEFAULT 500;

-- บัญชีเดินสะพัด (log การหัก/เติม) เพื่อความโปร่งใส + ตรวจสอบย้อนหลัง
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delta         integer NOT NULL,        -- ลบ = หัก · บวก = เติม
  reason        text NOT NULL,           -- 'sifu' | 'vision' | 'topup' | 'grant'
  chars         integer NULL,            -- จำนวนตัวอักษรคำตอบ (เฉพาะตอนหัก)
  balance_after integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_org ON credit_ledger(org_id, created_at DESC);
