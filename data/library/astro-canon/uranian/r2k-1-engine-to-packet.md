# r2k-1 · uranian engine → packet: เทียบทีละ field (READ-ONLY)

> เป้าหมาย: หา field ที่ `uranianChart()` คำนวณ แต่ **หลุด** ไม่ถึง AI จน AI บ่นว่า "ผังส่งไม่ครบ"
> ยืนยันจากโค้ดจริง 3 ชั้น: `engine.ts` → `packet.ts` → (`render.ts` + `structuredPacketJson()` ใน `build-prompt.ts`)
> **ไม่แก้โค้ด** — เอกสารสำรวจ + ร่าง diff ให้เจ้านายรวมเขียนเอง

---

## ผลสรุปสั้น (ฟันธง)

1. **ชั้น `chart → packet.ts` = ครบแล้ว 100%** — `buildUranianPacket()` copy **ทุก field** ที่ `UranianChart` คืน (29/29) เข้า envelope ครบ ไม่มีตกหล่นแม้แต่ field เดียว → **packet.ts ไม่ต้องแก้ ไม่มี diff**
2. **จุดที่ "ผังส่งไม่ครบ" จริง อยู่ถัดจาก packet ไปอีกชั้น** = ตัวย่อ (compactor) ชื่อ `structuredPacketJson()` ใน `src/lib/fusion5/build-prompt.ts` (~บรรทัด 2515–2544) ที่ AI อ่านเป็น `STRUCTURED_CHART_PACKET:` — **ตัดสาขา TNP (r391) ทั้งก้อน + personalPoints + halbsummen ออกจาก JSON**
3. ที่ AI ยัง "พอเห็น" TNP อยู่บ้าง เพราะ `renderUranianPrompt()` (ข้อความร้อยแก้ว) ยัง render TNP ให้ — แต่ **JSON กับข้อความไม่ตรงกัน** (JSON ไม่มี TNP/personalPoints/halbsummen ที่ข้อความพูดถึง) = อาการคลาสสิกที่ทำให้โมเดลตอบว่า "structured packet ส่งมาไม่ครบ / ไม่มีข้อมูล X"

> ดังนั้น **diff ที่ต้องแก้ไม่ใช่ `packet.ts` แต่เป็น `structuredPacketJson()` ใน `build-prompt.ts`** (และเสริม render.ts เล็กน้อย) — ราย field + ร่าง diff อยู่ท้ายเอกสาร

---

## ตาราง A — ทุก field ที่ `UranianChart` คืน (engine.ts:178–209) เทียบ 3 ชั้น

คอลัมน์:
- **packet?** = อยู่ใน output ของ `buildUranianPacket()` ไหม (packet.ts)
- **prompt text?** = `renderUranianPrompt()` เอาไป render เป็นข้อความให้ AI ไหม (render.ts)
- **compact JSON?** = `structuredPacketJson()` ใส่ใน `STRUCTURED_CHART_PACKET` ที่ AI อ่านไหม (build-prompt.ts)

