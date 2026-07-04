# r2i-1 — ช่องว่างเทคนิค Witte/Hamburg School ที่ AI ยูเรเนียนของเรายัง "ไม่มี"

> วันที่: 2026-07-04 · READ-ONLY gap analysis (ไม่แก้โค้ด — มี agent อื่น build อยู่)
> เทียบ: โค้ดจริง `src/lib/astro/uranian/{engine,packet,render,auslosung}.ts` + `src/lib/fusion5/day-sniper.ts`
>         vs ระบบ Witte เต็ม (คัมภีร์ `10-witte-canon-de.md` 47 บทความ + `01-source-policy-conclusion.md` + `zone5-*antiscia`)
> วัตถุประสงค์: หา technique ที่ "ตำรามี แต่เรายังไม่ทำ" → จัดอันดับควรทำก่อน + แยกอันที่ทำได้เลย (canon PD พร้อม) จากอันที่ต้องหาเพิ่ม
>
> ⚠️ ความซื่อสัตย์ (ยืนยันไม่ได้ = บอกตรง): ข้อสรุปด้านล่างอิงจาก (ก) อ่านโค้ด engine/auslosung/day-sniper ครบ (ข) คัมภีร์ที่สกัดแล้ว `10-witte-canon-de.md` + อ้างอิงบทใน `01-source-policy-conclusion.md`. **ผมยังไม่ได้เปิด PDF ต้นฉบับบท 03/23/28/34/35/46 อ่านเนื้อเต็ม** — สถานะ "มีในคัมภีร์แล้ว/ต้องสกัดเพิ่ม" ระบุตามที่ตรวจได้จริง ส่วนที่อนุมานจากชื่อบท+อ้างอิงจะกำกับว่า "ยังไม่ยืนยันเนื้อเต็ม"

---

## 0) ฐานปัจจุบัน — engine เรา "มีอะไรแล้ว" (baseline · เพื่อไม่ให้เสนอซ้ำ)

| มีแล้ว | ที่ไฟล์ |
|---|---|
| ครึ่งผลรวม (Halbsumme) ทุกคู่ · แกนสมมาตร | engine.ts `halbsummen` |
| ภาพดาว 3 ดาว (occupant ตกบนครึ่งผลรวมของอีก 2) · orb 1.5° บนหน้าปัด 90° | engine.ts `planetaryPictures` |
| จุดไว: ผลรวม (a+b) + ผลต่าง (a−b) ถูกดาวกระตุ้น · orb 1.0° | engine.ts `sensitivePoints` |
| หน้าปัด 90° (dial90Distance/midpointLon) | engine.ts + day-sniper.ts |
| จุดส่วนตัว 6: ☉☽ Asc MC Node(mean) AriesPoint(0°♈) — **เป็นเป้าเฉพาะชั้น Auslösung** | engine.ts `personalPoints` |
| Auslösung 3 ชั้น: ดาวจร(Transite) · ส่วนโค้งอาทิตย์(Sonnenbogen/directed) · progression ☉☽Meridian · มุมแข็ง 0/45/90/135/180 | auslosung.ts |
| เข็ม D (day-sniper): ดาวจรแตะจุดกึ่งกลาง natal บน dial 90° | day-sniper.ts |
| TNP Witte 4 ดวง (Cupido/Hades/Kronos/Zeus) = ชื่อ+ความหมายเท่านั้น (ยังไม่คำนวณตำแหน่ง = เฟส 2) | engine.ts `WITTE_TNP` |
| declination **คำนวณอยู่แล้วใน core** แต่ engine ยูเรเนียน **ทิ้ง** (เก็บเฉพาะ lon) | astro-core/ephemeris.ts `BodyPos.declination` |

---

## 1) ตาราง GAP (technique ตำรามี–เรายังไม่ทำ)

