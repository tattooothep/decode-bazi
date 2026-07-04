# r2k-2 · Uranian packet → render audit (ทำไม AI บอก "ส่งไม่ครบ")

READ-ONLY audit · 4 ก.ค. 2026 · ไม่แก้โค้ด (ร่าง diff ให้เจ้านายเคาะก่อน)

ไฟล์ที่ตรวจ:
- `src/lib/astro/uranian/render.ts` (renderUranianPrompt — สร้าง prompt string ที่ AI อ่านจริง)
- `src/lib/astro/uranian/packet.ts` (UranianPacket — envelope ที่ engine ส่งเข้ามา)
- `src/lib/astro/uranian/engine.ts` (uranianChart — คำนวณ + `.slice(0, MAX_*)` คุมงบ)
- `src/lib/astro/uranian/auslosung.ts` (ชั้นเวลา · cap ของมันเอง)

## แก่นปัญหา (root cause)

engine คำนวณและ **ส่งเข้า packet.data ตาม cap ใหญ่** (เช่น ภาพดาว 60, จุดไว 60) แต่ `render.ts`
ตอนแปลง packet → prompt string กลับ `.slice()` ด้วย **เลขเล็กกว่า cap** (40 / 24 / 20)
รายการที่คมรองลงมา (แต่ยังอยู่ใน orb) **ถูกคำนวณ + อยู่ใน packet.data จริง แต่ไม่เคยถูกพิมพ์ลง prompt**
→ AI อ่านเฉพาะ prompt string → มองไม่เห็น → ตอบว่า "ส่งไม่ครบ / ตัดสั้น"

ทุกจุดยืนยันจากบรรทัดจริง (เลข slice ใน render.ts เทียบ MAX_* ใน engine.ts บรรทัด 230-234 · AUSLOSUNG_MAX_* ใน auslosung.ts บรรทัด 42-44).

## ตาราง: section · แสดงครบ/ตัด/ขาด · ควรแก้ยังไง

| # | Section (render.ts) | packet field | cap engine (ส่งมาจริง) | render slice | สถานะ | ควรแก้ |
|---|---|---|---|---|---|---|
| 1 | ตำแหน่งดาว/จุด (บรรทัด 71) | `data.points` | เต็ม (10–12) | ไม่ slice | ✅ ครบ | — |
| 2 | ภาพดาว Planetenbild (87) | `data.planetaryPictures` | **60** (`MAX_PICTURES`) | **`.slice(0,40)`** | ❌ ตัด — โชว์ 40/60 (หาย 20) | ขยาย 40→60 (จุด audit r2j-5 B4) |
| 3 | ภาพดาว 4 ดวง Vierergestirn (98) | `data.fourPlanetPictures` | **40** (`MAX_FOURPLANET`) | **`.slice(0,24)`** | ❌ ตัด — 24/40 (หาย 16) | ขยาย 24→40 |
| 4 | จุดไว sensitive Punkte (110) | `data.sensitivePoints` | **60** (`MAX_SENSITIVE`) | **`.slice(0,40)`** | ❌ ตัด — 40/60 (หาย 20) | ขยาย 40→60 |
| 5 | จุดกระจก Antiscia (123) | `data.antiscia` | **40** (`MAX_ANTISCIA`) | **`.slice(0,24)`** | ❌ ตัด — 24/40 (หาย 16) | ขยาย 24→40 |
| 6 | เดคลิเนชัน Parallel (136) | `data.declinationPairs` | **40** (`MAX_DECL`) | **`.slice(0,24)`** | ❌ ตัด — 24/40 (หาย 16) | ขยาย 24→40 |
| 7 | ปมจันทร์ mean/true (145-146) | `nodeMeanLon`/`nodeTrueLon` | 2 | เต็ม | ✅ ครบ | — |
| 8 | TNP points (153) | `data.tnpPoints` | เต็ม (3) | เต็ม | ✅ ครบ | — |
| 9 | TNP Zeus คำนวณไม่ได้ (158) | `data.tnpNotComputable` | เต็ม (1) | เต็ม | ✅ ครบ | — |
| 10 | ภาพดาวมี TNP ร่วม (164) | `data.tnpPlanetaryPictures` | **60** (`MAX_PICTURES`) | **`.slice(0,20)`** | ❌ ตัด — 20/60 (หาย 40) | ขยาย 20→60 |
| 11 | จุดไวมี TNP ร่วม (170) | `data.tnpSensitivePoints` | **60** (`MAX_SENSITIVE`) | **`.slice(0,20)`** | ❌ ตัด — 20/60 (หาย 40) | ขยาย 20→60 |
| 12 | Auslösung groups (188) | `auslosung.groups` | **24** (`AUSLOSUNG_MAX_GROUPS`) | **`.slice(0,8)`** | ❌ ตัด — 8/24 (หาย 16) | ขยาย 8→24 |
| 13 | Auslösung events/group (191) | `group.events` | **10** (`AUSLOSUNG_MAX_PER_GROUP`) | **`.slice(0,5)`** | ❌ ตัด — 5/10 (หาย 5) | ขยาย 5→10 |
| 14 | Auslösung TNP activations (198) | `auslosung.tnpActivations` | **80** (`AUSLOSUNG_MAX_EVENTS`) | **`.slice(0,6)`** | ❌ ตัด — 6/80 | ขยาย 6→อย่างน้อย 20 |
| 15 | Auslösung TNP mover (204) | `auslosung.tnpMoverContacts` | **80** (`AUSLOSUNG_MAX_EVENTS`) | **`.slice(0,6)`** | ❌ ตัด — 6/80 | ขยาย 6→อย่างน้อย 20 |