| # | field ใน UranianChart | packet? | prompt text? | compact JSON? | หมายเหตุ |
|---|---|:---:|:---:|:---:|---|
| 1 | `hasBirthTime` | ✅ top | ✅ | ✅ | |
| 2 | `degradeLevel` | ✅ top | – | ✅ | |
| 3 | `gender` | ✅ top | – | ❌ | เล็กน้อย |
| 4 | `points` (ดาว10+MC/Asc) | ✅ data | ✅ | ✅ | ครบ |
| 5 | `personalPoints` (☉☽MC Asc **Node AriesPoint**) | ✅ data | **❌** | **❌** | **หลุด** — ดูหมายเหตุ ★1 |
| 6 | `nodeType` | ✅ top | – | ❌ | มี nodeMean/True แทน |
| 7 | `nodeMeanLon` | ✅ top | ✅ | ✅ | |
| 8 | `nodeTrueLon` | ✅ top | ✅ | ✅ | |
| 9 | `halbsummen` (ครึ่งผลรวมทุกคู่) | ✅ data | **❌** | **❌** | **หลุดโดยตั้งใจ** (budget) ★2 |
| 10 | `planetaryPictures` | ✅ data | ✅ | ✅ | ครบ |
| 11 | `fourPlanetPictures` | ✅ data | ✅ | ✅ | ครบ |
| 12 | `sensitivePoints` | ✅ data | ✅ | ✅ | ครบ |
| 13 | `antiscia` | ✅ data | ✅ | ✅ | ครบ |
| 14 | `declinationPairs` | ✅ data | ✅ | ✅ | ครบ |
| 15 | `witteTransneptunians` (ตารางความหมายหมวด H) | ✅ data | ❌* | ✅ | *ข้อความไม่มีตารางนี้ แต่ compact JSON มี |
| 16 | `tnpPositionSource` (ป้าย legacy) | ✅ top | – | ✅ | |
| 17 | **`tnpPoints`** (Cupido/Hades/Kronos ตำแหน่งจริง r391) | ✅ data | ✅ | **❌** | **หลุดจาก JSON** ★3 |
| 18 | **`tnpPlanetaryPictures`** (ภาพดาวมี TNP ร่วม) | ✅ data | ✅ | **❌** | **หลุดจาก JSON** ★3 |
| 19 | **`tnpSensitivePoints`** (จุดไวมี TNP ร่วม) | ✅ data | ✅ | **❌** | **หลุดจาก JSON** ★3 |
| 20 | `tnpPositionSourceKepler` (ป้ายเฟส2) | ✅ top | – | ❌ | |
| 21 | `tnpPrecisionNote` (ความแม่น ±1–2°) | ✅ top | ✅ | ❌ | ข้อความมี |
| 22 | `tnpNotComputable` (Zeus + เหตุผล) | ✅ data | ✅ | ❌ | ข้อความมี |
| 23 | `tnpElementsMissing` (element ที่ขาด) | ✅ data | ❌ | ❌ | **หลุดทั้งคู่** (ย่อยของ Zeus) |
| 24 | `excludedTransneptunians` (Sieggrün) | ✅ top | ✅ | ✅ | |
| 25 | `orbPictureDeg` | ✅ top | ✅ | ✅ | |
| 26 | `orbSensitiveDeg` | ✅ top | ✅ | ✅ | |
| 27 | `orbAntisciaDeg` | ✅ top | ✅ | ✅ | |
| 28 | `orbParallelDeg` | ✅ top | ✅ | ✅ | |
| 29 | `orbFourPlanetDeg` | ✅ top | ✅ | ✅ | |

**สรุปคอลัมน์ packet?** = ✅ ครบ 29/29 → **packet.ts ไม่ตกหล่นอะไรเลย**

---

## หมายเหตุ (ทำไมถึง "ผังส่งไม่ครบ")

**★1 personalPoints หลุดจากทั้งข้อความและ JSON**
`personalPoints` = 6 จุดเป้าไวของชั้นเวลา (☉ ☽ Meridian Aszendent **Node** **AriesPoint/Widderpunkt 0°♈**).
- ☉☽MC/Asc ยังโผล่ในตาราง `points` → AI เห็น
- Node โผล่ผ่านบรรทัด "ปมจันทร์ (Mondknoten)" ในข้อความ → พอเห็น
- **AriesPoint (Widderpunkt 0°♈) ไม่โผล่ที่ไหนเลย** ทั้งข้อความและ JSON — ทั้งที่เป็นศูนย์อ้างอิงโลกที่ Witte ใช้หนัก → ถ้า AI จะอ่านภาพดาวเทียบ Widderpunkt มันจะบอกว่า "ไม่มีข้อมูล"

**★2 halbsummen ถูกตัดโดยตั้งใจ** (คอมเมนต์ในโค้ด build-prompt.ts:2518 เขียนชัด: "ตัด halbsummen ดิบทั้งชุด ... กัน budget")
เหตุผลใช้ได้: `planetaryPictures`/`sensitivePoints` = สรุปคู่ที่ "มีนัย" แล้ว → ครึ่งผลรวมดิบทุกคู่ (nC2) ยาวเกินงบ prompt. **แต่ควรใส่หมายเหตุใน JSON ว่า "halbsummen: omitted-by-budget"** ไม่งั้น AI นึกว่า engine ไม่ได้คำนวณ

**★3 สาขา TNP r391 ทั้งก้อนหลุดจาก compact JSON** (ตัวที่น่าจะเป็นต้นเหตุ "ผังส่งไม่ครบ" มากที่สุด)
`structuredPacketJson()` ใส่ใน `data{}` แค่ 7 key: `points, planetaryPictures, fourPlanetPictures, sensitivePoints, antiscia, declinationPairs, witteTransneptunians` — **ไม่มี** `tnpPoints, tnpPlanetaryPictures, tnpSensitivePoints, tnpNotComputable, tnpElementsMissing` และ top-level ก็ไม่มี `tnpPositionSourceKepler, tnpPrecisionNote`.
ผลคือ: `renderUranianPrompt()` (ข้อความ) พูดถึง Cupido/Hades/Kronos พร้อมองศา แต่ `STRUCTURED_CHART_PACKET` (JSON) **ไม่มี field TNP เลย** → ข้อความกับ JSON ขัดกัน → โมเดลที่ยึด JSON เป็น "ผังจริง" จะรายงานว่าผังไม่มี TNP / ส่งไม่ครบ

