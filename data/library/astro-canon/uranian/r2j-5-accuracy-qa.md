# r2j-5 — ความแม่น / QA ของศาสตร์ยูเรเนียน (Uranian) : อะไรต้อง verify ก่อนเชื่อคำทำนายระดับวัน

> READ-ONLY audit (ควานทุกมิติ) · 2026-07-04 · ห้ามแก้โค้ด (ไฟล์นี้เป็น deliverable เดียวที่เขียน)
> ขอบเขต: `src/lib/astro/uranian/{engine,auslosung,packet,render}.ts` + `src/lib/astro-core/{ephemeris,ayanamsa}.ts` + `scripts/test-*uranian*.mjs` + คัมภีร์ `01-source-policy-conclusion.md`, `10-witte-canon-de.md`, `11-method-reading-uranian.md`, `10-regelwerk-witte-1932-de.md`, `_seed-dictionary-th.md`, `r2c-*`

## บรรทัดล่างสุด (อ่านก่อน)

ความแม่นของศาสตร์นี้แยกเป็น **4 มิติ** — แต่ละมิติมีระดับความเชื่อถือต่างกันมาก:

| มิติ | สถานะ | ความเชื่อถือ |
|---|---|---|
| **A. ตำแหน่งดาว (astronomy)** | astronomy-engine (VSOP87) · tropical | 🟢 น่าจะแม่นระดับวินาที **แต่ยังไม่ golden เทียบ Astrodienst เฉพาะ Uranian** |
| **B. คณิตเรขาคณิต (ครึ่งผลรวม/หน้าปัด/จับเวลา)** | deterministic · มีเทส golden คณิต | 🟢 แม่น + พิสูจน์ได้ · directed/prog แม่นถึงวินาที (bisect) |
| **C. ระเบียบวิธี (harmonic ไหน / นับมุมไหน)** | 🟠 **3 ชั้นใช้ harmonic ไม่ตรงกัน** (natal 4th · timing 8th · คัมภีร์ระบุถึง 16th) | ต้อง verify กับคัมภีร์ว่าตั้งใจ |
| **D. ความหมาย (คำทำนาย)** | 🔴 **พึ่งพจนานุกรมสังเคราะห์เองที่ยังไม่มีผู้เชี่ยวชาญ/golden ตรวจ** + มีความเสี่ยงลิขสิทธิ์ที่ต้องรีวิว | ต่ำสุด — จุดเปราะที่สุดต่อ "คำทำนายระดับวัน" |

**ข้อสรุปตรง ๆ:** เรขาคณิต+จับเวลา (B) ทำได้ดีและพิสูจน์ได้ · แต่ **3 อย่างยังไม่ถูกตรวจ**: (1) ฐานตำแหน่งไม่เคยเทียบซอฟต์แวร์ภายนอกแม้แต่ดวงเดียว (A) · (2) ระเบียบวิธีนับมุมไม่สอดคล้องภายในตัวเอง (C) · (3) ความหมายที่ AI ใช้ตอบมาจากพจนานุกรมที่ระบบแต่งเองโดยยังไม่มีใครตรวจความถูก/ลิขสิทธิ์ (D) — **3 ข้อนี้คือสิ่งที่ต้อง verify ก่อนกล้าเชื่อคำทำนายระดับวัน**

---

## มิติ A — ความแม่นตำแหน่งดาราศาสตร์

