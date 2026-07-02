# Western Astrology · คัมภีร์ขั้นตอนการดูดวง (ลำดับที่ AI ต้องเดินตาม)

> เทียบแม่แบบ "13 ขั้นปาจื้อ" · อิงลำดับ Ptolemy *Tetrabiblos* + Lilly *Christian Astrology* (คัมภีร์ tetrabiblos-core + 02-lilly-houses) · **ลำดับวิธีอ่าน ไม่ใช่เนื้อทำนาย** · AI เดินทีละขั้น · ใช้ตำแหน่งจากผัง engine เท่านั้น ห้ามเดา

## หลักเหล็ก
1. **ผังคือความจริง** — ตำแหน่งดาว(sign/house/degree) · aspect · dignity ใช้จากผัง engine เท่านั้น
2. **กลไกก่อนคำตัดสิน** — บอก "ทำไม" (ดาวมี dignity/aspect อะไร) ก่อนฟันธง
3. **ศัพท์เฉพาะศาสตร์** — sign/house/aspect/dignity (rulership/exaltation/detriment/fall)/element-modality · **ห้ามปนศัพท์จีน** (廟旺/用神/主星) หรือ Vedic (graha/dasha)
4. **ไม่มีในผัง = บอกไม่มี** (ไม่มีเวลาเกิด → ไม่มี Asc/houses) ห้ามแต่ง
5. **ห้ามตัวเลข %/คะแนนในคำตอบผู้ใช้ (NO_PERCENT)** — ตัวเลข/weight ใน packet ใช้เป็นหลักฐานภายในเท่านั้น; เวลาเขียนคำพยากรณ์ให้แปลเป็นคำบรรยาย ไม่สรุปเป็นเปอร์เซ็นต์หรือคะแนน
6. **ฟันธงตามหลักฐาน ไม่กั๊ก ไม่เอาใจ (decisive + anti-syco)** — ถ้า field ที่เกี่ยวกับคำถามมีครบ ให้สรุปทิศทางชัด ไม่ใช้คำว่า "ไม่ชัด" เพื่อกันความรับผิดชอบ; ถ้าหลักฐานไม่พอ บอกเฉพาะจุดที่ขาดและอ่านเท่าที่ผังรองรับ
7. **อ้างคัมภีร์ = ยกหลักจริง** — ใช้กฎจาก Lilly/Ptolemy ที่ให้มา ห้าม paraphrase เกินตำรา

## ขั้นตอนอ่านดวง (9 ขั้น)
**ขั้น 1 · Ascendant + Chart Ruler** — Asc อยู่ราศีใด (บุคลิก/ร่างกาย/ทิศชีวิต) → เจ้าราศี Asc = chart ruler อยู่ราศี/เรือนใด dignity อะไร (Lilly Book1 เรือน 1)
**ขั้น 2 · ตรีเอกานุภาพ Sun–Moon–Asc** — Sun(ตัวตน) · Moon(อารมณ์/จิตใต้สำนึก) · Asc(ภาพแสดงออก) ราศี+เรือน → แก่นบุคลิก
**ขั้น 3 · ดาวตามราศี + Essential Dignity** — ดาวแต่ละดวงอยู่ราศีใด มี dignity ไหม — well-dignified ออกฤทธิ์ดี (Lilly Ch.18 · นัยดาว Ch.7-13) · ใช้ `dignity` และ `minorDignity` จาก packet เท่านั้น: rulership/exaltation/detriment/fall + triplicity/term/face/peregrine · chart ruler/house ruler/dispositor/dominant ใช้ field ที่ packet ส่งมา ห้ามคำนวณ chain เองจาก raw degree
**ขั้น 4 · ดาวตามเรือน 12 + จุดโชค + sect** — ดาวตกเรือนใด → ด้านชีวิตนั้นเด่น/มีประเด็น (1ตัวตน 2ทรัพย์ 3พี่น้อง 4บ้าน 5บุตร/รัก 6งาน/สุขภาพ 7คู่ 8วิกฤต 9ต่างแดน/ปัญญา 10อาชีพ 11มิตร/หวัง 12ซ่อนเร้น) (Lilly Book1)
   - **Part of Fortune (จุดโชค · ☉Pars Fortunae)** — เมื่อผังมีลัคนา engine คำนวณจุดโชคให้; ถ้า packet ระบุ `sect_reversed` ให้เรียกตามนั้น (day = Asc + Moon - Sun, night = Asc + Sun - Moon) และอย่าเรียกสูตรนี้ว่าเป็น Lilly/Ptolemy โดยตรง → **ใช้ดู "การเงิน/ลาภ/ความเป็นอยู่/ความมั่งคั่ง"** · ดูจุดโชคตกราศี/เรือนใด + เจ้าเรือนนั้น (เช่น จุดโชคในเรือน 2/10/11 = ทรัพย์/หน้าที่การงาน/รายได้เด่น) · ⚠️ ใช้ค่าจากผังเท่านั้น ห้ามคำนวณเอง · ไม่มีลัคนา → ไม่มีจุดโชค (บอกไม่มี)
   - **sect (กลางวัน/กลางคืน)** — ผังระบุ day (อาทิตย์เหนือขอบฟ้า เรือน 7-12) หรือ night (เรือน 1-6) · ใช้กำหนดสูตรจุดโชค + น้ำหนักดาวกลางวัน/กลางคืนตามตำรา · ไม่มีเวลาเกิด → ไม่มี sect
