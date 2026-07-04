# r2k-5 · ออกแบบใส่ยูเรเนียนเข้า Resonance R1-R6 (READ-ONLY · ห้ามแก้โค้ด)

วันที่: 4 ก.ค. 2026 · ต่อยอดจาก audit **r2j-4** (`r2j-4-fusion-integration.md` ข้อ 1 = 🔴 "ยูเรเนียนถูกตัดออกทั้งชั้น resonance")
ขอบเขต: อ่านโค้ดจริง ออกแบบเท่านั้น — **ไม่มี patch จริง** · ทุก diff ในไฟล์นี้เป็น "ร่างเสนอ" ห้ามถือว่าลงแล้ว
ไฟล์ที่อ่านยืนยัน: `src/lib/fusion5/resonance.ts` (ครบ 1036 บรรทัด) · `src/lib/astro/uranian/{engine,auslosung}.ts` · `src/lib/astro/western/timeline.ts` · `src/lib/fusion5/disciplines.ts` · `src/app/api/sifu/fusion5/route.ts`

> ⚠️ ซื่อตรง: ยังไม่ได้รันดวงตัวอย่างเทียบ auslosung↔western (เหมือน r2j-4 ข้อ 96-98) จุดที่ยืนยันด้วยการรันไม่ได้ กำกับ "ยังไม่ได้รันยืนยัน" ทุกครั้ง

---

## สรุปหัวใจ (ต้องอ่านก่อน)

ยูเรเนียน **ควรเข้า resonance แต่ไม่ควรเข้าทาง R2 แบบไร้ยาม** เพราะ **ชั้นดาวจร (Transite) ของ auslosung = ดาวดวงเดียวกัน กรอบราศีเดียวกัน แหล่ง ephemeris เดียวกันกับ western เป๊ะ** → ถ้าปล่อยให้ "ยูเรเนียน-เสาร์จร" ไปจับกลุ่มกับ "ตะวันตก-เสาร์จร" ในเดือนเดียวกัน ระบบจะอ่านเป็น "2 ศาสตร์ยืนยันตรงกัน" ทั้งที่เป็น **การวัดของชิ้นเดียวกันสองครั้ง** = overcount ตรงตามที่โจทย์เตือน "ห้ามนับซ้ำถ้าตรงโดยโครงสร้างกับ western"

**คุณค่าที่ไม่ซ้ำใครของยูเรเนียนใน resonance ไม่ได้อยู่ที่ดาวจร แต่อยู่ที่ "นาฬิกาอีกเรือน" คือ ส่วนโค้งอาทิตย์/เคลื่อนทุติยภูมิ (Sonnenbogen/Sekundär-progression)** ซึ่งเป็นระบบเวลาคนละชนิดกับดาวจรทุกศาสตร์ (western/vedic/qizheng ล้วนเป็น transit) → **นี่คือหลักฐานอิสระจริง**

**ข้อเสนอ 2 เฟส:**
- **เฟส 1 (แนะนำ · เสี่ยงต่ำ · ของพร้อม):** ยูเรเนียนเข้า **R6** เป็น "เสียงอารยธรรมที่ 4" ผ่านมุมแข็ง **directed/progressed** เสาร์/☉/Meridian → natal (นาฬิกาอิสระ · ไม่ทับ western transit)
- **เฟส 2 (ทางเลือก · ต้องมี guard independence + รันเทียบก่อน):** ยูเรเนียนเข้า **R2** ผ่าน auslosung **transit** แต่ต้องตีตรา `structural` เมื่อจับกลุ่มกับ western บนดาวดวงเดียวกัน (ไม่งั้น overcount)

---

## 1. RESONANCE_SCIENCES + R1-R6 ทำงานยังไง (สรุปจากโค้ดจริง)

`RESONANCE_SCIENCES` (resonance.ts:43-44) = `["western","vedic","ziwei","qizheng"]` · type `ResonanceScience = Extract<ScienceId,"western"|"vedic"|"ziwei"|"qizheng">`
route.ts:712 `resonanceSciences = runSciences.filter(s ∈ RESONANCE_SCIENCES)` → ยูเรเนียนถูกกรองทิ้งอัตโนมัติทุกครั้ง (ถึง user เลือกก็ไม่เข้า)

