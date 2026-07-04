# r2k-7 · ระบบเรือน (Häuser) + จุดส่วนตัวครบชุด — audit + ร่าง (READ-ONLY · ห้ามแก้โค้ด)

วันที่ 4 ก.ค. 2026 · ผู้ตรวจ: agent (จาวิส)
อ่านจริง: `src/lib/astro/uranian/{engine,packet,render,auslosung}.ts` ครบทุกบรรทัด + คัมภีร์ `10-witte-canon-de.md` (หมวด G/F/H verbatim) + audit ก่อนหน้า `r2j-1` (C-4 houses) · `r2j-2` (A1/A2/A3)
โจทย์: (ก) จุดส่วนตัวขาดตัวไหน + ร่างเพิ่ม · (ข) ระบบเรือนคำนวณได้เลยไหมจาก Asc/MC ที่มี + house-meaning จากคัมภีร์ + ร่าง หรือระบุว่าเฟสหน้า

> **ความซื่อสัตย์:** ยืนยัน "มี/ไม่มีในโค้ด" 100% จากการอ่าน engine ครบ · citation เยอรมัน = verbatim จาก `10-witte-canon-de.md` (ซึ่งกลั่นจากสแกน r2c PDF) · **เอกสารนี้เป็นร่าง/audit ไม่แตะโค้ด** ตามคำสั่ง

---

## สรุปผู้บริหาร (2 บรรทัด)

1. **จุดส่วนตัว:** ปัจจุบันมี **6** (`☉ ☽ MC Asc Node(mean) AriesPoint`) — **ขาด 4**: จุดสี่ทิศอีก 3 มุม (0°♋ / 0°♎ / 0°♑) + **astronomische Länge des Ortes = Asc − 90°** (จุด "สถานที่" ของ Witte) · 3 มุมสี่ทิศ = ค่าคงที่เพิ่มได้ทันที (ไม่ใช้เวลาเกิด) · Asc−90 = เพิ่มได้เมื่อมีเวลาเกิด
2. **ระบบเรือน:** engine **ไม่คำนวณเรือนเลย** แม้มีเวลาเกิด → flag `"houses"` ใน `forbiddenFieldsWhenNoTime` = **false comfort** (ห้ามของที่ไม่เคยมี) · แต่คัมภีร์หมวด G ให้สูตรครบ 3 ระบบ · **เรือนของดาว/อาทิตย์ (chaldäisch) คำนวณได้ทันทีโดยไม่ต้องมีเวลาเกิด** (เรขาคณิตลองจิจูดล้วน) → ปลดล็อก verbatim PD ที่คมที่สุดที่เรามี (Hades I–XII บท 40 · Jupiter im VIII. der Sonne บท 42)

---

# (ก) จุดส่วนตัว (personal points)

## สถานะปัจจุบัน — 6 จุด (engine.ts:311–321)

```
personalPoints = [ Sun, Moon, Meridian(MC), Ascendant, Node(mean · Meeus), AriesPoint(0°♈) ]
```
- ไม่มีเวลาเกิด → Meridian/Asc หลุด → เหลือ **4** (☉ ☽ Node AriesPoint)
- ใช้ที่: `auslosung.ts:135` เป็น "เป้าไวกำเนิด" ของชั้นเวลา (Auslösung) — จุดไวที่ถูกดาวจร/ส่วนโค้งอาทิตย์กระตุ้น
- **หมายเหตุ:** personalPoints เป็น `additive` (ไม่ push เข้า `points[]`) → ไม่กระทบ halbsummen/pictures/sensitive (คงจำนวน 10/12 เดิม) — นี่คือสาเหตุที่ Node/AriesPoint ยัง**ไม่**เป็น generator ในภาพดาว (= gap A4 ของ r2j-2 · คนละเรื่องกับ r2k-7)

## จุดที่ขาด — 4 จุด (พร้อมคัมภีร์รองรับ)

