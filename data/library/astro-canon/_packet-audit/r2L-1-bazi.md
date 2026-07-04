# r2L-1 · Audit ปาจื้อ (BaZi) — ผัง/ดาวจร/คัมภีร์ ส่งเข้า AI ครบไหม

> READ-ONLY audit · **ไม่แก้โค้ด · bazi = LOCKED** (แค่สำรวจ ไม่เสนอแก้)
> ขอบเขต: เส้นทาง `/api/sifu` (ปาจื้อไปคนละทางกับ fusion อื่น)
> ไฟล์ที่อ่าน: `src/app/api/sifu/route.ts` (buildBaziContext / buildIntroBaziContextFromBirth / buildPrompt) + `src/lib/chart-packet.ts` (buildStructuredChartPacket / renderChartPrompt) + `src/lib/chart-extensions.ts` + `src/lib/bazi-calc.ts`

---

## สรุปหัวเรื่อง (TL;DR)

- **โหมด default (claude-max-cli / opus) ส่ง "เกือบครบ"** — packet render ~50+ บล็อกจากทุก field engine + ยัดคัมภีร์ 4 กลุ่มเต็มก้อน (interaction-master 54KB + engine 172KB + sifu-extra 2.4MB + qtbj) **ไม่ตัด**
- **จุดที่ทำให้ "รู้สึกขาด" มี 4 กลุ่มจริง:**
  1. 🔴 **compact mode (Codex/Grok)** = คัมภีร์เต็มถูกตัดทิ้ง เหลือ baseline ย่อ + excerpt ไม่กี่ชิ้น
  2. 🟠 **ประวัติแชทถูกทิ้งทั้งก้อน** เมื่อ profileId ของ thread ไม่ match (route.ts:2371-2373)
  3. 🟡 **ตัวเลข % / คะแนน ถูกกันไว้โดยเจตนา** (no-percent policy) — ไม่ได้บอก AI ตรงๆ ว่าถูกกัน
  4. 🟡 **display cap ตัดจำนวนรายการ** (神煞/มู่คู่/event ราย 8-12 ชิ้น) + **ext บางอันไม่ wire** (palace_readings)
- **ทั้งหมดนี้ bazi LOCKED → รายงานเฉยๆ ไม่เสนอแก้**

---

## ตาราง A · Engine คำนวณอะไร vs ส่งเข้า prompt ไหม (โหมด default)