---

## ตาราง B — สิ่งที่ AI "ไม่ได้รับ" จริง (รวมทั้ง 2 ทางส่ง)

| field | ข้อความ (render) | JSON (compact) | AI ได้รับสุทธิ | ควรทำ |
|---|:---:|:---:|:---:|---|
| `tnpPoints` (r391) | ✅ | ❌ | เห็นในข้อความ แต่ JSON ค้าน | **เพิ่มใน compact JSON** |
| `tnpPlanetaryPictures` | ✅ | ❌ | เห็นในข้อความ แต่ JSON ค้าน | **เพิ่มใน compact JSON** |
| `tnpSensitivePoints` | ✅ | ❌ | เห็นในข้อความ แต่ JSON ค้าน | **เพิ่มใน compact JSON** |
| `tnpNotComputable` (Zeus) | ✅ | ❌ | เห็นในข้อความ | เพิ่ม JSON (option) |
| `tnpPrecisionNote` | ✅ | ❌ | เห็นในข้อความ | เพิ่ม top JSON (option) |
| `personalPoints` (โดยเฉพาะ **AriesPoint**) | ❌ | ❌ | **ไม่ได้รับ** | **เพิ่มทั้ง 2 ทาง** |
| `halbsummen` ดิบ | ❌ | ❌ | ไม่ได้รับ (ตั้งใจ) | ใส่ป้าย omitted-by-budget |
| `tnpElementsMissing` | ❌ | ❌ | ไม่ได้รับ | option (ย่อยของ Zeus) |

---

## ร่าง diff (เจ้านายรวมเขียนเอง)

### ⛔ packet.ts — ไม่ต้องแก้
`buildUranianPacket()` copy ครบทุก field แล้ว การเพิ่ม field ที่นี่ไม่ช่วย เพราะตัวที่ตัดคือ compactor ถัดไป

### ✅ จุดแก้จริง #1 — `src/lib/fusion5/build-prompt.ts` · `structuredPacketJson()` (~2519–2543)
เติมสาขา TNP + personalPoints เข้า compact JSON ให้ตรงกับที่ข้อความพูด (แบบ array ย่อกัน budget):

```diff
   const compact = {
     discipline: p.discipline,
     packetVersion: p.packetVersion,
     hasBirthTime: p.hasBirthTime,
     degradeLevel: p.degradeLevel,
     orbPictureDeg: p.orbPictureDeg,
     orbSensitiveDeg: p.orbSensitiveDeg,
     orbAntisciaDeg: p.orbAntisciaDeg,
     orbParallelDeg: p.orbParallelDeg,
     orbFourPlanetDeg: p.orbFourPlanetDeg,
     nodeMeanLon: p.nodeMeanLon,
     nodeTrueLon: p.nodeTrueLon,
     tnpPositionSource: p.tnpPositionSource,
+    tnpPositionSourceKepler: p.tnpPositionSourceKepler,
+    tnpPrecisionNote: p.tnpPrecisionNote,
     excludedTransneptunians: p.excludedTransneptunians,
     notAvailable: p.notAvailable,
     data: {
       points: d.points?.map((x: any) => [x.name, x.signTh, x.signDeg, +x.dial90?.toFixed?.(2), +x.decl?.toFixed?.(2), x.uncertain ? 1 : 0]),
+      // จุดส่วนตัว 6 (โดยเฉพาะ AriesPoint/Widderpunkt 0°♈ ที่เดิมไม่โผล่ที่ไหนเลย)
+      personalPoints: d.personalPoints?.map((x: any) => [x.name, x.signTh, +x.signDeg?.toFixed?.(2), +x.dial90?.toFixed?.(2)]),
+      // halbsummen ดิบตัดออกโดยตั้งใจ (budget) — ใส่ป้ายบอก AI ว่า engine คำนวณแล้ว ไม่ใช่ขาด
+      halbsummenOmitted: "budget_only__see_planetaryPictures_and_sensitivePoints",
       planetaryPictures: d.planetaryPictures?.map((x: any) => [x.pair, x.occupant, x.orbDeg, x.touchesPersonal ? 1 : 0]),
       fourPlanetPictures: d.fourPlanetPictures?.map((x: any) => [x.pairA, x.pairB, x.orbDeg, x.touchesPersonal ? 1 : 0]),
       sensitivePoints: d.sensitivePoints?.map((x: any) => [x.kind, x.a, x.b, x.activatedBy, x.orbDeg, x.touchesPersonal ? 1 : 0]),
       antiscia: d.antiscia?.map((x: any) => [x.kind, x.a, x.b, x.orbDeg, x.touchesPersonal ? 1 : 0]),
       declinationPairs: d.declinationPairs?.map((x: any) => [x.kind, x.a, x.b, x.orbDeg, x.touchesPersonal ? 1 : 0]),
       witteTransneptunians: d.witteTransneptunians?.map((x: any) => [x.name, x.rulerSignDe, x.canonRef]),
+      // ── r391 · สาขา TNP จริง (Cupido/Hades/Kronos) — เดิมหลุดจาก JSON ทั้งที่ข้อความพูดถึง ──
+      tnpPoints: d.tnpPoints?.map((x: any) => [x.name, x.signTh ?? x.rulerSignDe, +x.lon?.toFixed?.(2), +x.dial90?.toFixed?.(2)]),
+      tnpPlanetaryPictures: d.tnpPlanetaryPictures?.map((x: any) => [x.pair, x.occupant, x.orbDeg, (x.involves||[]).join("/"), x.touchesPersonal ? 1 : 0]),
+      tnpSensitivePoints: d.tnpSensitivePoints?.map((x: any) => [x.kind, x.a, x.b, x.activatedBy, x.orbDeg, (x.involves||[]).join("/"), x.touchesPersonal ? 1 : 0]),
+      tnpNotComputable: d.tnpNotComputable?.map((x: any) => [x.name, x.reason]),
+      tnpElementsMissing: d.tnpElementsMissing?.map((x: any) => [x.name, (x.missing||[]).join(",")]),
     },
   };
```