**สถาปัตยกรรม (ยืนยันจากโค้ด):**
- ดาวเคราะห์ = `A.GeoVector(...,true)` → `A.Ecliptic().elon` · **tropical geocentric apparent** (`ephemeris.ts:25-26`)
- **อาทิตย์คนละเส้นทาง** = `A.SunPosition(date).elon` (`ephemeris.ts:24`) — ดาวอื่นใช้ GeoVector · อาทิตย์ใช้ SunPosition (ทั้งคู่ apparent geocentric ของ astronomy-engine · ควรตรงกัน แต่ **ยังไม่มีเทสยืนยันว่าสองเส้นทางให้ผลสอดคล้อง**)
- ลัคนา/MC = สูตรมาตรฐาน + `A.SiderealTime` (= GAST apparent) แต่ใช้ **mean obliquity** (`ephemeris.ts:88-106, 65-68`) → ผสม apparent RAMC กับ mean obliquity (เหลื่อม nutation-in-obliquity ~9″ · ผลต่อ Asc/MC ~10-20″ · เล็ก แต่เป็นระบบ)
- decl = จาก ecliptic lon(apparent)/lat + **mean obliquity** เช่นกัน (`ephemeris.ts:41-47`)

| # | จุดเสี่ยง | สถานะ | ต้อง verify | effort |
|---|---|---|---|---|
| A1 | **golden เทียบ Astrodienst/SwissEph** | 🔴 **ไม่มีเลย** — เทสทั้งหมด recompute กับ ephemeris ตัวเดียวกัน (วงจรปิด) · ไม่เคยเทียบ lon/Asc/MC/decl กับภายนอก | §Golden-A: เทียบ 2-3 ดวง lon 10 ดาว + Asc/MC + decl กับ astro.com | สูง (1-2 วัน) |
| A2 | **อาทิตย์ใช้ SunPosition แต่ดาวใช้ GeoVector** | ⚠️ ไม่มีเทสยืนยันสองเส้นสอดคล้อง (ผลต่างคาดว่า <1″ แต่ยังไม่พิสูจน์) | assert `|SunPosition − GeoVector(Sun)| < 0.001°` | ต่ำ |
| A3 | **Asc/MC ผสม apparent RAMC + mean obliquity** | ⚠️ เหลื่อม ~10-20″ · comment อ้าง "tianxing validated 5/5" แต่ไม่รู้ tolerance | ยอมรับได้ระดับวัน · ตอน golden ตั้ง tol Asc/MC ≤0.05° | ต่ำ (ยอมรับ) |
| A4 | **decl ใช้ mean obliquity (ไม่มี nutation)** | ⚠️ decl คลาด ~ไม่กี่วินาทีองศา · เล็กเทียบ orb parallel 1.0° | ยอมรับได้ · tol decl ≤0.02° ตอน golden | ต่ำ (ยอมรับ) |
| A5 | **Pluto/ดาวนอกที่ปีเกิดสุดขั้ว** | astronomy-engine แม่น ~1700-2200 · ดวงคนสมัยใหม่ = ok | ครอบใน golden A1 อยู่แล้ว | — |

---

## มิติ B — ความแม่นเรขาคณิต + จับเวลา (ทำได้ดี)

**✅ พิสูจน์แล้ว (มีเทส):** ครึ่งผลรวม/หน้าปัด 90° golden (`mid(0,90)=45`, wrap) · ภาพดาว recompute occupant บนแกนจริง · antiscia/contra สูตร golden · parallel orb ตรงสูตร · true vs mean node (0<Δ≤2°) · Vierergestirn brute-force ตรง · **Auslösung: transit orb เทียบ ephemeris จริงคลาด ≤0.2′ · directed/prog orb <5′ (bisect ลู่เข้า)** · deterministic ×2 ทุกไฟล์

