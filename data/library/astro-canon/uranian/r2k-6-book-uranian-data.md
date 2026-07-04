# r2k-6 · บทยูเรเนียนใน "คัมภีร์ชะตา" (Natal Book) — ผังส่งครบไหม?

READ-ONLY audit · ยืนยันจากโค้ดจริง · ห้ามแก้โค้ด (ไฟล์นี้เป็นรายงาน+ร่างแก้เท่านั้น)
เจ้านายเห็นเล่มจริงบอก "ผังส่งไม่ครบ" — ตรวจว่าจริงตรงไหน สาเหตุ และร่างแก้

---

## 0. TL;DR (ข้อสรุปตรง ๆ ไม่กั๊ก)

1. **"ผัง" ที่ engine คำนวณ → ถูกส่งเข้า prompt ครบ และเท่ากับ fusion Q&A ทุกประการ**
   บท book กับ Q&A เรียก `buildSciencePrompt` → `renderChartForScience` (uranian branch) เส้นเดียวกัน
   ด้วย `refDate/timingRef` เดียวกัน → ได้ prose เต็ม (renderUranianPrompt) + `STRUCTURED_CHART_PACKET`
   **ไม่มีจุดใดที่ book ส่งผังน้อยกว่า Q&A**
2. แต่ "ผังส่งไม่ครบ" ที่เจ้านายเห็น = จริง 2 ชั้น (กระทบทั้ง book และ Q&A แต่เจ็บกับ book มากกว่า เพราะ book ต้องครบทุกมิติ):
   - **ชั้น A (data):** ก้อน JSON `STRUCTURED_CHART_PACKET` เป็น "กระจกย่อ" ที่ **ตัด auslosung (ชั้นเวลา) + ตำแหน่ง TNP ที่คำนวณแล้ว (Cupido/Hades/Kronos) + personalPoints ทิ้ง** — ทั้งที่ prose มีครบ · และ prompt สั่ง (build-prompt.ts:2699) ว่า "ใช้เฉพาะ field ใน STRUCTURED_CHART_PACKET เท่านั้น" → AI มีสิทธิ์ทิ้งข้อมูลที่อยู่ใน prose อย่างเดียว
   - **ชั้น B (directive):** `read-full-uranian.md` แช่แข็งที่ engine เวอร์ชันเก่า (ก่อน r389/r390/r391) — ไม่สั่งให้อ่าน จุดกระจก/เดคลิเนชัน/ภาพดาว 4 ดวง/Auslösung/ตำแหน่ง TNP ที่คำนวณแล้ว · แถมมีหมายเหตุค้างในมิติ 8 ที่ **ห้าม AI อ่านจังหวะเวลา** ("เฟส 1 engine = natal") ทั้งที่ engine ส่ง Auslösung เต็มแล้ว

---

## 1. เส้นทางโค้ด (ยืนยันแล้ว)

| ขั้น | book | fusion Q&A |
|---|---|---|
| เรียก | `src/app/api/book/route.ts:262` `buildSciencePrompt(science,[birth],"",lang,timingRef.refDate,timingRef,{bookMode:true})` | `src/app/api/sifu/fusion5/route.ts:566` `buildSciencePrompt(science,births,question,lang,timingRef.refDate,timingRef)` |
| timingRef | `resolveFusionTimingReference("",new Date())` (book:234) → ปีปัจจุบันเป็น target | `resolveFusionTimingReference(question,now)` |
| สร้างผัง | `buildSciencePrompt` → `renderChartForScience(science,b,timingRef.refDate)` (build-prompt.ts:2727) | เหมือนกันบรรทัดเดียวกัน |
| uranian branch | build-prompt.ts:2579–2588 → `uranianChart()` + `computeUranianAuslosung(chart,dt, ปีเป้าหมาย 01-01..12-31)` + `buildUranianPacket(chart,auslosung)` → `renderUranianPrompt(packet)` + `STRUCTURED_CHART_PACKET:` + `structuredPacketJson(packet)` | เหมือนกัน (ฟังก์ชันเดียว) |

