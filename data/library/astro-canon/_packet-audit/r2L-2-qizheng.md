# r2L-2 · Packet Audit — 七政四餘 (qizheng) ดาวจริง

READ-ONLY audit · ไม่แก้โค้ด · วันที่ 2026-07-04

**คำถามหลัก:** engine ดาวจริง 七政四餘 ส่งผัง/ดาวจร/คัมภีร์ ให้ AI ครบไหม หรือมีการตัด field ทิ้งเหมือนบั๊กยูเรเนียน (auslosung ที่เคยหลุด JSON)

**ไฟล์ที่อ่าน:**
- engine: `src/lib/astro/qizheng/engine.ts` · `packet.ts` · `render.ts` · `timeline.ts` · `huayao.ts`
- `src/lib/fusion5/build-prompt.ts` — `structuredPacketJson` qizheng (บรรทัด 2409–2444) · `renderChartForScience` qizheng (2632–2636) · trust-instruction (2782) · canon router (833–...)

---

## สรุปหัวข้อ (bottom line)

🔴 **เจอบั๊กชนิดเดียวกับยูเรเนียน (auslosung):** engine คำนวณ `data.timingTimeline` (流年全星 + 流月太陽過宮 + วันชนจุดสำคัญ/hits) ครบ · **prose (renderQizhengPrompt) แสดงครบ** · แต่ **`structuredPacketJson` ตัดทิ้งทั้งก้อน** — ไม่มี field `timingTimeline` ใน STRUCTURED_CHART_PACKET เลย

ผลกระทบเท่ากับเคสยูเรเนียนก่อน r392: บรรทัด **2782** สั่ง AI ว่า
> "คำตอบต้องสอดคล้องกับคัมภีร์/กฎ/SOURCE_MAP ที่แนบมา **และ field ใน STRUCTURED_CHART_PACKET เท่านั้น** · ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง"

เมื่อ JSON = แหล่งอ้างอิงหลัก แต่ timeline อยู่แค่ prose → AI ตอบ **วัน/เดือนที่ดาวจรชนจุด (命度/身度/命主)** ได้ไม่มั่นใจ หรือหลบไม่ยกวันเจาะจง ทั้งที่ engine คำนวณ hits รายวัน (bisection จริง) ให้แล้ว — ตรงกับอาการยูเรเนียนที่ "ตอบตกวันไม่ได้เพราะ auslosung หลุด JSON"

ส่วนที่เหลือ (ผังพื้นดวง 命宮/命度/身主/廟旺/恩用仇難/格局/12宮/行限/化曜/transit ย่อ 木土) **ส่งครบทั้ง prose + JSON** · คัมภีร์ qizheng ส่งครบ

---

## ตารางเทียบ: engine field · ใน JSON (STRUCTURED_CHART_PACKET) ไหม · ใน prose ไหม · สถานะ

engine สร้าง `QizhengPacket.data` (packet.ts:14–28). เทียบกับ compact JSON (build-prompt.ts:2420–2441) และ prose (render.ts):

| engine field (packet.data) | ใน JSON? | ใน prose? | สถานะ |
|---|---|---|---|
| `ascendant` (命宮/ลัคนา + 宿 + 命主) | ✅ เต็ม object | ✅ | ครบ |
| `mingDegree` (命度/度主 + relationToMing) | ✅ เต็ม object | ✅ | ครบ |
| `shenDegree` (身宮/身主 月為身) | ✅ เต็ม object | ✅ | ครบ |
| `yongshen` (命主 + status) | ✅ | ✅ | ครบ |
| `stars` (7政+4餘 · ราศี/องศา/宿/廟旺/พักร์) | ✅ ย่อ array `[zh,th,signTh,signDeg,shu,shuDeg,status,retro]` | ✅ | ครบ (บีบเป็น array ประหยัด budget · ไม่เสียข้อมูลหลัก) |
| `enStars/yongStars/nanStars/chouStars` (恩用仇難) | ✅ | ✅ | ครบ |
| `geju` (格局) | ✅ | ✅ | ครบ |
| `houses12` (12宮 · เจ้าเรือน廟旺/ตกเรือน/ดาวในเรือน/level) | ✅ ย่อ array `[house,zh,domain,signTh,rulerTh,rulerStatus,rulerInHouse,starsInHouse,level]` | ✅ | ครบข้อมูลตัดสิน · ตัด `th`(ชื่อเรือนไทย) + `note`(ประโยคสรุป) ทิ้ง — **minor** (note derivable จาก field อื่น · prose ก็ไม่ได้โชว์ note) |
| `transit` (流年 ย่อ · 木/土 เทียบเรือนเกิด รายปี) | ✅ เต็ม | ✅ | ครบ |
| `xingXian` (行限/限度主/洞微百六限 + sequence เต็ม + current) | ✅ เต็ม object (ไม่บีบ) | ✅ (prose โชว์เฉพาะ current · JSON มี sequence เต็ม → JSON รวยกว่า) | ครบ |
| `huaYao` (十干化曜 變曜 · 10 บทบาท + ตำแหน่งพื้นดวง) | ✅ ย่อ `{yearStem, roles[[roleFull,meaningZh,palaceZh,starZh,starTh,natalHouse,natalStatus,retro]]}` | ✅ | ครบ |
| **`timingTimeline`** (流年全星ครบดวง + 流月太陽過宮 + hits วันชนจุดสำคัญ) | 🔴 **ไม่มีเลย** | ✅ เต็ม (render.ts:56–77) | 🔴 **ตัดทิ้งทั้งก้อน = บั๊กแบบ auslosung** |
| `verdictTh` / `level` | ✅ | ✅ | ครบ |
| `notAvailable` | ✅ | ✅ | ครบ |

