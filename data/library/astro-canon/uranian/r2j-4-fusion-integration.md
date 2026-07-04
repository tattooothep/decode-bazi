# r2j-4 · ยูเรเนียนบูรณาการกับ fusion/5 ศาสตร์ครบแค่ไหน (READ-ONLY audit)

วันที่ตรวจ: 4 ก.ค. 2026 · ขอบเขต: อ่านโค้ดจริงเท่านั้น (ไม่รันระบบ ไม่แก้โค้ด)
ไฟล์ที่อ่าน: `src/lib/fusion5/{disciplines,resonance,day-sniper,multi-year,build-prompt,pair-interactions}.ts` + `src/lib/astro/uranian/{auslosung,engine,packet,render}.ts` + `src/app/api/sifu/fusion5/route.ts`

> ⚠️ หมายเหตุความซื่อตรง: ข้อสรุปทั้งหมดมาจากการ **อ่านโค้ด** ไม่ได้รันจริงกับดวงตัวอย่าง จุดที่ยืนยันด้วยการรันไม่ได้ ผมกำกับว่า "ยังไม่ได้รันยืนยัน"

---

## สรุปหัวใจ (1 ประโยค)

ยูเรเนียนเป็น **"peer เชิงบท (narrative peer)"** เต็มตัวแล้ว — มีแผงของตัวเอง, มีคัมภีร์, มีชั้นเวลา (Auslösung r389), มีบทในหนังสือดวงชะตา, และซินแสใหญ่ให้น้ำหนักเท่าอีก 5 ศาสตร์ในการหลอมรวม **แต่ยังเป็น "second-class" ใน 3 กลไก deterministic ที่หลอมข้ามศาสตร์: Resonance (R1-R6), Day Sniper (นับเข็มอิสระ), และ synastry ดูคู่** — ยูเรเนียนไม่เคยโผล่ใน "ตารางจุดที่หลายศาสตร์ยืนยันตรงกัน" และไม่ทำ pair เลย

---

## ตาราง Integration (6 จุดเชื่อมตามโจทย์)

| # | จุดเชื่อม | สถานะ | หลักฐาน (ไฟล์:บรรทัด) | มูลค่า | effort |
|---|----------|--------|------------------------|--------|--------|
| 1 | **Resonance R1-R6** | 🔴 **ขาด** — ยูเรเนียนถูกตัดออกทั้งชั้น | `resonance.ts:43-44` `RESONANCE_SCIENCES=["western","vedic","ziwei","qizheng"]` (uranian ไม่อยู่ · bazi ก็ไม่อยู่) | สูงมาก | สูง |
| 2 | **Multi-year timeline** | 🟡 **บางส่วน** — natal-panel มี Auslösung ปีเป้าหมาย แต่ short-circuit ออกจากบล็อกเทียบหลายปีที่ judge เห็น | `multi-year.ts:47` `if(science==="uranian") return ""` · `build-prompt.ts:2584-2585` auslosung รันแค่ปีเดียว | สูง | กลาง |
| 3 | **Day Sniper (เข็ม)** | 🟡 **ยืมเทคนิค ไม่เชื่อม engine** — เข็ม D ใช้ midpoint จาก **WesternChart** ไม่ใช่ uranianChart/auslosung | `day-sniper.ts:467,491,504` `natalMidpoints(chart:WesternChart)` · เข็ม D = precision layer ไม่ใช่เข็มอิสระ (D ไม่เปลี่ยนธง) `day-sniper.ts:707` | สูง | กลาง |
| 4 | **Judge หลอมรวม** | 🟢 **เข้าร่วมเท่าเทียม (narrative)** แต่ 🔴 **ไม่เข้าชั้น deterministic** | `route.ts:588` ส่งทุก okPanel รวม uranian · `build-prompt.ts:2783-2788` `panels.forEach` น้ำหนักเท่ากัน ไม่มี weight ตัวเลข · แต่ resonanceBlock/daySniperBlock (2789-2796) ไม่มี uranian | — (ดี) / สูง (ช่องว่าง) | — / กลาง |
| 5 | **Synastry ดูคู่** | 🔴 **ขาดทั้งหมด** — ยูเรเนียนไม่ทำ pair | `pair-interactions.ts:500-504` `pairPayload` รับแค่ western/vedic/ziwei/qizheng · `multi-year.ts:99` `renderPairTimingBlock` uranian return "" | สูง | สูง |
| 6 | **บทคัมภีร์ในหนังสือชะตา** | 🟢 **ครบมิติ** | `build-prompt.ts:2822` `BOOK_CHAPTER_ORDER=[...,"uranian"]` · directive `data/library/prompts/natal-book/read-full-uranian.md` มีจริง (6.2KB เทียบเท่าศาสตร์อื่น 5-7KB) | — (ดี) | — |