**สรุปข้อ 1:** ผังที่ส่งเข้า prompt ของ book = Q&A ทุก byte (เมื่อ refDate เท่ากัน)
สิ่งที่ bookMode ต่างมีแค่: (ก) `question` ถูกแทนด้วย directive อ่านเต็ม 10 มิติ (ใช้เลือก canon) (ข) ต่อท้ายด้วย directive+format บท แทน "คำถามผู้ถาม"
→ **ไม่แตะ chart pipeline เลย**

---

## 2. ตาราง: ข้อมูลผังที่บท book ควรมี · มีจริงไหม · ขาดเพราะอะไร

หมายเหตุ: "prose" = `renderUranianPrompt` (build-prompt.ts:2588 · ส่วนที่มนุษย์อ่านออก) · "JSON" = ก้อน `STRUCTURED_CHART_PACKET` (`structuredPacketJson` uranian branch · build-prompt.ts:2515–2544 · prompt บังคับยึด field นี้ที่บรรทัด 2699) · "directive" = `read-full-uranian.md`

| # | ข้อมูลผัง (field ใน packet.data / top-level) | ควรมี | อยู่ใน prose? | อยู่ใน JSON? | directive สั่งอ่าน? | สถานะ |
|---|---|---|---|---|---|---|
| 1 | points (ดาว 10 + จุด · ราศี/องศา/dial90/decl) | ✓ | ✓ (render:71) | ✓ (2535) | ✓ | **ครบ** |
| 2 | planetaryPictures (ภาพดาว) | ✓ | ✓ (render:87) | ✓ (2536) | ✓ (มิติทั่วเล่ม) | **ครบ** |
| 3 | **fourPlanetPictures (ภาพดาว 4 ดวง · Vierergestirn · r390)** | ✓ | ✓ (render:98) | ✓ (2537) | ✗ ไม่เอ่ยชัด | **ส่งครบ · แต่ directive ไม่ชี้** |
| 4 | sensitivePoints (จุดไว) | ✓ | ✓ (render:110) | ✓ (2538) | ✓ | **ครบ** |
| 5 | **antiscia (จุดกระจก · Spiegelpunkte · r390)** | ✓ | ✓ (render:123) | ✓ (2539) | ✗ ไม่เอ่ยเลย | **ส่งครบ · แต่ directive ไม่ชี้** |
| 6 | **declinationPairs (เดคลิเนชัน · parallel/contra · r390)** | ✓ | ✓ (render:136) | ✓ (2540) | ✗ ไม่เอ่ยเลย | **ส่งครบ · แต่ directive ไม่ชี้** |
| 7 | witteTransneptunians (รายชื่อ TNP ตายตัว) | ✓ | ✓ (render:150+) | ✓ (2541 · static list) | ~ | **ครบ (แต่เป็นแค่รายชื่อ)** |
| 8 | **tnpPoints (ตำแหน่ง Cupido/Hades/Kronos คำนวณ Kepler · r391)** | ✓ | ✓ (render:152–156) | ✗ **ตัดทิ้ง** | ✗ | **JSON ขาด · prose มี** |
| 9 | **tnpPlanetaryPictures / tnpSensitivePoints (ภาพดาว/จุดไวที่มี TNP ร่วม · r391)** | ✓ | ✓ (render:162–174) | ✗ **ตัดทิ้ง** | ✗ | **JSON ขาด · prose มี** |
| 10 | tnpNotComputable / tnpElementsMissing (Zeus ฯลฯ คำนวณไม่ได้) | ✓ | ✓ (render:158) | ✗ ตัดทิ้ง | ✗ | JSON ขาด · prose มี |
| 11 | **auslosung (ชั้นเวลา Auslösung · ดาวจร/ส่วนโค้งอาทิตย์/ก้าวหน้า · จับตกวัน/เดือน · r389)** | ✓ | ✓ (render:180–209) | ✗ **ตัดทิ้งทั้งก้อน** | ✗ **directive ห้ามอ่าน (หมายเหตุค้าง)** | **JSON ขาด + directive สั่งห้าม = เจ็บสุด** |
| 12 | personalPoints (☉☽Asc MC Node AriesPoint) | ✓ | บางส่วนใน points | ✗ ตัดทิ้ง | ~ | JSON ขาด (prose มี point หลัก) |
| 13 | halbsummen (ครึ่งผลรวมดิบทั้งชุด) | – | ✗ (จงใจ) | ✗ (จงใจ · 2518 "ตัด halbsummen ดิบ") | – | **ตัดโดยตั้งใจ (ภาพดาวสรุปแล้ว) — OK** |
| 14 | nodeMean/nodeTrue (ปมจันทร์) | ✓ | ✓ (render:145) | ✓ (top-level 2529–2530) | ~ | ครบ |

