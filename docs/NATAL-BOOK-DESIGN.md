# หนังสือดวงชะตา 6 ศาสตร์ — Natal Book · Design Spec

Status: **เฟสออกแบบ (design + prompt เท่านั้น · ยังไม่ build backend/UI เต็ม)** · รอเจ้านายเคาะ
Author: จาวิส · 4 ก.ค. 2026
Scope: `/root/decode-app` · ต่อยอดจาก fusion5 (ดูดวง 6 ศาสตร์) โดย **reuse ให้มากสุด · ไม่แตะ engine/sifu LOCKED**

---

## 0. แนวคิดหลัก (หนึ่งประโยค)

fusion5 ปัจจุบัน = **ถาม-ตอบ (Q&A)** ต่อ 1 คำถาม → 6 panel + judge
Natal Book = เอา pipeline เดิม **สลับโหมด** จาก "ตอบคำถาม" เป็น **"อ่านเต็มทุกมิติ"** แล้วเย็บ 6 บท + บทหลอมรวม + บทจังหวะเวลา → **เล่มเดียว อ่านในเว็บ + โหลด PDF**

> reuse: engine/packet/คัมภีร์/panel/judge/resonance/day-sniper/multi-year = ของเดิมทั้งหมด
> ของใหม่: (1) โหมด `book` ใน build-prompt · (2) prompt "อ่านเต็ม" 6 ไฟล์ + judge-book · (3) assembly เป็นเล่ม · (4) ตาราง `natal_books` · (5) หน้า `/book` render + print-PDF

---

## 1. โครงเล่ม (Book Structure)

เล่มหนึ่ง = ดวงเดียว (โหมดเดี่ยว · ไม่ใช่ดูคู่) · เรียงบทดังนี้:

```
┌─ ปก (Cover)
│    ชื่อเจ้าชะตา · วันเวลาเกิด (สุริยคติ + จันทรคติจีน) · สถานที่เกิด (lat/lng + ชื่อเมือง)
│    ผังย่อ: 4 เสาปาจื้อ + ลัคนา/อาทิตย์/จันทร์ (western) + ธาตุเด่น · โลโก้ hourkey
│    วันที่ออกเล่ม · เลขเล่ม (book id) · QR ลิงก์กลับหน้าเว็บ
│
├─ สารบัญ (Table of Contents) — ลิงก์ anchor ไปแต่ละบท
│
├─ บทนำ (Preface) — สั้น: หนังสือนี้คืออะไร · 6 ศาสตร์อ่านคนละมุมอย่างไร · วิธีอ่าน (ไม่ใช่คำสั่งชีวิต)
│
├─ บทที่ 1  ปาจื้อ 八字            ← read-full-bazi
├─ บทที่ 2  จื่อเวยโต่วซู 紫微斗數   ← read-full-ziwei
├─ บทที่ 3  ดาวจริง 七政四餘        ← read-full-qizheng
├─ บทที่ 4  โหราตะวันตก            ← read-full-western
├─ บทที่ 5  โหราพระเวท             ← read-full-vedic
├─ บทที่ 6  ยูเรเนียน (Hamburg)     ← read-full-uranian
│     (แต่ละบท = 1 panel · อ่านครบ 10 มิติ ด้วยศัพท์+คัมภีร์ของศาสตร์ตัวเอง)
│
├─ บทหลอมรวม (Synthesis)          ← judge-book
│     ธีมชีวิต · เสียงสะท้อนข้ามศาสตร์ (RESONANCE_PACKET) · ฟันธงภาพรวม · ยุทธศาสตร์ชีวิต
│
├─ บทจังหวะเวลา (Timing)          ← multi-year + day-sniper (deterministic) + สรุปโดย judge
│     ไทม์ไลน์หลายปี (ช่วงวัย/ปีสำคัญ) · วันลั่นไก (day-sniper) · หน้าต่างโอกาส/ระวัง
│
└─ ภาคผนวก (Appendix)
      ผังดิบทุกศาสตร์ (STRUCTURED_CHART_PACKET ย่อ อ่านได้) · รายการคัมภีร์ที่อ้าง (SOURCE_MAP)
      คำเตือน/disclaimer · วิธีคำนวณ (TST/節氣/sidereal) · หน้าเครดิต
```

