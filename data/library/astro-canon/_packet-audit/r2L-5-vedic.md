# r2L-5 · Audit โหราพระเวท (Vedic / Jyotish) — ผัง/ดาวจร/คัมภีร์ ส่งถึง AI ครบไหม

READ-ONLY audit · ไม่แก้โค้ด · เทียบ engine → packet → (prose + STRUCTURED_CHART_PACKET JSON)

ไฟล์ที่ตรวจ:
- `src/lib/fusion5/build-prompt.ts` — วิ่ง vedic canon router (~2013), compact JSON (`structuredPacketJson` ~2515), render/multi-year hookup (~2648/2802/2814)
- `src/lib/astro/vedic/engine.ts` — `vedicChart()` + type `VedicChart`
- `src/lib/astro/vedic/packet.ts` — `buildVedicPacket()`
- `src/lib/astro/vedic/render.ts` — `renderVedicPrompt()` (prose)
- `src/lib/astro/vedic/timeline.ts` — `buildVedicTimeline()`
- `src/lib/astro/vedic/ashtakoota.ts` — Guna Milan 36 (เส้นทางแยก)

Pipeline จริง (ต่อ 1 ดวง): `renderChartForScience("vedic")` คืน
`renderVedicPrompt(packet)` + `"\n\nSTRUCTURED_CHART_PACKET:\n"` + `structuredPacketJson(packet)`
→ **AI ได้ทั้ง prose และ JSON ต่อกัน** (build-prompt.ts:2656)

---

## 1) engine → packet ครบไหม (ชั้นแรก)

`VedicChart` มี field: `lagna, grahas, bhavas, moonNakshatra, vimshottari, vargas, ashtakavarga, shadbala, yogaCandidates, gochara` (+`dtUTC/lat/lng/hasTime/degradeLevel/ayanamsa`)

`buildVedicPacket()` surface **ครบทุก field** ของ engine + เติม `timingTimeline` (จาก `buildVedicTimeline`).
→ **ชั้น engine→packet: ครบ ไม่มีตัดทิ้ง** (รวม graha/rashi/bhava/nakshatra/dasha/vimshottari/transit(gochara)/shadbala/ashtakavarga/varga/drishti/yoga)

`ashtakoota` (Guna Milan 36) **ไม่ได้อยู่ในผังเดี่ยว** โดยตั้งใจ — เป็นโมดูลคู่ ส่งผ่านเส้นทางแยก
(`pair-interactions.ts:285` block `ashtakoota` + `resonance.ts:521` R4 votes) → คู่ได้รับ ไม่ใช่ gap ของผังเดี่ยว

---

## 2) packet → JSON (STRUCTURED_CHART_PACKET) · ตาราง field

`structuredPacketJson` vedic branch = build-prompt.ts:2515–2570

| Field (packet.data) | ใน JSON? | ใน prose? | สรุป |
|---|---|---|---|
| ayanamsa | ✅ | ✅ | ครบ |
| lagna (full) | ✅ | ✅ | ครบ |
| grahas.name/rashi/deg/house/nakshatra/pada/dignity/rashiLord/rashiLordRelation/retro/speed/combust/orbFromSun | ✅ (ย่อ key: n/r/deg/h/nak/pada/dignity/lord/rel/retro/speed/combust/sunOrb) | ✅ | ครบ |
| grahas.**moolatrikona** (flag) | ❌ | ❌ | ตัด — แต่ค่าถูกกลืนใน `dignity="moolatrikona"` แล้ว (ผลน้อย) |
| grahas.**deepExaltationOrb / deepDebilitationOrb** | ❌ | ❌ | **ตัดจากทั้งสองที่** — engine คำนวณ orb ถึงองศาอุจ/นิจลึก แต่ AI ไม่เห็น (ผลน้อย-กลาง: อ่านความเข้ม อุจ/นิจ หยาบลง) |
| grahas.sidLon / rashiTh / nameTh / rashiLordTh / combustion.limitDeg | ❌ (JSON) | ✅ (prose) | ครบผ่าน prose (JSON ย่อ label ไทย/องศาดิบ — ไม่เสียหลักฐาน) |
| vargas.navamsaD9 / dashamsaD10 / shodasha16 | ✅ ([name,rashi,deg,dignity,vargottama]) | บางส่วน (D9/D10 เต็ม · shodasha แค่ชื่อชุด) | ครบพอ (ตัด lord/part/nameTh — derivable) |
| bhavas [house,sign,lord] | ✅ | ✅ | ครบ (signTh ตัดจาก JSON · prose มี) |
| moonNakshatra {name,pada,lord} | ✅ | ✅ | ครบ |
| vimshottari (startLord/balanceYears/mahadasha[]/currentMaha/currentAntar) | ✅ | ✅ | ครบ — ลำดับ 9 มหาทศา + ช่วงปัจจุบัน |
| drishti [from,to,aspectHouse] | ✅ | ✅ | ครบ (ตัด label ไทย/rashi context — prose มี) |
| yogaCandidates (code/name/status/evidence/cautions) | ✅ (เต็ม) | ✅ | ครบ |
| shadbala {method,scale,planets[graha,score,band,components]} | ✅ | ✅ | ครบ |
| ashtakavarga {method,planets[graha,total,bindusByRashi],sarvaByRashi,sarvaTotal} | ✅ | ✅ | ครบ |
| gochara.grahas [name,rashi,deg,houseFromLagna,houseFromMoon,dignity,retro,combust] | ✅ | ✅ | ครบ (ตัด nakshatra/pada/sidLon ของดาวจร — ผลน้อย) |
| gochara.hitsToNatal [transit,natal,relation,aspectHouse] | ✅ | ✅ | ครบ |
| **data.timingTimeline** (TIMING_TIMELINE ทั้งก้อน) | ❌ **ไม่มีใน JSON เลย** | ✅ (prose render.ts:192–220) | **🔴 ตัดจาก JSON — finding หลัก** |