**อ่านตารางแบบสั้น:**
- antiscia / declination / 4-ดวง (#3,5,6) → **ผังส่งครบทั้ง prose+JSON** · ปัญหาคือ **directive ไม่บอกให้อ่าน** → AI มองข้าม
- TNP ที่คำนวณแล้ว + auslosung (#8,9,11) → **prose มี แต่ JSON ตัดทิ้ง** · เมื่อ prompt สั่งยึด JSON (บรรทัด 2699) → AI มีสิทธิ์ทิ้ง = "ผังหาย" ของจริง
- ปม auslosung (#11) โดนซ้ำสอง: JSON ก็ไม่มี + directive มิติ 8 ยังสั่ง "อย่าแต่งจังหวะ/ถ้า packet ไม่มี direction ให้อ่าน natal เป็นหลัก"

---

## 3. หลักฐานโค้ดของ "JSON เป็นกระจกย่อ"

`structuredPacketJson` (build-prompt.ts) สาขา uranian สร้าง object `compact.data` แค่ 7 field:
```
points · planetaryPictures · fourPlanetPictures · sensitivePoints ·
antiscia · declinationPairs · witteTransneptunians(static)
```
เทียบกับ `packet.data` จริง (packet.ts:100–115) มี 14 field — **ที่หายไปจาก JSON:**
`personalPoints, halbsummen, tnpPoints, tnpPlanetaryPictures, tnpSensitivePoints, tnpNotComputable, tnpElementsMissing`
และ top-level ที่หาย: **`auslosung`** (ทั้งก้อน), `tnpPrecisionNote`, `tnpPositionSourceKepler`, `nodeType`

comment ในโค้ด (build-prompt.ts:2518) ยอมรับเอง: "ตัด halbsummen ดิบทั้งชุด กัน budget" — แต่การตัด auslosung + tnpPoints ออกด้วย ไม่ได้ตั้งใจสื่อสารว่าเป็น "การลดผัง"

`prompt` บรรทัด 2699 (ในทุก panel รวม book):
> "คำตอบต้องสอดคล้องกับ...และ **field ใน STRUCTURED_CHART_PACKET เท่านั้น** · ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง"
→ กติกานี้ทำให้ auslosung/TNP ที่อยู่ใน prose อย่างเดียว "ไม่ใช่ field ใน JSON" → AI ระวังตัวจะไม่ยกมาใช้

---

## 4. หลักฐาน "directive แช่แข็ง" (`read-full-uranian.md`)

1. **หลักเหล็ก บรรทัดดาวสมมุติ** ระบุ TNP ครบ 8 ดวง (`Cupido/Hades/Zeus/Kronos/Apollon/Admetos/Vulkanus/Poseidon`)
   → ขัดกับ engine rule 5/6 (render.ts:61–62) ที่ **อนุญาตเฉพาะ Cupido/Hades/Kronos/Zeus** และ **ห้าม Apollon/Admetos/Vulkanus/Poseidon (Sieggrün ลิขสิทธิ์)**
   → directive เปิดช่องให้ AI อ้าง 4 ดวงต้องห้าม
2. **ไม่เอ่ยถึงเลย:** Antiscia/Spiegelpunkte (จุดกระจก) · Deklination/Parallel (เดคลิเนชัน) · Vierergestirn/ภาพดาว 4 ดวง (เอ่ยแค่ "Planetenbild" รวม ๆ) · ชั้น Auslösung เป็นแหล่งข้อมูล · ตำแหน่ง TNP ที่คำนวณแล้ว
3. **มิติ 8 (จังหวะชีวิต) มีหมายเหตุค้าง:**
   > "(หมายเหตุ: เฟส 1 engine = natal · ถ้า packet ไม่มี direction/transit ให้ระบุว่าอ่านจากโครง natal เป็นหลัก ไม่แต่งจังหวะเอง)"
   → engine ปัจจุบัน (r389) ส่ง `auslosung` เต็ม (Sonnenbogen direction + ดาวจร ทั้งปีเป้าหมาย) แล้ว
   → หมายเหตุนี้ **สั่งให้ AI ถอยไปอ่าน natal เฉย ๆ** ทั้งที่ข้อมูลจังหวะจริงถูกส่งมา = สาเหตุตรงที่สุดของ "จังหวะ/วันในเล่มบาง"

---

## 5. ร่างแก้ (เสนอ · ยังไม่ลงมือ · ต้องผ่านพ่อ + เจ้านาย)

> ทั้งหมดเป็น **additive/แก้ถ้อยคำ** ไม่แตะ engine (Layer 0–2) · ไม่แตะ Q&A logic

### แก้ที่ 1 (สำคัญสุด · ชั้น A) — เติม auslosung + TNP ที่คำนวณแล้ว เข้า `structuredPacketJson` uranian
ทำให้ JSON เป็นกระจกครบของ prose (ทั้ง book และ Q&A ได้ประโยชน์ร่วม) · ร่างเพิ่มใน `compact`:
```ts
// top-level เพิ่ม:
tnpPrecisionNote: p.tnpPrecisionNote,
auslosung: p.auslosung ? {
  targetFromISO: p.auslosung.targetFromISO, targetToISO: p.auslosung.targetToISO,
  ageAtFrom: p.auslosung.ageAtFrom, ageAtTo: p.auslosung.ageAtTo,
  solarArcDegAtFrom: p.auslosung.solarArcDegAtFrom, solarArcDegAtTo: p.auslosung.solarArcDegAtTo,
  groups: p.auslosung.groups?.slice(0, 8).map((g: any) => ({
    target: g.targetTh, formula: g.formula, sign: g.signTh, deg: g.signDeg,
    events: g.events?.slice(0, 5).map((e: any) => [e.dateISO, e.moverTh, e.aspectTh, e.orbArcmin]),
  })),
  tnpActivations: p.auslosung.tnpActivations?.slice(0, 6).map((e: any) => [e.dateISO, e.moverTh, e.aspectTh, e.natalTargetTh, e.orbArcmin]),
  tnpMoverContacts: p.auslosung.tnpMoverContacts?.slice(0, 6).map((e: any) => [e.moverTh, e.aspectTh, e.natalTargetTh, e.orbArcmin]),
} : null,
// data เพิ่ม:
tnpPoints: d.tnpPoints?.map((t: any) => [t.name, t.rulerSignDe, +t.lon?.toFixed?.(2), +t.dial90?.toFixed?.(2), t.source]),
tnpPlanetaryPictures: d.tnpPlanetaryPictures?.map((x: any) => [x.pair, x.occupant, x.orbDeg, (x.involves||[]).join("/"), x.touchesPersonal ? 1 : 0]),
tnpSensitivePoints: d.tnpSensitivePoints?.map((x: any) => [x.kind, x.a, x.b, x.activatedBy, x.orbDeg, (x.involves||[]).join("/"), x.touchesPersonal ? 1 : 0]),
tnpNotComputable: (d.tnpNotComputable||[]).map((z: any) => [z.name, z.rulerSignDe, z.reason]),
```
(cap slice ไว้แล้วกัน budget · ยังเบากว่า halbsummen ดิบมาก)

**ทางเลือกที่เบากว่า (ถ้าไม่อยากแตะ JSON):** แก้ถ้อยคำบรรทัด 2699 ให้ยอมรับ prose ด้วย เช่น
"ใช้เฉพาะข้อมูลใน 'ผังที่ระบบคำนวณ' (ทั้งส่วนบรรยาย และ STRUCTURED_CHART_PACKET)" — แต่ยัง advise ให้เติม JSON เพราะ machine-readable ชัดกว่า

### แก้ที่ 2 (ชั้น B) — ปรับ `read-full-uranian.md`
- **ลบ/แก้หมายเหตุค้างมิติ 8** เป็น: "ใช้ชั้นการกระตุ้น (Auslösung) ที่ระบบส่งมา: Sonnenbogen-Direktion + ดาวจรบนจุดไว → ระบุ **ช่วง/เดือน/วัน** ที่คมจากรายการเท่านั้น ห้ามเดาวันเอง · ถ้ารายการว่างจึงบอกว่าไม่มีวันเด่น"
- **เติมในหลักเหล็ก** ให้เอ่ยชั้น r390/r391 ที่ engine ส่ง: จุดกระจก (Spiegelpunkte/Antiscia) · เดคลิเนชัน (Parallel/Contra) · ภาพดาว 4 ดวง (Vierergestirn) · ตำแหน่ง TNP ที่คำนวณแล้ว (Cupido/Hades/Kronos · fictitious ±1–2° ห้ามยึดองศา)
- **แก้บรรทัดดาวสมมุติ** ให้ตรง engine: ใช้ได้เฉพาะ **Cupido/Hades/Kronos/Zeus** · ตัด Apollon/Admetos/Vulkanus/Poseidon (สอดคล้อง render.ts rule 5)
- มิติ 8 หัวข้อ เปลี่ยนวงเล็บอ้างอิงให้รวม Auslösung ไม่ใช่แค่ "Sonnenbogen-Direktion · transit"
- (ทางเลือก) เติมมิติหรือ bullet ให้ครบชั้น: จุดกระจก/เดคลิเนชัน/4 ดวง ควรถูกอ้างในมิติที่เกี่ยว (สุขภาพ=antiscia/decl แตะ☉☽ · จังหวะ=Auslösung)

### ลำดับความสำคัญ
1. **แก้ที่ 2 (directive)** — ผลเร็วสุด แก้ผ่าน `/admin/sifu-prompts` ได้ ไม่ deploy โค้ด · ปลดล็อกให้ AI อ่าน auslosung/antiscia/decl/4-ดวง จาก prose ที่ส่งมาอยู่แล้ว
2. **แก้ที่ 1 (JSON mirror)** — ทำให้ทนทาน (กัน 2699 ตัด prose-only) · ได้ทั้ง book+Q&A · ต้อง deploy โค้ด → ผ่านพ่อ + golden + gate ตามปกติ

---

## 6. ข้อควรรู้ / ขอบเขตที่ยังไม่ยืนยัน

- ยังไม่ได้รัน prompt จริงวัดความยาว → ยังไม่ยืนยันว่า book uranian โดน `FUSION_PANEL_PROMPT_MAX_CHARS=118,000` ตัดหรือไม่ ในทางทฤษฎี bookMode เลือก canon กว้าง (directive แตะทุก intent) → canon ใหญ่สุด 56,000 · แต่ shrink loop ลด canon ก่อน (chart รอด) จึง **ไม่น่าตัด chart** · ต้องรัน `SIFU_DUMP_PROMPT` เทียบจริงถึงจะฟันธง
- ไฟล์นี้ยืนยัน "ผังถูกส่ง" จากเส้นทางโค้ด ไม่ได้ยืนยันจาก log prompt จริงของเล่มที่เจ้านายเห็น — ถ้าต้องการ 100% ให้ dump prompt ของ bookId นั้นมาเทียบ
- ไม่แตะ engine/packet/render (ค่าดาราศาสตร์ถูกอยู่แล้ว) · ปัญหาทั้งหมดอยู่ชั้นประกอบ prompt (build-prompt.ts) + directive (prompts/natal-book) เท่านั้น