**หลักการเนื้อหาบท 1-6 (บังคับ · ต่อบท ต้องครบ 10 มิติ):**
ตัวตน/บุคลิก · การงาน/อาชีพ · การเงิน/ทรัพย์ · ความรัก/คู่ครอง · สุขภาพ · ครอบครัว(พ่อแม่/บุตร) · สติปัญญา/การศึกษา · จังหวะชีวิต/ช่วงวัย · จุดแข็ง-จุดอ่อน · คำแนะนำ
— ทุกมิติ **อ้างหลักฐานจากผังจริง** (decisive · NO_PERCENT · ไม่กั๊ก · เฉพาะเจาะจงคนนี้) · **termGuard เดิมกันปนศาสตร์**

---

## 2. Flow Generation (reuse fusion5 อย่างไร)

### 2.1 ต่างจาก fusion5 ตรงไหน

| | fusion5 (Q&A · ปัจจุบัน) | Natal Book (ใหม่) |
|---|---|---|
| trigger | 1 คำถามผู้ใช้ | ไม่มีคำถาม → "อ่านเต็มทุกมิติ" |
| จำนวนดวง | 1-4 (เดี่ยว/คู่/กลุ่ม) | **1 ดวงเท่านั้น** (เล่มส่วนตัว) |
| panel prompt | `buildSciencePrompt(...question...)` | `buildSciencePrompt(...bookMode...)` — swap question → read-full directive |
| judge prompt | `buildJudgePrompt(...question...)` | `buildJudgeBookPrompt(...)` — สังเคราะห์เป็นบท |
| output | reply เดียว | เล่ม (6 บท + หลอมรวม + จังหวะ) |
| เก็บผล | `fusion5_jobs` | `natal_books` (ใหม่) — โหลดซ้ำไม่เจนใหม่ |

### 2.2 pipeline (reuse ตรงๆ)

```
วันเกิด (profileId · org-scoped loadBirth เดิม)
  → 6 panel ขนาน (Promise.all เหมือน processFusion5)
      แต่ละ panel: buildSciencePrompt(science, [birth], BOOK_DIRECTIVE, lang, refDate, {bookMode:true})
        → engine เดิม (renderChartForScience) → คัมภีร์เดิม (loadCanonBundle) → callSifu → AI ตาม registry
  → judge: buildJudgeBookPrompt(6 บท, birth, resonance, daySniper, multiYear) → JUDGE_MODEL
  → assembleBook(cover, panels, judge, timing, appendix) → HTML/JSON
  → เก็บ natal_books.result (jsonb)
```

**reuse ไม่สร้างซ้ำ:**
- `loadBirth()` (org guard · gender "F"/"M" mapping) — copy pattern จาก route.ts
- `callSifu()` + `internalToken()` + `authCookie()` — เรียก /api/sifu ผ่าน INTERNAL_BASE (LOCKED · ไม่แตะ)
- `DISCIPLINES` registry + `renderChartForScience()` + `loadCanonBundle()` + `selectCanonFilesForPrompt()`
- `buildResonance()` / `buildDaySniper()` / `renderMultiYearBlock()` — deterministic ทั้งหมด
- guest bazi: `buildGuestBaziPanelPrompt()` (ถ้ารองรับดวงชั่วคราวในเฟส 2)
- job pattern: detached worker + refund + reconcileStaleJob + markJobSeen (copy จาก fusion5)

### 2.3 async job (ใช้เวลาหลายนาที)

- เล่มเต็ม = 6 panel + 1 judge = 7 AI call หนัก → **ต้อง async** (เหมือน fusion5 job)
- POST `/api/book` → สร้าง `natal_books` row status=`running` → คืน `bookId` ทันที → worker detached
- GET `/api/book?id=` poll จน status ∈ {done, degraded, error} · deliver-once ผ่าน `seen_at`
- panel พังบางตัว → บทนั้นขึ้น "ยังไม่พร้อม" + refund yam ของบทนั้น (partial · เหมือน fusion5)
- reconcile stale/orphan (server restart) → refund + error (copy `reconcileStaleJob`)

