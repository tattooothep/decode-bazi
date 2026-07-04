# r2i-2 · ชั้นข้อมูล/ephemeris ที่เติมให้ AI ยูเรเนียนได้อีก

> READ-ONLY gap analysis · 4 ก.ค. 2026 · ขอบเขต = **สำรวจว่ามีข้อมูลดาราศาสตร์อะไรเติมเข้าเครื่องยูเรเนียนได้อีก** (ยังไม่แตะโค้ด)
> เครื่องปัจจุบัน: `src/lib/astro/uranian/engine.ts` → เรียก `src/lib/astro-core/ephemeris.ts` → ใช้ **astronomy-engine 2.1.19 (MIT)**
> ทุกข้อความในเอกสารนี้อ้างจากไฟล์จริง/แหล่งจริง — จุดที่ยังไม่ยืนยัน เขียนกำกับว่า "ต้องทดสอบ" ไม่เดาตัวเลข

---

## 0. สถานะเครื่องตอนนี้ (ยืนยันจากซอร์สจริง)

ดาว/จุดที่ **คำนวณจริงแล้ว** ในเครื่องยูเรเนียน (`engine.ts`) ผ่าน `computeBodies()`:

- ดาวจริง 10 ดวง tropical geocentric apparent: ☉☽☿♀♂♃♄⛢♆♇ (`URANIAN_BODY_ORDER`)
- Meridian (MC) + Aszendent เมื่อมีเวลาเกิด (`midheaven()` / `ascendant()` — สูตร RAMC ตรง golden ฝั่ง tianxing 5/5)
- Mondknoten = **mean node** (`meanNode()` · สูตร Meeus) — เข้า `personalPoints` แล้ว
- Widderpunkt (จุดเมษ 0°♈) — คงที่

สิ่งที่ **มีใน astro-core แล้วแต่เครื่องยูเรเนียน "ยังไม่ดึงมาใช้"** (สำคัญมาก — ปลดล็อกได้ทันทีไม่ต้องเพิ่ม lib):