| ชั้น | ความหมาย | กลไกจับตรงกัน | ศาสตร์ที่ร่วมตอนนี้ |
|------|----------|----------------|---------------------|
| **R1** | ธีมปีตรงกัน (เรือน 1-12) | profection (western) · Muntha (vedic) · 流年命宮 (ziwei) → map ธีมเรือน · ≥2 ศาสตร์ธีมเดียว | W/V/Ziwei |
| **R2** | **ดาวจริงดวงเดียวกันชนหลายกรอบ เดือนเดียวกัน** | `clusterByMonth` จับกลุ่มด้วย key `เดือน:planet` (physical key) · ≥2 ศาสตร์ = cluster | W/V/Qizheng |
| **R3** | คราส/ราหูเกตุ ตรงเดือน | `clusterEclipseByMonth` จับรายเดือน (driver eclipse/node/sun) | W/Qizheng |
| **CONFLICT** | เดือนที่ศาสตร์นึงดีล้วน อีกศาสตร์ร้ายล้วน | `findConflicts` polarity รายเดือน | W/Qizheng (vedic ไม่ร่วม) |
| **R4** | เสียงสะท้อนดวงคู่ 4 มิติ | โหวต ดี/กลาง/ตึง ต่อระบบ จาก engine ตรง (synastry มุม/kuta/กิ่ง) | W/V/bazi/Ziwei |
| **R5** | สะพานธาตุ 用神 | ดาวธาตุ用神 (western map จีนโบราณ) + 七政流年ดาวธาตุ | W/Qizheng (ziwei ข้ามซื่อตรง) |
| **R6** | ปีชง 3 อารยธรรม | กิ่งปี (bazi) · เสาร์จรหนัก (western) · SadeSati (vedic) → voiceCount 0-3 | bazi/W/V |

**กลไก independence v3 (resonance.ts:108-135) — แกนของงานนี้:**
- `ResonanceIndependence = "structural" | "independent"` · `independent` มาก่อนเสมอ (render 🥇 vs ℹ️ · สรุปนับเฉพาะ independent · resonance.ts:918-920)
- ปัจจุบันจัดชั้นด้วย **planet-based boolean**: R2 `structural` เมื่อ `planet ∈ SUN_DRIVEN_PLANETS` (={Sun}) · R3 `structural` เมื่อ `driver==="sun"` ทุก entry (resonance.ts:190,218)
- ปรัชญา (resonance.ts:125-127): ดาวที่ "ปฏิทินตัวนับมองไม่เห็น" (Saturn/Uranus/… จริง/คราส/ราหูจริง) = ทองคำ independent · **และตัดสินใจไว้แล้วว่า** `western×qizheng ดาวจริงดวงเดียวกัน = body เดียวกันแต่ phase คนละชุด natal → ยังนับอิสระ` ← **decision เดิมที่ผมจะไม่กลับ แต่ยูเรเนียนต้องเข้มกว่านี้ (เหตุผลข้อ 3)**

---

## 2. auslosung/uranianChart มีอะไรให้ resonance บ้าง (ตรวจจากโค้ด)

**หน่วยพื้นฐาน = ecliptic longitude (tropical 0-360)** ทุกจุด — ตรงกับ western/vedic (พระเวท sidereal ต่าง ayanamsa แต่เป็น lon เหมือนกัน) และ 七政 (คำนวณ lon จริง astronomy-engine) → **เทียบข้ามได้เชิงเรขาคณิต**

- `uranianChart` (engine.ts): `points[]` (ดาวจริง 10 + Meridian/Asc) · `personalPoints[]` (☉☽MC Asc Node AriesPoint) · `halbsummen[]` (จุดกึ่งกลางทุกคู่ · field `mid` = ecliptic lon) · `planetaryPictures[]` · `sensitivePoints[]` (`pointLon`) — ทั้งหมดมี lon สากล
- `computeUranianAuslosung` (auslosung.ts:335) รับ `targetFromISO/targetToISO` เป็นช่วงอิสระ → **วนปี/เดือนได้ทันที** · คืน:
  - `events[]` แต่ละตัวมี `dateISO` (→ เดือนได้) · `method` (transit/solar_arc/prog_sun/prog_moon/prog_mc) · `mover` (key ดาว) · `natalTarget`/`natalTargetKind` (point/midpoint/sum/difference) · `natalTargetLon` · `aspect` (0/45/90/135/180) · `orbArcmin`
  - `methodCounts` (นับ event ต่อวิธี · โปร่งใส)
