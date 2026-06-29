# รายงานวิจัย #5: สถาปัตยกรรม + Feasibility · Tianxing Engine V1
> เตรียมข้อมูล 29 มิ.ย. 2026 · agent research · มีผลเช็คเครื่องจริง

## แผน: เติม 天星擇日 เป็นโมดูล display-only (เหมือน 董公 r284-287) ไม่แตะคะแนนศาสตร์อื่น

## 1. ต่อโมดูลยังไง (จากโค้ดจริง)
- `CandidateSlot` มี field นอก `modules`: huangdao/richong/donggong = "อ่านประกอบ ไม่เข้าคะแนน"
- `combineScores()` อ่านแค่ `c.modules` → เติม field ใหม่ **กระทบคะแนนไม่ได้ by design**
- → V1: `tianxing?: TianXing|null` เสียบใน rowToCandidate() · **แต่ต่าง董公**: 天星คำนวณดาราศาสตร์หนัก → **ต้อง pre-compute ลง cache** (เลียน aj_ephemeris_cache) ไม่ใช่ pure function read-time

## 2. Pipeline 5 ชั้น
1. **ดาราศาสตร์ (det 100%)**: Swiss Eph → 7政 longitude + nodes(羅計) + 命宮/十二宮 + 入宿度
   - 1b 紫氣/月孛 = semi-det (สูตรคาบ · lock สำนักเดียว)
   - 1c 28宿 = ต้องตาราง距度 (ช่องไม่เท่า)
2. **แปลงภาษาศาสตร์**: 命主/度主/ราศี/เรือน/宿
3. **ตัดสิน (RULE จากตำรา 🔴)**: 廟旺落陷 · 恩用仇難 · 合格/忌格 ← หัวใจที่ต้องสกัด
4. **score+คำอธิบาย** (engine det + AI สรุปภาษาทีหลัง ตามกฎ9)
5. **wire**: aj_tianxing_cache → rowToCandidate

🔴 เสี่ยงสุด: **3 สำนักคำนวณต่างกัน** → ต้อง lock ตำราหลัก 1 เล่ม ก่อนสกัด (บทเรียนเดียวกับ 5 เรือนปาจื้อ fork)

## 3. DB schema ร่าง (additive ref_tianxing_*)
- `ref_tianxing_star_status` (ดาว×ราศี/宿 → 廟旺落陷 · RULE)
- `ref_tianxing_28xiu_bounds` (距度 boundary + epoch · astronomy)
- `ref_tianxing_rules` (恩用仇難/格局 · jsonb condition + verdict + score_delta + **source_ref** trace)
- `ref_tianxing_star_meta` (ธาตุ/เจ้าเรือน)
- `ref_tianxing_meta` + `aj_tianxing_cache` (ผลคำนวณ)
- ทุก rule มี source_ref (กฎ research DB · ห้ามมั่ว)

## 4. 🔴 FEASIBILITY (ผลจริง 29 มิ.ย.)
**Disk: / 387G · used 364G · avail 23G · 95% 🔴ตึง** · inode 11%(ok) · RAM 31G(ok)
- `/root/releases` = **91G (~30 releases)** ← เป้าเคลียร์ใหญ่สุด คืน ~70-80G
- source pack ตำราอาจ 3-8GB + ephemeris 0.2-0.5GB → **23G ไม่พอ ต้องเคลียร์ก่อน**

**เครื่องมือ:** ✅ make/gcc/g++/node/python3/pip/npm/tesseract/gs/pdftoppm/convert
🔴 ขาด: `tesseract-ocr-chi-tra` · `swisseph`(npm sweph/pip pyswisseph) · `djvulibre-bin` · `ia`(internetarchive)

**OCR จีนโบราณ = ช้า+แม่นต่ำ** → _missing flag + ซินแสตรวจ ไม่ raw เข้า DB

## 5. แผนเฟส
- **P0 เตรียม**: เคลียร์ releases เก่า(คืน disk) · ลง chi_tra/swisseph/ephemeris · df>100G · **lock ตำราหลัก 1 เล่ม** · backup DB
- **P1 source+OCR**: โหลดตำรา→ภาพ→OCR→raw 廟旺/距度/恩用仇難/格局 + _missing flag
- **P2 Swiss Eph**: tianxing-ephemeris.ts · golden เทียบ七政四餘曆 · lock 紫氣/月孛 สำนัก
- **P3 สกัด rule→DB**: ref_tianxing_* (เลียน donggong-to-sql) · source_ref · ซินแสตรวจ
- **P4 engine+score**: tianxing.ts det + unit test
- **P5 wire+5ลายเซน**: tianxing? field · cache · badge "ไม่เข้าคะแนน" · ห้ามแตะ combineScores

## ✅ พรุ่งนี้ทำก่อน (P0 checklist)
1. เคลียร์ /root/releases เหลือ 3-5 ตัว (เช็ค git clean ก่อน) → คืน ~70-80G
2. df ยืนยัน avail>100G
3. apt: tesseract-ocr-chi-tra djvulibre-bin · pip: pyswisseph internetarchive (หรือ npm sweph)
4. โหลด ephemeris .se1 + sefstars.txt → SE_EPHE_PATH
5. **ตัดสินใจตำราหลัก 1 เล่ม + epoch 28宿** (สำคัญสุด)
6. backup DB
7. ⚠️ ตัดสินใจ **ซื้อ commercial license Swiss Ephemeris** (ดู prep#3)

ไฟล์อ้างอิง: types.ts(CandidateSlot:174) · auspicious/route.ts(rowToCandidate:389) · donggong.ts + donggong-to-sql.cjs(แม่แบบ)