| # | จุดที่ขาด | ค่า | ต้องมีเวลาเกิด? | คัมภีร์ (verbatim) |
|---|---|---|---|---|
| P1 | **Krebspunkt (0°♋)** | 90° คงที่ | ❌ ไม่ต้อง | บท 41: „Das Planetenbild des Mondes wird vom **Krebspunkte** an gerechnet" · บท 27 กฎตาย „Kardinalpunkten" |
| P2 | **Waagepunkt (0°♎)** | 180° คงที่ | ❌ ไม่ต้อง | บท 27 „1. Planeten an den **Kardinalpunkten V und =** bringen Todesfälle" (V=Widder, ==Waage = แกนวิษุวัต) |
| P3 | **Steinbockpunkt (0°♑)** | 270° คงที่ | ❌ ไม่ต้อง | บท 41: „die Sonne ihren **Gravitationspunkt im Steinbockpunkte** hat" · = ปลายแกน Erdmeridian (แกนที่ antiscia สะท้อนรอบ) |
| P4 | **astronomische Länge des Ortes = Asc − 90°** | Asc − 90° | ✅ ต้องมี Asc | บท 43: „Aszendent — 90° ist die **astronomische Länge des Ortes**" · บท 32: „tritt im Horoskop als „**Aszendent — 90°**" … auf" · บท 36: „vom … von der astronomischen Länge des Geburtsortes an (Aszendent — 90°)" |

**เหตุผลเชิงระบบ (ทำไมสำคัญ ไม่ใช่แค่เติมให้ครบ):**

- **P1–P3 (แกนสี่ทิศครบ / Kardinalkreuz):** ปัจจุบันมี AriesPoint (0°♈) มุมเดียว · Witte ใช้ **แกนสี่ทิศครบชุด** เป็นแกนอ้างหลัก — บท 02: „der **Widderpunkt, das X. Haus und der Ascendent sind gleichwertig** zu behandeln" · โดยเฉพาะ **0°♋/0°♑ = แกน Erdmeridian** ที่ `antisciaLon = 180 − lon` สะท้อนรอบ (engine.ts:241) — ตอนนี้แกนนั้นเป็นแค่ "ค่าในสูตร" ไม่ใช่ "จุดจริง" ที่ดาวจะไปตกกระตุ้นได้ · เติมแล้ว Auslösung จับ "ดาวจรแตะจุดสี่ทิศ" (กฎตายบท 27) ได้
- **P4 (Ort):** Witte แยกชัดว่า Asc−90 = "ตัวแทนสถานที่/เหตุการณ์กับคนอื่น" — บท 43: „In welchem Hause **des Ortes** stehen die Planeten" + „Der Mond ist der Vertreter der astronomischen Länge des Ortes" · บท 36 เจาะ: จุดกระจกรอบ Ort ⇒ „Verbindungen mit anderen", รอบ MC ⇒ „körperliche/seelische Ereignisse" → P4 เป็น **anchor ของมิติ "ความสัมพันธ์กับผู้อื่น"** ที่ตอนนี้หายทั้งหมด

## ร่างเพิ่ม (draft · additive · แนวเดียว engine.ts:320–321)

> ⚠️ ร่างเพื่อรีวิว — ยังไม่ implement. รูปแบบตาม `anglePoint(name, lon, dtUTC)` ที่มีอยู่แล้ว

```ts
// เพิ่มใน NAME_TH / NAME_DE (engine.ts:25–37)
CancerPoint:    { th: "จุดกรกฎ (Krebspunkt · 0°♋ · แกน Erdmeridian บน)", de: "Krebspunkt" },
LibraPoint:     { th: "จุดตุล (Waagepunkt · 0°♎)",                       de: "Waagepunkt" },
CapricornPoint: { th: "จุดมังกร (Steinbockpunkt · 0°♑ · แกน Erdmeridian ล่าง)", de: "Steinbockpunkt" },
LocationPoint:  { th: "ลองจิจูดสถานที่ (astr. Länge d. Ortes · Asc−90°)", de: "astronomische Länge des Ortes" },

// ต่อจาก personalPoints.push(anglePoint("AriesPoint", 0, dtUTC)); (engine.ts:321)
personalPoints.push(anglePoint("CancerPoint", 90, dtUTC));
personalPoints.push(anglePoint("LibraPoint", 180, dtUTC));
personalPoints.push(anglePoint("CapricornPoint", 270, dtUTC));
if (hasTime) {                                    // P4 ต้องมี Asc
  const ascP = byName("Ascendant");
  if (ascP) personalPoints.push(anglePoint("LocationPoint", norm360(ascP.lon - 90), dtUTC));
}
```
- **ผลข้างเคียง:** personalPoints เพิ่ม → เป้า Auslösung เพิ่ม (auslosung.ts:135 วน `chart.personalPoints` อยู่แล้ว dedupe ตามชื่อ) → ไม่แตะ points/pictures/sensitive · ต้อง verify auslosung ไม่ระเบิดจำนวน event (cap ที่มีอยู่รับได้ไหม)
- **effort: ง่ายมาก** (เพิ่ม 4 จุดคงที่ + map ชื่อ · P1–P3 ไม่แตะ hasTime · P4 ใต้ `if(hasTime)`) — แต่ต้อง regression test ชั้นเวลา (auslosung golden) + ยืนยัน render พิมพ์จุดใหม่ถูก

