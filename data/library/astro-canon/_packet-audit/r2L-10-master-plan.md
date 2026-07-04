# r2L-10 · Master Plan — "AI 6 ศาสตร์แจ้งระบบส่งไม่ครบ" · map root cause + แผนแก้จัดลำดับ

> READ-ONLY audit (hourkey.io) · ไม่แก้โค้ด · เขียนขนานกับ r2L-1..9
> ขอบเขต: fusion5 (`/api/sifu/fusion5`) — พาเนล 6 ศาสตร์ + judge
> วันที่: 4 ก.ค. 2026 · ฐาน commit `239ea84` (r396b)

---

## 0. บทสรุปผู้บริหาร (TL;DR)

**ต้นเหตุหลัก 1 อย่าง แสดงตัวใน 3 ศาสตร์:** ฟังก์ชัน `structuredPacketJson()` ใน
`src/lib/fusion5/build-prompt.ts` ทำ JSON แบบ "compact" ที่ **ตัด field ทิ้งบางส่วน** ทั้งที่
engine คำนวณมาแล้ว และ **prose (render.ts) สั่ง AI ให้ยึด field เหล่านั้น**. เมื่อ prose พูดถึง field
ที่ JSON ไม่มี + คำสั่งส่วนกลาง (build-prompt.ts:2781-2782) บังคับ "ยึดเฉพาะ field ใน
STRUCTURED_CHART_PACKET เท่านั้น" → AI สรุปว่า **"ระบบส่งไม่ครบ"**

นี่คือบั๊กเดียวกับที่เพิ่งเจอในยูเรเนียน (`structuredPacketJson` ตัดสาขา auslosung/tnpPoints/…
ทิ้ง — แก้ไปแล้ว r392). **สมมติฐาน "ศาสตร์อื่นมีบั๊กเดียวกัน (JSON ตัด field) = ยืนยันแล้ว: จริง 3 ใน 5.**

| ศาสตร์ | มีบั๊ก JSON ตัด field? | field ที่ตัดหลัก | ความรุนแรง |
|---|---|---|---|
| **western** | ✅ ใช่ | `data.timingTimeline` ทั้งก้อน (+อีก ~8 subfield) | 🔴 สูงสุด |
| **vedic** | ✅ ใช่ | `data.timingTimeline` ทั้งก้อน (+gochara.ayanamsa +ป้ายไทย) | 🔴 สูง |
| **qizheng** | ✅ ใช่ | `data.timingTimeline` ทั้งก้อน (+huaYao natalSignTh) | 🟠 กลาง-สูง |
| **uranian** | ⚠️ แก้แล้ว r392 · เหลือเศษ | `auslosung.groups[].natalOrbArcmin` + array ย่อแรงกว่า prose | 🟡 ต่ำ |
| **ziwei** | ❌ ไม่มีบั๊ก | (serialize เต็ม + prose inline ค่าอยู่แล้ว) | 🟢 ไม่ต้องแก้ |
| **bazi** | ❌ คนละ pipeline | ไป `/api/sifu` (chart-packet.ts · LOCKED · verified) | 🟢 ไม่เกี่ยว |

**แกนของบั๊ก:** ทุกศาสตร์ astro ประกอบ prompt = `render...Prompt(packet)` (prose) + `"\n\nSTRUCTURED_CHART_PACKET:\n"` + `structuredPacketJson(packet)` (JSON). **prose มีค่าครบ** (render ออกมาเป็นข้อความ) แต่ **JSON ตัดทิ้ง** → เกิด "prose พูดถึง แต่ JSON ไม่มี" → คำสั่งส่วนกลางยก JSON เป็น source of truth → AI ไม่เชื่อ prose → แจ้งขาด.

---

## 1. โครงสร้าง pipeline (เพื่อเข้าใจว่าบั๊กอยู่ตรงไหน)

```
buildSciencePrompt(science, births, question, …)         [build-prompt.ts:2761]
  └─ assemble(bundle):
       ├─ หัวคำสั่ง (บรรทัด 2779-2786) ← คำสั่งบังคับ "ยึด packet"
       ├─ คัมภีร์ (canon · ย่อได้)
       └─ births.forEach: renderChartForScience(science, b, refDate)   [2810]
              └─ `${render{Science}Prompt(packet)}` (prose)             [2635-2671]
                 + `\n\nSTRUCTURED_CHART_PACKET:\n`
                 + `${structuredPacketJson(packet)}`  ← ★ ตรงนี้ตัด field
```

