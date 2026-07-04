# r2L-8 · Audit คัมภีร์ (canon) แต่ละศาสตร์ส่งเข้า AI เต็มไหม — หรือถูกตัดเพราะ budget

READ-ONLY audit · **ไม่มีการแก้โค้ด** · ตรวจ `src/lib/fusion5/build-prompt.ts` (fusion5 panel prompt)

ไฟล์/สัญลักษณ์ที่ตรวจ:
- `CANON_TEXT_MAX_CHARS = 56_000` (build-prompt.ts:49) · `CANON_TEXT_MIN_CHARS = 4_000` (:50)
- `ZIWEI_SIHUA_CANON_EXTRA_CHARS = 2_000` (:52) → ziwei budget = 58,000
- `FUSION_PANEL_PROMPT_MAX_CHARS = 118_000` (:54)
- `CANON_DEFAULT_FILES` (:367) · `CANON_ROUTER_BASE_FILES` (:624) · `selectCanonFilesForPrompt` (:827)
- `CANON_FILE_SECTIONS` section splitter (:448) · `loadCanonBundle` (:2347)
- shrink loop + tail-cut (:2835-2850) · SOURCE_MAP/SOURCE_ROUTER render (:2789-2794)

หน่วยที่ code ใช้ตัด = **จำนวน "ตัวอักษร" (JS string .length = UTF-16 code unit)** ไม่ใช่ byte. จีน/ไทย 1 อักษร = 1 code unit (แต่ 3 byte) → ตัวเลขข้างล่างวัดด้วย `.length` จริง (ตรงกับที่ code ใช้)

---

## สรุปผู้บริหาร (5 บรรทัด)

1. **คัมภีร์ถูกตัดจริง และตัดแบบ "เงียบ" — AI ไม่รู้ว่าขาด.** กลไกตัด = ต่อไฟล์ตามลำดับใน list แล้ว `break` เมื่อชนเพดาน → ไฟล์ที่อยู่ **ท้าย list ถูกทิ้งทั้งไฟล์** และ **ไม่โผล่ใน SOURCE_MAP เลย** (loop break ก่อนถึง). AI จึงไม่มีทางรู้ว่ามีคัมภีร์ที่ควรมาแต่หายไป.
2. **ziwei + western คือกลุ่มเสี่ยงสูงสุด** — ไฟล์ base router อย่างเดียวกินเพดานเกือบหมด (ziwei 50.9K/58K · western 54.8K/56K) → **ตำราแม่บทฉบับ verbatim (紫微斗數全書 / Lilly Christian Astrology / Tetrabiblos) ถูกทิ้งเกือบทั้งก้อน** ในคำถามทั่วไป/ดูดวงกำเนิด.
3. **ตัดแบบ "ตัดท้าย list + ตัดหางไฟล์"** ไม่ใช่ตัดเลือก section (ยกเว้น 4 ไฟล์ที่มี splitter). ลำดับไฟล์ = ตัวตัดสินว่าใครรอด. ไฟล์ verbatim ที่ **ไม่ถูก `prioritizeAfterMethod`** จะจมอยู่ท้าย list → ตายก่อน.
4. **คำถามที่ทำให้ตัดหนัก:** ดูกลุ่ม 2-4 ดวง · โหมดหนังสือ (bookMode อ่านเต็ม 10 มิติ) · ถามหลายปี (multiYear) · คำถามธุรกิจที่แตะหลาย intent. เคสพวกนี้ shrink loop ลาก `maxCanon` ลงได้ถึง **4,000 ตัวอักษร** (เหลือแค่ 00-method + เศษ).
5. **ป้ายเตือนที่ AI จับได้ = แทบไม่มี.** SOURCE_ROUTER (รายชื่อที่ "เลือก") vs SOURCE_MAP (รายชื่อที่ "เข้าจริง") ต่างกัน = สัญญาณว่าโดนตัด — แต่ **ไม่มีคำสั่งบอก AI ให้เทียบ 2 บรรทัดนี้** และ SOURCE_MAP ไม่โชว์ `totalChars` → AI เดาไม่ออกว่าขาดไปเท่าไร.

