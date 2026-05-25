# Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study)

## TL;DR
- The five domains can be encoded as deterministic lookup tables (神煞 calculations) plus conditional rules over the 8 standard structures (正格), the Day Master strength axis, and 十神 relationships — the report below gives complete tables and trigger conditions for each domain, citing 《三命通會》, 《滴天髓》, 《子平真詮》, 《淵海子平》 where the rule originates.
- Where classical sources disagree (especially the 陰干羊刃 question and 雜氣月令 取格), I flag the variant and recommend the orthodox 子平 line (五陽有刃，五陰無刃 / 帝旺取刃 in 陰干 variant) so the engine is internally consistent.
- Several 神煞 frequently used by modern apps (紅鸞, 天喜, 紅艷, 孤辰寡宿) are 星命/五星術 imports, not orthodox 子平; encode them as **secondary modifiers** with reduced weight, not as primary triggers.

## Key Findings

1. **羊刃 (Yang Blade)** is encodeable as a one-to-one Day-Master→Branch table; the classical "yang stems only" version (《子平真詮》) and the variant "all ten stems" version of the modern 日主平衡用神派/旺衰派 (whose founding developers were 韋千里 Wei Qianli and 徐樂吾 Xu Lewu) must both be supported, controlled by a config flag.
2. **桃花 (Peach Blossom)** is the 三合局 沐浴 position and is computed from 年支 OR 日支 (申子辰→酉, 寅午戌→卯, 巳酉丑→午, 亥卯未→子) — confirmed by 《淵海子平》.
3. **文昌 (Wenchang)** = 食神之臨官; the day-stem→branch table (甲→巳, 乙→午, 丙/戊→申, 丁/己→酉, 庚→亥, 辛→子, 壬→寅, 癸→卯) is unambiguous in 《三命通會》.
4. **8 正格** are derived strictly from 月令 hidden stems 透干 + 日干 relation per 《子平真詮》— concrete decision tree provided.
5. **財庫 / 墓庫** is determined per Day Master's 財 五行: 辰=水庫, 戌=火庫, 丑=金庫, 未=木庫; the 沖開 mechanism via 大運/流年 the opposite earth branch is canonical in 《滴天髓》.
6. **食傷生財** requires 身強 + 食傷有根 + 財星有根 + 無印剋食傷; this is the wealth-producing pattern of 《子平真詮》論財格.
7. **官杀混杂** as marriage-disturbance trigger is conditional on 身弱 + 無印化 + 干透 (per 《子平真詮》).
8. **五行→TCM 臟腑** mapping is fixed by 《黃帝內經·素問·金匱真言論》; imbalance (太過/不及/受剋) maps to organ disease per the same source.

---

## DOMAIN 11 — HEALTH (สุขภาพ)

### 11.a Five Elements → TCM Organ Mapping (五行→五臟六腑)

Fixed lookup, sourced from 《黃帝內經·素問》 and uniformly applied in 命理 health analysis:

| 五行 | 臟 (Yin organ) | 腑 (Yang organ) | 五官 (sense) | 五體 (tissue) | 五液 |
|---|---|---|---|---|---|
| 木 | 肝 (liver) | 膽 (gallbladder) | 目 (eyes) | 筋 (sinews/tendons) | 淚 |
| 火 | 心 (heart) | 小腸 (small intestine) | 舌 (tongue) | 脈 (vessels/blood vessels) | 汗 |
| 土 | 脾 (spleen) | 胃 (stomach) | 口 (mouth) | 肉 (flesh/muscles) | 涎 |
| 金 | 肺 (lung) | 大腸 (large intestine) | 鼻 (nose) | 皮毛 (skin/hair) | 涕 |
| 水 | 腎 (kidney) | 膀胱 (bladder) | 耳 (ears) | 骨 (bones), 髓 | 唾 |

JSON-encode as a hard-coded constant; never reconfigure.

### 11.b Element Imbalance → Disease Risk Rules

Trigger logic per element (apply each independently then aggregate risk score):

**Wood (木) — Liver / Gallbladder / Eyes / Tendons**
- 太過 trigger: ≥3 wood-bearing stems/branches (甲/乙/寅/卯) AND (no metal 庚/辛/申/酉 OR metal weaker than wood by ratio>2) → risk: 肝陽上亢, 頭痛, 中風, 高血壓, 怒氣傷肝.
- 不及/缺 trigger: 0 wood elements in chart, OR wood-element is被金多重剋 (≥2 metal stems/branches剋 1 wood) → risk: 肝血不足, 視力下降, 筋骨無力, 易疲倦.
- 受剋過度 trigger: 金克木 ratio ≥2:1 → risk: 肝膽手術、眼疾、神經系統病、頭部外傷.

**Fire (火) — Heart / Small Intestine / Tongue / Vessels**
- 太過: ≥3 fire elements (丙/丁/巳/午) AND no water control → risk: 心火亢盛, 失眠, 心律不齊, 高血壓, 三高, 口舌生瘡.
- 不及/缺: 0 fire AND (水多 ≥3 or generally cold chart 寒局) → risk: 心陽不足, 心悸氣短, 貧血, 心血管循環差, 手腳冰冷.
- 受剋: 水多冲火 (e.g., 子午冲 with 子強午弱) → risk: 心臟疾患, 眼疾 (火主目光), 出血性疾病.

**Earth (土) — Spleen / Stomach / Mouth / Flesh**
- 太過: ≥3 earth (戊/己/辰/戌/丑/未) AND 木 weak (≤1 and無根) → risk: 脾胃壅滯, 痰濕, 肥胖, 糖尿病, 皮膚病.
- 不及/缺: 0 earth OR 土被木重剋 → risk: 脾胃虛弱, 消化不良, 食欲減退, 腹瀉, 黄疸, 肌肉萎縮.
- 木旺克土 trigger: ≥2 wood actively剋 1 earth → risk: 胃痛, 消化道潰瘍, 脾胃下垂.