- **bazi** ไม่เข้า `renderChartForScience` (คืน `""`) — fusion5/route.ts:503 route ไป `callSifu` (`/api/sifu`)
  ที่ใช้ `buildStructuredChartPacket` + `renderChartPrompt` (chart-packet.ts · LOCKED/verified). **ไม่ใช้ `structuredPacketJson` → ปลอดบั๊กนี้.**
- **ziwei** เข้า `renderChartForScience` แต่ `structuredPacketJson` **ไม่มีสาขา ziwei** → ตกไปบรรทัดสุดท้าย
  `return JSON.stringify(packet)` (build-prompt.ts:2629) = **serialize เต็ม ไม่ตัด field** → ปลอดบั๊ก.
- **qizheng / western / vedic / uranian** มีสาขา compact เฉพาะ (2410 / 2445 / 2515 / 2572) = **จุดที่ตัด field.**

---

## 2. (ก) MAP "ส่งไม่ครบ" → บรรทัด root cause ต่อศาสตร์

### 2.1 🔴 WESTERN — รุนแรงสุด
**Root cause บรรทัด:** `structuredPacketJson` western branch (build-prompt.ts:2445-2513) — object `data` (2463-2511) **ไม่มี key `timingTimeline` เลย**

- **field หลักที่ตัด:** `data.timingTimeline` ทั้งก้อน
  - engine สร้าง: packet.ts:459 (`timingTimeline,`) · type packet.ts:136
  - สูญทั้งชั้น: `transitHits · ingresses · stations · eclipses · solarReturn(SR asc/mc/planets) · profection.segments(lordOfYear) · progressed(planets/aspectsToNatal/progressedAspects/moonPerfections)`
  - **ความขัดแย้งที่จุดชนวน:** `timingCoverage` (emit อยู่ · 2461) รายงาน `solarReturn/eclipses/retrogradeStations/secondaryProgressions/annualProfection = "in_packet_target_year"` (packet.ts:365-378) → **โฆษณาว่ามี แต่ตัวข้อมูลไม่อยู่ใน JSON**
- **prose ที่สั่งให้ยึด field ที่ตัด:**
  - render.ts:81-83 `TIMING_GUARD: จังหวะเวลาปีเป้าหมายให้อ้างจาก TIMING_TIMELINE … เท่านั้น`
  - render.ts:210-268 (render TIMING_TIMELINE ทั้งบล็อกเป็นข้อความ) — แปลว่า prose "มี" แต่ JSON "ไม่มี"
  - render.ts:83 (สาขา timeline=null) สั่งตรง ๆ `ต้องบอกชัดว่าชั้น exact transit window/solar return/profection ยังไม่ได้ส่งมา` → AI แยกไม่ออกระหว่าง "null จริง" กับ "ถูก serializer ตัด" → พ่นคำ "ยังไม่ได้ส่งมา" = "ระบบส่งไม่ครบ"
- **field รองที่ตัด (ลดคุณภาพ ไม่ถึงกับแจ้งขาด):** `degradeLevel` (top) · planet `antisciaLon/contraAntisciaLon` (render.ts:157) · `minorDignity.triplicityDayLord/NightLord` (render.ts:148-149 สาขา fallback) · lots `formula/source` (render.ts:117) · `timingSupport` `planetTh/previousApproxAge/nextApproxAge` (render.ts:200-204) · aspects/minorAspects `angleTh` · dispositors ป้ายไทย

### 2.2 🔴 VEDIC
**Root cause บรรทัด:** `structuredPacketJson` vedic branch (build-prompt.ts:2515-2570) — object `data` (2531-2568) **ไม่มี key `timingTimeline`**

- **field หลักที่ตัด:** `data.timingTimeline` ทั้งก้อน
  - engine สร้าง: packet.ts:362 · type packet.ts:114
  - สูญทั้งชั้น: `dashaTimeline[]` (maha→antar→pratyantar 3 ชั้น) · `transitSegments[]`(+bavBindus/sarvaBindus) · `sadeSati{phases[]}` · `varshaphala{munthaRashi,grahas[]}` · `targetYear/coverageNote`