| หมวด engine (`calc.*` / `ext.*`) | engine มี | ส่ง prompt? | ตัด/ครบ · บรรทัด render |
|---|---|---|---|
| 4 เสา (ก้าน/กิ่ง) | ✅ calc.pillars | ✅ | ครบ · PILLAR LOCK + "รายเสา" (chart-packet:2670-2678) |
| 十神 ทุกเสา + ธาตุซ่อน (藏干) | ✅ | ✅ | ครบ · แกนหลัก/แรงแฝง 1-2 + tenGod (2672) |
| 氣相/長生12 (qiPhase) | ✅ ext.qi_phases | ✅ | ครบ · "วัฏจักร ตัวตน/เสา/ซ่อน" (2676) |
| 納音 60 | ✅ ext.nayin | ✅ | ครบ · บรรทัด 納音 (route:1212) + รายเสา |
| 神煞 62 ดาว (ดี/ร้าย) | ✅ ext.special_stars | ✅ | ครบ · ต่อเสา "神煞ดาวพิเศษ" ไม่ cap (2675) |
| 易卦 เสา (梅花) | ✅ | ✅ | ครบ · hexZh ต่อเสา |
| 格局 (โครงดวง) | ✅ calc.geJu | ✅ | ครบ · +raw label +confidence (2735-2801) |
| 格局 strict 子平真詮 audit | ✅ strictGeJuAudit | ✅ | ครบ · บล็อกแยก strict/canonical (2847-2887) |
| 化氣格 verdict (wrapper-8) | ✅ huaQi | ✅ | ครบ · 真化/假化/合而不化 (2827-2845) |
| 從格 dual-school (順勢/扶抑) | ✅ derived | ✅ | ครบ · HK_DUAL_SCHOOL + คำถามเฉลยชีวิต (2938-2973) |
| 用神/喜/忌 (5 ชั้น) | ✅ yongShenProtocols | ✅ | ครบ · 用神分層 格局/調候/扶抑/病藥/相神 (3000-3006) |
| 調候 strict (窮通寶鑑 120) | ✅ tiaoHou.strict | ✅ | ครบ · +climate flag SystemB% (3035-3065) |
| 通根/ราก 5 ธาตุ (wrapper-7) | ✅ rootedness | ✅ | ครบ · 通根 + ราก5ธาตุ (3184-3197) |
| 透出/透干 vs 通根 (แยก semantic) | ✅ derived | ✅ | ครบ · บล็อก透干+รากที่透 (3199-3241) |
| ธาตุรวม/กำลัง (SystemB card06) | ✅ systemB | ✅ **แต่ห้ามพูด %** | ครบเชิง label · **ตัวเลข % กันไว้** (3020-3034) |
| 病藥 v1 | ✅ bingYao | ✅ | ครบ (3167-3183) |
| 相神/成格破格 | ✅ xiangShen | ✅ | ครบ (3155-3160) |
| 行運成敗 Layer5 | ✅ chengBaiNow | ✅ | ครบ (3161-3166) |
| 五宮: 胎元/命宮/身宮/司令/小運 | ✅ fivePalaces | ✅ | ครบทั้ง 5 (3116-3140) · หมายเหตุ comment 2444 ว่า "命宮ถอด" = **stale** โค้ดจริงส่ง |
| 六親 (คู่/พ่อ/แม่/ลูก/พี่น้อง) | ✅ sixRelatives | ✅ | ครบ · ตามเพศ (3141-3153) |
| 空亡 (ฐานวัน+ฐานปี) + ตกเสาไหน | ✅ kongWang | ✅ | ครบ (3067-3085) |
| 真太陽時 / 起運 | ✅ tst / qiyunLock | ✅ | ครบ + HK_QIYUN_LOCK (3087-3115) |
| **大運 timeline ทั้งชีวิต** | ✅ luckTimeline | ✅ | ครบ · +LUCK_PILLAR_LOCK +CURRENT_LUCK +JIAOYUN (3243-3320) |
| 交運 รอยต่อวัยจร | ✅ derived | ✅ | ครบ (3383-3395) |
| **流年 ทั้งชีวิต (ราย compact)** | ✅ yearlyLiuNianDrilldown | ✅ | ครบ · chunk 12/ก้อน + 立春/大運 map (3407-3495) |
| **流年+流月 วัยจรปัจจุบัน (drilldown)** | ✅ transitDrilldown | ✅ | ครบ · เดือนจร節氣จริง 12 เดือน/ปี (3341-3382) |
| ตารางปีจรทั้งชีวิต (calendar lock) | ✅ lifeAnnualPillars | ✅ | ครบ (3397-3406) |
| 三合 candidate จากปีจร | ✅ derived | ✅ | ครบ · cap 40 (3500-3536) |
| ปฏิกิริยาในดวง (合冲刑害破) | ✅ interactions.raw | ✅ | ครบ · +ธาตุ+เรือน+เรื่อง+สิบเทพ (3555, renderInteractionGroup) |
| ปฏิกิริยาวัยจร×เกิด / ปีจร×วัน | ✅ luck/annualInteractions | ✅ | ครบ (3676-3677) |
| 合冲 resolver (貪合忘冲 ฯลฯ) | ✅ xchResolution | ✅ | ครบ (3611-3633) |
| 天干五合 verdict | ✅ hehuaVerdicts | ✅ | ครบ (3556-3564) |
| 墓庫 state v1 + ตามเวลา v2 | ✅ muku(Transit)States | ✅ | ครบ · v2 dedup+**cap 8** (3601-3675) |
| ข้ามชั้น 拱/暗合 (r374) | ✅ hiddenCombos | ✅ | ครบ (3688-3696) |
| ข้ามชั้น transitHehua/crossLayer | ✅ | ✅ | ครบ · note **cap 2** (3565-3600) |
| 神煞 × transit activation | ✅ shenshaTransit | ✅ | ครบ · **cap 10** (3634-3643) |
| 六親 event timeline | ✅ sixRelativesEvents | ✅ | ครบ · **cap 12** (3644-3650) |
| เรือนคู่ 夫妻宮 / personal stars 14 | ✅ spouse/personalStars | ✅ | ครบ · desc **cap 90 ตัวอักษร** (3538-3552) |
| profile เชิงลึก/อาชีพ/สุขภาพ | ✅ ext career/health/daymaster | ✅ | ครบ (3698-3705) |

**สรุปตาราง A: โหมด default ครบแทบทุก field. field ที่ engine มีแต่ไม่ส่ง หรือส่งแบบกัน ดูตาราง B**

---

## ตาราง B · engine มีค่า แต่ "ไม่ส่ง / ส่งแบบกัน" (โหมด default)

