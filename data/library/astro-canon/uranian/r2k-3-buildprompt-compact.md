# r2k-3 · Uranian branch ใน build-prompt.ts — compact packet ตัด field อะไร → "ส่งไม่ครบ" ตรงไหน

READ-ONLY audit (ไม่แก้โค้ด) · ยืนยันจากบรรทัดจริงใน `src/lib/fusion5/build-prompt.ts` (2891 บรรทัด) + `src/lib/astro/uranian/{packet,render,engine}.ts`

---

## 0) สรุปสั้น (ฟันธง)

- prompt ยูเรเนียน 1 ก้อน = **prose (`renderUranianPrompt`) + `\n\nSTRUCTURED_CHART_PACKET:\n` + compact JSON (`structuredPacketJson`)** — `build-prompt.ts:2588`.
- **compact JSON ตัดของทิ้งเยอะจริง** (ทั้งชั้นเวลา Auslösung + ทั้งชั้น TNP + halbsummen ดิบ + scalar หลายตัว) — `build-prompt.ts:2519–2544`.
- **แต่ prose ไม่ได้ตัดตาม** — `renderUranianPrompt` ยัง render Auslösung (บรรทัด 180–209), TNP (152–174), node mean/true (145–146), tnpPrecisionNote (151) ครบ → ของที่ compact ตัด ส่วนใหญ่ **ยังถึง AI ทาง prose** (คอมเมนต์ใน `packet.ts:62` ที่ว่า "render.ts ไม่อ่าน auslosung" = **ล้าสมัย/ผิด** · render อ่านจริงที่ 180).
- จุดที่ "**ส่งไม่ครบจริง**" (หายจากทั้ง prose และ compact) มี 2 แบบ:
  1. **หางรายการที่เกิน cap ของ prose** สำหรับ field ที่ compact **ตัดทิ้ง** (Auslösung + TNP) → prose cap เป็น **hard cap** ไม่มี JSON สำรอง.
  2. **halbsummen ดิบ** (แกนกึ่งกลางที่ยังไม่มีดาวตก) — ตัดทั้งสองที่ (ตั้งใจ).
- **budget `FUSION_PANEL_PROMPT_MAX_CHARS`=118,000 ไม่ได้ตัด packet** — loop ย่อ (2755–2760) ย่อ **คัมภีร์ (canon text)** อย่างเดียว. compact เป็นการลดรูป **แบบตายตัว (unconditional)** ใน `structuredPacketJson` ไม่ปรับตาม budget.
- **bookMode ส่ง chart packet เท่า Q&A เป๊ะ** (packet เดียวกัน) — ต่างแค่ "คำถาม→directive อ่านเต็ม" + เลือกคัมภีร์กว้างขึ้น. **bookMode ไม่ช่วยให้ packet ครบขึ้น.**

---

## 1) จุดที่เกิด compact — `structuredPacketJson()` สาขา uranian

`build-prompt.ts:2515–2545` (คอมเมนต์ผู้เขียนเอง 2518: *"ตัด halbsummen ดิบทั้งชุด … กัน budget"*).

เทียบกับ full packet ที่ `buildUranianPacket` สร้าง (`packet.ts:23–121`):

### 1a) Scalar ระดับบนสุด