> หมายเหตุ field ของ `tnpPoints`: type `TnpPosition` (tnp-kepler.ts:129) มี `name, nameDe, nameTh, rulerSignDe, lon, dial90, source` — **ไม่มี `signTh`** (ต่างจาก `UranianPoint`) ดังนั้นใน diff ใช้ `x.signTh ?? x.rulerSignDe` หรือคำนวณราศีจาก `lon` ตอนย่อ (เจ้านายเลือก) เพื่อไม่ให้ได้ `undefined`

### ✅ จุดแก้จริง #2 (เสริม) — `src/lib/astro/uranian/render.ts`
เติม **AriesPoint / personalPoints** ในบล็อกข้อความ (ตอนนี้ Widderpunkt 0°♈ ไม่โผล่เลย). แทรกหลังบล็อก "ตำแหน่งดาว/จุด" (~บรรทัด 79) เช่น:

```diff
+  // ── จุดส่วนตัว (personal points · เป้าไวชั้น Auslösung — รวม Widderpunkt 0°♈ ที่เดิมไม่ถูกแสดง) ──
+  L.push("— จุดส่วนตัว (☉ ☽ Meridian Aszendent Mondknoten Widderpunkt) · เป้าไวหลักของการกระตุ้น —");
+  for (const p of d.personalPoints) {
+    L.push(`  • ${p.nameTh} (${p.nameDe}): ${fmtLon(p.lon)} · dial90=${p.dial90.toFixed(2)}°`);
+  }
+  L.push("");
```

---

## ที่มา (ยืนยันจากโค้ดจริง)

- `src/lib/astro/uranian/engine.ts` — type `UranianChart` (178–209), `return {}` (515–546): 29 field
- `src/lib/astro/uranian/packet.ts` — `buildUranianPacket()` (74–122): copy ครบ 29/29 (top-level + `data{}` 15 key)
- `src/lib/astro/uranian/render.ts` — `renderUranianPrompt()`: render ทุกอย่าง **ยกเว้น** `personalPoints`, `halbsummen`, ตาราง `witteTransneptunians`, `tnpElementsMissing`
- `src/lib/fusion5/build-prompt.ts` — `structuredPacketJson()` (2515–2544): compact JSON ใส่ `data{}` แค่ 7 key (ตัด TNP branch + personalPoints + halbsummen); ส่ง AI ที่ 2588 = `renderUranianPrompt(packet) + STRUCTURED_CHART_PACKET(compact)`
- `src/lib/astro/uranian/tnp-kepler.ts` — `TnpPosition` (129): `name/nameDe/nameTh/rulerSignDe/lon/dial90/source` (ไม่มี signTh)
- `src/app/api/uranian-dial/route.ts` (134–163): endpoint วาดหน้าปัด อ่าน `packet.data.*` ครบ (ไม่ใช่ทาง AI · ไม่เกี่ยว)