### รายละเอียด `timingTimeline` ที่หลุด (engine คำนวณจริงทั้งหมด — timeline.ts)
- `liuNianStars` — ดาวจรครบ 7政+4餘 กลางปีเป้าหมาย · เรือนที่ตก + 廟旺จร + **relationToMing** (เทียบ恩用仇難ของ命主พื้นดวง)
- `months` — 流月 = 太陽過宮 (sidereal ingress จริง) · ขอบเดือน from/to ISO + เรือนอาทิตย์ + ดาวเร็ว (火金水) รายเดือน
- `hits` — **วันแม่นดาวจร (木土羅計火) ทับ(0°)/เล็ง(180°) 命度/身度/命主กำเนิด** · คำนวณด้วย scan+bisection จริง · มี dateISO ราย**วัน** + relationToMing
- `coverageNote` / `method` / `timezone`

→ นี่คือชั้นเวลาแบบเจาะวัน/เดือนของศาสตร์นี้ (เทียบเท่า auslosung ของยูเรเนียน) และเป็นชิ้นเดียวที่หายไปจาก JSON

---

## prose vs JSON ขัดกันไหม

**ขัดในเชิงความครบ (แบบเดียวกับยูเรเนียนก่อน r392):**
1. prose (render.ts:56–77) โชว์บล็อก `【TIMING_TIMELINE...】` พร้อม `TIMING_GUARD: จังหวะรายเดือน/วันของปีเป้าหมายให้อ้างจากรายการนี้เท่านั้น ห้ามประมาณเอง` — สั่งให้ AI ยึด timeline นี้
2. แต่ JSON (แหล่งที่บรรทัด 2782 บอกว่า "เท่านั้น") **ไม่มี timeline** → guard ใน prose ชี้ไปยังข้อมูลที่ไม่มีใน JSON
3. `notAvailable` เมื่อ timeline ถูกคำนวณสำเร็จ **ไม่ลิสต์** 流年全星/流月/hits (เพราะถือว่า available) → JSON จึงบอกโดยนัยว่า "มีข้อมูลนี้" แต่ตัว field จริงกลับไม่ถูกส่งใน JSON = ย้อนแย้ง

**ไม่ขัดในส่วนอื่น:** ผังพื้นดวง + 行限 + 化曜 + transit ย่อ สอดคล้องกัน prose↔JSON (JSON บาง field รวยกว่า prose ด้วยซ้ำ เช่น xingXian.sequence)

---

## คัมภีร์ qizheng + ดาวจร/timeline ส่งครบไหม

- **คัมภีร์ (canon):** ส่งครบ — router `selectCanonFilesForPrompt` (build-prompt.ts:833+) เลือกไฟล์ตาม intent ครบ รวมไฟล์ timing โดยตรง: `05-xingxian.md`, `19-timing-forecast-specificity.md`, `10-degree-limit-specificity.md` ถูก push แทบทุก intent (รวม `intent.timing`) · ไฟล์ในดิสก์มีจริง (`data/library/astro-canon/qizheng/`)
- **ดาวจรระดับปี (transit 木土):** ส่งครบทั้ง prose + JSON
- **ดาวจร/timeline ระดับเดือน-วัน (timingTimeline):** engine + prose ครบ · **JSON ขาด** (ดูข้างบน)
- ไม่พบการ "ตัดสั้น/truncate" คัมภีร์เฉพาะ qizheng ผิดปกติ · budget cap 56K (comment build-prompt.ts:2345) รองรับ 4 ไฟล์ใหญ่ของ qizheng

---

## notAvailable / degrade — ตรวจแล้ว

- ทำงานถูกต้องตามหลัก: ไม่มีเวลาเกิด → ปิด 命宮/命度/度主/身宮/身主/12宮/恩用仇難/格局/行限 (packet.ts:57–59) และ JSON เซ็ต field เป็น null/[] พร้อม `timeDependentClosed` list (build-prompt.ts:2421)
- gaps ที่ประกาศตรงไปตรงมา: `流日`, `小限` (ยังไม่ทำ · ประกาศใน notAvailable + coverageNote) — โปร่งใส ไม่เดา
- ⚠️ ช่องโหว่ความสอดคล้อง: เมื่อ `timingTimeline` ถูกคำนวณสำเร็จ notAvailable จะไม่ลิสต์ 流年全星/流月 แต่ JSON ก็ไม่ได้ส่ง field → ควรแก้ที่ JSON (เพิ่ม field) ไม่ใช่แก้ notAvailable

