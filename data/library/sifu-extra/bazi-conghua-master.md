# data/library/bazi-conggе-huage-master.md
# คู่มืออ้างอิงคลาสสิก: 從格 (Following) · 化格 (Transformation) · 真/假 Boundary และกฎ 合化

> Persona: นักวิชาการสำนัก 子平 (Zǐpíng-school text scholar) สกัด diagnostic ruleset
> Style: ภาษาไทยนำ, ศัพท์จีนในวงเล็บ, ตารางและกฎตัดสินใจสำหรับวิศวกร (NOT fortune-telling)
> Scope: เครื่องมือสำหรับ scoring engine (hourkey.io) — แยก "หลักคลาสสิก" (classical doctrine) จาก "กฎใช้งานในเครื่อง" (engine implementation rule) อย่างเด็ดขาด
> Sources: 《滴天髓闡微》 任鐵樵增註 (原稿成書於道光二十八年/1848, 孫衡甫民國八年/1919 付印刊行), 《子平真詮》 沈孝瞻原著 (最早題記乾隆四十一年/1776 丙申, 胡焜倬空甫識), 《子平真詮評註》 徐樂吾評註 (民國二十五年二月/1936, 「東海樂吾氏識於海上寓次」), 《三命通會》 萬民英 撰 (明萬曆六年刊本/1578)

---

## 0. โครงสร้างเอกสาร (Document Map)

| Part | หัวข้อ | ใช้แก้ engine problem |
|---|---|---|
| 1 | 從格 taxonomy (從財·從殺·從兒·從旺/強·從勢) | #1 ระบุประเภท 從 |
| 2 | 真從 vs 假從 boundary | #1 รากของการแตก reading 180° |
| 3 | 合化 真化/假化/合而不化 ruleset | #2 (甲己 error-guard) |
| 4 | Engine integration — conflict resolution | #1 #2 #3 (冲+反吟) |
| 5 | Test fixtures | validation |

---

# PART 1 — 從格 Taxonomy (โครงสร้างประเภท "ทิ้งตัวเอง ตามสิ่งอื่น")

## 1.1 หลักการรากฐาน (Root Doctrine) — 《滴天髓·從象》

**บทร้อยกรองต้นฉบับ (verse):** 「從得真者只論從，從神又有吉和凶。」 [verbatim · 《滴天髓》·從象]

แปลความ: เมื่อ "ตาม" จริง (真從) แล้ว ให้พิจารณาเฉพาะตัวสิ่งที่ถูกตาม (從神) เท่านั้น — แต่ 從神 เองก็ยังมีดี-ร้าย (吉凶) ขึ้นกับว่ามันต้องการอะไรเป็น 用神

**原註 (劉基註 ‒ 傳):** 「日主孤立無氣，天地人元、絕無一毫生扶之意，財官強甚，乃為真從也。既從矣，當論所從之神。」 [verbatim · 《滴天髓》原註·從象]

**任氏曰 — taxonomy ที่ใช้ในเครื่อง (canonical 6-fold list):** [verbatim · 《滴天髓闡微》·從象·任鐵樵 增註 (道光二十八年/1848)]

> 「從象不一，非專論財官而已也。日主孤立無氣、四柱無生扶之意，滿局官星、謂之**從官**，滿局財星、謂之**從財**。... 尚有**從旺、從強、從氣、從勢**之理，比從財官更難推算。」

⚠️ **หมายเหตุสำคัญสำหรับ engine:** ในบท《從象》เดิม 任鐵樵 ระบุไว้ **6 ชนิด** เท่านั้น คือ 從官·從財·從旺·從強·從氣·從勢 — **「從兒」 ไม่อยู่ในบทนี้** แต่อยู่ในบท《順局》ต่างหาก (verse: 「一出門來只見兒，吾兒成氣構門閭；從兒不管身強弱，只要吾兒又得兒。」) [verbatim · 《滴天髓》·順局]

## 1.2 ตารางรวมเงื่อนไขเข้าแต่ละ 從格 (Entry-Condition Table)

| 從格 | เงื่อนไขเข้า (Entry) | 用神 (useful god) | 喜運 (favorable luck) | 忌運 (disastrous luck) | คลาสสิกอ้าง |
|---|---|---|---|---|---|
| **從財格** (follow wealth) | 日干 失令·無根·無印; 四柱財星眾旺 (มี/ไม่มี官殺/食傷ก็ได้); ไม่มี印·比劫ช่วยตัวเอง | 財 | 食傷·財·官殺(หากมี財生官) | 印·比劫 (印คือศัตรูเอก) | 《滴天髓·從象》任氏曰 [verbatim] |
| **從殺格 / 從官殺** (follow officer-killing) | 日干 無根; 滿盤官殺 (七殺/正官); 官殺ต้อง 得令 และ 透干; ไม่มี印·比劫·食傷ขัดขวาง | 官殺 (หรือ財ที่生官殺) | 財·官殺 | 印 (เพราะ印化殺ทำให้ตัวเองฟื้น)·比劫·食傷ที่剋官殺 | 《滴天髓·從象》;《子平真詮·論雜格》 [paraphrase] |
| **從兒格** (follow output/child) | 日干弱 (อาจมีรากบางๆได้); 月令 食傷 หรือ 食傷成方/局; 食傷透干; ต้องมี財星泄秀 (มี"兒又見兒"); ไม่มี印剋食傷 | 食傷 (ถ้ามี財ยิ่งดี) | 食傷·財·比劫(เพราะ生食傷ไม่ขัด) | 印 (梟神奪食คือทำลายกุญแจ); 官殺ที่ไม่มี財ผ่าน | 《滴天髓·順局》 [verbatim]: 「從兒不管身強弱，只要吾兒又得兒。」 |
| **從旺格** (follow prosperity) | 四柱皆比劫，無官殺之制，มี印綬之生; 旺極 | 比劫·印 | 比劫·印·(食傷ถ้า印輕ก็ดี) | 財 (群劫爭財 九死一生); 官殺 (犯旺 凶禍立至) | 《滴天髓·從象》任氏 [verbatim]: 「運行比劫印綬則吉…官殺運謂之犯旺，凶禍立至；遇財星，群劫相爭，九死一生。」 |
| **從強格** (follow ultimate strength) | 四柱印綬重重，比劫疊疊，日主又當令; 絕無一毫財星官殺; 「二人同心」 | 印·比劫 | 純比劫·印 | 食傷 (มี印剋必凶); 財官 (觸怒強神 大凶) | 《滴天髓·從象》任氏 [verbatim] |
| **從氣格** (follow qi-direction) | 氣勢 ไปทางใดทางหนึ่ง (木火 หรือ 金水 หรือ 火土 ฯลฯ) โดยไม่จำกัด十神; เปรียบกับ 兩氣成象 | ตามทิศ氣 | ทิศตาม氣 | ทิศตรงข้าม | 《滴天髓·從象》任氏 [verbatim] |
| **從勢格** (follow momentum) | 日主無根; 財·官·食傷 ทั้งสามอย่าง並旺 ไม่สามารถตามอันใดอันหนึ่งเดียว; ไม่มี比劫·印; 「惟有和解之可也」 | ถ้า3อย่างเท่ากัน → ใช้財เป็นกุญแจ通關 (引通食傷之氣，助其財官之勢); ถ้าอย่างใดอย่างหนึ่งแรงสุด → ตามอันนั้น | 財 > 官殺 > 食傷 | 比劫·印 (必凶無疑) | 《滴天髓·從象》任氏 [verbatim]: 「須行財運以和之，引通食傷之氣，助其財官之勢則吉；行官殺運次之；行食傷運又次之；如行比劫印綬，必凶無疑。」 |