| # | จุดเสี่ยง | สถานะ | ต้อง verify | effort |
|---|---|---|---|---|
| B1 | **solar arc rate (1° vs 0.9856 Naibod vs prog-sun จริง)** | ✅ ใช้ **prog-sun จริง (secondary · day-for-year)** `auslosung.ts:346` · ตรงตำรา Witte บท 45 · ไม่ใช่ Naibod · เทสยืนยัน ~1.019°/ปี | ✅ ถูก · **แต่ตอน blind-test Astrodienst ต้องตั้งโหมด "true solar arc/secondary" ไม่ใช่ Naibod** ไม่งั้นค่าต่างกันเล็กน้อยโดยไม่ใช่บั๊ก | ต่ำ |
| B2 | **ดาวจรเร็ว sample เที่ยงวัน/วัน → วันคลาด ±1 วัน** | ⚠️ `scanTransits` เดินรายวัน orb เร็ว 0.5° · ☉~1°/วัน, ☿/♀ ~1.2°/วัน → peak จริงตกระหว่าง 2 sample → **วันที่รายงานอาจคลาด exact ±1 วัน** (ดาวช้า+directed/prog ไม่มีปัญหานี้ · จันทร์จรตัดออกแล้ว) | ถ้าจะฟันธง "วัน" ของ transit เร็ว: เพิ่ม bisect (เหมือนชั้น directed) หรือระบุ "±1 วัน" ในคำทำนาย | กลาง |
| B3 | **fourPlanet `midDial90` bug ที่ขอบ wrap 0/90** | ⚠️ latent — `(hi.mid%90 + hj.mid%90)/2` (`engine.ts:406`) เฉลี่ยตรง ๆ · ถ้า mid สองคู่ = 89° กับ 1° (ใกล้กันข้าม wrap · orbDeg ถูกเพราะใช้ dial90Distance) จะได้ midDial90=45 (ผิด ควร ~0/90) · **ยังไม่ถูก render แสดง → cosmetic/latent ไม่กระทบคำตอบตอนนี้** | จดไว้ · ถ้าจะโชว์ midDial90 ค่อยแก้เป็น circular-mean บน mod-90 | ต่ำ |
| B4 | **render slice 40 แต่ engine cap 60** | ⚠️ `render.ts:87,110` slice(40) · engine MAX 60 · `personalFirst` ดัน ⭐ ขึ้นก่อนแล้ว slice → ถ้ามี ⭐ >40 อัน ภาพดาวคมที่ไม่ ⭐ บางตัวไม่ถูกส่งให้ AI (edge · ยอมรับได้) | จดไว้ · ปกติ ⭐ ไม่ถึง 40 | ต่ำ |
| B5 | **เวลาเกิด → Meridian/Asc (โซ่ความแม่น)** | ⚠️ Witte: Meridian=ระดับนาที · เกิดคลาด 4 นาที = MC คลาด ~1° = **prog_mc timing คลาด ~1 ปี** · no-time degrade ตัด Meridian/Asc ถูกต้อง (`packet.forbiddenFieldsWhenNoTime`) | disclaimer: คำทำนายอิง Meridian/Asc เชื่อได้เท่าความแม่นเวลาเกิด | ต่ำ (disclaimer) |
| B6 | **timezone/DST ของเวลาเกิด** | engine รับ `dtUTC` แล้ว — การแปลง TZ/DST/LMT อยู่ที่ชั้น fusion5 (นอก engine นี้) · ผิดพลาดที่นั่น = ทุกตำแหน่งเลื่อน | verify pipeline แปลงเวลาเกิด (นอก scope ไฟล์นี้ · แต่กระทบความแม่นปลายทาง) | — (นอก scope) |

---

## มิติ C — ระเบียบวิธี : นับ "มุมไหน / harmonic ไหน" (🟠 ไม่สอดคล้องภายใน)

**นี่คือประเด็นเทคนิคที่คมสุดของการควานรอบนี้ — 3 ชั้นใช้ชุดมุมไม่ตรงกัน:**

| ชั้น | ฟังก์ชัน | มุมที่จับได้จริง | harmonic |
|---|---|---|---|
| **ภาพดาว/จุดไว/4ดวง กำเนิด** | `dial90Distance` (`engine.ts:186`) | เฉพาะ **0/90/180/270** (มุม 45/135 ตกที่ dial-distance 45 = ไกลสุด ไม่เข้า orb) | **4th (หน้าปัด 90°)** |
| **จับเวลา Auslösung** | `nearestHardAspect` [0,45,90,135,180] (`auslosung.ts:104`) | **0/45/90/135/180** | **8th (เพิ่มครึ่งเหลี่ยม)** |
| **คัมภีร์ระเบียบวิธี** | `11-method-reading` Grundregel #4 | ระบุ "0/45/90/135/180 **(+22.5)**" | **ถึง 16th** |

