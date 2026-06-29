# 🌌 Tianxing / 七政四餘 / 天星擇日 Engine — เริ่มที่นี่
> เตรียมข้อมูลคืน 29 มิ.ย. 2026 (เจ้านายนอน · 5 agent วิจัย) · พรุ่งนี้ทำจริง

## เป้าหมาย
เติม **天星擇日 (七政四餘)** = ชั้นสูงสุดของวิชาเลือกฤกษ์ (ดาวจริงบนฟ้า) เป็นโมดูล **display-only** ในหน้า datepick · ไม่กระทบคะแนนศาสตร์อื่น (แพทเทิร์นเดียวกับ 董公 r284-287)

## ไฟล์ในชุดนี้
- `01_qizheng_rules.md` — กฎ 果老星宗 (恩用仇難/廟旺/守照拱夾/格局)
- `02_zaoming_tianxing.md` — วิธี造命/天星 สาย蔣大鴻
- `03_swiss_ephemeris.md` — เครื่องคำนวณดาวจริง (⚠️ license + 紫氣)
- `04_source_manifest.md` + `../source_manifest.json` — ตำรา 11 ชุด/65 ไฟล์ verified
- `05_architecture_feasibility.md` — สถาปัตยกรรม + แผนเฟส + ผล df/tools จริง

## 🔴 3 เรื่องที่เจ้านายต้องตัดสินใจก่อนเริ่ม
1. **Swiss Ephemeris license**: hourkey เชิงพาณิชย์ปิดซอร์ส → ต้อง**ซื้อ commercial license** (~CHF 750 · ยืนยันราคา Astrodienst) · AGPL บังคับเปิดซอร์สทั้งแอป · Moshier ไม่ช่วยหนี
2. **紫氣 lineage**: ไม่มีดาราศาสตร์รองรับ + หลายสาย (รอบ28ปี vs 近地点) → ต้องยืนยันสำนัก+epoch ก่อน ห้าม fake
3. **เลือกตำราหลัก 1 เล่ม lock** (กัน 3 สำนักคำนวณต่างกัน) — แนะนำสาย 動盤/蔣大鴻 + 恩用仇難 สาย喜怕

## 🟡 Blocker เทคนิค (P0 พรุ่งนี้)
- **Disk 95% เหลือ 23G** → เคลียร์ `/root/releases` (91G/~30 releases) เหลือ 3-5 ตัว คืน ~70-80G **ก่อนโหลด source** (เช็ค git clean ก่อน)
- ลงเครื่องมือ: `apt: tesseract-ocr-chi-tra djvulibre-bin` · `npm i sweph` (หรือ pip pyswisseph) · ephemeris .se1
- source pack ~2.3GB (PDF/djvu) หรือจิ๋วถ้าเอา OCR-text (_djvu.txt) เท่านั้น

## แผนเฟส (สรุป)
P0 เตรียมเครื่อง+disk+lock ตำรา → P1 source+OCR → P2 Swiss Eph (golden เทียบ曆) → P3 สกัด rule→ref_tianxing_* → P4 engine+score → P5 wire datepick display-only + 5 ลายเซน

## หลักการห้ามลืม (จากบรีฟเจ้านาย)
- ตำแหน่งดาวจริง = **Swiss Ephemeris เท่านั้น** ห้ามใช้ตารางดาวโบราณในตำรามาคำนวณ
- ตำรา = สกัด "rule" เท่านั้น
- ห้าม OCR โดยไม่เทียบภาพ · ห้าม fake 紫氣 · ทุก rule มี source_ref (กฎ research DB)
- 星命(三命通會/星平會海) ต้อง tag แยกจาก擇日
- 天元選擇辨正 = backlog (ไม่มี open scan · ห้ามโหลดเถื่อน) → V2
