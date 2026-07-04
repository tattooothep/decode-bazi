# r2L-7 · structuredPacketJson cross-cut audit (5 ศาสตร์ fusion)

**โหมด:** READ-ONLY audit · ไม่แก้โค้ด · ไม่แตะ production
**ไฟล์ที่ตรวจ:** `src/lib/fusion5/build-prompt.ts` — `function structuredPacketJson(packet)` (บรรทัด 2409–2630)
**ต้นเรื่อง:** ก่อน r392 ยูเรเนียน "ตัด field ทิ้งจาก JSON" ทั้งที่ prose พูดถึง → AI ตอบไม่ครบ. ตรวจว่าศาสตร์อื่นยังมีอาการเดียวกันหรือไม่

---

## 0. โครงจริง — structuredPacketJson มี 4 branch + 1 fall-through

ต่างจากที่ task ระบุ (บรรทัด 833/1008/1829/2013/2188 = เวอร์ชันเก่า) ปัจจุบันรวมเป็นฟังก์ชันเดียว:

| ศาสตร์ | จุด | วิธี serialize |
|---|---|---|
| qizheng | branch 2410 | **compact เลือก field เอง** (มีโอกาสตัด) |
| western | branch 2445 | **compact เลือก field เอง** |
| vedic | branch 2515 | **compact เลือก field เอง** |
| uranian | branch 2572 | **compact เลือก field เอง** (แก้แล้ว r392) |
| ziwei | **ไม่มี branch** → `return JSON.stringify(packet)` (2629) | **raw ทั้ง packet** (ไม่ตัดอะไรเลย) |

จุดสำคัญ: 3 ศาสตร์ (qizheng/western/vedic) ยังตัด field แบบ "เงียบ" เหมือนบั๊กยูเรเนียนก่อน r392 — และตัดตัวเดียวกันหมด คือ **`data.timingTimeline` (ชั้นเวลา/timing ทั้งก้อน)**

---

## 1. ตารางเทียบ field ที่ตัดทิ้งจาก JSON (packet.data → compact JSON)

| ศาสตร์ | field ใน packet.data ที่ **ไม่ถูกส่งเข้า JSON** | เนื้อในที่หาย | prose (render.ts) พูดถึงไหม | สรุป |
|---|---|---|---|---|
| **western** | **`timingTimeline`** | `transitHits` (ดาวจรแม่นรายวัน), `transitHitsDropped`, `ingresses`, `stations` (พักร์/เดินตรง), `eclipses` (สุริย/จันทรคราส + hitNatal), `solarReturn` (ผังปีเกิดใหม่), `profection` (segment ต่ออายุ + Lord of Year), `progressed` (+`progressedAspects`, `moonPerfections` รายเดือน) | ✅ render.ts:211–245 เรนเดอร์เต็ม + บรรทัด 82 `TIMING_GUARD` สั่ง AI ตรง ๆ ว่า "จังหวะเวลาให้อ้างจาก TIMING_TIMELINE เท่านั้น" | 🔴 **ตัด — ขัด prose รุนแรงสุด** |
| **vedic** | **`timingTimeline`** | `dashaTimeline` (ทศา 3 ชั้น maha→antar→pratyantar ตลอดปี), `transitSegments` (Saturn/Jupiter/Rahu/Ketu/Mars ราย段 + bindu), `sadeSati` (3 เฟส), `varshaphala` (ผังปีเกิด + muntha) | ✅ render.ts:192–207 เรนเดอร์เต็ม | 🔴 **ตัด — ขัด prose** |
| **qizheng** | **`timingTimeline`** | `liuNianStars` (流年ดาวจรครบดวง + เทียบ命主), `months` (流月 太陽過宮 + ดาวเร็ว), `hits` (วันดาวจรชน命度/身度/命主) | ✅ render.ts:56–65 เรนเดอร์เต็ม | 🔴 **ตัด — ขัด prose** |
| **uranian** | `data.halbsummen` (raw) เท่านั้น | ครึ่งผลรวมดิบ (ตั้งใจตัดเพราะ budget) | มีป้าย stub `halbsummenOmitted:"budget_only__see_planetaryPictures_and_sensitivePoints"` บอก AI ว่า engine คำนวณแล้ว | 🟢 **ไม่ใช่บั๊ก** — r392 เติม `auslosung`/`tnpPoints`/`tnpPlanetaryPictures`/`tnpSensitivePoints`/`personalPoints` กลับครบ · ตัดเฉพาะ raw ที่มี stub ชี้ทาง |
| **ziwei** | — (ไม่ตัดอะไร · ส่ง raw) | — | ✅ render.ts เรนเดอร์ liuNian/liuYue/liuRi/overlay + JSON มีครบ | 🟢 **ไม่ใช่บั๊ก** (แต่กลับด้าน: raw = ไม่ compact = เปลือง token) |

> หมายเหตุย่อย western: `transits` ใน JSON ส่งแค่ `refDate` + `aspectsToNatal` (ตรงกับ type `WesternTransits` — ไม่ตัด) · การหายอยู่ที่ `timingTimeline` (ชั้นปีเป้าหมาย) ล้วน ๆ

---

## 2. instruction ที่บังคับ AI ยึด JSON (= ตัวทำให้ prose-only data ถูกทิ้ง)

**บรรทัด 2782** (`src/lib/fusion5/build-prompt.ts`):

```
"คำตอบต้องสอดคล้องกับคัมภีร์/กฎ/SOURCE_MAP ที่แนบมาและ field ใน STRUCTURED_CHART_PACKET เท่านั้น ·
 ห้ามใช้ความรู้ทั่วไปนอก packet มาเติมคำฟันธง"
```