สถานะสี: 🟢 เข้าร่วมครบ · 🟡 เข้าร่วมบางส่วน · 🔴 ขาด

---

## รายละเอียดแต่ละจุด

### (1) Resonance R1-R6 — ตัดยูเรเนียนออกจริง

`RESONANCE_SCIENCES` (resonance.ts:43-44) มีแค่ 4 ศาสตร์ ยูเรเนียน **ไม่อยู่** และ comment หัวไฟล์ (บรรทัด 4) ระบุเฉพาะ "bazi ยังไม่ร่วม R1-R3" — ไม่ได้เอ่ยยูเรเนียนเลย = ยูเรเนียนถูกมองข้ามตั้งแต่ออกแบบชั้นนี้ ผลคือ:
- ที่ route.ts:712 `resonanceSciences = runSciences.filter(s ∈ RESONANCE_SCIENCES)` → uranian ถูกกรองทิ้งเสมอ
- ยูเรเนียนไม่มีทางปรากฏใน "## จุดที่หลายศาสตร์ยืนยันตรงกัน" (ตาราง markdown ที่ judge เปิดหัวคำตอบ · build-prompt.ts:2791)

**ควรเข้าไหม: ควรมาก** เพราะยูเรเนียนมีของที่ resonance ต้องการอยู่แล้ว:
- **R2 (ดาวจริงชนหลายกรอบ):** auslosung ชั้น transit จับดาวจรจริงแตะจุดกำเนิด (auslosung.ts:214 `scanTransits`) — เทียบตรงกับ western exact transit / qizheng hits ได้ทันที (แกน ecliptic เดียวกัน)
- **R5 (สะพานธาตุ用神):** ดาวยูเรเนียนก็ map ธาตุได้เหมือน western (resonance.ts:18 มี map ดาว→ธาตุจีนอยู่แล้ว)
- **จุดต่อที่ทรงพลังสุด = จุดกึ่งกลาง (Halbsumme) ↔ ปาจื้อ/ตะวันตก:** เมื่อดาวจร/directed แตะ midpoint natal (auslosung เข็มหลัก) พร้อมกับเดือนที่ western/qizheng ก็ติดสัญญาณ → นี่คือ resonance ข้ามระบบชนิดใหม่ที่ยังไม่มีใครทำ

### (2) Multi-year — Auslösung r389 มีแล้ว แต่ยังไม่ต่อบล็อกเทียบปี

- `renderMultiYearBlock` (multi-year.ts:45-94) มี handler ครบ 4 ศาสตร์ ยกเว้น uranian ที่ return "" ทันที (บรรทัด 47) เหตุผลใน comment: "เฟส 1 = แผงอ่าน natal · ยังไม่ทำชั้นเวลารายปี"
- **แต่ comment ล้าสมัยแล้ว** — auslosung r389 (`computeUranianAuslosung`) ทำชั้นเวลาได้จริง และถูกเรียกในแผง uranian ที่ build-prompt.ts:2585 **เฉพาะปีเป้าหมายปีเดียว** (`${y}-01-01` → `${y}-12-31`)
- ช่องว่าง: `computeUranianAuslosung` รับ `targetFromISO/targetToISO` เป็นช่วงอิสระอยู่แล้ว (auslosung.ts:330-331) → **ต่อ multi-year ได้ทันทีด้วย effort ต่ำ** เพียงวนปี startYear→endYear เหมือนศาสตร์อื่น สรุปย่อ "ปีไหนหนัก" จาก `methodCounts` / จำนวน event orb แคบต่อปี
- ผลของช่องว่างนี้: เวลาถามคำถามข้ามหลายปี ("2016-2026 ปีไหนหนัก") judge เห็น western/vedic/ziwei/qizheng เทียบรายปี แต่ยูเรเนียน **เงียบ** ในบล็อกเทียบ (แม้จะมีข้อมูลปีเป้าหมายในแผงตัวเอง)

