# r2j-3 — ตรวจความครบ "ความหมาย/คัมภีร์" ยูเรเนียน: verbatim vs การอ่านเชิงวิธี

> READ-ONLY audit · 2026-07-04 · ไม่แตะโค้ด · ตรวจ 3 ไฟล์คัมภีร์ + render.ts (กฎ 2 ชั้น) + build-prompt.ts (การ wire) + OCR 47 บท
> **ที่มาที่อ่าน:** `10-witte-canon-de.md` (verbatim DE) · `11-method-reading-uranian.md` (การอ่านเชิงวิธี TH) · `01-source-policy-conclusion.md` · `10-regelwerk-witte-1932-de.md` (ช่องรอเพื่อน) · `ocr-text/r2a-src-witte-*.txt` (47 บท) · `src/lib/astro/uranian/render.ts` · `src/lib/fusion5/build-prompt.ts`
> **สรุป 1 บรรทัด:** โครงสร้าง 2 ชั้นถูกต้อง (verbatim นำ · เชิงวิธีเสริม · ป้ายกำกับซื่อสัตย์) · **ช่องที่บางจริง = ความหมาย "คู่ดาว-ดาว" ที่ Witte เขียนกระจายในบทความ (มี PD) แต่ยังไม่สกัดเข้า verbatim** + **การ wire หมวด F/G สลับที่/gate ผิด intent** — 2 อย่างนี้แก้ได้เลยโดยไม่รอ 1932

---

## 0) ยืนยันโครงสร้าง 2 ชั้น (ไม่ได้บอกตรง = ผ่าน)

- `render.ts` กฎข้อ 2–3 + `METHOD_READING_LABEL` (TH/EN/ZH) ระบุชัดว่า "การอ่านเชิงวิธี = ระบบสังเคราะห์ · ไม่ใช่ถ้อยคำ Witte verbatim" → **ไม่มีการปลอมชั้นสังเคราะห์เป็น verbatim** ✅
- `build-prompt.ts:356-357` ติด `licenseClass`/`mode` ถูก: file 10 = `public_domain/verbatim` · file 11 = `project_synthesis/summary`
- ลำดับ wire ถูก: verbatim (10) นำก่อน · เชิงวิธี (11) แนบท้ายเสมอ · เวลา shrink ตัดชั้นสังเคราะห์ก่อน คัมภีร์ Witte คงอยู่ (คอมเมนต์ 2168)
- **ไม่มีจุดที่ระบบ "บอกความหมายตรง" โดยไม่ผ่านคัมภีร์** — คู่ที่ไม่มีทั้ง verbatim/method ถูกสั่งให้ตอบเชิงเรขาคณิต (กฎข้อ 4) ✅

---

## 1) ตารางความครบ (coverage)

