# r2L-4 · Audit โหราตะวันตก (Western) — ผัง/ดาวจร/คัมภีร์ ส่งให้ AI ครบไหม

READ-ONLY audit · ไม่แก้โค้ด · ตรวจ `src/lib/fusion5/build-prompt.ts` + `src/lib/astro/western/{engine,packet,timeline,render}.ts` + `src/lib/fusion5/multi-year.ts`

## สรุปผู้บริหาร (ฟันธง)

- **ผังหลัก (natal) ครบทั้ง prose และ JSON** — ดาว 10 ดวง/เรือน/มุม/ฐานะ/lots/topic-matrix ส่งครบสองทาง
- **🔴 พบ 1 จุดตัดทิ้งใหญ่: `timingTimeline` (ชั้นเวลาปีเป้าหมาย) ถูก render เต็มใน prose แต่ "หายทั้งก้อน" จาก STRUCTURED_CHART_PACKET (JSON)**
  - engine คำนวณ → packet มี `data.timingTimeline` (packet.ts:459) → prose แสดงครบ (render.ts:210–268) → **แต่ compact JSON (build-prompt.ts:2463–2511) ไม่มี field นี้เลย**
  - ขัดกับคำสั่งระบบ build-prompt.ts:2782 ที่สั่ง AI ว่า "คำตอบต้องสอดคล้องกับ … field ใน STRUCTURED_CHART_PACKET เท่านั้น"
  - นี่คือบั๊กแบบเดียวกับที่ยูเรเนียนเคยเจอและ**แก้ไปแล้วใน r392** (คอมเมนต์ build-prompt.ts:2576–2578 บอกชัดว่าต้องเติม field ที่หลุดให้ JSON ตรงกับ prose เพราะ AI ถูกสั่งให้ยึด STRUCTURED_CHART_PACKET) — **ฝั่ง western ยังไม่ได้แก้**
- ดาวจร (transits ณ refDate) + timingSupport (return cycle/retrograde) → **ส่งครบทั้ง prose + JSON** (ไม่ตัด)
- multi-year + pair-timing → เป็น prose-only block แยก (ตั้งใจ ไม่ต้องมี JSON คู่)
- จุดตัดเล็กอีก 3 จุด (degradeLevel / antisciaLon ต่อดาว / previousApproxAge-nextApproxAge) — กระทบต่ำ ไม่ขัด prose

---

## ตาราง field · engine → prose → JSON