### (3) Day Sniper — เข็ม D ยืมเทคนิคยูเรเนียน แต่ไม่ได้ต่อ engine ยูเรเนียน

- เข็ม D (day-sniper.ts:429-509) ใช้ **dial 90° + จุดกึ่งกลาง** = เทคนิคยูเรเนียน/Ebertin จริง **แต่คำนวณจาก WesternChart** (`natalMidpoints(chart: WesternChart)` บรรทัด 467; `midpointsFor(b, chart)` 491) ไม่ได้เรียก `uranianChart` และไม่ได้เรียก `computeUranianAuslosung`
- เข็ม D เป็น "precision layer" ที่ **ยิงเฉพาะวันที่ผ่านชั้น A/B/C แล้ว และไม่เปลี่ยนธง/ไม่นับเป็นเข็มอิสระ** (day-sniper.ts:707,759) → ยูเรเนียนจึงไม่มีสิทธิ์ "ลั่นไก" วันด้วยตัวเอง
- **auslosung เป็นเข็ม E ได้ไหม: ได้เชิงหลักการ** — auslosung มี 5 method (transit/solar_arc/prog_sun/prog_moon/prog_mc · auslosung.ts:45) ที่ให้ "วัน exact" พร้อม orb อยู่แล้ว ซึ่งเป็นคุณสมบัติเดียวกับเข็ม B/C (เข็มอิสระที่ให้ instant exact) → ยกระดับ Auslösung solar-arc/progressed เป็น **เข็ม E อิสระ** (นาฬิกา secondary-progression = อิสระจากปฏิทิน流日 และจากจันทร์จริง) จะเพิ่มมิติการยืนยันวันแบบข้ามระบบจริง
- ⚠️ ข้อควรระวัง (ตามปรัชญาไฟล์): auslosung ตัด transit Moon ทิ้งด้วยเหตุผลเดียวกับ day-sniper (เร็ว/สุ่ม · auslosung.ts:441) — ปรัชญา "กันบาปสถิติ" ตรงกัน 2 ไฟล์ ดังนั้นการเชื่อมจะเข้ากันได้เชิงแนวคิด

### (4) Judge — เท่าเทียมในบท แต่ไม่เท่าเทียมในกลไก

- **เชิงบท = เท่าเทียมเต็มตัว:** route.ts:588 ส่ง `okPanels.map(...)` ทุกศาสตร์รวม uranian เข้า `buildJudgePrompt` · ในนั้น (build-prompt.ts:2783-2788) `panels.forEach` วางทุกแผงด้วยฟอร์แมตเดียวกัน **ไม่มี weight ตัวเลข ไม่มีการตัดยูเรเนียน** และคำสั่ง judge (2777) ห้ามเอาศาสตร์หนึ่งไปหักล้างอีกศาสตร์ → โครงสร้างปฏิบัติต่อยูเรเนียนเท่าเทียม
- **เชิงกลไก deterministic = ไม่เท่าเทียม:** judge ยังได้ 2 บล็อกพิเศษ — `resonanceBlock` + `daySniperBlock` (build-prompt.ts:2789-2796) — ที่บังคับให้ judge "เปิดหัวด้วยตารางจุดที่หลายศาสตร์ยืนยันตรงกัน" ทั้งสองบล็อกนี้ **ไม่มียูเรเนียน** (ข้อ 1+3) ผลคือข้อสรุปของ western/vedic/ziwei/qizheng ได้แรงหนุน "ยืนยันหลายศาสตร์" ส่วนยูเรเนียนพูดได้แค่ในโซน "ศาสตร์เดียวเห็น" เสมอ
- สรุป: **ยูเรเนียนเป็น peer ในวงสนทนา แต่ไม่ใช่ peer ในองค์คณะโหวต deterministic**

