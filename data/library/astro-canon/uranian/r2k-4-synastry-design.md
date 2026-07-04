# r2k-4 · ออกแบบ "ปฏิกิริยาข้ามดวงยูเรเนียน (Uranian synastry)" — สเปก module ใหม่

> **สถานะ:** DESIGN ONLY (READ-ONLY audit r2j-4 ยืนยัน `pair-interactions.ts` มีแค่ 4 ศาสตร์ · ยูเรเนียนไม่ทำ pair เลย) · เอกสารนี้ **ไม่แก้โค้ด** — เป็นพิมพ์เขียวให้ session หน้า implement
> **หมวดคัมภีร์หนุน:** `10-witte-canon-de.md` หมวด F (Vergleichende Astrologie · บท 42) + บท 02 (Sonnensumme) + บท 19 (Halbsumme ☉|☽ = Freundschaft/Ehe · Summe = Spiegelpunkt zum Widderpunkt) + บท 16/41 (jeder Planet auf anderen → sensitive Punkte)
> **ช่องว่างที่อุด:** r2j-4 ข้อ 5 — "Synastry ดูคู่ 🔴 ขาดทั้งหมด · มีคัมภีร์รองรับแล้ว (build-prompt.ts:479 map `synastry: หมวด F`) แต่ไม่มี engine คำนวณ pair"

---

## 1. ที่มาจากคัมภีร์ (source of truth · verbatim → กติกา engine)

ยูเรเนียนของ Witte เน้น "โหราเปรียบเทียบ" หนักเป็นพิเศษ (r2j-4: "จุดที่ยูเรเนียนแข็งเป็นพิเศษในตำราจริง") กติกา engine ต้อง **ซื่อตรงต่อตำรา** ไม่ fit เอง

### 1.1 หลักเชื่อมสองดวง — ผลรวมดวงอาทิตย์ (บท 02, S.29 verbatim)
> „…man die Radixsonnen zweier Personen addiert und als Punkt benutzt. Die Hälfte der Summe gibt den Punkt an, der die Verbindung herbeigeführt hat. Der Tag der Trennung wird ermittelt durch die Summe der Sonnen minus Stand der lfd. Sonne. Bei stärkeren Verbindungen werden die Spitzen der X Häuser addiert." (บท 02)

→ **กฎ 1:** `SonnensummeAB = A.Sun + B.Sun`; ครึ่งผลรวม `(A.Sun+B.Sun)/2` = "จุดที่ทำให้เกิดการเชื่อม" — ดาว/จุดใดของ A หรือ B ที่ตกทับจุดนี้บนหน้าปัด 90° = แกนความสัมพันธ์ที่ engine ต้องรายงาน
→ **กฎ 1b (การเชื่อมแรง):** "Spitzen der X Häuser addiert" = เมื่อมีเวลาเกิดทั้งคู่ ให้บวก MC (Spitze X. Haus) เข้าไปด้วย → `A.MC + B.MC` ครึ่งผลรวม = จุดเชื่อมระดับลึก

### 1.2 Mondknoten = จุดเชื่อมชาย-หญิง (บท 42, S.137 verbatim)
> „Der Mondknoten ist deshalb bedeutsam, weil die Knoten die Schnittpunkte der Mondbahn (Weib) und der Erdbahn (Mann) die Verbindung von weiblich-männlich zeigen." (บท 42)

→ **กฎ 2:** จุด Node (Mondknoten) ของแต่ละดวงเป็น "จุดส่วนตัว" ระดับความสัมพันธ์เต็มตัว → รวม Node เป็นเป้าไวข้ามดวง (มีอยู่แล้วใน `personalPoints`)

### 1.3 ครึ่งผลรวม ☉|☽ = มิตรภาพ/พ่อแม่/การแต่งงาน (บท 19, S.53 verbatim)
> „Die Halbsumme O|D ist Freundschaft, Eltern, Ehe. Die Summe ist der Spiegelpunkt des Widderpunktes zur Halbsumme, sie zeigt demnach Verbindungen mit anderen Bewohnern des Erdballs." (บท 19)