### สรุปข้อ 2-6, 10-15: ทุกจุดที่ render slice < engine cap
antiscia / declination / fourPlanet / tnp / auslosung **ถูก render "แต่ไม่ครบ"** — ไม่ได้หายทั้ง section
แต่โดน slice ตัดยอด (top-N เล็กกว่าที่ส่งมา). ที่ audit r2j-5 B4 ชี้ = ข้อ 2 (ภาพดาว slice 40 ทั้งที่ cap 60).

## Field ใน packet ที่ render ไม่ push ออกเลย (ขาดจริง — ไม่มีบรรทัดพิมพ์)

| Field | render พิมพ์ไหม | ผลกระทบ | ข้อเสนอ |
|---|---|---|---|
| `data.personalPoints` (☉☽Asc MC **Node AriesPoint**) | ❌ ไม่ iterate | Node โผล่ทาง `nodeMeanLon`/`nodeTrueLon` แล้ว · แต่ **AriesPoint (0°♈ · Widderpunkt = ศูนย์อ้างอิงโลกของ Witte) ไม่ถูกแสดงเป็นจุดเลย** | เพิ่ม 1 บรรทัดระบุ AriesPoint = 0°♈ (จุดไวคงที่ · Witte ใช้เป็น anchor) |
| `data.tnpElementsMissing` (`[{name:"Zeus", missing:[...]}]`) | ❌ ไม่พิมพ์ | render ใช้ `z.reason` จาก `tnpNotComputable` แทน (ครอบคลุมเหตุผลอยู่แล้ว) | ทางเลือก: แปะรายชื่อ element ที่ขาดเพื่อความโปร่งใส (ไม่บังคับ) |
| `data.witteTransneptunians` (static list + **canonRef บทหมวด H**) | ❌ ไม่ iterate | ชื่อ TNP โผล่ผ่าน `tnpPoints`/`tnpNotComputable` · แต่ **canonRef (บท 19/40/27 หมวด H) ไม่ถูกส่งออก** → AI อ้างบทเองไม่ได้ ต้องพึ่งคัมภีร์ | ทางเลือก: แนบ canonRef ต่อท้ายบรรทัด TNP แต่ละดวง |
| `data.halbsummen` (ครึ่งผลรวมทุกคู่ · ดิบ) | ❌ ไม่พิมพ์ | **ตั้งใจ** — เป็นวัตถุดิบคำนวณ pictures/sensitive · พิมพ์ทั้งหมด = prompt บวมมหาศาล (C(12,2)=66 คู่) | คงไว้ ไม่ต้องแก้ |
| `orbFourPlanetDeg` (ค่า orb 4 ดวง) | ❌ ไม่พิมพ์ในหัวข้อ (94) | orb ของ picture/sensitive/antiscia/parallel **พิมพ์ค่าหมด** แต่ 4 ดวงไม่พิมพ์ค่า orb เกณฑ์ | เพิ่มค่า `packet.orbFourPlanetDeg`° ในหัวข้อ 4 ดวง (ให้สม่ำเสมอ) |
| `auslosung.events` (flat cap 80) · `methodCounts` · `totalEventsFound` | ❌ ไม่พิมพ์ | `groups` จัดกลุ่ม event เดียวกันครบแล้ว · ตัวเลขสถิติเป็น transparency | คงไว้ (groups แทนได้) |
| `degradeLevel`/`birthTimeMode`/`notAvailable`/`gender` | ❌ ไม่พิมพ์ตรง | จัดการผ่านข้อความ `hasBirthTime` (51) แล้ว · ยูเรเนียนไม่ใช้ gender คำนวณ | คงไว้ |