### 2.4 ตาราง `natal_books` (ใหม่ · additive · ไม่แตะตารางเดิม)

```sql
CREATE TABLE natal_books (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  org_id      uuid,
  profile_id  uuid NOT NULL,               -- ดวงเจ้าของเล่ม (org-scoped)
  status      text NOT NULL DEFAULT 'running',  -- running|done|degraded|error
  lang        text NOT NULL DEFAULT 'th',
  sciences    text[] NOT NULL,             -- ศาสตร์ที่รันจริง (หลัง filter needsBirthTime)
  result      jsonb,                        -- {cover, chapters[], synthesis, timing, appendix, meta}
  error       text,
  yam_charged int NOT NULL DEFAULT 0,
  yam_refunded int NOT NULL DEFAULT 0,
  profile_snapshot jsonb,                   -- ชื่อ/วันเกิด/เสา ณ เวลาออกเล่ม (กันดวงถูกแก้ทีหลัง)
  seen_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_natal_books_user   ON natal_books(user_id, created_at DESC);
CREATE INDEX idx_natal_books_profile ON natal_books(profile_id);
```

> ทางเลือก reuse `fusion5_jobs` แทน: **ไม่แนะนำ** — schema/ความหมายต่าง (เล่ม ≠ คำถาม) จะทำ column ปน · ตารางใหม่คุมง่ายกว่า + additive (ไม่กระทบ LOCKED)
> `result` jsonb = โหลดซ้ำได้ทันที (ไม่เรียก AI ใหม่) · เก็บทั้ง markdown ต่อบท + packet ย่อสำหรับภาคผนวก

### 2.5 result jsonb (โครง)

```jsonc
{
  "version": "natal_book_v1",
  "cover": { "name","birthSolar","birthLunar","place","pillars","western":{asc,sun,moon}, "dominantEl" },
  "chapters": [
    { "science":"bazi","label":"ปาจื้อ 八字","ok":true,"model":"claude-max-cli",
      "markdown":"## ตัวตน...\n...", "sourceMap":"...", "packetDigest":"..." },
    ... (6 บท)
  ],
  "synthesis": { "ok":true,"model":"claude-max-cli","markdown":"...", "resonanceUsed":true },
  "timing":    { "markdown":"...","multiYear":{...},"daySniper":{...} },
  "appendix":  { "packets":{bazi:"...",western:"..."}, "sources":[...], "disclaimer":"..." },
  "meta":      { "yam":{charged,refunded}, "ms", "degradedChapters":["vedic"] }
}
```

---

## 3. Render (อ่านในเว็บ + โหลด)

### 3.1 หน้าอ่าน `/book?id=<bookId>`

- static HTML page (`public/book.html`) — โครงเดียวกับ chart.html/master-fusion.html (ไม่ใช่ Next page · เข้ากับ rewrites เดิม)
- fetch GET `/api/book?id=` → render จาก `result` (markdown → HTML ด้วย mdSafe เดิมที่ fusion ใช้ · render ตาราง/หัวข้อ)
- โครงหน้า: ปกเต็มจอ → สารบัญ sticky ข้าง → บทเลื่อนยาว (scroll-spy) · ปุ่ม "โหลด PDF"
- **3 ภาษา** (th/en/zh · ธีมป้าย UI) + **2 ธีม** (light/dark) — reuse ชุด i18n/theme เดิมของ master-fusion
- resume: เปิด `/book?id=` ซ้ำ = โหลด `result` เดิม **ไม่เจนใหม่ ไม่หักยาม**
- ระหว่าง running → หน้าโชว์ progress "กำลังเขียนบท X/7..." (poll)

### 3.2 โหลดไฟล์