## 1.3 ระดับความเข้มเข้าเงื่อนไข (Strictness levels)

จากคลาสสิก เรียงจากเข้มสุดไปอ่อนสุด:

1. **從強格** เข้มที่สุด (印·比·當令ครบ ขาดแม้แต่หยดเดียวก็ไม่เข้า)
2. **從旺格** (比劫เต็ม、มี印生、ไม่มี官殺制)
3. **從財·從殺** (กลาง — ต้อง失令無根、ไม่มี印·比·食傷ขวาง)
4. **從氣** (มอง氣勢、เปิดกว่า)
5. **從兒格** (อ่อนสุด — รับ"hair-root微根"ได้ ตามที่ 《滴天髓·順局》บอกว่า「不管身強弱」)
6. **從勢格** (เหลือทางสุดท้าย เมื่อเข้าอันอื่นไม่ได้)

[internal · do not show customers] Engine ranking: 從強(strictness=0.95) > 從旺(0.90) > 從財/從殺(0.85) > 從氣(0.75) > 從兒(0.65) > 從勢(0.55)

## 1.4 หลัก陽干/陰干 (Yang vs Yin daymaster)

[verbatim · 《滴天髓·順逆》原註]: 「五陽得陽之氣，即能成乎陽剛之勢，不畏財殺之勢；五陰得陰之氣，即能成乎陰順之義」

**กฎใช้งาน:** 陽干 (甲丙戊庚壬) ตามได้ยากกว่า 陰干 (乙丁己辛癸) ภายใต้เงื่อนไขเดียวกัน — สำหรับ 陽日主 engine ต้องเพิ่มเกณฑ์ความเข้มขึ้น [internal · do not show customers] (โดย default +0.05 บน threshold)

---

# PART 2 — 真從 vs 假從 Boundary Criteria (หัวใจของ engine problem #1)

## 2.1 บทเปิด《假從》— Locus Classicus

**บทร้อยกรอง:** 「真從之象有幾人，假從亦可發其身。」 [verbatim · 《滴天髓》·假從]

**原註 (劉基 ‒ 傳):** 「日主弱矣，財官強矣，不能不從；中有比劫暗生，從之不真。至於歲運財官得地，雖是假從，亦可取富貴，但其人不能免禍、或心術不端耳。」 [verbatim · 《滴天髓》原註·假從]

**任氏曰 (full block):** [verbatim · 《滴天髓闡微》·假從·任鐵樵]

> 「假從者，如人之根淺力薄，不能自立，局中雖有劫印、亦自顧不暇，而日主亦難依靠，只得投從於人也。其象不一，非專論財官而已也，與真從大同小異。四柱財官得時當令、日主虛弱無氣，雖有比劫印綬生扶，而柱中食神生財、財仍破印；或有官星制劫、則日主無從依靠，只得依財官之勢…然假從之象，只要行運安頓，假行真運，亦可取富貴。」

## 2.2 ตารางตัดสิน 真從 vs 假從 vs 不從

| Day Master root strength | 印 (resource) | 比劫 (companion) | 從神 (following element) | Verdict |
|---|---|---|---|---|
| **ไม่มีรากใดเลย** (no root at all) | ไม่มี | ไม่มี | 透干·得令·成局 | **真從** |
| **微根** (hair-root: 餘氣ใน墓庫 — เช่น 甲ใน 未/辰, 丙ใน 戌) | ไม่มี/แห้งมาก | ไม่มี/แห้งมาก | 透干·得令 | **假從** |
| **微根** | มี 1 ตัว 虛浮無根 (เช่นบน天干lateral) | — | 從神得令·成局 | **假從** (อาจ 變真 ผ่าน大運ที่合/沖去 印) |
| **微根** | — | มี 1 比劫 虛浮 (天干) | 從神得令·成局 | **假從** |
| **真根** (得祿·得刃·會局) | — | — | — | **不從** (ใช้ normal weak-chart logic) |
| **真根 + 印透干通根** | มี | — | — | **不從** เด็ดขาด |
| **無根 แต่ 印透干 + 通根** | 強印 | — | — | **不從** (印คือ "ม่านรอด" — Day master ฟื้นได้) |