---

## กลไกตัด (ตามโค้ดจริง)

**1. เลือกไฟล์** — `selectCanonFilesForPrompt` (:827): เริ่มด้วย `CANON_ROUTER_BASE_FILES[science]` (push เสมอ ทุกคำถาม) แล้ว push ไฟล์ topic-specificity ตาม intent จากคำถาม. `bazi` = `undefined` (ไปทาง /api/sifu เดิม ไม่ผ่านที่นี่).

**2. โหลด + ตัดตามเพดาน** — `loadCanonBundle` (:2347):
```
for (const token of tokens) {
  if (text.length >= maxChars) break;        // ← ชนเพดาน = ทิ้งไฟล์ที่เหลือทั้งหมด (ไม่เข้า sourceMap)
  ... const segment = full.slice(0, remaining);  // ← ไฟล์ที่คร่อมเพดาน ถูกตัด "หาง"
}
```
→ ตัด 2 แบบพร้อมกัน: (ก) **ตัดหางไฟล์** ที่คร่อมเพดาน · (ข) **ทิ้งทั้งไฟล์** ที่อยู่ถัดจากจุดชนเพดาน (ไม่ถูกบันทึกใน SOURCE_MAP)

**3. shrink loop เมื่อ prompt รวมเกิน 118K** (:2838):
```
let maxCanon = 56000 (+2000 ถ้า ziwei);
while (prompt.length > 118000 && maxCanon > 4000) {
  maxCanon -= (เกินเท่าไร + 2000);            // ← ลดเพดานคัมภีร์ลงเรื่อย ๆ จนถึงพื้น 4000
  bundle = loadCanonBundle(..., maxCanon);
}
```
→ ผัง 4 ดวง / bookMode / multiYear = ส่วน non-canon (ผัง×N + pair packet) ใหญ่ → บีบ `maxCanon` ลงใกล้ 4,000 → **คัมภีร์เหลือแค่หัว**

**4. ตัดหัว-ท้าย (rare)** (:2844): ถ้าลด canon ถึงพื้นแล้วยังเกิน 118K → เก็บหัว 12K + marker + หาง. เคสนี้ **มี marker `[TRUNCATED_NONCRITICAL_PREFIX_FOR_PROMPT_CAP …]` ที่ AI มองเห็น** (ป้ายเดียวที่ชัดเจน · แต่ตัดกลาง prompt = คัมภีร์ช่วงกลาง + ผังต้น ๆ หาย)

**การจัดลำดับ (ตัวตัดสินว่าใครรอด):** `prioritizeAfterMethod` (:806) ดันไฟล์สำคัญขึ้นไปต่อจาก `00-method.md`; `prioritizeToFront` (:817) ดันขึ้นหัวสุด. ไฟล์ที่ `pushUnique` เฉย ๆ = ต่อท้าย = เสี่ยงตายก่อน.

---

## ตาราง: ศาสตร์ · ขนาดคัมภีร์ · ถูกตัดเมื่อไหร่ · ป้ายเตือน

