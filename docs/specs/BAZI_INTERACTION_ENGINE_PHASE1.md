# BaZi Interaction Engine Phase 1 — Rule Registry + Hehua Verdict

สถานะ: draft สำหรับซินแสตรวจ logic ก่อน wire เข้า `chartPacket`

## เป้าหมาย

ย้ายตรรกะปฏิกิริยาออกจาก prompt ไปอยู่ใน engine แบบตรวจย้อนกลับได้:

- engine ตัดสินว่า `合/沖/刑/害/破/墓庫` ทำงานจริงแค่ไหน
- AI Sifu รับผลตัดสินจาก packet แล้วอธิบายไทยนำ จีนตาม
- rule ทุกตัวต้องมี provenance: ตำราจริง, สรุปจากตำรา, หรือ heuristic ของระบบ

## แหล่ง ctext ที่ใช้เฟสนี้

หลักจาก `子平真詮評注` บน ctext:

- `五．論十干合而不合` — กฎ `合而不合`, ระยะห่าง, ตัวคั่น, 爭合妒合
- `七．論刑衝會合解法` — 合/會 แก้沖/刑, แก้แล้วกลับเกิด沖/刑, แก้ไม่ได้
- `十七．論墓庫刑衝之說` — 辰戌丑未 ไม่ใช่โดน沖แล้วดีเสมอ
- `十．論用神變化`, `十六．論雜氣如何取用` — 用神/格局 เปลี่ยนเพราะ透干/會支

URL หลัก: `https://ctext.org/wiki.pl?chapter=974137&if=en`

## ไฟล์ที่เพิ่ม

- `src/lib/bazi-stem-strength.ts`
  - Step 0 ฐานกำลังของก้านฟ้า: `透干 + 通根 + 月令 + ระยะเสา`
  - ใช้ตัดสินว่าก้านที่มาคุมธาตุแปร “คุมจริง” หรือ “ลอย/ไกลเกินไป”
  - ยังไม่ใช่ raw strength % และไม่ส่งเข้า AI โดยตรง

- `src/lib/bazi-interaction-rule-registry.ts`
  - source registry สำหรับ rule id เช่น `ZPZQ-HE-001`
  - แยก `sourceType = ctext_verbatim | ctext_derived | internal_heuristic`
  - แยก `engineStatus = supported | partial | not_supported`

- `src/lib/bazi-hehua-resolver.ts`
  - resolver v1 สำหรับ `天干五合`
  - ยังไม่ประกาศ `化氣格` ทั้งดวง
  - verdict ออกเป็น:
    - `transform_supported` = เงื่อนไขสนับสนุนการแปร แต่ยังเป็น候補
    - `bound_no_transform` = 合而不化
    - `contested` = 爭合妒合
    - `blocked_by_intervening_stem` = 隔合不成
    - `remote_weak` = 遙合力弱

- `scripts/test-hehua-verdict.mjs`
  - golden v1 สำหรับระยะ, ฤดู, ตัวคั่น, ตัวแย่ง, ตัวขวาง

- `scripts/test-bazi-stem-strength.mjs`
  - golden Step 0 สำหรับก้านมีราก/ไม่มีราก/ใกล้/ไกล/ได้月令

## หลักที่ซินแสควรตรวจ

1. `甲己` อยู่ติดกัน + เดือน/รากสนับสนุน → ตอนนี้ engine ให้ `transform_supported` ไม่ใช่ `true_transform` เพื่อกัน overclaim
2. ถ้าฤดูไม่ช่วย → `合而不化`
3. ถ้าอยู่ไกลปี-ยาม → `遙合力弱`
4. ถ้ามีก้านคั่นที่ขวางแรง → `隔合不成`
5. ถ้ามีหลายก้านแย่งคู่เดียวกัน → `爭合妒合`
6. ถ้ามีก้านฟ้าที่ควบคุมธาตุ化อยู่ชัด → ใช้ `bazi-stem-strength` ตัดสิน ถ้าใกล้และมีรากให้ลดเป็น `合而不化`; ถ้าลอยหรือไกลให้ถือว่าคุมไม่อยู่

## สิ่งที่ยังไม่ wire

เฟสนี้ยังไม่แตะ:

- `/api/sifu`
- `chart-packet.ts`
- หน้า master/chart
- prompt production

เหตุผล: ต้องให้ rule registry + hehua v1 ผ่านการตรวจจากซินแสก่อน แล้วค่อย wire เข้า packet เป็น `hehuaVerdicts`.

## เฟสถัดไป

1. เพิ่ม `hehuaVerdicts` เข้า `ChartPacket` แบบ read-only/derived
2. ทำ `hechongResolver` โดยอิง `ZPZQ-XCH-*`
3. ทำ `mukuState` โดยอิง `ZPZQ-MK-*`
4. แก้ prompt: AI ต้องเชื่อ packet ก่อน และห้ามคำนวณ resolver เอง