## ⚠️ ข้อควรระวังก่อนขยาย slice (prompt budget)

- engine ตั้ง `MAX_*` (60/40/80) ไว้ "คุมงบ prompt" อยู่แล้ว → การขยาย render ให้ตรง cap = ส่งเท่าที่ engine ตั้งใจ ไม่ได้ระเบิดเกิน cap
- แต่ **ผลรวมจริงจะยาวขึ้น**: ภาพดาว +20 บรรทัด, จุดไว +20, TNP pic +40, TNP sens +40, auslosung groups +16 กลุ่ม → รวม ~150+ บรรทัดต่อ 1 คำขอ
- ถ้าห่วง token: ทางสายกลาง = ขยายเฉพาะ real-plane (ข้อ 2-6) ให้ตรง cap ก่อน · ส่วน TNP (ข้อ 10-11 · mean-element ~±1–2°) ขยายพอประมาณ 20→40 · auslosung TNP (14-15 · cross-year) 6→20
- **ทุก section มี `personalFirst()` sort แล้ว** → ตัวที่แตะ ☉/MC/Asc (⭐เด่น) ลอยขึ้นบนสุดเสมอ ไม่ว่า slice เท่าไร → ของสำคัญไม่หายแม้ slice เล็ก แต่ของรองหาย

---

## ร่าง diff `render.ts` (ให้เจ้านายเคาะ · ยังไม่ลงมือ)

ตัวเลือก A = ขยายทุกจุดให้ตรง cap engine (ครบสุด · prompt ยาวสุด).
ค่าที่ใส่ = ค่า cap เดิมของ engine (ไม่ต้อง hardcode ซ้ำ — แต่แนะนำอ้าง cap ผ่านค่าคงที่ในอนาคต).

```diff
@@ render.ts · ภาพดาว Planetenbild (บรรทัด 87) — audit r2j-5 B4 @@
-    for (const pic of personalFirst(d.planetaryPictures).slice(0, 40)) {
+    for (const pic of personalFirst(d.planetaryPictures).slice(0, 60)) {   // ตรง MAX_PICTURES=60

@@ ภาพดาว 4 ดวง Vierergestirn (บรรทัด 98) @@
-    for (const fp of personalFirst(d.fourPlanetPictures).slice(0, 24)) {
+    for (const fp of personalFirst(d.fourPlanetPictures).slice(0, 40)) {   // ตรง MAX_FOURPLANET=40

@@ จุดไว sensitive Punkte (บรรทัด 110) @@
-    for (const sp of personalFirst(d.sensitivePoints).slice(0, 40)) {
+    for (const sp of personalFirst(d.sensitivePoints).slice(0, 60)) {      // ตรง MAX_SENSITIVE=60

@@ จุดกระจก Antiscia (บรรทัด 123) @@
-    for (const an of personalFirst(d.antiscia).slice(0, 24)) {
+    for (const an of personalFirst(d.antiscia).slice(0, 40)) {            // ตรง MAX_ANTISCIA=40

@@ เดคลิเนชัน Parallel (บรรทัด 136) @@
-    for (const dp of personalFirst(d.declinationPairs).slice(0, 24)) {
+    for (const dp of personalFirst(d.declinationPairs).slice(0, 40)) {    // ตรง MAX_DECL=40

@@ ภาพดาวมี TNP ร่วม (บรรทัด 164) @@
-    for (const pic of personalFirst(d.tnpPlanetaryPictures).slice(0, 20)) {
+    for (const pic of personalFirst(d.tnpPlanetaryPictures).slice(0, 60)) {  // ตรง MAX_PICTURES=60

@@ จุดไวมี TNP ร่วม (บรรทัด 170) @@
-    for (const sp of personalFirst(d.tnpSensitivePoints).slice(0, 20)) {
+    for (const sp of personalFirst(d.tnpSensitivePoints).slice(0, 60)) {    // ตรง MAX_SENSITIVE=60

@@ Auslösung groups (บรรทัด 188) @@
-    for (const g of au.groups.slice(0, 8)) {
+    for (const g of au.groups.slice(0, 24)) {                            // ตรง AUSLOSUNG_MAX_GROUPS=24

@@ Auslösung events/group (บรรทัด 191) @@
-      for (const e of g.events.slice(0, 5)) {
+      for (const e of g.events.slice(0, 10)) {                           // ตรง AUSLOSUNG_MAX_PER_GROUP=10

@@ Auslösung TNP activations (บรรทัด 198) @@
-      for (const e of au.tnpActivations.slice(0, 6)) {
+      for (const e of au.tnpActivations.slice(0, 20)) {                  // 6→20 (cap 80 · cross-year)

@@ Auslösung TNP mover (บรรทัด 204) @@
-      for (const e of au.tnpMoverContacts.slice(0, 6)) {
+      for (const e of au.tnpMoverContacts.slice(0, 20)) {                // 6→20 (cap 80 · cross-year)
```