⚠️ **Hair-root (微根) discrimination rules (เกณฑ์ตัดสิน "รากเส้นผม"):**
- 餘氣 (residual qi) เช่น 甲ใน 辰 (มี乙เป็นรากบาง) → นับเป็น微根
- 墓庫 (storage tomb) เช่น 甲ใน 未 (墓) → นับเป็น微根 *ถ้า* ไม่ถูก 沖/刑 เปิด
- 長生·帝旺·祿 → **ไม่ใช่** 微根 (เป็น 真根, disqualify 從)
- 三合·三會 ของ Day Master 五行 → **ไม่ใช่** 微根 (เป็น 真強)

ตามคำของ 任氏 (《假從》): 「局中雖有劫印、亦自顧不暇」 — แปลว่า 印·比劫 ที่虛浮ไม่มีราก หรือมีรากแต่ถูก剋/合/沖 ก็ยังนับเป็น假從ได้ ไม่ใช่ 不從

## 2.3 หลัก critical: 假從ฟลิป180°ตามปี (THE engine problem #1 root)

[verbatim · 《滴天髓·假從》任氏]: 「然假從之象，只要行運安頓，假行真運，亦可取富貴。」

**แปลความ engineering:** 假從 อ่านเป็น "從" ในปีปกติ → ใช้ 從神 ของแต่ละประเภท เป็น 用神
แต่ใน **印/比劫/祿刃 reviving years** Day Master ที่เคย"ตาย"กลับ"ฟื้น" → ต้องสลับ reading mode เป็น normal-weak chart → 用神กลายเป็นสิ่งที่ช่วยตัวเองตามปกติ

| Year type (流年/大運) | 假從 reading mode | 用神 ที่ engine ต้อง output |
|---|---|---|
| 從神 reinforcement (財/官/食傷/旺神 ตามประเภท從) | **從-mode** | ตาม 從神 |
| 印 (resource) year | **revival-mode** | ตามตรรกะ weak-chart (อาจกลับเป็น食傷泄秀) |
| 比劫·祿·羊刃 year | **revival-mode** | เช่นเดียวกัน — Day Master ฟื้น ใช้ normal logic |
| 沖去 Day Master root year | **從-mode** (เพราะรากบางที่เหลือถูกถอน → กลายเป็น 真從 ชั่วคราว) | ตาม 從神 |
| 合去 Day Master 比劫/印 ใน原局 | **從-mode** (เหมือนกัน — กุญแจฟื้นถูกบล็อก) | ตาม 從神 |
| 沖 從神 รากของมัน | revival หรือ chaos (flag warning) | 《滴天髓·順逆》 [paraphrase] |

## 2.4 Decision-tree (engine-ready)

```
INPUT: dayMasterRoot ∈ {none, hair, real}
       resource_print ∈ {absent, virtual-floating, rooted}
       companion_jieq ∈ {absent, virtual-floating, rooted}
       followedElement ∈ {weak, dominant, overwhelming}
       monthBranch_supports_followed ∈ {yes, no}

IF dayMasterRoot == real → return "不從" (normal logic)
IF resource_print == rooted → return "不從"
IF companion_jieq == rooted → return "不從"

IF dayMasterRoot == none
   AND resource_print == absent
   AND companion_jieq == absent
   AND followedElement == overwhelming
   AND monthBranch_supports_followed == yes
   → return "真從" (full strict)

ELSE IF dayMasterRoot ∈ {none, hair}
   AND (resource_print == virtual-floating OR companion_jieq == virtual-floating
        OR dayMasterRoot == hair)
   AND followedElement == dominant
   → return "假從"
        — flag: "reading-mode flips on 印/比劫/祿刃 years"

ELSE
   → return "不從"  (treat as normal weak chart)
```

[internal · do not show customers] Default thresholds: ถ้า engine คำนวณ Day Master "strength score" ≤ 8 (จาก 100) และ followed-element score ≥ 70 และไม่มี rooted 印/比劫 → 真從; ถ้า ≤ 15 และ followed ≥ 60 และมี virtual-floating 印 หรือ hair-root → 假從; อื่นๆ → 不從 *(เกณฑ์เป็น conservative default — สำนักเข้ม)*

## 2.5 ความขัดแย้งของสำนัก (Schools in conflict)

| สำนัก | จุดยืน 真從 conditions | จุดยืน 假從 |
|---|---|---|
| 任鐵樵 (《滴天髓闡微》, 增註稿1848) | เข้มมาก — 「絕無一毫生扶之意」 ต้องไม่มีร่องรอย 印/比劫 เลย | ยอมรับ "根淺力薄" + 印/比劫"自顧不暇"; รับ "hair-root + virtual印" |
| 徐樂吾 (《滴天髓徵義》, 《子平真詮評註》1936) | เข้มเช่นกัน แต่ผ่อนให้ "氣勢" เป็นตัวตัด — ถ้า氣勢ไปทางเดียวชัดเจน ก็เป็น從ได้ | กว้างกว่า — รับ "假化以假成真" ผ่าน 大運 |
| 沈孝瞻 (《子平真詮·論雜格》, 1776) | ระมัดระวังที่สุด — เตือนว่า 「飛天合祿之類，固為影響遙系而非格矣」 มี tendency ปฏิเสธ 從格 หากดูได้ด้วย格ปกติ | ไม่ค่อยใช้คำว่า "假從" โดยตรง |
| 萬民英 (《三命通會》, 1578) | กลาง — ระบุประเภท從แต่เน้น月令 |  |

**Recommended engine default:** เอียงไปทางสำนัก **任鐵樵 เข้ม** + ตรวจสอบด้วย **沈孝瞻's caution** — เพราะ over-declare 真從 ก่อให้เกิด engine error ที่แย่ที่สุด (สลับ direction ของ 用神 ไป 180° โดยผิด) ดังนั้น **bias toward 假從 มากกว่า 真從** และ **bias toward 不從 มากกว่า 假從** ในกรณีคลุมเครือ

---

# PART 3 — 合化 Transform/No-Transform Ruleset (engine problem #2)

## 3.1 ตารางพื้นฐาน 五合 (Five Stem Combinations)