| หมวดความหมาย | verbatim (file10) มี? | เชิงวิธี (file11) มี? | wire เข้า prompt? | สกัดเพิ่มจาก 47 บทได้? | รอ 1932? |
|---|---|---|---|---|---|
| **นิยามภาพดาว/ครึ่งผลรวม/แกนสมมาตร** (A) | ✅ เต็ม (บท 30/31) | ✅ Grundregeln 6 ข้อ | ✅ `method` เสมอ | — ครบ | ไม่ |
| **จุดไว 6 หมวด + permutation** (B) | ✅ เต็ม (บท 02/16/30/31) | ✅ | ✅ `method` เสมอ | — ครบ | ไม่ |
| **Auslösung/timing** (C·D) | ✅ (บท 08/12/33/36/43/14) | ✅ Sonnenbogen | ✅ `timing` (intent) | — ครบ | ไม่ |
| **Direktionen** (E) | ✅ (บท 44) | ✅ | ✅ อยู่ใน `timing` | — ครบ | ไม่ |
| **คู่ดาว-ดาว midpoint ครบ S1–S8** (☉/☽…♆/♇) | ⚠️ **มีกระจัดกระจายไม่กี่คู่** | ✅ ครบ ~50 คู่ (สังเคราะห์) | ✅ file11 sun/moon/… | ⭐ **ได้บางคู่** (ดู §2) | ส่วนใหญ่รอ 1932 |
| **จุดส่วนตัว Asc/MC/Node/AP × ดาว** (P1) | ⚠️ มีเชิงกลไก ไม่ใช่ความหมายคู่ | ✅ ครบ (สังเคราะห์) | ✅ file11 `points` | บางส่วน (บท 32/36/38) | ส่วนใหญ่รอ 1932 |
| **house-meanings (เรือน I–XII ต่อดาว)** | ⚠️ **มีเป็นกฎกระจาย ไม่เป็นระบบ** | ❌ **ไม่มีหมวดเรือนเลย** | ⚠️ **gate/ป้ายผิด** (ดู §3) | ⭐ **ได้มาก** (บท 41/42/40/32/38) | ตารางเต็มรอ 1932 |
| **synastry (ดวงคู่คน)** | ✅ verbatim (บท 42/02) หมวด F | ❌ **ไม่มีหมวด synastry** | ⚠️ gate เฉพาะ relationship | — verbatim พอ · แต่ file11 ขาด | บางส่วนรอ 1932 |
| **Häuser 3 ระบบ (กลไกจัดเรือน)** (G) | ✅ (บท 08/32/41) | — (ไม่จำเป็น) | ⚠️ gate hasTime+career | — ครบ | ไม่ |
| **ทรานส์เนปจูน 4 ดวง (คีย์เวิร์ด+combo)** | ✅ Hades I–XII เต็ม (บท 40) · Cupido/Kronos/Zeus | ✅ T1 | ✅ `tnp` เสมอ | ⭐ **Cupido/Zeus combo เพิ่มได้** (บท 19) | Regelwerk เสริมได้ 2053 |
| **Fallbeispiele (ตัวอย่างตีความ)** (I) | ✅ (บท 05/12/30/31/44) | ✅ ตัวอย่าง 3 ทิศ | ✅ `examples` (general/validation) | — ครบ | ไม่ |
| **Farben (สีดาว/แม่เหล็กราศี)** | ❌ ไม่สกัด | ❌ | ❌ | ⭐ **ได้ทั้งหมวด** (บท 01/04/19) | ไม่ (Witte PD) |
| **Antiscien/Spiegelpunkte (ความหมาย)** | ⚠️ กลไกเท่านั้น | — (render อธิบายเชิงวิธี) | ✅ render.ts | บางส่วน (บท 42 เปิด · บท 17) | ไม่ |
| **เดคลิเนชัน parallel** | ⚠️ ลายเซ็นวิธี | — | ✅ render.ts | บท 03/23/46 (เชิงเทคนิค) | ไม่ |

**อ่านตาราง:** ชั้น "วิธี/ทฤษฎี/timing/direction/จุดไว/ทรานส์เนปจูน" = ครบสมบูรณ์ · ช่องบางจริง = **ชั้น "ความหมาย" 3 จุด**: (ก) คู่ดาว-ดาว verbatim ที่ยังไม่เก็บ (ข) house-meanings ทั้งหมวด (ค) Farben ทั้งหมวด — ทั้งสามมี PD ในมือ สกัดได้เลย

---

## 2) งานสกัด verbatim ที่ทำได้เลย (ไม่ต้องรอ 1932) — เพิ่มความแม่น

ประโยคความหมายเหล่านี้ **Witte เขียนเองในบทความ PD** อยู่ใน OCR แล้ว แต่ **ยังไม่อยู่ใน `10-witte-canon-de.md`** → สกัดเข้าหมวดที่เหมาะได้ทันที (ทำให้คู่ที่ปัจจุบันตอบด้วยชั้นสังเคราะห์ มี verbatim นำแทน):

### 2.1 คู่ดาว-ดาว (จากบท 19 · Cupido — OCR บรรทัดชี้ชัด)
- **♅/♆ (Uranus+Neptun) = „tote Personen"** — „Die Strahlen von Uranus und Neptun zusammen geben immer »tote Personen« als der Erde komplementär" (บท 19, S.50) · **ยืนซ้ำในบท 30 + บท 40** → คู่นี้ verbatim แน่นหนา ควรเก็บ (ปัจจุบัน file11 ☉/♆·☽/♆ มีแต่ ♅/♆ ในหมวด S8 เป็นสังเคราะห์ล้วน)
- **♂/♆ = „vernichtende Wirkung … komplementär"** (บท 19, S.50)
- **♄+♆+♀ = „Unterdrückung von Venus (Liebe)"** (บท 19, S.50) — ภาพดาว 3 ดวงเชิงความหมาย
- **♅ = „Kriegsverkünder und Vernichter des Friedens (Venus)"** (บท 19 · ย้ำในบท 30 ตัวอย่าง Kaiser) — ความหมาย ♅ verbatim

