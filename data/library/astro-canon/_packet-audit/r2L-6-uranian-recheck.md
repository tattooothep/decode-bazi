# r2L-6 · ยูเรเนียน recheck — ยืนยันหลัง fix r392 + synastry r395 + multi-year r396

READ-ONLY audit · ห้ามแก้โค้ด · ตรวจ HEAD = `239ea84` (r396b)

## หมายเหตุเรื่อง "r394"
ไม่มี commit r394 แยกจริง — งาน "ข้อมูลผังส่งครบ + wire พจนานุกรม 159 คู่" อยู่ใน **r392 = `7c816ba`**
(สาย r392 มี 2 commit: `5839e14` reliability/dict + `7c816ba` packet-completeness) · r393=`3db2c46` เมนูหนังสือ
(ไม่เกี่ยว packet) · r395=`2fe627b` synastry · r396=`9190e77` multi-year · r396b=`239ea84` golden test.
ทุก fix ที่ตรวจอยู่ใน HEAD แล้วครบ.

ไฟล์ที่อ่าน: `src/lib/fusion5/build-prompt.ts` (structuredPacketJson uranian 2572–2626 + render 2662–2672 +
selectCanonFilesForPrompt uranian 2188–2238) · `src/lib/astro/uranian/{engine,packet,render,auslosung,synastry,tnp-kepler}.ts` ·
`src/lib/fusion5/{pair-interactions,multi-year}.ts`

---

## ตารางยืนยัน — field · ส่งครบใน STRUCTURED_CHART_PACKET (JSON) หลัง fix ไหม

| Field | เดิม (ก่อน r392) | หลัง fix (HEAD) | หลักฐาน |
|---|---|---|---|
| `auslosung` (ชั้นเวลา จับวัน/เดือน) | ❌ ตัดทั้งก้อน → ตอบวันไม่ได้ | ✅ ส่งแล้ว (targetFrom/To, age, solarArc, groups×12, events×6) | build-prompt 2596–2606 |
| `auslosung.tnpActivations` (ดาวจรจริงแตะจุด TNP กำเนิด) | ❌ | ✅ ส่งแล้ว (×10) | build-prompt 2604 · auslosung.ts 434–436 |
| `auslosung.tnpMoverContacts` (TNP เป็นตัวกระตุ้นช้าข้ามปี) | ❌ | ✅ ส่งแล้ว (×10) | build-prompt 2605 · auslosung.ts 440–450 |
| `personalPoints` (รวม **AriesPoint** 0°♈ + แกนสี่ทิศ Krebs/Waage/Steinbock + LocationPoint) | ❌ ไม่โผล่ที่ไหนเลย | ✅ ส่งแล้ว `[name,signTh,signDeg,dial90]` | build-prompt 2610 · engine 322–337 · render 83–91 |
| `tnpPoints` — **Cupido/Hades/Kronos** (Kepler mean-element r391) | ❌ หลุดจาก JSON ทั้งที่ prose พูดถึง | ✅ ส่งแล้ว `[name,signTh??rulerSignDe,lon,dial90,source]` | build-prompt 2620 |
| `tnpPlanetaryPictures` (ภาพดาวมี TNP ร่วม · หมวด H) | ❌ | ✅ ส่งแล้ว | build-prompt 2621 |
| `tnpSensitivePoints` (จุดไวมี TNP ร่วม) | ❌ | ✅ ส่งแล้ว | build-prompt 2622 |
| `tnpNotComputable` (Zeus · element หาย) | — | ✅ ส่งแล้ว `[name,reason]` | build-prompt 2623 |
| `tnpElementsMissing` (element ที่คัมภีร์ไม่ให้ · โปร่งใส) | — | ✅ ส่งแล้ว | build-prompt 2624 |
| ป้ายที่มา TNP | `tnpPositionSource="…not_wired_phase1"` (ขัด prose) | ✅ **not_wired หายจริง** → ใช้ `tnpPositionSourceKepler` + `tnpPrecisionNote` แทน | build-prompt 2591–2592 |
| `notAvailable` (packet) | ดัน `witteTransneptunianPositions` เหมาก้อน | ✅ เหลือเฉพาะ `zeus_position` (คำนวณไม่ได้จริง) | packet.ts 77–82 |
| points / planetaryPictures / fourPlanetPictures / sensitivePoints / antiscia / declinationPairs | ✅ (มีอยู่ก่อน) | ✅ คงส่งครบ | build-prompt 2608–2617 |
| nodeMeanLon / nodeTrueLon (mean+true) | ✅ | ✅ | build-prompt 2589–2590 |
| witteTransneptunians / excludedTransneptunians (Sieggrün guard) | ✅ | ✅ | build-prompt 2618, 2593 |
| orb ทุกชนิด (Picture/Sensitive/Antiscia/Parallel/FourPlanet) | ✅ | ✅ | build-prompt 2584–2588 |
| **dict 159 คู่ + expansion** wire | — | ✅ wire แล้ว (13-dict-part1..5 ตาม intent + core+points+tnp เสมอ + S1-S8 สำรองท้าย) | build-prompt 2203–2236 |