| field (full packet) | compact | prose ครอบไหม | net |
|---|---|---|---|
| discipline, packetVersion, hasBirthTime, degradeLevel | ✅ เก็บ | — | ครบ |
| orbPictureDeg / orbSensitiveDeg / orbAntisciaDeg / orbParallelDeg / orbFourPlanetDeg | ✅ เก็บ | ✅ (52,120,131) | ครบ |
| tnpPositionSource, excludedTransneptunians, notAvailable | ✅ เก็บ | ✅ (175) | ครบ |
| nodeMeanLon, nodeTrueLon | ✅ เก็บ | ✅ (145–146) | ครบ |
| **birthTimeMode** | ❌ ตัด | ✅ prose "เวลาเกิด:" (51) | ครบทาง prose |
| **gender** | ❌ ตัด | ❌ prose ไม่พิมพ์ | **หายจาก packet** (ยูเรเนียนใช้น้อย · แต่หายจริง) |
| **moonUncertainty** | ❌ ตัด | ✅ (51,76–78) + warn 2722 | ครบทาง prose |
| **forbiddenFieldsWhenNoTime / allowedFieldsWhenNoTime** | ❌ ตัด | ✅ เชิงข้อความ (76–78) | ครบเชิงความหมาย (รายชื่อ field ดิบหาย) |
| **tnpPositionSourceKepler** | ❌ ตัด | ~ (150 พูดถึง Kepler) | เกือบครบ |
| **tnpPrecisionNote** | ❌ ตัด | ✅ (151 พิมพ์ทั้งสตริง) | ครบทาง prose |
| **nodeType ("mean")** | ❌ ตัด | ✅ (145 "mean") | ครบทาง prose |
| **auslosung (ทั้ง object)** | ❌ **ตัดทั้งก้อน** | ✅ prose (180–209) แต่ **cap** | ดูข้อ 2 |

### 1b) `data.*` — รายการดาว/ภาพดาว

compact map เฉพาะบาง field ต่อ item (ไม่ slice จำนวน → เก็บ **ครบทุกแถว** แต่ field น้อยลง):

| data.field | compact | field ที่ **ตัดต่อ item** | prose |
|---|---|---|---|
| `points` | ✅ `[name,signTh,signDeg,dial90,decl,uncertain]` | ตัด `nameTh, nameDe, kind, lon, sign` (engine.ts:64–76) | prose พิมพ์ nameTh/nameDe/ราศี/dial90/decl (71–75) |
| `planetaryPictures` | ✅ `[pair,occupant,orbDeg,touchesPersonal]` | ตัด `pairTh,occupantTh,formula,applyingNote` (engine.ts:89–98) | prose พิมพ์ Th + formula (88) แต่ **cap 40** (87) |
| `fourPlanetPictures` | ✅ `[pairA,pairB,orbDeg,touchesPersonal]` | ตัด `pairATh,pairBTh,planets,planetsTh,midDial90,canonRef` | prose Th (99) **cap 24** (98) |
| `sensitivePoints` | ✅ `[kind,a,b,activatedBy,orbDeg,touchesPersonal]` | ตัด `aTh,bTh,pointLon,pointSignTh,pointSignDeg,activatedByTh` | prose Th+pointLon (112) **cap 40** (110) |
| `antiscia` | ✅ `[kind,a,b,orbDeg,touchesPersonal]` | ตัด `axisTh,aTh,bTh,pointLon,pointSign*,canonRef` | prose (125) **cap 24** (123) |
| `declinationPairs` | ✅ `[kind,a,b,orbDeg,touchesPersonal]` | ตัด `aTh,bTh,declA,declB` | prose+decl (138) **cap 24** (136) |
| `witteTransneptunians` | ✅ `[name,rulerSignDe,canonRef]` | (static list) | — |
| **`halbsummen`** | ❌ **ตัดทั้งชุด** | — | **prose ไม่ render ด้วย** → หายจริง (ตั้งใจ) |
| **`personalPoints`** | ❌ ตัด | — | prose ไม่แยกกลุ่ม แต่มีใน `points`+flag touchesPersonal → เชิงข้อมูลไม่หาย |
| **`tnpPoints`** | ❌ **ตัด** | ✅ prose (152–156) — ไม่มี cap ตรงนี้ | ครบทาง prose |
| **`tnpPlanetaryPictures`** | ❌ **ตัด** | ✅ prose (162–167) **cap 20** | หางเกิน 20 หายจริง |
| **`tnpSensitivePoints`** | ❌ **ตัด** | ✅ prose (168–174) **cap 20** | หางเกิน 20 หายจริง |
| **`tnpNotComputable`** | ❌ ตัด | ✅ prose (158–160) | ครบทาง prose |
| **`tnpElementsMissing`** | ❌ ตัด | ~ (162 ทางอ้อม) | เกือบครบ |

---

## 2) "ส่งไม่ครบ" ตัวจริง = หางรายการที่เกิน cap ของ prose + compact ตัดทิ้ง