### รายละเอียด timingTimeline ที่หายจาก JSON
`buildVedicTimeline` คำนวณจริงทั้งปีเป้าหมาย แล้วใส่ `packet.data.timingTimeline` แต่ compact JSON **ไม่ copy field นี้** ทั้งก้อน:
- `dashaTimeline` — ทศา 3 ชั้น (มหา→อันตร→ปรัตยันตร) พร้อมวัน `fromISO/toISO` ตลอดปี
- `transitSegments` — เสาร์/พฤหัส/ราหู/เกตุ/อังคาร รายช่วงราศี + `bavBindus`/`sarvaBindus` + `retroAtIngress`
- `sadeSati` — เฟส 12/1/2 จากจันทร์กำเนิด พร้อมวันเริ่ม-จบ
- `varshaphala` — สุริยคติ sidereal return + Muntha + ตำแหน่งดาว ณ วันเริ่มปี

---

## 3) prose ขัด JSON ไหม / ดาวจร+ทศา ส่งครบไหม

**ดาวจร (gochara snapshot)**: ครบทั้ง JSON + prose.
**ทศา (natal Vimshottari + ลำดับ 9 มหาทศา + current)**: ครบทั้ง JSON + prose.

**ขัดกันเชิงระบบ (medium):** timingTimeline (ทศา 3 ชั้นรายวัน + gochara ingress dates + sade sati phases + varshaphala) อยู่ **prose อย่างเดียว ไม่อยู่ JSON** ขณะที่ prompt สั่ง AI ย้ำ 2 จุดให้ยึด "field ใน STRUCTURED_CHART_PACKET":
- build-prompt.ts:2782 — "คำตอบต้องสอดคล้องกับ...field ใน STRUCTURED_CHART_PACKET เท่านั้น · ห้ามใช้ความรู้ทั่วไปนอก packet"
- build-prompt.ts:2690 — "ทุกคำฟันธงหลักต้องมี anchor จาก packet...dasha/transit หรือช่วงปีจรที่ระบบส่งมา"

= AI ถูกบอกให้ผูกหลักฐานกับ JSON แต่วัน/ช่วงของ timeline ไม่ได้อยู่ใน JSON → เสี่ยง AI ตอบวัน/เดือนไม่มั่นใจ หรือถือว่า "ไม่มีในผัง"

**นี่คือเคสเดียวกับที่ยูเรเนียนเคยเจอและแก้ไปแล้ว (precedent):** คอมเมนต์ r392 (build-prompt.ts:2576–2578, 2595) เขียนชัดว่า `auslosung` "เดิมตัดทั้งก้อน AI จึงตอบวันไม่ได้" และอ้าง prose ~2699 ที่สั่งยึด STRUCTURED_CHART_PACKET → จึงเติม `auslosung` เข้า JSON ยูเรเนียน. **Vedic timingTimeline ยังไม่ได้ทำแบบเดียวกัน.**
(หมายเหตุเทียบ: Western ก็ส่ง timeline ทางเดียวเหมือนกันเป็นส่วนใหญ่ — ควรตรวจแยกใน audit ของ western; ที่ยืนยันได้คือ uranian = แก้แล้ว, vedic = ยังไม่แก้)

**ไม่มี prose ที่พูดถึง field ซึ่ง JSON ธงว่าไม่มี** (no-time: lagna/bhavas/house เป็น null สอดคล้องทั้ง prose + JSON + notAvailable + forbiddenFieldsWhenNoTime) → ไม่มีข้อขัดแย้งทิศทางนี้

---

## 4) คัมภีร์ Vedic (BPHS) ส่งครบไหม

ไฟล์คัมภีร์มีจริงบนดิสก์ `data/library/astro-canon/vedic/`:
- BPHS: `02-bphs-dasha-yoga.md`, `10-bphs-yogas.md` ✅
- method/rules: `00-method.md` (Parashari), `01-classical-rules.md`, `vedic-core.md`, `05-dasha-deepening-rules.md`
- default canon (build-prompt.ts:628): `00-method / 06-router / 07-functional / 01-classical / 04-topic-packs / 05-dasha`
- router (2013–2110) ดัน BPHS เข้าเมื่อ intent เข้าเงื่อนไข: `02-bphs-dasha-yoga.md` (timing/relationship/money/fortune ฯลฯ) + `10-bphs-yogas.md#yoga-table+yogakaraka+raja/dhana/mahapurusha`