→ **กฎ 3:** ครึ่งผลรวม ☉|☽ = แกน "ความสัมพันธ์/แต่งงาน" · **Summe (☉+☽) = Spiegelpunkt zum Widderpunkt** = จุดเชื่อมกับ "คนอื่นบนโลก" (= ตรงกับ synastry โดยตรง) → เมื่อดาว/จุดของอีกคนตกบน Summe(☉+☽) ของคนหนึ่ง = สัญญาณเชื่อมคน

### 1.4 กฎความหมายตามเรือน (บท 42, S.139 verbatim — ชุด PD ที่ตรงที่สุด)
> „Die Auswertung dieser neu entstandenen Punkte erfolgt nach dem ersten Schema, z. B. Jupiter im VIII. Hause der Sonne… Mars im VII. Hause des Mondes bezieht sich auf die Gatten weiblicher Personen. Neptun im I. Hause auf Ehen oder Heiraten, Uranus im V. auf männliche Nachkommen, Sonne, Merkur und Venus auf Freunde…" (บท 42)

→ **กฎ 4 (เฟส 2 · optional):** ดาวของ B ในเรือนของ ☉/☽ ของ A (chaldäisches Häusersystem บท 08) → engine map เรือน แล้วให้ AI อ่านความหมาย verbatim จากคัมภีร์หมวด F/G · **เฟส 1 ยังไม่ทำเรือน** (ต้องมีเวลาเกิดทั้งคู่ + reuse `houseOf` เหมือน western overlay)

### 1.5 การกระตุ้นด้วยดาวจร (บท 42, S.139) — ออกนอก scope synastry radix
> „Vorgeschobene und laufende Planeten über diese Punkte und deren Spiegelpunkte wirken auslösend." (บท 42)

→ นี่คือ **pair timing** (`renderPairTimingBlock` ที่ multi-year.ts:99 ยัง return "") — ไม่อยู่ใน r2k-4 นี้ (แยกเป็น r2k-5 · timing ของคู่)

### 1.6 หลักการทั่วไป (บท 41, S.121 · บท 16)
> „Es kann also jeder Planet im Planetenbild auf einen anderen gesetzt werden und man erhält dadurch unzählige sensitive Punkte." (บท 41)

→ **กฎ 5:** ทุกดาว/จุดของ A สามารถวางบนครึ่งผลรวมของ B (และกลับกัน) → สร้างภาพดาว/จุดไว "ข้ามดวง" ได้ — นี่คือรากของ cross-midpoint synastry

---

## 2. สเปก module ใหม่ `uranian-synastry.ts`

**ตำแหน่งไฟล์ที่เสนอ:** `src/lib/astro/uranian/synastry.ts` (อยู่กับ engine/packet เดิม · deterministic ล้วน · reuse `midpointLon`/`dial90Distance` ที่ engine export แล้ว)
**ไม่แตะ:** `engine.ts` / `packet.ts` / `auslosung.ts` (LOCKED · additive ล้วน)

### 2.1 อินพุต / เอาต์พุต (contract)

```
input:  chartA: UranianChart, chartB: UranianChart   (จาก uranianChart() เดิม · ไม่คำนวณดาวใหม่)
        + labelA, labelB (ชื่อ 2 คน)
output: UranianSynastryPacket = {
          contacts: UranianCrossContact[]   // รายการสัมผัสข้ามดวง + orb (คัดคมสุด · cap)
          connectionPoints: ...             // จุดเชื่อม Sonnensumme/☉☽-Summe (บท 02/19)
          notAvailable: string[]            // degrade เมื่อไม่มีเวลาเกิด
        }
```

### 2.2 ชนิดสัมผัสข้ามดวง (5 ชนิด · แต่ละชนิดผูกบทคัมภีร์)