| ศาสตร์ | เพดาน (chars) | base router (push เสมอ) | ตำราแม่บท verbatim (chars .length) | ถูกตัดเมื่อไหร่ | ป้ายเตือนถึง AI |
|---|---|---|---|---|---|
| **ziwei** (จื่อเวย) | 58,000 | **50,919** (9 ไฟล์) | 紫微斗數全書核心 `ziwei-quanshu-core.md` **20,969** · 星垣論/諸星問答 `07-quanshu-xingyuan-wenda.md` **14,959** · 飛星 `10-feixing-quanji.md#sihua` (จาก 8,866) | **เกือบทุกคำถาม** — base กิน 50.9K เหลือ headroom ~7K → ตำราแม่บททั้งสองถูกทิ้งเกือบหมด (push ท้าย · ไม่ prioritize สำหรับ general/timing) | ❌ ไม่มี — ไฟล์ที่ถูกทิ้งไม่โผล่ใน SOURCE_MAP |
| **western** (ตะวันตก) | 56,000 | **54,798** (6 ไฟล์) | Lilly houses `02-lilly-houses.md` **32,135** · Tetrabiblos `tetrabiblos-core.md` **27,020** · Lilly B2 `10-lilly-b2-interactions.md` **53,621** (มี splitter) | **เกือบทุกคำถาม** — base กิน 54.8K เหลือ ~1.2K → 02-lilly-houses + tetrabiblos-core ถูกทิ้งทั้งก้อน (ไม่ prioritize · natal/general). B2 รอดเฉพาะ horary (prioritizeToFront) หรือถูกตัดด้วย section token | ❌ ไม่มี (ยกเว้น B2 ที่เป็น section = truncated flag) |
| **vedic** (โหราภารตะ) | 56,000 | **44,500** (6 ไฟล์) | BPHS dasha/yoga `02-bphs-dasha-yoga.md` **31,636** · `vedic-core.md` **28,995** · BPHS yogas `10-bphs-yogas.md` **30,232** (มี splitter) | เหลือ headroom ~11.5K → BPHS yoga (section token) prioritize รอด · แต่ **02-bphs-dasha-yoga (full) + vedic-core ถูกทิ้ง**เกือบหมด (push ท้าย) | ⚠️ บางส่วน (section truncated flag) · ไฟล์ทิ้ง = ❌ |
| **qizheng** (七政四餘) | 56,000 | ~7 ไฟล์ (00-method 7.6K + …) | 格局 `03-geju.md` **16,101** · 星情 `04-xingqing.md` **10,797** · `26-xingqing-verbatim-clean.md` **8,474** · `25-shigan-huayao.md` | default 16 ไฟล์รวม >56K → ไฟล์ topic ท้าย list ถูกตัด. verbatim 25/26 มี `prioritizeAfterMethod` (interaction/talent) จึงมักรอด · ที่ตกคือ topic-specificity ปลาย ๆ | ❌ ไม่มี (สำหรับไฟล์ที่ทิ้ง) |
| **uranian** (ยูเรเนียน) | 56,000 | `01-source-policy-conclusion.md` เดียว | Witte canon `10-witte-canon-de.md` **34,836** (splitter method/tnp/timing/…) · dict-part1-5 (splitter รายดาว) · method-reading (S1-S8) | **ออกแบบมาให้ตัดปลอดภัยสุด** — ทุกไฟล์ใหญ่ผ่าน section splitter (ส่งเฉพาะดาว/หัวข้อตาม intent) · method-reading S1-S8 ตั้งใจให้ "โดน shrink ตัดก่อน" (dict sifu-reviewed คุมความหมายแทน) | ⚠️ section truncated flag (ดีกว่าเพื่อน) |
| **bazi** (ปาจื้อ) | — | — (return `undefined` :828) | — | ไม่ผ่าน fusion5 canon (ไปทาง /api/sifu + `bazi-interaction-master.md` เดิม) | อยู่นอก scope นี้ |

> **หมายเหตุลำดับ:** ในกลุ่มที่ headroom เหลือน้อย (ziwei/western) แม้แต่ไฟล์ topic-specificity ยังถูกตัด ไม่ใช่แค่ตำราแม่บท. ยิ่งคำถามแตะหลาย intent (ธุรกิจ) → push ไฟล์เยอะ → ดันตำราแม่บทลงท้ายยิ่งขึ้น → ตายก่อน.

---

## จุดเสี่ยง "ส่งคัมภีร์ไม่ครบ" (เรียงตามความรุนแรง)

1. **[สูง] AI ไม่รู้ว่าคัมภีร์ถูกตัด → อาจนึกว่าตำราไม่มีหลักข้อนั้น.** ไฟล์ที่ถูกทิ้งทั้งก้อน (budget หมดก่อนถึง) **ไม่ปรากฏใน SOURCE_MAP เลย** (loop `break` :2365 ก่อน push). ไม่มีบรรทัดไหนบอก AI ว่า "紫微斗數全書/Lilly/Tetrabiblos ถูกเลือกแต่ตัดออกเพราะ budget". เสี่ยง AI ฟันธงจากสรุป (summary files) แทนตำรา verbatim โดยเข้าใจว่านั่นคือคัมภีร์ครบแล้ว — ขัดกับกฎ [[คัมภีร์ = source of truth]] / [[Zone 0 ภาษา Sesheta เท่านั้น]].