| ค่า engine | มี | ส่งไหม | เหตุผล/หมายเหตุ |
|---|---|---|---|
| `calc.strength.percent` (ตัวเลขกำลัง %) | ✅ | ❌ ส่งแค่ `.level` | no-percent policy · ตัวเลขถูกกัน · **AI ไม่ถูกบอกว่ามีตัวเลขนี้อยู่** |
| `yongshen[].finalScore` (คะแนน用神) | ✅ | ❌ | ส่งแค่ธาตุ · คะแนนกัน |
| systemB `pctDisplay` (% ธาตุ) | ✅ | ⚠️ ใช้ภายในเช็ค調候เท่านั้น | บรรทัด card06 สั่ง "ห้ามพูด %" |
| strengthScore/positionWeight/rootMultiplier | ✅ (wrapper) | ❌ | reserved Step B/C — รอ golden test (type header 159-165) |
| full resolver conflict graph / 合化 grading | บางส่วน | ❌ ส่งแค่ raw+partial | reserved · ยังไม่ทำ engine resolver เต็ม |
| `ext.palace_readings` (คำอ่านรายเรือน 4 เรือน ละเอียด) | ✅ | ❌ | packet ส่งแค่ชื่อเรือน `palaceZh` ไม่ส่งเนื้อคำอ่าน |
| `ext.three_phases` / `ext.today_overlay` | ✅ | ❌ | today_overlay = ของ /today (ถูกต้องที่ไม่ส่ง) · three_phases ไม่ wire |
| `ext.life_palace` (ของ extensions) | ✅ | ❌ | packet ใช้ buildLifePalace ของตัวเอง (卯安命) แทน — ถูกต้อง |

---

## จุดที่ทำให้ AI "รู้สึกขาด" (root cause ของคำบ่น "ส่งไม่ครบ")

### 🔴 1. Compact mode ตัดคัมภีร์เต็มทิ้ง (Codex / Grok / claude ถ้าเปิด flag)
- `shouldUseCompactKnowledge()` = true เมื่อ model = `codex-cli` หรือ `grok-cli` หรือ `SIFU_CLAUDE_COMPACT_KNOWLEDGE=1` (route:221-223)
- `buildPrompt()` compact branch (route:1513-1538): **ตัด ajek + interaction-master (54KB) + engine (172KB) + sifu-extra (2.4MB) ออกทั้งหมด** → แทนด้วย `CODEX_COMPACT_KNOWLEDGE` (4 บรรทัด) + `loadSifuCompactAuthorityKnowledge()` (baseline ย่อ + excerpt ~5 ชิ้น) + qtbj retrieval เฉพาะจุด
- **ผล:** ถ้า user ตอบด้วย Codex/Grok → AI ได้คัมภีร์แค่เศษเสี้ยว = "อ่านตื้น/อ้างตำราไม่ได้" = รู้สึกขาดชัดเจน
- default คือ `claude-max-cli` (route:477) จึงมักไม่โดน · แต่ถ้าสลับ model = โดนทันที

### 🟠 2. ประวัติแชทถูกทิ้งทั้งก้อนเมื่อ profile ไม่ match (route.ts:2371-2373)
```
historyProfileMatch = rawHistory.length===0 || (threadProfileId && profileId && threadProfileId===profileId)
history = historyProfileMatch ? rawHistory : []   // ← ไม่ match = ทิ้งหมด
```
- ถ้า frontend **ไม่ส่ง `threadProfileId`** หรือส่งไม่ตรง profileId ปัจจุบัน → `history = []` → AI ลืมบริบทสนทนาก่อนหน้าทั้งหมด
- เป็น guard กันปนดวง (ถูกต้องเชิงความปลอดภัย) แต่ทำให้คำถามต่อเนื่อง ("ขยายความข้อ 2") ตอบเหมือนไม่จำ = "ตอบไม่ครบ"
- rawHistory เองก็ cap `.slice(-6)` (route:2299) — เก็บแค่ 6 เทิร์นล่าสุด

### 🟡 3. ตัวเลข/คะแนน ถูกกันโดยไม่บอก AI ตรงๆ
- no-percent policy กัน %/score (ตาราง B) — **แต่ packet ไม่ได้เขียนบอก AI ว่า "มีตัวเลขกำลัง/คะแนน用神อยู่ แต่ถูกกันไว้"** → AI ไม่รู้ว่ามีข้อมูลนี้ → เวลาผู้ใช้ถาม "แข็งกี่ %" AI ตอบไม่ได้ = รู้สึกขาด
- ต่างจากกรณีอื่นที่ packet บอกตรง (เช่น "SystemB unavailable", "includeTransitDrilldown=false", คำเตือน 3 เสา) — พวกนั้น AI ถูกบอกว่าขาด · แต่เรื่อง %/score **ไม่ถูกบอก**