**Metal (金) — Lung / Large Intestine / Nose / Skin**
- 太過: ≥3 metal AND 火 weak (≤1) → risk: 肺氣壅塞, 大腸燥結, 皮膚乾燥, 骨節疼痛 (note: 《五行精紀》 lists "金太弱或死絕，應多注意氣虛、咳嗽、皮膚乾燥、骨節疼痛、大腸泄痢便血，並常有呼吸不暢").
- 不及/缺: 0 metal OR 火多剋金 → risk: 肺虛, 哮喘, 支氣管炎, 易感冒, 皮膚過敏.
- 火多克金 (≥2火 vs ≤1金): "金弱遇火旺，血疾無疑" — 呼吸系統疾病, 喉嚨炎症, 鼻部疾病.
- 水多金沉: "金弱遇水旺，水多金沉，易患肺炎、支氣管炎或哮喘".

**Water (水) — Kidney / Bladder / Ears / Bones**
- 太過: ≥3 water AND 土 weak → risk: 腎陽虛 (水寒體質), 水腫, 婦科病, 泌尿系統感染, 風寒體質.
- 不及/缺: 0 water OR 火土多耗 → risk: 腎精虧虛, 腰膝酸軟, 耳鳴, 牙齒鬆動, 男子陽萎遺精, 女子月經不調.
- 火多熏蒸癸水: "癸水落庫又逢旺火長期熏蒸，必患肾虚亏或肾水不足之症" — 糖尿病, 不孕.
- 冬令水凍無火: "生于冬天，水气冻结，四注不见木来通水，不见火来融化冻冰" → 陽萎早泄.

### 11.c 羊刃 (Yang Blade) — Calculation & Health Implications

**Orthodox 子平 table (《子平真詮》, 《淵海子平》: "五陽有刃，五陰無刃"):**

| 日干 | 羊刃 (地支) |
|---|---|
| 甲 | 卯 |
| 丙 | 午 |
| 戊 | 午 |
| 庚 | 酉 |
| 壬 | 子 |
| 乙/丁/己/辛/癸 | — (no 陽刃) |

**Variant for 陰干 — choose ONE of two schools (configurable):**
- *Variant A — 帝旺派* (recommended for 旺衰 engines, per 徐樂吾 commentary on 《子平真詮》): 乙→寅, 丁/己→巳, 辛→申, 癸→亥 (i.e., 陰干帝旺).
- *Variant B — 盲派/禄前一辰*: 乙→辰, 丁/己→未, 辛→戌, 癸→丑.

**Trigger logic:**
1. Calculate from **日干** against all four 地支 (年/月/日/時); flag each hit.
2. 羊刃在月支 = 月刃格 (格局-level, see Domain 12).
3. 羊刃在日支 = 日刃 (限丙午/戊午/壬子; 主男妨妻、女妨夫).
4. 羊刃在時支 = 真刃 (per《喜忌篇》: "獨陽刃以時言，重於年月日也"; 主傷妻破財).
5. 飛刃 = 沖羊刃之支 (e.g., 甲日: 卯=刃, 酉=飛刃).
6. **Health implications**: "羊刃與驛馬同柱，易發生天災橫禍、血光之災、多驚多險、交通意外事故"; "羊刃重重三四，必防盲聾之疾"; "羊刃逢冲倒戈，主大難臨頭".

### 11.d 血光 (Blood/Injury) — Determination

**血刃 table (《三命通會》, 以日干查地支)** — note this is closely related to but distinct from 羊刃:

| 日干 | 血刃支 |
|---|---|
| 甲 | 戌 (variant: 卯; sources differ) |
| 乙 | 酉 (variant: 辰) |
| 丙 | 子 (variant: 午) |
| 丁 | 亥 (variant: 未) |
| 戊 | 卯 (variant: 午) |
| 己 | 寅 (variant: 未) |
| 庚 | 巳 (variant: 酉) |
| 辛 | 辰 (variant: 戌) |
| 壬 | 未 (variant: 子) |
| 癸 | 丑 |

Modern apps overwhelmingly conflate 血刃 with 羊刃 (using the 羊刃 table for both). For hourkey.io, recommend: use 羊刃 as primary 血光 trigger, and add 血刃-specific table as secondary modifier.

**血光 trigger composite (all conditions are sufficient, score additive):**
1. 羊刃 present + 沖 (大運 or 流年 brings 飛刃) → high probability blood injury that year.
2. 七殺 無制 + 羊刃 in 局 → "羊刃七殺夺财化鬼" — accidents, surgery.
3. 日支 or 時支 有 刑/冲/破/害 of 羊刃 → physical injury.
4. 八字身強 + 羊刃 + 驛馬 同柱 → traffic accident risk (per《滴天髓》imagery).
5. 八字身弱 + 羊刃 → 病灾开刀见血光 (illness-driven surgery).
6. 流霞 (甲日酉、乙日戌、丙日未、丁日申、戊日巳、己日午、庚日辰、辛日卯、壬日亥、癸日寅) — "貴人壽終遭非命; 女犯流霞產後死，男犯血光被傷刀".
7. 命局 ≥2 血光-class 神煞 (羊刃, 血刃, 流霞, 飛刃) → flag as 血光-prone constitution.

---

## DOMAIN 12 — CAREER (อาชีพ)

### 12.a 用神 五行 → Industry Mapping

Encode as: derive 喜用神 五行 from chart; map to industry families. Source: standard 子平 commentary (徐樂吾《子平真詮評註》 + modern career-application tradition).

**喜用木 / 寅木 / 卯木:**
- 教育、教育用品、出版業、文化文教、文藝、書店
- 木材業、家具、室內設計、紙業、林業、園藝、花卉、盆栽、竹材
- 紡織、服飾、布業、窗簾
- 醫療 (草藥/中醫)、藥師、醫護
- 宗教、宗教用品、公務、訓練機構
- 蔬果、茶葉、食品加工 (植物性)