- **prose ที่สั่งให้ยึด:** render.ts:196 (header) · render.ts:198 `TIMING_GUARD: … ให้อ้างจากรายการด้านล่างเท่านั้น ห้ามประมาณวันเอง` · render.ts:200-218 (dasha 3 ชั้น / transit segment / Sade Sati / Varshaphala)
- **field รองที่ตัด:** `gochara.ayanamsa` (render.ts:169) · graha `combustion.limitDeg` (render.ts:80) · ป้ายไทยเกือบทุกจุด (`nameTh/rashiTh/rashiLordTh/…`) · **worst:** `ashtakavarga.planets`/`sarvaByRashi` เหลือ **array เลข bindu ล้วนไม่มี label ราศี** (2559-2560) — prose ใช้ป้ายราศี (render.ts:135) มา cross-check ไม่ได้

### 2.3 🟠 QIZHENG
**Root cause บรรทัด:** `structuredPacketJson` qizheng branch (build-prompt.ts:2410-2443) — object `data` (2420-2441) **ไม่มี key `timingTimeline`**

- **field หลักที่ตัด:** `data.timingTimeline` ทั้งก้อน (流年/流月太陽過宮/วันชนจุด)
  - engine สร้าง: packet.ts:25, packet.ts:89 (`buildQizhengTimeline`)
- **prose ที่สั่งให้ยึด:** render.ts:56-77 (render timeline เป็นข้อความ) · render.ts:60 `TIMING_GUARD: จังหวะรายเดือน/วันของปีเป้าหมายให้อ้างจากรายการนี้เท่านั้น ห้ามประมาณเอง`
- **field รองที่ตัด:** `huaYao.roles[].natalSignTh` (render.ts:52 — เมื่อ `natalHouse` เป็น null ตำแหน่ง 化曜 พึ่ง field นี้ตัวเดียว → กลายเป็น "—") · `houses12[].th/note`

### 2.4 🟡 URANIAN (แก้แล้ว r392 · เหลือเศษ)
- **แก้แล้ว:** r392 เติมสาขา `auslosung / tnpPoints / tnpPlanetaryPictures / tnpSensitivePoints / personalPoints` ครบ (ยืนยัน build-prompt.ts:2596-2622) — **ยืนยัน comment r392 ตรงกับจริง**
- **เศษที่เหลือ (ยังขัด prose):**
  1. `auslosung.groups[].natalOrbArcmin` — engine สร้าง (auslosung.ts:412) · prose อ่าน (render.ts:201-202) · JSON group map (2600-2603) ไม่ emit → mismatch (ต่ำ เพราะ prose พิมพ์เลขอยู่แล้ว)
  2. **array ย่อใน JSON แรงกว่า prose** (ข้อมูลจริงหาย): groups JSON 12 vs prose 24 (2600) · events/group JSON 6 vs prose 10 (2602) · tnpActivations JSON 10 vs prose 20 (2604) · tnpMoverContacts JSON 10 vs prose 20 (2605) → ถ้า AI ยึด JSON จะพลาด auslösung รายการท้าย ๆ ที่ prose มี

### 2.5 🟢 ZIWEI — ไม่มีบั๊ก
- ยืนยัน: `structuredPacketJson` **ไม่มีสาขา ziwei** → `return JSON.stringify(packet)` (2629) serialize เต็ม
- render.ts inline ค่าทุกตัวเป็นข้อความไทย/จีนก่อน JSON แล้ว → AI ไม่ต้องพึ่ง JSON ด้วยซ้ำ (คุ้ม 2 ชั้น)
- ที่ ziwei "อาจ" พูดว่าขาด = degrade จริงของ engine เท่านั้น (ไม่ใช่ serializer): render.ts:129 (overlay null · notAvailable) · render.ts:142 (`@ไม่พบตำแหน่งใน packet` เมื่อ `palaceName===null`) · render.ts:33 (no-time minimal) — **ไม่ใช่บั๊กตัด field**