### (5) Synastry ดูคู่ — ยูเรเนียนไม่ทำ pair เลย

- `pair-interactions.ts` มี 4 ฟังก์ชัน: `westernPair/vedicPair/ziweiPair/qizhengPair` (บรรทัด 89/212/376/435) · `pairPayload` (500-504) ไม่มี case uranian → ส่งคู่ไม่ได้
- `renderPairTimingBlock` (multi-year.ts:99) uranian return "" → ไม่มีปฏิทินร่วมของคู่
- **มีคัมภีร์รองรับแล้วแต่ยังไม่มี engine:** build-prompt.ts:479 map section `synastry: "หมวด F — vergleichende Astrologie"` ของ Witte canon ไว้แล้ว (คัมภีร์พร้อม) แต่ **ไม่มีโค้ดคำนวณ pair** (เช่น midpoint ของ A ตกทับดาว/จุดของ B, หรือ composite midpoint) → ช่องว่างเป็น engine ล้วน ไม่ใช่คัมภีร์
- นี่คือจุดที่ยูเรเนียน "แข็งเป็นพิเศษ" ในตำราจริง (Witte เน้น vergleichende Astrologie มาก) แต่ระบบยังใช้ไม่ได้

### (6) บทคัมภีร์ในหนังสือชะตา — ครบมิติ

- `BOOK_CHAPTER_ORDER` (build-prompt.ts:2822) มี uranian เป็นบทที่ 6
- directive `read-full-uranian.md` มีจริง (6,222 bytes) ขนาดเทียบเท่าศาสตร์อื่น (bazi 7.2KB / western 5.2KB / vedic 5.3KB / ziwei 5.0KB / qizheng 4.9KB) → มิติไม่ด้อยกว่าเพื่อน
- judge-book (build-prompt.ts:2844) สังเคราะห์ครบ 6 บท → บทยูเรเนียนเข้าเล่มเต็มตัว
- **จุดนี้ยูเรเนียนเป็น peer เต็มตัวแล้ว**

---

## สิ่งที่ทำให้ยูเรเนียนเป็น "peer เต็มตัว" ของอีก 5 ศาสตร์ (เรียงตามผลกระทบ)

| ลำดับ | สิ่งที่ต้องเติม | ทำไมสำคัญที่สุด | effort | ต้นทุนพร้อมใช้ |
|-------|----------------|-----------------|--------|----------------|
| ⭐1 | **ใส่ uranian เข้า Resonance (อย่างน้อย R2 ดาวจร + R5 ธาตุ用神)** | ตราบใดที่ไม่อยู่ใน RESONANCE_SCIENCES ยูเรเนียน "ยืนยันร่วม" ไม่ได้เลย = ถูกกดเป็นศาสตร์รองในทุกคำตอบหลอมรวม การแก้จุดนี้ปลดล็อกทั้งข้อ 1 และข้อ 4 พร้อมกัน | สูง | auslosung transit + map ธาตุ (resonance.ts:18) มีอยู่แล้ว |
| ⭐2 | **ต่อ Auslösung เป็นบล็อก multi-year** (วนปีใน `renderMultiYearBlock`) | ให้ judge เห็นยูเรเนียน "ปีไหนหนัก" เทียบเพื่อน · ปลดล็อก comment ล้าสมัยที่ยัง short-circuit | ต่ำ-กลาง | `computeUranianAuslosung` รับช่วงปีอิสระได้แล้ว |
| ⭐3 | **ยกระดับ Auslösung solar-arc/progressed เป็นเข็ม E ใน Day Sniper** | เพิ่มนาฬิกาอิสระตัวที่ 4 (secondary progression อิสระจาก 流日/จันทร์/ดาวช้า) = ยืนยันวันข้ามระบบแบบใหม่ | กลาง | auslosung ให้ instant exact + orb แล้ว |
| 4 | **สร้าง `uranianPair` ใน pair-interactions + `renderPairTimingBlock`** | ปลดล็อก "ดูคู่" ซึ่งเป็นจุดแข็งดั้งเดิมของ Witte (vergleichende Astrologie) · คัมภีร์พร้อม (หมวด F) ขาดแค่ engine | สูง | section map มีแล้ว (build-prompt.ts:479) |
| 5 | (ทางเลือก) **เปลี่ยนเข็ม D ให้ดึง midpoint จาก uranianChart แทน WesternChart** | ให้เข็ม D เป็นยูเรเนียนจริง (รวม personalPoints/AriesPoint/sensitive points ที่ western chart ไม่มี) | กลาง | uranianChart มี midpoint/Halbsumme ครบกว่า |

