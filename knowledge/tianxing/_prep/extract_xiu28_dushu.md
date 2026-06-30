# สกัดตาราง 二十八宿距度 (28-mansion ecliptic extents) — สำหรับ map longitude → 宿+度

> งานวิจัย read-only 30 มิ.ย. 2026 · เป้า: ตาราง距度ที่รวมได้ ≈360° (黃道) หรือ 365.25° (古度) เพื่อใช้ map ecliptic longitude → 宿+度 ในกฎ廟旺度數 ของ engine 七政四餘
> **constraint: ห้าม fake ตัวเลข · ทุกค่าระบุที่มา · แหล่งต่างกันเก็บทั้งคู่ · ใช้คำนวณดวงคนจริง**

---

## 0) TL;DR — สรุปเร่งด่วน (อ่านก่อน)

- 🔴 **ปัญหาเดิม**: ค่าจาก ctext 張果星宗 รวมได้ 350° = ตกหล่น/variant เพี้ยน → **ทิ้ง ใช้ไม่ได้**
- ✅ **มี 3 ระบบที่ source ได้** (เก็บทั้งหมด เทียบกัน):
  1. **赤道古度 365.25** (開元占經/漢制) — รวม 365.25 · **赤道 (equatorial)** · ไม่ตรง用 (七政四餘ใช้黃道) แต่เป็น cross-check
  2. **黃道 ~360** (七政四餘 practitioner สมัยใหม่) — รวม 360 · 黃道 ✓ · **แต่เป็นเลขกลม + แหล่งต่างกันค่าไม่ตรงกัน** (ความเชื่อมั่นกลาง)
  3. **距星 (determinative stars) list** — exact, จาก en.wikipedia · **= วิธีที่ถูกต้องที่สุดสำหรับ engine นี้** (คำนวณขอบเขต宿จาก黃經ของ距星จริง)
- ⭐ **KEY finding สำหรับ engine**: engine มี `ayanamsa()` (Lahiri) อยู่แล้ว (`src/lib/tianxing/tables.ts:148`) → **Lahiri ตรึง Spica (角距星) ≈ sidereal 180°00'** → ดังนั้น **角宿初度 ≈ sidereal longitude 180°** (epoch-stable เพราะเป็น sidereal) → ใช้เป็น anchor ได้เลย ไม่ต้องเดา epoch
- 🟡 **กำลังหาเพิ่ม**: ตาราง 時憲/曆象考成 黃道宿度 ละเอียดระดับ 度分 (background agent กำลังขุด wikisource/ctext) → จะเติม section 1C เมื่อได้

### คำแนะนำ implementation (ความเชื่อมั่นสูง)
ใช้ **距星 method** เป็นหลัก ไม่ใช่ตารางเลขกลม:
1. นิยาม 28 距星 ด้วยพิกัด Hipparcos/J2000 (RA/Dec) → `astronomy-engine` `DefineStar()` (lib มีอยู่แล้ว v2.1.19)
2. คำนวณ ecliptic longitude ของแต่ละ距星 ที่ epoch ที่ต้องการ → sidereal (ลบ ayanamsa เดียวกับที่ engine ใช้)
3. ดาว(七政四餘)อยู่宿ไหน = sidereal lon ตกในช่วง [距星ᵢ, 距星ᵢ₊₁) · 度ภายใน = sidereal_lon − 距星ᵢ_lon
4. 距度ᵢ = 距星ᵢ₊₁_lon − 距星ᵢ_lon → **รวมได้ 360° อัตโนมัติ** + จัดการ歲差ในตัว
> ข้อดี: ไม่ขึ้นกับตารางเลขกลมที่ขัดแย้งกัน · ตรงนิยามจีน (入宿度 วัดจาก距星) · anchor = Spica 180° ตรงกับ Lahiri ที่ engine ใช้แล้ว

---

## 1) ตาราง距度 28 宿 — เทียบหลายแหล่ง

### 1A · 赤道古度 365.25 (開元占經/漢制) — **赤道 (EQUATORIAL)**
ที่มา: news.qq.com บทความ "赤道基准的星空刻度：中国古代二十八宿的坐标体系" (อ้าง 開元占經 ข้อมูลสมัยฮั่น) · https://news.qq.com/rain/a/20251213A04ZWH00

