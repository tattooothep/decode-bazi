# r2L-9 · Audit ฝั่งเวลา (ดาวจร/timeline/流年/ทศา) — ส่งเข้า AI ครบไหม?

READ-ONLY audit · **ไม่มีการแก้โค้ด** · ไฟล์ที่อ่าน:
`src/lib/fusion5/{build-prompt.ts, multi-year.ts, day-sniper.ts, resonance.ts}` +
`src/app/api/sifu/fusion5/route.ts` + `src/app/api/book/route.ts`

---

## 0. โครงจังหวะเวลามี 3 ชั้น (แยกอิสระกัน)

| ชั้น | ฟังก์ชัน | ที่วางใน prompt | ช่วงเวลา |
|---|---|---|---|
| **A. Panel timeline** (ต่อศาสตร์) | `renderChartForScience()` (build-prompt.ts:2632) | อยู่ในผังของแต่ละ panel | ปีเป้าหมายเดียว (ยกเว้น qizheng) |
| **B. Multi-year** (สรุปย่อรายปี) | `renderMultiYearBlock()` (multi-year.ts:84) | Q&A: ในตัว panel เท่านั้น · Book: เข้า judge | ช่วง ≤12 ปี (ถ้า regex จับได้) |
| **C. Resonance + Day-Sniper + Pair-Timing** (ข้ามศาสตร์/ระดับวัน) | `buildResonance` / `buildDaySniper` / `renderPairTimingBlock` | เข้า judge (Q&A+Book) + pair-timing ในตัว panel คู่ | ปีเดียว / หน้าต่าง 92 วัน |

`timingRef.targetYear` มาจาก `resolveFusionTimingReference()` (build-prompt.ts:2274) — **คืนปีเดียวเสมอ** (ปีจากวันที่/ปีในคำถาม/ปีนี้/ปีหน้า/ปีที่แล้ว หรือ default = ปีปัจจุบัน)

---

## 1. ตารางเทียบรายศาสตร์ — ดาวจร/timeline ส่งอะไร

| ศาสตร์ | Panel timeline (ชั้น A) ส่งดาวจรอะไร | ปีเดียว/หลายปี | อยู่ใน Resonance? | อยู่ใน Day-Sniper? | Multi-year (ชั้น B)? |
|---|---|---|---|---|---|
| **bazi** (ปาจื้อ) | ❌ ไม่ผ่าน `renderChartForScience` (คืน `""`) — 大運/流年 มาจาก `/api/sifu` LOCKED (buildBaziContext) ส่งแค่ **text timingNote** ปีเป้าหมาย (route.ts:508) | ปีเดียว | ❌ ไม่อยู่ (RESONANCE_SCIENCES=western/vedic/ziwei/qizheng) | เข็ม A=流日60วัน (bazi กิ่ง/ก้าน) ✅ | ❌ **ไม่มี branch bazi ใน renderMultiYearBlock** → ได้แค่ header เปล่า |
| **western** | `buildWesternTimeline(targetYear)` — exact transit(♄♃♂⛢♆♇)+SR+profection+progression+eclipse+station (build-prompt.ts:2643) | **ปีเดียว** | ✅ R2(transit) R3(คราส/ราหู) R6(♄ชน☉☽Asc) | เข็ม C=ดาวช้าจริง exact ✅ | ✅ ครบ (ดาวหนักชนจุดหลัก+คราส+profection) |
| **vedic** | `buildVedicTimeline(targetYear)` — ทศา3ชั้น+gochara+SadeSati+varshaphala (2653) | **ปีเดียว** | ✅ R2(♄♃เปลี่ยนราศี+SadeSati) R6(SadeSati) | ❌ **ไม่อยู่** (day-sniper ไม่มี dasha ระดับวัน) | ✅ ครบ (ทศา+เปลี่ยนทศา+เสาร์จร+ingress) |
| **ziwei** (จื่อเวย) | `buildZiweiPacket(refDate)` — 流年/流月/大限 overlay (2659) | **ปีเดียว** | ✅ R1(流年命宮ตกวัง) | ❌ **ไม่อยู่** | ✅ (流年命宮+化忌+大限) |
| **qizheng** (七政) | `buildQizhengPacket(qizhengTransitYears)` = **center−6…center+6 = 13 ปี** (2634, 2321) | **หลายปี (±6)** ← ต่างจากทุกศาสตร์ | ✅ R2(木土羅計火) R3(羅睺/計都) | เข็ม C ทางอ้อม (แต่ target เป็นองศา western ไม่ใช่七政) | ✅ (木/土จรเรือน+ดาวร้ายชน) |
| **uranian** (r389/r396) | `computeUranianAuslosung(y-01-01..y-12-31)` — transit ช้า/solar-arc/progressed (2668) | **ปีเดียว** | ❌ **ไม่อยู่ใน RESONANCE_SCIENCES** | เข็ม D=จุดกึ่งกลาง natal (Uranian midpoint) ✅ | ✅ **verify แล้ว: มี branch uranian** (multi-year.ts:138-147, `topNotableAusEvents(3)`/ปี · r396) |