| Field (engine/packet) | มีใน prose? | มีใน JSON (compact)? | สถานะ |
|---|---|---|---|
| ascendant / mc | ✅ render.ts:94–103 | ✅ 2464–2465 | ครบ |
| partOfFortune | ✅ 105–111 | ✅ 2466 | ครบ |
| lots (7 lots) | ✅ 112–119 | ✅ 2467 | ครบ |
| chartRuler | ✅ 120–126 | ✅ 2500 | ครบ |
| planets: sign/deg/house/retro/dignity/minorDignity/declination | ✅ 138–160 | ✅ 2468–2485 | ครบ |
| planets: antisciaLon / contraAntisciaLon (ราย ดาว) | ✅ 157 | 🟡 ตัด (JSON planet ไม่มี) | ตัดเล็ก — จุดสะท้อนไปอยู่ใน `hiddenContacts` แล้ว |
| hiddenContacts (antiscia/parallel) | ✅ 164–171 | ✅ 2490 | ครบ |
| fixedStarHits | ✅ 174–183 | ✅ 2491 | ครบ |
| houses12 (whole-sign) | ✅ 271–273 | ✅ 2486 | ครบ |
| houseRulers | ✅ 274–276 | ✅ 2501 | ครบ |
| topicLordMatrix (7 หัวข้อ) | ✅ 280–295 | ✅ 2502–2507 | ครบ |
| aspects (มุมหลัก + applying) | ✅ 298–311 | ✅ 2487 | ครบ |
| minorAspects | ✅ 314–323 | ✅ 2488 | ครบ |
| aspectPatterns (T-Sq/Trine/Yod/Kite) | ✅ 324–332 | ✅ 2489 | ครบ |
| shape: elements/modalities/polarities/stellium | ✅ 335–356 | ✅ 2510 | ครบ |
| dominantPlanets / dispositors | ✅ 343–348 | ✅ 2508–2509 | ครบ |
| **transits.refDate + aspectsToNatal (ดาวจร)** | ✅ 186–198 | ✅ 2492–2495 | **ครบ** |
| transits.planets (ตำแหน่งดาวจรดิบ) | ❌ (prose แสดงเฉพาะ aspect) | ❌ 2492–2495 | ตัดสองทาง — สอดคล้อง ไม่ขัด |
| timingSupport.retrogrades | ✅ 199–201 | ✅ 2497 | ครบ |
| timingSupport.returnCycles (พฤหัส/เสาร์) | ✅ 202–205 | ✅ 2498 | ครบ (แต่ดู 2 field ล่าง) |
| returnCycles.previousApproxAge / nextApproxAge | ✅ 204 | 🟡 ตัด (JSON ส่ง ageAtRefDate/cycle/orb/aspect) | ตัดเล็ก กระทบต่ำ |
| timingCoverage (สถานะชั้นเวลา) | ✅ 80 | ✅ 2461 | ครบ |
| unsupportedSpecialtyPackets | ✅ 358–359 | ✅ 2460 | ครบ |
| forbidden/allowedFieldsWhenNoTime | ✅ 88–89 | ✅ 2458–2459 | ครบ |
| degradeLevel | 🟡 สื่อผ่าน hasBirthTime | 🟡 ตัด (vedic/uranian JSON มี · western ไม่มี) | ตัดเล็ก กระทบต่ำ |
| **🔴 timingTimeline.transitHits (วันมุม exact ดาวจร→กำเนิด ทั้งปี)** | ✅ 215–223 | ❌ **ไม่มีใน JSON** | **ตัดทิ้ง — ขัด prose+คำสั่ง 2782** |
| **🔴 timingTimeline.ingresses (ดาวช้าย้ายราศี)** | ✅ 224–226 | ❌ ไม่มี | **ตัดทิ้ง** |
| **🔴 timingTimeline.stations (วันดาวหยุด/กลับทิศ)** | ✅ 227–229 | ❌ ไม่มี | **ตัดทิ้ง** |
| **🔴 timingTimeline.eclipses (คราสปี + แตะดวง)** | ✅ 230–232 | ❌ ไม่มี | **ตัดทิ้ง** |
| **🔴 timingTimeline.solarReturn (SR chart ปีเป้าหมาย)** | ✅ 233–238 | ❌ ไม่มี | **ตัดทิ้ง** |
| **🔴 timingTimeline.profection (Annual Profection + Lord of Year)** | ✅ 239–244 | ❌ ไม่มี | **ตัดทิ้ง** |
| **🔴 timingTimeline.progressed (Secondary Progressions + progressedAspects + moonPerfections)** | ✅ 245–266 | ❌ ไม่มี | **ตัดทิ้ง** |

> เลขบรรทัด prose = `render.ts` · เลขบรรทัด JSON = `build-prompt.ts` (compact `structuredPacketJson`, สาขา `discipline === "western"` 2445–2513)

---

## เทียบ "engine คำนวณ vs JSON ที่ส่ง AI"

engine ฝั่ง western (คำสั่ง `renderChartForScience`, build-prompt.ts:2637–2646) คำนวณครบทุกชั้นตามที่ task ระบุ:

- **ดาว 10** (CORE_10 · engine.ts:450) ✅ ส่งครบ JSON
- **เรือน 12** (whole-sign) ✅ ส่งครบ
- **aspect** (หลัก + minor + pattern) ✅ ส่งครบ
- **transit** (ณ refDate) ✅ ส่งครบ
- **progression / return / eclipse / profection / station / solar return** → คำนวณผ่าน `buildWesternTimeline` (build-prompt.ts:2643) แล้วยัดใน `packet.data.timingTimeline` → **แต่ compact JSON ตัดทั้งก้อน**

สรุป: **8 ชั้นที่ task ให้เช็ค — ดาว/เรือน/aspect/transit อยู่ครบใน JSON; ส่วน progression/return/eclipse/profection (+ solar return + station + ingress) อยู่ใน prose อย่างเดียว หลุดจาก JSON**