| # | 宿 | 距度(古度) | | # | 宿 | 距度 | | # | 宿 | 距度 | | # | 宿 | 距度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 角 | 12 | | 8 | 斗 | 26 | | 15 | 奎 | 16 | | 22 | 井 | 33 |
| 2 | 亢 | 9 | | 9 | 牛 | 8 | | 16 | 婁 | 12 | | 23 | 鬼 | 4 |
| 3 | 氐 | 15 | | 10 | 女 | 12 | | 17 | 胃 | 14 | | 24 | 柳 | 15 |
| 4 | 房 | 5 | | 11 | 虛 | 10 | | 18 | 昴 | 11 | | 25 | 星 | 7 |
| 5 | 心 | 5 | | 12 | 危 | 17 | | 19 | 畢 | 16 | | 26 | 張 | 18 |
| 6 | 尾 | 18 | | 13 | 室 | 16 | | 20 | 觜 | 2 | | 27 | 翼 | 18 |
| 7 | 箕 | 11 | | 14 | 壁 | 9 | | 21 | 參 | 9 | | 28 | 軫 | 17 |

- **รวม = 365** (บทความระบุ total = **365.25 度**) → ¼ ที่หายคือ **斗分**: ตามตำราคลาสสิก 箕=11¼ และ/หรือ 斗=26¼ (เลขกลมในบทความตัด ¼ ทิ้ง)
- ระบบ: **赤道 (equatorial right-ascension difference)** — เป็น 入宿度/去極度 วัดด้วย浑仪 (บทความยืนยัน "本质上基于赤道坐标系")
- ⚠️ **ใช้ตรงกับ七政四餘ไม่ได้** (七政四餘ต้อง黃道) — เก็บไว้ cross-check เท่านั้น
- ความเชื่อมั่น: **สูง** (ตรงกับชุด canonical 三統/開元 ที่รู้กันทั่วไป) · แต่ explicit source = 1 (qq.com)

### 1B · 黃道 ~360 (七政四餘 practitioner สมัยใหม่) — **黃道 (ECLIPTIC)** ✓
ที่มา: 阐微堂 chanweitang "天星风水与二十八宿详细论述" · https://www.chanweitang.com/post/21.html
(หน้านี้ยืนยันชัด "黃道就在这两颗星之间穿过" = เป็น黃道 · ให้เลขกลม度)

| # | 宿 | 距度(黃·กลม) | | # | 宿 | 距度 | | # | 宿 | 距度 | | # | 宿 | 距度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 角 | 12 | | 8 | 斗 | 24 | | 15 | 奎 | 17 | | 22 | 井 | 33 |
| 2 | 亢 | 9 | | 9 | 牛 | 7 | | 16 | 婁 | 12 | | 23 | 鬼 | 3 |
| 3 | 氐 | 16 | | 10 | 女 | 11 | | 17 | 胃 | 14 | | 24 | 柳 | 14 |
| 4 | 房 | 6 | | 11 | 虛 | 10 | | 18 | 昴 | (≈2)* | | 25 | 星 | 7 |
| 5 | 心 | 6 | | 12 | 危 | 18 | | 19 | 畢 | 16 | | 26 | 張 | 19 |
| 6 | 尾 | 19 | | 13 | 室 | 17 | | 20 | 觜 | 1 | | 27 | 翼 | 19 |
| 7 | 箕 | 11 | | 14 | 壁 | 10 | | 21 | 參 | 9 | | 28 | 軫 | 18 |

- รวมที่อ่านได้ (ไม่รวม昴) = 358 → ถ้า total = 360 ⇒ **昴 ≈ 2** *(WebFetch อ่านค่า昴ไม่ชัด — ทำเครื่องหมาย🔴 ห้ามใช้ดิบ)*
- ⚠️ **น่าสงสัย**: 觜=1, 昴≈2 ดูเล็กผิดปกติ (昴宿/Pleiades ปกติกว้างกว่านี้ในระบบ赤道) → อาจ mis-OCR หรือเป็น variant เฉพาะ
- 七曜配 (จากหน้าเดียวกัน · มาตรฐาน): 角木 亢金 氐土 房日 心月 尾火 箕水 / 斗木 牛金 女土 虛日 危月 室火 壁水 / 奎木 婁金 胃土 昴日 畢月 觜火 參水 / 井木 鬼金 柳土 星日 張月 翼火 軫水
- ความเชื่อมั่น: **กลาง-ต่ำ** (เลขกลม + 昴อ่านไม่ชัด)

