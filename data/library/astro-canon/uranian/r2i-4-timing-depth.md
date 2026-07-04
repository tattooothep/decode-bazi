# r2i-4 — ชั้นจับเวลา/พยากรณ์วัน (Timing Depth) ที่เติมยูเรเนียนได้อีก

> **สถานะเอกสาร:** 🔎 READ-ONLY gap analysis — วิเคราะห์ต่อยอด ไม่ใช่คำสั่งแก้โค้ด · **ไม่ฟันธงตรง** (ทุกข้อเป็น "ช่องที่เติมได้ + ระดับความแม่น + effort" ให้เจ้านายเคาะ ไม่ใช่ข้อสรุปว่า "ต้องทำ")
> **ขอบเขต:** ต่อยอดจากชั้นเวลาที่กำลังทำอยู่แล้ว (ดาวจร/ส่วนโค้งอาทิตย์/ก้าวหน้า) ใน `src/lib/astro/uranian/auslosung.ts` + เข็ม D สไนเปอร์ใน `src/lib/fusion5/day-sniper.ts`
> **หลักยึด:** กฎข้อ 9 (engine คำนวณ deterministic → AI แค่ตีความ) · NO_PERCENT · คัมภีร์ = source of truth (ห้าม fit ตำรากับสถิติ)
> **มีagent build Auslösung อยู่** — เอกสารนี้ไม่แตะโค้ด · เป็นแผนที่ช่องต่อยอดเท่านั้น

---

## 0. สรุปว่า "ตอนนี้มีอะไรแล้ว" (baseline — เพื่อไม่วิเคราะห์ซ้ำ)

| ชั้น | ไฟล์ | เทคนิค | ความละเอียด |
|---|---|---|---|
| Auslösung ช.1 | `auslosung.ts` scanTransits | ดาวจร (Transite) แตะจุด+จุดกึ่งกลางกำเนิด · มุมแข็ง 0/45/90/135/180 บนหน้าปัด 90° | รายวัน (snapshot เที่ยง · ยังไม่ bisect ชั่วโมง) |
| Auslösung ช.2 | `auslosung.ts` scanMoving solar_arc | ส่วนโค้งอาทิตย์ (Sonnenbogen) directed = natal + arc · arc = ☉progr − ☉natal | รายวัน (bisect exact) |
| Auslösung ช.3 | `auslosung.ts` prog_sun/moon/mc | เคลื่อนทุติยภูมิ ☉(~1°/ปี) ☽(~1°/เดือน) Meridian | เดือน/สัปดาห์ (bisect exact) |
| เข็ม D สไนเปอร์ | `day-sniper.ts` computeNeedleD | ดาวจรแตะจุดกึ่งกลาง natal บน dial 90° · cascade เฉพาะวัน 🔴/🟡 | รายวัน (ขัดเกลาพีค) |
| ฝั่ง Western (แยก engine) | `astro/western/timeline.ts` | solar return · eclipses+จุด natal · profection · progression · stations | รายวัน |

**ช่องว่างที่เห็นชัด:** ยูเรเนียนยัง **ไม่มี** (1) การอ่าน return chart แบบ Uranian บนหน้าปัด (2) profection/synodic-lunation เป็นนาฬิกาอิสระเลขคณิต (3) primary/converse direction (4) eclipse ยิงจุดกึ่งกลาง (5) กลไก "หมุนเข็มหน้าปัด" หา cluster (6) วิธีจัดอันดับ+confidence ข้ามชั้น (7) การถัก auslosung เข้าสไนเปอร์เป็นเข็มใหม่

---

## 1. ตารางเทคนิค timing ที่เติมได้ (จัดอันดับตาม ROI = ผลลัพธ์/effort)

> ROI = "ความแม่น/ความอิสระของนาฬิกา" ต่อ "แรงที่ต้องลง" · เรียงจากคุ้มสุด → คุ้มน้อยสุด