| # | Technique (Witte) | ตำราอ้าง (บท) | มูลค่าต่อความแม่น | ทำยาก-ง่าย | License สะอาด? | canon PD พร้อมไหม |
|---|---|---|---|---|---|---|
| **G1** | **Spiegelpunkte / Antiscia (จุดกระจก)** — สะท้อนดาวรอบแกน 0°กรกฎ/มังกร (Erdmeridian) + contra รอบ 0°เมษ/ตุล | บท 16 (จุดไวหมวด 1+3 = "Spiegelpunkte zum Erdmeridian/zu einem Planeten") · บท 36 · บท 02 · ราก Ptolemy (zone5) | **สูงมาก** — Witte จัดเป็น "จุดไวหมวดแรกสุด" แต่ engine เราไม่มีเลย (มีแค่ sum/diff) | **ง่าย-กลาง** (สะท้อน lon รอบ 2 แกน + จับ contact) | ✅ สะอาด (Witte PD + Ptolemy PD) | ✅ **มีในคัมภีร์แล้ว** (บท 16/36/02 verbatim) |
| **G2** | **Deklination / Parallel-Kontakt (มุมเดคลิเนชัน/พาราเรล + contra-parallel)** | บท 03 "Leichte Berechnung d. Deklination" · บท 23 · บท 46 (kriminalistische Studie · Witte ใช้ declination จริง) | **สูง** — เป็น "ลายเซ็น" Witte ที่ซอฟต์แวร์ยูเรเนียนน้อยเจ้าทำ · เพิ่มมิติแกน (ไม่ใช่แค่ lon) | **ง่าย** (core มี `declination` แล้ว! engine แค่ต้องเก็บ+เทียบ ‖/contra orb ~1°) | ✅ สะอาด (Witte เขียนเอง 3 บท) | 🟡 **ต้องสกัดเพิ่ม** (PDF บท 03/23/46 ยังไม่ทำเป็น canon md · ยังไม่ยืนยันเนื้อเต็ม) แต่ **ตัวคำนวณพร้อม** |
| **G3** | **ระบบเรือน 3 ชุด (Häuser des Sonne / Meridian / Aszendent)** + กฎความหมายตามเรือน | หมวด G: บท 08/32/38/41 · **กฎความหมาย บท 42** ("Jupiter im VIII. Hause der Sonne…") · Hades I–XII บท 40 | **สูงสุดเชิงเนื้อ** — นี่คือที่ "ประโยคความหมาย PD ของ Witte" อาศัยอยู่ (บท 40/42) · ปลดล็อกให้อ้าง verbatim ได้ | **กลาง-ยาก** (คำนวณเรือนสัมพัทธ์ต่อดาว/อาทิตย์/เมริเดียน 12×N) | ✅ สะอาด | ✅ **มีในคัมภีร์แล้ว** (หมวด G + F verbatim) |
| **G4** | **ภาพดาว 4 ดาว (Vierergestirn · A+B = C+D)** = ครึ่งผลรวม 2 คู่เท่ากัน | บท 44 ("J+S = ☉+☽") · บท 31 ("Summen von je zwei Planeten gleiche Werte") · บท 30 | **กลาง-สูง** — Witte ถือว่าภาพดาวเด่นสุดหลายอันเป็น 4-ดาว · engine เราจับแค่ 3-ดาว | **ง่ายมาก** (เทียบ `halbsummen` ที่มีอยู่: หา 2 mid เท่ากันภายใน orb) | ✅ สะอาด | ✅ **มีในคัมภีร์แล้ว** (บท 44/31) |
| **G5** | **Mondknoten เป็นปัจจัยเต็มในภาพดาว/จุดไว** (ไม่ใช่แค่เป้า Auslösung) | บท 42 ("Mondknoten = Verbindung weiblich-männlich") · บท 44 ("N.+3−☽ = Verlobung") | **กลาง** — natal picture ที่มี Node หายไปทั้งหมด (Witte ให้ Node สำคัญ) | **ง่ายมาก** (ใส่ Node เข้า `points[]` แทนที่จะอยู่แค่ `personalPoints`) | ✅ สะอาด | ✅ **มีในคัมภีร์แล้ว** |
| **G6** | **แกนสี่ทิศเต็ม (Kardinalkreuz) เป็นเป้า** — 0°กรกฎ/ตุล/มังกร ไม่ใช่แค่ 0°เมษ | บท 02 ("Widderpunkt, X.Haus, Aszendent gleichwertig") · บท 27 (กฎตาย 4 ข้อ อิง Kardinalpunkte) | **กลาง** — โดยเฉพาะ 0°มังกร = Erdmeridian คือแกนอ้างของ Antiscia (G1) | **ง่ายมาก** (เพิ่ม 3 จุดคงที่เข้า personalPoints/targets) | ✅ สะอาด | ✅ **มีในคัมภีร์แล้ว** |
| **G7** | **โหราเปรียบเทียบแบบ Witte (Sonnen-Summe synastry)** — จุดพบ = (☉a+☉b)/2 · วันแยก = Σ☉ − ☉จร · เชื่อมด้วย Σ ยอดเรือน X | บท 42 · บท 02 (S.29) · บท 10/13 | **กลาง** (มีฟีเจอร์ดูกลุ่ม 4 ดวงอยู่แล้ว — เสริมชั้น Witte ได้) | **กลาง** | ✅ สะอาด | ✅ **มีในคัมภีร์แล้ว** (บท 42/02) |
| **G8** | **Erdhoroskop / Ingress / Jahreshoroskop der Erde (ดวงโลก · mundane)** | หมวด C · บท 28 "Das Erdhoroskop" · บท 13 "Jahreshoroskop der Erde 1922" | **ต่ำ-กลาง** (สำหรับแอปดูดวงบุคคล) · สูงถ้าจะทำพยากรณ์เหตุการณ์โลก | **กลาง-ยาก** | ✅ สะอาด | 🟡 มีร้อยแก้วทฤษฎีในคัมภีร์ · **ต้องสกัด/ตีความบท 13/28 เพิ่ม** |
| **G9** | **Differenzierung ของ ☉/ดาว ผ่าน Meridian (การแยกผลดาวด้วยเมริเดียนล่าง)** | บท 34/35 "Differenzierung der Radixsonne / der Planeten" | **ต่ำ-กลาง** (เทคนิคขั้นสูง เฉพาะทาง) | **ยาก** | ✅ สะอาด | 🟡 **ต้องสกัดเพิ่ม** (บท 34/35 ยังไม่ทำ canon · ยังไม่ยืนยันเนื้อเต็ม) |
| **G10** | **หน้าปัด 22.5° (16th harmonic / second dial)** — มุมย่อยละเอียด | method-reading.md เอ่ย "(+22.5)" · Grundregel 4 | **ต่ำ** + **⚠️ authenticity** | **ง่าย** | 🟠 **ระวัง** — Witte เอง (บท 44) รับรองแค่ "durch 45° teilbar" (0/45/90/135/180) · 22.5° เป็นสาย **Ebertin** (ลิขสิทธิ์/นอก Witte) → **ไม่แนะนำใส่ในนาม Witte** | ❌ ไม่ใช่ Witte verbatim |
| **G11** | **Profektionsbogen แม่นตำรา (1 ปี = 29°08′ ไม่ใช่ 30°) + Sonnenbogen-in-Tagen table** | บท 14 (S.55) · บท 45 · บท 15 (Profektion+Lunation) | **ต่ำ** (secondary arc ที่เราใช้ครอบคลุมหลักแล้ว) | **ง่าย** | ✅ สะอาด | ✅ มีในคัมภีร์ (บท 14) |