หลักการ: field ไหนที่ **compact ยังเก็บ** (points, planetaryPictures, sensitivePoints, antiscia, declinationPairs, fourPlanetPictures) → prose cap 40/24 ก็ไม่เป็นไร เพราะ **หางไปโผล่ใน compact JSON ครบทุกแถว** (แค่ field น้อย). แต่ field ที่ **compact ตัดทิ้ง** → **prose cap = เพดานแข็ง ไม่มีสำรอง**:

| ชั้นข้อมูล | prose cap (บรรทัด) | compact สำรอง | หางที่ **หายถาวร** |
|---|---|---|---|
| **Auslösung groups** (จุดไวถูกปลุก) | `groups.slice(0,8)` (188) | ❌ ไม่มี | group ที่ 9+ |
| ↳ events ต่อ group | `events.slice(0,5)` (191) | ❌ | event ที่ 6+ ต่อจุด |
| ↳ tnpActivations | `slice(0,6)` (198) | ❌ | อันที่ 7+ |
| ↳ tnpMoverContacts | `slice(0,6)` (204) | ❌ | อันที่ 7+ |
| **tnpPlanetaryPictures** | `slice(0,20)` (164) | ❌ | ที่ 21+ |
| **tnpSensitivePoints** | `slice(0,20)` (170) | ❌ | ที่ 21+ |
| **halbsummen ดิบ** | ไม่ render | ❌ | ทั้งชุด (แกนกึ่งกลางที่ยังไม่มีดาวตก — ตั้งใจตัด) |

ผลกระทบจริง: **ชั้นเวลา (Auslösung) คือคำตอบ "ตกวัน/เดือนไหน"** (คอมเมนต์ 184: *"ตอบวัน/เดือนได้จากรายการนี้เท่านั้น"*). เมื่อดวงมีจุดไวถูกปลุกเกิน 8 กลุ่ม หรือเกิน 5 เหตุการณ์/กลุ่มในปีเป้าหมาย → เหตุการณ์ timing ที่เกิน cap **ไม่ถึง AI เลย** เพราะ compact ตัด auslosung ทิ้งหมด. นี่คือจุด "ส่งไม่ครบ" ที่กระทบความแม่นของ DaySniper/ชั้นเวลามากสุด.

---

## 3) budget `FUSION_PANEL_PROMPT_MAX_CHARS` ตัดอะไร (ไม่ใช่ตัด packet)

- ค่า = **118,000** (`build-prompt.ts:54`). CANON_TEXT_MAX=56,000 / MIN=4,000 (49–50).
- loop ย่อ (2755–2760): เกิน budget → ลด `maxCanon` แล้ว reload **คัมภีร์** เท่านั้น → **ย่อ canon text ไม่ใช่ chart packet**.
- ถ้ายังเกินหลัง canon min: fallback ตัดกลาง head 12,000 + tail (2761–2766). ลำดับ assemble: header→canon→**ผังดวง(packet)**→pair/multiyear→คำถาม (2695–2749) → packet อยู่ค่อนท้าย ปกติรอด · จะโดนก็ต่อเมื่อ canon(min)+packet รวมทะลุ 118K (เสี่ยงเฉพาะดูกลุ่มหลายคน).
- **สรุป: การ "ลดรูป packet" ไม่ได้มาจาก budget** — มันฝังตายตัวใน `structuredPacketJson` เสมอ (ทุก request) เพื่อกันขนาด JSON บวม. budget ไปเบียด **คัมภีร์** ต่างหาก.

---

## 4) bookMode ส่งครบกว่า/น้อยกว่า Q&A ไหม

**เท่ากันเรื่อง chart packet** (`build-prompt.ts:2688–2691, 2727, 2742–2749`):
- bookMode ต่างจาก Q&A แค่: (ก) `effectiveQuestion` = book directive แทนคำถาม → ใช้ **เลือกคัมภีร์** (`selectCanonFilesForPrompt`) ให้ครอบทุกมิติ (2693) · (ข) ต่อท้ายด้วย directive อ่านเต็ม + format บท (2744–2745) แทนบล็อกคำถาม.
- `renderChartForScience(science, b, timingRef.refDate)` (2727) **ถูกเรียกเหมือนกันทั้งสองโหมด** → prose+compact **เหมือนกันเป๊ะ**.
- ⟹ bookMode **ส่งคัมภีร์กว้างกว่า** แต่ **chart packet ครบเท่ากัน** → bookMode **ไม่แก้** ปัญหา compact ตัด field.

