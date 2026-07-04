# r2L-3 · Audit จื่อเวยโต่วซู่ (紫微斗數 / ziwei) — ผัง + ดาวจร + คัมภีร์ ส่งให้ AI ครบไหม

READ-ONLY audit · ห้ามแก้โค้ด · ตรวจ pipeline `engine → packet → JSON + prose → prompt`

ไฟล์ที่ตรวจ:
- `src/lib/astro/ziwei/engine.ts` (ziweiChart · 安星 deterministic)
- `src/lib/astro/ziwei/overlay.ts` (buildZiweiOverlay · 大限ปัจจุบัน/疊宮/自化/借星/流昌曲)
- `src/lib/astro/ziwei/packet.ts` (buildZiweiPacket · envelope)
- `src/lib/astro/ziwei/render.ts` (renderZiweiPrompt · prose ไทย)
- `src/lib/fusion5/build-prompt.ts` — `structuredPacketJson` (~2409), render ziwei (~2658), canon router ziwei (~1008), `ZIWEI_SIHUA_CANON_EXTRA_CHARS` (~52)

---

## สรุปผู้บริหาร (3 บรรทัด)

1. **JSON ไม่ตัดอะไรเลย** — `structuredPacketJson` **ไม่มีสาขา ziwei** → ตกลงมาที่ `return JSON.stringify(packet)` (build-prompt.ts:2629) = ส่ง packet เต็มก้อนดิบ. ต่างจาก qizheng/western/vedic/uranian ที่มี compact serializer เฉพาะ. **ทุก field ที่ packet ประกอบ ถูกส่งให้ AI ครบ.**
2. **engine → packet ไม่ตกหล่นสาระ** — สิ่งเดียวที่ไม่เข้า packet คือ index ภายใน (ground ต่าง ๆ + `tianfuGround`) ซึ่งเป็นเลขคำนวณ ไม่ใช่คำอ่าน (天府 โผล่เป็น主星ในผังอยู่แล้ว).
3. **prose (ไทย) กับ JSON ไม่ขัดกัน** — มาจาก packet เดียวกัน. prose บรรยายครบทุกบล็อก · JSON เป็นข้อมูลดิบเต็ม. **四化 + 流年/流月/流日 + คัมภีร์四化斷訣 ส่งครบ · budget พอ ไม่ถูกตัด.**

---

## ตาราง field · JSON ไหม · prose ไหม · ตัด/ครบ

| field (engine) | ใน JSON? | ใน prose (ไทย)? | สถานะ |
|---|---|---|---|
| lunar (ปี/เดือน/วัน/อธิกมาส) | ✅ data.lunar | ✅ | ครบ |
| yearStem+yearBranch | ✅ รวมเป็น yearGanzhi | ✅ ปีนักษัตร | ครบ (รวมก้าน+กิ่ง) |
| hourBranch | ✅ data.hourBranch | ⚠️ ไม่ render ตรง (นัยผ่าน命宮) | ครบใน JSON |
| mingGong {branch,stem,ganzhi} | ✅ | ✅ 命宮 | ครบ (ตัด ground index ภายใน — ไม่ใช่คำอ่าน) |
| shenGong {branch} | ✅ | ✅ 身宮 | ครบ (ตัด ground) |
| wuxingJu (五行局) | ✅ | ✅ | ครบ |
| ziweiGround → ziweiBranch | ✅ แปลงเป็น ziweiBranch | ✅ 紫微สถิต | ครบ |
| tianfuGround (天府 ground) | ❌ ไม่มี field เดี่ยว | — | **redundant** (天府 อยู่ใน palaces.majorStars อยู่แล้ว) ไม่กระทบ |
| palaces ×12: name/branch/stem/ganzhi | ✅ | ✅ 十二宮安星 | ครบ |
| palaces.majorStars {name,brightness} | ✅ | ✅ + 廟旺利陷 | ครบ |
| palaces.minorStars {name} (輔煞14ดวง) | ✅ | ✅ 輔煞 | ครบ |
| palaces.siHua (ต่อ宮) | ✅ | ✅ tag [化祿…] | ครบ |
| palaces.daXian (ช่วงอายุ) | ✅ | ✅ 大限 X-Y ปี | ครบ |
| siHua 生年四化 (star/type/palaceName/branch) | ✅ | ✅ 四化ปีเกิด + ตกที่เรือน | ครบ |
| daXianSiHua (四化ตาม宮干 ×12) | ✅ | ✅ 大限四化 | ครบ |
| sanFangSiZheng (三方四正 ของ命宮) | ✅ | ✅ | ครบ |
| liuNian (流年: ganzhi/命宮/四化/annualStars 8ดาว) | ✅ | ✅ | ครบ |
| liuYue (流月: 四化/monthlyStars/monthPalaces12) | ✅ | ✅ + 12เดือน命宮 | ครบ |
| liuRi (流日: 四化/dailyStars) | ✅ | ✅ | ครบ |
| overlay.currentDaXian (大限ปัจจุบัน + 虛歲) | ✅ | ✅ | ครบ |
| overlay.dieGong (疊宮 natal×大限×流年) | ✅ | ✅ | ครบ |
| overlay.ziHua (自化) | ✅ | ✅ | ครบ |
| overlay.jieXing (借星安星 宮ว่างยืม對宮) | ✅ | ✅ | ครบ |
| overlay.liuChangQu (流昌流曲) | ✅ | ✅ | ครบ |
| overlay.mingZhu/shenZhu (命主/身主) | ✅ | ✅ | ครบ |
| overlay.zaYao (雜曜/神煞 natal) | ✅ | ✅ | ครบ |
| notAvailable[] | ✅ | ✅ | ครบ (degrade ชัดเจน) |