- **ดาวจร (TRANSITERS · auslosung.ts:36)** = `Sun,Mercury,Venus,Mars,Jupiter,Saturn,Uranus,Neptune,Pluto` (ตัด Moon จงใจ)

---

## 3. ⚠️ แกนสำคัญสุด: independence — ทำไมยูเรเนียน-transit ห้ามนับซ้ำกับ western

**ข้อเท็จจริงที่พิสูจน์จากโค้ด (ไม่ใช่สมมุติ):**

| | ดาวที่ scan | แหล่งตำแหน่ง | กรอบราศี |
|---|-------------|-------------|----------|
| western timeline (timeline.ts:113) | Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Rahu | `findAspectHits` → astro-core ephemeris | tropical |
| uranian auslosung (auslosung.ts:36,226) | Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto | `eclipticLon` → astro-core ephemeris | tropical |

**ดาวช้าที่ resonance R2 ใช้ (`westernEvents` resonance.ts:270) = Saturn/Jupiter/Mars/Uranus/Neptune/Pluto ทับกับยูเรเนียนครบทั้ง 6 ดวง** และ **เป็นฟังก์ชัน ephemeris ตัวเดียวกัน กรอบ tropical เดียวกัน**

ต่างกันแค่ 2 อย่าง:
1. **เป้า natal** — western: natal Sun/Moon/Mercury/Venus/Mars/Asc/MC/PoF (มุมสากล) · uranian: จุด+จุดกึ่งกลาง Halbsumme+จุดไว (dial 90°)
2. **ตระกูลมุม** — western 0/90/120/180 · uranian 0/45/90/135/180

**นัยเชิงโครงสร้าง (เหตุผลที่ต้อง guard เข้มกว่า western×qizheng):**
- เสาร์เคลื่อน ~12°/ปี → **อยู่ในช่วง lon เดิมเกือบทั้งปี** ดังนั้น western และ uranian จะ "เห็นเสาร์" ในเดือนซ้อนกันเพราะ **ดาวมันช้า ไม่ใช่เพราะสองนาฬิกาอิสระบังเอิญตีพร้อมกัน** → การจับกลุ่ม `เดือน:Saturn` ระหว่าง W×U จะพองปลอมเป็นระบบ
- western×qizheng ที่ spec เดิมยอมให้อิสระ ยัง "พอแก้ต่างได้" เพราะ 七政 ใช้ **ตำราเป้า (命度/身度/命主) + สำนวนมุมจีน** คนละขนบ · แต่ **W×U ใช้ ephemeris เดียว ราศี tropical เดียว** → coupling แน่นกว่า → **ถ้ายอม W×U เป็น independent = ขัดเจตนา "ห้าม overcount" ชัดเจน**

**สรุปกฎ independence สำหรับยูเรเนียน (ข้อเสนอ):**
> auslosung **method="transit"** ของดาวจริง = การวัดชิ้นเดียวกับ western transit ของดาวนั้น → cluster R2 ที่ผู้ยืนยันเป็น **{western, uranian} บน planet เดียวกัน = `structural` เสมอ** (ไม่นับเป็นหลักฐานซ้ำ)
> auslosung **method ≠ transit** (solar_arc/prog_*) = **นาฬิกาทุติยภูมิ (day-for-year) อิสระจาก transit ทุกศาสตร์** → เป็นหลักฐานอิสระจริง แต่ **ไม่ใช่ "ดาวจริงบนฟ้า"** จึง **ไม่ควรยัดเข้า R2** (R2 นิยามชัด "ดาวจริงดวงเดียวกัน" resonance.ts:9,116) — เอาไปใช้ที่ R6 แทน

---

## 4. R ไหนใช้ได้ / ใช้ไม่ได้ (ตัดสินตามของที่ engine มีจริง + independence)