### 2.2 Hades — แหล่งที่ 2 (บท 19 ในชื่อ „K." ก่อนตั้งชื่อ Hades)
- „Herr des Tierkreiszeichens Jungfrau … maßgebend für Freudenmädchen, unverheiratete Frauen, Nonnen und Witwen … der Planet der die meisten Ehetrennungen herbeiführt … maßgebend für Krankheiten und Krankenhäuser" (บท 19, S.50–51)
- คัมภีร์หมวด H.2 อ้างเฉพาะบท 40 → **เพิ่มบท 19 เป็น cross-source** ยืนยัน (เพิ่มน้ำหนัก provenance ให้ Hades)
- **Cupido/Zeus combo** บท 19 ยังมีชุดผสม (mit Mond+Venus = Verlobungen/Heiraten/Familienzuwachs · mit Uranus = plötzliche Heiraten/Tod/Ehescheidungen · mit Sonne schlecht = Widerwillen gegen die Ehe) — หมวด H.1 เก็บมาบางส่วน แต่ยังตกชุด „mit Neptun als Vertreter des Eros" และ Zeus „Deus" คำอธิบาย

### 2.3 house-meanings เชิงกฎ (บท 41/42/40 — ใกล้พจนานุกรมที่สุดที่เป็น PD)
- บท 42: „Jupiter im VIII. der Sonne = Todesfälle von Königen · Mars im VII. des Mondes = Gatten weiblicher Personen · Neptun im I. = Ehen · Uranus im V. = männliche Nachkommen · Sonne/Merkur/Venus = Freunde · Kupido+Jupiter im III. = Dokumente/Briefwechsel/benachbarte Länder" — **มีในหมวด F แล้ว** ✅ (ยืนยันเก็บครบ)
- บท 41 (ยังไม่เก็บชิ้นความหมาย): „6. Haus (Krankheit, Arbeit) · $ im 6. der Sonne = Krankheit des Körpers · Uranus im 2. in Opposition zum 8. = Tod · Jupiter im 6. des Geburtsmeridians = Krankheit" → **นัยความหมายเรือน (6=โรค/งาน · 8=ตาย · 2=ทรัพย์)** ควรสกัดเป็น "ความหมายเรือนตาม Witte" (หมวด G ปัจจุบันเก็บแต่กลไก chaldäisch ไม่เก็บความหมาย)
- บท 40: Hades เรือน I–XII **เก็บครบแล้ว** (หมวด H.2) ✅

### 2.4 Farben ทั้งหมวด (บท 19 มีตารางเต็ม + บท 01/04)
- ตาราง „Reflex der Sonnenemanation" (บท 19, S.50): ♂ blaurot · ♄ grün · ☉ rot · ☿ gelbrot · ☽ lichtblau · ♀/♆ grünblau · Hades indigoblau · Zeus/Kronos violettblau/lavendelgrau (บท 40 ยืน)
- บท 04 „Die magnetischen Farben der Tierkreiszeichen" (ทั้งบท) · บท 01 „Betrachtungen Zahl/Farbe/Ton"
- **เป็นหมวดความหมายที่ Witte PD 100% แต่ยังไม่แตะเลย** — ถ้าอยากได้มิติสี/โทน (ใช้ประกอบการอ่านธาตุ/บุคลิก) สกัดได้ทันที

> ⚠️ ทุกจุด: สัญลักษณ์ดาว+องศาใน OCR เพี้ยน (Fraktur) — ตัว **ร้อยแก้วความหมายสะอาด** สกัดได้ · **ตัวเลของศาต้องเทียบสแกน `r2c-src-witte-NN-*.pdf` ก่อน** (กฎเดิมหมวดคำเตือน)

---

## 3) ช่องการ wire (พบระหว่าง audit · ไม่ใช่ปัญหาเนื้อคัมภีร์ · จดไว้ไม่แก้)

1. **house-rule ความหมายอยู่หมวด F ไม่ใช่ G** — „Jupiter im VIII = Todesfälle von Königen" ฯลฯ อยู่ในหมวด **F (synastry)** ของ file10 · แต่ `build-prompt.ts:2160` แนบ `synastry` เฉพาะ `intent.relationship||intent.pair` → **ถามเรื่องงาน/อำนาจ/ความตาย จะไม่ได้กฎเรือนความหมาย** (ได้แต่หมวด G กลไก) · ควรพิจารณาแนบ F เมื่อ intent.career/authority/risk ด้วย
2. **file11 ไม่มีหมวด synastry + house** — พจนานุกรมเชิงวิธีครอบ midpoint คู่ดาว+จุดส่วนตัว แต่ **ไม่มีชั้นความหมายเรือน และไม่มีชั้นดวงคู่คน** → เวลาไม่มี verbatim ครอบ (เช่นถาม "เรือน 5 = อะไร") ไม่มีชั้นสังเคราะห์รองรับเลย ต้องตอบเชิงเรขาคณิต
3. **section G „houses" gate ด้วย hasTime+career/authority/employment/property/general** (`:2162`) — สมเหตุผล (ต้องมีเวลาเกิด) แต่ทำให้คำถาม risk/relationship ที่อยากได้กลไกเรือนไม่ได้