**喜用火 / 巳火 / 午火:**
- 餐飲、烹飪、火鍋、烤肉、咖啡
- 能源、石油、瓦斯、加油站、煤炭
- 電器、電子、電機、光電、照明、燈具
- 美容、美髮、化妝品、理容
- 演藝、歌舞、戲劇、新聞媒體、大眾傳播、KTV
- 服裝服飾、衣帽、製造業、機械、加工
- 軍人、運動員、太陽能、陶瓷、窯業、攝影

**喜用土 / 辰戌丑未土:**
- 房地產、地產仲介、土地買賣、營造、建築、水泥
- 農業、畜牧、農產品、土特產
- 礦業、石材、砂石
- 仲介、保險、典當、古董、殯儀
- 銀行、信託、會計 (土生金)
- 顧問、律師、設計 (穩定型)

**喜用金 / 申金 / 酉金:**
- 金融、銀行、證券、保險、財政、會計
- 五金、機械、金屬加工、交通工具製造
- 法律、司法、律師、警察、軍人 (執法類)
- 珠寶、鐘錶、精密儀器
- 牙醫、外科醫師 (手術用器械屬金)
- 雕刻、模具、汽車修理

**喜用水 / 亥水 / 子水:**
- 旅遊、運輸、物流、航海、漁業、水產
- 貿易、外交、外貿、人力中介
- 飲料、酒類、咖啡、清涼飲品、純淨水、冷凍冷藏
- 服務業、酒店、餐旅、洗衣、浴池、游泳池
- 媒體、互聯網、傳媒、記者、偵探、播音
- 醫藥、占卜、命理、玄學、五術
- 化工 (冷溫不燃性)

### 12.b 8 正格 (Eight Standard Structures) — Decision Tree

Per《子平真詮》卷一: "八字用神，專求月令"; 比肩劫财不入正格 (劫禄/陽刃 列外格).

**Procedure (executable):**
1. Take 月支 (月令).
2. List 月支 hidden stems (人元) per the standard 地支藏干表 (e.g., 寅 = 甲/丙/戊; 卯 = 乙; 辰 = 戊/乙/癸; …).
3. For each 透出 hidden stem (i.e., appears on 年干/月干/時干), determine its 十神 vs. 日干.
4. Apply the priority rule (《子平真詮》論用神變化 + 论杂气):
   - **子/午/卯/酉 月**: 本氣 only; the only 透干 in question is the 本氣對應之干 (or its 異性). 子月 透癸=正/偏印 by 日干; 透壬亦立印格. 午月 透丁先取丁，透己以財論 (per 《子平真诠》取格).
   - **寅/申/巳/亥 月** (四生): 本氣 透 → 取本氣; 本氣不透則取雜氣透干; 全不透 取本氣為格.
   - **辰/戌/丑/未 月** (四墓/雜氣): 必須透干，或有三合三會引出局，否則"月令無用"，須另從 年/日/時 重要十神中立格.
5. The 格 name is the resulting 十神 + "格":
   - 透出 = 正官 → 正官格
   - 透出 = 七殺 → 七殺格 (偏官格)
   - 透出 = 正財 → 正財格
   - 透出 = 偏財 → 偏財格
   - 透出 = 正印 → 正印格
   - 透出 = 偏印 → 偏印格 (枭神格)
   - 透出 = 食神 → 食神格
   - 透出 = 傷官 → 傷官格
6. Special cases (外格): 比肩透 → 建祿格; 劫財透 (陽日干月令見陰干劫財) → 月刃/陽刃格.

**Career tendency for each 正格:**

- **正官格** (《子平真詮》"官逢財印"): 公職、政府、文職干部、管理、法律、規矩型行業; 適合上班、體制內. "正官格，與正財、偏財、正印相配，宜工商、政治、經濟界".
- **七殺格 (偏官格)**: 武職、軍警、武術、外科、執法、競爭性領導職; "七殺與食神或傷官配：主管級要員"; 七殺帶羊刃 → 兵權貴顯.
- **正財格**: 工商、金融、財務、實業、穩定經營、固定薪酬; "正財格，有一個比肩，並有偏印，宜自由業 (律師、會計師、藝術家)".
- **偏財格**: 商業貿易、業務銷售、大眾傳播、投機性財富、海外經貿; "偏財旺者，特別適合做商界人才，或業務、銷售、大眾傳播工作".
- **正印格**: 文化、教育、學術、研究、出版、文書、宗教; "正印代表文書、權力、思考、精神，適合教育界、出版業、文學藝術界".
- **偏印格 (枭神格)**: 科技、技術研究、宗教、命理、玄學、特殊技藝、冷門偏門、副手 / 顧問.
- **食神格**: 餐飲、文藝、服務業、教育、創作、平和輸出; "食神生財，宜學習商務、金融、財政、貿易或技術性商業".
- **傷官格**: 演藝、口才、律師、表演、技術創新、媒體、自由職業; "傷官旺多從事口才事業如教師、律師、演說家、辯論家".

### 12.c 十神 → Career Direction Mapping

Score each 十神 by count + 透藏 + 喜忌, then sum to indicate career affinity:

| 十神 | 心性 | Career Direction |
|---|---|---|
| 比肩 | 自立、固執、競爭 | 獨立經營、體力工作、運動、操作工、機械師、船員、合夥 |
| 劫財 | 冒險、義氣、競爭 | 自由業、合夥、業務、醫生、律師、教師、投機 |
| 食神 | 平和、才華、口腹 | 文藝、餐飲、服務、教育、創作、企業中階 |
| 傷官 | 創新、表現、叛逆 | 演藝、教師、律師、評論、設計、自由創作、主持人 |
| 正財 | 穩定、勤勉、保守 | 工薪、財會、出納、實業、商店店主、行政 |
| 偏財 | 靈活、好動、社交 | 商業貿易、業務銷售、投資、外財、企業老闆、保險 |
| 正官 | 守法、規矩、責任 | 公務員、政府、文職、法律、企業中高管 |
| 七殺 | 競爭、權謀、武猛 | 軍警、武職、執法、外科、企業領導、體育、危險職業 |
| 正印 | 學術、文書、母性 | 教育、研究、出版、文學、學術、宗教 |
| 偏印 | 偏門、藝術、神秘 | 科技、命理、宗教、藝術、技術研發、副職、邊緣學科 |