- **เฟส 1 = print-to-PDF ของ browser**: ปุ่ม "โหลด PDF" → `window.print()` + `@media print` CSS (ตัด nav/ปุ่ม · ขึ้นหน้าใหม่ต่อบท `page-break-before` · ใส่เลขหน้า/หัวเล่ม) → user "Save as PDF"
  - ข้อดี: ไม่มี dependency ใหม่ · เร็ว · ได้ทันที
  - ข้อจำกัด: หน้าตาขึ้นกับ browser · ปกไม่หรูเท่า
- **เฟส 2 = server PDF** (สวย+ปก+ของขวัญ) — ดู §6

---

## 4. ยาม/เครดิต (คิดจาก computeYam เดิม)

เล่มเต็ม = อ่านครบ 6 ศาสตร์ + judge → **ฐาน = `computeYam(sciences, 1)`** (โหมดเดี่ยว 1 ดวง)

```
Σ costYam ต่อศาสตร์ (bazi 10 + ziwei 12 + qizheng 15 + western 10 + vedic 10 + uranian 12) = 69
+ JUDGE_YAM (5)                                                                              =  5
รวมฐาน fusion5 6 ศาสตร์ + judge                                                              = 74 ยาม
```

**ข้อเสนอราคาเล่ม (ให้เจ้านายเคาะ):**
- เล่มอ่านเต็มยาว/ลึกกว่า Q&A มาก (แต่ละ panel เขียน 10 มิติ ~ ยาว 3-5 เท่า) → เสนอ **book multiplier ×1.5** บน panel (bazi..uranian) เพราะ token output ต่อบทสูงกว่าคำตอบ Q&A
  - = round(69 × 1.5) + judge-book(เขียนยาว → ×2 = 10) ≈ **104 + 10 ≈ 114 ยาม/เล่ม**
- หรือ **ตั้งราคาเหมา (flat)** = 120 ยาม/เล่ม (อ่านง่าย ขายง่าย · กันขาดทุน token)
- **timing/resonance/day-sniper = deterministic (ไม่คิดยาม)** · judge เขียน timing รวมในบท synthesis
- partial refund: บทใดพัง (panel !ok) คืน yam ของศาสตร์นั้น (× book multiplier) — เหมือน fusion5
- resume โหลดซ้ำ = **ฟรี** (อ่านจาก result)

> เสนอ: ใช้ helper ใหม่ `computeBookYam(sciences)` = `round(Σcost×1.5) + 10`, wrap `computeYam` เดิม (ไม่แก้ของเดิม)

---

## 5. Phasing

### เฟส 1 (ขอเคาะรอบนี้ = prompt + assembly + HTML + print-PDF)
1. prompt "อ่านเต็ม" 6 ไฟล์ + judge-book (ไฟล์ md · แก้ผ่าน admin ได้ · เอกสารนี้ส่งมอบแล้ว)
2. โหมด `bookMode` ใน `buildSciencePrompt` (additive flag · ไม่กระทบ Q&A เดิม) + `buildJudgeBookPrompt`
3. route ใหม่ `POST/GET /api/book` (copy job pattern จาก fusion5 · ไม่แตะ fusion5/route.ts)
4. ตาราง `natal_books` (migration additive)
5. `public/book.html` — render + สารบัญ + 3 ภาษา 2 ธีม + `@media print` (print-to-PDF)
6. rewrite `/book` (next.config.ts · additive)

### เฟส 2 (ทีหลัง = ของขวัญ/พรีเมียม)
- server-side PDF สวย (ปกกราฟิก · ผังวาดจริง · ฟอนต์ฝัง · เลขหน้า/สารบัญคลิกได้)
- ตัวเลือก engine: `@react-pdf/renderer` หรือ headless-chrome (puppeteer) render `/book?id=&print=1` → PDF
  - ⚠️ landmine: puppeteer = dependency หนัก + ต้อง chrome ใน container · ต้องประเมิน disk (ตอนนี้ 94%) ก่อน
- ปกแบบ "ของขวัญ" · หน้าอุทิศ · ภาพผัง luopan/ผังดาว · แชร์ลิงก์เล่ม (public token · opt-in)
- รองรับดวงชั่วคราว (guest birth) → เล่มของขวัญให้คนอื่น (reuse buildGuestBaziPanelPrompt)