| Combination | 化神 (transformation element) | 化神元神 (guide stem) | 化神月令 (required season-branch) |
|---|---|---|---|
| 甲己 合化 **土** | 戊 | 辰戌丑未 (土月) |
| 乙庚 合化 **金** | 庚 | 巳酉丑·申酉戌 (金月) |
| 丙辛 合化 **水** | 壬 | 亥子丑·申子辰 (水月) |
| 丁壬 合化 **木** | 甲 | 寅卯辰·亥卯未 (木月) |
| 戊癸 合化 **火** | 丙 | 巳午未·寅午戌 (火月) |

[verbatim · 《滴天髓》干支總論·任氏]: 「陽極則陰生，故丙辛化水；陰極則陽生，故戊癸化火。」
[verbatim · 《滴天髓》癸水]: 「合戊見火，化象斯真。」

## 3.2 เงื่อนไข 真化 (Genuine Transformation) — Sealed Conditions

จาก 《滴天髓·化象》原註 (劉基 ‒ 傳) [verbatim]:

> 「如甲日主生於四季，單遇一位己土，在月時上合遇壬、癸、甲、乙、戊，而有一辰字，乃為化得真。又如丙辛生於冬月，戊癸生於夏月，乙庚生於秋月，丁壬生於春月，獨自相合，又得龍以運之，此為真化矣。既化矣，又論化神。如甲己化土，土陰寒，要火氣昌旺；土太旺，又要取水為財，木為官，金為食神，隨其所向，論其喜忌，再見甲乙，亦不作爭合妒合論。蓋真化矣，如烈女不更二夫，歲運遇之皆閒神也。」

**Distilled 6 conditions ที่ทั้งหมดต้องครบ (engine checklist — ALL must hold):**

| # | เงื่อนไข | ตรวจอย่างไรในเครื่อง |
|---|---|---|
| (a) | **相鄰 (adjacency)**: หุ้น 2 ตัวต้องอยู่ติดกันบน天干 (日干↔月干 หรือ 日干↔時干) ไม่มีหุ้นอื่นคั่น | check positions [day, month] or [day, hour] |
| (b) | **月令支持化神 (得時)**: 月支ต้องเป็นฤดูของ化神 หรือเป็นสมาชิกของ 三合/三會局ของ化神 | check monthBranch ∈ {化神-season-branches} |
| (c) | **地支支持化神 (得地)**: ใน 地支 ต้องมี化神มากกว่า 1 จุด (มีรากแท้) — มัก require 辰 (龍) เป็น 化神元神 ตามที่ 《化象》ระบุ「得龍以運之」 | check count of 化神-element in branches ≥ 2; bonus if 辰 present |
| (d) | **ไม่มี爭合·妒合**: ไม่มีหุ้นที่สามแย่งคู่ (เช่น 兩己เจอ 甲, 兩甲เจอ 己) | check for duplicate stems |
| (e) | **化神ไม่ถูกขัดขวาง**: ธาตุที่ 剋 化神 ต้องไม่มีหรืออ่อนมาก (e.g. 甲己化土 — ห้ามมี 木 (กิ่ง 寅卯亥未) ลอยอย่างแข็งแรง) | check 剋化神 stems/branches absence/weakness |
| (f) | **化神元神 (guide)** ปรากฏ — เช่น 甲己化土ต้องมี 戊 透干 หรือ 辰 ในพื้น | check guide stem/branch presence |

ถ้าครบ 6 → **真化** (化氣格 — 化神กลายเป็นแกน 用神)
ถ้าครบเพียง (a)(b) แต่ขาด (c) หรือ (d) หรือ (e) → ดูว่าหุ้น "binding"ฝ่ายใดฝ่ายหนึ่งหรือไม่ — โดยปกติ → **合而不化** (combine but no transform)

## 3.3 假化 (False Transformation)

[verbatim · 《滴天髓·假化》原註]: 「日主孤弱而遇合神真，不能不化，但暗扶日主，合神又虛弱，及無龍以運之，則不真化。至於歲運扶起合神，制伏忌神，雖為假化，亦可取富貴，雖是異姓孤兒，可出類拔萃，但其人多執滯偏拗，作事迍邅，骨肉欠遂。」

**任氏曰 — 假化 7 ประเภทย่อย:** [verbatim · 《滴天髓闡微·假化》·任鐵樵]

1. 合神真而日主孤弱者
2. 化神有餘而日帶根苗者
3. 合神不真而日主無根者
4. 化神不足而日主無氣者
5. 既合化神而日主得劫印生扶者
6. 既合化而閒神來傷化氣者
7. 「故假化比真化尤難」

**กฎใช้งาน:** 假化 — engine ยังคงรายงาน 化氣格 ได้ แต่ต้อง flag "weak-transform; reading flips on 沖/克化神 years" และโดยพื้นฐานความน่าเชื่อถือ (confidence) ของ verdict ลดลง [internal · do not show customers] 30-40%

## 3.4 合而不化 (Combine-but-not-Transform) — กรณีพบบ่อยสุด

อ้างจาก《子平真詮·論十干合而不合》(沈孝瞻 原著, 乾隆四十一年/1776 題記) [verbatim]:

> 「十干化合之義，前篇既明之矣，然而亦有合而不合者，何也？蓋隔於有所間也，譬如人彼此相好，而有人從中間之，則交必不能成。譬如甲與己合，而甲己中間，以庚間隔之，則甲豈能越剋我之庚而合己？此制於勢然也，合而不敢合也，有若無也。」

> 「又有隔位太遠，如甲在年干，己在時上，心雖相契，地則相遠，如人天南地北，不能相合一般。然於有所制而不敢合者，亦稍有差，合而不能合也，半合也，其為禍福得十之二三而已。」

> 「然又有爭合妒合之說，何也？如兩辛合丙，兩丁合壬之類，一夫不娶二妻，一女不配二夫，所以有爭合妒合之說。然到底終有合意，但情不專耳。」

**5 sub-types ของ 合而不化:**