**ไม่มี field สาระใดถูกตัดจาก packet→JSON.** (แตกต่างจากศาสตร์อื่นที่ compact serializer เคยตัดสาขาทิ้ง เช่น uranian ที่ต้อง fix r392)

---

## prose vs JSON ขัดไหม

**ไม่ขัด.** prose (`renderTh`) และ JSON (`JSON.stringify(packet)`) อ่านจาก `ZiweiPacket` ก้อนเดียวกัน · prose = การบรรยายไทยศัพท์紫微 · JSON = ข้อมูลดิบเต็ม. prompt สั่ง AI ให้ยึด field ใน STRUCTURED_CHART_PACKET (build-prompt.ts:2782) และ prose เป็นฐานตีความ → สอดคล้องกัน.

**ข้อสังเกตย่อย (ไม่ใช่ data loss):**
- `renderChartForScience` เรียก `renderZiweiPrompt(packet)` **ไม่ส่ง lang** (build-prompt.ts:2660) → prose เป็น**ไทยเสมอ** แม้ผู้ใช้ถามภาษา zh/en. ไม่กระทบ AI เพราะ JSON เต็มครบ (ข้อมูลไม่หาย) แต่ผู้ใช้ zh/en ได้ prose ไทย.
- `renderZh` / `renderEn` มีอยู่แต่ **ไม่ถูกเรียกจาก path นี้** และยัง**ตัด field**: `renderZh` ไม่ render sanFangSiZheng/overlay/monthPalaces · `renderEn` ไม่ render 生年四化 list/sanFangSiZheng/overlay. = dead branch สำหรับ fusion5 · ถ้าอนาคตสลับมาใช้ต้องเติมให้ครบก่อน. (ยืนยันตรง: ปัจจุบันไม่กระทบ เพราะ path ใช้ renderTh + JSON เต็ม)

---

## คัมภีร์ ziwei + 四化 + 流年 ส่งครบไหม / budget พอไหม

**ส่งครบ · budget พอ · 四化斷訣 ไม่ถูกตัด.**