| # | เทคนิค | เพิ่มอะไร (นาฬิกาใหม่?) | ความแม่น | ตำราอ้าง (verbatim) | effort | ROI |
|---|---|---|---|---|---|---|
| 1 | **ถัก auslosung → สไนเปอร์เป็น "เข็ม E"** | ไม่ใช่เทคนิคใหม่ — เอา 3 ชั้นที่ build แล้ว (จร/ส่วนโค้ง/ก้าวหน้า) มาเป็นเข็มอิสระเพิ่มในสไนเปอร์ | รายวัน (มี bisect) | 10-witte C บท 12 S.48 (ดาวจร×จุดไว = วันเหตุการณ์) | **ต่ำ** (engine พร้อม · แค่ wire+นับเข็ม) | ⭐⭐⭐⭐⭐ |
| 2 | **Eclipse ยิงจุดกึ่งกลาง (dial 90°)** | บริบทหนัก (คราสตกบนแกนสมมาตร ไม่ใช่แค่ทับจุดเดี่ยว) | นาที (คราส) / หน้าต่างอิทธิพล เดือน | 10-witte C/H บท 27 S.95 "Planeten an Kardinalpunkten…bringen Todesfälle" + บท 42 vorgeschobene über Kardinalpunkte | **ต่ำ** (reuse findEclipses + dial90Distance) | ⭐⭐⭐⭐⭐ |
| 3 | **Profection / Synodische Lunation = นาฬิกาเลขคณิตอิสระ** | ✅ นาฬิกาอิสระจริง (arc คงที่ 29°08'/ปี — ไม่ derive จาก ephemeris จริง) | เดือน/สัปดาห์ | 10-witte D บท 14 S.55 "Profektionsbogen 1 Jahr 29°08', Woche 33,2', Tag 5'" + บท 15 Profektion | **ต่ำ** (เลขคณิตล้วน · moverLon 1 บรรทัด) | ⭐⭐⭐⭐⭐ |
| 4 | **bisect ชั่วโมง สำหรับดาวเร็วในชั้นจร** | ยกความละเอียดจร "รายวัน → รายชั่วโมง" (Witte: Mond=Stunde, Meridian=Minute) | ชั่วโมง/นาที | 10-witte C บท 12 S.42 "Sonne=Tag, Mond=Stunde, Meridian=Minute" | **ต่ำ-กลาง** (มี bisect pattern อยู่แล้วใน day-sniper moon) | ⭐⭐⭐⭐ |
| 5 | **Solar / Lunar Return อ่านแบบ Uranian** | Meridian/Asc ของ return chart ยิงจุดกึ่งกลาง natal บนหน้าปัด | คืน return = ชั่วโมง · เหตุการณ์ที่ปลุก = วัน/สัปดาห์ | 10-witte D บท 43 "Lunarhoroskop eines Tages" (⚠️ ดูข้อ 5 caveat) + บท 33 Tageshoroskop | **กลาง** (findReturnInstant มีแล้ว · ต้องปั้น return-chart Meridian/Asc) | ⭐⭐⭐ |
| 6 | **หมุนเข็มหน้าปัด (Zeiger/Arbeitspunkt) หา cluster** | มุมมอง presentation — ตั้ง "จุดทำงาน" (arc อายุ/ดาวจร) แล้วอ่านทุกอย่างที่มาเรียงในลำแสงเดียว | ตามชั้นที่หมุน (วัน) | 10-witte E บท 44 S.55 "Ein transitierender Planet löst…ein Planetenbild aus…Symmetrieachse gibt das Ereignis" | **กลาง** (inversion ของ scan เดิม + จัดกลุ่ม) | ⭐⭐⭐ |
| 7 | **Primary direction / Converse** | นาฬิกา RA/oblique-ascension (คนละแกนกับ ecliptic) | ปีระดับ (เปราะต่อเวลาเกิด: 4 นาที = 1° = 1 ปี) | 10-witte E บท 44 Direktionen (Witte เน้น Sonnenbogen ไม่ใช่ primary คลาสสิก) | **สูง** (ต้อง RA + house system + oblique asc — ไม่มีใน astro-core) | ⭐ |

---

## 2. รายละเอียดแต่ละเทคนิค (โยงตำรา + จุด wire)

### เทคนิค 1 — ถัก auslosung เข้าสไนเปอร์เป็น "เข็ม E" (คุ้มสุด)
- **แก่น:** สไนเปอร์วันนี้มีเข็ม A(流日) · B(จันทร์จริง) · C(ดาวช้า) · D(จุดกึ่งกลางจร) แต่ **ยังไม่ดึง solar-arc/progression ของยูเรเนียนเข้ามาเลย** ทั้งที่ `auslosung.ts` คำนวณครบแล้ว
- **ทำไมเป็นนาฬิกาอิสระ:** ส่วนโค้งอาทิตย์ (secondary, day-for-year) และ progression **ไม่ใช่ตำแหน่งดาวจรจริง** ในวันนั้น → อิสระจากเข็ม C/D เชิงกลไก (คนละสูตรเวลา) แบบเดียวกับที่ A(60 วัน)อิสระจาก B(จันทร์)
- **ตำรา:** บท 12 S.48 „Der Tag eines Ereignisses wird durch die Verbindung der laufenden Planeten mit den sensitiven Punkten der Radixhoroskope…gefunden" + บท 43 S.187 „Grundgesetze" (ลำดับ latent→ausgelöst)
- **โยงสไนเปอร์:** เพิ่ม `needles: "E"` = วันที่ solar-arc/prog แตะจุดไว/จุดกึ่งกลางในหน้าต่าง ±orb → ถ้า E ตรงกับ A/B/C/D วันเดียวกัน = ยกระดับธง (นับโครงสร้าง ไม่ใช่คะแนน)
- **caveat ที่ต้องกันบาปสถิติ:** solar-arc มี ~66 จุดกึ่งกลาง × 5 มุม → "หาอะไรก็เจอ" ต้องใช้ **cascade เดียวกับ D** (ยิงเฉพาะวันที่ผ่านชั้นบนแล้ว) + orb เข้ม (ลิปดา) ไม่ใช่สแกนทั้งช่วง

### เทคนิค 2 — Eclipse ยิงจุดกึ่งกลาง
- **วันนี้:** `western/timeline.ts:178` หา eclipse + เช็คทับ/เล็งจุด natal (จุดเดี่ยว) orb ≤3° เท่านั้น — **ยังไม่เช็คจุดกึ่งกลาง**
- **เติม:** เอา `eclipseLon` มาผ่าน `dial90Distance(eclipseLon, hs.mid)` เทียบทุกครึ่งผลรวม (มุมแข็งครอบทั้งแกน mid|mid+180 ในนิพจน์เดียว — คณิตเดียวกับ engine.ts)
- **ตำรา:** Witte จัด Kardinalpunkte/Widderpunkt เป็นแกนหลักของ Auslösung (บท 27 S.95 กฎการตาย 4 ข้อ · บท 42 S.139 „Vorgeschobene und laufende Planeten über diese Punkte…wirken auslösend") — คราสคือดาวจร ☉☽ ที่ตรงแกนพอดี จึงเป็น trigger คลาสสิก
- **ความแม่น:** ตัวคราส = นาที (instant) แต่ Witte ถือเป็น "หน้าต่างอิทธิพล" หลายเดือน → ใช้เป็น **บริบทหนัก (context flag)** ไม่ใช่ธงวันเป๊ะ (สอดคล้อง doctrine 應期 = หน้าต่าง ไม่ใช่วันลอย)

### เทคนิค 3 — Profection / Synodische Lunation (นาฬิกาเลขคณิตอิสระ · สำคัญเชิงหลักการ)
- **แก่น:** Witte บท 14 S.53–55 ให้ **"1 lunation = 1 ปี"** และ **Profektionsbogen = 29°08'/ปี · 33.2'/สัปดาห์ · 5'/วัน** (ต่างจาก 30°/ปี ที่เป็น "การปัดเพื่อสะดวก")
- **ทำไมมีค่า:** นี่คือ arc **คงที่เชิงเลขคณิต** — ไม่ derive จากตำแหน่งดวงอาทิตย์จริง (ต่าง solar-arc ที่ผูก ephemeris) → เป็นนาฬิกาอิสระตัวที่สอง คู่กับ solar-arc เหมือน A(流日)คู่ B(จันทร์)ในสไนเปอร์
- **เติม:** `scanMoving("profection", pt, age => norm360(pt.lon + 29.1333*age), …)` — เพิ่ม moverLon ตัวเดียว ใช้ scan/bisect เดิมได้เลย
- **ความแม่น:** สัปดาห์/เดือน (5'/วัน → orb 30' ≈ ±6 วัน) — หยาบกว่า transit แต่ **ตรงกับ transit เมื่อไหร่ = สัญญาณแข็ง** (เพราะสองนาฬิกาไม่แชร์สูตร)
- **บท 43 เสริม:** „müssen die Tage für die scharfen Aspekte des Mondes mit der Sonne…immer dieselben…bleiben" → เฟสจันทร์ (Mondphasen) ของปีนั้นล็อคที่ตำแหน่งเดิม = ปฏิทินเฟสส่วนตัว (แจกเป็น context ได้)

### เทคนิค 4 — bisect ชั่วโมงสำหรับดาวเร็ว
- **วันนี้:** `scanTransits` ใช้ snapshot เที่ยง UTC → ได้แค่ "วัน" · สำหรับดาวเร็ว (☉☿♀♂) และ Meridian จร ตำราให้ลงถึงชั่วโมง/นาทีได้
- **ตำรา:** บท 12 S.42 „Die Sonne ist der Auslöser für den Tag, der Mond für die Stunde und der Meridian für die Minute" — Witte แยกชั้นเวลาชัด: วัน→ชั่วโมง→นาที
- **เติม:** reuse `bisectMs` pattern จาก day-sniper (เข็ม B จันทร์ทำอยู่แล้ว) กับดาวเร็ว → ได้เวลาไทย HH:MM ของ exact hit
- **ความแม่น:** ชั่วโมง (ดาวเร็ว) / นาที (ถ้าใส่ Meridian จร — ต้องมีเวลาเกิด) — **เฉพาะวันติดธงแล้ว** (ขัดเกลา ไม่สแกนหมด)

### เทคนิค 5 — Solar / Lunar Return อ่านแบบ Uranian ⚠️ (มี caveat ตำรา)
- **⚠️ caveat สำคัญ (ห้ามสับสน):** บท 43 „Lunarhoroskop **eines Tages**" ของ Witte = **ดวงจันทร์รายวัน** (Mond = ตัวแทน astronomische Länge des Ortes/Asc) **ไม่ใช่** modern monthly lunar return (จันทร์กลับจุดเกิด) · การนำ "lunar/solar return สมัยใหม่" มาใช้ ต้องติดป้ายว่าเป็น **"การอ่านเชิงวิธีสากล" ไม่ใช่ verbatim Witte** (กันปลอมตำรา — ตาม 00-source-policy)
- **สิ่งที่ตรง Witte จริง:** บท 33 Tageshoroskop + บท 36 „Der Tag ist das Spiegelbild des Jahres" → ดวงรายวัน/รายปีที่ Meridian+Asc หมุนเป็นตัวชี้เวลา
- **เติมแบบซื่อตรง:** ใช้ `findReturnInstant` (มีใน western) หาโมเมนต์ ☉/☽ กลับจุดเกิด → ปั้น Meridian/Asc ของ return → ยิงจุดกึ่งกลาง natal บน dial 90° · **แต่ label ว่า "return (วิธีสากล)"** แยกจากชั้น Witte
- **ความแม่น:** โมเมนต์ return = ชั่วโมง · เหตุการณ์ที่มันปลุก = วัน/สัปดาห์

### เทคนิค 6 — หมุนเข็มหน้าปัด (Zeiger) หา cluster
- **แก่น Uranian จริง:** นักยูเรเนียนหมุน "เข็มชี้" (Arbeitspunkt) ไปที่ปัจจัยเคลื่อน (เช่น arc อายุ หรือดาวจร) แล้วอ่าน **ทุกจุด/ภาพดาวที่มาเรียงในลำแสงเดียว** พร้อมกัน
- **ในโค้ด = inversion:** วันนี้ scan เป็น "ต่อเป้า natal" · หมุนเข็ม = "ต่อจุดชี้ (วัน/arc)" แล้ว list ทุก natal factor+midpoint ที่ ≤orb — ได้ "ภาพเหตุการณ์รวม" ของวันนั้น
- **ตำรา:** บท 44 S.55 „Ein transitierender Planet löst in den meisten Fällen nicht nur einen Planeten, sondern ein Planetenbild aus und die Aussage dieses Bildes…in dessen Symmetrieachse gibt das kommende Ereignis" — จุดชี้เดียวปลุกทั้งภาพดาว ไม่ใช่จุดเดียว
- **ค่าเชิง presentation:** วันที่ "เข็มเดียวเรียงหลายจุด" = candidate เหตุการณ์แรงสุด → ใช้จัดพีค (จำนวนจุดที่เรียง = ความเข้ม เชิงโครงสร้าง)

### เทคนิค 7 — Primary / Converse direction (คุ้มน้อยสุด · แนะชะลอ)
- **ทำไม effort สูง:** primary direction ใช้ RA + oblique ascension + house-system (Placidus/Regiomontanus) — `astro-core` ปัจจุบันเป็น ecliptic longitude ล้วน ไม่มี RA/OA
- **เปราะต่อเวลาเกิด:** 4 นาทีของเวลาเกิด = ~1° = ~1 ปีของทายา → user ส่วนใหญ่ไม่มีเวลาเกิดแม่นระดับนั้น = ได้ error มากกว่าสัญญาณ
- **Witte เองเน้น Sonnenbogen ไม่ใช่ primary:** บท 43 S.187 „Der allein maßgebende Direktionsbogen ist der Sonnenbogen" — Witte เลือก solar-arc เป็น direction หลัก (ซึ่ง build แล้ว) · primary คลาสสิกอยู่นอกแกนสำนัก Hamburg
- **converse:** ถ้าจะทำ ให้ทำ converse ของ solar-arc/progression (ง่าย = arc ติดลบ) ก่อน primary — คุ้มกว่ามากและอยู่ในแกน Witte

---

## 3. วิธีจัดอันดับ + นำเสนอ "วันไหนแม่นสุด" + confidence (โยงตรงสไนเปอร์)

**หลักการ (สืบ doctrine เข็มอิสระของสไนเปอร์ · ไม่มี weight แต่งเอง):**

1. **นับนาฬิกาอิสระที่ชี้วันเดียวกัน (independent-clock count)** — ยิ่งหลายชั้นที่ *ไม่แชร์สูตรเวลา* ตรงกัน ยิ่งแข็ง:
   - เลขคณิตล้วน: 流日(A) · Profection(เทคนิค 3)
   - ดาราศาสตร์จริง: จันทร์(B) · ดาวช้าจร(C) · จุดกึ่งกลางจร(D)
   - secondary (day-for-year): solar-arc + progression(เทคนิค 1 = E)
   - คราส(เทคนิค 2 = บริบท)
   → **confidence = จำนวนกลุ่มสูตรที่ตรง** (ไม่ใช่จำนวน hit ดิบ — กัน 66 midpoint พองคะแนน)

2. **ความคมของ orb (ลิปดา)** — ใช้จัดพีค *ภายใน* หน้าต่างที่นับเข็มได้แล้ว (เหมือน D score วันนี้) · ไม่ใช้ยกธง

3. **น้ำหนักความหายากของดาวช้า** — ดาวช้า (Saturn→Pluto) แตะจุดกึ่งกลาง = เกิดยาก/ปีละไม่กี่ครั้ง → เชิงโครงสร้างมีค่ากว่าดาวเร็ว (ไม่ใช่ magic number — เป็น "ความหายากเชิงคาบโคจร")

4. **นำเสนอเป็นหน้าต่าง+พีค (ไม่ใช่วันตายตัว)** — ตาม `SniperWindow` ที่มีแล้ว: `±plusMinusDays` = 1 เมื่อมี exact hit ดาวเร็ว/bisect · กว้างขึ้นเมื่อเป็นดาวช้า/profection (orb หยาบ) → **ซื่อตรงต่อ 應期 = ช่วงเฝ้าระวัง** (bazi-authority-yingqi-timing.md:20-39)

5. **ป้าย confidence เชิงคำ (ไม่ใช่ %)** — เสนอ 3 ระดับตามจำนวนกลุ่มสูตรอิสระ:
   - "หลายนาฬิกายืนยันตรงกัน" (≥3 กลุ่ม) · "สองนาฬิกาอิสระตรงกัน" (2 กลุ่ม) · "สัญญาณเดี่ยว เฝ้าดู" (1 กลุ่ม) — **NO_PERCENT**

**ตำรารองรับการนับซ้อนชั้น:** บท 43 S.187 ลำดับ latent→ausgelöst (Kardinalpunkte←Sonne←Mond←Meridian) = ตำราเองก็ให้ "หลายชั้นยืนยันกัน" ก่อนฟันเหตุการณ์ · บท 08 S.145 „rhythmische Wiederkehr" = เหตุการณ์คล้ายวนซ้ำเมื่อภาพดาวเดิมถูกปลุกอีก (ใช้ตรวจ back-test ได้)

---

## 4. ต่อยอดเข็ม D สไนเปอร์ตรงจุดไหน (actionable map · ไม่ใช่คำสั่งแก้)

| ต่อยอด | จุดในโค้ด (อ้างอิงเฉย ๆ) | ผล |
|---|---|---|
| เพิ่ม **เข็ม E = auslosung** (solar-arc+prog แตะจุดกึ่งกลาง) | `day-sniper.ts` computeNeedleD ข้างเข็ม D · reuse `computeUranianAuslosung` | เข็มอิสระตัวที่ 5 · ยก 🔴 เมื่อ E+อื่นตรงวัน |
| **Profection arc** เป็นเข็มเลขคณิต | เพิ่ม moverLon คงที่ 29.1333°/ปี ใน scanMoving | นาฬิกาอิสระคู่ 流日 ฝั่งยูเรเนียน |
| **bisect ชั่วโมง** ดาวเร็วในวันติดธง | reuse `bisectMs` (เข็ม B ใช้อยู่) กับ computeNeedleD | พีคระบุ HH:MM ไม่ใช่แค่วัน |
| **Eclipse→midpoint** เป็น context | `dial90Distance(eclipseLon, mid)` ใน loop context flags (kept days) | บริบทหนักบนพีค |
| **จัดพีคด้วย independent-clock count** | `buildSniperWindows` เปลี่ยนเกณฑ์พีคจาก D-score เดี่ยว → นับกลุ่มสูตรที่ตรง | พีคสะท้อน "แม่นสุด" ตรงหลักตำรา |

**หลักกันพลาดที่ต้องคงไว้ (จาก comment เข็ม D เดิม):**
- **cascade หยาบ→ละเอียด** — ทุกชั้นลึก (E/profection/eclipse) ยิง *เฉพาะ* วันที่ผ่าน A/B/C แล้ว · ห้ามสแกนทั้งช่วง (กันบาปสถิติ "จุดกึ่งกลาง ~66 จุด หาอะไรก็เจอ")
- **เรขาคณิตล้วนในเฟสนี้** — บรรยายได้แค่ข้อเท็จจริงมุม/orb · ความหมายภาพดาว (Witte verbatim หมวด A/E/H) รอเฟสพจนานุกรม (Regelwerk 1932) เข้าก่อน · **ห้ามแต่งคำทำนาย**
- **deterministic** — ไม่มี Date.now/random · รับ dtUTC+ช่วงเป้าเท่านั้น

---

## 5. สรุปลำดับที่เสนอ (แต่รอเจ้านายเคาะ — ไม่ฟันธง)

**ผมเสนอเรียงคุ้มสุดก่อน (เหตุผล = engine พร้อม/ตรงแกน Witte/นาฬิกาอิสระจริง):**
1. **เทคนิค 1 (ถัก auslosung→เข็ม E)** — engine build เสร็จแล้ว แค่ wire = ได้นาฬิกาอิสระเพิ่มทันที
2. **เทคนิค 3 (Profection เลขคณิต)** — 1 บรรทัด moverLon · เป็นนาฬิกาอิสระเชิงหลักการ (ตรง Witte บท 14)
3. **เทคนิค 2 (Eclipse→midpoint)** — reuse ล้วน · บริบทหนักตรงตำรา Kardinalpunkte
4. **เทคนิค 4 (bisect ชั่วโมง)** — ยกความละเอียดตรง "Mond=Stunde" ของ Witte
5. **เทคนิค 5/6 (Return/Zeiger)** — effort กลาง · ทำเมื่อ 1-4 นิ่ง
6. **เทคนิค 7 (Primary)** — ชะลอ (effort สูง · เปราะเวลาเกิด · นอกแกน Hamburg)

**ย้ำ (ตามที่สั่ง):** เอกสารนี้เป็น gap analysis — **ไม่ได้บอกตรงว่าต้องทำอันไหน** · ทุกข้อคือ "ช่องที่เติมได้ + ต้นทุน + ตำรารองรับ" ให้เจ้านายเลือก · ไม่มีการแก้โค้ดใน session นี้

---

### ภาคผนวก — ข้อควรระวังตำรา (source-policy)
- **Lunarhoroskop (บท 43) ≠ modern lunar return** — ถ้าใช้ return สมัยใหม่ต้องติดป้าย "วิธีสากล" ไม่ปลอมเป็น verbatim Witte
- **สัญลักษณ์ดาว/องศาใน OCR เพี้ยน** — ทุกครั้งที่จะแสดงตัวเลของศา ต้องเทียบสแกน `r2c-src-witte-NN-*.pdf` (คำเตือน 10-witte-canon ข้อ 2-3)
- **ห้ามรวม** Apollon/Admetos/Vulkanus/Poseidon (Sieggrün · ลิขสิทธิ์) · Cupido/Hades/Kronos/Zeus เฟส 1 ยังไม่มีตำแหน่ง (รอ SwissEph/Witte-Ephemeride เฟส 2)
- **ความหมายภาพดาว (พจนานุกรม)** ยังรอ Regelwerk 1932 verbatim (`10-regelwerk-witte-1932-de.md` สถานะ 🟡 รอเนื้อ) — timing depth นี้เติม "แกนเวลา" ได้ก่อน แต่ "คำตีความ" ต้องรอเล่ม