---

## 2) จัดอันดับ "ควรทำก่อน" (คุ้ม × สะอาด × พร้อม)

**ชั้น A — ทำได้เลย, คุ้มสูง, canon พร้อม, โค้ดแตะน้อย (quick win):**
1. **G4 ภาพดาว 4 ดาว** — ง่ายสุด (loop เทียบ `halbsummen` ที่คำนวณอยู่แล้ว) · เพิ่มความครบของ Planetenbild ตามบท 44 ทันที
2. **G5 Node เข้าภาพดาว** + **G6 แกนสี่ทิศเต็ม** — เพิ่มปัจจัยเข้า `points[]`/targets · ปลดล็อก picture/sensitive ที่ Witte ให้ค่า (Node, 0°มังกร)
3. **G1 Antiscia/Spiegelpunkte** — **คุ้มสูงสุดในชั้น A** · Witte จัดเป็น "จุดไวหมวดแรก" แต่เราไม่มีเลย · canon verbatim พร้อม (บท 16/36) · เรขาคณิตล้วน สะท้อน lon รอบ 2 แกน

**ชั้น B — คุ้มสูงมาก แต่ต้องงานเพิ่มเล็กน้อย:**
4. **G2 Deklination/Parallel** — ตัวคำนวณ **พร้อมแล้ว** (`declination` ใน core) · เหลือ (ก) เก็บ dec เข้า UranianPoint (ข) จับ ‖/contra orb · แต่ควร **สกัดบท 03/23/46 เป็น canon** ก่อนติดป้ายว่า "วิธี Witte" ให้ครบ provenance
5. **G3 ระบบเรือน 3 ชุด + house-rules** — **คุ้มเชิงเนื้อสูงสุดทั้งหมด** (ปลดล็อกประโยคความหมาย PD บท 40/42 verbatim) แต่ซับซ้อนสุดในกลุ่มคุ้ม → ทำหลัง A เสร็จ