| # | ชนิด | นิยาม geometry | orb (บนหน้าปัด 90°) | บทหนุน |
|---|---|---|---|---|
| C1 | **crossMidpointPicture** (จุดกึ่งกลาง A ถูกดาว/จุด B กระตุ้น) | ดาว/จุด `q` ของ B ตกบนครึ่งผลรวม `a1|a2` ของ A: `dial90Distance(qB.lon, midA) ≤ orb` | 1.0° | บท 41/16 (กฎ 5) |
| C2 | **crossSensitivePoint** (จุดไวข้ามดวง) | ผลรวม `a1+a2` หรือผลต่าง `a1−a2` ของ A ถูกดาว/จุด `q` ของ B กระตุ้น | 1.0° | บท 16/19 (กฎ 3/5) |
| C3 | **personalDirectContact** (จุดส่วนตัว A ↔ ดาว/จุด B) | จุดส่วนตัว A (☉☽MC Asc Node) โดนดาว/จุด B มุมแข็งบนหน้าปัด 90°: `dial90Distance(pA.lon, qB.lon) ≤ orb` | 1.0° | บท 42 (กฎ 2) · personal weighting |
| C4 | **connectionMidpoint** (จุดเชื่อม Sonnensumme) | ครึ่งผลรวม `A.Sun|B.Sun` (และ `A.MC|B.MC` เมื่อมีเวลา) → หาดาว/จุดใดของ A หรือ B ตกทับบนหน้าปัด 90° | 1.0° | บท 02/19 (กฎ 1/1b/3) |
| C5 | **crossAntiscia** (จุดกระจกข้ามดวง · optional เฟส 1.5) | ดาว B ตกบนจุดกระจก (antiscia/contra) ของดาว A | 1.0° | บท 16/36 + Ptolemy zone5 |

> **ทำ 2 ทิศเสมอ** (A→B และ B→A) เหมือน western/vedic pair เดิม (`fromOwner`/`toOwner`)
> **C1 เทียบคู่มุมแข็งครบ** เพราะ dial 90° พับ 0/90/180 ทับกันในนิพจน์เดียว (เหมือน `dial90Distance` เดิม) + จับ 45/135 ได้ผ่านการวางบนหน้าปัด (เป็นขนบ Witte "มุมแข็ง" กฎ 4 ใน 11-method-reading)

### 2.3 orb และเหตุผล (ห้าม fit เอง)
- **1.0° ทุกชนิด** — เข้มกว่า natal picture (1.5°) เพราะข้ามดวงมี "คู่ที่เป็นไปได้" มากกว่ามาก (A×B = 12×12) ต้องกันสัญญาณรบกวน · Witte เรียก „scharfe Aspekte" (บท 16) แต่ไม่ให้ตัวเลข orb → ใช้ค่าสากล 1.0° (นโยบายเดียวกับ antiscia/parallel ใน engine เดิม)
- ค่า orb ทั้งหมด export เป็น constant + ใส่ใน packet (`orbCrossDeg`) เพื่อโปร่งใส (เหมือน `orbPictureDeg` ใน packet เดิม)

### 2.4 การถ่วงน้ำหนัก personal (reuse ตรรกะ `anyPersonal` เดิม)
`touchesPersonal = true` เมื่อสัมผัสแตะ ☉/MC/Asc ของฝั่งใดฝั่งหนึ่ง (Anareta บท 16/30 · ☉=Auslöser บท 12) — ให้ AI/judge ยกจุดพวกนี้ก่อน

### 2.5 degrade เมื่อไม่มีเวลาเกิด (ตามแบบ western/vedic pair เดิม)
- ถ้าดวงใดไม่มีเวลา → `chart.points` ไม่มี Meridian/Ascendant อยู่แล้ว (engine ตัดให้) → C3/C4 ที่พึ่ง MC/Asc หายเอง
- จันทร์ของดวงไม่มีเวลา = `uncertain:true` → ติดธงใน contact ที่มีจันทร์ร่วม (`moonUncertain:true`)
- `notAvailable` = `["meridianSynastry","ascendantSynastry","houseOverlaySynastry"]` เมื่อขาดเวลา (กฎ 4 เรือน = เฟส 2 อยู่แล้ว)

---

## 3. ร่าง type / ฟังก์ชันหลัก (TypeScript · พิมพ์เขียว)