---

## ร่างแก้ (ถ้าอนุมัติ — ยังไม่แตะโค้ด)

**Root cause:** `structuredPacketJson` (build-prompt.ts ~2420) ไม่ได้ map `d.timingTimeline` เข้า compact.data · ตรงกับบั๊กยูเรเนียนที่ r392 แก้ (auslosung หลุด JSON)

**จุดแก้เดียว:** build-prompt.ts ใน block `compact.data` ของ qizheng (หลัง `huaYao` ก่อน `verdictTh`) เพิ่มการ serialize แบบ **บีบ array** (เลียนแบบ pattern uranian auslosung 2596–2606 · slice กัน budget):

```ts
// r2L · ชั้นเวลา 七政四餘 (流年全星/流月/วันชนจุดสำคัญ) — เดิมตัดทั้งก้อน AI จึงตอบตกวัน/เดือนไม่ได้ (แบบ auslosung ก่อน r392)
timingTimeline: (hasTime && d.timingTimeline) ? {
  targetYear: d.timingTimeline.targetYear,
  coverageNote: d.timingTimeline.coverageNote,
  liuNianStars: d.timingTimeline.liuNianStars?.map((s: any) =>
    [s.zh, s.th, s.house, s.houseZh, s.signTh, s.deg, s.status, s.retro ? 1 : 0, s.relationToMing]),
  months: d.timingTimeline.months?.map((m: any) =>
    [m.month, m.fromISO, m.toISO, m.sunHouse, m.sunHouseZh,
     (m.fastStars || []).map((f: any) => `${f.zh}>${f.house}`)]),
  hits: d.timingTimeline.hits?.slice(0, 24).map((h: any) =>
    [h.dateISO, h.month, h.starZh, h.aspect, h.target, h.retro ? 1 : 0, h.relationToMing]),
} : null,
```

**หมายเหตุการแก้:**
- ใช้ `hasTime && d.timingTimeline` (timeline สร้างเฉพาะเมื่อมีเวลาเกิด · engine อยู่แล้ว)
- `hits.slice(0, 24)` กัน budget (ปีนึงอาจมีหลายจุด) — engine sort ตามวันแล้ว
- ไม่แตะ engine/packet/render/timeline (ครบอยู่แล้ว) · แก้จุดเดียวที่ serializer
- แก้แล้วควร verify: ดวงมีเวลาเกิด → STRUCTURED_CHART_PACKET ต้องมี `timingTimeline.hits` ที่ตรงกับบล็อก prose 【TIMING_TIMELINE】
- **หมวดที่ยังไม่ต้องแก้ (แค่บันทึก):** `houses12` ตัด `th`/`note` — เป็น minor · derivable · ไม่กระทบการตัดสิน (จดไว้ ไม่แก้พร้อมกันตามกฎ bug-fix protocol)

---

## ยืนยันตรง (ไม่กั๊ก · ตามกฎ "ห้ามโกหก พูดตรง")

- ✅ **ยืนยันแน่นอน:** `timingTimeline` ถูกตัดออกจาก STRUCTURED_CHART_PACKET JSON ทั้งก้อน (มีใน prose + engine เท่านั้น) — เป็นบั๊กชนิดเดียวกับ auslosung ยูเรเนียนก่อน r392 · พิสูจน์จากการไล่ทุก key ใน compact.data (build-prompt.ts:2420–2441) ไม่มี `timingTimeline`
- ✅ **ยืนยัน:** บรรทัด 2782 ยกให้ JSON เป็นแหล่งอ้างอิงหลัก ("field ใน STRUCTURED_CHART_PACKET เท่านั้น") → การหลุดจึงมีผลจริงต่อคำตอบระดับวัน/เดือน
- ✅ **ยืนยัน:** ผังพื้นดวง + 行限 + 化曜 + transit(木土) + คัมภีร์ = ส่งครบทั้ง prose + JSON
- ⚠️ **ยังไม่ยืนยัน (ต้องรัน/ทดสอบจริงถึงจะฟันธง):** พฤติกรรม AI จริงว่ามันหลบวันเจาะจงมากน้อยแค่ไหนเมื่อ timeline อยู่แค่ prose — ต้อง dump prompt จริง (`SIFU_DUMP_PROMPT=1`) + ดูคำตอบ ก่อน/หลังแก้ เทียบกัน (ยังไม่ได้ทำในรอบ audit นี้เพราะ read-only)
- **หมายเหตุ minor ที่ไม่ฟันธงว่าเป็นบั๊ก:** `houses12.th`/`houses12.note` ตัดจาก JSON = ตั้งใจบีบ budget · ไม่ใช่การสูญข้อมูลตัดสิน