---

# (ข) ระบบเรือน (Häuser)

## สถานะปัจจุบัน — ไม่มีเลย (แม้มีเวลาเกิด)

- engine มีแค่ MC/Asc **เป็นจุด** (`anglePoint`) — **ไม่มี house cusp / ไม่มีการ map ดาวเข้าเรือน** สักตัว (grep ยืนยัน: ไม่มี identifier `haus/house/cusp/erdhaus` ใน engine.ts เลย)
- `packet.ts:66` `FORBIDDEN_FIELDS_NO_TIME = [..., "houses"]` → **false comfort**: สั่งห้ามอ่าน "houses" เมื่อไม่มีเวลา ทั้งที่**ไม่เคยมี** houses ให้อ่านตั้งแต่แรก (มีเวลาก็ไม่มี)
- `11-method-reading-uranian.md` (พจนานุกรม) — **ไม่มีเนื้อเรือน** เลย (grep = 0)

## คัมภีร์ให้เรือน 3 ระบบ (หมวด G · verbatim ครบ)

| ระบบ | นับจาก | ขนาด | หน่วย | รอบ | คำนวณได้เลยไหม |
|---|---|---|---|---|---|
| **R1 · เรือนของดาว/อาทิตย์ (chaldäisch)** | ตัวดาวเอง (☉ หรือดาวใด ๆ = ยอดเรือน IV) | 30° เท่ากัน | **สุริยวิถี (ลองจิจูด)** | รายดวง (static) | ✅ **ได้ทันที · ไม่ต้องมีเวลาเกิด** |
| **R2 · เรือนของ Aszendent** | Asc − 90° (astr. Länge d. Ortes) | 30° เท่ากัน | สุริยวิถี | รายปี (ดวงอาทิตย์เดินราศี) | 🟡 ต้องมีเวลาเกิด (ใช้ Asc) — เรขาสุริยวิถีล้วน |
| **R3 · เรือนของ Geburtsmeridian** | MC (บนเส้นศูนย์สูตร) | 30° เท่ากัน | **เส้นศูนย์สูตร (RA)** | รายวัน (2 ชม./เรือน) | 🟡 ต้องมีเวลาเกิด (ใช้ MC/RAMC) — ต้องแปลงพิกัดศูนย์สูตร |

### R1 · เรือนของดาว/อาทิตย์ (chaldäisch) — คำนวณได้เลย ไม่ต้องมีเวลาเกิด ⭐

บท 08 (verbatim):
> „es ist jetzt die Sonne als der untere Meridian, als **Spitze des IV. Hauses** zu betrachten. Die Planeten, welche bis zu **30° östlich der Sonne** stehen, liegen dann **im IV. Hause der Sonne**, ein Planet, welcher **135° östlich der Sonne** steht, würde **im VIII. Hause der Sonne** stehen."

**สูตร deterministic (ลองจิจูดล้วน · ไม่ใช้เวลาเกิด):**
```
delta = (targetLon − bodyLon) mod 360      // ระยะ "ตะวันออกของ" ดาวฐาน (ลองจิจูดเพิ่ม)
house = ((floor(delta / 30) + 3) mod 12) + 1   // ดาวฐาน = ยอดเรือน IV
```
พิสูจน์: delta 0–30 → floor 0 → (0+3)%12+1 = **IV** ✓ · delta 135 → floor 4 → (4+3)%12+1 = **VIII** ✓ (ตรงคัมภีร์เป๊ะ)
- „nur beziehen sich alle Deutungen auf die **Radixsonne**" (บท 08) — ความหมายอิงดวงอาทิตย์กำเนิด ไม่ใช่ Geburtsmeridian
- **จุดขาย:** ทุกดาว/จุดที่ engine มี (10 ดวง + จุดส่วนตัว) มีลองจิจูดครบแล้ว → คำนวณ "ดาว X อยู่เรือนที่เท่าไรของ ☉/ดาวอื่น" ได้ทันทีแม้ user ไม่ให้เวลาเกิด · บท 41: „**Jeder Planet** nennt … die ganze Skala der Planeten von der Sonne an sein eigen" (ทุกดาวมี horoscope ของตัวเอง)