| ชั้น | ยูเรเนียนเข้าได้? | เหตุผล (อิงโค้ด) | เฟส |
|------|:---:|------------------|:---:|
| **R1** ธีมปีเรือน | 🔴 **ไม่** (เฟสนี้) | auslosung เป็น event-based ไม่มี "เรือนปี" (ไม่มี Profektion house ใน engine) · Witte มี Profektion (บทความ 15) แต่ **ยังไม่ implement** → ถ้าใส่ต้องสร้าง engine เรือนปีใหม่ = **ห้ามแต่งเรือนขึ้นเอง** (กฎ 9 + ห้าม fit) | ข้าม |
| **R2** ดาวจริงชนหลายกรอบ | 🟡 **ได้แบบมี guard** | auslosung transit มีดาวจริงชน natal/midpoint จริง **แต่** ทับ western โครงสร้าง (ข้อ 3) → เข้าได้เฉพาะพร้อมตีตรา structural vs western · คุณค่าอิสระเพิ่มจริงมีแค่ตอนจับกับ vedic(sidereal)/qizheng ที่กรอบต่าง — และแม้อย่างนั้นก็ต้องรันเทียบก่อน | เฟส 2 |
| **R3** คราส/ราหู | 🔴 **แทบไม่มีของ** | auslosung **ไม่คำนวณคราส** · Node เป็นแค่ natal target ไม่ใช่ mover (TRANSITERS ไม่มี Node) → ยูเรเนียนแทบไม่เพิ่มอะไรใหม่ · ไม่คุ้มเสี่ยง | ข้าม |
| **CONFLICT** | 🔴 **ไม่** | ต้องมี polarity benefic/malefic รายเดือน · auslosung เป็น orb เชิงเรขาคณิต ล้วน "NO_PERCENT" (auslosung.ts:467) ไม่มีขั้วดี/ร้าย → **ห้ามแต่งขั้วให้ยูเรเนียน** (จะเป็น fit) | ข้าม |
| **R4** ดวงคู่ | 🔴 **ไม่** (ที่ resonance) | ต้องมี `uranianPair` engine ก่อน (r2j-4 ข้อ 5 = ยังไม่มี) · เป็นงาน `pair-interactions.ts` คนละไฟล์ ไม่ใช่ scope R additive นี้ | แยกงาน |
| **R5** สะพานธาตุ | 🟡 **ได้แต่ซ้ำ · คุณค่าต่ำ** | ดาวธาตุ用神ช้า (木/火/土) = ดาวดวงเดียวกับ western อีก (overcount แบบเดียวกับ R2) · ยูเรเนียนไม่มีตารางธาตุดาวของตัวเอง → เพิ่มความเสี่ยง fit มากกว่าคุณค่า · **ไม่แนะนำเฟสนี้** | ข้าม/หลัง |
| **R6** ปีชง 3→4 อารยธรรม | 🟢 **ได้ · ดีสุด** | ใช้ **มุมแข็ง directed/progressed** เสาร์/☉/Meridian → natal Sun/MC/Asc = **นาฬิกาทุติยภูมิอิสระจาก transit** ของ western/vedic → **เสียงที่ 4 อิสระจริง** · ของพร้อม (auslosung methodCounts แยก method แล้ว) | **เฟส 1** |

---

## 5. การออกแบบ (จุดกึ่งกลาง/ดาวยูเรเนียน ↔ เสาปาจื้อ/ตะวันตก/พระเวท ยืนยันตรงกันยังไง)

### 5.1 เฟส 1 — R6 "เสียงอารยธรรมที่ 4: ยูเรเนียน (นาฬิกาทุติยภูมิ)"

**หลักการยืนยันตรงกัน:** R6 ถามคำถามเดียว "ปีนี้หนักไหม" แต่ละอารยธรรมตอบด้วยนาฬิกาของตัวเอง —
- จีน: กิ่งปีเกิด ปะทะ กิ่งปีเป้าหมาย (值太歲/沖/刑)
- ตะวันตก: **เสาร์จร (transit)** ทำมุมหนักกับ ☉/☽/Asc
- พระเวท: SadeSati (เสาร์ sidereal transit)
- **ยูเรเนียน (ใหม่): เสาร์/☉/Meridian แบบ directed(ส่วนโค้งอาทิตย์)/progressed ทำมุมแข็ง (0/45/90/135/180) → natal ☉/MC/Asc**

**ทำไมอิสระ (ไม่ overcount):** เสียงตะวันตก+พระเวท = เสาร์ **จร (transit)** ทั้งคู่ · เสียงยูเรเนียน = เสาร์/☉ **directed/progressed** (N วันหลังเกิด = N ปี) → **คนละกลไกเวลา** ต่อให้เป็นเสาร์เหมือนกัน "เสาร์จร" กับ "เสาร์ directed" อยู่คนละ lon คนละเวลา perfect → เป็นหลักฐานคนละเรือนจริง