---

## 5) ร่างวิธีแก้ (ส่งครบขึ้นโดยไม่ทะลุ budget · ยังไม่แก้โค้ด — รอเจ้านายเคาะ)

เรียงจากคุ้มสุด → เสริม:

1. **[คุ้มสุด · ตรงปัญหา timing] เลิกตัด `auslosung` ออกจาก compact — ใส่กลับแบบ compact array**
   ปัญหาหลักคือหาง Auslösung เกิน cap prose. เพิ่มใน compact JSON (structuredPacketJson uranian) เป็น array ย่อ เช่น
   `auslosung.groups → [targetTh, formula, signTh, signDeg, natalOrbArcmin, events:[dateISO,moverTh,aspectTh,orbArcmin]]`
   ให้ AI เห็นเหตุการณ์ครบทั้งปี (ต้นทุน chars ต่ำเพราะเป็นตัวเลข/โค้ดสั้น ไม่ใช่ prose ไทย). แก้ "ตกวันไหน" ได้เต็ม.

2. **[ตรงข้อ 2] เพิ่ม `tnpPlanetaryPictures`/`tnpSensitivePoints`/`tnpActivations` แบบ compact array ใน JSON**
   ให้หางเกิน cap 20/6 ของ prose มีที่ลง (field ย่อเหมือน planetaryPictures compact เดิม).

3. **[ถ้าห่วง budget] ทำ compact เป็น adaptive แทนตายตัว**
   ปัจจุบัน compact ลดรูป *เสมอ*. เปลี่ยนเป็น: ถ้า `prompt.length` ยังห่าง budget → ส่ง JSON เต็มฟิลด์มากขึ้น (หรือส่ง auslosung/tnp); ใกล้ budget ค่อยลด. ได้ครบเมื่อมีที่ว่าง โดยไม่ทะลุ.

4. **[ถ้าจะใช้ bookMode เป็นโหมด "ส่งเต็ม"] ให้ bookMode ส่ง compact แบบ full-field**
   เพิ่ม param เช่น `structuredPacketJson(packet, { full: bookMode })` → bookMode เลิก slice field ต่อ item + ใส่ auslosung/tnp ครบ (bookMode ไม่มีคำถามผู้ใช้ + มักรันเบื้องหลัง → รับ chars เพิ่มได้). ทำให้ "หนังสือดวง" อ่านครบทุกมิติจริงตามเจตนา r391-book.

5. **[กันหลุด] เพิ่ม `gender` + `halbsummen` (ย่อ) กลับเข้า compact** ถ้าต้องการให้ JSON self-contained (ตอนนี้พึ่ง prose).

> ทุกข้อเป็น **additive** ต่อ `structuredPacketJson` / call site — ไม่แตะ engine/packet builder/render. ก่อนแก้: ตอบ 5 ข้อ (BaZi 10 กติกา) + ประเมิน chars เพิ่มเทียบ 118K + ส่งพ่อรีวิว.

---

## 6) อ้างอิงบรรทัด (verify)

- compact uranian branch: `src/lib/fusion5/build-prompt.ts:2515–2545` (field map จริง)
- uranian ต่อ prose+JSON: `build-prompt.ts:2579–2588`
- budget const + shrink: `build-prompt.ts:54, 2752–2767`
- bookMode: `build-prompt.ts:2688–2691, 2727, 2742–2749`
- full packet: `src/lib/astro/uranian/packet.ts:23–121` (คอมเมนต์ 62 บอก "render ไม่อ่าน auslosung" = ผิด)
- prose render + cap + auslosung/tnp: `src/lib/astro/uranian/render.ts:71–75(points), 87/98/110/123/136(cap), 152–174(tnp), 180–209(auslosung)`
- type field ที่ถูกตัดต่อ item: `src/lib/astro/uranian/engine.ts:64–162`