---

## 6. reuse ↔ LOCKED (สรุปจุดสำคัญ)

### ✅ reuse (ห้ามสร้างซ้ำ)
- `src/lib/fusion5/disciplines.ts` — registry/computeYam (wrap เพิ่ม `computeBookYam` เท่านั้น)
- `src/lib/fusion5/build-prompt.ts` — `renderChartForScience`, `loadCanonBundle`, `selectCanonFilesForPrompt`, `resolveFusionTimingReference`, contracts (DECISIVE/SPECIFIC/MARKDOWN) → **เพิ่ม bookMode + buildJudgeBookPrompt (additive · ไม่ลบของเดิม)**
- `src/lib/fusion5/{resonance,day-sniper,multi-year}.ts` — deterministic (เรียกตรง)
- `src/lib/astro/*/render.ts` + `packet.ts` — engine ทุกศาสตร์ (เรียกผ่าน renderChartForScience เดิม)
- job pattern จาก `src/app/api/sifu/fusion5/route.ts` — copy (loadBirth/callSifu/refund/reconcile/markSeen)
- mdSafe/i18n/theme จาก master-fusion.html

### ⛔ LOCKED — ห้ามแตะในเฟสนี้ (และเฟสหลังต้องถามก่อน)
- `/api/sifu/route.ts` (SIFU-PIPELINE LOCKED · เรียกผ่าน callSifu เท่านั้น · ห้ามแก้ prompt builder)
- `/api/sifu/fusion5/route.ts` (route แยก · ห้ามแก้ · book = route ใหม่)
- engine Layer 0-2: `bazi-calc.ts`, `tyme-tst.ts`, `chart-packet.ts`, `wrappers/*`, `chart-extensions.ts`, `chart-table.ts`
- ref_* tables + `/api/admin/*`, `/api/formulas/*`, `/api/dictionary/*`, `/api/auth/me`
- คัมภีร์ `data/library/astro-canon/*` + `bazi-interaction-master.md` (อ่านอย่างเดียว · ห้ามตัด/เจือจาง)

> หลักการ: **book = layer ประกอบ (assembly) ที่นั่งบน fusion5 · ไม่ล้วงเข้า engine/sifu** — เหมือน fusion5 นั่งบน /api/sifu

---

## 7. Integration point ของ bookMode (ออกแบบ · ยังไม่เขียน)

`buildSciencePrompt` เพิ่ม param option `{ bookMode?: boolean }` (ค่า default false = Q&A เดิม · ไม่กระทบ):