### R2 · เรือนของ Aszendent (รายปี) — ต้องมีเวลาเกิด

บท 36/32 (verbatim):
> „Die Häuser des Ascendenten, **vom … von der astronomischen Länge des Geburtsortes an (Aszendent — 90°), je zu 30° auf der Ekliptik**, beziehen sich auf die laufende Sonne durch die Zeichen." (บท 36, S.44)

**สูตร:** ยอดเรือน I = Asc − 90° (= P4 ด้านบน) · เรือน = 30° เท่ากันบนสุริยวิถี → `house = floor(((targetLon − (Asc−90)) mod 360)/30)+1` · ใช้ Asc → **ต้องมีเวลาเกิด** · „gelten … für das **Jahr**" (รายปี)

### R3 · เรือนของ Geburtsmeridian (รายวัน) — ต้องมีเวลาเกิด + แปลงพิกัดศูนย์สูตร

บท 08 (verbatim):
> „Es wird **vom Meridian an der Aequator in 12 gleiche Teile, zu je 30°** eingeteilt … sodaß die Häuser **je 2 Stunden** nach der Geburtsminute … angeben. Die ersten beiden Stunden … ist das **X. Haus**."

**นัย:** ยอดเรือน X = MC · แบ่ง 30° **บนเส้นศูนย์สูตร (RA)** ไม่ใช่สุริยวิถี → ต้องใช้ RAMC + แปลงกลับเป็นสุริยวิถี (ต่างจาก R1/R2) · „für den **Tag**" (รายวัน · 2 ชม./เรือน) · **ซับซ้อนสุดใน 3 ระบบ** (ต้อง astro-core แปลง equator↔ecliptic — มี `declinationFromEcliptic` อยู่แล้ว แต่ต้องเพิ่ม RA/oblique-ascension)

## house-meaning จากคัมภีร์ — มีแค่บางส่วน verbatim (ที่เหลือ = ต้องพจนานุกรมสังเคราะห์)

| ชุดความหมาย | คลุมอะไร | สถานะ PD | คัมภีร์ |
|---|---|---|---|
| **Hades I–XII** | Hades ในเรือน 1–12 **ครบทั้ง 12** | ✅ **verbatim เต็ม** (ใกล้พจนานุกรมสุดที่เรามี) | บท 40, S.78/222 |
| กฎเรือนเจาะ (house-rules) | „Jupiter im VIII. Hause der Sonne = Tod von Königen" · „Mars im VII. des Mondes = Gatten weibl. Personen" · „Neptun im I. = Ehen" · „Uranus im V. = männl. Nachkommen" · „Cupido+Jupiter im III. = Dokumente" | ✅ verbatim (เฉพาะคู่/เรือนที่ยกมา) | บท 42, S.139 |
| ตัวอย่างเรือน VIII | „D, Z, ® im VIII. Erdhause zeigt den Tod einer mütterlichen Frau" | ✅ verbatim (Fraktur เพี้ยน เทียบสแกน) | บท 12, S.42 |
| **ความหมาย 12 เรือน × ทุกดาว (ครบตาราง)** | ตารางเต็ม (เช่น ☿ ในเรือน 3 ทั่วไป) | ❌ **ไม่ใช่ PD** (= Regelwerk/Rudolph ลิขสิทธิ์) → ต้อง "การอ่านเชิงวิธี" สังเคราะห์เอง | — |

**ข้อควรระวัง (r2j-2 ข้อ 5 ย้ำ):** การ map เรือนต้องใช้นิยาม **chaldäisch** ของ Witte (บท 08: ดาวฐาน = ยอดเรือน **IV**) **ไม่ใช่** เรือนดวงเดิมแบบ Placidus/Whole-sign — เดาผิด = ความหมายเพี้ยนทั้งชุด

## ร่าง (draft) — ระบบเรือน

> ⚠️ ร่างเพื่อรีวิว · แนะนำทำ **R1 ก่อน** (คุ้มสุด/แตะโค้ดน้อยสุด/ไม่ต้องมีเวลาเกิด)