**Composite rules:**
- 食傷生財 + 身強 → 商業、生意人 (見 Domain 14).
- 殺印相生 + 身不弱 → 軍政、外科、企業高管.
- 官印相生 + 不見傷官 → 文職、公務.
- 食神制殺 / 傷官駕殺 → 武職, 警界.
- 財官印 全 + 缺食傷 → 公職、服務性職業.
- 比劫並透 + 官能制 → 企業管理.
- 命局華蓋 + 偏印 → 研發、學術、宗教.

---

## DOMAIN 13 — SPOUSE / MARRIAGE (คู่ครอง)

### 13.a Spouse Characteristics by 配偶星 元素

**Rule:** 男命 财星 (正財 first, 偏財 second) = 妻; 女命 官杀 (正官 first, 七殺 second) = 夫. Identify the **strongest, closest** 财/官 to 日干. Look at its **五行** and **位置**.

| 配偶星 五行 | Appearance | Personality |
|---|---|---|
| 木 | 身材高挑、發絲柔順、條達挺拔; 過旺 → 高大粗壯; 不及 → 矮小, 男易禿頂 | 仁慈正直, 條暢, 富同情心 |
| 火 | 面色紅潤、亮麗、眼神有神; 過旺 → 性急火爆; 不及 → 小氣 | 熱情, 急躁, 講禮節, 浪漫 |
| 土 | 身材敦厚結實、個矮、面黃、相貌樸實; 過旺 → 高大敦厚; 不及 → 矮小膚黄 | 厚道踏實, 固執, 守信用 |
| 金 | 皮膚白皙、五官端莊、清秀; 過旺 → 高胖膚潤; 不及 → 瘦矮膚暗 | 剛毅, 果斷, 講義氣 |
| 水 | 身材偏胖、面黑、機靈、相貌一般; 過旺 → 高大肥胖; 不及 → 瘦小 | 聰明智巧, 機靈, 善變 |

**日支 (配偶宫) interpretation — group rule first, then individual:**

Group level:
- **子/午/卯/酉** (桃花地): 配偶漂亮端莊、有能力、講情調、浪漫、身材偏矮小.
- **寅/申/巳/亥** (四長生): 配偶相貌一般、精明務實、中等身材.
- **辰/戌/丑/未** (四墓): 配偶樸素敦厚、相貌一般、固執脾氣大、踏實重情、身材高大.

Branch detail:
- 子: 聰明反應快、膚色較黑、敏感多疑但聰慧清秀.
- 丑: 結實健美、個矮、心機較重、固執可靠.
- 寅: 高大挺拔、陽光、有責任感、上進心.
- 卯: 秀氣挺拔、溫柔細緻、體貼但愛糾結.
- 辰: 自我意識強、愛自由、適中偏壯、有點固執.
- 巳: 個性極端、防衛心重、高大強健、少病.
- 午: 樂觀開朗、高挑、面紅亮麗.
- 未: 溫和包容、戀舊、樸素敦厚.
- 申: 聰穎機智、愛表現、瘦骨白皙、斯文.
- 酉: 偏瘦、皮膚白皙、秀氣帥氣、熱情、自尊心強.
- 戌: 溫和善良、敦實健壯、樸實.
- 亥: 豐腴、相貌一般、善幻想、非常善良.

### 13.b 桃花 (Peach Blossom) and 紅鸞 (Hong Luan) Tables

**桃花 (咸池) — 沐浴位 of 三合局:** Calculate from **年支 OR 日支** (look across all four 地支):

| 年支/日支 | 桃花 |
|---|---|
| 申 / 子 / 辰 | 酉 |
| 寅 / 午 / 戌 | 卯 |
| 巳 / 酉 / 丑 | 午 |
| 亥 / 卯 / 未 | 子 |

Sub-variants:
- 牆內桃花 (年/月支): 主夫妻恩愛和諧.
- 牆外桃花 (日/時支): 主情慾外求、易招外遇.
- 倒插桃花: 年/月/日 三柱地支成三合, 年柱地支臨桃花 → 性巧聰明、慷慨風流.
- 遍野桃花: 子午卯酉四支齊全 → 桃花泛濫.
- 滾浪桃花: 丙子日 + 辛卯時 (天干合 + 地支刑) → 因色伤身.
- 裸體桃花: 甲子日 + 庚午時 (沐浴位 + 沖) → 婚姻易破.
- 桃花帶七殺 = 桃花殺: "酒色猖狂，只為桃花帶煞".
- 桃花帶正官 = 情貴桃花: "官帶桃花富貴長", 主夫妻和諧.

**紅鸞 (from 年支):** Confirmed table:

| 年支 | 紅鸞 | 天喜 (對沖) |
|---|---|---|
| 子 | 卯 | 酉 |
| 丑 | 寅 | 申 |
| 寅 | 丑 | 未 |
| 卯 | 子 | 午 |
| 辰 | 亥 | 巳 |
| 巳 | 戌 | 辰 |
| 午 | 酉 | 卯 |
| 未 | 申 | 寅 |
| 申 | 未 | 丑 |
| 酉 | 午 | 子 |
| 戌 | 巳 | 亥 |
| 亥 | 辰 | 戌 |

Application: 紅鸞 在 月柱/日柱 → 有桃花、媒介、婚喜、生育; 流年/大運 引動紅鸞 → 結婚或戀愛應期.