**สรุปหลัก: ครบตามที่แจ้ง — auslosung / tnpPoints(Cupido/Hades/Kronos) / personalPoints(AriesPoint) อยู่ใน JSON แล้วจริง (r392) · ป้าย not_wired หายจริง · dict 159 คู่ + expansion wire แล้ว.**

---

## synastry (r395) — ส่งครบไหม
✅ **ส่งครบ.** `renderPairInteractionPacket` (build-prompt 2818):
- คู่ 2 ดวง → `renderPacketBlock` = `JSON.stringify(payload, null, 2)` เต็มก้อน (pair-interactions 57–64, 520–522)
- กลุ่ม 3–4 ดวง → วนทุกคู่ i<j แล้ว JSON.stringify เต็ม (pair-interactions 526–544)
- payload = `uranianSynastry()` → contacts (C1 crossMidpointPicture / C2 crossSensitivePoint / C3 personalDirectContact / C4 connectionPoints Sonnensumme·☉☽-Summe·MC-Summe) + `notAvailable` ครบ (synastry.ts 199–288)
- NO_PERCENT + CLOSED_LIST guard + no-time guard (meridian/ascendant/houseOverlay ปิดเมื่อขาดเวลา) ครบ

## multi-year (r396) — ส่งครบไหม
✅ **ส่งครบ.** 2 ทาง reuse engine เดิม (uranianChart + computeUranianAuslosung · deterministic):
- `renderMultiYearBlock` (build-prompt 2815): วนปี startYear..endYear → top 3 notable Auslösung/ปี + วัน exact + ตัวกระตุ้น (multi-year 138–147) — ทำงานเมื่อคำถามมีช่วงหลายปี
- `renderPairTimingBlock` (โหมดคู่/กลุ่ม): จัด Auslösung เด่นตามเดือน หาเดือนชนกัน (multi-year 190–197)
- filter `isNotableAusEvent` = คงเฉพาะ directed/progressed หรือดาวจรช้า (ตัด snapshot ดาวเร็วสุ่ม) — สมเหตุผล

---

## เหลือ field ไหนยังตกหล่นอีกไหม

### ตัดโดยตั้งใจ (ยืนยันว่าตั้งใจ ไม่ใช่บั๊ก)
- **halbsummen ดิบ** — ตัดจริงตามที่แจ้ง มีป้าย `halbsummenOmitted:"budget_only__see_planetaryPictures_and_sensitivePoints"` บอก AI ว่า engine คำนวณแล้ว ไม่ใช่ขาด (build-prompt 2611–2612) ✅ ถูกต้อง
- `tnpPositionSource` literal เก่า — เจตนาไม่ส่ง (แทนด้วย Kepler) ✅