**ร่าง R1 (chaldäisch · ทำได้เลย):**
```ts
export type UranianHousePlacement = {
  frame: string;        // ดาวฐาน (เจ้าของชุดเรือน) เช่น "Sun"
  frameTh: string;
  occupant: string;     // ดาว/จุดที่ตกในเรือน
  occupantTh: string;
  house: number;        // 1..12 (โรมัน I..XII)
  system: "chaldaic_body";  // R1
  canonRef: string;     // "บท 08/41"
};
// วนดาวฐาน = ☉ (+ ทางเลือก: ดาวอื่น ตาม บท 41 "jeder Planet") × occupant ทุกดาว → house จากสูตรบน
// เริ่มที่ frame = Sun เท่านั้น (คุมขนาด · house-rule verbatim ที่มีล้วนอิง "der Sonne")
```
- ใส่ลง packet `data.housePlacements` (additive) · render บล็อกใหม่ "— เรือนของดวงอาทิตย์ (chaldäisch · บท 08) —" + ยก Hades I–XII verbatim (บท 40) เมื่อ occupant/frame มี Hades (ได้แล้วหลัง r391 TNP มีตำแหน่ง)
- **effort R1: กลาง** (สูตร 1 บรรทัด + type + render + ยึด frame=☉ ก่อน กัน combinatorial) — canon พร้อม (บท 08/40/42 verbatim) · **ไม่ต้องมีเวลาเกิด** → ใช้ได้กับ user ทุกคน · **ต้องถอด `"houses"` ออกจาก false-comfort หรือแยก R2/R3 เป็น field ที่ห้ามจริงเมื่อไม่มีเวลา**
- **effort R2: กลาง** (เพิ่ม P4=Asc−90 ก่อน แล้ว equal-house สุริยวิถี · ใต้ `if(hasTime)`)
- **effort R3: ยาก** (ต้อง RAMC + แปลง equator↔ecliptic 30°/เรือน · ใต้ `if(hasTime)`) — ทำหลังสุด

---

# สรุปข้อเสนอ + ลำดับความคุ้ม (effort × คุณค่า × ความพร้อม canon)

| ลำดับ | สิ่งที่ทำ | effort | ต้องมีเวลาเกิด | canon | คุณค่า |
|---|---|---|---|---|---|
| 1 | **P1–P3 จุดสี่ทิศครบ** (0°♋/♎/♑) | ง่ายมาก | ❌ | ✅ บท 02/27/41 | กลาง (ปลุกแกน Erdmeridian/กฎตายบท 27) |
| 2 | **R1 เรือนของ ☉ (chaldäisch)** + ยก Hades I–XII / house-rule verbatim | กลาง | ❌ | ✅ บท 08/40/42/12 | **สูงสุดเชิงเนื้อ** (verbatim PD คมสุดที่มี · ใช้กับ user ทุกคน) |
| 3 | **P4 Ort (Asc−90)** | ง่าย | ✅ | ✅ บท 43/32/36 | กลาง-สูง (anchor มิติ "คนอื่น" + เป็นยอดเรือน R2) |
| 4 | **R2 เรือนของ Aszendent** | กลาง | ✅ | ✅ บท 36/32 | กลาง |
| 5 | **R3 เรือนของ Geburtsmeridian** | ยาก (RA) | ✅ | ✅ บท 08 | กลาง (จับ "วัน" · ซับซ้อนพิกัด) |
| — | แก้ `"houses"` false comfort ใน packet.ts:66 | — | — | — | ต้องทำคู่กับ R1–R3 (อย่าห้ามของที่เพิ่งสร้าง) |

**คำแนะนำของผม (จาวิส):** ทำ **#1 + #2 ก่อนเป็นชุดเดียว** — ทั้งคู่ **ไม่ต้องมีเวลาเกิด** (ครอบ user ไทยที่ไม่รู้เวลาเกิดจำนวนมาก) · canon verbatim พร้อม · R1 ปลดล็อก house-rule PD ที่คมสุด (Hades I–XII · Jupiter im VIII. der Sonne) ที่ตอนนี้ "มีความหมายลอย ๆ ในคัมภีร์แต่ไม่มีที่ให้ใช้" · #3–#5 (ต้องมีเวลา) ต่อเป็นเฟสถัดไป

**สิ่งที่ยังไม่ยืนยัน (บอกตรง):** R3 „auf dem Aequator" ต้องตีความว่าแบ่ง 30° ใน RA (right ascension) แล้ว project กลับสุริยวิถี — เป็นการอนุมานจากถ้อยคำ „an der Aequator … je 2 Stunden" · ยังไม่มี golden/worked example ในคัมภีร์ที่ระบุตัวเลขให้เทียบตรง → **ห้าม implement R3 ก่อนหา worked example หรือเทียบซอฟต์แวร์ Uranian อ้างอิง**