```ts
// src/lib/astro/uranian/synastry.ts
import {
  midpointLon, dial90Distance,   // engine export แล้ว (บรรทัด 216/220) — reuse ตรง
  type UranianChart, type UranianPoint,
} from "./engine";
import { norm360 } from "../../astro-core/ephemeris";
import { wrap180 } from "../../astro-core/events";

export type CrossOwner = "A" | "B";

/** สัมผัสข้ามดวง 1 รายการ (ชนิด C1–C5) */
export type UranianCrossContact = {
  kind: "crossMidpointPicture" | "crossSensitivePoint" | "personalDirectContact"
      | "connectionMidpoint" | "crossAntiscia";
  // ฝั่งที่ "ให้แกน/ครึ่งผลรวม" (A) และฝั่งที่ "มากระตุ้น" (B) — เก็บ owner ชัด กันสลับ
  baseOwner: CrossOwner;            // เจ้าของครึ่งผลรวม/จุดไว/จุดส่วนตัว
  hitOwner: CrossOwner;             // เจ้าของดาว/จุดที่มากระตุ้น
  // องค์ประกอบ
  a: string; b?: string;           // ดาวคู่ที่สร้างครึ่งผลรวม/จุดไว (b ว่างสำหรับ C3 direct)
  aTh: string; bTh?: string;
  activatedBy: string;             // ดาว/จุดของ hitOwner ที่ตกทับ
  activatedByTh: string;
  pointLon: number;                // ลองจิจูดจุดที่ถูกกระตุ้น (สากล 0-360)
  pointSignTh: string; pointSignDeg: number;
  orbDeg: number;                  // ระยะบนหน้าปัด 90° (0..45) หรือสุริยวิถีสำหรับ antiscia
  formula: string;                 // "A.☉ + A.☽ − B.♀ = แกนสมมาตร (ข้ามดวง)"
  touchesPersonal: boolean;        // แตะ ☉/MC/Asc ฝั่งใดฝั่งหนึ่ง
  moonUncertain?: boolean;         // มีจันทร์ของดวงไม่มีเวลาร่วม
  canonRef: string;                // "บท 41/16" ฯลฯ
};

/** จุดเชื่อมสองดวง (Sonnensumme บท 02 · ☉☽-Summe บท 19) */
export type UranianConnectionPoint = {
  kind: "sonnensumme" | "sun_moon_summe" | "mc_summe";
  formula: string;                 // "A.☉ + B.☉ → ครึ่งผลรวม = จุดเชื่อม (บท 02)"
  midLon: number; midSignTh: string; midSignDeg: number;
  occupants: Array<{ owner: CrossOwner; name: string; nameTh: string; orbDeg: number }>;
  canonRef: string;
};

export type UranianSynastryPacket = {
  discipline: "uranian";
  packetVersion: "uranian-synastry-v1";
  pair: { A: string; B: string };
  birthTimeMode: { A: "known" | "unknown_no_time"; B: "known" | "unknown_no_time" };
  rule: string;                    // บรรยายกติกา closed-list (ตามแบบ packet เดิม)
  orbCrossDeg: number;
  data: {
    contacts: UranianCrossContact[];        // C1–C5 คัดคมสุด (sort by orb · cap)
    connectionPoints: UranianConnectionPoint[];  // C4 (Sonnensumme/☉☽/MC)
  };
  notAvailable: string[];
};

const ORB_CROSS_DEG = 1.0;
const MAX_CONTACTS = 80;
const PERSONAL = new Set(["Sun", "Meridian", "Ascendant"]);   // ตรงกับ engine PERSONAL_PROMINENT
const RELATIONAL_PERSONAL = new Set(["Sun", "Moon", "Meridian", "Ascendant", "Node"]); // เป้าไว synastry (กฎ 2/3)

/** helper: point ของ chart ที่เป็นเป้าไว synastry (personalPoints มี ☉☽MC Asc Node AriesPoint แล้ว) */
const relationalPoints = (c: UranianChart): UranianPoint[] =>
  c.personalPoints.filter((p) => RELATIONAL_PERSONAL.has(p.name));

export function uranianSynastry(
  chartA: UranianChart, chartB: UranianChart, labelA: string, labelB: string,
): UranianSynastryPacket {
  const contacts: UranianCrossContact[] = [];
  const A = chartA.points, B = chartB.points;           // ดาวจริง 10 (+MC/Asc ถ้ามีเวลา)

  // ── C1 · crossMidpointPicture: ครึ่งผลรวมของ base ถูกดาว/จุดของ hit กระตุ้น (2 ทิศ) ──
  const scanCrossPicture = (baseOwner: CrossOwner, base: UranianPoint[], hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++) {
        const mid = midpointLon(base[i].lon, base[j].lon);
        for (const q of hit) {
          const orb = dial90Distance(q.lon, mid);
          if (orb <= ORB_CROSS_DEG) contacts.push(makeContact(
            "crossMidpointPicture", baseOwner, hitOwner, base[i], base[j], q, mid, orb,
            `${baseOwner}.${base[i].name} + ${baseOwner}.${base[j].name} − ${hitOwner}.${q.name} = แกนสมมาตร (ข้ามดวง)`,
            "บท 41/16",
          ));
        }
      }
  };
  scanCrossPicture("A", A, "B", B);
  scanCrossPicture("B", B, "A", A);

  // ── C2 · crossSensitivePoint: ผลรวม/ผลต่างของ base ถูกดาว/จุดของ hit กระตุ้น (2 ทิศ) ──
  const scanCrossSensitive = (baseOwner: CrossOwner, base: UranianPoint[], hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++) {
        const sum = norm360(base[i].lon + base[j].lon);
        const diff = norm360(base[i].lon - base[j].lon);
        for (const [kind, pt] of [["sum", sum], ["difference", diff]] as const)
          for (const q of hit) {
            const orb = dial90Distance(q.lon, pt);
            if (orb <= ORB_CROSS_DEG) contacts.push(makeContact(
              "crossSensitivePoint", baseOwner, hitOwner, base[i], base[j], q, pt, orb,
              `${baseOwner}.${base[i].name} ${kind === "sum" ? "+" : "−"} ${baseOwner}.${base[j].name} = จุดไว · กระตุ้นโดย ${hitOwner}.${q.name}`,
              "บท 16/19",
            ));
          }
      }
  };
  scanCrossSensitive("A", A, "B", B);
  scanCrossSensitive("B", B, "A", A);

  // ── C3 · personalDirectContact: จุดส่วนตัว base ↔ ดาว/จุด hit (มุมแข็งบนหน้าปัด 90°) ──
  const scanPersonalDirect = (baseOwner: CrossOwner, base: UranianChart, hitOwner: CrossOwner, hit: UranianPoint[]) => {
    for (const p of relationalPoints(base))
      for (const q of hit) {
        const orb = dial90Distance(p.lon, q.lon);
        if (orb <= ORB_CROSS_DEG) contacts.push(makeContactDirect(
          baseOwner, hitOwner, p, q, orb, "บท 42",
        ));
      }
  };
  scanPersonalDirect("A", chartA, "B", B);
  scanPersonalDirect("B", chartB, "A", A);

  // ── C4 · connectionMidpoint: Sonnensumme (บท 02) + ☉☽-Summe (บท 19) + MC-Summe (บท 02 „Spitzen X") ──
  const connectionPoints = buildConnectionPoints(chartA, chartB);

  // (C5 crossAntiscia — โครงเดียวกับ engine ANTI_SPECS · เฟส 1.5 optional)

  contacts.sort((x, y) => x.orbDeg - y.orbDeg
    || x.baseOwner.localeCompare(y.baseOwner) || x.a.localeCompare(y.a));

  const noTimeA = !chartA.hasBirthTime, noTimeB = !chartB.hasBirthTime;
  return {
    discipline: "uranian",
    packetVersion: "uranian-synastry-v1",
    pair: { A: labelA, B: labelB },
    birthTimeMode: {
      A: noTimeA ? "unknown_no_time" : "known",
      B: noTimeB ? "unknown_no_time" : "known",
    },
    rule: "closed-list Uranian synastry: cross-midpoint pictures + cross sensitive points "
        + "+ personal-point direct contacts (dial 90°) + Sonnensumme/☉☽-Summe connection points "
        + "(บท 02/19/41/42 · Witte vergleichende Astrologie)",
    orbCrossDeg: ORB_CROSS_DEG,
    data: { contacts: contacts.slice(0, MAX_CONTACTS), connectionPoints },
    notAvailable: [
      ...(noTimeA || noTimeB ? ["meridianSynastry", "ascendantSynastry", "houseOverlaySynastry"] : []),
      "transitActivationOfConnectionPoints_isPairTiming_r2k5", // บท 42 การกระตุ้นดาวจร = แยก module
    ],
  };
}
```