| ของที่มีอยู่แล้วใน `ephemeris.ts` | ฟังก์ชัน | ยูเรเนียนใช้ได้เป็นอะไร |
|---|---|---|
| **Deklination** (ค่าเดคลิเนชัน) ของดาวทุกดวง | `declinationFromEcliptic()` · field `BodyPos.declination` | **Parallel / Gegenparallel (等緯/平行)** — Witte เขียนบทความเดคลิเนชันเองถึง 4 ชิ้น (บท 03/23/46 + „Leichte Berechnung der Deklination") |
| **月孛 / mean lunar apogee = Mean Lilith** | `lunarApogee()` (Meeus) | จุด Lilith เฉลี่ย (ถ้าจะเสริม — ไม่ใช่แกน Witte แท้) |
| ความเร็วดาว / retrograde | `eclipticSpeed()` · `isRetro()` | ยูเรเนียน radix ไม่ใช้ทิศ (static) แต่ชั้น Auslösung/transit ใช้แยก applying/separating ได้ |

> ⚠️ ข้อค้นพบเด่น: **เดคลิเนชันมีข้อมูลพร้อมอยู่แล้ว** — Parallel ของ Witte จึงเป็น "ผลไม้ห้อยต่ำสุด" (เพิ่มตรรกะเทียบเดคลิเนชันในเครื่อง ไม่ต้องเพิ่ม lib ใด ๆ)

TNP 4 ดวงของ Witte (Cupido/Hades/Zeus/Kronos) = **ยังไม่คำนวณตำแหน่ง** (`tnpPositionSource: "witte_pd_ephemeris_not_wired_phase1"`) — นี่คือช่องว่างใหญ่สุด และเป็นเหตุผลหลักที่ต้องพิจารณา Swiss Ephemeris (ดู §2)

---

## 1. ตารางสรุป — ข้อมูลที่เติมได้ทั้งหมด

| ข้อมูล | มีใน astronomy-engine แล้ว? | ต้องเพิ่ม lib ไหน | License | Effort | ปลดล็อกความสามารถ |
|---|---|---|---|---|---|
| **TNP 4 ดวง Witte** (Cupido 40 / Hades 41 / Zeus 42 / Kronos 43) | ❌ ไม่มี (เป็นดาวสมมุติ คำนวณจาก orbital elements) | **Swiss Ephemeris** (`sweph` npm) — หรือคำนวณ Kepler จาก orbital elements เอง | **AGPL-3.0 / commercial 700 CHF** (ดู §2) | **สูง** (native/N-API + ต้อง config seorbel.txt) หรือกลาง (เขียน Kepler เอง) | **แกน Witte แท้** — ภาพดาว/จุดไวที่มี TNP ร่วม (หมวด H คัมภีร์) = ยกระดับจาก "อ้างความหมายลอย" → "คำนวณตำแหน่งจริง" |
| **Deklination / Parallel** | ✅ **มีแล้ว** (`declinationFromEcliptic` · `BodyPos.declination`) แต่เครื่องยูเรเนียนยังไม่ดึงมาใช้ | — (ไม่ต้องเพิ่ม) | MIT | **ต่ำ** (เพิ่มตรรกะเทียบเดคในเครื่อง) | **Parallel/Gegenparallel ของ Witte** — มิติที่ 2 นอกเหนือ dial 90° (Witte เขียนบทเดคลิเนชันหลายชิ้น = อยู่ในขนบแท้) |
| **True Node (wahrer Mondknoten)** | ⚠️ กึ่ง — มี `SearchMoonNode`/`NextMoonNode` (คืน "เวลาโหนดตัด" ต้อง interpolate เป็น longitude) | — (ใช้ astronomy-engine ได้) หรือ swisseph (`SE_TRUE_NODE=11`) | MIT / (SwissEph) | **กลาง** ถ้าทำเองด้วย astronomy-engine · **ต่ำ** ถ้ามี swisseph | node จริง (แกว่ง ±1.5°) แทน mean node — ความละเอียดจุดไว Node สูงขึ้น |
| **Mean Node** | ✅ มีแล้ว (`meanNode`) | — | MIT | มีแล้ว | (ใช้อยู่แล้วใน personalPoints) |
| **Vertex (Vertex/Gegenvertex)** | ❌ ไม่มีสำเร็จรูป (คำนวณ trig จาก RAMC+ε+lat ได้) | — (เขียนสูตรเองใน ephemeris.ts) หรือ swisseph (`swe_houses_ex` → ascmc[3]) | MIT | **ต่ำ** (ตรีโกณล้วน เหมือน `ascendant()`) | Vertex เป็นจุดส่วนตัวที่บางสำนักยูเรเนียนใช้ (ไม่ใช่แกน Witte แท้ · priority รอง) |
| **East Point / Ostpunkt (Equatorial Asc)** | ❌ ไม่มีสำเร็จรูป (= Asc ที่ lat 0) | — (เขียนสูตรเอง) หรือ swisseph ascmc[4] | MIT | **ต่ำ** | „Ostpunkt" ที่บางสำนักฮัมบวร์กใช้ (priority รอง) |
| **Part of Fortune (Glückspunkt)** | ➖ ไม่มีชื่อ แต่ = Asc+Moon−Sun (เลขคณิตล้วน) | — (arithmetic) | MIT | **ต่ำมาก** | จุดโชค — แต่ยูเรเนียนถือเป็น "จุดไว" อยู่แล้ว (เครื่องคำนวณ sum/difference ทุกคู่) → คุณค่าเพิ่มน้อย |
| **Fixed stars (Fixsterne)** | ⚠️ มี `DefineStar` แต่ **ไม่มีแคตตาล็อกดาว** (ต้องป้อน RA/Dec เอง + จัดการ precession/proper motion) | ต้องฝังแคตตาล็อก + precession เอง · หรือ swisseph `swe_fixstar2_ut` (sefstars.txt ~1000+ ดาว) | MIT / (SwissEph) | **สูง** ถ้าทำเอง · **ต่ำ** ถ้ามี swisseph | ดาวฤกษ์คงที่ — ไม่ใช่แกนวิธี Witte (priority ต่ำสุด) |
| **Mean Lilith (mean apogee)** | ✅ มีแล้ว (`lunarApogee`) | — | MIT | มีแล้ว | Lilith เฉลี่ย (ไม่ใช่แกน Witte · เสริมได้) |
| **True/Osculating Lilith** | ⚠️ มี `SearchLunarApsis` (apogee เป็น event → interpolate) | — / swisseph (`SE_OSCU_APOG=13`) | MIT / (SwissEph) | **กลาง** / ต่ำ | Lilith จริง (priority ต่ำ) |

**สรุปการจัดลำดับ (จากคุณค่าต่อความแม่นตามขนบ Witte ÷ effort):**

1. 🥇 **Parallel/Deklination** — ข้อมูลมีพร้อมแล้ว, effort ต่ำสุด, อยู่ในขนบ Witte แท้ → ควรทำก่อน
2. 🥈 **TNP 4 ดวง (Swiss Ephemeris)** — คุณค่าสูงสุด (แกน Witte แท้) แต่ effort/ลิขสิทธิ์สูงสุด → ตัดสินใจเชิงกลยุทธ์ (ดู §2)
3. 🥉 **True Node** — ยกจาก mean → true ได้ด้วย astronomy-engine เดิม (ไม่ต้องเพิ่ม lib)
4. ตัวรอง: Vertex / East Point (trig เพิ่มเอง, effort ต่ำ แต่ไม่ใช่แกน Witte แท้)
5. Priority ต่ำ/ข้ามได้: Part of Fortune (ซ้ำจุดไว), Fixed stars, Lilith (นอกขนบ Witte)

---

## 2. เจาะลึก Swiss Ephemeris — ตัวปลดล็อก TNP

### 2.1 ทำไมต้อง SwissEph (astronomy-engine ทำ TNP ไม่ได้)

astronomy-engine เป็น ephemeris ของ **วัตถุจริง** (VSOP87/Meeus) — Cupido/Hades/Zeus/Kronos เป็น **ดาวสมมุติ (hypothetical/fictitious bodies)** ที่ Witte กำหนดจาก *ธาตุวงโคจรเฉลี่ย (mean orbital elements)* ไม่ใช่วัตถุที่สังเกตได้ ⇒ astronomy-engine ไม่มีและไม่มีวันมี

Swiss Ephemeris คำนวณ TNP จากไฟล์ **`seorbel.txt`** (ตาราง Kepler orbital elements ของดาวสมมุติ) — ค่าที่ได้ = ตำแหน่งตามขนบโหราศาสตร์ (ชุมชนยูเรเนียนทั่วโลกใช้ชุดนี้)

### 2.2 หมายเลข body ของ TNP (ยืนยันจาก header `swephexp.h`)

```
SE_CUPIDO   = 40    ✅ ใช้ (Witte PD)
SE_HADES    = 41    ✅ ใช้ (Witte PD)
SE_ZEUS     = 42    ✅ ใช้ (Witte PD)
SE_KRONOS   = 43    ✅ ใช้ (Witte PD)
SE_APOLLON  = 44    ⛔ Sieggrün — ห้ามคำนวณ (นโยบายลิขสิทธิ์ EXCLUDED_TNP)
SE_ADMETOS  = 45    ⛔ Sieggrün — ห้าม
SE_VULKANUS = 46    ⛔ Sieggrün — ห้าม
SE_POSEIDON = 47    ⛔ Sieggrün — ห้าม
```

> 🔗 ตรงกับ `WITTE_TNP` (40–43) และ `EXCLUDED_TNP` (44–47) ใน `engine.ts` เป๊ะ — เครื่องออกแบบเผื่อไว้แล้ว ต้องคำนวณเฉพาะ 40–43 และ guard 44–47 ไว้ไม่ให้หลุด

⚠️ **ยืนยันไม่ได้บอกตรง (ข้อควรระวังความแม่น):** ตำแหน่ง TNP จาก SwissEph มาจาก *orbital elements เฉลี่ย* ไม่ใช่การสังเกตจริง → ความแม่น "ระดับลิปดา (arcmin)" และอาจต่างกันเล็กน้อยระหว่างชุด element ต่าง ๆ (Witte 1935 ↔ ค่าปรับปรุงภายหลัง) ต้องระบุใน packet ว่าเป็น *fictitious mean-element position* ไม่ใช่ "ดาวจริงระดับวินาที" อย่างดาว 10 ดวง — สอดคล้องกฎคัมภีร์ = source of truth, ห้ามอวดความแม่นเกินจริง

### 2.3 License — จุดชี้เป็นชี้ตายของ hourkey.io (SaaS เชิงพาณิชย์)

Swiss Ephemeris เป็น **dual license** (แหล่ง: astro.com/swisseph/swephprice_e.htm · สัญญา secont_e.pdf ฉบับ June 2026):

| ทางเลือก | เงื่อนไข | เหมาะกับ hourkey.io ไหม |
|---|---|---|
| **AGPL-3.0 (ฟรี 0 CHF)** | ต้องเปิดซอร์ส **ทั้งโปรเจกต์** ที่ใช้งานผ่านเครือข่าย (AGPL network clause = ผู้ใช้เว็บมีสิทธิ์ขอซอร์สทั้งระบบ) | ❌ **ไม่เหมาะ** — hourkey.io เป็น SaaS โค้ดปิด (wrappers LOCKED, engine ปาจื้อ ฯลฯ) · AGPL จะบังคับเปิดซอร์สทั้งหมด |
| **Professional License (commercial)** | จ่ายครั้งเดียว → เก็บโค้ดปิดได้ · เซ็นสัญญา · ดาวน์โหลด SwissEph จาก GitHub เอง | ✅ **ทางที่สะอาดสำหรับพาณิชย์** |

**ราคา (ยืนยันจาก astro.com):**
- **Professional Edition unlimited license = 700.00 CHF** (จ่ายครั้งเดียว · หน้า price ปัจจุบัน June 2026 · one-time ไม่ใช่รายปี · สัญญามีอายุ 99 ปี)
- เอกสารเก่าเคยระบุขั้นบันได: ใบแรก 750 CHF / ใบถัดไป 400 CHF / unlimited 1,550 CHF — **แต่หน้า price ปัจจุบันเหลือ unlimited 700 CHF** (ใช้เลขนี้เป็นหลัก)
- 700 CHF ≈ 27,000–28,000 บาท (โดยประมาณ อัตราแลกเปลี่ยนแกว่ง — ต้องเช็ควันจ่ายจริง)

> 💡 ประเด็นสำคัญ: **license ของ npm wrapper ไม่ override license ของตัว SwissEph** — ต่อให้ wrapper เป็น AGPL/MIT ตัวไลบรารี C ข้างใต้ยังบังคับ AGPL-หรือ-ซื้อ ⇒ ถ้าจะเก็บโค้ดปิด **ต้องซื้อ commercial 700 CHF** ไม่ว่าเลือก npm ตัวไหน

### 2.4 npm package ไหนดี

| package | เทคโนโลยี | สถานะ | License wrapper | หมายเหตุ |
|---|---|---|---|---|
| **`sweph`** (timotejroiko) | **N-API** (ไม่ใช้ node-gyp โบราณ) | ⭐ ดูแลต่อเนื่อง · "100% API coverage" SwissEph 2.10 | AGPL-3.0 (v2.10.1+) / GPL-2.0 (เก่า) | **แนะนำ** — ครบ `swe_calc_ut` (รองรับ body 40–43), `swe_fixstar2_ut`, `swe_houses_ex` (Vertex/EastPoint), true node, osculating apogee · แต่ **ต้องดาวน์โหลดไฟล์ ephemeris เอง** (`sepl_18.se1`, `semo_18.se1`, `seorbel.txt`, `sefstars.txt`) แล้ว `set_ephe_path()` |
| `swisseph` (mivion) | node-gyp (native compile) | เก่ากว่า · ยังใช้ได้ | GPL | ต้อง build ตอนติดตั้ง (เสี่ยง toolchain บน server) |
| `swisseph-wasm` (u-blusky ฯลฯ) | WebAssembly | ทางเลือกไม่ต้อง native | (เช็คต่อ) | เลี่ยงปัญหา compile/prebuild · เหมาะ serverless/edge · เช็ค API coverage ก่อน (บางตัวไม่ครบ fictitious) |

> ⚠️ `sweph` **ไม่แถมไฟล์ ephemeris** — สำหรับ TNP ต้องมี `seorbel.txt` (Kepler elements) และไฟล์ดาวหลัก · ขนาดชุดเต็มหลายสิบ MB → กระทบ deploy footprint (ต้องวางแผน CDN/volume)

### 2.5 ตัวอย่างเรียก (sweph · เชิงหลักการ — ยังไม่ wire จริง)

```js
const swe = require("sweph");
swe.set_ephe_path("/data/ephe");        // โฟลเดอร์ที่วาง seorbel.txt + *.se1

const jd = swe.julday(1984, 12, 31, 6.25, swe.constants.SE_GREG_CAL); // UT
const flags = swe.constants.SEFLG_SWIEPH | swe.constants.SEFLG_SPEED; // + SEFLG_EQUATORIAL ถ้าอยากได้ Dec

// TNP: body 40=Cupido 41=Hades 42=Zeus 43=Kronos
const cupido = swe.calc_ut(jd, 40, flags);
// cupido.data[0] = longitude (tropical), [1]=latitude, [3]=speed lon
```

- true node: `swe.calc_ut(jd, swe.constants.SE_TRUE_NODE /*11*/, flags)`
- Vertex/EastPoint: `swe.houses_ex(jd, geolat, geolon, 'P')` → `ascmc[3]=Vertex`, `ascmc[4]=EquatorialAsc(EastPoint)`
- fixed star: `swe.fixstar2_ut("Aldebaran", jd, flags)`

> ทั้งหมดนี้ยังเป็น *แผน* — โค้ดจริงต้องเข้ากฎ AGENTS ข้อ 9 (engine → structured JSON → AI ตีความ) + guard 44–47 + ปิดเป็น phase + review "พ่อ"

### 2.6 ทางเลือกไม่ซื้อ license: คำนวณ Kepler เอง

TNP = ดาวสมมุติจาก orbital elements → เขียน Kepler solver เอง (จาก elements ที่ Witte ตีพิมพ์ในบท 20/21/22/25 + „Immerwährende Ephemeride 1935" = **PD 100%** ตาม `01-source-policy-conclusion.md:51`) แล้วป้อน astronomy-engine/สูตรเอง

- ✅ ไม่ติดลิขสิทธิ์ SwissEph (ใช้ elements PD ของ Witte เอง) · เก็บโค้ดปิดได้ฟรี
- ✅ deterministic ตรงกฎข้อ 9 · footprint เล็ก (แค่ตาราง elements)
- ⚠️ Effort กลาง–สูง: ต้อง implement Kepler (solve eccentric anomaly) + แปลง heliocentric→geocentric + ตรวจเทียบ golden กับ SwissEph/ซอฟต์แวร์ยูเรเนียน
- ⚠️ ต้อง OCR/สกัด elements จากคัมภีร์ Witte (ดู `90-buy-list.md` — ฉบับ PD ต้องซื้อเล่ม/สแกน)

> เชิงกลยุทธ์: ถ้าต้องการ **แค่ TNP 4 ดวง** และเลี่ยงทั้งค่า license + footprint SwissEph → เส้นทาง "Kepler จาก Witte-PD-elements" น่าสนกว่าในระยะยาว แต่ลงแรง implement+verify มากกว่า · ถ้าต้องการ TNP + fixed stars + houses ครบชุดเร็ว → ซื้อ SwissEph commercial 700 CHF คุ้มกว่า

---

## 3. ข้อเสนอ (ผมเสนออะไร + เหตุผล)

1. **ทำ Parallel/Deklination ก่อน** — ข้อมูลพร้อม (0 lib, 0 บาท, อยู่ในขนบ Witte แท้ที่เขียนบทเดคลิเนชันเอง) = ปลดล็อกมิติที่ 2 ให้ AI ทันที คุ้มสุด
2. **True Node** — อัปจาก mean → true ด้วย astronomy-engine เดิม (ไม่เพิ่ม lib) ระหว่างทาง
3. **TNP** — เป็น decision ของเจ้านาย: (ก) ซื้อ SwissEph commercial 700 CHF จ่ายครั้งเดียว (เร็ว/ครบ) หรือ (ข) เขียน Kepler จาก Witte-PD-elements (ฟรี/โค้ดปิดได้/ลงแรงมาก) — ผมเอนเอียงทาง (ก) ถ้าต้องการเปิดฟีเจอร์เร็ว, ทาง (ข) ถ้าเน้นเลี่ยงลิขสิทธิ์+footprint ระยะยาว
4. Vertex/EastPoint/Part of Fortune/Fixed stars/Lilith = **ยังไม่ต้องทำ** (นอกแกน Witte แท้ · คุ้มค่าต่ำ)

> ทุกข้อยังเป็นแผนสำรวจ — การแตะโค้ด/เพิ่ม dependency ต้องผ่านกฎ AGENTS (ตอบ 5 ข้อ · phase · golden · review "พ่อ") ก่อนเสมอ

---

## แหล่งอ้างอิง

- Swiss Ephemeris price list: https://www.astro.com/swisseph/swephprice_e.htm (unlimited 700 CHF, one-time)
- Swiss Ephemeris Professional License contract (June 2026): http://www.astro.com/swisseph/secont_e.pdf
- Swiss Ephemeris docs: https://www.astro.com/swisseph/swisseph.htm
- `sweph` npm (N-API, AGPL-3.0 wrapper): https://github.com/timotejroiko/sweph
- header body constants (SE_CUPIDO 40 … SE_POSEIDON 47): https://github.com/aloistr/swisseph/blob/master/swephexp.h
- ซอร์สภายในที่อ้าง: `src/lib/astro/uranian/engine.ts` · `src/lib/astro-core/ephemeris.ts` · `data/library/astro-canon/uranian/01-source-policy-conclusion.md` · `data/library/astro-canon/uranian/90-buy-list.md`