**ข้อมูลจาก engine ที่ใช้:** `computeUranianAuslosung(chart, dt, "${y}-01-01","${y}-12-31").events` แล้ว filter `method ∈ {solar_arc,prog_sun,prog_mc}` + `mover ∈ {Saturn,Sun,Meridian}` + `natalTargetKind==="point"` + `natalTarget ∈ {Sun,Meridian,Ascendant}` + `aspect ∈ {0,90,180}` (มุมหนัก) → `heavy = มี ≥1 event`
`voiceCount` ขยายจาก 0-3 → **0-4** (สรุป nR6 ที่ resonance.ts:923 ใช้ `>=2` เดิม ยังใช้ได้ตรง)

**⚠️ ห้าม fit:** ไม่ตีความ orb เป็น % · ไม่แต่งขั้วดี/ร้าย · แค่ "มีมุมแข็ง directed/prog เสาร์/☉ แตะจุดส่วนตัว = 1 เสียงบอกหนัก" ตามที่ตำรา Witte (Auslösung sensitiver Punkte) ให้ความหมาย "ปีถูกกระตุ้น" ตรงๆ

### 5.2 เฟส 2 (ทางเลือก) — R2 auslosung transit + guard structural

**หลักการยืนยันตรงกัน:** เดือนที่ **ดาวจริงดวงเดียว** (เช่น เสาร์) ทั้ง western (ชน natal ☉) และ uranian (ชน จุดกึ่งกลาง MC/Node หรือจุดไว) ติดพร้อมกัน — **แต่ตีตรา structural** เพราะเป็นเสาร์ดวงเดียวกัน กรอบเดียวกัน
- map `AuslosungEvent(method="transit")` → `ResonanceMonthEvent`: `science:"uranian"`, `month`(จาก dateISO), `planet`(จาก mover · ใช้ได้เฉพาะ Saturn/Jupiter/Mars/Uranus/Neptune/Pluto — ตรง PLANET_TH เดิม · ดาวเร็ว Mercury/Venus/Sun ข้าม), `dateISO`, `evidence`, `polarity:"neutral"` (ยูเรเนียนไม่ร่วม CONFLICT)
- คุณค่าอิสระที่แท้: เฉพาะ cluster ที่ผู้ยืนยันเป็น **uranian×vedic** หรือ **uranian×qizheng** (กรอบต่าง) เท่านั้น · **uranian×western บน planet เดียว = structural**

**ต้องอัปเกรด classifier independence** (ดูข้อ 6) เพราะ boolean planet-based เดิมแยกไม่ได้ว่าใครยืนยัน

**⚠️ ต้องรันเทียบก่อนเดินจริง** (r2j-4 ข้อ 96): ดูจริงว่าเดือนที่ auslosung transit เสาร์ กับ western transit เสาร์ ตรงกันบ่อยแค่ไหน — ถ้าตรงเกือบทุกเดือน ยืนยันว่า structural ถูกต้อง

---

## 6. Guard independence — วิธีที่เสนอ (กันนับซ้ำ)

ปัญหา: `clusterByMonth` ตัดสิน structural จาก **planet เท่านั้น** (resonance.ts:190) แยกไม่ออกว่า cluster นี้ยืนยันด้วยคู่ศาสตร์ไหน

**ทางเลือก guard (เรียงตามความปลอดภัย):**

- **(B) ปลอดภัยสุด — ไม่ให้ยูเรเนียน-transit เข้า R2 เลย:** ยูเรเนียนเข้า resonance ผ่าน R6 อย่างเดียว (เฟส 1) · overcount = 0 โดยโครงสร้าง · เสีย: ทิ้งไอเดีย R2 ของ r2j-4 ⭐1 บางส่วน (แต่ ⭐1 ที่แท้คือ "ยูเรเนียนได้ยืนยันร่วม" ซึ่ง R6 ก็ให้แล้ว)
- **(C) กลางทาง — เข้า R2 + ตีตรา structural แบบ science-aware:** อัป `clusterByMonth` ให้เพิ่มกฎ: ถ้า `sciences` ของ cluster ⊆ `{western, uranian}` และ planet เป็นดาวจริง → `structural` (นอกเหนือกฎ Sun-driven เดิม) · เก็บ uranian×{vedic,qizheng} เป็น independent (สอดคล้อง decision เดิม western×qizheng) · ต้องเพิ่ม logic + เทสใหม่
- **(A) ทั่วไปสุด — pairwise same-ephemeris table:** ประกาศคู่ศาสตร์ที่ "ใช้ ephemeris+กรอบเดียวกัน" ({western,uranian}) เป็น structural-pair · ยืดหยุ่นสุด แต่ over-engineer สำหรับตอนนี้