> `makeContact` / `makeContactDirect` / `buildConnectionPoints` = helper เล็ก (แปลง UranianPoint → field + sign/deg + `touchesPersonal = PERSONAL.has(...) ฝั่งใดฝั่งหนึ่ง` + `moonUncertain = (p/q ที่ชื่อ Moon และ chart.hasBirthTime=false)`) — ตรงแบบ `toPoint`/`anyPersonal` ใน engine เดิม
> **buildConnectionPoints:** คำนวณ `midpointLon(A.Sun, B.Sun)` (+ `A.MC,B.MC` ถ้ามีเวลาทั้งคู่) แล้ววนหา occupant จาก `[...A.points, ...B.points]` ที่ `dial90Distance ≤ orb` · สำหรับ ☉☽-Summe ให้ทำต่อ **แต่ละดวง** (`A.Sun+A.☽` เป็นแกน แล้วหาดาว B ตกทับ = C2 ครอบอยู่แล้ว) + คำนวณ Summe(☉+☽) เป็น "จุดเชื่อมกับคนอื่น" (บท 19 verbatim)

---

## 4. วิธี wire เข้า `pair-interactions.ts` (Layer เชื่อม fusion)

`pair-interactions.ts` เป็นตัวห่อ (adapter) จาก `PairBirthData` → payload ต่อศาสตร์ · เพิ่ม `uranianPair()` คู่ขนานกับ `westernPair/vedicPair/ziweiPair/qizhengPair`

