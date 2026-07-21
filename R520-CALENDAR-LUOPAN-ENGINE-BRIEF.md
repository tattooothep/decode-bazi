# ใบสั่ง R520 — 2 บั๊ก engine ที่ตาเข้มแอพมือถือเจอ (17 ก.ค. · จากภาพถ่ายจอจริง)

**ผู้รับ:** ทีม backend (พ่อ) · แอพมือถือตรวจแล้วเป็น passthrough ล้วน ไม่ใช่บั๊กแอพ · กติกา deploy/ทดสอบเหมือน R515-R519

## จุด 1 — calendar `calm_window` ข้ามเที่ยงคืนผิดรูป 🔴
- **อาการ:** ปฏิทินโชว์ "ช่วงสงบ 23:00–17:00" (18 ชม. เป็นไปไม่ได้) — user เห็นค่าผิดตรงๆ
- **ที่มา:** payload `/api/mobile/v1/calendar` (หรือ endpoint ที่ป้อน field นี้) ส่ง `calm_window: {start:"23:00", end:"17:00"}` — แอพอ่านตรง `${start}–${end}` ไม่มีคำนวณ (ตรวจแล้ว: `selectedDayDetails.ts` + `labels.ts:1608-1619` passthrough)
- **สาเหตุคาด:** ช่วงสงบคำนวณจากยามไม่ต่อเนื่อง แล้วใช้ min-start/max-end หรือ wrap ข้ามเที่ยงคืน (23:00→01:00) ไม่ถูก
- **ขอ:** ให้ calm_window เป็นช่วงต่อเนื่องจริง (ถ้าข้ามเที่ยงคืน แตกเป็น 2 ช่วง หรือ format "23:00–01:00" ที่สื่อ wrap ชัด) — fixture เดิมมีเคสปกติ 01:00-13:00 ใช้อ้างอิง

## จุด 2 — `/api/mobile/v1/luopan/analysis` ส่ง 玄空 ดาวเดียว/ช่อง (ควร 3: 山/向/運)
- **อาการ:** ผังดาวเหินในแอพโชว์เลขเดียวต่อช่อง แต่ legend บอก 山/向/運
- **ที่มา:** แอพ render ครบ 3 ดาว (DirectionScreen:843-872 · map จาก `core.xuan_kong.base/water/mountain` ใน derive/luopan.ts:434-441) — ถ้า payload มีแค่ `base` ไม่มี `water/mountain` จะเหลือเลขเดียว
- **ขอ:** เช็คว่า analysis (โดยเฉพาะ path `method:"manual"` ที่เพิ่งเปิดใน r519) ส่ง `xuan_kong.water` + `xuan_kong.mountain` ครบทุก period/facing หรือหล่นเฉพาะบางเงื่อนไข

---
## ผลงาน (จาวิสทำเอง · 5 ลายเซ็นครบ 17 ก.ค. ค่ำ)
- [x] calm_window ต่อเนื่อง: `findLongestRun` สแกนวงกลม 2×n (today/hours/route.ts) + ธง `crosses_midnight` (additive) · 16 ก.ค. 23:00–17:00❌ → 21:00–17:00 [ข้ามคืน]✅ · วันไม่คร่อม=เดิมเป๊ะ · golden/avoid ได้อานิสงส์
- [x] xuan_kong ครบ base+water+mountain: ย้าย water/mountain ออกจาก fullChart gate (luopan/analysis/route.ts) — engine คำนวณครบอยู่แล้ว route ไม่ส่งเอง · flights/替卦เหตุผล/professional ยังล็อกตาม locked_sections · เว็บให้ฟรีมากกว่านี้ (สอดคล้อง)
- ลายเซ็น: ①ผู้แก้ยิงจริง 3 รอบ ②code-review PASS (edge ครบ ไม่รั่ว paywall เกินตั้งใจ) ③regression PASS (เทียบ prod + ตรวจเลขดาวตามตำรา沈氏玄空: 辛山乙向P8 順飛/逆飛ถูก · 兼向7°替卦甲貪狼ถูก) ④integration แอพ PASS (passthrough ปลอดภัย) ⑤goal-check ตามใบสั่งครบ
- Patch: /root/decode-app/R520-PATCH/ (2 ไฟล์) · copy: /root/releases/decode-app-r520-calm-xuankong (build ผ่าน) · **รอเจ้านายเคาะ deploy** · rollback = symlink กลับ r519
- ⚠️ backport git: patch 01 ลง git ได้เลย · patch 02 ต้อง commit ไฟล์ mobile r519 เข้า git ก่อน (git ตามหลัง prod)

## คำถามตาม (จากจาวิส 19 ก.ค. — reviewer มือถือยก P2 เรื่อง /api/luopan/degrees)
- `boundary_adjusted=true` เงื่อนไขจริงของ engine คืออะไร? (validator ฝั่งแอพตรวจ geometry ครบแล้ว แต่ยังยอมรับ "ปรับ engine_degree ±1° โดยอ้าง adjusted ทั้งที่ nearest ไม่หลุด sector") — ขอ spec ชัด: engine ปรับเมื่อไหร่ ห้ามปรับเมื่อไหร่ เพื่อให้แอพตรวจซ้ำได้โดยไม่เดา · ไม่เร่ง ไม่บล็อกงานไหน