**แนะนำ:** เฟส 1 ใช้ **(B)** (ยูเรเนียนไม่แตะ R2) · ถ้าจะทำเฟส 2 จริงค่อยยก **(C)** พร้อมรันเทียบ + golden test

---

## 7. ร่าง diff (เสนอ · ยังไม่ลง · ต้องผ่านพ่อ + เจ้านาย)

### 7.1 เฟส 1 (R6 · minimal · ~40 บรรทัด)

```diff
# resonance.ts:43-44
- export type ResonanceScience = Extract<ScienceId, "western" | "vedic" | "ziwei" | "qizheng">;
- export const RESONANCE_SCIENCES: ResonanceScience[] = ["western", "vedic", "ziwei", "qizheng"];
+ export type ResonanceScience = Extract<ScienceId, "western" | "vedic" | "ziwei" | "qizheng" | "uranian">;
+ export const RESONANCE_SCIENCES: ResonanceScience[] = ["western", "vedic", "ziwei", "qizheng", "uranian"];

# resonance.ts:45  (SCI_TH ต้องครบ ResonanceScience ไม่งั้น render crash)
- const SCI_TH: Record<ResonanceScience, string> = { western: "ตะวันตก", vedic: "พระเวท", ziwei: "จื่อเวย", qizheng: "ดาวจริง七政" };
+ const SCI_TH: Record<ResonanceScience, string> = { western: "ตะวันตก", vedic: "พระเวท", ziwei: "จื่อเวย", qizheng: "ดาวจริง七政", uranian: "ยูเรเนียน" };

# R6Vote / R6Person: เพิ่ม system "uranian"
- export type R6Vote = { system: "bazi" | "western" | "vedic"; heavy: boolean | null; ... };
+ export type R6Vote = { system: "bazi" | "western" | "vedic" | "uranian"; heavy: boolean | null; ... };

# buildR6(...): รับ uranianAuslosung ปีเป้าหมาย (คำนวณใน computePerson · reuse ไม่ซ้ำ)
#   push vote uranian: heavy = มี event method∈{solar_arc,prog_sun,prog_mc} mover∈{Saturn,Sun,Meridian}
#     natalTarget∈{Sun,Meridian,Ascendant} aspect∈{0,90,180}
#   voiceCount = votes.filter(heavy===true).length  (0-4 อัตโนมัติ)

# computePerson(...): เพิ่มบล็อก uranian (คู่ขนาน western/vedic ~810-833)
+  let uranianAusKeep: UranianAuslosung | null = null;
+  if (sciences.includes("uranian")) {
+    try {
+      const uchart = uranianChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender as Gender);
+      uranianAusKeep = computeUranianAuslosung(uchart, b.dtUTC, `${targetYear}-01-01`, `${targetYear}-12-31`);
+    } catch (e) { errors.push(`uranian:${...}`); }
+  }
#   ส่ง uranianAusKeep เข้า buildR6(b, targetYear, westernTlKeep, vedicTlKeep, uranianAusKeep)
```

หมายเหตุ import ที่ต้องเพิ่มหัวไฟล์: `uranianChart, type UranianChart` (engine) · `computeUranianAuslosung, type UranianAuslosung` (auslosung)
route.ts **ไม่ต้องแก้** — `resonanceSciences` filter อัตโนมัติ (712) · ต้องมั่นใจ `runSciences` มี uranian เมื่อ user เลือก (มีอยู่แล้ว)
render R6 (resonance.ts:1000-1004): เพิ่มบรรทัดเสียงยูเรเนียน · เปลี่ยน `→ ${voiceCount}/3` เป็น `/${votes.length}` หรือ `/4`

### 7.2 เฟส 2 (R2 · เพิ่มจากเฟส 1 · ต้อง guard (C) + รันเทียบ)