**4.1 เพิ่มฟังก์ชัน adapter** (ในไฟล์ pair-interactions.ts):
```ts
import { uranianChart } from "../astro/uranian/engine";
import { uranianSynastry } from "../astro/uranian/synastry";

function uranianPair(a: PairBirthData, b: PairBirthData) {
  const A = uranianChart(a.dtUTC, a.lat, a.lng, a.hasTime, a.gender);
  const B = uranianChart(b.dtUTC, b.lat, b.lng, b.hasTime, b.gender);
  return uranianSynastry(A, B, chartLabel(a, 0), chartLabel(b, 1));
}
```
> ⚠️ `uranianChart` รับ gender เป็น `"M"|"F"` แล้ว (context เฉย ๆ) · `PairBirthData.gender` ก็ `"M"|"F"` → ส่งตรงได้ · ไม่ต้อง refDate (ยูเรเนียน synastry radix-radix ไม่พึ่งวันปัจจุบัน — ต่างจาก western/vedic ที่รับ refDate ไว้ทำ transit; timing แยกเป็น r2k-5)

**4.2 เติม case ใน `pairPayload`** (บรรทัด 500–505):
```ts
function pairPayload(science: ScienceId, a: PairBirthData, b: PairBirthData, refDate: Date): unknown {
  if (science === "western") return westernPair(a, b, refDate);
  if (science === "vedic")   return vedicPair(a, b, refDate);
  if (science === "ziwei")   return ziweiPair(a, b, refDate);
  if (science === "qizheng") return qizhengPair(a, b);
  if (science === "uranian") return uranianPair(a, b);   // ← เพิ่มบรรทัดเดียว
  return null;
}
```
> **ผลอัตโนมัติ:** `renderPairInteractionPacket` (บรรทัด 508+) รองรับทันทีทั้งโหมด 2 ดวง (path เดิม byte-identical) และกลุ่ม 3–4 ดวง (วนทุกคู่ i<j) — ไม่ต้องแก้ตัว renderer เลย เพราะมันเรียก `pairPayload` แบบ generic ต่อ ScienceId

