# r2k-8 · ทำไม AI ยูเรเนียนบ่นว่า "ผังส่งไม่ครบ / ไม่มีปฏิกิริยาข้ามดวง" — map สาเหตุ + แผนแก้จัดลำดับ

วันที่: 4 ก.ค. 2026 · READ-ONLY (ไม่แก้โค้ด) · ต่อยอดจาก r2j-1 (missing-flags) + r2j-4 (fusion-integration)
ไฟล์ที่อ่านจริงรอบนี้: `src/lib/astro/uranian/{render,packet}.ts` · `src/lib/fusion5/{build-prompt,resonance,multi-year,pair-interactions,day-sniper,disciplines}.ts`

> **สรุป 1 ประโยค:** คำบ่น 2 ข้อมาจากคนละที่ — **"ผังส่งไม่ครบ"** = prompt ยัดคำว่า *ไม่มี/ยังไม่/notAvailable/not_wired* เข้าไปเยอะ **และ JSON ที่ส่งให้ AI ขัดกับ prose เอง** (prose มีตำแหน่ง TNP แล้ว แต่ JSON ยังบอก `not_wired_phase1` + ไม่ส่ง tnpPoints) · **"ไม่มีปฏิกิริยาข้ามดวง"** = ยูเรเนียน **ไม่มี engine synastry เลย** (pairPayload ไม่มี case uranian) และถูกตัดออกจาก Resonance — **ยืนยันแล้ว: ไม่มี synastry จริง**

---

## ส่วน ก · MAP คำบ่น → บรรทัด root cause

### คำบ่น A — "ผังส่งไม่ครบ / ผังส่งมาไม่สมบูรณ์"

AI อ่าน panel ยูเรเนียน = `renderUranianPrompt(packet)` + `STRUCTURED_CHART_PACKET:<json>` (build-prompt.ts:2588) แล้วเจอคำ "ขาด" ซ้ำ ๆ 3 ชนิด:

| # | ต้นเหตุ (ไฟล์:บรรทัด) | ข้อความที่ AI เห็น | ทำให้ AI รู้สึกว่า |
|---|---|---|---|
| A1 🔴 | **build-prompt.ts:2519–2545** (สาขา uranian ของ `structuredPacketJson`) | JSON ส่ง `tnpPositionSource:"witte_pd_ephemeris_not_wired_phase1"` + `notAvailable:["witteTransneptunianPositions",…]` **และไม่ส่ง `tnpPoints`/`tnpPlanetaryPictures`/`tnpSensitivePoints` เลย** (สาขานี้ serialize แค่ `witteTransneptunians` ที่ไม่มีพิกัด) | **ผัง = ไม่มีตำแหน่ง TNP** — ทั้งที่ prose บอกว่ามี |
| A2 🔴 | **render.ts:150–174** (prose) มี tnpPoints พิกัด Kepler r391 จริง **แต่** JSON (A1) บอก `not_wired` | prose พูดตำแหน่ง Cupido/Hades/Kronos → JSON แย้งว่า "ยังไม่ wire" | **ขัดแย้งในผังเดียว** → AI ไม่เชื่อ เลยพูดว่าผังไม่ครบ |
| A3 | **packet.ts:79** `notAvailable.push("witteTransneptunianPositions")` (ไม่มีเงื่อนไข — ดันเสมอ แม้ r391 คำนวณตำแหน่งแล้ว) | ป้าย "ไม่มีตำแหน่ง TNP" ติดถาวรใน packet | ต้นตอของ A1 |
| A4 | **render.ts:84,96,108,120,133** — 5 บล็อก "ไม่พบ…ภายใน orb → ห้ามสร้าง…เองจากองศา" (ภาพดาว/4ดวง/จุดไว/จุดกระจก/เดคลิเนชัน) | ถ้าดวงจริงมีคู่แน่นน้อย → panel เต็มไปด้วย "ไม่พบ… ห้ามสร้างเอง" | **ผังโล่ง** (โดยเฉพาะดวงที่ดาวจริงไม่ค่อยจับ midpoint) |
| A5 | **packet.ts:66** `forbiddenFieldsWhenNoTime=[…,"houses"]` แต่ engine **ไม่เคยคำนวณเรือนเลยแม้มีเวลาเกิด** (ไม่มี house cusp ใน engine · เทคนิค Witte บท 32/38/41 หายทั้งหมด) | ป้ายห้าม "houses" โผล่ ทั้งที่ไม่เคยมีให้อ่าน | **ผังขาดชั้นเรือนถาวร** (false comfort) |
| A6 | **packet.ts:75** `notAvailable.push("meridian","ascendant")` + `moonUncertainty` + render.ts:51,73,76–78 (เมื่อ !hasBirthTime) | ไม่มีเวลาเกิด → ตัด MC/Asc + จันทร์ ⚠️ | degrade ที่ **ถูกต้อง** (ขึ้นกับ input) แต่สมทบความรู้สึก "ไม่ครบ" |