### 2.6 🟢 BAZI — คนละ pipeline
- fusion5/route.ts:503 → `callSifu`(`/api/sifu`) → `buildStructuredChartPacket`+`renderChartPrompt` (chart-packet.ts · LOCKED · "อ่านดวงเป๊ะ") — ไม่แตะ `structuredPacketJson`. ถ้า bazi แจ้งขาด = คนละสาเหตุ (นอก scope r2L-10)

---

## 3. (ข) สมมติฐาน — ศาสตร์ไหนมีบั๊ก structuredPacketJson แบบยูเรเนียน

**ยืนยันจากโค้ด (ไม่ใช่เดา):** บั๊ก "JSON ตัด field ที่ prose ยึด" = แบบเดียวกับยูเรเนียน r392 พบใน

1. **western** — ตัด `data.timingTimeline` ทั้งก้อน + timingCoverage โฆษณาว่ามี = **ขัดแย้งชัดสุด**
2. **vedic** — ตัด `data.timingTimeline` ทั้งก้อน + ashtakavarga array ไร้ label
3. **qizheng** — ตัด `data.timingTimeline` ทั้งก้อน

**Pattern ร่วมที่เหมือนยูเรเนียนเป๊ะ:** ทั้ง 3 ศาสตร์ engine สร้าง `timingTimeline` (ชั้นเวลา "ตกวัน/เดือน")
เหมือน uranian สร้าง `auslosung`. r392 uranian เคยตัด `auslosung` ทิ้ง → AI ตอบวันไม่ได้.
ตอนนี้ western/vedic/qizheng **ยังตัด `timingTimeline` ทิ้งอยู่** = ก่อนถูกแก้ = **AI ตอบจังหวะวัน/เดือนไม่ได้ + แจ้ง "ส่งไม่ครบ"** เป๊ะแบบ uranian ก่อน r392.

**ผ่านฉลุย:** ziwei (ไม่มีสาขา = full serialize), bazi (คนละ pipeline).

---

## 4. (ค) แผนแก้จัดลำดับ r398+ (ศาสตร์ไหนก่อน)

หลักจัดลำดับ: (1) ความรุนแรงของ prose↔JSON contradiction (2) ฟีเจอร์ timeline = จุดขาย "สไนเปอร์ตกวัน" (3) ความเสี่ยงต่ำในการแก้ (แก้จุดเดียว = เติม field กลับใน serializer). **ทุกข้อเป็น additive ใน `structuredPacketJson` เท่านั้น — engine/prose ไม่ต้องแตะ.**

### r398 — WESTERN (ก่อน · impact สูงสุด)
- เติม `data.timingTimeline` เข้า western branch (build-prompt.ts:2463-2511) — ย่อแบบ array (เหมือน uranian auslosung post-r392): SR/profection/progression/eclipse/station/transitHits/ingresses
- เติม top `degradeLevel`
- (คุณภาพรอง) เติมกลับ: planet `antisciaLon/contraAntisciaLon` + `triplicityDayLord/NightLord` · lots `formula/source` · timingSupport `planetTh/prev/next age` · aspects `angleTh`
- **verify:** ถามคำถามปี/เดือนของ western panel → ต้องไม่ขึ้น "ยังไม่ได้ส่งมา/ส่งไม่ครบ" เมื่อ `timingCoverage=in_packet_target_year`

### r399 — VEDIC
- เติม `data.timingTimeline` (dasha 3 ชั้น + transitSegments + sadeSati + varshaphala)
- เติม `gochara.ayanamsa`
- **สำคัญ:** ใส่ label ราศีให้ ashtakavarga (`bindusByRashi`/`sarvaByRashi` ให้เป็น `[rashi,bindu]` ไม่ใช่เลขล้วน) — กันอ่านสลับ index
- เติมป้ายไทยหลัก (`nameTh/rashiTh`) เท่าที่ budget ไหว

### r400 — QIZHENG
- เติม `data.timingTimeline` (流年/流月/วันชน)
- เติม `huaYao.roles[].natalSignTh` (ให้ 化曜 มีตำแหน่งเมื่อ natalHouse=null)
- (เล็ก) เติม `houses12[].th`