| Sub-type | จีน | เงื่อนไข | ผล |
|---|---|---|---|
| 隔位 (separated) | 「隔於有所間」 | มีหุ้นคั่นกลาง (เช่น 甲-庚-己) | ไม่合เลย "有若無也" |
| 遠隔 (too distant) | 「年干↔時干」 | คู่อยู่ตรงข้ามคนละด้านสุดของ 4 pillars | "半合" — ผล福禍อ่อน [internal · ตัวเลข %ห้ามพูดกับลูกค้า แปลว่า "ส่งผลเบา"] |
| 爭合·妒合 (jealousy/contention) | 「兩辛合丙」 | หุ้นที่สามแย่งคู่ | 「到底終有合意，但情不專耳」 — combine แต่ขาดความบริสุทธิ์ ไม่ถึง 真化 |
| 本身之合 (self-combination, day master combines own官/財) | 「五陽逢財，五陰遇官」 | Day Master เป็นฝ่ายผูก官/財ของตัวเอง | 「不為合去」 — ผูกแต่ไม่หาย, ใช้ตามปกติ |
| 合而不化 (general) | "combine but no transform" — เงื่อนไข (b)/(c)/(e)/(f) ขาด | หุ้นเข้าหากันแต่ไม่กลายเป็น化神 | หุ้นทั้งสองตัว **บางส่วน 羈絆 (binding)** — ลดบทบาทเดิม แต่ไม่กลายเป็น化神 |

**กฎใช้งานสำคัญ:** ใน 合而不化 — หุ้นทั้งสองตัว "ไม่หายไป" แต่ "ทำงานครึ่งเดียว" (羈絆 binding) — เครื่องต้อง:
- คงคำนวณหุ้น原本ของทั้งสองตัวไว้
- ลด weight ของแต่ละตัวลง [internal · do not show customers] ≈ 40-60%
- **ห้าม** เพิ่มหุ้นชนิด化神เข้าไปในการคำนวณ
- หุ้น原本 ยังคงทำหน้าที่ 剋/生 อยู่ แต่อ่อนลง

## 3.5 กรณีเฉพาะ 甲己 (THE engine error-guard — engine problem #2)

**สถานการณ์ตัวอย่าง:** 年干 甲 + 日干 己 (รากบาง) — engine flag 「甲己合 → transformed = 土」

### Step-by-step error guard checklist (engine ต้อง pass ทุกข้อ ก่อน auto-declare 真化):

```
真化 = ALL of:
  ✓ adjacency:           甲 ติด 己 (no stem between them on 天干 row)
  ✓ month-branch:        月支 ∈ {辰, 戌, 丑, 未}  (土月)
  ✓ ground-roots:        count(土 in 地支) ≥ 2 (รวม 餘氣ของ 辰/未 ใน 戊·己)
  ✓ guide stem:          有 戊 透干 OR 辰 ในกิ่ง  (得龍以運之)
  ✓ no-contention:       ไม่มี 兩甲 หรือ 兩己 (no jealousy)
  ✓ no-killer:           ไม่มี木 (寅卯亥未-with-木-透干) ที่剋土; or have but 木 ถูก合/制
  ✓ day-master rootless: 己 root_count == 0  (ไม่มี 巳午未戌丑ที่ทำหน้าที่ราก)
  ✓ no other 印/比劫 rescue: 4-pillars ไม่มี 火 (印) ที่rooted หรือ 土 (比劫)ที่ rooted-elsewhere

If ANY fails → NOT 真化.
  If only (rootless OR no-killer) fails → declare 假化, flag confidence -40%
  If adjacency OR month-branch fails → declare 合而不化, set both 甲 and 己 weight × 0.5
  Default → declare 合而不化 (the conservative path)
```

**Critical engine rule (NEVER auto-transform):**

> ถ้า 甲己合 + Day Master 己 มีรากบาง (e.g. 未 ใน 地支) แต่ **ไม่มี** 月支 = 土月 → engine **ต้อง** ระบุเป็น **合而不化** ไม่ใช่ 真化
>
> เหตุผลคลาสสิก: ไม่ผ่านเงื่อนไข (b) ของ《化象》「生於四季」 — 「四季」 = 辰戌丑未月 เท่านั้น

[verbatim · 《滴天髓·假化》任氏บรรยายตัวอย่าง]:

> 「甲木生於仲冬，印綬當權，本是殺印相生，無如坐下絕地，虛極不受水生，見己土貪合，合神雖真而失令，必賴丙火之生，解其寒凝之氣。嫌其旺水秉令，則火亦虛脫，不能生扶，化神假而不清。」

แสดงว่า 甲己ในเดือน子 (仲冬) — แม้合แต่ "合神雖真而失令" — เพราะ月令ไม่ใช่土月 → 假化

## 3.6 ปฏิสัมพันธ์ระหว่าง 合化 กับ 從格

**ปัญหา:** ถ้าเครื่องประเมินว่าเป็น 假從財格 (己日, รากบาง, 財旺) แล้วเจอ 甲己合 ที่ engine declare 「化土」 — การเพิ่ม 土 (比劫) เข้าไป **จะทำลาย從財格 หรือไม่?**

**คำตอบคลาสสิก (จากตรรกะรวม 《滴天髓》·從象·假從·化象):**

| สถานการณ์ | ผลกระทบต่อ 從 |
|---|---|
| **真化เกิด** (甲己 化土ครบเงื่อนไข) | 從財格 **แตก** — เพราะ化神 = 土 = 比劫 ของ 己 = revive Day Master → กลายเป็น 化氣格 หรือ 不從 |
| **假化เกิด** (化ครบเงื่อนไขเกือบครบ) | 從財 ปะปน 化 — ภาวะคลุมเครือ; engine ควร flag conflict และเอียงไป "不從 + 化氣格 weak" |
| **合而不化เกิด** (ไม่ครบเงื่อนไข) | 甲 ผูก 己 — 己 ของตัวเองถูก "บล็อก" → **เสริม從財** ไม่ใช่ทำลาย; 比劫 ของ 己 (己ตัวเอง) ถูก 甲 ลดบทบาท → assertion ของตัวเองอ่อนลงไปอีก → 從財 **แข็งขึ้น** |