**แกนของคำบ่น A = A1+A2+A3 (contradiction TNP):** ปัญหาที่ร้ายสุดไม่ใช่ "ขาด" แต่คือ **prose กับ JSON ไม่ตรงกัน** หลัง r391 ใส่พิกัด Kepler ลง prose (render.ts) แล้ว แต่ทางออก JSON (structuredPacketJson) + packet.notAvailable ยังค้างสถานะเฟส 1 → AI เจอสองเสียงขัดกันในผังเดียว จึงสรุปว่า "ผังส่งมาไม่ครบ/เชื่อไม่ได้" นี่คือ **do-now bug**

### คำบ่น B — "ไม่มีปฏิกิริยาข้ามดวง" (ดูคู่/สังเคราะห์ข้ามศาสตร์)

**ยืนยัน = ไม่มี synastry ยูเรเนียนจริง ๆ** (ไม่ใช่ AI เข้าใจผิด):

| # | ต้นเหตุ (ไฟล์:บรรทัด) | สภาพจริง |
|---|---|---|
| B1 🔴 | **pair-interactions.ts:500–504** `pairPayload` มีแค่ `western/vedic/ziwei/qizheng` — **ไม่มี `case "uranian"`** | ส่งคู่ยูเรเนียนไม่ได้เลย (ไม่มีฟังก์ชัน `uranianPair`) |
| B2 🔴 | **multi-year.ts:99** `renderPairTimingBlock` → `if(science==="uranian") return ""` | ไม่มีปฏิทินร่วมของคู่ |
| B3 🔴 | **resonance.ts:44** `RESONANCE_SCIENCES=["western","vedic","ziwei","qizheng"]` (ไม่มี uranian) → ถูกกรองทิ้งที่ route resonance | ยูเรเนียนไม่เคยเข้าตาราง "## จุดที่หลายศาสตร์ยืนยันตรงกัน" (build-prompt.ts:2789–2791) = ถูกกดเป็น "ศาสตร์เดียวเห็น" เสมอ |
| B4 🟡 | **multi-year.ts:47** `renderMultiYearBlock` → `if(science==="uranian") return ""` (comment ล้าสมัย — auslosung r389 ทำชั้นเวลาได้แล้ว แต่ short-circuit) | เทียบ "ปีไหนหนัก" ข้ามปีไม่ขึ้น (แม้ panel ปีเป้าหมายมี auslosung ที่ build-prompt.ts:2585) |
| B5 🟡 | **day-sniper.ts:467,491** เข็ม D ดึง midpoint จาก `WesternChart` ไม่ใช่ `uranianChart`/auslosung · เป็น precision layer ไม่ติดธง/ไม่นับเข็มอิสระ (day-sniper.ts:707) | ยูเรเนียนไม่มีสิทธิ์ "ลั่นไก" วันด้วยตัวเอง |
| ✅ | **build-prompt.ts:479** section map `synastry → หมวด F (vergleichende Astrologie)` มีจริง · คัมภีร์ Witte พร้อม | **ช่องว่าง = engine ล้วน ไม่ใช่คัมภีร์** (Witte แข็งเรื่องดูคู่มาก แต่เรายังไม่มีโค้ด pair) |

**แกนของคำบ่น B = B1 (ไม่มี uranianPair engine).** ส่วน B3 (Resonance) คือตัวที่ทำให้ "ไม่ยืนยันร่วมกับศาสตร์อื่น" — สองอันนี้คือหัวใจ

---

## ส่วน ข · แผนแก้จัดลำดับ (รวมงานทีม 1–7 เป็น checklist เดียว)

ลำดับตามที่เจ้านายสั่ง: **data completeness → synastry → resonance → houses** · แต่ละงานกำกับ *ทำได้เลย (r392/r393)* หรือ *เฟสหน้า*

### 🥇 เฟส 1 — DATA COMPLETENESS (แก้คำบ่น A · ทำได้เลย = r392)

ทั้งเฟสนี้เป็น **hotfix ความสอดคล้อง** ไม่เพิ่มดาราศาสตร์ใหม่ ต้นทุนต่ำ ปลดคำบ่น A ทันที:

- [ ] **1. เลิกส่ง contradiction TNP ใน JSON** — สาขา uranian ของ `structuredPacketJson` (build-prompt.ts:2519–2545) ให้ **serialize `tnpPoints`/`tnpPlanetaryPictures`/`tnpSensitivePoints`** (พิกัด Kepler r391 ที่มีใน packet.data แล้ว) และ **หยุดส่ง `tnpPositionSource:"…not_wired_phase1"`** เปลี่ยนเป็น `tnpPositionSourceKepler` + `tnpPrecisionNote` (มีใน packet แล้ว) — ให้ JSON พูดตรงกับ prose *(ทีม 1 · ทำได้เลย)*
- [ ] **2. แก้ `notAvailable` ให้ตรงจริง** — packet.ts:79 `notAvailable.push("witteTransneptunianPositions")` **มีเงื่อนไข**: ดันเฉพาะกรณีจริงที่ยังไม่มีพิกัด (เหลือแค่ Zeus/`tnpNotComputable`) ไม่ใช่ดันเหมาทั้งก้อนหลัง Cupido/Hades/Kronos คำนวณได้แล้ว *(ทีม 1 · ทำได้เลย · ⚠️ กระทบทุก consumer ที่อ่าน notAvailable — grep ก่อน)*
- [ ] **3. auto-render `notAvailable`/`forbiddenFields` เข้า prompt** (r2j-1 ค-6) — ให้ render.ts วน `packet.notAvailable` + `forbiddenFieldsWhenNoTime` ออกเป็นบรรทัดเดียว = single source of truth · กัน "degrade เงียบ" อนาคต + เลิกเขียนคำเตือนซ้ำด้วยมือ *(ทีม 2 · ทำได้เลย · low risk)*
- [ ] **4. transcribe องศาตัวอย่างคัมภีร์ (OCR Fraktur)** (r2j-1 ค-2 · render.ts:64 กฎ 8) — verbatim สะอาดจาก r2a/r2c PDF (มีครบ 46 บทแล้ว) ลบ ⚠️ "ค่าโดยประมาณต้องเทียบสแกน" *(ทีม 3 · เฟสหน้า · งานข้อมูลไม่ใช่โค้ด)*
- [ ] **5. ประกาศ policy orb antiscia/parallel** (r2j-1 ค-1 · render.ts กฎ 9) — ขุด Witte verbatim หา orb ของ Spiegelpunkte/Deklinationsparallele ถ้ามี · ถ้าไม่มีให้ประกาศเป็นทางการว่า "Witte ไม่ระบุ → คงวิธีสากล Ptolemy PD" *(ทีม 3 · เฟสหน้า · sourcing)*

> หมายเหตุ: A4 (บล็อก "ไม่พบ…") **ไม่ต้องแก้** — เป็น data-driven ที่ถูกต้อง (engine ซื่อสัตย์เมื่อดวงจริงไม่มีคู่แน่น) · A6 (ไม่มีเวลาเกิด) ก็ถูกต้อง ไม่แตะ

### 🥈 เฟส 2 — SYNASTRY / ปฏิกิริยาข้ามดวง (แก้คำบ่น B · ต้นทุนสูง = r393+)

- [ ] **6. สร้าง `uranianPair` ใน pair-interactions.ts + case ใน `pairPayload`** (B1) — คำนวณ midpoint/จุดไวของ A ตกทับดาว/จุดของ B (และ composite midpoint) · คัมภีร์หมวด F พร้อมแล้ว (build-prompt.ts:479) ขาดแค่ engine *(ทีม 4 · เฟสหน้า · effort สูง · = แกนคำบ่น B)*
- [ ] **7. ต่อ `renderPairTimingBlock` ยูเรเนียน** (multi-year.ts:99) — ปฏิทินร่วมของคู่ ใช้ auslosung ช่วงอิสระ *(ทีม 4 · เฟสหน้า · ต่อจากข้อ 6)*

### 🥉 เฟส 3 — RESONANCE / ยืนยันข้ามศาสตร์ (ยกสถานะ peer · = จุดคุ้มสุดของ r2j-4)