**Day-Sniper (4 เข็ม · ไม่ใช่ per-science)** — A=流日60วัน(bazi) · B=จันทร์จริง exact · C=ดาวช้า western exact · D=จุดกึ่งกลาง Uranian · หน้าต่าง **92 วัน** (`DAY_SNIPER_MAX_DAYS=92`)

---

## 2. ตอน budget เกิน — block ไหนถูก shrink/ตัดก่อน (หัวใจของ audit)

### 2.1 Panel prompt (`buildSciencePrompt` · build-prompt.ts:2838-2850)
- shrink loop **ลดเฉพาะ canon text** (`maxCanon`) — timeline/multi-year/pair-timing **ไม่ถูกแตะในลูปปกติ**
- ถ้า canon ถึง MIN แล้วยังเกิน → emergency **head 12K + tail** (2844-2848) ตัด**กลาง prompt** (= STRUCTURED_CHART_PACKET/timeline ชั้น A เสี่ยงโดนตัด) · multi-year/pair-timing อยู่ท้าย (ก่อนคำถาม) → มักรอดใน tail

### 2.2 Judge Q&A (`buildJudgePrompt` · build-prompt.ts:2885-2894)
ลำดับตัด: **resonance ก่อน → daySniper ทีหลัง** (panel replies ตัดที่ `JUDGE_PANEL_REPLY_MAX_CHARS` ไปแล้ว)
```
if over → truncate resonanceBlock  (RESONANCE_TRUNCATED_FOR_CAP)
if over → truncate daySniperBlock  (DAY_SNIPER_TRUNCATED_FOR_CAP)
```
→ **สำหรับคำถามเรื่องเวลา resonance (R2/R3 = คลัสเตอร์ดาวจรข้ามศาสตร์) คือตัวแรกที่ถูกสังเวย**

### 2.3 Judge Book (`buildJudgeBookPrompt` · build-prompt.ts:2966-2972)
ลำดับตัด: `for (block of [resonance, daySniper, multiYear])` → **resonance ก่อน → daySniper → multiYear ท้ายสุด**
→ multi-year (ระดับปี) ได้รับการปกป้องดีสุด · resonance โดนก่อน

### 2.4 Day-Sniper block เอง (`renderDaySniperTh` · day-sniper.ts:826-835)
cap 2,500 ตัว · ตัด prio3(เหลือง/หมายเหตุ) → prio2(เขียว) → ท้ายสุดตัดแดง — ในตัวมันเองปลอดภัย

**สรุปลำดับสังเวยเมื่อ budget เกิน (คำถามเวลา):**
`resonance → daySniper → (multiYear เฉพาะ Book)` · panel timeline ชั้น A ปลอดภัยกว่า แต่โดน middle-cut ได้ถ้า canon ไม่พอ

---

## 3. จุด "ส่งไม่ครบ" ฝั่งเวลา (พบ 7 จุด)

1. **🔴 Q&A judge ไม่มี multi-year เลย** — `resolveFusionYearRange`/`renderMultiYearBlock` ใช้แค่ใน panel (build-prompt.ts:2813-2815) และใน book route · **`buildJudgePrompt` ไม่มี param multiYearBlock** (fusion5/route.ts:588 ไม่ส่ง) → user ถาม "2016-2026 ปีไหนหนัก" ในโหมด Q&A: multi-year โผล่แค่ในแต่ละ panel ที่ AI ย่อเอง แล้วถูกตัดที่ `JUDGE_PANEL_REPLY_MAX_CHARS` → **ซินแสใหญ่ (judge) ไม่เคยเห็นข้อมูลรายปีดิบ**

2. **🔴 bazi ไม่มี multi-year branch** (multi-year.ts:84-152 มี western/vedic/ziwei/qizheng/uranian แต่**ไม่มี bazi**) → `renderMultiYearBlock("bazi",…)` คืนแค่ 2 บรรทัด header · ใน book (`buildBookMultiYear`) bazi อยู่ใน runSciences แต่ผลว่าง → **ศาสตร์เจ้าของ 大運/流年 โดยตรง กลับไม่มีไทม์ไลน์หลายปีเข้า judge เล่ม**