```diff
# ResonancePlanet เดิมครอบ Uranus/Neptune/Pluto/Saturn/Jupiter/Mars อยู่แล้ว → ไม่ต้องแก้ type
# เพิ่ม uranianTransitEvents(aus): map method==="transit" · mover∈R2set → ResonanceMonthEvent(science:"uranian",polarity:"neutral")
#   push เข้า monthEvents ใน computePerson
# clusterByMonth: เพิ่มกฎ structural แบบ science-aware (guard C)
-  independence: SUN_DRIVEN_PLANETS.has(planet) ? "structural" : "independent",
+  independence: (SUN_DRIVEN_PLANETS.has(planet)
+     || isSameEphemerisOnly(sciences)) ? "structural" : "independent",
#   isSameEphemerisOnly = sciences ทั้งหมด ⊆ {western,uranian}  (คู่ tropical ephemeris เดียว)
# + golden/unit test: cluster {western,uranian}Saturn = structural · {uranian,vedic}Saturn = independent
```

---

## 8. Effort + ความเสี่ยง "ห้าม fit"

| งาน | effort | ความเสี่ยง fit/overcount | หมายเหตุ |
|------|--------|--------------------------|----------|
| **เฟส 1 (R6 เสียงที่ 4)** | **ต่ำ-กลาง** (~40-60 บรรทัด + เทส R6) | **ต่ำ** — เป็นนาฬิกาอิสระจริง · ไม่มี %/ขั้ว · แค่ boolean "มีมุมแข็ง directed/prog" | ปลดล็อก r2j-4 ⭐1 "ยูเรเนียนได้ยืนยันร่วม" โดยไม่แตะ R2 |
| **เฟส 2 (R2 + guard C)** | **กลาง-สูง** (map events + upgrade classifier + golden test + **ต้องรันเทียบ**) | **กลาง-สูง** — ถ้า guard พลาด = overcount เสาร์ช้าทั้งปี · ต้องรัน auslosung↔western เทียบก่อน (r2j-4 ข้อ 96 ยังไม่ทำ) | ทำหลังเฟส 1 นิ่ง |
| R1/R3/R5/CONFLICT | — | **สูง (ถ้าฝืน)** | ต้อง "แต่ง" เรือนปี/ขั้ว/ตารางธาตุที่ engine ไม่มี = fit ตำรา · **ห้ามทำ** จนกว่าจะมี engine จริง |

**เส้นแดง ห้าม fit (ย้ำ):**
1. ห้ามแต่ง "เรือนปี" ยูเรเนียนเพื่อยัด R1 (Profektion ยังไม่ implement)
2. ห้ามแปลง orb (ลิปดา) เป็น % หรือขั้วดี/ร้ายเพื่อยัด CONFLICT/R5 (auslosung = NO_PERCENT โดยเจตนา)
3. ห้ามให้ uranian-transit นับเป็น independent คู่กับ western บนดาวเดียว (structural เท่านั้น)
4. ห้ามใช้ TNP (Cupido/Hades/Kronos · mean-element ±1-2°) ตัดสินเดือน/ปีใน resonance — precision ไม่พอ (engine.ts กำกับ `mean_element_fictitious`)

**ยังยืนยันไม่ได้ (ต้องรันก่อนเดินเฟส 2):** ความถี่ที่ auslosung transit เสาร์ ตรงเดือนกับ western transit เสาร์จริง (ยืนยัน structural) · ผลต่อ `RESONANCE_BLOCK_MAX_CHARS` 4500 เมื่อเพิ่มเสียง/cluster ยูเรเนียน (r2j-4 ข้อ 97)

---

## 9. ข้อเสนอสุดท้าย (ผมเสนอข้อไหน + เหตุผล)

**ทำ เฟส 1 (R6 เสียงที่ 4) ก่อน · ใช้ guard (B) คือยูเรเนียนไม่แตะ R2** — เพราะ:
- ปลดสถานะ "second-class" ของยูเรเนียนใน resonance ได้จริง (r2j-4 ⭐1) ด้วยหลักฐาน **อิสระแท้** (progressed/directed = คนละนาฬิกา)
- เสี่ยง fit/overcount ต่ำสุด · ของพร้อมใน engine · ไม่ต้องรันเทียบก่อน
- ไม่แตะ classifier independence เดิม (ไม่กระทบ jsonb/consumer)

**เฟส 2 (R2)** เก็บเป็น backlog — ทำเมื่อ (ก) เฟส 1 นิ่ง (ข) รัน auslosung↔western เทียบยืนยัน structural แล้ว (ค) เจ้านาย/พ่อ approve การอัป classifier

> ทุกอย่างข้างบน = ออกแบบ READ-ONLY · **ยังไม่แตะโค้ดจริงแม้บรรทัดเดียว** · ก่อนลงจริงต้องผ่าน 4-Phase + พ่อ review + เจ้านาย confirm