- [ ] **8. ใส่ uranian เข้า `RESONANCE_SCIENCES`** (resonance.ts:44) อย่างน้อย **R2 (ดาวจรจริง)** + **R5 (สะพานธาตุ)** — auslosung transit (auslosung.ts:214 `scanTransits`) + map ดาว→ธาตุ (resonance.ts:326) มีของพร้อมแล้ว · ⚠️ ต้องตัดสิน independence tagging (structural vs independent เทียบ western transit — resonance.ts:22–24) **ก่อน** wire กัน overcount *(ทีม 5 · เฟสหน้า · effort สูง · ปลดล็อกทั้งคำบ่น B ฝั่ง "ยืนยันร่วม")*
- [ ] **9. ต่อ Auslösung เป็นบล็อก multi-year** (multi-year.ts:47 short-circuit · comment ล้าสมัย) — วนปี startYear→endYear เรียก `computeUranianAuslosung` (รับช่วงอิสระได้แล้ว auslosung.ts:330) สรุป "ปีไหนหนัก" *(ทีม 5 · effort ต่ำ-กลาง · ทำได้เร็วกว่าข้อ 8)*
- [ ] **10. (ทางเลือก) ยก Auslösung solar-arc/progressed เป็นเข็ม E อิสระใน Day Sniper** + เปลี่ยนเข็ม D ให้ดึง midpoint จาก `uranianChart` แทน WesternChart (day-sniper.ts:467) *(ทีม 6 · เฟสหน้า · effort กลาง)*

### เฟส 4 — HOUSES / เรือน Witte (เทคนิคที่ยังไม่แตะเลย)

- [ ] **11. implement house engine ตามบท 32/38/41** (r2j-1 ค-4 · A5) — Häuser des Aszendenten/Geburtsmeridians/Planeten · ต้องมีเวลาเกิด · หลังมีแล้วค่อยให้ `forbiddenFieldsWhenNoTime:"houses"` มีความหมายจริง *(ทีม 7 · เฟสหน้า · effort กลาง-สูง · ต้องมี golden ก่อน)*

### เฟสแยก (roadmap · ไม่อยู่ใน 4 เฟสนี้)
- [ ] จันทร์จร time-resolved / Lunation / Profektion บท 14/15/43 (r2j-1 ค-5) — เปิด "จับวัน-ชั่วโมง" ระดับ DaySniper *(effort สูง)*
- [ ] Zeus ephemeris (ตาราง element หายจากคลัง Witte) — ยังคำนวณตำแหน่งไม่ได้ · คง notAvailable เฉพาะตัวนี้ *(ต้องหาแหล่ง)*
- [ ] ขยายพจนานุกรม "การอ่านเชิงวิธี" ให้ครบทุกคู่ (r2j-1 ค-3 · เรียบเรียงเอง ห้ามลอก Ebertin/Brummund) *(effort สูง · coverage)*

---

## สรุปให้เจ้านายเคาะ

- **คำบ่น "ผังส่งไม่ครบ" มี bug จริงอยู่ 1 จุด (do-now):** หลัง r391 ใส่พิกัด TNP ลง prose แล้ว แต่ **JSON ที่ส่งให้ AI (structuredPacketJson uranian) ยังค้าง `not_wired_phase1` + ไม่ส่ง tnpPoints** → prose กับ JSON ขัดกันเอง = ต้นเหตุตรงที่สุด · แก้ที่ **build-prompt.ts:2519–2545 + packet.ts:79** → นี่คือ **r392** (เฟส 1 ข้อ 1–3, low risk)
- **คำบ่น "ไม่มีปฏิกิริยาข้ามดวง" = ยืนยันจริง ไม่มี synastry ยูเรเนียนเลย** — ต้องสร้าง `uranianPair` engine (คัมภีร์หมวด F พร้อม ขาดโค้ด) → งานใหญ่ **r393+** (เฟส 2)
- **จุดคุ้มสุด** ถ้าจะทำ 1 อย่างต่อจาก r392 = **ข้อ 8 (Resonance)** เพราะเปลี่ยนยูเรเนียนจาก "ศาสตร์เดียวเห็น" เป็น "ยืนยันหลายศาสตร์" ในสายตา judge (r2j-4 ประโยคชี้ขาด) — แต่ต้องตัดสิน independence tagging ก่อน
- **ทำได้เลย effort ต่ำ:** r392 = เฟส 1 ข้อ 1–3 · ตามด้วยข้อ 9 (multi-year auslosung วนปี) ที่ effort ต่ำสุดในฝั่ง cross-science
- **ห้ามแตะ (ถูกต้องแล้ว):** บล็อก "ไม่พบ…ห้ามสร้างเอง" (A4) · degrade ไม่มีเวลาเกิด (A6) · การตัด Apollon/Admetos/Vulkanus/Poseidon + transit Moon (โดยเจตนา)