### 1B′ · 黃道 variant ที่ 2 (七政四餘擇日) — **ขัดกับ 1B**
ที่มา: life-guide.com.tw + btko.net (search snippet) — "角木十一度，亢金十度，氐土十八度，房日五度…"
- 角11 亢10 氐18 房5 … → **ค่าต่างจาก 1B** (角12氐16 vs 角11氐18)
- 🔴 **สรุปสำคัญ**: ตาราง黃道"เลขกลม"จากสาย practitioner **ไม่ตรงกันระหว่างแหล่ง** → ยืนยันว่าตารางเลขกลมไม่น่าเชื่อถือพอใช้คำนวณดวงจริง → **ต้องใช้距星method (section 2) แทน**

### 1C · 時憲/曆象考成 黃道宿度 ระดับ 度分 — 🔴 หา verbatim ไม่ได้ (อยู่ในสแกนเท่านั้น)
สรุปจาก deep-dig (background agent): **ตาราง黃道宿度ระดับ 度分秒 ที่รวม 360° ไม่มีในเว็บแบบ text** — มีแต่ในภาพสแกน
- **สายต้นฉบับที่ถูกต้อง (lineage)**: 崇禎曆書/西洋新法算書 (เยซูอิต 1634/1645)「黃道二十八宿度分」→ 御製曆象考成 → **欽定儀象考成 (1756) 恒星黃道經緯度表** — ตารางนี้แหละมี 度分秒 ครบ (觜前參後 + นิยาม距星ใหม่บางตัว)
  - ยืนยัน lineage: zh.wikipedia 崇禎曆書 https://zh.wikipedia.org/zh-tw/崇禎曆書 · Fandom 中國星官 wiki (儀象考成 1752/1756)
  - 🟡 **next step ถ้าต้องการ 度分**: ต้อง OCR สแกน (archive.org / ctext image scan / 四庫全書 西洋新法算書) — ไม่มี transcribed text บนเว็บเปิด
- 賈逵 黃道宿度 (後漢書律曆中, ค.ศ.92) อยู่ใน ctext แต่ render เป็น [TABLE] image อ่าน verbatim ไม่ได้ → **ไม่กรอก** (ห้ามเดา)
- block ที่เจอ: wikisource wiki-path (402), zhihu (403), sina blog (418), loongese (403), grokipedia (403); ctext 御制历象考成 = มีแต่ TOC + เนื้อหา竗食/parallax ไม่ใช่ตารางดาว

