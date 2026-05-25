# Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine

## TL;DR
- The classical 子平 corpus gives implementable rules — but as conditional logic, not lookup tables: every event trigger is gated by (a) whether the activated star/palace is 喜用 or 忌神 for the Day Master, (b) whether 大運 sets a 吉 or 凶 background, and (c) whether 流年 performs a specific 冲/合/刑/填實/引動 action on a key character. Encode the rules below as a three-layer engine (chart layer → 大運 layer → 流年/流月 layer), not as a flat "year X = event Y" mapping.
- For 應期 (timing), four classical mechanisms are sufficient to pinpoint year and month: 逢冲則發 (clash activates a static or stored element), 逢合則應 (combination binds and triggers), 填實 (the year/month whose stem-branch literally supplies a missing or 空亡 character), and 引動 (the year that "draws out" a dormant pattern via root, transparency, or 三合/三會). The classical doctrine, taken verbatim from the 滴天髓 體用章 原注, is **「若以大運為體，則以流年為用」** — the luck pillar sets the stage, the annual pillar fires the trigger.
- For 大運 phase, the authoritative textual position (Shen Xiaozhan in 子平真詮 §25, echoed by Chen Su'an) is that **stem and branch jointly govern the full ten years**; the popular "干主前五年、支主後五年" split is a later teaching convention most influentially propagated by 韋千里《千里命稿》(1935) — not original 子平真詮 doctrine, and even 韋千里 hedged on it. The 交運/退運 transitional 1–2 years are real and codifiable as an instability window. Implement the 10-year rule as primary and offer the 5+5 split as a configurable secondary refinement.

---

## Key Findings (decision-ready)

1. **Every classical trigger is two-layer.** A "marriage year" or "promotion year" rule is never just "流年 = 財星" — it requires the 流年 character to (i) be 喜用 or at least non-忌, AND (ii) physically act (冲/合/刑/填) on the 配偶宫/官星/財星/驛馬 etc. Without the trigger action, the year passes without event. Encode every event row as `{star_or_palace_target, trigger_action, gender_variant, strength_modifier, ying_qi_year_rule, ying_qi_month_rule, source}`.

2. **應期 collapses to four primitives.** 冲, 合, 填實, 引動. The classical year-rule is: GIVEN a key character K (stem or branch flagged as the focus of an event — e.g. 夫星, 妻宫, 財庫, 用神), the year of manifestation is the year whose 干支 (or its hidden stem 藏干) performs one of {冲 K, 合 K, 填實 K if K is 空亡 or part of a 拱/虛合, 引動 K by 三合/三會/透根}. The month rule is identical, applied at 流月.

3. **Source authority hierarchy.** 滴天髓 何知章 + 疾病章 + 體用章 give the high-level 富/貴/貧/賤/吉/凶/壽/夭 rules and the canonical 體/用 doctrine; 子平真詮 §25 (論行運), §28 (論支中喜忌逢運透清), §10 (論用神成敗救應), §21 (論星辰無關格局) give the 大運 × 流年 interaction logic and the 神煞-skeptic stance; 淵海子平 〈喜忌篇〉 + 〈雜氣財官格〉 章 and 三命通會 give the 財庫/墓庫 and 歲運並臨 rules; 任鐵樵 《滴天髓闡微》 (completed c. 1848, published 1933) is the most-cited later commentary; 梁湘潤 lecture notes consolidate practitioner-side 流年 / 流月 narrowing rules (拱合冲邊, 兩坏夾一好, etc.).

4. **One canonical caveat.** The famous folk maxim 「歲運並臨, 不死自身, 便死家人」 is a paraphrase. The verified classical text in 三命通會 卷十 is **「煞官大忌，歲運相併必死。其餘諸格，並忌煞及填實，歲運併臨必死。」** — i.e. the doctrine is real but only catastrophic when paired with 七煞 / 填實 of a vulnerable 用神. Engine should down-weight a bare 歲運並臨 unless one of these compounding conditions is also present.

---

## Details

### AREA 1 — EVENT TRIGGER TABLE

Below each event is decomposed to: PRIMARY (the star/palace to monitor), TRIGGER (the action that fires it), STRENGTH MODIFIER (身強/身弱 / 用神/忌神 gating), GENDER, 應期 YEAR rule, 應期 MONTH rule, SOURCE.

#### 1.1 婚姻 / 結婚 (Marriage)

| Sub-rule | Primary (target) | Trigger | Strength modifier | Gender | 應期 year | 應期 month | Source |
|---|---|---|---|---|---|---|---|
| MAR-1 配偶宫被冲動 | 日支 | 流年地支 冲 日支 (e.g. 卯日 见酉年) | Any | Both | Year whose 支 冲 日支 | Month whose 支 冲 日支 OR 合 日支 | 王虎应《命理真诀导读》: "夫妻宫无合, 流年冲动夫妻宫而结婚" |
| MAR-2 配偶宫被合入 | 日支 | 流年地支 半三合/六合/三合 入 日支 | 流年 should be 喜用 | Both | Year whose 支 合 日支 | 流月 合 日支 | 算准网汇编: "配偶星逢太岁地支合入配偶宫中" |
| MAR-3 配偶星 (財/官) 引動 | 男: 財星; 女: 官星 | 流年 透 配偶星 to 天干, OR 流年 三合成 配偶星之局 | 男: 身強担財; 女: 身弱有印化官更应 | M = 財; F = 官 | Year 配偶星 透干 | Month re-透 or 合 入 日支 | 文耀辉《易学研究资料》; 八字应用阐微 第07章 |
| MAR-4 天地鸳鸯合 | 日柱 | 流年 与 日柱 天合地合 (e.g. 丁壬+寅亥) | Any | Both | The 双合 year | 流月 帮合 | 文耀辉; 王虎应 |
| MAR-5 桃花/紅鸞/天喜引動 | 桃花 (年/日支 三合首字之沐浴), 紅鸞 (年支起卯逆), 天喜 (對冲紅鸞) | 流年 = 桃花/紅鸞/天喜支 AND 该支 合/冲 日支 or 配偶星 | 命局原有 桃花 更应; 紅鸞 入命主早婚 | Both | Year =紅鸞/天喜支 | Month 同 | 太白童子博客 |
| MAR-6 配偶星 入庫 → 開庫 | 男 偏/正財; 女 正/七官 | 流年 冲 该庫 (辰戌冲, 丑未冲) | Star 入库 in原局 | Both | Year 冲庫 | Month 冲庫 | 八字应用阐微: "原局配偶星入墓...逢开墓之大运或流年, 财官出现, 鸾凤和鸣" |
| MAR-7 拱合冲邊 | 日柱前后两柱 拱出 配偶星 | 流年 冲 拱合的边柱 | 拱出星为喜用 | Both | Year冲边 | 同 | 梁湘润《子平概论》: 「拱合冲边」 |
| MAR-8 三合成 財/官 局 | 命局 三合 incomplete (半合) | 流年 supplies missing branch → 完成 三合 = 引動 | 局成 喜用神 | Both | The 引动 year | The 引动 month | 算准网, 王虎应 |

Gender split detail: **For men, 財 = wife/finances**; for **women, 官 = husband; 七杀 = lover/non-husband male**. When 官杀混杂 the engine should split "official husband" vs "non-husband male" and check which 流年 引動 which.

#### 1.2 生子 / 添丁 (Children)

| Sub-rule | Primary | Trigger | Strength | Gender | 應期 year | Source |
|---|---|---|---|---|---|---|
| CHI-1 子女星 透干 引動 | 男: 官杀; 女: 食伤 | 流年 transparent stem = 子女星 | 子女星 通根有气 (虛浮 → 流产/虛花) | M=官杀; F=食伤 | 透干 year | 灵遁者《朴易天下》 |
| CHI-2 时支 冲/合/刑 (子女宮動) | 时支 | 流年支 冲 时支 (尤其 子午冲、卯酉冲), OR 合 时支, OR 刑 (生產痛苦/手术) | Any | Both | The 冲/合/刑 year | 大家找命理 |
| CHI-3 三合 入 时柱 | 时支 | 大运+流年+原局 三合 局 with branch合 in 时支 | 局成 喜用 | Both | 三合完成 year | "大运流年三合局, 合入时宫添人口" 口诀 |
| CHI-4 子女星 入库 → 開庫 | 时支 = 辰戌丑未 (含 子女星藏干) | 流年 冲 该库 | 入墓 in 原局 | Both | 冲库 year | "库中子女钥匙开" 口诀 |
| CHI-5 女命 七煞/伤官 流年 | 伤官 (or 七煞) | 流年 = 伤官/七煞 干支 | 应验率最高 — 因 伤官 = 生殖系统 | F-specific | 该年 | 灵遁者《朴易天下》 |
| CHI-6 印星 制食伤 解除 | 命局 印重克食伤 | 流年 财来克印 | 食伤 解放 | F | 财年 | 普通经验诀 |

#### 1.3 升職 / 事業 (Promotion / Career)

| Sub-rule | Primary | Trigger | Strength | Source |
|---|---|---|---|---|
| CAR-1 官印相生 流年 | 官星 → 印星 → 日主 | 流年/大运 形成 官生印 or 印生身 | 身弱用印 / 身強用官 — see 子平真詮 「逢官看印」 | 子平真詮 §31; 滴天髓 何知章 "何知其人贵, 官星有理会" |
| CAR-2 食伤制杀 | 七杀 | 流年 食神/伤官 制 七杀 | 身强杀重 | 子平真詮 §39 论偏官: "煞以攻身, 似非美物, 而大贵之格, 多存七煞" |
| CAR-3 财官身三停 引動 | 财→官→身 path | 流年 透 财 or 官 | 三者通根 | 滴天髓何知章: "财气通门户" + "官星有理会" |
| CAR-4 用神 临 禄/驿马/将星 | 用神柱 | 流年 = 用神 干支 | 用神 通根 | 八字應用闡微 |
| CAR-5 月令格神 得生护 | 月支 格局 | 流年 生扶 格局用神 | 月令不破 | 子平真詮 §25 |
| CAR-6 杀刃驾杀 引動 | 羊刃 + 七杀 | 流年 = 杀 时 (身強有刃) | 身強 | 子平真詮 §43 阳刃: "羊刃驾杀, 兵权贵显" |

#### 1.4 破財 / 損財 (Financial Loss)

| Sub-rule | Primary | Trigger | Strength | Source |
|---|---|---|---|---|
| LOS-1 比劫夺财 流年 | 财星 | 流年 = 比劫 干支, 冲/克 命局 财星 | 身強 + 财弱 → 必凶; 身弱 → 比劫为用反而吉 | 滴天髓; 子平真詮 §45 建禄月劫; "群比争财" |
| LOS-2 财星被冲 | 财星 (干或支) | 流年 冲 财星 (干克 or 支冲) | 财弱 受冲 = 破财, 财旺 受冲 = 流通 | 通用诀 |
| LOS-3 财库被冲破 in 原局 | 财库 + 已被另一原局支冲 | 流年 再冲 = 钱包打开任人抢 | 财库已破 | 算准网案例 (甲辰甲戌甲辰乙亥 案) |
| LOS-4 阳刃 流年 + 财在年月 | 羊刃 | 流年 = 阳刃支 | 财在年月 (老爸/兄弟相关) | 子平真詮 §43 |
| LOS-5 财生杀攻身 | 财→杀 path | 流年 透 财, 命局 杀已重 | 身弱 | 经验诀 |
| LOS-6 贪财坏印 | 财 vs 印 用神冲突 | 流年 财 克 印 (印为用) | 印为用神 | 子平真詮 §35 印绶 |

#### 1.5 發財 / 求財 (Wealth Gain)

| Sub-rule | Primary | Trigger | Strength | Source |
|---|---|---|---|---|
| WLT-1 财气通门户 | 月令为财 or 财通月令 | 流年 生 财 OR 流年 = 官 (官护财) | 身強担财 | 滴天髓 何知章 main verse: 「何知其人富，財氣通門戶」 — the expansion 「財旺身強，官星衛財...」 is from 劉基 原注 |
| WLT-2 食伤生财 | 食伤 → 财 | 流年 透 食伤 or 财 | 身強有食伤 | 子平真詮 §33 论财 |
| WLT-3 财库逢冲 (开库) | 财库 (辰戌丑未 with 财藏干) | 流年 冲 财库 (辰戌冲 OR 丑未冲) | 身強担财 + 财星旺 | 淵海子平 喜忌篇 / 雜氣財官格: 「雜氣財官，宜沖則發」(verbatim); 三命通會 卷六; the maxim 「財官臨庫，不沖不發」 widely circulates as a paraphrase derived from these |
| WLT-4 拱财 / 半合财局 完成 | 命局 半三合 财 | 流年 supply 三合 missing branch | 局成 财 | 子平真詮 §47 杂格 |
| WLT-5 财星 引動 通根透干 | 财星 in 命 | 流年 干 = 命局藏干 财星 → 通根透干 | 财星 in 禄旺位 force-up | 52zwbc.com 课程 |
| WLT-6 身弱 走 比劫/印 运 | 日主 | 大運 比劫/印; 流年 = 财 (担起) | 身弱不胜财 | 任鐵樵《滴天髓闡微》: "身弱财重, 无官印而有比劫者, 皆财气通门户也" |

#### 1.6 疾病 / 災病 (Illness)

Element-organ mapping (synthesized from 滴天髓 疾病章 + 渊海子平 论疾病):

| 五行 | 天干 | 地支 | 脏 | 腑 | 受亏症状 |
|---|---|---|---|---|---|
| 木 | 甲/乙 | 寅/卯 | 肝 | 胆 | 风晕、目昏、筋青、肝胆病、神经痛、头眩 |
| 火 | 丙/丁 | 巳/午 | 心 | 小肠 | 心血、脑神经、眼疾、舌、痈疮脓血 |
| 土 | 戊/己 | 辰戌丑未 | 脾 | 胃 | 浮肿、脚气、口臭、翻胃、皮肤 |
| 金 | 庚/辛 | 申/酉 | 肺 | 大肠 | 鼻塞、咳嗽、气喘、骨节疼痛、皮肤干燥 |
| 水 | 壬/癸 | 子/亥 | 肾 / 膀胱 | 三焦 | 白浊、白带、霍乱、疝气、肾结石、腰酸 |

| Sub-rule | Trigger | Source |
|---|---|---|
| ILL-1 用神受克 in 流年/大運 | 用神 干支 被 流年 冲/克 (尤其 天克地冲) | 滴天髓 疾病章: "忌神入五脏而病凶" |
| ILL-2 旺神 → 受亏者 之器官 | 例 木旺 金弱 → 肺系 (庚辛 受亏) | 渊海子平 论疾病 |
| ILL-3 羊刃 / 七杀 unrestrained 流年 | 羊刃 流年 + 命局 无制 | 滴天髓 + 子平真詮 §43 |
| ILL-4 三刑 入命 | 命局已有部分三刑, 流年/大运 补齐 寅巳申 or 丑戌未 | 渊海子平: "刑者, 刑罚也, 多主刑事、伤灾病祸" |
| ILL-5 反吟/伏吟 流年 = 命柱 | 流年 = 命局某柱 (伏吟) OR 双冲 (反吟) | 梁湘润: "伏吟比反吟还更伤脑筋" |
| ILL-6 假从格 / 病重药轻 | 流年 破格 | 八字應用闡微 经验总结 |
| ILL-7 滴天髓 疾病章 verbatim lines | 「五行和者，一世無災。血氣亂者，生平多疾……金水傷官，寒則冷嗽，熱則痰火；火土印綬，熱則風痰，燥則皮癢。論痰多木火，生毒鬱火金，金水枯傷而腎經虛，水木相勝而脾胃泄。」 | 滴天髓 疾病章 (Wikisource; 任鐵樵《滴天髓闡微》第25章) |

#### 1.7 搬家 / 動遷 (Relocation)

| Sub-rule | Primary | Trigger | Source |
|---|---|---|---|
| MOV-1 驿马 冲動 | 寅申巳亥 (查法: 申子辰→寅, 寅午戌→申, 巳酉丑→亥, 亥卯未→巳) — based on 年支 or 日支 | 流年 冲 驿马支 | 驿马星百科; 算准网 |
| MOV-2 驿马 临 印 / 财 / 食伤 | 驿马柱 | 流年 透 该十神 | 驿马+印=学/房子搬迁; 驿马+财=求财而动; 驿马+食伤=理想而动 |
| MOV-3 三合 / 三会 完成 input 驿马 | | 流年 完成 | 命理通则 |
| MOV-4 印星动 (搬家专象) | 印星 (尤其 子午卯酉 印) | 流年 冲 印, 或 流年 合 命局印枭 | 算准网 (从八字看工作变动) |
| MOV-5 年柱 / 月柱 伏吟 | 流年 = 年/月柱 | 反吟主大动, 伏吟主换环境 | 梁湘润 |

#### 1.8 考試 / 學業 / 文書 (Exams)

| Sub-rule | Primary | Trigger | Strength | Source |
|---|---|---|---|---|
| EXA-1 印星 旺相 + 流年 印 | 正印 (正规文凭) / 偏印 (非正规) | 流年/大運 印星 出现 不受克 | 身弱喜印; 财不破印 | 八字應用闡微 |
| EXA-2 官印相生 流年 | 官→印 | 流年 官 来生 命局 印, 或 大運官印同步 | "官印相生" verbatim 标准 | 子平真詮 §31; 八字应用阐微: 「无论身强身弱, 走官印相生之岁运, 均利于考试」 |
| EXA-3 伤官配印 | 印 + 食伤同存 | 流年 强化 配印结构 | 身強有 食伤 加印 = 高分 | 普通诀 |
| EXA-4 文昌 / 学堂 / 词馆 / 华盖 流年 | 日干起 文昌 (甲→巳, 乙→午, 丙戊→申, 丁己→酉, 庚→亥, 辛→子, 壬→寅, 癸→卯) | 流年 = 文昌支 | 文昌不受刑冲 | 命理通则 |
| EXA-5 时支 与 流年 合成 喜用 | 时支 | 流年支 合 时支 → 喜用 = 录取 | 时支与岁运合喜 | 易经天下: "命局时支与流年支合成喜神, 则考得上" |
| EXA-6 财坏印 | 财 vs 印 | 流年 财 克 命局 印 (印为用) | 男命 财管事 / 女命 官管事 时差 | 子平真詮 §35 印绶取运 |

#### 1.9 官非 / 訴訟 (Legal Trouble, 小人)

| Sub-rule | Primary | Trigger | Source |
|---|---|---|---|
| LEG-1 七杀攻身 无制 | 七杀 | 流年/大運 杀 加重, 命无 食伤 制, 无 印 化 | 子平真詮 §39 |
| LEG-2 伤官见官 | 官 + 伤官 | 流年 出现 伤官 / 官, 形成对克 | 子平真詮 §41-42; 渊海子平 |
| LEG-3 三刑 (寅巳申 / 丑戌未) 入命 | 三刑组 | 流年 / 大运 补齐三刑 | 渊海子平; 三命通会 |
| LEG-4 羊刃倒戈 | 羊刃 | 流年 冲 羊刃 (甲不喜酉冲卯刃, 丙不喜子冲午刃) | 子平真詮 §43: "羊刃倒戈, 必作无头之鬼" |
| LEG-5 财坏印 + 印为用 + 命有官 | 财→印 path | 流年 财 强 | 经验诀: "财坏印有官" |
| LEG-6 岁运并临 + 杀填实 | 大运干支 = 流年干支 + 同时 是 七杀/填空 | 同时发生 | 三命通會 卷十 verbatim: 「煞官大忌，歲運相併必死。其餘諸格，並忌煞及填實，歲運併臨必死。」 |

#### 1.10 六親 / 父母 events

| Sub-rule | Primary | Trigger | Source |
|---|---|---|---|
| KIN-1 父 (偏财) 受冲克 | 男: 偏财; 女: 正财 | 流年/大运 比劫 旺, 冲克 偏财 | 通用论六亲 |
| KIN-2 母 (正印) 受冲克 | 男: 正印; 女: 偏印 | 流年/大运 财 冲 印 (印为用更凶) | 子平真詮 §35 |
| KIN-3 年柱被冲 (祖上/父母 位) | 年柱 | 流年 天克地冲 年柱 | 八字应用阐微 |
| KIN-4 月柱被冲 (兄弟姐妹 / 父母) | 月柱 | 流年/大运 天克地冲 月柱 | 同 |
| KIN-5 日柱被冲 (配偶) | 日柱 | 流年 天克地冲 日柱 | 同 |
| KIN-6 时柱被冲 (子女) | 时柱 | 流年 天克地冲 时柱 | 同 |
| KIN-7 互换空亡 | 年柱与大运/流年互换空亡 | 主不利长辈; 月运互空 → 不利夫; 日运互空 → 克配偶 | 命理空亡总论 |

---

### AREA 2 — 應期 (TIMING) RULES

The four primitives. For each, the engine evaluates: GIVEN key character K (a stem or a branch that the chart analysis has flagged as the focus for a particular event), search 流年 (60-year cycle) and within the matched year search 流月 (12 months) for any one of:

#### 2.1 逢冲則發 / 逢冲而動 (Clash triggers activation)
- **Rule:** If K is static, stored (墓库), or 暗藏 in a 三合/拱局, the year/month whose 干支 performs a 天克 (干克干) or 地冲 (支冲支) on K is the manifestation period.
- **Codifiable case:** 财库 in 命 (e.g. 戊土 日 with 辰 in 局, no movement) → 流年 戌 → 辰戌冲 开库 → 发财年; 戌月 同样 月份 = 发财月.
- **Boundary:** 财库 already 冲破 in 命局 (受双重冲) → 再来冲为破财, not 开库.
- **Source:** 算准网: "财库逢冲, 大发其财, 墓库因为是五行的归藏之地"; 三命通會 雜氣財官格 章; 淵海子平 喜忌篇 / 雜氣財官 章.

#### 2.2 逢合則應 (Combination triggers response)
- **Rule:** If K is the 配偶宫/子女宫/财星 etc., 流年 地支 forming 六合 / 半三合 / 三合 / 三会 with K = response year.
- **Notable special form — 天合地合 (天地鴛鴦合):** 流年 同时 与 命局 某柱 天干 五合 + 地支 六合 (e.g. 流年 丁亥 vs 命局 壬寅 → 丁壬合 + 寅亥合) → 强 应期, 尤其 婚事.
- **Boundary — 合 with intermediate 间隔:** 子平真詮 §5 "论十干合而不合": 「合而不敢合」 — if there is an 间隔 五行 blocking, the 合 is weakened.
- **Source:** 王虎应; 子平真詮 §5.

#### 2.3 填實 (Filling the void / completing the latent)

Three sub-mechanisms:

- **填實 空亡 (filling a Void):** K is a 空亡 in 命局 (查法: 以日柱为主, 旬中所空之二支). 流年 干支 = 该空亡支 OR 流年 冲合 空亡支 = 填實. 「以日支查空亡, 空亡之支等于没有...大运空为空, 流年出现空亡为填实, 当逢冲、合、刑大运时, 填实」 (算准网汇编).
  - **吉凶反断:** 用神 逢空 → 填实 应凶; 忌神 逢空 → 填实 应吉.
- **填實 of a 拱/虚合 (filling a missing piece of a latent combination):** Example from 梁湘润: 丁酉 癸卯 丙辰 丙申 — 申辰拱子 (申子辰水局 missing 子) → "每逢子年填实, 每逢申年、辰年, 会成申子辰" → 12年4次 (子, 申, 辰, 又 丑 暗合) → 桃花/夫星 应期.
- **填實 of a 暗合 / 暗冲:** 月令暗冲(倒冲格)、子遥巳格 等 — the missing 飞神 年份 = 应期.
- **Source:** 算准网 空亡论 + 梁湘润《子平概论》.

#### 2.4 引動 (Drawing out / triggering)
- **Rule:** A dormant or covered character K in 命局 is "drawn out" when 流年 (a) transparent stem 透 K's 藏干, OR (b) 三合/三会 / 半合 with K to form a clear local, OR (c) 通根 to K (gives K a strong root that wasn't there).
- **Classical line (Shen Xiaozhan, 子平真詮 §28 論支中喜忌逢運透清):** 「若命与运二支会局, 亦作清论...此五年中, 亦能操其祸福」 — when 命 + 运 二支 form a 会局, the latent dynamic operates over a roughly 5-year window.
- **Example:** 命局 月支 巳 含 庚金 (财 for 乙日) — 庚金 是 暗的 — 流年 透 庚 → 引动 财 → 财年.