เมื่อ `bookMode=true`:
- `question` = `BOOK_READ_FULL_DIRECTIVE` (โหลดจาก `read-full-{science}.md` · ผ่าน loadPromptMd · แก้ admin ได้)
- **คง**: `bind.termGuard`, `subjectLockLine` (เดี่ยว), `DECISIVE_READING_POLICY`, canon, `renderChartForScience`, timing block, `MARKDOWN_FORMAT_CONTRACT`
- **swap**: `SPECIFIC_READING_CONTRACT` → ยังคงไว้ (ยังต้อง decisive/เฉพาะคน) **+ เพิ่ม** BOOK dimension checklist จาก md
- **swap**: `answerFormatLine` → `BOOK_CHAPTER_FORMAT` (หัวข้อ ## 10 มิติ + ปิดท้ายจุดเฉพาะ)
- ปิด "โหมดเดี่ยว/ดูคู่" pair packet (book = 1 ดวงเสมอ)

`buildJudgeBookPrompt(chapters, birth, lang, resonanceBlock, daySniperBlock, multiYearBlock)`:
- เหมือน `buildJudgePrompt` แต่ input = 6 บทเต็ม (ไม่ใช่คำตอบ Q&A) · output = บท synthesis + timing
- reuse `FUSION_JUDGE_SYNTHESIS_CONTRACT` + `resonanceBlock`/`daySniperBlock` เดิม
- panel reply ต่อบทยาว → cap ต่อบท (JUDGE_PANEL_REPLY_MAX ปรับขึ้นสำหรับ book หรือย่อบทก่อนส่ง judge)

---

## 8. ประเมิน token / เวลา / ความเสี่ยง

### 8.1 token/เวลา (คร่าว · ต่อเล่ม)

| ส่วน | input (prompt) | output | หมายเหตุ |
|---|---|---|---|
| panel/บท × 6 | ~30-118K chars/บท (canon+packet · cap 118K เดิม) | ~2-4K คำ/บท | คัมภีร์ยาว (uranian 140 ไฟล์) → ชน cap 118K |
| judge-book | 6 บทย่อ (~8K/บท × 6 = 48K) + resonance | ~1.5-2.5K คำ | อาจต้องย่อบทก่อนส่ง |
| **รวม** | ~7 call หนัก | เล่ม ~15-25K คำ (~40-70 หน้า A4) | |

- เวลา: panel ขนาน (Promise.all) → คอขวด = panel ช้าสุด (uranian/qizheng canon ใหญ่) ~2-5 นาที · + judge 1-2 นาที → **รวม ~4-8 นาที/เล่ม** (async job จำเป็น)
- CHILD_TIMEOUT ปัจจุบัน 360s/call · maxDuration 800s → **panel ขนาน(360) + judge(360) = 720 < 800 ✓** (แต่ judge-book ยาวกว่า → เฝ้า timeout · อาจต้องแยก judge เป็น call ที่ 2 ของ worker)

### 8.2 ความเสี่ยง + กัน

| ความเสี่ยง | ผล | กัน |
|---|---|---|
| prompt ยาวชน cap 118K | canon ถูก truncate → เนื้อบางลง | มี shrink loop เดิมใน buildSciencePrompt แล้ว · book เลือก canon ด้วย selectCanonFiles (เจาะ 10 มิติ) |
| judge input ใหญ่ (6 บทเต็ม) | ชน cap → ตัดคำสั่งท้าย | ย่อบทเหลือ ~6-8K/บท ก่อนส่ง judge (reuse JUDGE_PANEL_REPLY cap) |
| timeout 1 panel | บทหาย → เล่ม degraded | partial: บทขึ้น "ยังไม่พร้อม · เจนซ้ำเฉพาะบท" + refund |
| cost สูง (7 call ×1.5) | ยาม/เงินเยอะ | ราคา ~114-120 ยาม · แจ้งชัดก่อนกด · resume ฟรี |
| AI เขียนกว้าง/ตำราลอย | เล่มอ่านเหมือน horoscope | SPECIFIC_READING_CONTRACT + BOOK checklist บังคับ anchor ทุกมิติ (ดู prompt) |
| ปนศัพท์ข้ามศาสตร์ | บท western พูด 用神 | termGuard เดิม (ต่อศาสตร์) + ย้ำใน read-full md |
| ดวงถูกแก้หลังออกเล่ม | เล่มไม่ตรงผัง | profile_snapshot + packetDigest เก็บ ณ ออกเล่ม |
| disk 94% | เก็บ jsonb เยอะ | result jsonb เล่มละ ~100-200KB · ตั้ง retention/ลบเล่มเก่าได้ · เฟส 2 PDF ไม่เก็บไฟล์ (gen on-demand) |

---

## 9. สิ่งที่ส่งมอบเฟสนี้ (ไฟล์)

- `docs/NATAL-BOOK-DESIGN.md` (ไฟล์นี้)
- `data/library/prompts/natal-book/read-full-bazi.md`
- `data/library/prompts/natal-book/read-full-ziwei.md`
- `data/library/prompts/natal-book/read-full-qizheng.md`
- `data/library/prompts/natal-book/read-full-western.md`
- `data/library/prompts/natal-book/read-full-vedic.md`
- `data/library/prompts/natal-book/read-full-uranian.md`
- `data/library/prompts/natal-book/judge-book.md`

**ยังไม่ทำ (รอเคาะ):** โค้ด route/bookMode/ตาราง/หน้าเว็บ/migration — **ไม่แตะ engine/sifu/fusion5 ในเฟสนี้**
</content>