3. **🟠 resonance + daySniper = ปีเดียว/92วัน เท่านั้น** — `buildResonance(…targetYear…)` (route.ts:715) และ range 92 วัน (day-sniper.ts:778-791) · คำถามหลายปีได้ resonance แค่ปีเป้าหมายเดียว

4. **🟠 uranian ไม่อยู่ใน resonance** (RESONANCE_SCIENCES ไม่มี uranian · resonance.ts:44) → Auslösung ยูเรเนียนไม่ร่วมคลัสเตอร์ R2/R3 · แถม uranian multi-year เข้า judge **เฉพาะ Book** ไม่เข้า Q&A

5. **🟠 vedic/ziwei ไม่มีในระดับวัน (Day-Sniper)** — เข็ม A/B/C/D = bazi流日/จันทร์/western/uranian · **ไม่มี dasha ระดับวัน / 流日ของ流年紫微** → user vedic/ziwei ถาม "วันไหน" ไม่มีเข็มของศาสตร์ตัวเอง cross-check

6. **🟡 panel timeline ชั้น A เป็นปีเดียว** (ยกเว้น qizheng ±6) — ถ้า `resolveFusionYearRange` จับ pattern ไม่ได้ (เช่น "อีกสัก 3-4 ปี", "ช่วงนี้ยาวๆ") → **ไม่มี multi-year block เลย** เหลือแค่ปีเป้าหมายเดียว

7. **🟡 shrink สังเวย resonance ก่อนเสมอ** — คำถามเวลาที่ prompt ยาว (คู่/กลุ่ม/canon เยอะ) → R2/R3 (ดาวจรตรงกันข้ามศาสตร์) หายก่อนใคร ทั้งที่เป็นหลักฐานเวลาที่แข็งสุด

---

## 4. ร่างแก้ (เสนอ · ยังไม่ทำ — รอเจ้านายเคาะ)

- **[แก้จุด 1 · สำคัญสุด]** เพิ่ม param `multiYearBlock` ให้ `buildJudgePrompt` + ต่อ wiring ใน fusion5/route.ts: ถ้า `resolveFusionYearRange(question)` ไม่ null → เรียก `buildBookMultiYear`-แบบเดียวกันแล้วส่งเข้า judge (ให้ Q&A มี multi-year เท่า Book) · วางลำดับ shrink ท้ายสุดเหมือน Book
- **[แก้จุด 2]** เพิ่ม branch `bazi` ใน `renderMultiYearBlock` — สรุป 大運ที่ครอบปีนั้น + 流年干支 + 流年ชน用神/忌 รายปี (reuse chart-extensions 流年 timeline ที่ LOCKED · อ่านอย่างเดียว)
- **[แก้จุด 3/6]** ให้คำถามช่วงหลายปีขยาย resonance เป็นลูปรายปี (หรืออย่างน้อยเพิ่มธงว่า "resonance ครอบเฉพาะปี X") + ปรับ `resolveFusionYearRange` ให้จับ pattern คลุมเครือมากขึ้น
- **[แก้จุด 4]** พิจารณาเติม uranian เข้า resonance (R2 Auslösung) หรือใส่ multiYear uranian เข้า Q&A judge
- **[แก้จุด 5]** เติมเข็ม vedic (วันเปลี่ยน pratyantar) / ziwei (流日) ใน Day-Sniper — งานใหญ่ แยกเฟส
- **[แก้จุด 7]** ปรับลำดับ shrink ของ judge: เมื่อ topic=เวลา ให้ตัด panel reply ก่อน resonance (สลับ priority ตามเจตนาคำถาม)

**หมายเหตุ:** ทุกจุดแตะ pipeline ที่หลาย buffer LOCKED (chart-extensions/sifu) — ต้องทำ additive + golden ก่อน แยก PR ตามกฎ 4-phase

---

## 5. ยืนยัน (ตามที่ร้องขอ)

- ✅ งานนี้ **READ-ONLY audit · ไม่ได้แก้โค้ดใดๆ** — เขียนเฉพาะไฟล์รายงานนี้ไฟล์เดียว
- ✅ **ไม่ได้บอกตรงกับ user** — เป็นรายงานภายในให้ทีม/เจ้านายพิจารณา
- ✅ uranian multi-year (r396) — **verify แล้วว่ามีจริง** (multi-year.ts:138-147) และคำนวณ deterministic ถูกต้อง