**Caveat for hourkey.io:** 紅鸞/天喜 source from 星命/五星術 (not 子平). Per the Zhihu article '四柱神煞：什么是红鸾？红鸾的查法和作用' (https://zhuanlan.zhihu.com/p/1902286751483015296): "凡以年为主的神煞，基本上都是源自很早之前的星命术（五星术），跟子平八字是完全不同的两套体系，而其所谓的年论神煞自然在四柱八字中也难得到应验（其有应者，不过是偶然碰巧，实际是与命局流通及喜忌巧合而已）。" Use as secondary modifier (lower weight than 桃花咸池).

**紅艷煞 (from 日干, secondary):**

| 日干 | 紅艷支 |
|---|---|
| 甲 | 午 |
| 乙 | 申 |
| 丙 | 寅 |
| 丁 | 未 |
| 戊 | 辰 |
| 己 | 辰 |
| 庚 | 戌 |
| 辛 | 酉 |
| 壬 | 子 |
| 癸 | 申 |

自坐紅艷日柱: 甲午、丙寅、丁未、戊辰、庚戌、辛酉、壬子.

### 13.c Marriage Problem Criteria (婚姻不順 Indicators)

Score each as a binary trigger; aggregate to a 婚姻風險 score.

**Set A — Configuration of 配偶宮 (日支):**
1. 日支被刑 (寅巳申/丑戌未/子卯/辰辰/午午/酉酉/亥亥).
2. 日支被沖 (子午、卯酉、寅申、巳亥、辰戌、丑未).
3. 日支被合 (六合或三合) and the合 brings out a 忌神.
4. 日支被害 (六害).
5. 日支為比肩或劫財 (男命: 丙午、丁巳、壬子、癸亥日 → 比劫坐 婚姻宮).
6. 日支為傷官 (女命: 甲午、乙巳、庚子、辛亥日 → 日支伤官 克 官星 → 克夫).
7. 日支為七殺 (女命) AND 無印化 → 婚姻有压力或受虐.

**Set B — Configuration of 配偶星 itself:**
1. **男命:** 正財偏財混雜 + 俱旺 → 多情人、易離婚.
2. **男命:** 比肩劫財多 (≥3) AND 財星弱 (≤1無根) → 群比争财, 妻被劫, 多婚或妻不安.
3. **男命:** 財星入墓 (財為水見辰, 火見戌, 木見未, 金見丑) AND 無沖開 → 妻多病或早亡.
4. **男命:** 局中無財 + 身強 → 一生與異性緣薄, 難找對象.
5. **女命:** 官殺混雜 (正官 + 七殺 干透並見) + 身弱無印化 → 二婚、感情糾葛、出軌.
6. **女命:** 官殺過多 (≥3) AND 無制 → 克夫、婚姻不穩.
7. **女命:** 局中無官殺 + 身旺 → 男人不敢招惹, 晚婚或不婚.
8. **女命:** 傷官旺 (干透 + 有根) AND 無財化、無印制 → 克夫.
9. **女命:** 官星入墓 (官星水見辰, 火見戌, 木見未, 金見丑) → 夫早亡或多病.

**Set C — Shensha and special configurations:**
1. 桃花太多 (≥2 桃花支) AND in 日/時 → 浪漫過度、易出軌.
2. 桃花帶七殺 → "酒色招災".
3. 紅艷煞 在日支 → 姻緣多變.
4. 孤辰 / 寡宿 在 日/時 (原文 source: 明代万民英《三命通会》):
   - 孤辰: 亥子丑年見寅, 寅卯辰年見巳, 巳午未年見申, 申酉戌年見亥.
   - 寡宿: 亥子丑年見戌, 寅卯辰年見丑, 巳午未年見辰, 申酉戌年見未.
   - "男怕孤辰, 女怕寡宿"; 在日支或時支 → 婚緣淡薄.
5. 陰陽差錯日: 丙子、丁丑、戊寅、辛卯、壬辰、癸巳、丙午、丁未、戊申、辛酉、壬戌、癸亥 → "夫家冷退, 妻家是非".
6. 孤鸞日: 乙巳、丁巳、辛亥、戊申、甲寅、戊午、壬子、丙午 → "孤鸞犯日本無兒" → 婚姻不順.
7. 魁罡日 (庚辰、庚戌、壬辰、壬戌) 女命 + 重逢 → 倔強克夫.
8. 純陰 (四柱純陰干支) 或 純陽 → 孤守青燈.
9. 命局子午卯酉四字俱全 (遍野桃花) + 身弱 → 婚變.
10. 比劫 (兄弟姐妹星) 坐 日支 (婚姻宮): 男 → 妻被夺; 女 → 夫被夺.

---

## DOMAIN 14 — WEALTH / MONEY (เงิน)

### 14.a 食傷生財 (Output Produces Wealth) — Mechanism

Per 《子平真詮》"財喜食生": 食神/傷官 (日干所生) 生 財星 (日干所剋); 中間流通命主之氣轉化為財富.

**Necessary conditions (ALL must hold for 食傷生財成格):**
1. 日干 不弱 (有根: 月令、坐支、或局中比劫透干). 身弱無法擔負泄秀, 食傷反成耗散.
2. 食神或傷官 有根 (在地支有同類比劫或自身本氣).
3. 財星 有根 (在地支). 虛透無根 → 無力承接.
4. 食傷 與 財星 緊貼 (相鄰干或地支同柱), 中間無剋阻.
5. **無印剋食傷**: "印星可以剋食傷, 食傷生財最怕印來制". 例外: 若印重, 反喜財來剋印.
6. **無比劫奪財 已透**: 若局中比劫過多, 需有官殺 制比劫 或 食傷 通關 比劫 → 財星.

**Quality grading:**
- 上格: 身強 + 食神有根 + 財星有根 + 流通有情, 無破 → 富格、能聚財.
- 中格: 身平 + 傷官生財 (傷官較花哨, 比食神略次) → 商人, 有財但有起伏.
- 下格: 身弱 + 食傷生財 → 為人忙碌但難聚財, 反洩日主.

**Trigger for 比劫爭財 (broken pattern):**
- 月令比劫透干 + 財星無食傷護衛 → 群比争财, 一生破财、克妻 (男命) / 婚姻不穩.

### 14.b 身財平衡 / Wealth Magnitude

Calculate two scores: 身強度 (D) and 財星強度 (W).

**身強 (D high) criteria (《子平真詮》):**
- 日干 通根月令 (月令 為 比肩/劫財/印星).
- 日干 多比劫 (≥2 透出 或 ≥2 地支).
- 印星 透干 + 有根.
- 局中無太多剋洩 (官殺 食傷 財星 合計 < 比劫印星).

**財旺 (W high) criteria:**
- 月令 是 財星本氣 (例 甲日見巳/午為財月).
- 財星 透干 + 通根地支.
- 局中食傷生財 + 不被剋.
- 財星 有 ≥2 顯現位置.

**Combined classifications:**

| D vs W | Configuration | Wealth Outcome |
|---|---|---|
| D 強 + W 強 | 身強財旺 (《滴天髓》"財氣通門戶") | 大富之命; 能掌控大財; 商賈巨富, 企業家 |
| D 強 + W 弱 | 身強財弱 | 中財; 需 食傷生財 或 大運走財地 才發 |
| D 弱 + W 強 | 財多身弱 ("富屋貧人") | 看得到但抓不住; 易破財, 為財所累, 妻强夫弱 (男命) |
| D 弱 + W 弱 | 身財兩弱 | 貧寒; 印比帮身為要 |
| 從財格 (身極弱無比劫印, 全局財旺) | 順從財勢 | 大富, 但需 大運不背 (不行印比運) |

**Specific classical rules:**
- "身旺財旺, 官星又旺" → 富貴雙全.
- "財多身弱" + 比劫運 → 該運轉好 (劫財帮身擔財).
- "財多身弱" + 官殺運 → 大凶 (財生殺攻身).
- "身強無官星" + 財旺 → 經商富而不貴.
- "身強官弱財虛" → 適合幕僚輔佐, 難自富.
- "群比爭財" → 破財、克妻.

### 14.c 財庫 (Wealth Treasury) — 墓庫 Rules

**Per 《滴天髓》: 四庫 = 辰/戌/丑/未, each stores a specific 五行:**
- 辰 = 水庫 (癸水入墓於辰)
- 戌 = 火庫 (丁火入墓於戌)
- 丑 = 金庫 (辛金入墓於丑)
- 未 = 木庫 (乙木入墓於未)

**Determination of 財庫 by 日干 (5 element 我克 = 財):**

| 日干 (五行) | 財 (五行) | 財庫 (地支) |
|---|---|---|
| 甲、乙 (木) | 土 | (土無墓, 取財星本身所通根之庫 → 通常以 辰戌丑未本身為財; 自坐財庫即) |
| 丙、丁 (火) | 金 | 丑 (金庫) |
| 戊、己 (土) | 水 | 辰 (水庫) |
| 庚、辛 (金) | 木 | 未 (木庫) |
| 壬、癸 (水) | 火 | 戌 (火庫) |

**Note (variant):** 甲乙日 的"財庫" 因 土無墓 而有爭議; 部分流派視 辰戌丑未本身 為 甲乙之 財; 部分視 戊土入墓於戌 (作為偏財庫).

**沖開財庫 (Opening the Treasury):**

The 庫 stores the 財 五行 inertly. To "open" 庫 and release the stored wealth, the **opposite earth branch** must appear (本柱已有 or 引動 by 大運/流年):
- 辰 (水庫) ⇄ 戌
- 戌 (火庫) ⇄ 辰
- 丑 (金庫) ⇄ 未
- 未 (木庫) ⇄ 丑

**Trigger conditions for wealthy 財庫 chart:**
1. 命局 含 對應日干之 財庫 (e.g., 丙日見 丑).
2. 財庫 內藏之 財星 透干 (e.g., 丙日 + 丑 + 辛金透 → 上吉).
3. 大運 / 流年 引 對沖 地支 → 沖開財庫 → 大發.
4. 命局 本來即有 對沖 (e.g., 辰戌 並見, 丑未 並見) → 常時開庫, 看 喜忌 (財為喜 → 富; 財為忌 → 反破財).
5. 四庫俱全 (辰戌丑未全) + 日主有氣 + 喜用配合 → 帝王富格. The documented exemplar is 明太祖朱元璋 (born 1328年, 天历元年九月十八日), 八字 戊辰壬戌丁丑丁未, all four earth branches present; per suanzhun.net citing classical 大师 commentary: "辰戌丑未，四库全备，名贵入黄权，奇格也，妙在辰戌丑未顺序，宜其贵为创业天子". Extremely rare; misconfigured ones (e.g., 日主極弱導致 丑未沖、辰戌沖 摧毀僅存的 印比 根) result in 貧困孤獨.
6. 自坐財庫 + 命局唯一財星 → 富命 (但需 沖開 才能流通).

**Cautions (per 《滴天髓》考):**
- 庫中之氣是 衰、病、死的弱氣; 不是強氣的儲藏. 必須透干引出 才有用.
- 若財星 在干又通根 庫中 → 真正富格.
- 沖開財庫 若財為忌神 → 反凶 (大破財或意外損失).

---

## DOMAIN 16 — STUDY / EDUCATION (เรียน)

### 16.a 文昌 / 文曲 Tables

**文昌貴人 (《三命通會》, "食神之臨官"):** Calculate from **日干** (年干 亦可作 secondary).

| 日干 | 文昌 (地支) |
|---|---|
| 甲 | 巳 |
| 乙 | 午 |
| 丙 | 申 |
| 丁 | 酉 |
| 戊 | 申 |
| 己 | 酉 |
| 庚 | 亥 |
| 辛 | 子 |
| 壬 | 寅 |
| 癸 | 卯 |

歌訣: "甲乙巳午報君知, 丙戊申宮丁己雞, 庚豬辛鼠壬逢虎, 癸人見兔入雲梯".

**文曲星 (variant — sources differ; commonly used table):**

| 日干 | 文曲 (地支) |
|---|---|
| 甲 | 亥 |
| 乙 | 子 |
| 丙 | 寅 |
| 丁 | 卯 |
| 戊 | 寅 |
| 己 | 卯 |
| 庚 | 巳 |
| 辛 | 午 |
| 壬 | 申 |
| 癸 | 酉 |

(文曲 = 食神之長生地, the mirror to 文昌's 臨官地.)

**Interpretation:**
- 文昌 在生 (年/月/日/時): 主聰明、文章秀、學業好、舉止文雅; 逢凶化吉.
- 文昌 在日支 (自坐): 命主自身好學、求知欲強.
- 文昌 + 印星: 主學術成就、高學歷.
- 文昌 + 桃花: 主藝術才華.
- 文昌 逢沖破 / 落空亡: 無力, 學業中斷.
- 文曲: 才藝、文藝才能; 偏向藝術.

### 16.b 用神 五行 → Field of Study Mapping

| 喜用 | 適合學科 |
|---|---|
| 木 | 文學、語言、中文、教育、農學、林學、園藝、醫學 (中醫/草藥)、宗教學、哲學 |
| 火 | 電子、電機、能源、光電、設計、藝術、影視、傳播媒體、表演藝術、文學 (浪漫派)、餐飲管理 |
| 土 | 建築、土木、地質、地理、房地產、農牧、會計、管理、宗教神學、考古 |
| 金 | 數學、物理、機械、金融、法律、軍警、醫學 (外科)、牙醫、工程 (精密)、會計 |
| 水 | 國際貿易、海洋、外語、傳播、心理學、哲學、玄學、醫學 (內科/中醫)、化學、流通、互聯網 |

### 16.c 印 / 食傷 / 官 Role in Study — Classical Logic

Per 《子平真詮》, 《滴天髓》:

**印星 (正印 / 偏印):**
- 正印 = 教科書、學歷、文憑、正規教育、正向思維、母愛.
  - 正印 為喜用 + 透干 + 有根 → 學業順、容易取得高學歷、文憑.
  - 正印 + 官星 = "官印相生" → 公職、學術界、容易得到提攜.
  - 正印 + 食神 + 不被破 → 文藝、學者.
- 偏印 = 偏門學科、技術、玄學、哲學、神秘學、學歷較曲折.
  - 偏印 為用 → 科技、技術研究、宗教、命理.
  - 偏印 過旺 → 思想孤僻, 不利正統考試.
  - **梟神奪食 (偏印剋食神)**: 主學業中斷、才華被壓抑、考運差.
- 印星 過多 → 依賴性強、難獨立、學業反而拖延.
- 印星 過弱 + 無根 → 學歷不高, 自學成才.

**食神 / 傷官 (才華表達):**
- 食神 為喜 → 平和的學習能力、考試發揮穩定、文科較佳.
- 傷官 為喜 → 創新思維、靈動有才、藝術/口才科目卓越; "傷官生財" 利商學, "傷官佩印" 利文藝學術 (《子平真詮》"傷官佩印, 則傷官旺, 印有根, 格成").
- **傷官見官** (傷官 + 正官 並透 + 無印化): 主學業出問題, 容易頂撞老師、權威, 考試失敗.
- 食傷 過旺 + 無印制 → 才華洋溢但難集中、好高騖遠.

**官星 (正官 / 七殺) — 紀律與功名:**
- 正官 為喜 + 不被傷官剋: 主守規矩、能服從制度、考試運佳、學歷晉升順.
- 七殺 為喜 + 有制 (食神制殺 or 印化殺): 主在競爭性考試中突出, 軍校、武校特別有利.
- 七殺 無制 + 身弱 → 學業壓力過大, 易精神問題.
- "官印相生" (官生印, 印生身): 標準的學者命, 公職或學界穩定發展.
- "殺印相生" + 身強: 軍政文武雙全.

**比劫 — 同儕競爭:**
- 比劫 多 + 食傷 弱 → 喜歡同儕活動, 學業不太專心.
- 比劫 為用 + 食傷透 → 通過討論、合作學習 (善於分組學習).

**Composite triggers for "good study chart":**
1. 印星 + 文昌 + 不被破 → 高學歷概率高.
2. 食神生財 + 印星護身 → 學商成功.
3. 官印相生 + 文昌入命 → 公職學者命.
4. 傷官佩印 (傷官旺 + 正印有根制) → 才藝雙絕.
5. 學堂 (long-life position of day stem) + 文昌 同支 → "學堂詞館", 學術名門.

**Composite triggers for "study problem":**
1. 梟神奪食 (偏印剋食神, 無財救應) → 學業中斷.
2. 傷官見官 + 無印化 → 頂撞權威、學業破壞.
3. 印星被財重剋 ("貪財壞印") → 因財廢學、輟學.
4. 比劫剋財 + 無食傷通關 + 印星弱 → 學費難籌 / 家境影響學業.
5. 文昌逢沖、空亡 → 考運不佳.

---

## Recommendations (Engineering)

**Staged implementation for hourkey.io scoring engine:**

**Stage 1 — Static Lookup Tables (deterministic, no judgment needed):**
- Encode all 神煞 tables as JSON constants: 羊刃 (with config flag for variant), 桃花, 紅鸞/天喜, 紅艷, 文昌, 文曲, 孤辰寡宿, 陰陽差錯日, 孤鸞日, 魁罡日, 流霞, 血刃.
- Encode 財庫 (per 日干) and 沖開 pair (對宮 earth).
- Encode 五行→TCM 臟腑 mapping.
- Encode 五行→行業 mapping (broken into 100+ industry leaf-nodes per 五行).
- **Threshold to revise these: never.** These are fixed classical tables.

**Stage 2 — Strength Engine (身強/身弱, 五行旺衰):**
- Build a quantitative scorer for 日干 strength using 月令得令 + 通根 + 透干 + 生扶 vs. 剋洩. A typical engineering heuristic (NOT a classically named formula — proposed by this report; analogous to the proportional 成-based system used by 易子著 on 163.com '最准确的五行强弱判断方法-日主旺衰判定量化法'): weight ≈ 月令 50%, 坐支 20%, 其他地支 15%, 透干 15%. These weights are an engineering starting point pending validation, not a classical constant.
- Same for each 五行 quantity (for the disease/health domain).
- **Threshold to revise:** if validation against ≥500 sample charts (with known life outcomes) shows < 65% accuracy on 身強身弱 classification, revisit weights.

**Stage 3 — 格局 (Pattern) Engine:**
- Implement the 月令透干 → 8正格 decision tree per Domain 12.b.
- For 雜氣月, implement transparent priority logic with explicit fallback.
- Output: array of (格名, 強度) per chart (often 1–3 格 per chart).
- **Threshold to revise:** if engine returns "無格" on > 15% of charts, the雜氣 fallback logic needs work.

**Stage 4 — Domain Rule Aggregators:**
- For each domain, combine Stage 1 神煞 hits + Stage 2 strength + Stage 3 格局 into a domain score (0–100).
- Use additive weighted scoring with negative weights for problem triggers (官杀混杂, 桃花太多, 梟神奪食, etc.).
- Marriage and Wealth domains need to differentiate **男命 vs 女命** explicitly.

**Stage 5 — Variant Configuration:**
- Provide a config UI that lets the practitioner choose:
  - 陰干羊刃 variant (帝旺派 vs 禄前一辰派, default: 帝旺).
  - 紅鸞/天喜/紅艷/孤辰寡宿 weighting (these are 星命術 imports; default to 50% weight of 子平 神煞 like 桃花/文昌).
  - 雜氣月令 取格 strictness (《滴天髓》嚴 vs 《淵海子平》寬).

**Validation benchmark:**
- Manual validation of 100 charts by a 命理 expert; engine and expert should agree on:
  - 格局 identification: ≥85%.
  - 用神 五行 (top choice): ≥70%.
  - Major 神煞 enumeration: 100% (deterministic).
  - Domain score rank-correlation with expert opinion: ρ ≥ 0.6 per domain.
- If health domain falls below ρ=0.5, the 五行 imbalance thresholds (currently "≥3 elements", "≤1 element") need calibration against more charts.

---

## Caveats

1. **Source authenticity:** The widely-cited "配偶星 五行 → 外貌性格" formula is presented online as derived from 《三命通會》 and 《子平真詮》, but I could not locate verbatim classical text matching the popular wording — it is a modern compilation following 五行取象 principles. The 桃花, 羊刃, 文昌, 財庫 calculation tables ARE verbatim from《淵海子平》/《三命通會》/《滴天髓》/《子平真詮》.
2. **羊刃 variant unresolved in tradition:** 《子平真詮》explicitly states only the 5 陽干 have 羊刃 ("惟五陽有之"); but later 旺衰 schools extend it to 陰干 via 帝旺. The modern "all-ten-stems" variant is associated with the 日主平衡用神派/旺衰派, whose founding developers (per Sina blog analysis of Republican-era 命理 masters) were 韋千里 (Wei Qianli) and 徐樂吾 (Xu Lewu): "现代日主平衡用神派的发起人韦千里、徐乐吾". Recommend exposing this as a config flag.
3. **紅鸞 / 天喜 / 紅艷 are 星命/五星術 imports**, not orthodox 子平 神煞. Per the Zhihu article '四柱神煞：什么是红鸾？红鸾的查法和作用' (https://zhuanlan.zhihu.com/p/1902286751483015296): "凡以年为主的神煞，基本上都是源自很早之前的星命术（五星术），跟子平八字是完全不同的两套体系，而其所谓的年论神煞自然在四柱八字中也难得到应验（其有应者，不过是偶然碰巧，实际是与命局流通及喜忌巧合而已）。" They are widely used by modern practitioners but have lower validation rates than 子平 五行十神 logic. Weight accordingly.
4. **雜氣月令 (辰戌丑未月) 取格** has multiple competing logics in classical sources. 《子平真詮》 requires 透干; 《淵海子平》 is more permissive. The decision tree above defaults to 《子平真詮》 strict interpretation but provides explicit fallback.
5. **TCM organ correspondences** are not predictive of specific diseases at the individual-chart level with high accuracy; they are tendencies, not diagnoses. The engine output should be framed as risk-indicators, never as medical advice. Strongly recommend including a disclaimer.
6. **財庫 沖開 timing** depends critically on 大運/流年 simulation; the engine must run a year-by-year scan to project when wealth is "released" — a yearly scoring module is required, not just a static chart score.
7. **Variant 血刃 tables** differ significantly across sources; some apps simply equate 血刃 with 羊刃. The table I gave is one common version, but flag this as low-confidence and prefer 羊刃 as the primary 血光 trigger.
8. **官殺混雜** as a marriage trigger has many qualifications in 《子平真詮》 ("官殺並透無根, 四柱劫印重逢, 不但喜混"). The rule should not blindly fire on any 干透官殺 combo; the 身強身弱 + 印化 + 食傷制 conditions must be checked first.
9. **孤辰寡宿** (textual origin: 明代万民英《三命通会》, per Baidu Baike: "以上论述主要源自明代万民英所著《三命通会》。") is widely criticized in modern critical 子平 literature. Per Zhihu post '四柱神煞：什么是孤辰寡宿？孤辰寡宿的查法和作用' (https://zhuanlan.zhihu.com/p/1901307910681769522): "命犯'孤辰寡宿'者，命主一定孤僻及婚姻不顺，更是无稽之谈，在四柱八字实践中也得不到验证。" Encode with lower weight than 桃花 or 文昌.
10. **「五行缺X→疾病X」 rules** in popular books exaggerate predictiveness; classical 《滴天髓》論疾病 篇 emphasizes that disease comes from the **interaction** of 五行 (太過、不及、相剋), not raw counts. The thresholds I gave (≥3, ≤1) are rough heuristics; calibration against real charts is needed.