2. **[สูง] ziwei/western: ตำราแม่บท verbatim หายเป็นค่าเริ่มต้น.** base router กินเพดานเกือบหมด → 紫微斗數全書 (20.9K) และ Lilly houses (32.1K) + Tetrabiblos (27K) แทบไม่เคยเข้า prompt ในคำถามดูดวงทั่วไป. ตรงข้ามความคาดหมายว่า "verbatim classic = แกนความแม่น".

3. **[กลาง] SOURCE_MAP โชว์ `includedChars` แต่ไม่โชว์ `totalChars`.** render (:2792) = `sourceId[license/mode/includedChars/truncated]`. AI เห็น "included 7000/truncated" แต่ไม่รู้ว่าไฟล์เต็ม 20,969 → ประเมินไม่ได้ว่าขาดกี่ %.

4. **[กลาง] คอมเมนต์ในโค้ดล้าสมัย → ประเมิน budget ต่ำเกินจริง.** `loadCanonBundle` คอมเมนต์ (:2344) เขียนว่า "qizheng มี 4 ไฟล์ ~50K · ศาสตร์อื่นไฟล์เดียว <30K". ความจริง router เลือก 10-20 ไฟล์ · ziwei base อย่างเดียว 9 ไฟล์ = 50.9K. สมมติฐานเพดาน 56K จึงไม่ครอบคลุมของจริงแล้ว.

5. **[กลาง] ดูกลุ่ม/bookMode/multiYear → shrink ลาก canon ถึงพื้น 4,000.** ผัง 4 ดวง = ผัง×4 + pair packet 6 คู่ ทำให้ non-canon ใหญ่ → while loop (:2838) บีบ maxCanon ลงใกล้ CANON_TEXT_MIN_CHARS. ที่ 4K เหลือแค่ 00-method + เศษ → คัมภีร์แทบหายทั้งหมด **แบบเงียบ** (ยังไม่ถึงขั้น tail-cut ที่มี marker).

6. **[ต่ำ] tail-cut ตัดกลาง prompt.** ถ้าเลย 118K แม้ canon = 4K → เก็บหัว 12K + หาง (:2848). ช่วงกลาง (คัมภีร์ที่เหลือ + ผังต้น ๆ) หาย. เคสนี้มี marker ที่ AI เห็น (ป้ายเดียวที่ชัด) แต่เกิดยาก.

---

## ยืนยัน: **ไม่ได้บอก AI ตรง ๆ ว่าคัมภีร์ถูกตัด** (ตรวจแล้ว)

- ไม่มี `console.*` / logger ใด ๆ ในเส้นทางตัดคัมภีร์ (grep ยืนยัน) — ตัดเงียบ ไม่มี log runtime
- ในตัว prompt:
  - `SOURCE_MAP` (:2792) = โชว์ต่อไฟล์ที่ **เข้าได้จริงเท่านั้น** + flag `/truncated` (เฉพาะไฟล์ที่โดนตัดหาง) — **ไฟล์ที่ถูกทิ้งทั้งก้อน = เงียบ ไม่มีแถว**
  - `SOURCE_ROUTER: selected_by_question=…` (:2790) = รายชื่อที่ "เลือก" (รวมไฟล์ที่ถูกทิ้งภายหลัง) → **มีสัญญาณโดยอ้อม** (selected ≠ ที่อยู่ใน SOURCE_MAP) แต่ **ไม่มีประโยคสั่ง AI ให้เทียบ/ตีความ** → AI ปกติจะไม่จับ
  - marker `[TRUNCATED_NONCRITICAL_PREFIX_FOR_PROMPT_CAP …]` (:2845) = ป้ายชัดเจนเดียว **แต่ยิงเฉพาะ tail-cut (rare)** ไม่ยิงตอนตัดคัมภีร์ธรรมดา