**ผลกระทบ:** ภาพดาวกำเนิด **ไม่จับ 45°/135°** เลย — ขณะที่ **ตัวอย่างของ Witte เองในบท 30 (Kaiser Wilhelm) ใช้ 135° (Eineinhalbquadrat)** เป็น "ศัตรูใหญ่ที่สุด" ระหว่าง Merkur–Uranus · แปลว่า engine อาจ **มองข้ามภาพดาว 8th-harmonic ที่ตำราถือว่าสำคัญ** ในผังกำเนิด (แต่กลับไปจับ 45/135 ในชั้นเวลา) — ไม่สอดคล้องกันเอง

| # | จุดเสี่ยง | สถานะ | ต้อง verify | effort |
|---|---|---|---|---|
| C1 | **natal ไม่จับ 45/135 แต่ timing จับ + คัมภีร์ใช้ 135** | 🟠 ต้องตัดสิน: เป็นการเลือก 4th-dial โดยตั้งใจ (ขนบ Uranian หน้าปัด 90°) หรือ **ควรเพิ่ม 45/135 ในภาพดาวกำเนิด** ให้ตรงชั้นเวลา+ตัวอย่าง Witte | อ่านคัมภีร์บท 30/31/16 + ปรึกษาผู้รู้ Uranian ว่า natal Planetenbild ควรครอบ harmonic ไหน แล้ว **ทำ 3 ชั้นให้ตรงกัน** (หรือระบุเจตนาชัดว่าทำไมต่าง) | กลาง |
| C2 | **คัมภีร์อ้าง 22.5° แต่ engine ไม่มี 16th เลย** | ⚠️ 11-method Grundregel เขียน "(+22.5)" แต่ทั้ง natal และ timing ไม่จับ 22.5° → คัมภีร์สัญญามากกว่าที่ engine ทำ | ตัดสิน: เอา 22.5 ออกจากคัมภีร์ หรือ implement · อย่างน้อยอย่าให้ AI อ้างมุมที่ engine ไม่ได้คำนวณ | ต่ำ (แก้คัมภีร์) หรือ กลาง (impl) |
| C3 | **orb: picture 1.5° / sensitive 1.0° / antiscia·parallel 1.0°** | ⚠️ Witte ให้แค่ "Spielraum" ไม่ระบุตัวเลข · antiscia/parallel ติดป้าย "orb วิธีสากล" แล้ว (render #9) — ซื่อสัตย์ดี · แต่ค่า 1.5/1.0 เป็น convention ที่ยังไม่ผูกกับคัมภีร์ | ระบุใน doc ว่า orb = convention ของระบบ (ทำแล้วบางส่วน) · ไม่ใช่บั๊ก | ต่ำ |

---

## มิติ D — ความแม่นของ "ความหมาย" (🔴 เปราะสุดต่อคำทำนายระดับวัน)

**นี่คือมิติที่การควานรอบแรกยังไม่ลง — และเป็นจุดที่กระทบ "ความเชื่อถือของคำทำนาย" มากที่สุด**

**สิ่งที่พบ:**
- ความหมายที่ AI ใช้ตอบมาจาก **2 แหล่ง** (render.ts กฎ #2-4):
  1. **Witte verbatim** (`10-witte-canon-de.md` หมวด F/H/I) — PD สะอาด อ้างบทได้ · **แต่ครอบแค่ไม่กี่คู่** (เช่น ☉+☽=Freundschaft, ♀+♃=Liebesglück, ชุด Cupido/Hades/Kronos ตามเรือน)
  2. **`11-method-reading-uranian.md` (44KB)** — พจนานุกรม "การอ่านเชิงวิธี" ที่ **ระบบเขียนเอง** ครอบทุกคู่ (S1-S8 ตามดาวนำ + P1 จุดส่วนตัว + T1 TNP) · **นี่คือแหล่งที่ AI ใช้จริงสำหรับคู่ส่วนใหญ่** (rule #4: "อ่านความหมายของทุกคู่ดาวที่ engine ส่งมาได้...ใช้พจนานุกรม")
- **`10-regelwerk-witte-1932-de.md` = ยังว่าง/placeholder (3KB)** — พจนานุกรม Witte/Regelwerk verbatim ตัวจริง **ยังไม่ถูกผนวก** (11-method header เขียนเอง: "ไฟล์ 10-regelwerk ยังว่าง อย่าแตะ") → แปลว่า **fidelity ต่อ Hamburg school ยังพึ่งพจนานุกรมสังเคราะห์ล้วน**

| # | จุดเสี่ยง | สถานะ | ต้อง verify | effort |
|---|---|---|---|---|
| **D1** | **fidelity: ความหมายในพจนานุกรมสังเคราะห์ ถูกต้องตามสำนัก Hamburg แค่ไหน** | 🔴 **ไม่มีผู้เชี่ยวชาญ/golden ตรวจ** — 11-method เป็น archetype-combo ทั่วไป (♄/♆=สลายโครงสร้าง ฯลฯ) สังเคราะห์จาก "ความหมายดาวสาธารณะ + วิธี Witte" · อ่านดูสมเหตุผล แต่ **ยังไม่มีใครยืนยันว่าไม่เพี้ยนจากความหมายจริงของสำนัก** · คำทำนายระดับวันอิงพจนานุกรมนี้เป็นหลัก | ให้ผู้รู้ Uranian (หรือเทียบ Witte verbatim หมวด F/H/I ที่มี) สอบทานพจนานุกรม S1-S8/P1/T1 อย่างน้อยคู่ที่ ⭐ แตะจุดส่วนตัวบ่อย · ทำ "semantic golden" (ดู §Golden-D) | สูง |
| **D2** | **ลิขสิทธิ์: 11-method paraphrase-launder จาก Regelwerk/Ebertin หรือไม่** | 🟠 01-source-policy ห้ามลอก Regelwerk/Ebertin/Brummund/Niggemann/Aich เด็ดขาด · render #3 สั่งห้ามลอก · เนื้อ 11-method ดู generic (ไม่เหมือน copy verbatim) **แต่ยังไม่มีการรีวิวเทียบข้อความจริงของตำราลิขสิทธิ์** เพื่อยืนยันว่าไม่ใช่ close-paraphrase | รีวิวโดยเทียบ 11-method กับ Regelwerk/Ebertin CSI ต้นฉบับ (คนที่มีเล่ม) ยืนยันว่าเป็นงานอิสระ ไม่ใช่ดัดแปลง | กลาง |
| **D3** | **AI แต่งความหมายนอกพจนานุกรม (hallucination)** | ✅ ป้องกันหลายชั้น — render #3/#4 สั่ง "คู่ที่พจนานุกรมไม่มี → อธิบายเชิงเรขาคณิต ห้ามแต่ง" + "ห้ามสร้างภาพดาว/จุดไว/จุดกระจกเองจากองศา" (render บรรทัด 84/96/108/120/133) · NO_PERCENT | เทส/ตรวจว่า AI ปฏิบัติตาม (semantic golden ควรรวมเคส "คู่ไม่มีในพจนานุกรม") | กลาง |
| **D4** | **Witte verbatim: องศาในตัวอย่างเพี้ยนจาก OCR Fraktur** | ✅ ไม่กระทบตัวเลขคำนวณ (engine ไม่อ่านองศาจากคัมภีร์) · ⚠️ องศาที่เพี้ยน (`08°52′[○]`) ยังฝังในตัวบทตัวอย่างที่ส่ง AI · render #8 เตือน "ค่าประมาณ ต้องเทียบสแกน" | เทียบองศา ~6-8 จุดในบท 30/12/31/44 กับสแกน `r2c-src-witte-30-*.pdf` หรือถอดเลขทิ้ง (เก็บร้อยแก้วที่ OCR สะอาด) | ต่ำ |
| **D5** | **TNP (Cupido/Hades/Kronos/Zeus) meaning ใช้ได้แต่ตำแหน่งยังไม่มี** | ✅ ปล่อยว่างถูกต้อง — position=null · `tnpPositionSource: "..._not_wired_phase1"` · render #6 ห้าม AI ระบุองศา/ราศี · T1 ให้เฉพาะคีย์เวิร์ด+combination | เฟส 2: ตอน wire ephemeris ต้องติดป้าย "mean-element ~ลิปดา ไม่ใช่วินาที" + orb กว้างกว่าดาวจริง | — (เฟส 2) |
| **D6** | **guard ดาวลิขสิทธิ์ (Lefeldt/Sieggrün)** | ✅ แน่นหลายชั้น — Apollon/Admetos/Vulkanus/Poseidon ไม่เคยหลุดเข้า points/pictures/prompt/mover/target (เทส line-by-line) · Pluto ใช้ความหมายสากล ไม่ใช่ Hamburg หลังสงคราม (11-method A0) | ✅ ปิดเคส | — |

---

## Golden-Test Plan (เทียบดวงที่รู้ค่ากับมาตรฐาน) — 2 ชุด

### Golden-A · positional (เทียบ Astrodienst — ยืนยัน "ฐาน" ถูก)
**ดวง:** Aeaw 1984-12-31 13:15 Bangkok (reuse golden ปาจื้อ) + ดวงดัง Astro-Databank **Rodden AA** 1-2 ดวง (ตรงกฎ Research DB)
**เทียบจาก astro.com "Chart Drawing, Uranian/90°" + Ephemeris:**
| ค่า | tolerance | หมายเหตุ |
|---|---|---|
| lon ดาว 10 (tropical) | ≤ 0.01° | + assert อาทิตย์ SunPosition≈GeoVector (A2) |
| Ascendant / MC | ≤ 0.05° | เผื่อ mean-obliquity (A3) |
| declination | ≤ 0.02° | เผื่อ nutation (A4) |
| **รายการภาพดาว/จุดไวบนหน้าปัด 90°** | เซ็ตต้องตรง | ตัวชี้วัดที่แปลผลได้จริง · **ต้องตกลงก่อนว่านับ harmonic ไหน (มิติ C1)** |
| ส่วนโค้งอาทิตย์ ณ อายุที่รู้ | ≤ 0.1° | ตั้ง Astrodienst = **true solar arc/secondary** ไม่ใช่ Naibod (B1) |
| วัน exact ของ 1 transit ช้า + 1 directed | ≤ 1 วัน | transit เร็ว = ยอมรับ ±1 วัน (B2) |
**ไฟล์:** `scripts/test-uranian-golden-astrodienst.mjs` (hardcode ค่าที่อ่านมือ + ระบุ source/วันดึงในคอมเมนต์) · effort สูง 1-2 วัน

### Golden-D · semantic (ยืนยัน "ความหมาย" ไม่เพี้ยน/ไม่ละเมิด) — ใหม่ · สำคัญไม่แพ้ positional
1. **สอบทาน fidelity:** ให้ผู้รู้ Uranian หรือเทียบ Witte verbatim (หมวด F/H/I) ตรวจพจนานุกรม 11-method อย่างน้อยชุดคู่ที่ ⭐ แตะจุดส่วนตัว → ให้ผ่าน/แก้เป็นรายคู่
2. **สอบทานลิขสิทธิ์:** เทียบ 11-method กับ Regelwerk/Ebertin CSI ต้นฉบับ ยืนยันเป็นงานอิสระ (D2)
3. **เทส hallucination:** feed ผัง → ตรวจว่า AI ตอบตามพจนานุกรม + คู่ที่ไม่มี = อธิบายเชิงเรขาคณิต ไม่แต่ง (D3)
4. **ผนวก Regelwerk 1932 verbatim** (เพื่อนเยอรมันสกัดส่งมา · ช่อง `10-regelwerk-witte-1932-de`) เมื่อพร้อม → ใช้ทับพจนานุกรมสังเคราะห์เป็นชั้นนำ (ลดการพึ่ง D1)

---

## ลำดับความสำคัญ — verify อะไรก่อน "เชื่อคำทำนายระดับวัน"

1. 🔴 **Golden-A positional เทียบ Astrodienst** (A1) — ฐานตำแหน่งยังไม่เคยตรวจอิสระ ถ้าเพี้ยน ทุกภาพดาวเพี้ยน
2. 🔴 **Golden-D fidelity + ลิขสิทธิ์ ของพจนานุกรมความหมาย** (D1/D2) — คำทำนายระดับวันอิงพจนานุกรมนี้เป็นหลัก แต่ยังไม่มีใครตรวจ
3. 🟠 **แก้ harmonic ให้สอดคล้อง 3 ชั้น** (C1/C2) — natal ควรจับ 45/135 ไหมให้ตรง timing + ตัวอย่าง Witte · เอา 22.5 ที่ไม่ได้ทำออกจากคัมภีร์
4. 🟠 **วันที่ transit เร็ว ±1 วัน** (B2) — bisect หรือระบุ ±1 วัน
5. 🟡 **เทียบองศาตัวอย่างคัมภีร์กับสแกน หรือถอดเลขทิ้ง** (D4) · **disclaimer เวลาเกิด→Meridian** (B5)
6. 🟢 **ปิดเคสแล้ว:** ayanamsa tropical ถูก 100% (uranian ไม่ import sidereal เลย · grep ว่าง) · solar arc ตรงตำรา (B1) · TNP ปล่อยว่าง+ติดป้ายครบ (D5) · guard ดาวลิขสิทธิ์แน่น (D6)

**สิ่งที่ทำได้ดีอยู่แล้ว (ไม่ต้องแตะ):** deterministic ล้วน (ไม่มี Date.now/random) · คณิตหน้าปัด/ครึ่งผลรวมมี golden · directed/prog แม่นถึงวินาที (bisect) · การติดป้ายความซื่อสัตย์ครบ (OCR เพี้ยน/ยังไม่คำนวณ/orb วิธีสากล/การอ่านเชิงวิธี≠verbatim/NO_PERCENT) — ชั้นนี้ตรงไปตรงมา ไม่หลอกความแม่น

---

## ยืนยัน (ตามที่ถูกสั่ง)
- **READ-ONLY audit** — ไม่ได้แก้โค้ดใด ๆ · เขียนไฟล์เดียวคือ `r2j-5-accuracy-qa.md` นี้
- **ไม่ได้บอกคำทำนายตรง ๆ** — รายงานนี้พูดเรื่องความแม่น/QA/สิ่งที่ต้อง verify เท่านั้น ไม่มีการตีความดวงหรือฟันธงเหตุการณ์
- ทุกข้ออ้างอิงโค้ด/คัมภีร์จริง (ระบุไฟล์+บรรทัด) · ที่เป็นค่าคาดหมายยังไม่พิสูจน์ (เช่น "astronomy-engine ต่าง Astrodienst <1″", "SunPosition≈GeoVector") ระบุชัดว่า **ยังต้องเทสจริง** ตามกฎ "ห้ามใช้คำว่าน่าจะ" — จุดที่ยังไม่ยืนยันใช้คำว่า "ยังไม่ยืนยัน/ต้อง verify"