---

## prose vs JSON ขัดกันไหม

**ขัด (เชิงคำสั่ง):** build-prompt.ts:2782 สั่ง AI ว่า *"คำตอบต้องสอดคล้องกับคัมภีร์/กฎ/SOURCE_MAP … และ field ใน STRUCTURED_CHART_PACKET เท่านั้น · ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง"* — เมื่อวันที่ exact ของ transit/SR/profection/progression/eclipse ปรากฏ**เฉพาะใน prose** แต่ไม่มีใน JSON ตัวโมเดลอาจตีความว่า "ไม่ใช่ field ใน packet" แล้วลังเลจะฟันวันที่ ทั้งที่ engine คำนวณให้แล้ว

มี guard ฝั่ง prose ช่วยบางส่วน: render.ts:81–83 `TIMING_GUARD` สั่งให้ยึด `TIMING_TIMELINE` เป็นแหล่งวันเดียว — แต่ guard นี้อยู่ใน prose เดียวกับที่อาจถูกมองว่า "นอก STRUCTURED_CHART_PACKET" จึงยังไม่ปิดช่องขัดแย้งกับ 2782 อย่างเด็ดขาด **ทีมเคยตัดสินเรื่องนี้ไปแล้วฝั่งยูเรเนียน (r392) โดยเลือกเติม field ลง JSON ให้ตรง prose** — western ควรทำแบบเดียวกันเพื่อความสม่ำเสมอ

**ไม่ขัดเชิงข้อมูล:** ค่าที่มีทั้งสองทาง (ดาว/เรือน/มุม/transit) ตรงกัน ไม่มี field ไหนที่ prose บอกค่า A แต่ JSON บอกค่า B

---

## ดาวจร (transit/timeline) ส่งครบไหม

- **transit ณ refDate**: ครบทั้ง prose + JSON (มุมดาวจร→จุดกำเนิด + retrograde + return cycle)
- **timeline ทั้งปีเป้าหมาย** (exact transit windows / SR / profection / progression / eclipse / station / ingress): **prose ครบ · JSON หายทั้งหมด** ← จุดต้องแก้
- **multi-year (ช่วงหลายปี)**: `renderMultiYearBlock` (multi-year.ts:84–153) reuse `buildWesternTimeline` ทุกปี → prose-only block (`MULTI_YEAR_TIMELINE`) แยก ไม่มี JSON คู่ (ตั้งใจ · เป็นสรุปย่อ deterministic)
- **pair-timing (ดูคู่/กลุ่ม)**: `renderPairTimingBlock` (multi-year.ts:156–218) prose-only เช่นกัน (ตั้งใจ)

---

## คัมภีร์ western ส่งครบไหม

- registry คัมภีร์ western: build-prompt.ts:84–151 (60+ ไฟล์ · method guard + Lilly/Ptolemy/Robson/Raphael summary + specialty pack 04–57)
- router เลือกไฟล์ตามเจตนาคำถาม: build-prompt.ts:1829–1899 (`selectCanonFilesForPrompt` สาขา western) — มี default set (build-prompt.ts:627) + prioritize ตาม intent
- ส่งผ่าน `SOURCE_MAP` + `SOURCE_ROUTER` ใน assemble (build-prompt.ts:2788–2794) พร้อม hash/char count → **มีระบบเลือกคัมภีร์ครบ ไม่ตัดทิ้งโดยพลการ** (มี shrink loop 2838–2849 เมื่อ prompt เกิน cap · แต่ตัดจากปลาย non-critical prefix ไม่ใช่ตัดคัมภีร์ทิ้งเจาะจง)
- **ยืนยันไม่ได้ / นอก scope:** ไม่ได้เปิดไฟล์คัมภีร์จริงเพื่อตรวจเนื้อหา verbatim (task นี้เน้น packet/JSON) — รายงานเฉพาะกลไกส่ง ไม่รับรองเนื้อในแต่ละไฟล์

---

## ร่างแก้ (ถ้าจะแก้ — ยังไม่แก้ · ต้องขออนุมัติ + ผ่าน "พ่อ")