**Threshold rule สำหรับ "bounce-back breaks following":**

[internal · do not show customers]
- ถ้าตัวเสริมตัวเอง (印/比劫) ผ่าน 合化 หรือ 流年 = **rooted** (ไม่ใช่ virtual-floating) AND มี ≥ 2 จุด → **break the 從** → switch to normal-weak reading
- ถ้า virtual-floating หรือมีเพียง 1 จุด → **flip reading-mode ชั่วคราวในปี/運นั้น** เท่านั้น → 從格ยังคงอยู่ในระดับ原局

---

# PART 4 — Engine Integration (Decision Rules + Conflict Resolution)

## 4.1 แก้ engine problem #1 — 用神 candidates ขัดแย้ง 180°

**สถานการณ์:** chart อ่านได้สองทาง — (A) reading-1: 用神 = 丙·乙·丁 (火·木); (B) reading-2: 假從財格 → 用神 = 水·金

### กฎตัดสิน WHICH governs by year-type:

```
function resolveYongShenConflict(chart, year):
   classify chart → fromStatus ∈ {真從, 假從, 不從}

   IF fromStatus == 真從:
      return reading_A = "從-mode permanent"
      用神 = 從神 ตลอด (ไม่ขึ้นกับปี)
      Note: 「歲運遇之皆閒神也」 — 任氏

   IF fromStatus == 不從:
      return reading_B = "normal weak/strong logic"
      ใช้ 扶抑/病藥/調候/通關 standard

   IF fromStatus == 假從:
      year_kind = classifyYear(year, chart)
      IF year_kind ∈ {從神-reinforce, 沖去-rootbase, 合去-rescue-stems}:
          mode = "從-mode this year"
          用神 = 從神
      ELIF year_kind ∈ {印-rooted, 比劫-rooted, 祿/羊刃 to-day-master}:
          mode = "revival-mode this year"
          用神 = normal-weak logic (อาจกลับเป็น食傷泄秀 หรือ財官)
      ELSE:
          mode = "neutral — show both candidates, flag conflict"
```

**ตารางสรุป year-type → reading-mode mapping:**

| Year/運 type | 假從 reading | คลาสสิก ref |
|---|---|---|
| 從神 รูปแบบเดียวกับ原局 (e.g. 從財財運) | 從-mode | 《假從》任氏: 「假行真運，亦可取富貴」 |
| 印 (ไม่ถูก剋) | revival | 《假從》原註: 「中有比劫暗生，從之不真」 |
| 比劫·祿·羊刃 | revival | เช่นเดียวกัน |
| 沖去 Day Master root branch | 從-mode (รากที่เคยมีถูกถอน) | 《滴天髓·歲運》 [paraphrase] |
| 合去 印/比劫ใน原局 | 從-mode (กุญแจ rescue ถูกบล็อก) | 《子平真詮·論十干合而不合》 [paraphrase] |
| 沖 從神 รากของมัน | revival หรือ chaos (flag warning) | 《滴天髓·順逆》 [paraphrase] |

## 4.2 แก้ engine problem #2 — 甲己 error-guard (full operational form)

```python
def declare_jiajih_transform(stem_year, stem_day, branches, all_stems):
    # stem_day == 己, stem_year_or_hour candidate == 甲
    
    pair_position = check_adjacency('甲','己', positions)
    if not pair_position['adjacent']:
        return ('合而不化-distant', binding=0.3)
    
    month_branch = branches['month']
    if month_branch not in ['辰','戌','丑','未']:
        return ('合而不化-no-season', binding=0.5)
    
    earth_branch_count = count_earth_in_branches(branches)
    if earth_branch_count < 2:
        return ('合而不化-no-ground', binding=0.5)
    
    has_guide = ('戊' in all_stems) or ('辰' in branches)
    if not has_guide:
        return ('合而不化-no-guide', binding=0.5)
    
    competing = count_stem(all_stems,'甲')>1 or count_stem(all_stems,'己')>1
    if competing:
        return ('假化-contention', confidence=0.4)
    
    wood_killer = strong_wood_present(branches, all_stems)
    if wood_killer:
        return ('假化-killer-present', confidence=0.4)
    
    dm_root = count_earth_root_for_己(branches)
    if dm_root >= 2:
        return ('合而不化-day-master-rooted', binding=0.7)
    
    rescue_stars = check_rooted_fire_or_earth_elsewhere(chart)
    if rescue_stars:
        return ('假化-rescue-present', confidence=0.5)
    
    return ('真化-土', confidence=0.95)
```

**Default fallback rule (NEVER auto-transform without all-pass):**
> ถ้า function ไม่ return '真化-土' → engine ระบุเป็น 合而不化 และ
> - น้ำหนัก 甲 บน 天干 × 0.5
> - น้ำหนัก 己 (Day Master) ไม่ลด (เพราะ self-bind ไม่หายไป)
> - **ห้าม** เพิ่ม virtual 土 (比劫) เข้าใน strength calculation

นี่คือ **error-guard หลัก** ที่ป้องกัน 「engine ประกาศ甲己transformed ผิด → ใส่ 比劫 ให้己 → flip จาก真從 ไป假從 ทุกอ่าน」

## 4.3 แก้ engine problem #3 framework — 冲 + 反吟 ทับทั้ง 用神 และ 忌神

**บริบทคลาสสิก:** 子午沖 ที่ทับทั้งกิ่งที่ใส่用神และ忌神; เพิ่ม 反吟 (天克地沖 — เช่น 甲子↔庚午) — ทิศทางสุทธิคืออะไร?

### Priority ranking สำหรับ 沖 (จากเข้มสุดไปอ่อนสุด):