**ประโยคชี้ขาด:** ถ้าทำได้แค่ข้อเดียว = **⭐1 (Resonance)** เพราะเป็นตัวเดียวที่เปลี่ยนยูเรเนียนจาก "ศาสตร์เดียวเห็น" เป็น "ยืนยันหลายศาสตร์" ในสายตา judge — จุดอื่นเสริมความละเอียด แต่จุดนี้เปลี่ยน "สถานะ peer"

---

## สิ่งที่ยืนยันไม่ได้ (บอกตรงตามกฎ)

1. **ยังไม่ได้รันยืนยัน** ว่า auslosung ให้ผลลัพธ์ที่ "ตรงกับ" western transit ในเดือนเดียวกันจริงหรือไม่ (เป็นสมมุติฐานเชิงเรขาคณิต — ต้องรันดวงตัวอย่างเทียบ ถึงจะยืนยันว่า resonance R2 ยูเรเนียนจะไม่ overcount กับ western)
2. **ไม่ได้ตรวจ** ว่าการเพิ่มยูเรเนียนเข้า resonance/day-sniper จะทำ prompt เกิน `FUSION_PANEL_PROMPT_MAX_CHARS`/budget หรือไม่ (ต้องวัดจริง)
3. **ไม่ได้ตรวจปรัชญา independence** ของ resonance v3 (resonance.ts:22-24 มี independence tagging) ว่าจะจัด auslosung-transit เป็น "อิสระ" หรือ "ต้องตรงโดยโครงสร้าง" กับ western transit — จุดนี้ต้องคิดเชิงตำรา+สถิติก่อนเดินจริง (เกินขอบเขต read-only นี้)
4. เนื้อใน `read-full-uranian.md` ผมยืนยันแค่ว่า **มีไฟล์+ขนาดเทียบเท่า** ไม่ได้อ่านทีละมิติเทียบว่าครอบทุกหัวข้อชีวิตเท่าศาสตร์อื่นจริง (ถ้าต้องการ ตรวจเพิ่มได้)

---

## ภาคผนวก · สถานะ 6 ศาสตร์ในแต่ละกลไก (ตารางเช็ก)

| กลไก | bazi | ziwei | qizheng | western | vedic | **uranian** |
|------|:----:|:-----:|:-------:|:-------:|:-----:|:-----------:|
| แผงอ่าน + คัมภีร์ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ชั้นเวลา (timing engine) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (auslosung r389) |
| Multi-year เทียบปี | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 (short-circuit) |
| Resonance R1-R6 | 🔴 | ✅ | ✅ | ✅ | ✅ | 🔴 |
| Day Sniper (เข็มอิสระ) | ✅ A | — | ✅ C | ✅ B/D | — | 🟡 (D ยืมเทคนิค) |
| Synastry ดูคู่ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 |
| Judge หลอมรวม (บท) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| บทหนังสือชะตา | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

(bazi เองก็ไม่อยู่ใน Resonance — เป็น known gap เดิม ไม่ใช่ประเด็นยูเรเนียน)