### 🟡 4. Display cap ตัดจำนวนรายการ + ext บางอันไม่ wire
- cap: shenshaTransit 10 · sixRelativesEvents 12 · mukuTransitStates 8 (dedup) · sanHe candidate 40 · impacts 3/ปี-เดือน · crossLayer/transitHehua note 2 · personalStars desc 90 ตัวอักษร
- เคสดวงที่ดาว/ปฏิกิริยาเยอะ → บางชิ้นหลุด (มี "ยังมีอีก N รูปแบบ" เฉพาะ mukuTransit เท่านั้นที่บอก · อันอื่นตัดเงียบ)
- `ext.palace_readings` (คำอ่านรายเรือนละเอียด) engine คำนวณแต่ packet ไม่ส่ง — ส่งแค่ชื่อเรือน

### ℹ️ 5. เคส 3 เสา (ไม่รู้เวลาเกิด) — ขาดโดยถูกต้อง
- hour pillar, 命宮/身宮/小運, ดวงคู่จากยาม, 起運จริง, drilldown รายเดือน = null/ประมาณ
- **แต่ packet บอก AI ตรงทุกจุด** (⚠️ 3p warnings, LIMIT_3P, boundaryWarning) → ไม่ใช่บั๊ก แต่ user อาจรู้สึกขาดเพราะดวงตัวเองไม่มีเวลาเกิด

### ℹ️ 6. Message hard-cap 2000 ตัวอักษร = reject ไม่ใช่ตัด
- คำถามยาว >2000 ตัวอักษร → HTTP 400 "message too long" (route:2315-2318) · ไม่ตัดเงียบ แต่ user เห็น error = "ถามไม่ได้"
- (fusion-internal ได้ถึง 80,000 — เฉพาะ path ภายใน)

---

## ยืนยัน "ไม่ได้บอกตรง" (transparency ต่อ AI)

| สิ่งที่ขาด/กัน | packet บอก AI ตรงไหม? |
|---|---|
| 3 เสา ไม่มียาม/命宮/drilldown | ✅ บอกตรง (⚠️ 3p, LIMIT_3P) |
| SystemB ธาตุรวม unavailable | ✅ บอกตรง |
| drilldown ปิด (includeTransitDrilldown=false) | ✅ บอกตรง |
| ไม่พบ candidate 三合/拱/暗合 | ✅ บอกตรง ("ตรวจแล้วไม่พบ") |
| **ตัวเลขกำลัง % / finalScore用神 ถูกกัน** | ❌ **ไม่บอก** — AI ไม่รู้ว่ามีข้อมูลนี้ |
| **คัมภีร์เต็มถูกตัด (compact mode)** | ❌ **ไม่บอก** — AI ไม่รู้ว่าได้ตำราแค่ย่อ |
| **ประวัติแชทถูกทิ้ง (profile mismatch)** | ❌ **ไม่บอก** — AI ไม่รู้ว่าเคยมีบทสนทนาก่อน |
| display cap ตัดรายการ (神煞/event) | ⚠️ บอกบางส่วน (เฉพาะ mukuTransit "ยังมีอีก N") · ที่เหลือตัดเงียบ |

---

## บทสรุป audit

1. **โครงสร้างส่งข้อมูลปาจื้อ = สมบูรณ์มากในโหมด default** — `renderChartPrompt` เป็น serializer ที่ครอบคลุมเกือบทุก field ของ packet และ packet ดึงเกือบทุก output ของ engine เข้ามา · คัมภีร์ 4 กลุ่มยัดเต็มไม่ตัด · **ไม่มี prompt-level truncation** (prompt ~141KB ส่งเต็ม timeout 600s)
2. **สาเหตุ "ส่งไม่ครบ" ที่เป็นไปได้สูงสุด เรียงตามน้ำหนัก:**
   - (ก) user/ระบบสลับไป **Codex/Grok** → คัมภีร์เต็มหาย (compact)
   - (ข) **ประวัติแชทถูกทิ้ง** เพราะ threadProfileId ไม่ตรง → ตอบต่อเนื่องเหมือนไม่จำ
   - (ค) ถามเรื่อง **ตัวเลข %/คะแนน** → ถูกกันโดยเจตนาและ AI ไม่รู้ว่ามี
   - (ง) เคส **3 เสา** ขาดครึ่งโครง (ถูกต้อง แต่รู้สึกขาด)
   - (จ) display cap ตัดรายการปลายแถว (edge case ดาวเยอะ)
3. **bazi = LOCKED — audit นี้รายงานอย่างเดียว ไม่เสนอแก้โค้ด/prompt/packet ใดๆ**

_ยืนยันตามกฎ AGENTS.md ข้อ 7: จุดที่ยังไม่ได้ตรวจลึก = เส้นทาง `/api/sifu/group` (multi-person) และ `fusion5/guest-birth` (ดวงชั่วคราว) — audit นี้โฟกัส single-bazi `/api/sifu` ตามโจทย์_