### ตกหล่นจริงแต่ระดับ "minor / ไม่กระทบการอ่าน" (prose ครอบให้แล้ว หรือเป็น meta โปร่งใส)
พูดตรง: มีบาง field อยู่ใน packet/prose แต่ **ไม่อยู่ใน compact JSON** — ทั้งหมดไม่ใช่ตัวตัดสิน เพราะ prose (renderUranianPrompt) เป็นข้อความอ่านหลักที่ส่งคู่กับ JSON เสมอ (build-prompt 2671):
1. `auslosung.groups[].natalOrbArcmin` ("คมในผังกำเนิด ′") — **มีใน prose** (render 201) แต่ JSON group ย่อเหลือ `{target,formula,sign,deg,events}` ไม่มี natalOrbArcmin
2. `auslosung` meta โปร่งใส: `methodCounts` / `totalEventsFound` / `notes` / flat `events[]` / `orbFastDeg` / `orbSlowDeg` / `notAvailable` — ไม่อยู่ใน JSON (groups มี event รายจุดครบแล้ว · flat events เป็นสำเนา re-sort · เป็นข้อมูลตรวจสอบ ไม่ใช่เนื้อการอ่าน)
3. packet-meta guard: `birthTimeMode` / `moonUncertainty` / `forbiddenFieldsWhenNoTime` / `allowedFieldsWhenNoTime` / `gender` / `nodeType` — ไม่อยู่ใน JSON · แต่ `hasBirthTime` ส่ง (2582) และ no-time ถูกกันด้วย prose + คำเตือน no-time ใน buildSciencePrompt (2804–2805) แล้ว
4. `auslosung.notAvailable` ยังมี string `"witteTransneptunianPositions"` (auslosung.ts 472) และ packet field `tnpPositionSource="…not_wired_phase1"` (packet.ts 38/99) — **แต่ทั้งคู่ไม่ถูก serialize เข้า compact JSON** จึงไม่รั่วไปถึง prompt (ยืนยันแล้ว: compact auslosung ส่งเฉพาะ 6 field ที่ระบุ 2597–2606 · compact ราก ใช้ tnpPositionSourceKepler)

### ยังเป็น roadmap (ไม่ใช่ตกหล่นจาก fix นี้ · ระบุตรงในโค้ด)
- **Zeus** ตำแหน่ง — คำนวณไม่ได้ (ตาราง element หายจากคลัง Witte) · กันไว้ครบทั้ง prose/JSON/auslosung guard (ห้ามระบุองศา/ราศี · ห้ามใช้เป็นตัวกระตุ้น)
- **TNP ใน synastry** — เฟส 2 (precision ±1–2° ไม่พอ orb ข้ามดวง 1.0°) · ติด `tnpSynastry_phase2` ใน notAvailable (synastry.ts 284) — เจตนา
- crossAntiscia / houseOverlay rule-4 / pair-timing ของ synastry — เฟส 1.5/r2k-5 (จดไว้ใน notAvailable)

---

## สรุปฟันธง
- **ยืนยัน: หลัง r392 ยูเรเนียนส่งครบจริง** — auslosung + tnpPoints(Cupido/Hades/Kronos) + personalPoints(AriesPoint) เข้า JSON แล้ว · not_wired หายจริง · dict 159 คู่ + expansion wire แล้ว
- **synastry (r395) ส่งครบ** (JSON เต็มก้อน ทั้งคู่และกลุ่ม 3–4 ดวง)
- **multi-year (r396) ส่งครบ** (รายปี + pair-timing รายเดือน · reuse engine เดิม)
- **ไม่มี field เนื้อการอ่านตกหล่น** · ที่ไม่อยู่ใน JSON คือ (ก) halbsummen ดิบ = ตั้งใจตัด (ข) meta/guard โปร่งใสไม่กี่ตัว ซึ่ง prose ครอบให้แล้ว — ระดับ minor ไม่กระทบคำฟันธง
- **ยังยืนยันไม่ได้ (นอกขอบ static read):** ไม่ได้รันสร้าง prompt จริงเพื่อวัดขนาด/ดูว่า shrink loop ตัดส่วน dict/S1-S8 ตอน budget เกินหรือไม่ (โค้ดออกแบบให้ตัดท้ายก่อน = Witte verbatim รอด · แต่ไม่ได้ทดสอบ runtime)