| Rank | กฎ | คลาสสิกหรือเหตุผล |
|---|---|---|
| 1 | **緊貼 (adjacent)** > 遙隔 (distant) | 《滴天髓·隱顯·眾寡》 [paraphrase]: "เครื่องที่อยู่ใกล้ Day Master กระทำก่อน" |
| 2 | **月令 weight** สูงสุด — สิ่งใน月支ทรงน้ำหนักมากสุด | 《子平真詮·論用神》 [verbatim]: 「八字用神，專求月令」 |
| 3 | **日支** (婚姻宮 + closest to self) ลำดับสอง | 《滴天髓·生時》 [paraphrase] |
| 4 | **時支** มีอิทธิพลต่อ晚運 + 子女 | 《滴天髓·生時》 [paraphrase] |
| 5 | **年支** ส่วนใหญ่อิทธิพลต่อช่วงต้นชีวิต/บรรพชน + 太歲 | 《三命通會·論太歲》 [paraphrase] |
| 6 | **沖ที่ตัดออก忌神** = net positive; 沖ที่ตัดออก喜神/用神 = net negative | 《滴天髓·隱顯》 [verbatim]: 「吉神太露，起爭奪之風；凶物深藏，成養虎之患。」 |
| 7 | **反吟 (天克地冲)** หนักกว่า 沖 ธรรมดา — ทั้ง 天 และ 地 รับผลกระทบ | 《三命通會·看命口訣》 [verbatim]: 「岁運壓日，謂之伏吟…若歲運與日相對，謂之返吟。二者不利六親，非橫破財，不為吉兆。」 |
| 8 | ต้องพิจารณา **大運 context** — 大運เป็น "ฤดูกาล" — ใหญ่กว่าปี | 《滴天髓·歲運》 [paraphrase]: 「太歲為一年之主，大運管十年之事」 |

### Decision algorithm:

```
function rank_chong_net_direction(chong_pair, chart):
    branch_useful, branch_taboo = chong_pair
    score = 0
    
    # Rule 6: which is being removed?
    if branch_taboo.role == "忌神":
        score += 30   # net positive: 沖去忌神
    if branch_useful.role == "用神":
        score -= 30   # net negative: 沖去用神
    
    # Rule 1-5: position weighting
    weight_map = {month:1.0, day:0.8, hour:0.6, year:0.5}
    score += weight_map[branch_useful.position] * (-15)
    score += weight_map[branch_taboo.position] * (+15)
    
    # Rule 7: 反吟 amplifier
    if is_fanyin(chong_pair):
        score *= 1.5
    
    # Rule 8: 大運 context
    if luck_pillar_supports_useful(chart, branch_useful):
        score += 10
    if luck_pillar_supports_taboo(chart, branch_taboo):
        score -= 10
    
    if abs(score) < 10:
        return "FLAG_UNDECIDED — requires 大運+流年 detail"
    return "NET_GOOD" if score > 0 else "NET_BAD"
```

**สำคัญ:** ทิศทางสุทธิของ 沖+反吟 มักต้องการ context ของ 大運 — engine **ต้อง** state dependency นี้ชัดเจน ห้ามตัดสินใจคนเดียวโดยไม่ใส่ 大運

[verbatim · 《滴天髓·歲運》原註]: 「太歲為一年之主，大運管十年之事，要看其有無喜忌而斷。」

## 4.4 Confidence reporting matrix

| Verdict | base confidence | conditions to lower |
|---|---|---|
| 真從 (full strict) | 0.90 | ถ้า微根 present → 0.70 |
| 假從 | 0.65 | ถ้า rooted-rescue present → 0.45 (consider 不從) |
| 不從 (normal) | 0.85 | — |
| 真化 (all 6+ conditions) | 0.90 | ถ้า ขาด 1 → 假化 0.55 |
| 假化 | 0.55 | — |
| 合而不化 | 0.75 (เป็น default fallback ที่ปลอดภัยที่สุด) | — |
| 沖+反吟 ตัดสินทิศ | variable | < 0.50 → flag undecided |

[internal · do not show customers] Confidence numbers เป็น engine-internal; ห้ามแสดงให้ลูกค้า (NO_PERCENT rule)

---

# PART 5 — Test Fixtures (Worked Examples)

## Fixture A — 真從財格 (clean rootless wealth-follow)

```
Year:  乙卯
Month: 己卯       ← Wealth dominant
Day:   己卯       ← Day master = 己 (Earth), no root anywhere (卯卯卯 all Wood)
Hour:  乙亥       ← Wealth, Wood
```

**Analysis:**
- 己 ใน 卯卯卯亥 → no Earth root anywhere, no 火印
- 木 (財星 — Wealth) ทรงพลังเต็มท้องฟ้าและพื้น
- ไม่มี 比劫 ไม่มี 印 ไม่มี 食傷

**Expected verdict:** 真從財格
**Rule fired:** Part 2 decision tree path → `dayMasterRoot=none, resource=absent, companion=absent, followed=overwhelming, monthBranch_supports=yes → 真從`
**用神:** 木 (財); 喜運 食傷·財·官殺; 忌運 印·比劫

## Fixture B — 假從財 (with hair-root or buried resource)

```
Year:  乙卯
Month: 己卯
Day:   己未       ← Day master = 己, มี 未 ใต้ตัว = หางๆของ 土 (微根) + 丁火藏ใน未
Hour:  乙丑       ← 丑 = 土ราก อ่อน
```

**Analysis:**
- 己 มีรากบางใน 未 (有丁ทำหน้าที่ virtual印藏支) และ 丑 (微根)
- ยังไม่ถึงระดับ "真根"
- 木 (財) ยังคงท่วมท้น

**Expected verdict:** 假從財
**Rule fired:** Part 2 path → `dayMasterRoot=hair, hidden-resource-present, followed=dominant → 假從`
**Year-flip notes:**
- ปี 印 (เช่น 丁/午/巳) ⇒ revival mode → 用神 = 食傷泄秀 (金)
- ปี 比劫 rooted (เช่น 戊辰·己丑) ⇒ revival mode → 用神 = 官殺
- ปี 財 (เช่น 甲乙寅卯) ⇒ 從-mode → 用神 = 財