(comment ที่ 2577 อ้าง "บรรทัด ~2699 สั่ง AI ยึด field ใน STRUCTURED_CHART_PACKET" = อ้างถึงกฎเดียวกันนี้ · เลขบรรทัดในคอมเมนต์ล้าสมัย)

**กลไกบั๊ก (เหมือนยูเรเนียนก่อน r392):**
1. render.ts เขียนชั้นเวลาลง **prose** เต็ม (transitHits/dasha/流月 ฯลฯ)
2. `structuredPacketJson` **ไม่ใส่** `timingTimeline` ลง JSON
3. instruction 2782 ยก **STRUCTURED_CHART_PACKET (JSON) เป็น field ที่ยึดได้** → prose ที่ไม่มีใน JSON กลายเป็น "นอก packet" โดยปริยาย → AI ลดน้ำหนัก/ทิ้ง
4. **western หนักซ้ำ:** prose บรรทัด 82 สั่ง "อ้างจาก TIMING_TIMELINE เท่านั้น" แต่ JSON authority ไม่มี timeline → **สองคำสั่งขัดกันในprompt เดียว** → AI สับสน ตอบวัน/เดือนไม่ได้

---

## 3. จัดอันดับความรุนแรง (ตัดเยอะ/กระทบ user มากสุด → น้อยสุด)

| อันดับ | ศาสตร์ | เหตุผล |
|---|---|---|
| 🥇 **หนักสุด** | **western** | timeline รวย 8 ก้อนย่อย (transit แม่นรายวัน/solarReturn/profection/progression/eclipse/station) = ข้อมูล "จะเกิดเมื่อไหร่" ที่ user ถามมากสุด · **มี prose+instruction ขัดกันเอง** (TIMING_GUARD vs 2782) |
| 🥈 | **vedic** | `dashaTimeline` = หัวใจการพยากรณ์เวลาของพระเวท (user พระเวทถามทศาเป็นอันดับ 1) + sade sati + varshaphala หายทั้งชุด |
| 🥉 | **qizheng** | 流年全星 + 流月太陽過宮 + วันดาวจรชนจุด หายหมด · ตอบ流年/流月/วันไม่ได้ (แต่ field ย่อยน้อยกว่า western/vedic) |
| — | uranian | 🟢 แก้แล้ว r392 (ตัดเฉพาะ raw ที่มี stub ชี้ทาง) |
| — | ziwei | 🟢 ไม่ตัด (ส่ง raw) · ปัญหากลับด้าน = เปลือง token |

**สรุปทิศทางคำบ่น user:** ทั้ง 3 (western/vedic/qizheng) จะออกอาการเดียวกัน — "ถามว่าเรื่องจะเกิดเดือนไหน/ปีไหน แล้วตอบกว้าง ๆ ไม่ยอมฟันวัน" ทั้งที่ engine คำนวณ timeline ไว้ครบใน prose · western บ่นหนักสุดเพราะข้อมูล timing รวยสุด + prompt ขัดกันเอง

---

## 4. ร่างแนวแก้รวม (additive · เติม field กลับ — ยังไม่ลงมือ)

หลักเดียวกับที่ r392 ใช้กับยูเรเนียน (เติม `auslosung` เข้า JSON เป็น array ย่อ เลขล้วนคุม budget):

1. **western branch (~2492):** เติม `timingTimeline` เข้า JSON แบบ compact array — เก็บ `transitHits[dateISO,transitTh,aspectTh,natalTh,pass/passesTotal]`, `solarReturn`, `profection.segments`, `progressed.progressedAspects/moonPerfections`, `stations`, `eclipses` · slice คุมจำนวนเหมือน uranian (`.slice(0,N)`)
2. **vedic branch (~2531):** เติม `timingTimeline` — `dashaTimeline`, `transitSegments` (+bindu), `sadeSati.phases`, `varshaphala`
3. **qizheng branch (~2420):** เติม `timingTimeline` — `liuNianStars`, `months`, `hits`
4. **หลักการ:** additive ล้วน — ไม่ถอด field เดิม, ไม่แตะ render.ts (prose คงเดิม), ไม่แตะ instruction 2782 · แค่ทำให้ JSON = prose (ปิดช่องขัดกัน)
5. **budget:** ใช้ array ย่อ + slice + ปัดทศนิยม (แบบ uranian auslosung/points) · ไม่ส่ง object ซ้อนลึก
6. **western เพิ่ม:** เมื่อ JSON มี timeline แล้ว TIMING_GUARD (render.ts:82) กับ instruction 2782 จะเลิกขัดกันเอง
7. **ziwei (แยกประเด็น):** พิจารณาทำ compact branch เพื่อลด token — คนละบั๊ก ไม่เร่ง
8. **หลังแก้ต้อง:** golden ต่อศาสตร์ (ถามคำถามเชิงเวลา แล้วเช็คว่า AI อ้างวัน/เดือนจาก timeline ได้) + วัดขนาด prompt ไม่บวมเกิน budget

---

## 5. ยืนยัน

- ✅ ไม่แก้โค้ดใด ๆ · อ่านอย่างเดียว
- ✅ เขียนไฟล์เดียวตามสั่ง: `data/library/astro-canon/_packet-audit/r2L-7-structuredjson-crosscut.md`
- ✅ ไม่บอกตรง ๆ (เป็น audit + ร่างแนวแก้ · ยังไม่ลงมือ · รอเจ้านายเคาะ)