### เพิ่ม field ที่ขาด (ทางเลือก · ไม่บังคับ)

```diff
@@ หัวข้อ 4 ดวง (บรรทัด 94) — เพิ่มค่า orb เกณฑ์ให้สม่ำเสมอกับ section อื่น @@
-  L.push("— ภาพดาว 4 ดวง (Vierergestirn · a+b = c+d · ครึ่งผลรวมสองคู่ตกค่าเดียวกันบนหน้าปัด 90° · บท 44/31) —");
+  L.push(`— ภาพดาว 4 ดวง (Vierergestirn · a+b = c+d · ครึ่งผลรวมสองคู่ตกค่าเดียวกันบนหน้าปัด 90° · orb ${packet.orbFourPlanetDeg}° · บท 44/31) —`);

@@ ตำแหน่งดาว/จุด — แสดง AriesPoint (0°♈) ที่ engine ส่งใน personalPoints แต่ render ไม่โชว์ @@
   if (!packet.hasBirthTime) {
     L.push("  (ไม่มี Meridian/Aszendent เพราะขาดเวลาเกิด — อ่านได้เฉพาะครึ่งผลรวม/ภาพดาว/จุดไว ระหว่างดาว-ดาว)");
   }
+  L.push("  • จุดเมษ (Widderpunkt · 0°♈) = ศูนย์อ้างอิงโลกของ Witte (จุดไวคงที่ · ใช้เป็น anchor ชั้นเวลา)");
```

`canonRef` หมวด H (`data.witteTransneptunians[].canonRef` / `data.tnpElementsMissing`) —
ถ้าต้องการให้ AI อ้างบท 19/40/27 ได้เอง แนบต่อท้ายบรรทัด TNP (บรรทัด 154/159). ยังไม่ร่างเป็น diff เพราะต้อง map ชื่อ→canonRef เพิ่ม (ค่อยตัดสินใจตอนลงมือ).

## ยืนยัน (บรรทัดจริง)

- render slice: render.ts บรรทัด 87, 98, 110, 123, 136, 164, 170, 188, 191, 198, 204
- engine cap: engine.ts บรรทัด 230-234 (`MAX_PICTURES=60`, `MAX_SENSITIVE=60`, `MAX_ANTISCIA=40`, `MAX_DECL=40`, `MAX_FOURPLANET=40`) + บรรทัด 525-535 (`.slice(0, MAX_*)`)
- auslosung cap: auslosung.ts บรรทัด 42-44 (`MAX_EVENTS=80`, `MAX_GROUPS=24`, `MAX_PER_GROUP=10`)
- field ไม่ push: render.ts ไม่มี reference ถึง `d.halbsummen`, `d.personalPoints`, `d.tnpElementsMissing`, `d.witteTransneptunians`, `packet.orbFourPlanetDeg`, `au.events`
</content>
</invoke>
