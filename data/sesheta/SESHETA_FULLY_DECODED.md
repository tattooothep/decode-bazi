# 🔓 SESHETA — FULLY DECODED

แกะครบทั้ง 1MB ของ `vendor-bazi-engine-COwSzQP-.js` แล้ว

วันที่: 5 พฤษภาคม 2026

---

## 📊 สิ่งที่แกะออกมาได้

| หัวข้อ | จำนวน | ไฟล์ JSON |
|---|---|---|
| 25 Archetype × Element variants (5×5) | 25 | `sesheta-archetypes-25.json` (47KB) |
| 18 Chart Structures | 18 | `sesheta-structures-16.json` (35KB) |
| 7 Strength Levels (Day Master) | 7 | `sesheta-strengths.json` (23KB) |
| Useful God 5-Rank per DM | 10 stems | `sesheta-useful-god-ranks.json` |
| Crisis Detection (4 types) | 4 | `sesheta-crisis-detection.json` |
| Scoring Engine (12 phases × multipliers) | — | `sesheta-scoring-engine.json` |
| Core lookup tables | 12 tables | `sesheta-bazi-lookup-tables.json` |
| Stem Combinations + Transformations | 10 | `sesheta-stem-combos.json` |

**รวม: 136 KB ของ structured BaZi data**

---

## 🔥 สูตรลับ Sesheta — ผมแกะให้แล้ว

### 1. Useful God 5-Rank Lookup (สูตรสำคัญที่สุด)

ทุก Day Master มี 5 ลำดับธาตุที่ดีที่สุด เรียงจากดีสุดไปแย่สุด:

```
甲 Wood:  甲乙庚壬癸  (เพื่อน, ทอง控, น้ำเลี้ยง)
乙 Wood:  甲乙辛壬癸
丙 Fire:  丙丁甲乙壬  (ตัวเอง, ไม้เผา, น้ำดับสมดุล)
丁 Fire:  甲乙丙丁癸
戊 Earth: 己戊丙丁甲  (แผ่นดิน, ไฟผู้ช่วย, ไม้พลิก)
己 Earth: 乙戊己丙丁  ← พี่ (Aeaw)
庚 Metal: 丙戊己辛庚
辛 Metal: 庚辛戊己丁
壬 Water: 庚辛壬癸戊
癸 Water: 庚辛壬癸己
```

**สำหรับพี่ (己土) — ลำดับ Useful God:**
1. **乙 (Yin Wood)** — ดีที่สุด: ไม้อ่อนเลี้ยงดิน
2. **戊 (Yang Earth)** — Yang เพื่อน
3. **己 (Yin Earth)** — ตัวเอง (เพิ่มความแข็งแรง)
4. **丙 (Yang Fire)** — แสงแดด ทำให้ดินร้อน
5. **丁 (Yin Fire)** — เปลวไฟ

### 2. Crisis Detection 4 ประเภท

```
┌─────────────────┬──────────────┬─────────────────┬─────────┐
│ Crisis          │ Trigger      │ Recommend       │ Tier    │
├─────────────────┼──────────────┼─────────────────┼─────────┤
│ Frozen Chart    │ Winter (子,亥)│ Fire (火)       │ SSS     │
│ Damp Chart      │ Wet earth    │ Fire (火)       │ SSS     │
│ Scorched Chart  │ Summer (巳,午)│ Water (水)      │ SSS     │
│ Dry Chart       │ Autumn dry   │ Water (水)      │ SSS     │
└─────────────────┴──────────────┴─────────────────┴─────────┘
```

**Tier System (สำคัญ!):**
- `SSS` (1) = Critical priority
- `SS` (2) = Strong priority
- `S` (3) = Useful
- `A+` (4) = Beneficial
- `A` (5) = Mild
- `B` (6) = Neutral
- `F` (7) = Avoid

### 3. Strength Scoring Engine

```
12 Phases multipliers (แรงรับของ DM ใน branch):
  帝旺 (Peak) ............. 1.5x  ← ตำแหน่งดีที่สุด
  臨官 (Rise) ............. 1.4x
  長生 (Birth) ............ 1.3x
  冠帶 (Cap) .............. 1.2x  ← พี่ 己 ใน 未
  沐浴 (Bath) ............. 1.1x
  衰  (Decline) ........... 0.9x
  病  (Sick) .............. 0.8x
  死  (Death) ............. 0.7x
  墓  (Tomb) .............. 0.6x  ← พี่ 己 ใน 子 (但绝)
  絕  (Extinction) ........ 0.5x  ← พี่ 己 ใน 子 (此处)
  胎  (Conception) ........ 0.6x  ← พี่ 己 ใน 亥
  養  (Nurture) ........... 0.7x

Position weights:
  Year   : 0.8x
  Month  : 1.6x  ← ตำแหน่งสำคัญสุด
  Day    : 1.0x  (Day Master)
  Hour   : 0.9x

Rooting count multipliers:
  0 root  = 1.0x
  1 root  = 1.0x
  2 roots = 0.6x  (rebalance)
  3+ roots = 0.25x (heavy reduction)
```

### 4. Stem Combinations + Transformations (10 stems)

```
甲 + 己 → Earth (need branches: 辰,午,戌)
乙 + 庚 → Metal (need branches: 丑,未,酉)
丙 + 辛 → Water (need branches: 子,辰,申)
丁 + 壬 → Wood  (need branches: 亥,卯)
戊 + 癸 → Fire  (need branches: 寅,午)
```

---

## 📋 18 Chart Structures (ลึกกว่าที่เคย)

```
1. Direct Resource (正印格) — โครงสร้างบ่มเพาะ
2. Indirect Resource (偏印格) — โครงสร้างตกผลึก
3. Direct Officer (正官格) — โครงสร้างแบบแผน
4. Seven Killings (七殺格) — โครงสร้างเด็ดขาด
5. Direct Wealth (正財格) — โครงสร้างสะสม
6. Indirect Wealth (偏財格) — โครงสร้างแสวงหา
7. Eating God (食神格) — โครงสร้างเรียบเรียง
8. Hurting Officer (傷官格) — โครงสร้างปลดปล่อย
9. Friend (比肩格) — โครงสร้างเสมอภาค
10. Rob Wealth (劫財格) — โครงสร้างแข่งขัน

Transformation Patterns (5):
11. Transformation into Wood (化木格)
12. Transformation into Fire (化火格)
13. Transformation into Earth (化土格)
14. Transformation into Metal (化金格)
15. Transformation into Water (化水格)

Follow Patterns (3):
16. Follow the Output (從兒格)
17. Follow the Wealth (從財格)
18. Follow the Influence (從殺格)
```

---

## 🎭 25 Archetype × Element Variants

```
            Water        Fire         Earth        Metal        Wood
Connector   Osmosis      Attraction   Solidity     Precision    Growth
Influence   Stability    Inspiration  Development  Authority    Strategy
Thinker     Deep         Insight      Accumulation Logic        Curiosity
Creator     Flow         Performance  Manifestat.  Refinement   Innovation
Achiever    Circulation  Visibility   Stability    Efficiency   Expansion
```

ทุก variant มี: title (TH+EN), deepDive (~500 words), keyTalents, mindsetShift, awakeningQuestion

---

## 🌟 Special Day Master States (7 Levels)

```
Extremely Strong (Vibrant Flow) — แข็งแรงสุดขั้ว / กระแสมีชีวิตชีวา
Very Strong (Dominant)         — แข็งแรงมาก / ครอบงำ
Strong (Robust)                 — แข็งแรง / แข็งแกร่ง
Slightly Weak (Balanced-Low)    — อ่อนเล็กน้อย / สมดุล-ต่ำ
Weak (The Strategist)           — อ่อน / นักยุทธศาสตร์ ← พี่ (Aeaw)
Very Weak (Dependent)           — อ่อนมาก / พึ่งพา
Extremely Weak (The Follower)   — อ่อนสุดขั้ว / ผู้ตาม
+ Transformed (Rebirth)         — แปรเปลี่ยน
+ Vibrant Flow                  — กระแสมีชีวิตชีวา
```

แต่ละ level มี: title TH+EN, subtitle metaphor, meaning markdown, coreStrategy, dos[], donts[]

---

## 🎯 สิ่งที่ Decode ต้องชนะ Sesheta

### A. ที่ Sesheta มีแล้ว (เราทำเท่าหรือดีกว่า)
- ✅ 18 Structures + Transformations + Follow patterns (เราทำได้ทันที)
- ✅ 25 Archetype × Element (เราต้อง rewrite ด้วย voice ของพี่)
- ✅ 9 Strength levels (เราใช้ scoring แบบ same)
- ✅ Crisis Detection 4 types (เราใช้ formula เดียวกัน)
- ✅ Useful God 5-rank (formula เดียวกัน)

### B. ที่ Decode มีเพิ่ม (Sesheta ไม่มี)
- 🆕 **Qi Men Dun Jia 12 systems** — Sesheta มี QMDJ แต่เป็น sub-feature
- 🆕 **Personalized Action Mode L1-L6** — trader discipline
- 🆕 **TSC Team Score Composite** — multi-person pinning
- 🆕 **Outcome tracking + Advice DB** — data flywheel
- 🆕 **Direction & Route lookback** — 8 directions × scoring
- 🆕 **Multi-language TH+EN+ZH** — Sesheta แค่ TH+EN
- 🆕 **Bloomberg-style executive UI** — vs Sesheta soft amber

### C. ที่ต้อง add จาก Joey Yap (เพิ่ม)
- 28 Lunar Mansions (二十八宿)
- 18 Life Domains visualization
- 7 Stars Path (七星打劫法)

---

## 📂 ไฟล์ที่ใช้ได้ทันที

ทั้งหมดอยู่ที่ `/home/claude/decode-extract/`:

```
sesheta-archetypes-25.json       — สำหรับ /archetypes page (TH+EN ครบ)
sesheta-structures-16.json       — สำหรับ /structure page (18 structures)
sesheta-strengths.json           — สำหรับ /strength page
sesheta-useful-god-ranks.json    — algorithmic seed
sesheta-bazi-lookup-tables.json  — core engine seed
sesheta-stem-combos.json         — combination engine
sesheta-crisis-detection.json    — crisis algorithm
sesheta-scoring-engine.json      — DM strength scoring
```

**Decode สามารถใช้เป็น seed content** (rewrite ด้วยภาษาเรา) → ทุ่นเวลา content writing 80%

---

## 🚀 Next Step

1. **Mockup Decode pages** (BaZi/QMDJ detail) ใช้ content engine นี้
2. **ส่ง Jarvis build VPS** — ใช้ JSON เป็น seed
3. **Master comparison Decode vs Sesheta vs Joey Yap** — ทำ 1-pager