#### 2.5 Year → Month narrowing rule

Once a year is fixed as 应期, the month within that year is the month whose 干支:
- (a) repeats the same trigger action on K (e.g. if year 冲 K, then the month that also 冲 K = 应月);
- (b) OR completes a 三合 with K (e.g. if K = 子, year = 申, the 辰 month within that year compounds 申子辰);
- (c) OR is the 反吟/伏吟 of K (流月 = K → 伏吟, OR 流月 冲 K → 反吟);
- (d) **梁湘润 流月 vs 流年 rule:** 流月只与大运发生关系, 不直接与原局 — so the month is identified by checking 流月 干支 vs 大运 干支 first, with the strongest forms being 月运同途 (流月 = 大运), 月运反吟 (流月 冲 大运), 月运双合 (流月 与 大运 天合地合).
- **Inner-month resolution boundary:** 「流月的吉凶应期多半在交下一个节气之前应验」 — i.e. the event lands inside the solar-term boundary of the trigger month, often near its end (algorithm: search the trigger month's 节气 cusp ±15 days).

#### 2.6 The 大運 / 流年 division of labor (canonical doctrine)
- **「運為體, 年為用」 — verbatim from 滴天髓 體用章 原注:「若以大運為體，則以流年為用」.** 大运 sets the 10-year background (whether the upcoming trigger will fire as 吉 or 凶); 流年 is the trigger itself. If 大运 is 喜用, even a 忌神 流年 is mild ("赚钱不开心而已"); if 大运 is 忌神, even a 喜用 流年 is "稍微顺利, 不会发财".
- **Source — primary text:** Shen Xiaozhan, 子平真詮 §25 論行運 verbatim: 「論運與看命，無二法也。看命以四柱干支，配月令之喜忌，而取運則又以運之干支，配八字之喜忌。故運中每運行一字，即必以此一字，配命中干支而統觀之，為喜為忌，吉凶判然矣」.

#### 2.7 墓庫 / 開庫 timing (consolidated)
- **冲开 (best, classical preferred):** 辰戌冲, 丑未冲 → 完全 opening; "彻底开, 没有负面作用" (zhihu finance article).
- **刑开:** 丑戌, 戌未 三刑组件 → 开但带 副作用 (官非 / 伤六亲).
- **拱开:** 申辰拱开辰, 亥未拱开未, 巳丑拱开丑, 寅戌拱开戌 — 命主能掌控的方式.
- **穿/破:** 不利 — 穿则库小, 破则不为库.
- **古云:** 「少年逢库, 懵懵懂懂, 中年逢库, 发财无数, 老年逢库, 棺材一副」 — age × 库 timing modifier; **engine should weight 开库年 by age bracket.**
- **关键限制 (古云):** 「财官印绶全备, 藏蓄於四季之中, 辰戌丑未是也。如官露、印露、财露则不妨也」 — i.e. once the stored thing is already revealed/透干 in 命局, 冲库 may not be required.
- **Source:** 淵海子平 〈喜忌篇〉 / 雜氣財官格 章 (verbatim: 「雜氣財官，宜沖則發」); 三命通會 卷六 雜氣財官格. The widely-quoted 8-character maxim 「財官臨庫，不沖不發」 is a Ming-Qing practitioner paraphrase of this canonical 雜氣財官 doctrine — flag it as derived, not canonical.

---

### AREA 3 — YEAR THEME RULES + 大運 PHASE

#### 3.1 Dominant-theme priority logic for a given 流年

For each year, the engine ranks candidate themes by:

1. **What ten-god does 流年 干支 represent (relative to Day Master)?**
2. **Is that ten-god 用神 or 忌神 in 命局?** 用神 出现 = 吉 manifestation; 忌神 出现 = 凶 manifestation in that ten-god's domain.
3. **What palace does 流年 strike** via 冲/合/刑/穿/破/三合 入 (年/月/日/时柱)?
4. **Where does the strike land?** 日柱 strike → self/spouse; 时柱 strike → children/late-life; 月柱 strike → parents/career; 年柱 strike → grandparents/origin.

**Resolution when multiple stars activate:**
- (a) 用神 / 忌神 status wins ties first — strongest 吉/凶 single ten-god owns the year.
- (b) Where two ten-gods activate equally, **the palace struck closest to 日柱 wins** (日 > 时 > 月 > 年 in immediacy, per 梁湘润: 「年月三十岁，月日是中年，大运是十年，流年是一年」).
- (c) 流年 vs 流年 干 (天干) effect = "感受 / 外象"; 流年 vs 流年 支 (地支) = "实质 / 内事". For "feel/perception" themes use 干; for material events use 支. 梁湘润: 「流年没有实质, 只有感受」.

**Ten-god → life-domain mapping** (the engine's headline-picker):

| 流年 ten-god | Domain | Modal event when 喜用 | Modal event when 忌神 |
|---|---|---|---|
| 比/劫 | 兄弟/朋友/竞争/财 | 合作得财, 朋友帮助 | 夺财, 倒债, 朋友拖累 |
| 食/伤 | 才华/子女(女)/口舌 | 名利双收, 子女, 文章 | 伤官见官, 官司, 损子 |
| 正/偏财 | 钱财/妻(男)/父 | 发财, 婚事(男) | 财来财去, 妻病, 父病 |
| 正/七官 | 事业/丈夫(女)/官非 | 升官, 名声, 婚事(女) | 官非, 病, 丈夫不顺 |
| 正/偏印 | 学业/母/房产/文书 | 考试录取, 文凭, 升学, 房产 | 母病, 学业阻, 名誉损 |

#### 3.2 大運 phase doctrine — 上運, 交運, 退運

- **上運 (entering a luck pillar):** First 1–2 years of a new 大运 are unstable transition. Liang Xiang-run explicitly observes: 「遇到大运交替之时, 解释法就又松了。就好像我们到火车站去买火车票, 正好交替, 售票的也不理你」 — engine should apply a "transition window" damping factor (e.g. flag both year before and year after the 交运 birthday as "low signal").
- **交運 (changeover):** Computed from 起運 age formula: 阳男阴女 顺数到下一个节气, 阴男阳女 逆数到上一个节气, 三天 = 一岁, 一天 = 四个月, 一时辰 = 十天. So 起运 age has a precise day/hour. Big 大运 transitions occur every 10 years from this anchor (every 10th birthday on that month/day).
- **退運 (exiting):** Last 1–2 years of a 大运 — the energy is fading; classical observation is that 退运 tends to produce loose-ends and reversals (尤其 if 退运 是 喜用 → people often experience a "last burst then drop"; 退运 是 忌神 → relief is near).
- **Classical compounding rule:** 梁湘润 notes a practitioner rule — 「两坏夹一好, 中间这一年取消; 两好夹一坏, 中间这一年取消」 — i.e. if the year before and year after are both 坏/好 流年, the middle year's opposite quality gets canceled (the system can't "thaw and refreeze" fast enough). Implement as a 3-year sliding-window smoother on 流年 quality scores.
- **Source:** 梁湘润《子平概论：大运、流年》(yyzfs.ren); 聚贤馆 起运算法 (juxian.com.hk).

#### 3.3 大運 干 vs 支 weighting traditions

The classical and modern positions diverge:

- **Position A — 子平真詮 / 陳素庵 / 沈孝瞻 (the textually canonical view):** 干支 共管 十年, NOT split.
  - Shen verbatim: 「取運則又以運之干支，配八字之喜忌」 (干支 treated as a unit).
  - Chen Su'an (陳素庵): 「舊書謂一運上干下支，分管年數，率為上下各五年，又有因運重地支之說，或謂上四年下六年，或謂上三年，下七年，其實皆不然也。蓋行運從月建而起......月建干支，共管一月之事，無干管上半月，支管下半月之理；乃因以行運，反分裂干支，各管幾年，有是理乎？故上干下支，各管十年為是」 — i.e. **干支 each governs the full 10 years; the split-5 idea is rejected.** (kknews.cc citing 陈素庵).

- **Position B — Ming-Qing → modern practitioner tradition:** 干 主前五年, 支 主後五年.
  - Most influentially propagated by **韋千里《千里命稿》(1935)**, which became the most widely-sold modern BaZi primer (sold in 11 countries). A 2024 Zhihu review of that work notes that even 韋千里 「沒有全盤接收『大運的10年，前五年看天干後五年看地支』的說法」 — i.e. even its most influential carrier hedged.
  - 命书 nuance: 「看天干时可结合地支一起看, 看地支时...就撇开不管了」 — the stem operates with branch support over the full decade, but in the second half the stem fades and the branch takes over.

- **Position C — 張楠 「蓋頭截腳」 (the modulating refinement):** Even within a 10-year unit, if the stem 蓋頭 (covers) a useful branch with an opposite-element disabler, OR a branch 截腳 (cuts off) a useful stem at the root, the practical effect is suppressed — 「庚、辛、壬、癸蓋在上面，出頭不得」.
  - **Source:** 張楠 (引 in kknews.cc article 「8字看大運流年」).

**Engine recommendation:** Default to Position A (干支共管十年) as the primary scoring. Offer Position B (5+5 split) as a secondary, lower-weighted refinement exposable as a toggle. Always apply Position C (蓋頭/截腳) as a per-pillar modifier — this one is the most empirically reliable refinement.

#### 3.4 大運 × 流年 combination scoring

Implement the canonical rule as:

```
Theme_score(year) = base(命局 用神/忌神 vs 流年 ten-god)
                  × multiplier(大运 喜用 = +; 大运 忌神 = −)
                  × event_trigger(冲/合/刑/填/引动 on key palace/star)
                  × position_weight(冲 to 日柱 = 1.0; 时 = 0.8; 月 = 0.6; 年 = 0.4)
                  − damping(交运/退运 window: −20% for ±1 year around 交运)
                  + sliding_smoother(两坏夹一好/两好夹一坏 cancellation)
```

#### 3.5 Special compounding modifiers (Engine flags)

- **歲運並臨** (流年 干支 = 大運 干支): elevate severity ONLY if 流年 is 七煞 to Day Master OR 流年 是 填實 (填命局某空亡 用神). Classical authority — 三命通會 卷十 verbatim: 「煞官大忌，歲運相併必死。其餘諸格，並忌煞及填實，歲運併臨必死」. Without the compounding condition, a bare 歲運並臨 is at most a major-change marker.
- **伏吟** (流年 = 命局 某柱): unbalanced repeat; Liang's "five-person mahjong table" simile. Apply a "disruption" flag.
- **反吟** (流年 与 命局 某柱 双冲): explicit chaos; combine with palace position to assign event.
- **天克地冲** of 月柱 by 流年/大運: classical maxim — 月柱 是 提纲, 「冲破提纲, 多亏父母，或是刑、或是离异」 (淵海子平 verbatim); engine should auto-flag career change / parent issue.

---

## Recommendations (concrete, staged)

### Phase 1 (next sprint) — minimum viable engine
1. **Implement the four 應期 primitives** (冲/合/填實/引動) as a single function `find_ying_qi(key_character, time_window)` returning candidate {年, 月} tuples. This single function powers every event detector.
2. **Build the Event Trigger Table** (rows above) as a JSON config with columns `{event_id, primary_star, primary_palace, trigger_type, gender, strength_required, source}`. Start with the 10 events listed; each row produces a probability score.
3. **Encode the ten-god × 喜用/忌神 matrix** for theme classification. This is the headline-picker (§3.1).

**Trigger threshold for "year is significant":** at least one Event Trigger Table row must (a) match the year's 流年 干支 against an actual 命局/大运 character, AND (b) the matched character must be flagged 喜用 or 忌神 (i.e. not a 闲神 — 闲神 流年 = quiet year). If only 闲神 activates, mark year as quiet.

### Phase 2 — refinement
1. **Add the 大運 phase damping** (§3.2) — ±1-year transition window around computed 交运 birthdays gets a 20% confidence cut.
2. **Implement 蓋頭/截腳 detection** (§3.3 Position C) for 大运 干支 vs 命局 用神.
3. **Add the 两坏夹一好 smoother** as a 3-year sliding window applied after the per-year scoring.
4. **Element-organ mapping for 疾病 module** (§1.6 table) — implement as a separate health risk module that fires only when 用神 is struck or the over-旺 element is 流年-reinforced.

### Phase 3 — advanced
1. **岁运并临 + 七煞/填實 compound detection** (§3.5).
2. **拱合冲邊 detection** — when 命局 two pillars 拱 a missing character that is a 喜用/忌神 star, monitor for the 流年 that 冲 either of the bracket pillars.
3. **Real 节气 cusp resolution** for 流月 (§2.5) — most events land near the boundary of the trigger month.
4. **Gender-aware 配偶星 split** — for 官杀混杂 women, separate "official husband" from "lover/non-husband" tracking.

### Benchmarks that would change the recommendations
- **If empirical backtest shows ≥60% accuracy with Position A (干支共管十年) alone**, do not implement Position B as user-facing toggle — it adds noise.
- **If 应期 hit-rate is <40% on 流年 alone**, prioritize Phase 2 节气 resolution + 流月 to lift to 月-level precision.
- **If 健康 module false-positive rate >20%**, gate it on TWO conditions: (用神 struck) AND (over-旺 element re-reinforced) — never on one alone.

---

## Caveats

1. **The classical sources are not a single coherent algorithm.** 子平真詮 (clean 格局 logic), 滴天髓 (poetic high-level), 淵海子平 (encyclopedic), 三命通會 (encyclopedic + 神煞), 窮通寶鑒 (調候用神 emphasis) all overlap and sometimes conflict. The rules above synthesize the practitioner consensus; for borderline cases the engine should prefer 子平真詮 + 滴天髓 over later 神煞 elaborations.
2. **Famous folk-maxims are often paraphrases.** Two examples verified in this research: 「歲運並臨，災殃立至」 is a paraphrase — the canonical text is 三命通會 卷十 「歲運併臨必死」 (only in conjunction with 七煞/填實). 「財官臨庫，不沖不發」 is a paraphrase of the 淵海子平 〈雜氣財官格〉 doctrine 「雜氣財官，宜沖則發」, not a verbatim canonical 8-character couplet. Engine should not weight folk-maxims as heavily as primary text.
3. **The 干主前五年/支主後五年 split is NOT in 子平真詮 or 滴天髓.** Chen Su'an explicitly refutes it. It became popular via the Republican-era textbook 韋千里《千里命稿》(1935) and downstream practitioner literature — and even 韋千里 hedged on it. Implement as optional secondary refinement, not primary logic.
4. **Health predictions are the most empirically variable area.** 任鐵樵 (1773–1840), whose 《滴天髓闡微》 (completed c. 1848, published 1933) is the most-cited later commentary, noted 八字 can only identify "重大的疾病" (major organ-system illness), not specific diseases — and BaZi disease modeling has been the most criticized and revised area in modern命理 research (陸致極 et al.). Health module should output risk categories, never specific diagnoses.
5. **桃花 / 紅鸞 / 天喜 神煞 are practitioner-level, not 子平真詮 core.** 子平真詮 §21 「論星辰無關格局」 explicitly states: 「八字格局，專以月令配四柱，至于星辰好歹，既不能為生克之用，又何以操成敗之權？況于局有礙，即財官美物，尚不能濟，何論吉星？于局有用，即七煞傷官，何謂凶神乎？」 — 神煞 are auxiliary, not primary. Use them as tie-breakers, not as primary triggers.
6. **Gender variation is real but not deterministic.** Women's chart marriage rule uses 官星; men's uses 财星 — but a man with weak 财星 can still mark marriage via 比劫 流年 (he goes out to "spend"). The trigger table should support gender-default rows AND gender-secondary fallback rows.
7. **The 起運 timing is a precise hour, not just a year.** Engine should compute 交运 to the day from birth time + 节气 distance × 120 (3 days = 1 year ratio); imprecise birth-time inputs propagate into 交运 errors which propagate into all 大运/流年 boundary calls. Solar-time correction is essential.