→ **คัมภีร์ BPHS มีและ route ถึง prompt** ตามหัวข้อคำถาม (ไม่ยัด 79KB รวด — ส่งตารางโยคะ + section ที่เกี่ยว) ครบตามดีไซน์

---

## 5) ร่างแก้ (ถ้าจะปิด finding — ยังไม่แก้ ตาม READ-ONLY)

เติม `timingTimeline` เข้า compact JSON แบบย่อ (เลียน pattern `auslosung` ยูเรเนียน) — แทรกหลัง `gochara` ในบล็อก vedic (~หลังบรรทัด 2568) ของ `structuredPacketJson`:

```ts
        timingTimeline: d.timingTimeline ? {
          targetYear: d.timingTimeline.targetYear,
          method: d.timingTimeline.method,
          coverageNote: d.timingTimeline.coverageNote,
          // ทศา 3 ชั้นทั้งปี [from,to,maha,antar,pratyantar]
          dashaTimeline: d.timingTimeline.dashaTimeline?.map((r: any) =>
            [r.fromISO, r.toISO, r.maha, r.antar, r.pratyantar]),
          // ดาวจรรายช่วงราศี + bindu [graha,from,to,rashi,houseFromMoon,houseFromLagna,bav,sav,retro]
          transitSegments: d.timingTimeline.transitSegments?.map((s: any) =>
            [s.graha, s.fromISO, s.toISO, s.rashi, s.houseFromMoon, s.houseFromLagna, s.bavBindus, s.sarvaBindus, s.retroAtIngress ? 1 : 0]),
          sadeSati: d.timingTimeline.sadeSati ? {
            natalMoonRashi: d.timingTimeline.sadeSati.natalMoonRashi,
            active: d.timingTimeline.sadeSati.activeAnyTimeInYear ? 1 : 0,
            phases: d.timingTimeline.sadeSati.phases?.map((p: any) => [p.phase, p.fromISO, p.toISO]),
          } : null,
          varshaphala: d.timingTimeline.varshaphala ? {
            dateISO: d.timingTimeline.varshaphala.dateISO,
            uncertainNoBirthTime: d.timingTimeline.varshaphala.uncertainNoBirthTime ? 1 : 0,
            munthaRashi: d.timingTimeline.varshaphala.munthaRashi,
            grahas: d.timingTimeline.varshaphala.grahas?.map((g: any) => [g.name, g.rashi, g.rashiDeg, g.retro ? 1 : 0]),
          } : null,
        } : null,
```

(ทางเลือกรอง — ผลน้อย: เติม `deepExaltationOrb/deepDebilitationOrb` เข้า grahas array ถ้าต้องการความเข้มอุจ/นิจละเอียด)

**ยังไม่ควรแก้เองก่อนถามเจ้านาย** — บล็อก `structuredPacketJson` อยู่ในสาย prompt ที่ verify แล้ว (golden) · แก้ต้องผ่าน gate + พ่อ review.

---

## สรุปที่ยืนยันได้ / ยืนยันไม่ได้ (พูดตรง)

**ยืนยันได้:**
- engine → packet: **ครบ** ทุก field (รวม timingTimeline)
- ผังหลัก + ดาวจร snapshot + natal Vimshottari + shadbala + ashtakavarga + varga + drishti + yoga: **ครบทั้ง prose + JSON**
- คัมภีร์ BPHS: มีไฟล์จริง + route ถึง prompt
- ashtakoota (คู่): ส่งผ่าน pair-interactions/resonance — ไม่ใช่ gap ผังเดี่ยว
- 🔴 **1 finding หลัก:** `data.timingTimeline` (ทศา 3 ชั้น/gochara ingress/sade sati/varshaphala รายวัน) **หายจาก STRUCTURED_CHART_PACKET JSON** ทั้งที่มีใน prose — ขัดกับคำสั่ง prompt ที่ให้ยึด JSON เป็น anchor; เป็นเคสเดียวกับที่ยูเรเนียนแก้ไปแล้ว (r392 auslosung)
- ผลน้อย: `moolatrikona` flag + `deepExaltationOrb/deepDebilitationOrb` หายจากทั้ง JSON + prose

**ยืนยันไม่ได้ (ไม่ได้ตรวจในรอบนี้):**
- ไม่ได้รันจริงเพื่อดู prompt ที่ประกอบเสร็จ (ไม่ได้ set `SIFU_DUMP_PROMPT=1`) — สรุปจากอ่านโค้ด/type ล้วน
- ผลกระทบเชิงพฤติกรรม AI ว่า "ตอบวัน timeline พลาดจริงไหม" ต้องมี golden/blind-test ยืนยัน (ยังไม่ทำ)
- Western timeline อยู่ JSON หรือไม่ — เห็นเค้าว่าส่ง prose-only คล้ายกัน แต่ **ไม่ได้ตรวจ render ฝั่ง western** รอบนี้ ยังไม่ฟันธง