**4.3 กันซ้ำซ้อน:** ยูเรเนียนไม่มี `gender`-based significator (ต่างจาก western `spouseSignificators` / vedic `ashtakoota` bride/groom) → adapter ไม่ต้องตัดสินบทบาทเพศ · Mondknoten (บท 42) เป็น relational point ที่ engine ใส่ให้แล้วใน `personalPoints`

---

## 5. วิธี wire เข้า build-prompt (ดูคู่)

**สถานะปัจจุบัน:** `build-prompt.ts:2734-2738` เรียก `renderPairInteractionPacket(science, births, ...)` **ต่อทุกศาสตร์ที่รันอยู่แล้ว** (รวม uranian) — ตอนนี้ยูเรเนียนคืน `""` เพราะ `pairPayload` ไม่มี case · **หลังทำข้อ 4.2 → บล็อกโผล่เองอัตโนมัติ** ไม่ต้องแตะ build-prompt เพิ่ม

**สิ่งที่ได้ฟรี (มีอยู่แล้ว):**
- **คัมภีร์ synastry ถูก map แล้ว:** `build-prompt.ts:479` → `synastry: หมวด F — vergleichende Astrologie` (บท 42) จะถูกโหลดเข้า prompt แผงยูเรเนียนเมื่อคำถาม/บริบทเป็นดูคู่ (r2j-4 ยืนยัน "คัมภีร์พร้อม ช่องว่างเป็น engine ล้วน")
- **directive ดูคู่:** `build-prompt.ts:2738` „ใช้เฉพาะ PAIR_INTERACTION_PACKET … ห้ามสร้างคู่/มุม/ดาวข้ามดวงเพิ่มเอง" ครอบ closed-list ให้แล้ว
- **no-time warning:** บรรทัด 2721-2722 มี uranian branch แล้ว

**สิ่งที่ควรเสริม (เล็ก · optional):**
1. **โหลดหมวด F ตอนดูคู่:** เช็คว่า selector เลือก section `synastry` เข้ามาเมื่อ `births.length > 1` (ถ้า logic เลือก section ผูกกับ keyword คำถาม อาจต้องเพิ่ม trigger "ดูคู่/สมพงษ์" → รวม `synastry`)
2. **เสริมหมวด H tie-in (บท 19 Cupido):** Cupido = "eheliche Verbindungen, Verlobungen" (บท 19) · ถ้า `tnpPoints` มี Cupido/Hades ในภาพดาวข้ามดวง (เฟส 2) ให้คัมภีร์หมวด H ร่วมด้วย — แต่ **เฟส 1 ไม่รวม TNP ใน synastry** (คุม scope · TNP precision ±1-2° ไม่พอสำหรับ orb 1.0° ข้ามดวง)

