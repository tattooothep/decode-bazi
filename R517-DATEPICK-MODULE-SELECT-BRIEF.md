# ใบสั่ง R517 — เปิดให้เลือกศาสตร์อิสระ + สถานที่/ทิศ/เกณฑ์ ในหน้าวางฤกษ์มือถือ (เจ้าของฟันธง critical 17 ก.ค.)

**ผู้รับ:** ทีม backend (คนเดิม) · **ขอบเขต:** `/api/mobile/v1/datepick/*` เท่านั้น · กติกา deploy/commit/ทดสอบเหมือน R515/R516 · **entitlement เดิมยังแช่**

## ปม
เจ้าของสั่ง critical: หน้าวางฤกษ์ **ทุกศาสตร์ต้องเลือกเปิด-ปิดได้อิสระทีละตัว** (แบบเว็บ datepick.html มี checkbox 20 โมดูล) + เลือกสถานที่จัดงาน/ทิศมงคล/กรองคะแนน — แต่ `/api/mobile/v1/datepick/route.ts` ปัจจุบัน **hardcode `ACTIVE_MODULES` 9 ตัว + `hardModules` 3** ไม่รับ param เลือกเลย → แอพทำ UI toggle ไม่ได้ (จะเป็นปุ่มหลอก ผิดกฎ) · `/api/auspicious` ปลายทางรองรับ activeModules อยู่แล้ว แค่ route มือถือไม่ส่งต่อ

## งาน: เพิ่ม input ให้ route มือถือ forward เข้า /api/auspicious (ห้ามแตะ engine คำนวณฤกษ์)
เพิ่มใน datepick input schema + route (validate + forward):
1. **`activeModules?: string[]`** — allowlist 20 ModuleKey (ze_ri, ba_zi, qi_men, 廿八宿, 十二神, 九星, he_luo, 建除, tai_sui, yong_shen, dong_gong, hex64, tian_xing, moon_void, moon_sign, retro, eclipse, rahu, panchanga, tara_bala) · ไม่ส่ง = default เดิม · ยัง gate ตาม entitlement (คืน `meta.entitlement.modules_allowed/stripped` ให้แอพรู้ว่าติ๊กได้จริงตัวไหน)
2. **`hardModules?: string[]`** หรือ derive แบบเว็บ (ze_ri/tai_sui/qi_men + ba_zi เมื่อมีคน)
3. **`options.eventLat/eventLng/eventPlace`** — สถานที่จัดงาน (แทน default กรุงเทพเสมอ)
4. **`options.targetDirection`** — Dir8 (N/NE/E/SE/S/SW/W/NW) ทิศมงคลเป้าหมาย
5. **`options.minScore`** (กรองคะแนนขั้นต่ำ) · **`options.relaxDoors`** (ผ่อนประตูฉีเหมิน)

## เช็คก่อนส่ง (เหมือน R515)
tsc/build ผ่าน · ยิงจริง: datepick ด้วย activeModules ต่างชุด → ผลต่างตามที่เลือก + eventLoc/targetDir/minScore มีผล · เว็บ 200×3 · reviewer PASS · rollback · รายงาน 8 จุด + เติม "ผลงาน" ท้ายไฟล์ + decision log ใน pland.md

---
## ผลงาน (ให้ผู้ทำเติม)
- [ ] activeModules forward + allowlist:
- [ ] eventLat/Lng/Place:
- [ ] targetDirection:
- [ ] minScore/relaxDoors:
- [ ] meta.entitlement.modules_allowed คืนให้แอพ:
