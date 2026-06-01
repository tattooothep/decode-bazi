# ✅ 5 Missing Items — DECODED COMPLETE

วันที่: 5 พฤษภาคม 2026

---

## 📋 ผลสำรวจ — ทุกรายการที่พี่ระบุ

| # | รายการ | สถานะ Hourkey | ผลลัพธ์ |
|---|---|---|---|
| 1 | **60 JiaZi cycle table** | ⚠️ มีแค่ Year lookup 1919-2100 | ✅ Build เพิ่มเอง 60 ตัว |
| 2 | **Na Yin 60 คู่** | ❌ ไม่มี | ✅ Build เพิ่มเอง — Decode exclusive |
| 3 | **空亡 Kong Wang Voids** | ✅ มี (function Re) | ✅ แกะ formula + 60 lookup |
| 4 | **六破 Six Destructions** | ❌ ไม่มี | ⚠️ Decode ต้องเพิ่ม |
| 5 | **Solar→BaZi conversion** | ✅ มีครบ (ยกเว้น True Solar) | ✅ แกะ algorithm ทั้งหมด |
| 6 | **Luck Pillar 大運** | ✅ มี (function `_r`, `br`) | ✅ แกะ direction + start age |

---

## 1. 🆕 60 JiaZi Cycle Table

```
Hourkey มีแค่ year-pillar lookup (181 ปี: 1919-2100)
NOT มี standalone 60 JiaZi reference table

→ Decode ใช้ formula:
   stem_idx = year_idx % 10
   branch_idx = year_idx % 12
   ใช้สร้าง 60 JiaZi cycle ได้ทันที
```

📁 **File**: `hourkey-jiazi-year-table.json` — 181 years (1919-2100)

**ตัวอย่าง:**
- 1924 → 甲子
- **1984 → 甲子 (Aeaw's year)**
- 1986 → 丙寅 (Mai's year)
- 2024 → 甲辰 (น้องปุญ's year)
- 2026 → 丙午 (current)

---

## 2. 🆕 Na Yin 60 (納音) — DECODE EXCLUSIVE!

```
❌ Hourkey ไม่มี Na Yin เลย
✅ Decode build 60 ตัวพร้อม element + symbol
```

📁 **File**: `hourkey-na-yin-60.json` — 60 sound elements (5 categories × 12)

### Aeaw's Family Na Yin

| Person | Pillar | Na Yin | English | Symbol |
|---|---|---|---|---|
| **Aeaw** (year) | 甲子 | 海中金 | Gold in the Sea | 🌊 |
| **Aeaw** (month) | 丙子 | 澗下水 | Water at the Valley Stream | 💧 |
| **Aeaw** (day) | 己亥 | **平地木** | **Plain Land Wood** | 🌾 |
| **Aeaw** (hour) | 辛未 | 路旁土 | Earth on the Roadside | 🛤️ |
| **Mai** (day) | 辛巳 | 白蠟金 | White Wax Metal | 🕯️ |
| **น้องปุญ** (year) | 甲辰 | 覆燈火 | Lamp Fire (Covered) | 🪔 |

### 🎯 Aeaw = 平地木 (Plain Land Wood) Interpretation

> *"ดินที่ราบเรียบ พร้อมปลูกต้นไม้สูงตระหง่าน"*
>
> - **บุคลิก**: ค่อยๆ สร้างจักรวรรดิจากพื้นฐานที่มั่นคง
> - **จุดแข็ง**: ความอดทน + การวางแผนระยะยาว
> - **อาชีพเหมาะ**: Real estate, Manufacturing, Long-term investment, Agriculture
> - **กับดัก**: ระวังความเฉื่อย — ต้องมีไม้ (พลังเสริม) ขับเคลื่อน

### 🎯 Mai = 白蠟金 (White Wax Metal) Interpretation

> *"เทียนไขที่ละลายตัวเองให้สว่าง"*
>
> - **บุคลิก**: ผู้ให้ที่อ่อนโยน, ทอแสงสว่างให้คนรอบข้าง
> - **คู่กับ Aeaw 平地木**: เทียน + ดิน = เทียนตั้งบนพื้นได้มั่นคง = คู่ที่ลงตัว!
>   (Aeaw ให้ความมั่นคง, Mai ให้แสงสว่าง/ความอบอุ่น)

### 🎯 น้องปุญ = 覆燈火 (Lamp Fire) Interpretation

> *"ไฟตะเกียงที่มีร่มกัน"*
>
> - **บุคลิก**: แสงสว่างที่อ่อนโยน, ฉลาด, เน้นในเรื่องเฉพาะ
> - **กับ Mai 白蠟金 + Aeaw 平地木**: ไฟ + เทียน + ดิน = องค์ประกอบครบ "บ้านอบอุ่น"

---

## 3. ✅ Kong Wang (空亡) — Hourkey มี!

### Hourkey's Algorithm (decoded)

```javascript
function calculateKongWang(dayStem, dayBranch) {
  const stems = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
  const branches = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
  
  const r = stems.indexOf(dayStem)     // 0-9
  const t = branches.indexOf(dayBranch) // 0-11
  const o = ((t - r) % 12 + 12) % 12
  const void1 = branches[(o + 10) % 12]
  const void2 = branches[(o + 11) % 12]
  return [void1, void2]
}
```

📁 **File**: `hourkey-kongwang-60-table.json` — All 60 pillars

### 6 Xuns (旬) Reference

```
甲子旬 (60 days from 甲子) → Void: 戌亥
甲戌旬 → Void: 申酉
甲申旬 → Void: 午未
甲午旬 → Void: 辰巳   ← Aeaw's xun (己亥 day pillar)
甲辰旬 → Void: 寅卯
甲寅旬 → Void: 子丑
```

### 🎯 Aeaw's Voids = 辰巳

```
Day Pillar 己亥 → Belongs to 甲午旬 → Void: 辰, 巳

ความหมาย:
• ปีที่มี 辰 (Dragon) หรือ 巳 (Snake) ในเสาปี/เสาเดือน 
  → มีลักษณะ "void" = พลังนั้นถูกลบล้าง
• ระวัง 戊辰, 戊戌, 庚辰, 壬辰 ปีกำลังมาถึง (2024-2025 ผ่านไปแล้ว)
• ปีที่ดี: 寅, 卯, 午, 申, 酉, 戌, 亥, 子, 丑, 未 (active)

Trader's insight:
• การเทรดในเดือน 辰 (March-April) อาจรู้สึก "เหมือนของเล็กๆ ไม่กระทบ"
• การเทรดในเดือน 巳 (April-May) อาจรู้สึก "ความตื่นเต้นไม่จริง"
```

---

## 4. ⚠️ 六破 (Six Destructions) — Hourkey ไม่มี

### สถานะ
- Hourkey **ไม่ implement** 六破
- Decode สามารถ **เพิ่มเป็น differentiator**

### 六破 Reference (เพิ่มเองให้ Decode)

```
6 Pairs (子⇄酉, 丑⇄辰, 寅⇄亥, 卯⇄午, 巳⇄申, 未⇄戌)

ความหมาย: "ทำลายความสงบ"
- เมื่อพบในชาร์ต = ความขัดแย้งเล็กๆ ที่ค่อยๆ บั่นทอน
- ต่างจาก 六沖 (clash) ที่รุนแรงทันที
- 六破 = slow burn / passive sabotage
```

📁 **TODO**: ผมจะ build `decode-six-destructions.json` ถ้าพี่อยากให้ทำ

---

## 5. ✅ Solar → BaZi Conversion — Hourkey มีครบ (ยกเว้นข้อ 1)

📁 **File**: `hourkey-solar-bazi-engine.json` — Algorithm ครบทุก function

### Hourkey's Conversion Pipeline (decoded)

```
Birth Date/Time
       ↓
┌──────────────────────────────────────────┐
│ Year Pillar (c2)                         │
│ - Check 立春 boundary                     │
│ - stem = (year-4) % 10                   │
│ - branch = (year-4) % 12                 │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ Month Pillar (Er)                        │
│ - Find current 節氣 (Jie Qi) period      │
│ - Apply 五虎遁元 (Cr table)              │
│   甲己→丙, 乙庚→戊, 丙辛→庚,            │
│   丁壬→壬, 戊癸→甲                       │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ Day Pillar (g2)                          │
│ - Anchor: Jan 1, 1900 = 庚午              │
│ - days_elapsed = (date - anchor) / 86400  │
│ - stem = days % 10                        │
│ - branch = (days+10) % 12                 │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ Hour Pillar (Dr)                         │
│ - hour_branch = floor((hour+1) % 24 / 2) │
│ - hour_stem = (day_stem*2 + hb) % 10     │
│ ⚠️ NO TRUE SOLAR TIME correction!        │
└──────────────────────────────────────────┘
```

### 24 Solar Terms ครบ (extracted)

📁 **File**: `hourkey-24-solar-terms.json`

```
12 Jie Qi (節氣 - Start of months):
立春 (寅) → 驚蟄 (卯) → 清明 (辰) → 立夏 (巳) →
芒種 (午) → 小暑 (未) → 立秋 (申) → 白露 (酉) →
寒露 (戌) → 立冬 (亥) → 大雪 (子) → 小寒 (丑)

12 Zhong Qi (中氣 - Middle of months):
雨水 (寅) → 春分 (卯) → 穀雨 (辰) → 小滿 (巳) →
夏至 (午) → 大暑 (未) → 處暑 (申) → 秋分 (酉) →
霜降 (戌) → 小雪 (亥) → 冬至 (子) → 大寒 (丑)
```

### 🎯 Decode's Edge: Add True Solar Time

```javascript
// Decode enhancement (Hourkey doesn't have)
function trueSolarTimeCorrection(date, longitude) {
  // 1. Standard meridian for timezone
  const standardLon = 105  // Asia/Bangkok = 105°E
  
  // 2. Longitude offset (4 min per degree)
  const lonOffsetMin = (longitude - standardLon) * 4
  // For Bangkok (100.5°E): -18 min
  
  // 3. Equation of Time (EoT) - varies through year
  const eot = calculateEoT(date)
  // EoT ranges from -14 to +16 minutes
  
  // 4. Apply correction
  const correctedDate = new Date(date.getTime() + (lonOffsetMin + eot) * 60000)
  return correctedDate
}
```

---

## 6. ✅ Luck Pillar (大運) — Hourkey มี!

### Hourkey's Algorithm (decoded — `_r`, `br`, `wr`, `Mr` functions)

```
1. Direction (forward/reverse):
   pr = ['甲','丙','戊','庚','壬']  // Yang stems
   
   isYangYear = pr.includes(yearStem)
   isMale = (gender === 'male')
   direction = (isYangYear && isMale) || (!isYangYear && !isMale)
               ? 'forward' : 'reverse'

2. Anchor Solar Term:
   - forward: next 節氣 after birth
   - reverse: previous 節氣 before birth

3. Gap (function Mr):
   total_minutes = |anchor - birth| / 60000
   years = floor(total_minutes / 4320)   // 4320 min = 3 days
   remaining = total_minutes % 4320
   months = floor(remaining / 360)        // 360 min = 6 hr ≈ 1 month
   days = floor(remaining % 360 / 12)     // 12 min ≈ 1 day
   
   Traditional rule: 3 days = 1 year of luck

4. Pillars (function br):
   For 9 future luck pillars:
     forward: monthIdx + 1, +2, +3, ..., +9
     reverse: monthIdx - 1, -2, -3, ..., -9
   Each lasts 10 years
```

### 🎯 Aeaw's Luck Pillars (己 male, 甲 yang year, born Dec 31 1984)

```
Year stem 甲 = Yang (in pr list)
Gender = Male
→ Direction = FORWARD

Month pillar 丙子
Next solar term after Dec 31 = 小寒 (Jan 6, 1985)
Gap from Dec 31 13:15 to Jan 6 ≈ 5.5 days
→ Start age ≈ 5.5/3 = 1.8 years (start at age ~2)

Forward Luck Pillars (each 10 years):
  Age  2-12: 丁丑 (Fire/Yin Earth)  ← Useful! Fire warms, Earth supports
  Age 12-22: 戊寅 (Earth/Wood)      ← Wood breaks weak Earth — challenging
  Age 22-32: 己卯 (Earth/Wood)      ← Same challenge
  Age 32-42: 庚辰 (Metal/Earth)     ← Output drains DM, but Earth supports
  Age 42-52: 辛巳 (Metal/Fire)      ← Fire warms = great support
  Age 52-62: 壬午 (Water/Fire)      ← Water hurts winter chart, Fire helps
  Age 62-72: 癸未 (Water/Earth)     ← Mixed
  Age 72-82: 甲申 (Wood/Metal)      ← Wood + Metal = ?
  Age 82-92: 乙酉 (Wood/Metal)      ← Similar

🎯 Best decade for Aeaw (in business now at 41): 
   Age 42-52 (2026-2036) = 辛巳 = Fire arrives!
   This matches Aeaw's chart needing Fire (Frozen crisis)
   = Big breakthrough decade ahead!
```

---

## 📊 Status Summary

```
╔════════════════════════════════════════════════════════╗
║              5 MISSING ITEMS — STATUS                  ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  ✅ 60 JiaZi: Built (181 years)                       ║
║  ✅ Na Yin: Built (Decode-exclusive)                  ║
║  ✅ Kong Wang: Decoded + 6 Xuns                       ║
║  ⚠️  Six Destructions: Hourkey missing - Decode add    ║
║  ✅ Solar→BaZi: Full algorithm decoded                ║
║  ✅ Luck Pillar: Full algorithm decoded               ║
║                                                        ║
║  TOTAL FILES: 24 JSON / 280 KB                        ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
```

---

## 🎯 Decode's Competitive Edge ที่ "ขาด" จาก Hourkey

```
สิ่งที่ Hourkey ไม่มี (Decode เพิ่มได้ทันที):

1. 60 Na Yin (60 納音) ★★★    ← Already built
2. True Solar Time correction ★★★
3. 六破 Six Destructions ★★
4. Multi-school luck calc (1hr=5day variant) ★
5. Hour-by-hour luck refinement ★
6. Multi-language ZH support (Hourkey = TH+EN only)
7. Bloomberg-style executive UI
8. Action Mode L1-L6
```

---

## 📦 Files (24 JSON / 280 KB)

```
/mnt/user-data/outputs/
├── hourkey-jiazi-year-table.json       ✨ NEW (3 KB)
├── hourkey-kongwang-60-table.json      ✨ NEW (6 KB)
├── hourkey-na-yin-60.json              ✨ NEW Decode-exclusive (7 KB)
├── hourkey-24-solar-terms.json         ✨ NEW (4 KB)
├── hourkey-solar-bazi-engine.json      ✨ NEW (5 KB)
├── hourkey-month-jieqi.json            ✨ NEW (0.1 KB)
└── ... 18 ไฟล์อื่นที่แกะมาแล้ว
```