### 1D · CWA scholarly paper — 赤道 J2000 recompute (verbatim, ความเชื่อมั่นสูง) — **赤道**
ที่มา: 邱國光 (1991)〈中國二十八宿對應2000年分點圖考〉氣象學報 37(3), 中央氣象局天文站 (อ่านจาก PDF สแกนตรง)
URL: https://photino.cwa.gov.tw/rdcweb/lib/cd/cd07mb/MB/PDF/37/No.3/04.pdf
- เป็น **赤道 (equatorial) epoch 2000** — ไม่ใช่黃道 แต่เป็น cross-check ที่แม่นและมีที่มาชัด
- ค่าที่ quote verbatim: 角宿距星 = α Vir (Spica/角宿一, 67 α Vir) 赤經 13h25m11.5s · 亢距星 κ Vir → **角宿赤道距度 = 47.7ᵐ÷4 = 11.925°** · 觜 = **1.410°** (เล็กสุด) · 井 = **32.145°** (ใหญ่สุด)
- **anchor分點 (equatorial 入宿度 epoch 2000)**: 春分點 = 室宿 13.815° · 夏至點 = 參宿 4.8° · 秋分點 = 翼宿 15.06° · 冬至點 = 箕宿 17.04°
- paper ยืนยัน 2 จุดสำคัญ: (1) สำรวจแต่ละยุค (漢/唐/宋/元/明/清康熙1672/乾隆1744/道光/光緒) ค่า距度ต่างกันเพราะ**歲差** · (2) **羅經/七政四餘 ใช้ 黃經 (ecliptic longitude)** — ยืนยันว่า engine ต้องทำงานในกรอบ黃道
- astro-jack.com 七政四餘廿八宿 ยืนยันอิสระ 角=12 (https://www.astro-jack.com/2021/04/七政四餘廿八宿/)

---

## 2) วิธีที่ถูกต้องที่สุดสำหรับ engine: 距星 (determinative stars)

**นิยามจีน**: ขอบต้นของแต่ละ宿 = 距星ของมัน · 入宿度 วัดจาก距星 → ดังนั้นขอบเขต黃道ของ宿 = 黃經ของ距星 (sidereal)

### ตาราง 28 距星 (exact) — ที่มา: en.wikipedia "Chinese constellations" (https://en.wikipedia.org/wiki/Chinese_constellations) · cross-check zh.wikipedia "二十八宿"
ความเชื่อมั่น: **สูงมาก** (Bayer designation มาตรฐานสากล)

| # | 宿 | 距星 (Bayer) | สามัญ | | # | 宿 | 距星 | | # | 宿 | 距星 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 角 Jiao | **α Vir** | Spica | | 11 | 虛 Xu | β Aqr | | 21 | 參 Shen | ζ Ori |
| 2 | 亢 Kang | κ Vir | | | 12 | 危 Wei | α Aqr | | 22 | 井 Jing | μ Gem |
| 3 | 氐 Di | α Lib | | | 13 | 室 Shi | α Peg | | 23 | 鬼 Gui | θ Cnc |
| 4 | 房 Fang | π Sco | | | 14 | 壁 Bi | γ Peg | | 24 | 柳 Liu | δ Hya |
| 5 | 心 Xin | α Sco | Antares | | 15 | 奎 Kui | η And | | 25 | 星 Xing | α Hya |
| 6 | 尾 Wei | μ Sco | | | 16 | 婁 Lou | β Ari | | 26 | 張 Zhang | υ¹ Hya |
| 7 | 箕 Ji | γ Sgr | | | 17 | 胃 Wei | 35 Ari | | 27 | 翼 Yi | α Crt |
| 8 | 斗 Dou | φ Sgr | | | 18 | 昴 Mao | 17 Tau | Pleiades | | 28 | 軫 Zhen | γ Crv |
| 9 | 牛 Niu | β Cap | | | 19 | 畢 Bi | ε Tau | | | | |
| 10 | 女 Nu | ε Aqr | | | 20 | 觜 Zi | λ Ori | | | | |

> หมายเหตุ角距星: zh.wikipedia ระบุ 開元占經/石氏 ใช้ "左角" = 角宿二 (ζ Vir) แต่ 宋史·天文志 + ระบบสมัยใหม่ใช้ "南星" = 角宿一 (α Vir / Spica) → **ใช้ α Vir (Spica)** ตามมาตรฐาน七政四餘 + Lahiri

---

## 3) ANCHOR (จุดเริ่ม 角宿初度) — ⭐ ตรงกับ engine ที่มีอยู่

- engine ปัจจุบัน (`src/lib/tianxing/tables.ts:148` `ayanamsa()`) ใช้ **Lahiri** (~23.853° @J2000, +50.29″/ปี · มาร์คว่า V1 placeholder)
- **Lahiri (Chitrapaksha) ตรึง Spica (Chitra = α Vir = 角距星) ที่ sidereal longitude ≈ 180°00′** (นิยาม Lahiri)
- ⇒ **角宿初度 (start of 角) ≈ sidereal longitude 180°** ในกรอบที่ engine ใช้อยู่แล้ว
- เป็น **epoch-stable** (sidereal — ดาวฤกษ์ไม่เลื่อนในกรอบนี้) → **ไม่ต้องเดา epoch** (ต่างจากปัญหา紫氣)
- ลำดับ宿เดินทาง黃經เพิ่มขึ้น (eastward): 角(180°) → 亢 → 氐 → … → 軫 → วน角
- ⚠️ caveat: Lahiri มีหลาย variant; Spica อาจอยู่ 179°59′ ไม่ใช่ 180°00′ เป๊ะ (ต่าง ~1′) · และ ayanamsa ของ engine เป็น V1 placeholder → ตัวเลข ayanamsa เองควร confirm กับสำนักจีน (มี TODO prep#3 อยู่แล้ว)

### ✅ cross-check ยืนยัน anchor (อิสระ)
- CWA paper (1D) ให้ Spica **tropical ecliptic longitude ≈ 24°10′ Libra = 204°10′ ≈ 204.17°** (ความเชื่อมั่นต่ำ-แหล่ง astrology)
- ayanamsa @2000 ≈ 23.86° (จาก `ayanamsa()` ของ engine) → **Spica sidereal ≈ 204.17 − 23.86 = 180.3°** (agent ระบุ ≈ 29°53′ Virgo = 179.88°)
- ⇒ **ตรงกับ 角宿初 = sidereal 180° (±~0.3°)** → ยืนยันว่าใช้ Lahiri anchor 角=180° ถูกต้องในกรอบที่ engine ใช้อยู่
- ⚠️ ความต่าง ~0.3° มาจาก Spica latitude −2.06° (黃緯ไม่เป็น 0) + Lahiri variant → ตอน implement ควรใช้ 黃經ของ距星จริง (คำนวณ) ไม่ใช่ assume 180° เป๊ะ

### ที่มา anchor
- Lahiri/Spica=180°: นิยามมาตรฐาน Chitrapaksha ayanamsa (sidereal astrology) — ตรงกับ comment ในโค้ด `ayanamsa()` ที่ใช้ Lahiri
- 角距星 = α Vir (Spica): en.wikipedia + zh.wikipedia (section 2) + CWA paper 1D (67 α Vir = 角宿一)
- Spica tropical ≈204°10′ Libra + sidereal ≈179.88°: CWA paper 1D + agent aggregation (ความเชื่อมั่นต่ำ — ใช้ ballpark cross-check)

---

## 4) ระบบ赤道 vs 黃道 — ข้อระวังสำคัญ

| | 赤道距度 (equatorial) | 黃道距度 (ecliptic) |
|---|---|---|
| คือ | ผลต่าง赤經 (RA) ของ距星 | ผลต่าง黃經 (ecliptic lon) ของ距星 |
| รวม | 365.25 (古度) | 365.25 (古度) หรือ 360 (新法清) |
| 七政四餘ใช้ | ❌ ไม่ใช่ | ✅ **ใช่** — ต้องใช้黃道 |
| แหล่งส่วนใหญ่ | 授時曆/開元占經/三統 = **赤道** | 賈逵(後漢)/時憲(清) = 黃道 |

- 授時曆 = 赤道 เป็นหลัก → **อย่าเอา距度授時มาใช้ตรง ๆ กับ黃道longitude**
- 開元占經/漢制 (section 1A) = 赤道 → cross-check เท่านั้น
- 距星 method (section 2) คำนวณ黃經โดยตรง → **เป็น黃道โดยอัตโนมัติ ปลอดภัยสุด**

---

## 5) Cross-check ปี 1752 紫氣 ใน 尾宿

- จาก `extract_ziqi.md`: ปฏิทินจริง 御定七政四餘萬年書 p.52 → 1752 ต้นปี **紫氣 อยู่尾宿** (ระดับ宿ชัวร์ · 度อ่านไม่ออก)
- 尾宿 = ช่วง [尾距星 μ Sco, 箕距星 γ Sgr) ในกรอบ sidereal
- 🟡 **ยังปิด loop เป็นตัวเลขไม่ได้**: ต้องมี sidereal longitude ของ紫氣ปี 1752 (ซึ่ง度อ่านจาก萬年書ไม่ออก — ห้ามเดา ตาม constraint)
- ✅ แต่ structure พร้อม: เมื่อ engine คำนวณ紫氣_lon(1752) แล้ว ตรวจว่าตกใน [μ Sco, γ Sgr) → ถ้าใช่ = ระบบ距度+anchor ถูก
- 📌 ใช้ 距星 method (section 2) จะได้ขอบเขต尾宿เป็นองศาจริงทันทีเมื่อ implement → ใช้ verify紫氣ได้เมื่อแก้ปัญหา epoch紫氣

---

## 6) แหล่งทั้งหมด (URL ทุกค่า)

| ใช้กับ | URL | ได้อะไร |
|---|---|---|
| 1A 赤道365.25 | https://news.qq.com/rain/a/20251213A04ZWH00 | 28宿距度 (開元/漢) รวม 365.25 赤道 |
| 1B 黃道360 | https://www.chanweitang.com/post/21.html | 28宿距度กลม รวม~360 + ยืนยัน黃道 + 七曜配 |
| 1B′ variant | life-guide.com.tw / btko.net/Show-344 (snippet · หน้าเต็ม 403) | 角11亢10氐18房5 (擇日 variant ขัดกับ 1B) |
| 2 距星 | https://en.wikipedia.org/wiki/Chinese_constellations | 28距星 Bayer designation |
| 2 角距星 note | https://zh.wikipedia.org/wiki/二十八宿 | 左角(ζVir)石氏 vs 南星(αVir)宋史 |
| 3 anchor | `src/lib/tianxing/tables.ts:148` + นิยาม Lahiri Chitrapaksha | Spica=sidereal 180° |
| ภาพรวม赤/黃 | https://www.lamost.org/~yzhao/history/xiu28.html | คำอธิบาย距度=ผลต่าง赤經 |
| 5 1752 | `knowledge/tianxing/_prep/extract_ziqi.md` | 紫氣ใน尾宿 1752 (ground truth) |
| 1C ⏳ | wikisource 清史稿 / ctext 曆象考成·後漢書律曆 | 時憲/賈逵 黃道宿度 度分 (กำลังขุด) |

### แหล่งที่ลองแล้ว block/ไม่มีตาราง
- zhihu.com (403), getit01 (403), btko/Show-344 (403), 玄龍子 sina blog (418), loongese (403)
- ja.wikipedia/NAO 暦Wiki/yamauo: มี距星+RA/Dec (赤道, epoch BC169/J2000) แต่ไม่มี黃道距度 table
- ctext 後漢書律曆下: 黃道宿度 อยู่ใน [TABLE] ที่ render ไม่ออกเป็น text

---

## 7) ความมั่นใจรวม + งานต่อ

| รายการ | ความเชื่อมั่น |
|---|---|
| 距星 list 28 (section 2) | **สูงมาก** — ใช้ทำ engine ได้เลย |
| anchor 角=sidereal 180° (Lahiri/Spica) | **สูง** (convention) · ±1′ ขึ้นกับ Lahiri variant |
| 赤道古度 365.25 (1A) | สูง (canonical) แต่ **เป็น赤道 ใช้ cross-check** |
| 黃道360 เลขกลม (1B) | **กลาง-ต่ำ** — แหล่งขัดกัน (1B vs 1B′), 昴ไม่ชัด → อย่าใช้ดิบ |
| 時憲 黃道 度分 (1C) | ⏳ ยังไม่ได้ |
| 1752 紫氣 numeric verify | 🟡 ปิดไม่ได้ (ขาด紫氣 epoch — ดู extract_ziqi.md) |

**งานต่อ**:
1. ⏳ รอ agent: ตาราง 時憲/曆象考成 黃道宿度 度分 verbatim (section 1C) → จะเป็น黃道ตารางที่แม่นสุดเชิงประวัติศาสตร์
2. implement 距星 method: ใส่ Hipparcos J2000 RA/Dec ของ 28距星 → `astronomy-engine DefineStar` → คำนวณขอบเขต黃道 → unblock 宿/度 ใน `index.ts:84`
3. confirm ayanamsa ของ engine (V1 placeholder) กับสำนักจีน (prep#3 ค้างอยู่)
4. เมื่อแก้ epoch紫氣ได้ → verify 1752 紫氣 ∈ [μSco, γSgr]
