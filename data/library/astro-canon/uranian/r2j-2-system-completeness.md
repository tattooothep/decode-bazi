# r2j-2 — ความครบของ "ระบบเต็ม" Witte/Hamburg School ที่ AI ยูเรเนียนยังไม่มี (ลึกกว่ารอบ r2i-1)

> วันที่: 2026-07-04 · **READ-ONLY system-completeness audit** (ไม่แก้โค้ด — มี agent อื่น build อยู่)
> เทียบ: โค้ดจริง `src/lib/astro/uranian/{engine,packet,render,auslosung}.ts` (สถานะ r389 + r390)
>         vs ระบบ Witte เต็ม = คัมภีร์ `10-witte-canon-de.md` (verbatim 47 บท) + ต้นฉบับ PDF/OCR `r2c-src-witte-NN` / `ocr-text/`
> ต่อยอดจาก `r2i-1-technique-gaps.md` — รอบนี้ **เจาะระดับ "ระบบ" ไม่ใช่แค่ "เทคนิคเดี่ยว"**: ระบบเรือน 3 ชุด · Spiegelpunkte ครบแกน · ชุดจุดส่วนตัว · ชั้นจุด derived ลึก · mundane/ingress · rectification · lunation ปี · progressive Meridian · Differenzierung
>
> ⚠️ **ความซื่อสัตย์ (ยืนยันไม่ได้ = บอกตรง):** ผมอ่าน (ก) โค้ด engine/auslosung/packet/render ครบทุกบรรทัด (ยืนยันได้ 100% ว่ามี/ไม่มีอะไร) (ข) คัมภีร์ verbatim `10-witte-canon-de.md` เต็ม. **ผมยังไม่ได้เปิดอ่านเนื้อ OCR เต็มของบท 06/11/26/34/35** (ไฟล์ `ocr-text/*.txt` มีอยู่ แต่ยังไม่กลั่นเป็น verbatim canon) — สถานะ "canon พร้อม/ไม่พร้อม" ระบุตามที่ตรวจได้จริง ส่วนที่อนุมานจากชื่อบท+ดัชนีจะกำกับ "ยังไม่ยืนยันเนื้อเต็ม"

---

## 0) สรุปสถานะ: r390 ปิด gap อะไรจาก r2i-1 ไปแล้วบ้าง (เพื่อไม่เสนอซ้ำ)

โค้ดปัจจุบัน (r390) **ขยับไปไกลกว่าตอนเขียน r2i-1 มาก** — gap เดิมที่ปิดแล้ว:

| r2i-1 | สถานะใน r390 (ยืนยันจากโค้ด) | ที่ไฟล์ |
|---|---|---|
| G1 Antiscia/Spiegelpunkte | ✅ **ทำแล้ว** (2 แกน: อายัน `antisciaLon`=180−lon · วิษุวัต `contraAntisciaLon`=−lon) | engine.ts:206-208, 350-376 |
| G2 Deklination/Parallel | ✅ **ทำแล้ว** (parallel + contra-parallel · orb 1° · เก็บ `decl` ทุกจุด) | engine.ts:73, 378-392 |
| G4 ภาพดาว 4 ดวง (Vierergestirn) | ✅ **ทำแล้ว** (a+b=c+d บนหน้าปัด 90°) | engine.ts:394-413 |
| G5 Node ในระบบ | 🟡 **ครึ่งเดียว** — คำนวณ mean+true node แล้ว แต่เข้าเฉพาะ `personalPoints`→เป้า Auslösung · **ยังไม่เป็น generator** ในภาพดาว/จุดไว/antiscia natal | engine.ts:280-287, 210-224 |
| G6 แกนสี่ทิศ | 🟡 **ครึ่งเดียว** — มีแค่ `AriesPoint` (0°♈) · **ขาด 0°กรกฎ/ตุล/มังกร** | engine.ts:287 |
| Auslösung 3 ชั้น | ✅ transit + solar-arc + prog ☉☽ + prog_mc | auslosung.ts |

**สรุป:** เทคนิคเดี่ยวชั้น A/B ของ r2i-1 (G1/G2/G4) = **ปิดแล้ว**. รอบนี้จึงเน้น **ช่องว่างเชิง "ระบบ"** ที่ยังเปิดอยู่ทั้งใน r389 และ r390.