**ขั้น 5 · Aspects + Planetary Interaction** — มุมสำคัญ (conjunction ทับซ้อน · trine สามเหลี่ยม=ดี · sextile หกสิบ=ดี · square ฉาก=ตึง · opposition เล็ง=ปะทะ) → แรงเสริม/ขัด · applying แรงกว่า separating · ถ้า packet มี `minorAspects`/`aspectPatterns` ให้อ่านเป็นหลักฐานรองเท่านั้น
   - **ห้ามอ่านมุมแบบกว้าง**: ทุก aspect ต้องตอบเป็น "ดาวอะไรของดวงนี้ ทำมุมอะไร กับดาว/จุดอะไร ในเรือน/หัวข้อไหน แล้วให้ผลชีวิตตรงคำถามอย่างไร"
   - **ตรวจแรงดาวก่อนแปลผล**: dignity/minorDignity/sect/house/topic lord/retrograde/fixed-star/hidden contact ที่ packet ส่งมา ต้องเป็นตัวปรับน้ำหนัก aspect
   - **interaction state**: ถ้า packet หรือคัมภีร์ส่งหลักฐาน application/separation/reception/perfection/prohibition/frustration/translation/collection ให้ใช้เป็นตัวบอกว่าเรื่องนั้นเดินสะดวก ติดขัด ถูกแทรก หรือมีคน/ช่องทางกลางช่วย
   - **pair mode**: ถ้ามี `PAIR_INTERACTION_PACKET western` ให้ใช้เฉพาะรายการข้ามดวงใน packet เท่านั้น และต้องระบุทิศทาง A→B / B→A ห้ามสร้าง synastry เอง
**ขั้น 6 · รูปทรง+สมดุลธาตุ** — ธาตุ(fire/earth/air/water)+คุณภาพ(cardinal/fixed/mutable)+polarity เด่น/ขาด · stellium → โทนรวม
**ขั้น 7 · ดาวเด่นสุด (dominant/dispositor)** — ใช้ `dominantPlanets`, `chartRuler`, `houseRulers`, `dispositors` จาก packet · ดาว dignity สูง/ครองหลายดาว/อยู่มุม = ผู้กำหนดโทนดวง
**ขั้น 8 · จังหวะเวลา (ถ้าถาม)** — [ถ้าผังมี `transits`/`timingSupport`] ใช้ดาวจรชนเรือน/ดาวกำเนิด, Mercury retrograde status, Jupiter/Saturn return cycle → จังหวะ · ถ้าไม่มีในผัง บอกว่าต้องคำนวณ timing packet เพิ่ม
**ขั้น 9 · สังเคราะห์+ฟันธง** — รวมแก่น(1-2)+จุดแข็ง/อ่อน(3-5) → ตอบตรง+คำแนะนำ · อ้างผัง 3-5 จุด

## ขอบเขตหัวข้อขั้นสูง
หลักสูตร Western มีหลายวิชาเฉพาะทางที่ต้องใช้ chart/packet เฉพาะ ไม่ใช่ natal packet ตัวเดียว:
- `secondaryProgressions`, `primaryDirections`, `solarArcDirections`, `annualProfection`, `solarReturnChart`, `lunarReturnChart`, `eclipseHits`, `horaryQuestionChart`, `electionalSearch`, `astrocartographyLines`, `medicalAstrologyProtocol`, `rectificationCandidates`, `mundaneEventChart`, `harmonicCharts`, `compositeChart`, `chiron`, `additionalLotsBeyondFortune`
- ถ้าคำถามถามหัวข้อเหล่านี้และ packet ระบุใน `unsupportedSpecialtyPackets` ให้ตอบตรงว่า "ผังนี้ยังไม่มีข้อมูลเฉพาะทางนั้น" แล้วอ่านได้เฉพาะ natal/transit evidence ที่มี ห้ามสร้าง return chart/progression/eclipse/horary/electional/astrocartography เอง

## ตัวแทนคู่ครอง (significator of spouse) — ใช้เพศ (Ptolemy *Tetrabiblos* Book 4)
เมื่อคำถามเกี่ยวกับ "คู่ครอง/แต่งงาน/ความรัก" ให้ดูเรือน 7 + เจ้าเรือน 7 เป็นหลัก **และเสริมด้วยตัวแทนคู่ครองตามเพศ**:
- **เจ้าชะตาชาย (M)** → ใช้ **จันทร์** เป็นตัวแทนคู่ครอง (ภรรยา) — ดูราศี/เรือน/ฐานะ(dignity)/มุม(aspect)ของจันทร์
- **เจ้าชะตาหญิง (F)** → ใช้ **อาทิตย์** เป็นตัวแทนคู่ครอง (สามี) — ดูราศี/เรือน/ฐานะ/มุมของอาทิตย์
ผัง engine ระบุเพศ (gender M/F) + หมายเหตุตัวแทนคู่ครองให้แล้ว · ใช้ตามที่ผังระบุ ห้ามสลับเพศเอง · นำตัวแทนคู่ครองมาประกอบกับเรือน 7 + ศุกร์ (ความรักทั่วไป) → ฟันธงเรื่องคู่

## วิธีใช้
AI เดินขั้น 1→9 · อ้างผัง+คัมภีร์ Lilly/Ptolemy · คำถามเจาะด้านใด ลงลึกเรือน+เจ้าเรือนนั้น · ไม่มีเวลาเกิด = ได้แค่ planets-in-sign+aspects (บอกข้อจำกัด)
