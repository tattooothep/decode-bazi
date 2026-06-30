# 七政四餘 / 天星 (Qizheng) — แผนที่คัมภีร์ (ไม่ต้องดึงซ้ำ)

> สถานะ: **มีคัมภีร์ครบแล้ว** — ไม่สร้างไฟล์ canon ใหม่ในโฟลเดอร์นี้
> ศาสตร์ดาวจริง 七政四餘/天星 มีคลังต้นฉบับ + ไฟล์สกัด "กฎตีความ" อยู่แล้วที่ `knowledge/tianxing/`
> ไฟล์นี้เป็นเพียง "แผนที่ชี้แหล่ง" ไม่ใช่เนื้อคัมภีร์ (กันการดึงซ้ำ/แต่งเอง)

## ทำไม skip
ตามโจทย์: "เช็คว่า knowledge/tianxing/ มีคัมภีร์ครบไหม · ถ้าครบ skip · ถ้าขาด星情เสริมจาก ctext 張果星宗"
ตรวจแล้ว — **星情 / 廟旺落陷 / 格局 ถูกสกัดครบ** จาก 果老星宗 (= 張果星宗) ผ่าน ctext (digitize ไม่ใช่ OCR) + woodblock cross-check ไม่ขาดส่วนที่โจทย์ต้องการ จึง skip การดึง ctext เพิ่ม

## ต้นฉบับ public-domain ที่มีอยู่ (manifest)
ดู `knowledge/tianxing/source_manifest.json` — ทุกแหล่ง verified + PD:
- **果老星宗 / 鄭氏星案** (Ming/Qing) — `01_qizheng_core/` (PDF + _djvu.txt OCR, 卷1-10) = qizheng core
- **星學大成** 萬民英 (明, 四庫子部術數) — `02_star_encyclopedia/` (30卷/16冊, _djvu.txt)
- **增補星平會海命學全書** (七政四餘 core reference, CADAL) — `05_supplements/`
- **禽星易見** 池本理 (1781 乾隆刊本) — 禽星
- **欽定協紀辨方書** (清欽定四庫官修) — official cross-check
- **造命宗鏡集 / 天元歌 / 選擇宗鏡** — 造命/擇日 (Wikimedia Commons NCL/CADAL/Shanghai)
- **繪圖增廣玉匣記** — 通書/玉匣記 supplement

## ไฟล์ "กฎตีความ" ที่สกัดแล้ว (ใช้ตรงนี้ ไม่ต้องสร้างใหม่)
`knowledge/tianxing/_prep/`:
- `extract_miaowang.md` — 廟旺落陷 七政 (by 宮/宿/度) จาก 果老星宗/張果星宗 (ctext, degree-precise)
- `extract_geju.md` — 格局 (星情/星性/主)
- `extract_enyong_natal.md` — 恩用 (用神/恩星) natal
- `extract_xiu28_method.md` / `extract_xiu28_dushu.md` — 28宿 度數
- `extract_ziqi.md` + `verify_ziqi.mjs` — 紫氣/四餘
- `01_qizheng_rules.md` — กฎ qizheng หลัก (ระบุ 張果星宗 = "rule source ดีสุด")
- `02_zaoming_tianxing.md` — 造命/天星擇日 rules

## หมายเหตุ
- 張果星宗 = ชื่ออื่นของ 果老星宗 (ย่อจาก "張果老星宗") — แหล่ง ctext `ws689621`(日月+月孛+紫氣) / `ws904682`(水金火木土) ใช้สำหรับ 躔度玉關歌 + ⟨ดาว⟩總論 ครบ 7政+月孛+紫氣
- ถ้าต้องการ canon qizheng เพิ่มในรูปแบบเดียวกับ western/vedic/ziwei ในอนาคต → ดึงจาก 果老星宗 _djvu.txt ใน `01_qizheng_core/` (PD) หรือ ctext 張果星宗 เท่านั้น (ห้าม blog/forum)