### r401 — URANIAN (เก็บตก · ต่ำ)
- เติม `auslosung.groups[].natalOrbArcmin`
- พิจารณาปรับ slice JSON ให้เท่า prose (24/10/20/20) หรือ **ทางเลือกดีกว่า: ลด prose ให้เท่า JSON** (กัน budget) — ให้ตัวเลขตรงกันสองฝั่งเท่านั้น

### ข้ามได้ — ZIWEI, BAZI
- ไม่ต้องแก้ (ziwei serialize เต็ม · bazi คนละ pipeline verified)

### 🔩 งานข้ามศาสตร์ (แก้ทีเดียวคุ้มทุกศาสตร์)
1. **ปัญหา keyless positional array** — JSON ปนสอง encoding: บาง field เป็น object มี key (planets/grahas) แต่หลาย field เป็น array เปล่าไม่มี key (lots/houses/aspects/drishti/shadbala/ashtakavarga/gochara…). prose อ้างด้วยชื่อ field ไทย แต่ JSON ให้แค่ตำแหน่ง → AI จับคู่ผิด/หาไม่เจอ. **เสนอ:** ใส่ "schema legend" 1 บรรทัดต่อ array (บอกลำดับ field) หรือเปลี่ยนเป็น keyed object สำหรับ array ที่ prose อ้างด้วยชื่อ
2. **ความเสี่ยง truncation ชั้นสอง (build-prompt.ts:2844-2848)** — เมื่อ prompt เกิน `FUSION_PANEL_PROMPT_MAX_CHARS=118000` แม้ย่อ canon จนสุด (min 4000) ระบบ slice หัว 12K + ท้าย → **ก้อน STRUCTURED_CHART_PACKET อยู่กลาง prompt อาจโดนตัด** โดยเฉพาะโหมดดูกลุ่ม 4 ดวง (4×packet). **เสนอ:** ตรวจว่าโหมด 4 ดวงยังไม่เกิน cap / ให้ packet มี priority สูงกว่า canon ในการ slice

---

## 5. (ง) Prompt instruction ที่ควรผ่อน + ยืนยันไม่ได้บอกตรง

### 5.1 บรรทัดที่ทำให้ AI แจ้งขาดทั้งที่ prose มีค่า
- **build-prompt.ts:2782** (ส่วนกลาง · ทุกศาสตร์) —
  `"คำตอบต้องสอดคล้องกับคัมภีร์/กฎ/SOURCE_MAP ที่แนบมาและ field ใน STRUCTURED_CHART_PACKET เท่านั้น · ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง"`
  → ยก **JSON** เป็น source of truth เดียว. เมื่อ field อยู่ใน prose แต่ไม่อยู่ JSON = AI ถือว่าไม่มี
- **build-prompt.ts:2781** — `"… field ไหนไม่มีให้บอกว่าไม่มี · …"` → บังคับพ่นคำ "ไม่มี" ทันทีที่หาใน JSON ไม่เจอ
- per-science: qizheng render.ts:80 `field ไหนไม่มีให้บอกว่าไม่มี ห้ามเดา` · western render.ts:78 `ใช้เฉพาะ field ที่ packet ส่งมาเท่านั้น` · western render.ts:83 `ต้องบอกชัดว่า…ยังไม่ได้ส่งมา` · vedic render.ts:198 `ให้อ้างจากรายการด้านล่างเท่านั้น`

### 5.2 สิ่งที่ควรผ่อน (ข้อเสนอ · **ยังไม่แก้**)
**ผ่อนนิยาม "ผัง" ให้ครอบทั้งสองแหล่ง** — เปลี่ยนถ้อยคำจาก "field ใน STRUCTURED_CHART_PACKET **เท่านั้น**" เป็น
**"ยึดได้ทั้งบล็อกผังที่ render เป็นข้อความ (=== ผังดวง … ===) และ STRUCTURED_CHART_PACKET (JSON) — ถ้าค่าปรากฏในที่ใดที่หนึ่ง ถือว่าระบบส่งมาแล้ว; ให้พูดว่า 'ไม่มี' เฉพาะเมื่อ field นั้นหายจากทั้งสองแหล่ง"**
- แก้ตรงต้นตอ prose↔JSON conflict ได้ทันที (ไม่ต้องรอ serializer เติมครบทุก field)
- เป็นทางแก้เฉพาะหน้าที่ควรทำ**คู่กับ**การเติม field ใน serializer (ข้อ 4) ไม่ใช่แทน