**สรุป: ในเคสตัดคัมภีร์ปกติ (ziwei/western/ดูกลุ่ม) AI ไม่ได้รับป้ายเตือนที่มันจะเข้าใจว่าคัมภีร์ขาด.**

---

## ร่างแก้ (ยังไม่แตะโค้ด · รอเจ้านายเคาะ)

จัดลำดับตามผลลัพธ์ต่อความแม่น/ความเสี่ยงต่ำ:

- **[R1 · เตือน AI — ผลสูง/เสี่ยงต่ำ]** ให้ `loadCanonBundle` ผลิตรายการ "ไฟล์ที่ถูกเลือกแต่ตัดออก" (เทียบ tokens กับ sourceMap) แล้วในบล็อกคัมภีร์เพิ่มบรรทัด `CANON_DROPPED_FOR_BUDGET: <ชื่อไฟล์…> — ตำราส่วนนี้ไม่ได้แนบเพราะพื้นที่จำกัด ห้ามสรุปว่าตำราไม่มีหลักข้อนี้` + สั่ง AI ว่าถ้าจำเป็นให้ระบุว่า "อิงสรุป ไม่ใช่ตัวบทเต็ม". แก้ข้อ 1+5 ตรง ๆ.
- **[R2 · โชว์ totalChars]** render SOURCE_MAP เพิ่ม `includedChars/totalChars` → AI ประเมินสัดส่วนที่ขาดได้. แก้ข้อ 3.
- **[R3 · prioritize ตำราแม่บท]** `prioritizeAfterMethod(files, "ziwei-quanshu-core.md")` (และ western `02-lilly-houses`/`tetrabiblos-core`, vedic `02-bphs-dasha-yoga`) สำหรับ intent หลัก เพื่อดันตำรา verbatim ขึ้นก่อนถูกตัด — **แต่** เพดานยังเท่าเดิม จะไปเบียด topic files แทน → ต้องคู่กับ R4.
- **[R4 · ทำ section splitter ให้ตำราแม่บทที่ยังไม่มี]** เพิ่ม `CANON_FILE_SECTIONS` ให้ `ziwei-quanshu-core.md` / `western/02-lilly-houses.md` / `tetrabiblos-core.md` / `vedic/02-bphs-dasha-yoga.md` (แบบเดียวกับ uranian/B2/BPHS-yogas) → ส่งเฉพาะบทที่ตรง intent แทนทั้งไฟล์. ลดการเบียด budget ที่ต้นเหตุ.
- **[R5 · ทบทวนเพดาน]** อัปเดตคอมเมนต์ที่ล้าสมัย (:2344) และพิจารณายก `CANON_TEXT_MAX_CHARS` เฉพาะเคสดวงเดี่ยว (มี headroom ใน 118K จริง) — ต้อง verify ไม่ชน `SIFU_FUSION_INTERNAL_MESSAGE_MAX_CHARS` (120000) ฝั่ง /api/sifu ก่อน.
- **[R6 · ปรับ r2L-3]** บันทึก r2L-3-ziwei บรรทัด 18 ระบุ "budget พอ ไม่ถูกตัด" — จริงเฉพาะ 四化斷訣 (2K extra) · **ไม่จริงสำหรับ 紫微斗數全書 core** ที่โดนตัด. ควร cross-note.

> ⚠️ ทั้งหมดแตะ `build-prompt.ts` (fusion5 · เกี่ยว /api/sifu panel) — เป็นไฟล์ pipeline ซินแส. ต้องผ่าน golden fusion + ถามเจ้านาย + review "พ่อ" ก่อนทำ ตามกฎ production gates.

---

## ยืนยันขอบเขต

- **ไม่ได้แก้โค้ดใด ๆ** — audit นี้อ่านอย่างเดียว. ตัวเลข chars ทั้งหมดวัดจากไฟล์จริงด้วย `.length` (หน่วยเดียวกับที่ code ตัด)
- ครอบคลุม: qizheng · vedic · western · ziwei · uranian (bazi อยู่นอกเส้นทาง fusion5 canon)
- ไฟล์ deliverable เดียว: `data/library/astro-canon/_packet-audit/r2L-8-canon-budget.md`