[internal · do not show customers] ผลกระทบที่ถูกบันทึก: ปี 丙 + วาด 巳/午 ปลุก 未-ภายในของ丁 → real flip 180°

## Fixture C — 真化 (genuine 甲己→土 transformation)

```
Year:  戊辰
Month: 己未           ← 己月 + 未 = 土月
Day:   甲戌           ← Day = 甲, รากไม้ไม่มี (戌=火庫+辛丁戊)
Hour:  己巳           ← 己時 ติด甲日
```

**6-condition check:**
- (a) 甲日 ↔ 己時 ✓ (時干 adjacent ต่อ Day)
- (b) 月支 未 ∈ {辰戌丑未} ✓
- (c) 土count in branches: 辰·未·戌·巳(藏戊) = ≥ 2 ✓
- (d) 兩己 (月+時) + 甲 — ตามคลาสสิก 真化เกิดขึ้นแล้ว 再見甲乙亦不作爭合妒合論 [verbatim · 《化象》原註] → ✓
- (e) no Wood killer: ตรวจ 寅卯亥 → ไม่มี ✓
- (f) guide: 戊 透干 (year) ✓
- (g) day master rootless: 甲 มี寅?? ไม่ → ✓

**Expected verdict:** 真化 — 化土 → 化氣格 (稼穡-like reading) — Day Master 甲 กลายเป็น 土
**Rule fired:** Part 3.2 — all 6 conditions pass
**用神 mode:** 化神 (土) — engine ใช้ logic ของ 稼穡格 (從強格-ish): 喜火生土·土自身·金泄; 忌 木 (一字還原)

## Fixture D — 合而不化 (combine but no transform — the COMMON case)

```
Year:  甲子
Month: 丙子           ← 月支 子 = 水月 (NOT 土月)
Day:   己酉           ← Day master = 己 (Earth)
Hour:  乙亥           ← Hour 乙 (Wood), อีกตัวที่บุก
```

**Analysis (engine error-guard ตามต้องการ):**
- 年干 甲 ↔ 日干 己 — adjacent? 月干 丙 คั่นกลาง! → **(a) fail (隔位)**
- month-branch: 子 (水) ∉ {辰戌丑未} → **(b) fail (no season)**
- 己 มีรากบางใน地? 酉 = 金, 子 = 水, 亥 = 水 → no Earth root anywhere

**Engine MUST output:** 合而不化 — 甲己ผูกกันแต่ไม่ transform → 土
- 甲ถูกผูกโดย己 → 甲 weight × 0.5
- 己ถูกผูกโดย甲 → 己 weight maintained (self-bind, 「不為合去」 ตาม 沈氏)
- **NO virtual 土 added**

**Then chart character:** 己 + ไม่มีราก + 水 (財) ท่วม + 乙 (七殺) ลอย → ลึกๆ คือ 假從財/從勢 (พิจารณาเพิ่ม) — เครื่องคงไม่ "transform" และต้องไปรอบ 從格-classifier ปกติ

**Rule fired:** Part 3.5 甲己 checklist failed → conservative path = 合而不化

**Expected verdict:** NOT transformed; 甲 binds 己 (และในกรณีนี้ chart น่าจะเป็น 假從財 หรือ 從勢 หลังจาก 合-binding ลด weight)

[internal · do not show customers] นี่คือ fixture ที่จับ engine bug ตรงๆ: ห้ามเครื่องประกาศ甲己transformed ในกรณีนี้

---

## ภาคผนวก A: ลำดับสำคัญของการเรียกใช้ในเครื่อง

```
PHASE 1 — Pre-screen
  1. คำนวณ Day Master strength (จาก existing engine)
  2. คำนวณ each element strength
  3. ระบุ 合 pairs ทั้งหมด (天干 5-合)

PHASE 2 — Resolve 合化 (Part 3)
  For each 合 pair:
     run 6-condition checklist → {真化, 假化, 合而不化}
     update stem weights accordingly
     IF 真化 → add 化神 element
     ELSE → DO NOT add 化神 element (CRITICAL)

PHASE 3 — Classify 從 (Part 2)
  IF Day Master strength ≤ threshold AND no rooted rescue:
     run 從-decision-tree → {真從X格, 假從X格, 不從}

PHASE 4 — Yong Shen (用神) determination
  IF 真從: 用神 = 從神 (permanent)
  IF 假從: 用神 = 從神 BY DEFAULT, but flag flip on revival-years
  IF 真化: 用神 = 化神 logic (treat as 化氣格)
  ELSE: standard 扶抑/病藥/調候/通關

PHASE 5 — Year analysis
  Apply Part 4.1 year-type mapping
  Apply Part 4.3 沖+反吟 priority ranking
```

## ภาคผนวก B: หลักนามฐานเอกสาร (Bibliographic key)

| ที่อ้าง | ย่อ | ฉบับที่ใช้ |
|---|---|---|
| 《滴天髓闡微》 | DTS-CW | 任鐵樵 增註 (原稿成書於道光二十八年/1848); 孫衡甫 民國八年/1919 付印刊行; ตรวจกับ 徐樂吾《滴天髓徵義》 |
| 《滴天髓》原文/原註 | DTS | 京圖 撰 (傳), 劉基 註 (傳) |
| 《子平真詮》 | ZPZQ | 沈孝瞻 原著 — 最早題記 乾隆四十一年/1776 丙申, 胡焜倬空甫識 |
| 《子平真詮評註》 | ZPZQ-PZ | 徐樂吾 評註, 民國二十五年二月/1936, 「東海樂吾氏識於海上寓次」 |
| 《三命通會》 | SMTH | 萬民英 撰, 明萬曆六年刊本/1578 (亦見《四庫全書》本與清雍正十三年/1735 蔣國祥補刊本) |

[verbatim] = ลอกข้อความตรง
[paraphrase] = สรุปความ
[internal · do not show customers] = สำหรับ engine ภายในเท่านั้น; ห้ามแสดงให้ลูกค้า; NO_PERCENT rule applies