---

## 1) ตาราง GAP เชิงระบบ (ยังไม่มีทั้ง r389 และ r390) — จัดอันดับ

> คอลัมน์ "canon PD พร้อม": ✅ = verbatim อยู่ใน `10-witte-canon-de.md` แล้ว · 🟡 = มี OCR ดิบ (`ocr-text/*.txt`) แต่ยังไม่กลั่นเป็น verbatim · ❌ = ต้องหา/OCR เพิ่ม

| # | Technique เชิงระบบ (Witte) | มี/ขาด (r389+r390) | ตำราบท | มูลค่าต่อความแม่น/เนื้อ | effort | canon PD พร้อม |
|---|---|---|---|---|---|---|
| **A1** | **ระบบเรือน 3 ชุด (Häuser des Aszendenten / des Meridians / der Planeten)** — ตำแหน่งสัมพัทธ์ 30°×12 ต่ออาทิตย์/เมริเดียน/ดาวใด ๆ | ❌ **ขาดทั้งหมด** — engine ไม่มีแนวคิด "เรือน" เลย (มีแต่ราศี+dial90) | 32 · 38 · 41 · 08 | **สูงสุดเชิงเนื้อ** — เป็น "ที่อยู่" ของประโยคความหมาย PD (Jupiter im VIII. Hause der Sonne = โศกนาฏกรรมกษัตริย์) · ปลดล็อก verbatim หมวด F/H ให้ใช้จริง | กลาง-ยาก | ✅ (หมวด G verbatim: 32/38/41/08) |
| **A2** | **กฎความหมายตามเรือน (house-meaning rules)** — Mars im VII. des Mondes / Neptun im I. / Uranus im V. / Hades I–XII | ❌ ขาด (อาศัย A1) | 42 · 40 (Hades I–XII) · 12 | **สูงสุด** — verbatim ความหมาย PD ที่ตรงที่สุดที่เรามี ถูกทิ้งไว้ไม่ได้ใช้ | กลาง (ถ้ามี A1) | ✅ (บท 42/40 verbatim ครบ) |
| **A3** | **ชุดจุดส่วนตัวครบ (Kardinalkreuz เต็ม + astronomische Länge des Ortes)** — 0°กรกฎ/ตุล/**มังกร(Erdmeridian)** + จุด `Asc−90°` | 🟡 มีแค่ ☉☽MC Asc Node(mean) + **AriesPoint เดียว** · ขาดอีก 3 มุมสี่ทิศ + Asc−90 | 02 (Widderpunkt/X.Haus/Asc gleichwertig) · 27 (4 กฎตาย ใช้ Kardinalpunkte) · 32/36 (astr. Länge d. Ortes) | **กลาง-สูง** — 0°มังกร=Erdmeridian คือแกนอ้างของ antiscia (A1 ของ r2i-1) ควรเป็นจุดจริง · Asc−90 = ตัวแทน "สถานที่" ในระบบ Witte | **ง่าย** (เพิ่มจุดคงที่ + 1 สูตร) | ✅ (บท 02/27/32/36 verbatim) |
| **A4** | **Node/AriesPoint/แกนสี่ทิศ เป็น "generator" ในภาพดาว/จุดไว/antiscia natal** (ไม่ใช่แค่เป้า Auslösung) | ❌ ขาด — `points[]` มีแค่ดาว 10 + MC/Asc → `halbsummen`/`pictures`/`sensitive`/`antiscia`/`decl` **ไม่เคยมี Node/AriesPoint** ร่วมเลย | 42 (Mondknoten=weibl.-männl.) · 44 (N.+♃−☽=หมั้น) · 41 | **กลาง** — natal picture ที่มี Node/Widderpunkt หายทั้งหมด (Witte ให้ Node สำคัญเรื่องคู่) | **ง่ายมาก** (ย้าย Node/AriesPoint เข้า `points[]` ก่อน loop) | ✅ |
| **A5** | **Spiegelpunkte to personal angles (zum MC / zur astr. Länge des Ortes)** — จุดกระจกรอบ MC และรอบ Asc−90 | 🟡 antiscia มีแค่รอบ **2 แกนสี่ทิศคงที่** (อายัน/วิษุวัต) · **ขาดจุดกระจกรอบ MC/Ort** (แกนส่วนตัว) | 16 · 36 ("Spiegelpunkte der Radixplaneten zur astr. Länge d. Geburtsortes → Verbindungen mit anderen; zum M.C. → körperl./seel. Ereignisse") | **กลาง** — บท 36 แยกชัดว่า mirror-to-Ort ⇒ เรื่องคนอื่น, mirror-to-MC ⇒ กาย/ใจ (มีความหมายเจาะ) | ง่าย-กลาง | ✅ (บท 36 verbatim) |
| **A6** | **ชั้นจุด derived ลึก (ภาพดาว 5–6 ดวง + midpoint-of-midpoints)** — ครึ่งผลรวมของคู่หนึ่ง "ถูกป้อนเข้า" แกนสมมาตรของภาพดาวอีกอัน = ภาพดาว 6 ดวง | ❌ ขาด — engine หยุดที่ 3-ดาว (pictures) + 4-ดาว (fourPlanet) · ไม่มี half-sum ของ half-sum, ไม่มี 5/6-ดาว | 31 (S.16: „Wird die Halbsumme zweier Planeten in die Symmetrieachse eines Planetenbildes geführt → Bild mit sechs Planeten") | **กลาง** — Witte ถือภาพดาวเด่นหลายอันเป็น 5–6 ดาว · แต่เสี่ยง combinatorial + noise ต้อง cap/threshold ระวัง | กลาง | ✅ (บท 31 verbatim) |
| **A7** | **Lunation ปี / synodische Lunation** — Lunation=1 ปี · Mondphasen เป็นวันคงที่ · Profektionsbogen แม่น 29°08′ (ไม่ใช่ 30°) · lunar-return | ❌ ขาด — Auslösung มี `prog_moon` (☽ ~1°/เดือน) แต่ **ไม่มีชั้น lunation/lunar-phase/profection** | 14 (Syn. Lunation) · 15 (Profektion+Lunation) · 43 | **กลาง** — เพิ่มชั้นจับ "เดือน" อีกเส้นที่เป็นขนบ Witte แท้ | กลาง | 🟡 (บท 14 verbatim ✅ · บท 15/43 บางส่วน — บท 15 ยังไม่ verbatim) |
| **A8** | **progressive Meridian ละเอียดในปี (1°/วัน → ระดับเดือน/วัน)** | 🟡 มี `prog_mc` แต่ **ใช้ solar-arc (อัตราปี)** เท่านั้น · ขาด meridian ละเอียด (บท 33: „1 Grad des Meridians für einen Tag") | 26 („Der progressive Meridian während eines Jahres") · 33 | **ต่ำ-กลาง** — เพิ่มความละเอียด timing ปลายทาง (วัน/นาที) | กลาง | 🟡 (บท 26 มี OCR ดิบ · ยังไม่ verbatim · บท 33 verbatim ✅) |
| **A9** | **Rectification / unbekannte Geburtszeit** — หาเวลาเกิดจากเหตุการณ์จริงย้อนกลับ | ❌ ขาด — โหมด no-time แค่ "degrade" (ตัด MC/Asc) ไม่มีเครื่องมือ rectify | 11 · 11a · 18 | **สูงสำหรับเคส no-time** (ผู้ใช้ไทยจำนวนมากไม่รู้เวลาเกิด) แต่เป็นงานวิจัยหนัก | **ยาก** | ❌ (บท 11/18 มี OCR ดิบ · ยังไม่ verbatim/ยังไม่ยืนยันเนื้อเต็ม) |
| **A10** | **Erdhoroskop / Ingress / Jahreshoroskop der Erde (mundane)** | ❌ ขาด — engine เป็น "ดวงบุคคล" ล้วน ไม่มีดวงโลก/ingress | 06 · 28 · 13 | **ต่ำ** สำหรับแอปดูดวงบุคคล · สูงถ้าจะทำพยากรณ์เหตุการณ์โลก (นอก scope ปัจจุบัน) | ยาก | 🟡 (บท 06/28 มี OCR ดิบ · ยังไม่ verbatim) |
| **A11** | **Differenzierung der Planeten / Radixsonne (แยกผลดาวด้วยเมริเดียนล่าง)** | ❌ ขาด — engine ไม่มีแนวคิด differenzierung เลย | 34 · 35 | **ต่ำ-กลาง** (เทคนิคขั้นสูงเฉพาะทาง · Witte ใช้ในตัวอย่าง I.1) | ยาก | 🟡 (บท 34/35 มี OCR ดิบ · ยังไม่ verbatim/ยังไม่ยืนยันเนื้อเต็ม) |
| **A12** | **ตำแหน่งจริงของ TNP Witte (Cupido/Hades/Kronos/Zeus)** | ❌ ยัง null (เฟส 1) — มีแค่ชื่อ+เจ้าราศี+ความหมาย · ยังไม่ compute องศา | 19/27/40 (ความหมาย) · ต้องใช้ Immerwährende Ephemeride/SwissEph | **กลาง-สูง** — ปลดล็อกให้ Hades/Cupido เข้าภาพดาว/Auslösung ได้จริง (roadmap เฟส 2 ที่รู้อยู่แล้ว) | กลาง-ยาก (data/ephemeris) | ✅ ความหมาย (หมวด H) · ❌ ตำแหน่ง (ต้อง ephemeris) |

---

## 2) จัดอันดับ "ควรทำก่อน" (คุ้ม × สะอาด × พร้อม × แตะโค้ดน้อย)

**ชั้น A — quick win, canon พร้อม, โค้ดแตะน้อย:**
1. **A4 — Node/AriesPoint เป็น generator** — ง่ายสุด (ย้าย 2 จุดเข้า `points[]`) · ปลดล็อกภาพดาว/จุดไวที่มี Node ทันที (Witte ให้ Node สำคัญเรื่องคู่ครอง)
2. **A3 — ชุดจุดส่วนตัวครบ** — เพิ่ม 0°กรกฎ/ตุล/มังกร + Asc−90 · ง่าย · ทำให้ Kardinalkreuz (บท 27) + antiscia (แกน Erdmeridian) มีจุดจริงรองรับ
3. **A5 — Spiegelpunkte รอบ MC/Ort** — ต่อยอด antiscia ที่มีอยู่ (เพิ่ม mirror รอบ 2 แกนส่วนตัว) · บท 36 verbatim พร้อม มีความหมายเจาะ

**ชั้น B — คุ้มเชิงเนื้อสูงสุด แต่ซับซ้อนกว่า:**
4. **A1 + A2 — ระบบเรือน 3 ชุด + house-rules** — **คุ้มเชิง "เนื้อความหมาย" สูงสุดในทั้งระบบ** (ปลดล็อก verbatim PD หมวด F/H/บท 40 Hades I–XII) · แต่ต้องระวัง nes: นับ chaldäisch (บท 08: 30° ตะวันออกอาทิตย์ = เรือน IV ของอาทิตย์ · ไม่ใช่เรือนดวงเดิม) · ทำหลัง A เสร็จ
5. **A6 — ภาพดาว 5–6 ดวง / derived midpoints** — ต่อจาก halbsummen ที่มี · ต้อง cap+threshold กัน noise
6. **A7 — Lunation ปี** + **A8 — progressive Meridian ละเอียด** — เพิ่มเส้น timing ชั้นเดือน/วันแบบ Witte แท้

**ชั้น C — เฉพาะทาง/งานหนัก, ไว้ทีหลัง:**
7. A12 TNP positions (เฟส 2 ที่รู้อยู่) · A9 Rectification (คุ้มเคส no-time แต่ยาก+canon ยังไม่พร้อม) · A11 Differenzierung · A10 Erdhoroskop/mundane (นอก scope ดวงบุคคล)

---

## 3) แยก "ทำได้เลย (canon พร้อม)" vs "ต้องกลั่น canon เพิ่ม" vs "ต้องหา ephemeris/แหล่งเพิ่ม"

**✅ canon verbatim พร้อม → implement ได้เลย:**
- A1/A2 ระบบเรือน + house-rules (หมวด G + บท 42 + Hades I–XII บท 40 — verbatim ครบใน `10-witte-canon-de.md`)
- A3 ชุดจุดส่วนตัว (บท 02/27/32/36) · A4 Node generator (บท 42/44) · A5 Spiegelpunkte MC/Ort (บท 36) · A6 ภาพดาว 5–6 ดวง (บท 31)

**🟡 มี OCR ดิบ แต่ยังไม่กลั่นเป็น verbatim canon (ผมยังไม่อ่านเนื้อเต็ม — ห้ามเดา orb/สูตรก่อนกลั่น):**
- A7 บท 15 (Profektion+Lunation) · A8 บท 26 (progressiver Meridian) · A10 บท 06/28 (Erdhoroskop) · A11 บท 34/35 (Differenzierung) · A9 บท 11/18 (Rectification)
- ไฟล์อยู่ที่ `ocr-text/r2a-src-witte-{06,11,26,28,34_35,35}_*.txt` — ต้องกลั่น+เทียบสแกน (Fraktur OCR เพี้ยน) ก่อนติดป้าย "วิธี Witte"

**❌ ต้องหา data/แหล่งใหม่ (นอกขอบเขต canon ปัจจุบัน):**
- A12 ตำแหน่ง TNP → Immerwährende Ephemeride ของ Witte / SwissEph (roadmap เฟส 2 · ความหมาย PD พร้อม แต่ตัวเลขตำแหน่งต้อง ephemeris)

---

## 4) หมายเหตุความซื่อสัตย์ (ยืนยันไม่ได้ = บอกตรง)

1. **ยืนยัน 100% จากโค้ด:** ระบบเรือน (A1/A2), Node-as-generator (A4), Spiegelpunkte รอบ MC/Ort (A5), ภาพดาว 5–6 ดวง (A6), Lunation-ปี (A7), Rectification (A9), Erdhoroskop (A10), Differenzierung (A11) — **ไม่มีในโค้ดจริง** ทั้ง r389 และ r390 (อ่านครบ 4 ไฟล์ · ไม่มี identifier/ฟังก์ชันใด ๆ ที่เกี่ยวข้อง)
2. **A3/A6/A8 = "ครึ่งเดียว" ยืนยันจากโค้ด:** AriesPoint มีจุดเดียว (engine.ts:287) · `prog_mc` ผูกกับ solar-arc ไม่ใช่ meridian รายวัน (auslosung.ts:370-372) · fourPlanet หยุดที่ 4 ดาว (engine.ts:399 กันดาวซ้ำ) — ไม่ต่อไป 5/6
3. **canon status:** verbatim ที่ผมยืนยันได้มาจากการอ่าน `10-witte-canon-de.md` เต็ม. สำหรับบท 06/11/26/34/35 ผม **เห็นว่ามีไฟล์ OCR ดิบ** (`ocr-text/`) แต่ **ยังไม่ได้เปิดอ่านเนื้อเต็ม** จึงระบุแค่ "ดิบ ยังไม่ verbatim" — ยังยืนยันไม่ได้ว่า Witte ให้ orb/นิยาม/อัตราเท่าใดเป๊ะ **ห้าม implement ก่อนกลั่น** (โดยเฉพาะ A8 อัตรา meridian, A9 วิธี rectify)
4. **มูลค่า "ความแม่น" = ประเมินเชิงหลักวิชา ไม่ใช่สถิติ** — Witte ให้น้ำหนัก house-rules/Spiegelpunkte สูง แต่ **ยังไม่มี golden/blind-test** ยืนยันว่าเพิ่มความแม่นจริงกี่ % (ตามกฎ NO_PERCENT/ห้าม fit สถิติ — ต้องวัดด้วย blind-test เคสจริงเมื่อ implement)
5. **ข้อควรระวังตอน implement A1:** การ map "เรือนของอาทิตย์/เมริเดียน" ต้องใช้นิยาม chaldäisch ของ Witte (บท 08: 30° ตะวันออกอาทิตย์ = เรือน IV) **ไม่ใช่** เรือนดวงเดิม — เดาผิด = ความหมายเพี้ยนทั้งชุด
6. รายงานนี้ **ไม่แตะโค้ด** ตามคำสั่ง — analysis อย่างเดียว