### 5.3 ⚠️ ยืนยัน — ไม่ได้ "บอกคำตอบตรง" ให้ AI
- การผ่อนนี้ **ไม่ใช่** การป้อนคำทำนาย/ตัวเลข/ตำแหน่งดาวให้ AI. ข้อมูลทั้งหมดยัง = **engine คำนวณ deterministic** (ตามกติกา "Engine ก่อน · AI แค่สรุป")
- ที่ทำคือ **เลิกให้ AI มองข้ามข้อมูลที่ engine ส่งมาแล้ว** (แค่ส่งมาเป็น prose แทน JSON) — เป็นการซ่อม "ความไม่ตรงกันของสองแหล่ง" ไม่ใช่การ inject ความรู้ภายนอกหรือเฉลย
- **ยังคงห้ามเด็ดขาด:** ห้าม AI เดา/แต่งตำแหน่ง-มุม-ดาว-วันที่เอง (render.ts guard เดิมทั้งหมดคงไว้), ห้ามดึงความรู้ horoscope ทั่วไปนอกผัง — ข้อเสนอ 5.2 ไม่แตะกฎเหล่านี้
- ทางที่สะอาดที่สุด (ทำได้ทั้งคู่): **เติม field กลับใน serializer (ข้อ 4) เป็นหลัก** + ผ่อนถ้อยคำ (5.2) เป็นตาข่ายกันพลาด → prose กับ JSON ตรงกัน AI ไม่ต้องเลือกข้าง

---

## 6. รายการอ้างอิงบรรทัด (quick index)

| หัวข้อ | ไฟล์:บรรทัด |
|---|---|
| serializer (ต้นตอ) | `src/lib/fusion5/build-prompt.ts:2409-2630` |
| — qizheng branch | :2410-2443 (ไม่มี `timingTimeline`) |
| — western branch | :2445-2513 (ไม่มี `timingTimeline`, `degradeLevel`) |
| — vedic branch | :2515-2570 (ไม่มี `timingTimeline`, `gochara.ayanamsa`) |
| — uranian branch (fixed r392) | :2572-2627 (เศษ `natalOrbArcmin` + array slice 12/6/10/10) |
| — ziwei fall-through (เต็ม) | :2629 `JSON.stringify(packet)` |
| ประกอบ prompt astro | :2632-2674 |
| คำสั่งบังคับ "ยึด packet" | :2780-2782 (+ per-science render `field ไหนไม่มีให้บอกว่าไม่มี`) |
| cap + truncation ชั้นสอง | :2835-2850 (`FUSION_PANEL_PROMPT_MAX_CHARS=118000`) |
| bazi route (คนละ pipeline) | `src/app/api/sifu/fusion5/route.ts:503` |
| western timeline สร้าง/render | packet.ts:459 · render.ts:81-83,210-268 |
| vedic timeline สร้าง/render | packet.ts:362 · render.ts:196-218 |
| qizheng timeline สร้าง/render | packet.ts:25,89 · render.ts:56-77 |
| uranian เศษ | auslosung.ts:412 · render.ts:201-202 vs build-prompt.ts:2600-2605 |

---

## 7. หมายเหตุความไม่แน่นอน (ตามกฎ "ห้ามพูดน่าจะ")
- **ยืนยันจากโค้ด:** การตัด field ของ 3 ศาสตร์ + ความขัดกับ prose = อ่านจาก source ตรง (มีบรรทัดอ้าง)
- **ยังไม่ยืนยัน (ต้อง test จริง):** ว่าในการรันจริง AI พ่นคำ "ระบบส่งไม่ครบ" ทุกครั้งหรือบางครั้ง —
  ขึ้นกับคำถาม (ถ้าคำถามไม่แตะ timeline อาจไม่ trigger). ต้อง reproduce ด้วยคำถามจังหวะเวลา (ปี/เดือน/วัน) ต่อ western/vedic/qizheng panel เพื่อยืนยัน
- **ยังไม่ยืนยัน:** ความเสี่ยง truncation ชั้นสอง (ข้อ 4.2) trigger จริงในโหมด 4 ดวงหรือไม่ — ต้องวัดความยาว prompt จริง