**นอก scope r2k-4 (จดไว้ ห้ามทำพร้อม):**
- `renderPairTimingBlock` (multi-year.ts:99) uranian ยัง return "" = **ปฏิทินร่วมของคู่ (pair timing)** — คือกฎ 1.5 (บท 02 „Tag der Trennung = Summe der Sonnen − lfd. Sonne") + บท 42 „laufende Planeten über diese Punkte" → **แยกเป็น r2k-5** (ต้อง reuse `computeUranianAuslosung` กับจุดเชื่อม)

---

## 6. Test / golden (บังคับก่อน deploy)

1. **determinism:** input เดิม → output เดิม byte-identical (ไม่มี Date.now/random · uranianChart เดิม deterministic อยู่แล้ว)
2. **symmetry sanity:** C1/C2/C3 ต้องมีทั้งทิศ A→B และ B→A ครบ · จำนวน contact ทิศ A→B (base=A) ≈ B→A เมื่อ orb เท่ากัน
3. **no-time degrade:** ดวงไม่มีเวลา → ไม่มี contact ที่ activatedBy/base = Meridian/Ascendant · จันทร์ติดธง `moonUncertain`
4. **golden pair:** ใช้คู่ทดสอบมาตรฐาน (เช่น Aeaw × Mai ที่มีใน AGENTS.md) — ตรวจว่า:
   - Sonnensumme (บท 02) คำนวณถูก: `midpointLon(A.Sun.lon, B.Sun.lon)`
   - มี connectionPoint kind `sonnensumme` เสมอ (แม้ occupants ว่าง)
   - orb ทุกค่า ≤ 1.0° และ ≤ 45 (บนหน้าปัด 90°)
5. **cap:** contacts ≤ 80 · prompt แผงไม่ทะลุ `FUSION_PANEL_PROMPT_MAX_CHARS`
6. **regression:** western/vedic/ziwei/qizheng pair output **ไม่เปลี่ยน** (เพิ่ม case uranian อย่างเดียว · path 2 ดวงศาสตร์อื่น byte-identical)

---

## 7. ประเมิน effort

| งาน | ขนาด | หมายเหตุ |
|---|---|---|
| `synastry.ts` (module ใหม่) | **~180-220 บรรทัด** | mirror `westernPair` (77 บรรทัด) + logic ครึ่งผลรวม/จุดไว/personal + helper · reuse `midpointLon`/`dial90Distance`/`norm360` ที่มีแล้ว = ไม่เขียนดาราศาสตร์ใหม่ |
| wire `pair-interactions.ts` | **~8 บรรทัด** | import + `uranianPair()` adapter + 1 บรรทัดใน `pairPayload` |
| wire build-prompt | **0-15 บรรทัด** | ได้ฟรีเป็นหลัก · optional: trigger section `synastry` ตอนดูคู่ |
| test golden | **~60 บรรทัด** | สคริปต์ .cjs ตามแบบ test-bazi · + regression 4 ศาสตร์เดิม |
| **รวม** | **~½–1 วัน** | เฟส 1 (C1-C4 · ไม่มีเรือน/ไม่มี TNP/ไม่มี timing) · risk ต่ำ (additive ล้วน · ไม่แตะ engine/packet LOCKED) |

**เฟสถัดไป (แยก · ไม่รวม r2k-4):**
- **r2k-4.5:** C5 crossAntiscia + house overlay (กฎ 4 · บท 42 „Jupiter im VIII. Hause der Sonne") — ต้องมีเวลาเกิดทั้งคู่ + reuse `houseOf` (chaldäisches บท 08)
- **r2k-5:** pair timing (`renderPairTimingBlock` uranian) — บท 02 „Tag der Trennung" + บท 42 „laufende Planeten über diese Punkte" · reuse `computeUranianAuslosung` ยิงจุดเชื่อม
- **เฟส 2:** TNP ใน synastry (Cupido=แต่งงาน บท 19 · Hades=แยก/ป่วย บท 40) เมื่อ precision TNP ดีพอ

---

## 8. หลักการกำกับ (canon = source of truth)

- ทุก contact/connection **ต้องผูก `canonRef`** ชี้บทจริง (บท 02/16/19/41/42) — ห้าม engine สร้างชนิดสัมผัสที่คัมภีร์ไม่รองรับ
- engine ส่ง **structured JSON เท่านั้น** · AI อ่านความหมาย verbatim จากหมวด F/H (กฎข้อ 9 Decode) · ห้าม engine เดา "เข้ากัน/ไม่เข้ากัน" เป็นคะแนน
- closed-list: packet ระบุ „AI ห้ามสร้างปฏิกิริยาข้ามดวงเพิ่มนอกลิสต์" (renderer เดิมใส่ให้แล้ว)
- ความเข้ากัน (บท 42) = **บรรยายเชิงคุณภาพจากจุดเชื่อม** (Sonnensumme/☉☽/Cupido) ไม่ใช่ตัวเลข % (ตรงนโยบาย NO_PERCENT ของ sifu)