**ชั้น C — เฉพาะทาง/พยากรณ์โลก, ไว้ทีหลัง:**
6. G7 synastry แบบ Witte · G8 Erdhoroskop/ingress · G11 profection แม่น · G9 Differenzierung

**ไม่แนะนำ (authenticity):**
- **G10 หน้าปัด 22.5°** — เป็นสาย Ebertin ไม่ใช่ Witte · ถ้าจะใส่ต้องติดป้าย "ส่วนขยายนอก Witte" ชัดเจน ไม่งั้นขัดกฎ source-of-truth

---

## 3) แยก "ทำได้เลย (canon PD พร้อม)" vs "ต้องหาเพิ่ม"

**✅ canon พร้อม → implement ได้เลยโดยไม่ต้องหาตำราเพิ่ม:**
- G1 Antiscia (บท 16/36/02 verbatim อยู่ใน `10-witte-canon-de.md` แล้ว + ราก Ptolemy ใน `zone5-raw-ptolemy-antiscia.md`)
- G3 ระบบเรือน + house-rules (หมวด G + บท 42 + Hades I–XII บท 40 — verbatim ครบ)
- G4 / G5 / G6 (บท 44/31/42/02/27 — verbatim ครบ)
- G7 synastry (บท 42/02 — verbatim ครบ) · G11 (บท 14)

**🟡 ต้องสกัด/ยืนยันเนื้อเพิ่มก่อน (PDF PD อยู่ในมือ แต่ยังไม่เป็น canon md · ผมยังไม่อ่านเนื้อเต็ม):**
- G2 Deklination — บท `r2c-src-witte-03/23/46-*.pdf` (มีในโฟลเดอร์ · ยังไม่ OCR สกัดเข้า canon)
- G8 Erdhoroskop/ingress — บท 13/28
- G9 Differenzierung — บท 34/35

**❌ ต้องหาแหล่งใหม่ / นอกขอบเขต PD:**
- พจนานุกรมความหมายภาพดาว A–Z เต็ม = "Regelwerk" (Rudolph เรียบเรียง · ลิขสิทธิ์ถึง 2053) — ยืนยันแล้วใน `01-source-policy-conclusion.md` ว่า **ทำไม่ได้** (ไม่เกี่ยวกับ "เทคนิค/วิธี" ที่รายงานนี้พูดถึง · เป็นเรื่อง "ความหมาย")
- G10 22.5° dial = Ebertin (ลิขสิทธิ์) — ไม่ควรอ้างเป็น Witte

---

## 4) หมายเหตุความซื่อสัตย์ (ยืนยันไม่ได้ = บอกตรง)

1. **G2 (declination):** ผมยืนยันจากโค้ดว่า `astro-core/ephemeris.ts` มี `declinationFromEcliptic()` และ `BodyPos.declination` ให้ค่าทุกดาวแล้ว → ตัวคำนวณ **พร้อมจริง**. แต่ **ผมยังไม่ได้เปิดอ่าน PDF บท 03/23/46** จึง **ยังยืนยันไม่ได้** ว่า Witte ใช้ orb/นิยาม parallel แบบใดเป๊ะ — ต้องสกัดก่อน implement ให้ตรงตำรา (ห้ามเดา orb เอง)
2. **G3 (house systems):** ปลดล็อกความหมาย PD ได้จริงตามบท 40/42 — แต่การ map "เรือนของอาทิตย์/เมริเดียน" ต้องระวังนิยาม chaldäisch (บท 08 นับ 30° ตะวันออก = เรือน IV ของอาทิตย์) ให้ตรง ไม่ใช่เรือนดวงเดิม
3. **มูลค่า "ความแม่น":** เป็นการประเมินเชิงหลักวิชา (Witte ให้น้ำหนักจุดไว/Spiegelpunkte สูง) **ไม่ใช่ผลทดสอบสถิติ** — ยังไม่มี golden/blind-test ยืนยันว่าเพิ่มความแม่นจริงกี่ %  (และตามกฎ NO_PERCENT/ห้าม fit สถิติ ควรวัดด้วย blind-test เคสจริงเมื่อ implement)
4. รายงานนี้ **ไม่แตะโค้ด** ตามคำสั่ง — เป็น analysis อย่างเดียว