(ทั้งสามเป็นการปรับ mapping ใน build-prompt.ts เท่านั้น · ไม่กระทบเนื้อคัมภีร์ · รอเจ้านายเคาะ)

---

## 4) ช่อง Regelwerk 1932 (รอเพื่อน) ครอบอะไรที่ทั้ง verbatim+method ยังไม่มี

`10-regelwerk-witte-1932-de.md` = ช่องว่าง (สถานะ 🟡 รอ) · เมื่อได้จะครอบสิ่งที่ **โดยธรรมชาติไม่มีในบทความวารสาร** (Witte ไม่เคยพิมพ์พจนานุกรมเป็นระบบในวารสาร PD):

- **พจนานุกรมคู่ดาว 2 ดวง A–Z ครบทุกคู่** พร้อมนัยละเอียด (ตอนนี้ file11 สังเคราะห์แทน · verbatim มีแค่ ~6–8 คู่กระจาย)
- **พจนานุกรมภาพดาว 3 ดวง (a+b−c) เป็นระบบ** — บทความมีแค่ตัวอย่าง (บท 44 Verlobung/Trennung) ไม่ครบ
- **ตารางผสมทรานส์เนปจูนเต็ม** (Cupido/Hades/Zeus/Kronos × ดาวจริงทุกดวง) — บทความมี Hades ค่อนข้างครบ (บท 40) · Cupido/Kronos/Zeus บางส่วน
- **planet-in-sign / planet-in-house dictionary เป็นระบบ** — บทความมีเป็นกฎกระจาย (§2.3) ไม่ใช่ตาราง

> จาก `01-source-policy-conclusion.md`: ยืนยัน 2 รอบว่า **ไม่มีสแกน PD ของ Regelwerk ≤1935 ที่ไหน** (Rudolph เรียบเรียง → งานรวบรวม PD 2053) · ต้องซื้อเล่มมาสแกน (ตัดคำนำ Rudolph) หรือรอเพื่อน · **ระหว่างรอ = ชั้นสังเคราะห์ file11 ทำหน้าที่แทน (ป้ายกำกับซื่อสัตย์แล้ว)**

---

## 5) สรุปให้เคาะ (priority)

| # | งาน | ต้องรอ 1932? | ผล |
|---|---|---|---|
| A | สกัด ♅/♆=tote Personen · ♂/♆ · ♄+♆+♀ · ♅=Kriegsverkünder เข้า file10 (§2.1) | **ไม่** | เปลี่ยนคู่หนักจากสังเคราะห์→verbatim |
| B | สกัด house-meanings เชิงกฎ บท 41 (6=โรค/งาน·8=ตาย·2=ทรัพย์) (§2.3) | **ไม่** | อุดช่อง house-meaning ที่ file11 ไม่มีเลย |
| C | เพิ่มบท 19 เป็น cross-source ให้ Hades + เก็บ Cupido/Zeus combo ที่ตก (§2.2) | **ไม่** | เสริมน้ำหนัก provenance ทรานส์เนปจูน |
| D | (ทางเลือก) สกัดหมวด Farben บท 01/04/19 (§2.4) | **ไม่** | เปิดมิติสี/โทน — ต้องถามว่าจะใช้ไหม |
| E | ปรับ wire: แนบ synastry(F) เมื่อ career/authority/risk (§3.1) | **ไม่** (โค้ด) | ให้กฎเรือนความหมายไปถึงคำถามงาน/ตาย |
| F | พจนานุกรมคู่ครบ A–Z + planet-in-house เป็นระบบ | **ใช่** | ได้จาก Regelwerk เพื่อน (หรือ 2053) |

**บรรทัดล่างสุด:** งาน A–D เป็น "สกัด verbatim จาก PD ที่มีในมือแล้ว" — เพิ่มความแม่น (ลดพึ่งชั้นสังเคราะห์) โดยไม่รอ 1932 และไม่เสี่ยงลิขสิทธิ์ · งาน F เท่านั้นที่ต้องรอเพื่อน · โครงสร้าง 2 ชั้น + ป้ายกำกับ **ผ่าน** (ไม่มีจุดปลอมสังเคราะห์เป็น Witte · ไม่บอกความหมายตรงนอกคัมภีร์)