- `ZIWEI_SIHUA_CANON_EXTRA_CHARS = 2_000` (build-prompt.ts:52) บวกเข้ากับ `CANON_TEXT_MAX_CHARS = 56_000` → **maxCanon ziwei = 58,000** (build-prompt.ts:2835).
- **四化斷訣 (10-feixing-quanji.md#sihua · ส่วน A ~1.9K verbatim public domain)** ถูก `pushUnique` **แบบไม่มีเงื่อนไข** ในบล็อก ziwei (build-prompt.ts:1013-1014) → **ทุก request ได้ 四化斷訣**. section splitter ตัดเฉพาะ A1→B1 (build-prompt.ts:480).
- **ส่วน B (十八飛星 สายดาว 18 ดวง) ตั้งใจไม่แนบ** — ตาม 01-source-policy (คนละระบบกับผัง 14 主星). ✅ ถูกต้องตามนโยบาย.
- **流年 canon**: ครอบด้วย `08-quanshu-limit-special-rules.md` (大限/二限/太歲) + `06-liuyue-liuri-sihua-rules.md` (流月/流日/四化飛星) ที่ถูกเลือกตาม intent timing/relationship/health ฯลฯ + ข้อมูล流年/流月/流日ใน packet เอง (deterministic). ✅ 四化 + 流年 ส่งครบ.
- ตำแหน่งใน array: 四化斷訣 ถูก push **เร็ว** (หลัง base files + relationship · ก่อน topic packs 15-62) → loadCanonBundle โหลดตามลำดับจนเต็ม maxChars · ด้วยขนาด ~1.9K + อยู่ต้น + budget 58K → **ได้เข้า prompt แน่นอนทุกครั้ง**.

**⚠️ จุดเปราะ (order-fragility · ไม่ใช่บั๊กปัจจุบัน · เสนอเผื่ออนาคต):**
1. **四化斷訣 ไม่ถูก `prioritizeToFront`/`prioritizeAfterMethod`** — ป้องกันด้วย "ลำดับ insert เร็ว" เท่านั้น. ปัจจุบันปลอดภัย แต่ถ้าอนาคตมีการ push pack ก่อนหน้าเยอะขึ้น หรือ base files โต ~50K+ อาจโดนบีบ. เสนอ (option): ใส่ `prioritizeAfterMethod(files, ziweiSihuaToken)` ให้ verbatim 四化斷訣 ยึดหัวถัดจาก 00-method เหมือน canon verbatim ศาสตร์อื่น.
2. **คัมภีร์ verbatim 卷一 星垣論/諸星問答 (`07-quanshu-xingyuan-wenda.md`) + `ziwei-quanshu-core.md` ถูก push ท้ายสุด** (build-prompt.ts:1068-1070) → เป็นไฟล์ที่**เสี่ยงถูก truncate ที่สุด**เมื่อคำถามยิง topic pack หลายหมวดพร้อมกัน (บาง intent push ถึง ~15 ไฟล์). ต่างจาก 四化斷訣 ที่อยู่ต้น (ปลอดภัย). ถ้าอยากกัน 星垣論 หลุดใต้ภาระ multi-topic เสนอ prioritize ขึ้นหน้าเช่นกัน.

---

## ร่างแก้ (ถ้าเจ้านายเคาะ · ยังไม่ได้แก้ — audit only)

ไม่มี field ถูกตัดทิ้งที่ต้องแก้ด่วน (JSON = packet เต็ม). ข้อเสนอเป็น hardening ล้วน (optional):

**(ก) กัน 四化斷訣 + 星垣論 หลุดเมื่อ multi-topic** — ในบล็อก ziwei ของ `selectCanonFilesForPrompt` เพิ่มบรรทัดท้ายบล็อก (additive · ไม่ลบ logic เดิม):
```ts
// verbatim public-domain canon = ยึดหัว (กันโดน truncate ใต้ภาระ topic pack หลายหมวด)
prioritizeAfterMethod(files, "10-feixing-quanji.md#sihua", "07-quanshu-xingyuan-wenda.md", "ziwei-quanshu-core.md");
```
> หมายเหตุ: ต้องยืนยันว่า `prioritizeAfterMethod` จับ token ที่มี `#sihua` ได้ (เทียบ string ตรงตัว — token ใน list คือ `"10-feixing-quanji.md#sihua"` เป๊ะ จึง match ได้). ✅

**(ข) prose หลายภาษา (ถ้าต้องการ zh/en อ่านลื่นขึ้น)** — ส่ง lang เข้า `renderZiweiPrompt(packet, lang)` ที่ build-prompt.ts:2660 + เติม field ที่ `renderZh`/`renderEn` ขาด (sanFangSiZheng/overlay) ให้เทียบเท่า `renderTh`. **ไม่จำเป็นต่อความแม่น** เพราะ JSON เต็มครบ — เป็นเรื่อง UX prose ล้วน.

---

## ยืนยันตรง (ไม่ได้ → บอกตรง)

- ✅ **ยืนยัน**: JSON ที่ส่ง AI = packet เต็ม ไม่ตัด field (structuredPacketJson ไม่มีสาขา ziwei → JSON.stringify(packet) build-prompt.ts:2629).
- ✅ **ยืนยัน**: engine ทุก field สาระ (12宮/主星/四化/大限/流年/流月/流日/overlay) เข้า packet ครบ · ที่ตัด = ground index ภายใน + tianfuGround (redundant · ไม่ใช่คำอ่าน).
- ✅ **ยืนยัน**: prose ↔ JSON ไม่ขัด (packet เดียวกัน) · renderTh บรรยายครบ.
- ✅ **ยืนยัน**: 四化斷訣 (ส่วน A) ส่งทุก request · budget 58K พอ · อยู่ต้น array = ไม่โดนตัด. 十八飛星 (B) ไม่แนบโดยเจตนา (นโยบาย).
- ⚠️ **ยังไม่ยืนยัน (ต้องรัน จึงเห็นตัวเลขจริง)**: ปริมาณ char รวมของ canon เมื่อ intent ยิงหลาย topic pack พร้อมกัน — เป็นตัวชี้ว่า `07-quanshu-xingyuan-wenda.md`/`ziwei-quanshu-core.md` (ท้าย array) โดน shrink loop ตัดจริงหรือไม่. audit นี้ชี้ **ความเสี่ยงเชิงโครงสร้าง** (อยู่ท้าย = เสี่ยง) แต่ไม่ได้วัด char จริง (read-only · ไม่รันโค้ด). 四化斷訣 ไม่อยู่ในความเสี่ยงนี้เพราะอยู่ต้น.
- ⚠️ **ข้อสังเกต**: prose ล็อกไทย (renderChartForScience ไม่ส่ง lang) — ไม่กระทบ data (JSON เต็ม) แต่ผู้ใช้ zh/en ได้ narration ไทย.
