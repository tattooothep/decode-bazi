# ☀️ สรุปเช้า + ใบ Approve · 天星擇日 (ศาสตร์ขั้นสูงสุด · ดาวจริง)
> อัปเดต: คืนนี้ **build เป็นของจริงเสร็จแล้ว (V1) เปิดได้** · เหลือแค่เจ้านาย approve → deploy

## ✅ สิ่งที่ทำเสร็จคืนนี้ (เกินที่คิด — ของจริงทำงานแล้ว!)
ปลดล็อก 3 ด่านด้วยการ **ใช้ ephemeris ฟรี MIT (astronomy-engine) แทน Swiss Ephemeris** → ไม่ต้องซื้อ license · ไม่ต้องไฟล์ .se1 · ไม่ต้องเคลียร์ disk · 紫氣 mark optional
- **engine ดาวจริง** `src/lib/tianxing/` — ตำแหน่ง 7政+羅計月孛 + ลัคนา命宮 · **golden ลัคนา 5/5** (Sun≈Asc ตอนพระอาทิตย์ขึ้น diff<1°) · ดาวจริงระดับ arcmin (ไม่ใช่ตารางโบราณ)
- **หน้าแยก** `/tianxing` (public/tianxing.html) — 3 ภาษา 2 ธีม · รับฤกษ์จาก datepick → ผังดาว+verdict+AI สังเคราะห์
- **ปุ่มบน datepick** "🌌 วิเคราะห์ลึก ดาวจริง" (additive · ส่ง UTC ดิบ เลี่ยง tz landmine)
- **API** `/api/tianxing/chart`(ฟรี) + `/sifu`(login+หักยาม) · แยกจาก /api/auspicious (LOCKED)
- ทดสอบ: tsc 0 · build 0 · golden ✓ · side-port API คืนดาวจริง ✓ · หน้าเดิมไม่พัง
- commit `91c736f` · release **r288** cut แล้ว · deploy script `/root/deploy-r288-tianxing.sh` (รอ approve)

## 🚀 เปิดเข้าเว็บ = คำสั่งเดียว (หลัง approve)
```
sudo bash /root/deploy-r288-tianxing.sh
```
(มี health check + auto-rollback) → /tianxing LIVE บน hourkey.io

## ⚠️ ระดับความจริง V1 (ต้องเข้าใจตรงกัน · กฎห้ามโกหก)
| ส่วน | สถานะ |
|---|---|
| **ตำแหน่งดาวจริง** (7政+羅計月孛+命宮) | ✅ แม่นยำจริง verify ได้ (arcmin) |
| ชั้นตัดสิน 廟旺/恩用仇難/格局/verdict | 🟡 **baseline** (ตารางคลาสสิก domicile/exalt/喜怕) — หน้าขึ้น "เบต้า · ซินแสกำลังเสริม果老ละเอียด" |
| 紫氣 | ⏳ ยังไม่คำนวณ (รอ lock lineage) — ระบุชัดในหน้า |
| ราศีอิงดาวฤกษ์ (ayanamsa) | 🟡 V1 ใช้ Lahiri ~24° label "ปรับสำนักจีนได้" |

→ หน้าออกแบบให้ **degrade graceful + label เบต้าชัด + disclaimer** ไม่ฟันธงเกินข้อมูล

## 🟢 เจ้านายตัดสิน (เลือกได้)
1. **Approve เปิด V1 beta เลย** (ดาวจริง + baseline + AI · label เบต้าชัด) → ผม deploy
2. หรือรอเสริม rule果老ละเอียด/紫氣/ซินแส verify ก่อนค่อยเปิด
3. ตัดสิน 3 ข้อเดิม (ตอนจะอัปเป็น precision: ซื้อ Swiss Eph / 紫氣สำนัก / ตำราหลัก) — **V1 ไม่ต้องรอ 3 ข้อนี้แล้ว**

## 5 ลายเซน
กำลังรีวิว (ดาราศาสตร์ · ไม่กระทบเดิม · API/credit · UI/honesty · classical rule) — ผลอยู่ใน 08_signoffs.md