**เป้า:** เติม `timingTimeline` ลง compact JSON ฝั่ง western ให้ตรง prose (เลียนแบบ pattern uranian r392 ที่ทำ array ย่อเลขล้วนคุมงบ) — additive ล้วน ไม่แตะ engine/packet/prose

จุดแก้เดียว: build-prompt.ts สาขา `discipline === "western"` (ในอ็อบเจกต์ `compact.data` ~2463–2511) เติม key `timingTimeline` แบบย่อ เช่น:

```
timingTimeline: d.timingTimeline ? {
  targetYear: d.timingTimeline.targetYear,
  coverageNote: d.timingTimeline.coverageNote,
  transitHits: d.timingTimeline.transitHits?.map((h) => [h.dateISO, h.month, h.transit, h.aspect, h.natal, h.retro ? 1 : 0, h.pass, h.passesTotal]),
  transitHitsDropped: d.timingTimeline.transitHitsDropped,
  ingresses: d.timingTimeline.ingresses?.map((x) => [x.dateISO, x.body, x.toSignTh, x.retro ? 1 : 0]),
  stations: d.timingTimeline.stations?.map((x) => [x.dateISO, x.body, x.type, x.signTh]),
  eclipses: d.timingTimeline.eclipses?.map((x) => [x.dateISO, x.kind, x.subtype, x.signTh, x.hitNatal ? [x.hitNatal.name, x.hitNatal.aspect, x.hitNatal.orb] : null]),
  solarReturn: d.timingTimeline.solarReturn ? { dateISO: ..., ascendant: ..., planets: ...map } : null,
  profection: d.timingTimeline.profection ? { segments: ...map([fromISO,toISO,age,profectedHouse,profectedSignTh,lordOfYearTh]) } : null,
  progressed: d.timingTimeline.progressed ? { planets: ...map, aspectsToNatal: ...map, progressedAspects: ...map, moonPerfections: ...map } : null,
} : null,
```

**ข้อควรระวัง (ตามกติกาโปรเจกต์):**
- ต้องคุมงบ prompt (array-of-primitives แบบ uranian · อย่าส่ง object ใหญ่) — มี `FUSION_PANEL_PROMPT_MAX_CHARS` + shrink loop รออยู่
- เป็นการแก้ Layer 4 (build-prompt · การนำเสนอ) ไม่แตะ engine/packet/timeline (Layer 2) — ตรงกับกฎ "engine deterministic ก่อน"
- ทางเลือกรอง (แก้เล็กกว่า): ถ้าไม่อยากเติม JSON ให้ปรับถ้อยคำ 2782 ให้ยอมรับ prose block `TIMING_TIMELINE` เป็นแหล่งฟันธงวันได้ชัดเจน — แต่ **ทีมเลือกแนวเติม JSON ไปแล้วกับ uranian** จึงแนะนำให้ทำแนวเดียวกันเพื่อความสม่ำเสมอ
- จุดตัดเล็ก (degradeLevel / returnCycles previousApproxAge-nextApproxAge / antisciaLon ต่อดาว) กระทบต่ำ — จะเติมพร้อมกันหรือปล่อยไว้ก็ได้ ไม่เร่งด่วน

---

## สิ่งที่ยืนยันไม่ได้ (พูดตรง)

1. **ไม่ได้รันจริง** เพื่อดู prompt output จริง (audit จากการอ่านโค้ด static เท่านั้น) — สรุปว่า field หายจาก JSON ยืนยันจากโครงสร้าง compact object โดยตรง ไม่ใช่จากการเดา
2. **ไม่ได้ตรวจเนื้อคัมภีร์ western verbatim** (60+ ไฟล์) — รายงานเฉพาะกลไก router/SOURCE_MAP ว่าส่งครบ ไม่รับรองเนื้อหาในไฟล์
3. **ผลกระทบต่อคำตอบจริงของ AI** (โมเดลจะเมิน prose timeline เพราะยึด 2782 หรือไม่) — เป็นการประเมินความเสี่ยงเชิงตรรกะ ไม่ได้ทดสอบกับ AI จริง จึงระบุเป็น "เสี่ยงขัด" ไม่ใช่ "พังแน่นอน"
</content>
</invoke>
