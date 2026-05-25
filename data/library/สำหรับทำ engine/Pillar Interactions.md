# §7 Pillar Interactions — Deep Per-Pair Content for the Four "Thin" Categories (Hourkey Scoring Engine)

**TL;DR**
- **Replace identical copy-paste descriptions** with per-pair content driven by (i) hidden-stem 藏干 mechanics enumerated verbatim in 《命理探原》〈六冲〉 ("子藏癸水克午藏丁火，午藏己土克子藏癸水...卯酉相冲者，酉藏辛金克卯藏乙木...经云：东冲西不动"), (ii) the 旺/库/生 typology of each branch from 《三命通會》卷二〈论冲击〉, and (iii) the classical asymmetries documented in 《滴天髓》任氏注.
- **Implement clash (六冲) with three sub-types** — 旺地冲 (子午, 卯酉) pure-element war; 库冲 (丑未, 辰戌) "tomb opening" that can be benign IFF 财官印 透干; 生地冲 (寅申, 巳亥) post-horse/travel clashes with messy multi-stem warfare. Resolution conditions (合解, 通关, 隔位, 贪合忘冲) are classically attested in 《子平真诠》第七章 and should be modeled as multiplicative dampeners.
- **Three-tier 六合 outcomes** (合化 / 合而不化-合绊 / 不合) hinge on 化神透干 + 月令支持 + 不受冲克. Operational hierarchy from 算准网 ("地支三合与三会的区别"): "三会力量大于三合力量；三合缺一时称为半合，力量小于三合"; expanded ranking in 《禀气而生》八字课程 PDF (52zwbc.com): **三会 > 三合 > 有四仲半三合 > 六合 > 无四仲半三合**. Engine should expose per-category weight knobs because 任铁樵 in 《滴天髓阐微》 explicitly 削去 破 entirely as "尤属不经".

---

## Key Findings

1. **The four "thin" categories are NOT equally credible in the classical canon.** 六冲 is canonical and elaborated in every major text. 三合/三会 and 六合 are canonical with rich theory. 六害 is canonical with per-pair sub-typology in 《三命通會》卷二. **六破** is the weakest — 《淵海子平》 contains no 六破 chapter at all (confirmed by full-text search of the standard 徐大升 edition); 任铁樵 《滴天髓阐微》 writes verbatim: "至于破之义，非害即刑也，尤属不经，削之可也" ("As for 'po' — it is nothing more than 害 or 刑 in disguise; utterly without basis; should be deleted"). Engine design implication: weight 破 lowest, treat as an interpretive overlay, not a structural relation.

2. **Per-pair differentiation must come from hidden stems 藏干, not surface five-elements.** 《命理探原》〈六冲〉章 (preserved verbatim in jun5you.com/welcome/artview2284) gives the explicit stem-fights for each pair: "子午相冲者，子藏癸水，克午藏丁火，午藏己土，克子藏癸水也...寅申相冲者，寅藏甲木，克申藏戊土，申藏庚金壬水，克寅藏甲木丙火也...辰戌相冲者，辰藏癸水，克戌藏丁火，戌藏辛金克辰藏乙木也." Use this primary text as the per-pair scoring substrate.

3. **三合/三会 over 六合 precedence is explicit in 《三命通會》卷二 论支元三合**: "若三字缺一则化不成局，不可以三合化局论。盖天地间道理，两则化，一阴一阳之谓也；三则化，三生万物之谓也." The trio is structurally superior; half-combination cannot 化 by itself. Modern operational ranking (算准网 "地支三合与三会的区别"): "三会力量大于三合力量；三合缺一时称为半合，力量小于三合，大于单独地支的五行；三会缺一时不论半会，只各自单论."

4. **Resolution of clash by combination ("合解冲") is classically grounded in 《子平真詮》第七〈论刑冲会合解法〉.** Verbatim opening: "刑者，三刑也，子卯、巳申之类是也；冲者，六冲也，子午、卯酉之类是也；会者，三会也，申子辰之类是也；合者，六合也，子与丑合之类是也...八字支中，刑冲俱非美事，而三会六合，可以解之。假如甲生酉月，逢卯则冲，而或支中有戌，则卯与戌合而不冲；有辰，则酉与辰合而不冲；有亥与未，则卯与亥未会而不冲；有巳与丑，则酉与巳丑会而不冲，是会合可以解冲也." 沈孝瞻 also explicitly notes counter-cases where 合不能解冲. This is exactly the engine logic needed.

5. **三刑 is classically contested.** 沈孝瞻 in 《子平真诠》第七: "至于三刑取义，姑且阙疑，虽不知其所以然，于命理亦无害也" — set aside in doubt. 任铁樵 《滴天髓阐微》 is harsher: "刑之义无所取，如亥刑亥、辰刑辰、酉刑酉、午刑午，谓之自刑，本支见本支，自谓同气，何以相刑？子刑卯，卯刑子，是谓相生，何以相刑？...此皆俗谬，姑置之." 《三命通會》卷二〈论三刑〉 retains the full doctrine via 《阴符经》 derivation ("三刑生于二合"). Engine design: weight 三刑 lower than 冲, expose toggle for "盲派/三命通會 traditional 派" vs "子平真诠 sceptical 派".

6. **Vocabulary alert**: "贪合忘冲" is a folk口诀, NOT a 子平 classical phrase. The closest classical original is 《淵海子平·论偏官》: "乙合之，谓之贪合忘煞." The expansion to 贪合忘冲 / 贪合忘克 / 贪合忘生 is later 民国-era systematization. Cite the doctrine; don't cite a phantom classical source.

---

## Details

### CATEGORY 7 — 六冲 (Six Clashes), RANK 1

#### 7.0 Classical foundation
《三命通會》卷二〈论冲击〉 verbatim: "地支取七位为冲，犹天干取七位为煞之义。如子午对冲，子至午七数，甲逢庚为煞，甲至庚七数。数中六则合，七则过，故相冲击为煞也." Same chapter, crucial caveat: "若戌丑辰未四库所藏，为十干财官、印绶等物，尤喜冲激；若寅申巳亥全，子午卯酉全，反成大格，不以冲击论" — not all clashes are negative.

#### 7.1 (a) Conditions when a clash does NOT activate / is dissolved (不出力 / 解冲)

Six dampeners (model each as a multiplicative coefficient ∈ [0,1] in the scoring engine):

1. **合解 (combination dissolves clash)** — if one of the clashing branches is locked in a 六合 or 三合 with a third branch, the clash neutralizes. 《子平真詮》第七 verbatim case: "甲生酉月，逢卯则冲，而或支中有戌，则卯与戌合而不冲；有辰，则酉与辰合而不冲." Resolution strength scales with combination strength (三合 > 六合 > 半合).
2. **通关 (bridging element)** — a five-element bridge between clashing branches restores 生 flow. 算准网 "干支刑冲合害破关系先论哪一个" verbatim: "原本相克的两个五行，中间出现通关五行，则顺位相生而不克."
3. **隔位 (non-adjacency)** — 紧贴相冲 is strongest; 隔支相冲 reduced; 遥冲 nearly impotent. Sohu 济怀说命理之"六冲" verbatim: "隔支相冲：中间隔了一地支，相冲的力量减速变小。如：年日冲，月时冲。遥冲：是指中间隔了两柱，力量最小，几乎是无力之冲。如：年时相冲." (The recommended numerical coefficients of 1.0 / 0.7 / 0.3 are engine-design choices, not classical numbers.)
4. **贪合忘冲 (combination preempts clash)** — when a branch can both clash and combine with adjacent neighbors, combination takes priority. Root in 《淵海子平·论偏官》 ("乙合之，谓之贪合忘煞"); systematized in 《黄金策》 ("贪生贪合，刑冲克害皆忘").
5. **旺衰悬殊 (strength mismatch)** — 《滴天髓》: "旺者冲衰，衰者拔；衰者冲旺，旺者发" ("Strong clashing weak uproots the weak; weak clashing strong rouses the strong"). The clash exists in form but its effect is asymmetric.
6. **空亡 (void)** — branches in 旬空 do not fully participate in clash; classical exception in 三命通會 神煞 chapters.

**Special case for 库冲 (storage clashes):** 《三命通會》 explicitly: "四库所藏，为十干财官印绶等物，尤喜冲激" — the storage opens. **But** 任铁樵 dissents sharply in 《滴天髓阐微》 verbatim: "所谓暮库逢冲则发者，后人之谬也。暮者，坟暮之意；库者，木火金水收藏埋根之地...如木火金水之天干，地支无寅、卯、巳、午、申、酉、亥、子之禄旺，全赖辰戌丑未之身库通根，逢冲则微根拨尽." **Engine conditional rule**: 库冲 is benign IFF (a) the 天干 representing the stored element is well-rooted elsewhere, AND (b) the storage element is itself a 喜神; otherwise 库冲 damages the root.

#### 7.1 (b) Three sub-types

| Sub-type | Pairs | Nature | Effect Profile |
|---|---|---|---|
| **旺地冲 (四正/四旺冲)** | 子午, 卯酉 | Pure-element war; hidden stems nearly mono (子=癸; 午=丁己; 卯=乙; 酉=辛) | Most direct, most violent, clearest "胜负" determination |
| **库冲 (四库/四墓冲)** | 丑未, 辰戌 | Storage-on-storage; both 本气 = 土, but hidden stems diverse and internally clashing | "冲开库" can release 财官印 if 透干; uproots if 天干 depends on storage root; ambiguous direction |
| **生地冲 (四生/四长生/驿马冲)** | 寅申, 巳亥 | Growth-on-growth; multi-stem hidden melee, 余气全无 | 驿马 quality = travel, relocation, transitions; mutual damage |

《滴天髓》任氏: "子午卯酉之冲，胜败最易区分...寅申、巳亥相冲，藏干相克，两败俱伤；辰戌丑未相冲，冲动而已，无战克." Use this as the per-type scoring template.

#### 7.1 (c) PER-PAIR DIFFERENTIATION

##### 子午冲 (Zi-Wu Clash) — North↔South, Water↔Fire, "乾坤相对"
- **Hidden stems clash** (《命理探原》verbatim): 子藏癸水克午藏丁火；午藏己土克子藏癸水. Bi-directional but 午 takes primary hit when 子 is strong.
- **Mechanism**: Purest 坎离 axis. Symbolically: 子=墨池 (well/black pool); 午=烽火 (beacon fire). The day-night, intellect-passion polarity.
- **Life-domain effect**: Inner restlessness ("一生不安"), emotional volatility, oscillation between cold introspection and hot impulse; heart (心) and kidneys (肾) — cardiovascular and urological flags; passion-relationship turbulence; unsettled career identity if on 日柱.
- **Engine weight**: HIGHEST among the six (with 卯酉). Base coefficient = 1.00.

##### 丑未冲 (Chou-Wei Clash) — NE↔SW, Wet-Earth ↔ Dry-Earth, "湿燥相战"
- **Hidden stems clash** (《命理探原》verbatim): 丑藏辛金克未藏乙木；未藏己土丁火克丑藏癸水辛金. Five-fold internal melee: 辛克乙; 丁克辛; 癸克丁; 乙克己; 己土比和.
- **Mechanism**: Both 土 storages; 本气 does not war, but hidden 财官印 (金水木火) trigger a full minor zodiac of conflicts. Wet 丑 vs dry 未 = temperature/humidity reversal.
- **Life-domain effect**: "事多阻逆" — chronic obstruction, slow grinding frustration; family/property disputes (土 = property/elders); digestive/spleen issues; gynecological for women. 冲开库 reading: if 财官印 透干, can release latent wealth/status. 任铁樵's caution applies strongly.
- **Engine weight**: 0.55, with direction (benefit vs damage) determined by 透干 and 喜忌.

##### 寅申冲 (Yin-Shen Clash) — NE↔SW, Wood↔Metal, 驿马冲 #1
- **Hidden stems clash** (《命理探原》verbatim): 寅藏甲木克申藏戊土；申藏庚金壬水克寅藏甲木丙火. Full sequence per 任氏: "申中藏庚金，克寅中甲木；寅中丙火又克申中庚金；申中壬水，又克寅中丙火；寅中戊土，又克申中壬水。战克不静也."
- **Mechanism**: 长生 vs 长生 — seed-of-wood vs seed-of-metal; each branch is the 长生 of the other's enemy. 驿马 quality (寅申巳亥 = 四马).
- **Life-domain effect**: Travel, relocation, business trips, simultaneous change of city AND occupation (居住地+职业 双变). 寅=广谷/east-market, 申=名都/west-station — hence "善经商而致富". Liver/gallbladder vs lungs/large-intestine medical axis; spine/joints. Personality: 多情且好管闲事.
- **Engine weight**: 0.85.

##### 卯酉冲 (Mao-You Clash) — East↔West, Wood↔Metal, "日出日落门"
- **Hidden stems clash** (《命理探原》verbatim): 酉藏辛金克卯藏乙木. 《命理探原》: "经云：东冲西不动，殆即卯木不能返冲酉金之义" — the asymmetry: 酉 always wins; 卯 cannot strike back equally.
- **Mechanism**: 卯=日出之门, 酉=日落之户; the 咸池/peach-blossom axis. Pure 震兑 clash; cleanest 旺地冲 after 子午.
- **Life-domain effect**: "背约失信，色情纠纷，桃花成灾" — broken agreements, infidelity, romantic chaos; 卯=身体, 酉=酒色娱乐; relationship and reputation hits. Medically: liver↔lungs, joints, sinews. For women on 日支/时支, this clash signals marriage turbulence.
- **Engine weight**: 0.95 (slightly under 子午 because 卯 is the overwhelming loser, less symmetric drama).

##### 辰戌冲 (Chen-Xu Clash) — SE↔NW, Wet-Earth ↔ Dry-Earth, "魁罡相战"
- **Hidden stems clash** (《命理探原》verbatim): 辰藏癸水克戌藏丁火；戌藏辛金克辰藏乙木. 戊土 比和.
- **Mechanism**: 辰=水库 (also 木余气), 戌=火库 (also 金余气). 任铁樵: "三月之辰，乙木司令，逢戌冲，则戌中辛金，亦能伤乙木." If 月令 is 辰 and 乙 司令, 戌 clash can destroy the 乙木 use-god.
- **Life-domain effect**: "争讼打斗" (disputes), property/real-estate movements, conflict with subordinates/staff ("奴仆逃走"); unclear bittersweet outcomes. 辰戌全 命局 can produce leaders ("头面之命") per 任氏. Career: construction, real estate, land-related work; legal disputes.
- **Engine weight**: 0.50 (库冲, ambiguous). Same conditional 库冲 logic as 丑未.

##### 巳亥冲 (Si-Hai Clash) — SE↔NW, Fire↔Water, 驿马冲 #2
- **Hidden stems clash** (《命理探原》verbatim): 巳藏庚金克亥藏甲木；亥藏壬水克巳藏丙火. Cascading multi-strike.
- **Mechanism**: 长生 vs 长生; 巽艮 axis. 巳=庚金长生 — Metal seeds in Fire; 亥=甲木长生 — Wood seeds in Water. Mutual seeding clash, highly unstable.
- **Life-domain effect**: "离祖之命，一生奔波，爱管闲事，心软嘴硬" — leaves ancestral home, restless travel, soft-hearted but sharp-tongued, religious/philosophical inclination. 驿马 quality. Medically: 巳=heart/small intestine, 亥=kidney/bladder; cardiovascular vs renal; circulation issues, neuralgia. Career change, frequent overseas.
- **Engine weight**: 0.80.

---

### CATEGORY 8 — 三合 / 三会

#### 8.1 (a) Formation conditions

**Full 三合 trio** (申子辰, 亥卯未, 寅午戌, 巳酉丑) — 《三命通會》卷二〈论支元三合〉 verbatim: "申乃子之母，辰乃子之子，申乃水生，子乃水旺，辰乃水气，生即产，旺即成，库即收，有生有成有收，万物得始得终，乃自然之理，故申子辰为水局。若三字缺一则化不成局，不可以三合化局论。盖天地间道理，两则化，一阴一阳之谓也；三则化，三生万物之谓也." The 旺神 (子, 卯, 午, 酉 = 帝旺/cardinal middle) is the indispensable anchor — 长生 + 墓库 alone (e.g. 申辰, 亥未, 寅戌, 巳丑) form only a 拱合, weakest, often not counted.

**Half-combinations 半合** — two strengths:
- **生旺半合 (生地+旺地)**: 申子, 亥卯, 寅午, 巳酉 — strong, comparable to 六合.
- **墓库半合 (墓库+旺地)**: 子辰, 卯未, 午戌, 酉丑 — moderate.
- **生墓拱合 (生地+墓库, no 旺神)**: 申辰, 亥未, 寅戌, 巳丑 — weakest, may not transform without 透干 引化.

**三会 (寅卯辰 东方木, 巳午未 南方火, 申酉戌 西方金, 亥子丑 北方水)** — requires all three branches; no half-会 in classical doctrine (some practitioners allow 卯辰 as a special case but this is non-canonical). 三会 力量 > 三合 because it gathers "一方专气" (one direction's pure seasonal qi). NB: The phrase "各专一方之气" is associated with 《子平真诠》 / 徐乐吾 evaluative tradition, not directly with 《三命通會》 卷二 verbatim — most modern attribution to 《三命通會》 is loose paraphrase.

#### 8.1 (b) When does it 化 (transform)?

Three classical conditions for successful 化:
1. **化神透干** — the resulting element must appear in 天干 (e.g. 申子辰 → 壬 or 癸 must show).
2. **月令支持** — 月支 must not contradict the transformation; ideally supports the 化神.
3. **No clash/break on the 中神** — if the cardinal anchor (子, 卯, 午, 酉) is clashed by another branch, 化 fails.

If conditions fail → **合而不化** — branches combine (lose independent function, "合绊") but no new element generated. The original five-element of each branch must still be tracked.

#### 8.1 (c) Precedence over 六合

Operational ranking (from 算准网 "地支三合与三会的区别" verbatim): "三会力量大于三合力量；三合缺一时称为半合，力量小于三合，大于单独地支的五行；三会缺一时不论半会，只各自单论."

Expanded hierarchy (from 《禀气而生》八字课程 PDF, 52zwbc.com): **三会 > 三合 > 有四仲半三合 > 六合 > 无四仲半三合**.

Alternative finer-grained ranking inserting 冲/刑 (from Sina 《子平真诠》解读 / k.sina.cn): "通常三会的力量最强，三合的力量次强，六冲的力量稍强，六合的力量较弱，而三刑的力量最弱（只是动摇而已），而六害是静止的，只有遇到冲才能体现." Use this as the cross-category baseline for weight calibration.

When 三合 and 六合 conflict, **弃合论会 / 弃六合论三合** (defer to stronger). 《子平真詮》第七 confirms via 会合解冲 examples.

#### 8.1 (d) Per-group differentiated meanings

##### 三合 局 (4 groups)

**申子辰 三合水局 (Water Trinity)**
- Mechanism: 申=壬水长生, 子=帝旺, 辰=墓库. Continuous water-generation circuit.
- Symbol: River-source-to-ocean; intelligence, fluidity, multi-channel adaptation.
- Personality / life: "多元化智慧，变化大，冷眼旁观，临时改变" — flexible intellect, change-comfortable, calculating, sometimes aloof. Career flows: research, finance, transport, fluids, communication.
- Engine weight: 1.00 (modify by 化 success and 喜忌).

**亥卯未 三合木局 (Wood Trinity)**
- Mechanism: 亥=甲木长生, 卯=帝旺, 未=墓库.
- Symbol: Forest growing into harvest; vision, growth, principle.
- Personality / life: "指挥性佳，讲义气，外表威严较酷" — leadership, principled, can appear severe; suited to consulting, education, NGOs, design.
- Engine weight: 1.00.

**寅午戌 三合火局 (Fire Trinity)**
- Mechanism: 寅=丙火长生, 午=帝旺, 戌=墓库.
- Symbol: Flame to coal/ashes; passion, vision, brilliance with burnout risk.
- Personality / life: "热情，前热后冷，行动派，急性子" — passionate, impulsive, action-first; suited to entertainment, media, marketing, military, fire/energy industries.
- Engine weight: 1.00.

**巳酉丑 三合金局 (Metal Trinity)**
- Mechanism: 巳=庚金长生 (via 丙→戊→庚 internal generation in 巳's 藏干), 酉=帝旺, 丑=墓库.
- Symbol: Ore-to-tool-to-treasury; discipline, refinement, decisive judgment.
- Personality / life: Refined, disciplined, judicious; law, accounting, surgery, engineering, jewelry. (Some 盲派 readings additionally note "幻想、不切实际、心地软" indicating idealism-vs-execution gap when the 金 is忌神.)
- Engine weight: 1.00.

##### 三会 方 (4 groups)

**寅卯辰 东方木方** — Pure spring qi. 辰 中乙木余气 collapses into 木 (qualitative phase change: 辰土 loses 土性, becomes 木). Symbol: spring forest, dawn. Life: unrestrained growth, vitality, idealism; creative/sustainable/educational fields. If 忌神: excessive idealism, scattered focus. **Engine weight: 1.20** (会 > 合).

**巳午未 南方火方** — Pure summer qi; 未 余气 lifts into 火. Symbol: midday sun. Life: spotlight careers (media, performance, leadership). Risk of burnout, hypertension. 调候: usually needs water balance. **Engine weight: 1.20**.

**申酉戌 西方金方** — Pure autumn qi; 戌中辛金余气 lifts. Symbol: harvest blade, sunset. Life: law, military, surgery, audit, sports. Can be cold, harsh, intolerant. **Engine weight: 1.20**.

**亥子丑 北方水方** — Pure winter qi; 丑中癸水余气 lifts. Symbol: deep ocean, midnight. Life: research, philosophy, intelligence work, fluids, finance. Cold/damp health risks. Often introverted. **Engine weight: 1.20**.

---

### CATEGORY 9 — 六合

#### 9.1 (a) Three levels of 合化

**Level 1: 合化 (full transformation)** — combination produces new element.
Conditions:
- 紧贴 (adjacent branches);
- 化神透干 (resulting element shows in 天干);
- One side significantly weaker and yields;
- 月令 supports;
- No clash on either branch from another pillar.

**Level 2: 合而不化 / 合绊 (binding without transformation)** — branches lock each other, lose independent function but element unchanged.
Conditions:
- Both branches strongly rooted; neither yields;
- 化神 not 透干; or
- 化神 受克 by 月令 or others.
Functional effect: each branch's 十神 representation is "tied up" — cannot fully act as 财/官/印 etc.; 用神 becoming 合绊 = significant negative; 忌神 becoming 合绊 = positive.

**Level 3: 不合 / 合不成 (no combination)** — combination fails to form.
Conditions:
- 隔位 (not adjacent);
- One side clashed away first (冲 stronger than 合);
- 争合/妒合 (one branch fought over by two — e.g. 二寅合一亥).

#### 9.1 (b) Per-pair distinct meaning

**子丑合化土 — "承恩之合 / 泥合 / 克合"**
- Hidden: 子(癸) ↔ 丑(己,辛,癸). 己克癸 (inner clash) but same family (癸 in both). 《三命通會》卷二 论支元六合 by 阴阳数: "子为一阳，丑为二阴，一二成三数...子丑午未各得三者，三生万物."
- Symbol: Mud-water mixing; pragmatic compromise, reluctant alliance ("泥合").
- Reading: "Two minds making do" — pragmatic marriage rather than passionate; best when one party clearly secondary. Reverse-化 special case: when 水 abundant, 子丑 may 化水 (rare).
- Engine: 化土 default; flip to 化水 if 申子辰 / 亥子丑 also present AND 化神 壬癸 透干.

**寅亥合化木 — "破合 / 生合"**
- Hidden: 寅(甲,丙,戊) ↔ 亥(壬,甲). 壬水生甲木 — water nourishes wood. Strongest 六合 to actually 化 (underlying relation is 相生).
- Symbol: Water feeding the forest; nurturing alliance, mentorship. "破合" reading: 寅 takes from 亥 (亥 yields its essence).
- Reading: Powerful partnership, mentor-protégé, capital-meets-vision; one side gives, the other grows. Most stable 化-combination.
- Engine: 化木 high probability when 甲 or 乙 透干.

**卯戌合化火 — "淫合 / 自焚之象 / 桃花合"**
- Hidden: 卯(乙) ↔ 戌(戊,辛,丁). 乙木克戊土, 辛金克乙木, 丁火藏戌. Mechanism: 卯木 thrown into 戌火库 — kindling into oven; 乙木 burns to feed 丁火 latent in 戌.
- Symbol: "Wood entering fire-tomb = self-immolation"; impulsive passion, romance, sometimes secret affair.
- Reading: "主未婚同居" in 盲派 象; classical 桃花 association; romantic intensity but instability. Business: passionate but risky partnerships.
- Engine: 化火 when 丙 or 丁 透干 AND 月令 supports fire.

**辰酉合化金 — "生合 / 真合"**
- Hidden: 辰(戊,乙,癸) ↔ 酉(辛). 戊土生辛金 (土生金). One of the cleanest 生合.
- Symbol: Earth refining metal; quiet productive alliance; institutional partnership.
- Reading: Stable, formal, beneficial; bureaucratic/governmental ties; mentor/superior promotion; durable marriage; gold mined from the field.
- Engine: 化金 high probability when 庚 or 辛 透干.

**巳申合化水 — "刑合 / 害合 / 矛盾合"**
- Hidden: 巳(丙,戊,庚) ↔ 申(戊,庚,壬). 巳申 is BOTH 合 AND 刑 (无恩之刑 sub-component). 合 mechanism: 丙戊庚 → 戊庚壬 sequential generation finally yields 壬水. But 巳火 simultaneously wants to 克 申金 — most internally conflicted 六合.
- Symbol: "Love-hate; fight-then-make-up"; couples who argue and reconcile repeatedly; alliance with friction.
- Reading: Volatile but enduring; 矛盾不断 yet 分不开. Difficult business partnerships, marriages with frequent quarrels. 化水 only if water strongly supported; otherwise 合而不化 with internal damage.
- Engine: 化水 conditional; if not 化, mark as 合绊 with friction.

**午未合化土 / 化火 (日月合 / 明合)**
- Hidden: 午(丁,己) ↔ 未(己,丁,乙). 火生土 strongly; 火土同宫.
- Symbol: Sun-moon meeting (午=日, 未=月 in some readings); open, public alliance.
- Reading: Transparent partnership, mutual support, 实心实意; honorable marriage; public collaboration. Warmest of the 六合.
- Special: Only 六合 where 化土 vs 化火 is genuinely ambiguous in classical sources. 化火 when surrounded by 火 (e.g. 巳午未 三会 also present); 化土 in most other cases.
- Engine: Default 化土; flip to 化火 if 巳午未 present or 丙丁 三透.

---

### CATEGORY 10 — 害 / 破 / 天干冲克 / 刑

#### 10.1 六害 / 六穿 (Six Harms)

Classical mechanism (《三命通會》卷二 论六害): 害 = 冲我合神. "I have a 合-partner; an enemy clashes my partner, breaking my 合 = 害." Each 害 has a unique relational story.

Activation: adjacency required (隔位害 mostly nominal); strength matters (stronger 穿 weaker decisively); 害 between 喜忌 五行 magnifies damage; 用神 being 穿 is severe.

**子未害 — "势家相害" (Power-Family Harm)**
- Origin: 子合丑, but 未冲丑 → 子-未 enmity. Hidden: 子(癸) vs 未(己,丁,乙). 己克癸 directly; strongest water vs strongest dry土.
- 《三命通會》 verbatim: "子未相害者，谓午未旺土，亥子旺水，名势家相害。故子见未则为害."
- Effect: "最不利六亲骨肉" — damages blood relations; spleen/kidney digestive issues; skin allergies (子 旺 → 皮肤过敏); for women, miscarriage risk; chronic family strife.
- Engine weight: HIGHEST among 害, 0.80.

**丑午害 — "官鬼相害" (Office-Ghost Harm)**
- Origin: 丑合子, but 午冲子 → 丑-午 enmity. Hidden: 丑(己,辛,癸) vs 午(丁,己). 丁火克辛金.
- 《三命通會》 verbatim: "丑午相害者，谓午以旺火凌丑死金，名官鬼相害。故丑见午，而午更带丑干之真鬼则为害尤甚."
- Effect: Workplace bullying, dismissals; cardiovascular issues; legal trouble with authorities; if 午 带 真鬼 (e.g. 甲午 day for 己土 person), severity multiplies.
- Engine weight: 0.65.

**寅巳害 — "恃临官相害"** [also overlaps with 寅巳申 三刑]
- Origin: 寅合亥, but 巳冲亥 → 寅-巳 enmity. Hidden: 寅(甲,丙,戊) vs 巳(丙,戊,庚). Each is the 临官/禄 of its own 干.
- 《三命通會》 verbatim: "寅巳相害者，谓各恃临官擅能而进相害。若干神往来有鬼者尤甚，况刑在其中，尤不可不加减灾福言之."
- Effect: Self-injurious ambition; legal-physical danger (drives, surgeries, accidents); medically limbs/joints/spine. Worst when 害 + 刑 simultaneously active.
- Engine weight: 0.75 (elevated due to 刑 overlay).

**卯辰害 — "以少凌长相害" (Junior-Bullies-Senior Harm)**
- Origin: 卯合戌, but 辰冲戌 → 卯-辰 enmity. Hidden: 卯(乙) vs 辰(戊,乙,癸). 乙木克戊土 (live wood crushes wet earth).
- 《三命通會》 verbatim: "卯辰相害者，谓卯以旺木凌辰死土，此以少凌长相害."
- Effect: Resentful subordinates, rebellious juniors, in-law tensions; digestive issues (脾胃=辰土); gynecological/fertility for women (辰=水库 affected); reputation hits from family scandals.
- Engine weight: 0.55.

**申亥害 — "争进相害" (Competitive-Rivalry Harm)**
- Origin: 申合巳, but 亥冲巳 → 申-亥 enmity. Hidden: 申(戊,庚,壬) vs 亥(壬,甲). Both contain 壬 — same-element competition.
- 《三命通會》 verbatim: "申亥相害者，谓名恃临官，竞嫉才能，争进相害。故申见亥，亥见申均为害，更纳音相克者重."
- Effect: Rivalry with peers/colleagues of similar caliber; jealous competitors; 驿马 → trips ending in disputes; respiratory/renal issues. Often manifests as "frenemy" dynamic.
- Engine weight: 0.60.

**酉戌害 — "嫉妒相害" (Jealousy Harm)**
- Origin: 酉合辰, but 戌冲辰 → 酉-戌 enmity. Hidden: 酉(辛) vs 戌(戊,辛,丁). 戌中 丁 克 酉 辛.
- 《三命通會》 verbatim (with direction asymmetry): "酉戌相害者，谓戌以死火害酉旺金，此嫉妒相害。故酉人见戌则凶，戌人见酉无灾；若乙酉人得戊戌，乙为真金，戊为真火，为害尤甚."
- Effect: Petty backbiting, gossip, betrayal by close associates; facial skin issues ("面部易生暗疮"); reputation undermining; in historical analyses, "奸臣命多带此害".
- Engine weight: 0.55, but ASYMMETRIC — score higher when 酉 is the affected branch.

#### 10.2 六破 (Six Breaks) — RANK 4, with classical dissent

Classical pairs: 子酉, 午卯, 寅亥, 申巳, 辰丑, 戌未. Origin: each branch is the "4th order" from the other on certain divisional schemes (《五行精纪》, 《阴符经》, late 子平 compendia).

**Classical authority is sharply divided:**
- 《淵海子平》 — does NOT list 六破 (full-text confirmed).
- 《三命通會》 — mentions but does not elaborate.
- 任铁樵 《滴天髓阐微》 verbatim: "至于破之义，非害即刑也，尤属不经，削之可也."
- 盲派 traditions (mostly oral) — emphasize 破 as a hidden-undermining mechanism. Most operational use is from 盲派.

**Per-pair (盲派 reading):**
- **子酉破** — same-yin generation that "doesn't want to" generate; reluctant金水 help; "无主见，自破自行"; office politics. Poem: "子见酉上破败神，自行无道损名身."
- **午卯破** — generation reluctant (木生火 cross-purposes between two cardinals); domestic conflict, household财破.
- **寅亥破** — overlay on 寅亥合: "生中带破" — small concealed cracks within an otherwise good combination.
- **申巳破** — overlay on 申巳合+刑: "合中带破", most internally conflicted of all interactions.
- **辰丑破** — same-element 土 internal破; "金沙入海，掩亮无光"; obscured talent.
- **戌未破** — same-element 土 internal破; "古庙陈坛"; old-grudge family land disputes.

**Engine recommendation**: weight 破 at most 0.20 of equivalent 害 weight; FLAG as low-confidence / classical-contested; expose user toggle.

#### 10.3 天干冲克 (Heavenly-Stem Clash/Control)

**七冲 (4 pairs of same-yin / same-yang opposites):**

**甲庚冲** — 阳木 vs 阳金, 庚克甲 decisive. Effect: head/face/limbs injury, liver/gallbladder; career: blunt-force confrontation, military, surgery. Weight: 1.00.

**乙辛冲** — 阴木 vs 阴金, 辛克乙 decisive but less violent. Effect: joints/sinews; immune system; subtle but persistent attrition; design-vs-critique conflicts. Weight: 0.85.

**丙壬冲** — 阳火 vs 阳水, 壬克丙. Effect: heart/blood/eyes; face paralysis risk; cardiovascular events; high-profile-vs-investigator dynamic. Weight: 1.00.

**丁癸冲** — 阴火 vs 阴水, 癸克丁. Effect: heart palpitations, anxiety, hidden infections; subtle emotional warfare; secret-affair exposure. Weight: 0.85.

**Note on 戊甲 / 己乙 / 庚丙 / 辛丁 / 壬戊 / 癸己** — these are 克 (control), not 冲 (clash). They are bidirectional control relationships used in 格局 analysis (e.g. 食神制杀 = 食神干 克 七杀干). Engine should track as "stem 克" with lower weight than 七冲, ~0.40-0.60.

#### 10.4 三刑 (Punishments)

Classical foundation (《阴符经》 via 《三命通會》卷二 论三刑): "三刑生于二合" — three punishments arise from combinations. Mechanism: align each 三合 with its 三会 → mismatches yield 刑.

**寅巳申 — 无恩之刑 (Ungrateful Punishment)**
- Mechanism (《三命通會》 verbatim): "寅中有甲木刑巳中戊土，戊以癸水相合为要，则癸水者，甲木之母也；戊土既为癸水之夫，乃甲之父也，彼父而我刑之，恩斯忘矣。巳中之丙刑申中之庚，申中之庚刑寅中之甲，准此同义." (My father-in-law I strike — gratitude forgotten.)
- Activation: 三字全 strictest reading (《三车一览》 派); 二字 sufficient in 《三命通會》 mainstream. Adjacency strengthens; 合 on any one branch (e.g. 巳与申合) reduces 刑.
- Effect: Betraying benefactors, mentors, parents; legal trouble from ingratitude; for women, miscarriage risk ("多产血损胎之灾").
- Engine: 二字 = 0.60, 三字全 = 1.00; flag if any of the three is in 合.

**丑戌未 — 恃势之刑 (Power-Bullying Punishment)**
- Mechanism (《三命通會》 verbatim): "丑恃旺水之势以刑戌中之火，戌恃辛金之势以刑未中之木，未恃丁火之势以刑丑中之金" — each 土 uses its hidden weapon to bully the next.
- All three are 土 (兄弟); the punishment is sibling-to-sibling betrayal using inherited power. 《三车一览》 派 calls this 无恩 instead — classical schools disagree.
- Activation: 三字全 strongly; 二字 conditionally.
- Effect: Power abuse, leveraging position for harm; legal trouble from authority misuse; for women, "妨害孤独" (isolation harm).
- Engine: 二字 = 0.55, 三字全 = 1.00.

**子卯 — 无礼之刑 (Rude Punishment)**
- Mechanism (《三命通會》 verbatim): "水能生木，则子水为母，卯木为子，子母自相刑。又云：子中独用癸水，癸用戊土为夫星而败于卯，所以子刑卯；卯中独用乙木，乙用庚金为夫星而死于子，所以卯刑子。此二家因夫见刑，女命见之，尤为不良，故曰无礼."
- Activation: 二字相邻 (only 2 branches involved — easiest to trigger).
- Effect: Disrespect to elders, lewd behavior, breakdown of social manners; for women, particularly harmful — marriage trouble.
- Classical dissent: 任铁樵 verbatim: "子刑卯，卯刑子，是谓相生，何以相刑？" — rejects entirely.
- Engine: 0.50; toggle for "子平真诠 strict 派" vs "三命通會 traditional 派".

**自刑 (Self-Punishment)**: 辰辰, 午午, 酉酉, 亥亥.
- Mechanism (《三命通會》 verbatim): "辰者水之墓，滔则盈；午者火之旺，暴则焚；酉者金之位，刚则缺；亥者水之生，旺则朽。各禀已盛太过之气而自致祸，故曰自也."
- 任铁樵 dismisses verbatim: "本支见本支，自谓同气，何以相刑？俗谬，姑置之."
- 辰辰自刑: water-tomb overflow; emotional flood, hidden grief.
- 午午自刑: fire-旺 burns itself out; impulse self-destruction.
- 酉酉自刑: metal too sharp breaks; perfectionism leading to breakdown.
- 亥亥自刑: water-生 corrupts ("旺则朽"); over-thinking, decision paralysis.
- Engine: 0.40 each.

---

## Recommendations

### Implementation: weighted scoring template

For each detected interaction, apply:

```
score = base_weight × adjacency_factor × strength_factor × clash_interference × hidden_stem_match × xi_ji_alignment
```

- `adjacency_factor`: 紧贴=1.0, 隔位=0.7, 遥=0.3 (proposed; classical text confirms tiered reduction but not numerical coefficients)
- `strength_factor`: 旺神冲衰=1.2 (with damage sign), 衰神冲旺=0.5 ("旺神发"), 均势=1.0
- `clash_interference`: if combination interferes with clash via 合解, multiply by 0.3–0.6
- `hidden_stem_match`: weight up if 喜神/忌神 of the chart appears in hidden stems of the affected branch
- `xi_ji_alignment`: positive sign if outcome favors 喜神; negative if hits 用神

### Staged rollout

**Stage 1 (immediate)**: Replace copy-paste text in 六冲, 六合, 六害 with the per-pair narratives above. These are the highest-confidence categories.

**Stage 2 (next sprint)**: Build the conditional resolution engine — 合解冲, 通关, 隔位 dampeners. Test against 《子平真詮》第七章 verbatim cases.

**Stage 3 (future)**: Add 破 and 自刑 as low-weight, user-toggle-able overlays with classical-dissent flags surfaced in UI. Add the "盲派 vs 子平真诠派" interpretation switch.

### Threshold-based weight escalation triggers

- If any pair on 日柱 (the self-pillar) → multiply pair's coefficient by 1.3.
- If pair involves the 用神 directly → multiply by 1.5.
- If pair triggered by 流年/大运 instead of 原局 → use 0.7 coefficient for one-cycle duration.
- If 透干 of relevant hidden stems → multiply 库冲 result by 1.4 (signals "real opening").

### Customer-facing narratives — Thai / English / Chinese (samples)

The engine should template-store the full 6+8+6+12+6+4 = 42-cell grid. Below are anchor narratives for each category.

#### 六冲 narratives

**子午冲**
- **ไทย**: คู่ปะทะน้ำ-ไฟอันรุนแรงที่สุดในระบบ จิตใจของท่านมักวนระหว่างความเย็นและความร้อน ความคิดและอารมณ์ ทำให้ชีวิตไม่สงบ ระวังโรคหัวใจและไต ปีที่กระทบ用神 อาจมีการเปลี่ยนงานหรือย้ายที่อยู่กะทันหัน
- **EN**: The purest water-fire clash in the system. Your mind oscillates between cold reason and hot emotion, producing inner restlessness and frequent shifts of direction. Watch heart and kidney health, and expect sudden relocations or career pivots in years that activate this clash.
- **中文**: 水火相冲，最为纯粹激烈。命主内心动荡，理性与情绪反复拉扯，一生难安。需注意心脏、肾脏与情绪管理；流年引动时，常见突然的迁移、转职或感情风波。

**丑未冲**
- **ไทย**: ดินเปียกชนดินแห้ง คลังทรัพย์ทั้งคู่เปิดพร้อมกัน ทุกอย่างขัดข้องและล่าช้า แต่หาก天干透出ทรัพย์/บริวาร อาจเปิดคลังนำโชค พึงระวังเรื่องครอบครัว มรดก ระบบย่อยอาหาร
- **EN**: Wet earth meets dry earth — two storages crack open at once. Life feels chronically obstructed and slow-grinding, but if your 天干 reveals wealth, authority or seal, this clash can "open the vault" beneficially. Watch family/inheritance disputes and digestive health.
- **中文**: 湿土遇燥土，两库齐开。诸事多阻多迟，磨人意志；但若天干透财官印，反成"冲开库"之福。需留意家族遗产纠纷、脾胃健康，事缓则圆。

**寅申冲**
- **ไทย**: คู่ม้าใช้ (驿马冲) — แรงกระทบที่นำการเดินทาง โยกย้าย เปลี่ยนเมือง เปลี่ยนงาน ทั้งที่อยู่และอาชีพมักเปลี่ยนพร้อมกัน ระวังอุบัติเหตุระหว่างเดินทาง และความขัดแย้งกับเจ้านายหรือเพื่อนร่วมงาน
- **EN**: A "post-horse" clash — kinetic energy that pushes you toward travel, relocation, and career change. Often both residence AND occupation shift together. Guard against transit accidents and friction with superiors or close peers.
- **中文**: 驿马相冲，主奔波动荡，居住与职业常同步变迁。利于经商出行，但易招意外。命主好管闲事，多情多事；流年引动时，宜动而非守。

**卯酉冲**
- **ไทย**: ตะวันออกชนตะวันตก ไม้พ่ายโลหะ — ความสัมพันธ์รักไม่มั่นคง ดอกท้อก่อภัย คำพูดผิดสัญญา ระวังตับ ปอด เส้นเอ็น สำหรับสตรี ตำแหน่งนี้ที่日支หรือ时支มักหมายถึงการแต่งงานที่ไม่ราบรื่น
- **EN**: East meets west, wood loses to metal — unstable romance, peach-blossom chaos, broken promises. Watch liver, lungs, joints. For women, this clash on the day or hour pillar especially signals marital turbulence and recurring reputational risk.
- **中文**: 木金交战，最伤情。命主多情多波折，桃花虽盛却伤身损福。诗云"背约失信，色情纠纷"；女命日时见之，婚姻多有反复。注意肝肺与筋骨。

**辰戌冲**
- **ไทย**: ประตูฟ้า-ประตูดิน — ขัดแย้งเรื่องที่ดิน อสังหาริมทรัพย์ ขัดแย้งกับลูกน้องหรือบริวาร แต่ผู้มีคู่นี้มักมีความเป็นผู้นำ "หัวหน้าหน้าตา" ระวังการสูญเสียคนใกล้ตัวและคดีความ
- **EN**: Heaven-gate clashes earth-gate. Property disputes, real-estate moves, conflict with subordinates or family — yet bearers of 辰戌全 命局 are often leaders ("头有面之命"). Watch for legal disputes, loss of close kin, and shifting career identity.
- **中文**: 天罗地网相冲，争讼打斗多见，奴仆易散。然辰戌全者多为头脸之命，主领袖才。命主一生与土地、房产、契约相关；防官司是非与近亲损耗。

**巳亥冲**
- **ไทย**: คู่ม้าใช้ (驿马冲) — เดินทางไกล จากบ้านเกิด ใจอ่อนปากแข็ง ชอบช่วยคน เหมาะแก่การศึกษาศาสนา ปรัชญา ระวังโรคหลอดเลือดและทางเดินปัสสาวะ
- **EN**: A second "post-horse" clash — distance from ancestral home, restless wandering, soft-hearted but sharp-tongued. Strong inclinations toward religion, philosophy, study abroad. Watch cardiovascular and urinary health.
- **中文**: 巳亥水火相冲，又为驿马，主离祖远游，一生奔波；心软嘴硬，好助人，宜学佛习道。注意心脑血管及泌尿系统疾病。

#### 三合 局 sample

**寅午戌 三合火局**
- **ไทย**: คณะไฟครบสามขา — กลุ่มที่ลุกโชนแห่งความหลงใหล วิสัยทัศน์และความเร็ว เหมาะกับงานบันเทิง สื่อ การตลาด การทหาร พลังงาน เริ่มแรงจบเย็น ระวังการเผาตัวเอง โดยเฉพาะหาก庚 (七杀) 透干
- **EN**: Full fire trinity — passion, vision, executive velocity. Suited to entertainment, media, marketing, military, energy. "Hot at the start, cool at the end" — guard against burnout, especially if 庚金 (seven killings) appears in your stems alongside abundant wood.
- **中文**: 寅午戌全成火局，主热情果决，行动迅捷。利演艺、传媒、营销、军警、能源诸业。前热后冷，须防身心透支；若庚金透干又见甲乙，更要防"自焚之患"。

#### 三会 方 sample

**亥子丑 北方水方**
- **ไทย**: น้ำเหนือรวมกันเต็ม — พลังแห่งความลึกซึ้ง ความรู้และความลับ เหมาะกับนักวิจัย นักปรัชญา ข่าวกรอง การเงิน ของไหล ระวังโรคหวัด เลือดเย็น และความเก็บตัวมากเกินไป
- **EN**: Full northern water assembly — depth, wisdom, secrecy. Suited to research, philosophy, intelligence work, fluids, finance. Watch cold/damp-related illness; introversion can become isolation.
- **中文**: 亥子丑会北方水局，主深沉智慧、好静好藏。利学术、哲思、情报、金融、流体相关行业。需防寒湿之疾，亦防孤僻自闭。

#### 六合 sample

**寅亥合化木**
- **ไทย**: คู่ส่งเสริม น้ำเลี้ยงป่า — เป็นพันธมิตรที่มั่นคงที่สุดในระบบหกคู่ ผู้ใหญ่อุปถัมภ์ ครู-ลูกศิษย์ ทุนพบวิสัยทัศน์ หาก化神 (木) ปรากฏที่天干 จะกลายเป็นพลังขับเคลื่อนหลัก
- **EN**: The most stable of the six harmonies — water nourishing wood. Mentorship, sponsorship, capital meeting vision. When 甲 or 乙 appears in your stems, this combination actually transforms into wood, becoming a primary driver of growth in your chart.
- **中文**: 六合中最稳定的一对，水生木，相生而合。主提携关系、师徒情、资本与理想结合。若甲乙透干，则真化为木，成为命局主推动力。

**巳申合化水 (刑合)**
- **ไทย**: คู่รักเกลียด — ทั้งร่วมมือทั้งทะเลาะ คู่นี้合化水ได้ยากเพราะมีลักษณะคู่แย้ง (合+刑) เหมาะกับงานที่ต้องการการเจรจาต่อรองตลอดเวลา ระวังหุ้นส่วนที่ขัดแย้งบ่อย
- **EN**: A "love-hate" combination — combination overlaid with punishment (合+刑). Hard to truly transform to water; expect alliances marked by frequent quarrels and reconciliations. Suited to negotiation-heavy work; watch volatile partnerships.
- **中文**: 巳申既合又刑，矛盾合也。难真化为水，往往合而不化，主关系反复、又爱又恨。利谈判调停之业，须慎选合伙人。

#### 六害 sample

**子未害 — 势家相害**
- **ไทย**: คู่กระทบครอบครัว สองพลังใหญ่ปะทะกันจาก藏干 (癸ปะทะ己) ทำลายเลือดเนื้อเครือญาติมากกว่าทำลายงาน ระวังพี่น้อง พ่อแม่ ระบบเลือดและผิวหนัง
- **EN**: A "power-family harm" — two strong inner forces collide. This 穿 damages blood relations more than career; expect strained ties with parents, siblings, in-laws. Watch blood-related conditions and skin allergies. For women, fertility flags.
- **中文**: 势家之害，最伤六亲骨肉。命主与父母、兄弟、配偶常有暗中拉扯；皮肤过敏、血液与肾脏宜常调理。女命见之，更须留意妇科与子嗣。

**酉戌害 — 嫉妒相害**
- **ไทย**: คู่อิจฉา — ภัยจากเพื่อนสนิทที่นินทาลับหลัง เสียชื่อเสียง โดยเฉพาะคนเกิดปี酉เจอเดือนหรือวัน戌 ผลรุนแรง (ในขณะที่戌เจอ酉ไม่กระทบมาก) ระวังโรคผิวหนังบนใบหน้า
- **EN**: A "jealousy harm" — betrayal by close associates through gossip and undermining. Importantly asymmetric: 酉-born meeting 戌 suffers severely; 戌-born meeting 酉 sees little harm. Watch facial skin conditions and reputational sabotage.
- **中文**: 嫉妒之害，多由身边人暗害。此害有方向性："酉人见戌则凶，戌人见酉无灾"。命主防小人构陷、面部暗疮，事业上多遭背后非议。

#### 三刑 sample

**寅巳申 三刑 — 无恩之刑**
- **ไทย**: คู่ลืมบุญคุณ — สามแขนงพันธมิตรกลายเป็นคู่ปะทะ ระวังการทรยศโดยคนที่เคยช่วยเหลือ ระวังคดีความจากการเนรคุณ และอุบัติเหตุทางการแพทย์ (ผ่าตัด) สตรีระวังการแท้งบุตร
- **EN**: "Ingratitude punishment" — what should have been mutual support becomes betrayal of benefactors. Watch for legal trouble arising from broken loyalty, and surgical/medical procedures. Women face elevated miscarriage risk in years that activate this trio.
- **中文**: 无恩之刑，恩反成怨。命主易遭恩人反目，或自身忘恩于人；多见手术、官司、交通意外。女命见之，须防胎产之灾。三字俱全者，影响最重。

#### 自刑 sample

**亥亥自刑**
- **ไทย**: น้ำมากจนเน่า — ความคิดมากเกินไปจนตัดสินใจไม่ได้ ลังเลเรื้อรัง คิดวกวน ระวังภาวะซึมเศร้าและการพึ่งสุรา
- **EN**: "Water at its source becomes corrupted (旺则朽)" — over-thinking that paralyzes decision; chronic indecision; recursive worry. Watch depression and substance dependence.
- **中文**: 亥亥自刑，谓"旺则朽"，思虑过度反成内耗。命主优柔寡断，思绪缠绕；需防情绪低落及借酒消愁。

---

## Caveats

1. **Classical authority disputes are real and large.** 任铁樵 (in 《滴天髓阐微》) explicitly rejects 自刑, 子卯刑, and 六破 as "俗谬" / "不经". 《子平真诠》 沈孝瞻 sets 三刑 aside as "姑且阙疑": "至于三刑取义，姑且阙疑，虽不知其所以然，于命理亦无害也." 《淵海子平》 omits 六破 entirely. The engine MUST NOT treat 破 and the contested 刑 as equally weighted to 冲 and 合. Recommend per-category trust-coefficients and a UI toggle for "传统派" vs "子平真诠派" interpretation.

2. **Hidden-stem 藏干 weights vary across schools.** Different 子平 schools (盲派 vs 子平真诠派 vs modern 台湾派) assign slightly different 藏干 weights, especially for 午 (some give 己 100% bonus, others count only 丁 本气) and 寅 (some emphasize 丙 余气 more strongly). The per-pair text above uses the mainstream 《三命通會》 / 《命理探原》 assignment.

3. **化 conditions are interpreter-dependent.** Whether 化 is "true" or 合而不化 is one of the most disputed judgment calls. Common practice: if your engine cannot make a confident determination, return BOTH the 化 result and the 合绊 result with confidence flags, rather than forcing a binary.

4. **"驿马" reading of 寅申巳亥 clashes** is a secondary doctrine layered on top of the primary five-element analysis. It applies even when the clash is "resolved" — the 动 (movement) 象 lingers as a propensity even without active damage.

5. **Modern simplifications drift from classics.** Many online sources flatten per-pair distinctions, producing exactly the copy-paste problem the user is solving. The per-pair text above is intentionally anchored to 《三命通會》 卷二 verbatim, 《命理探原》〈六冲〉 章, and 《滴天髓》 任氏 commentary — not to modern paraphrases.

6. **"各专一方之气" attribution caveat.** The phrase commonly cited as if from 《三命通會》 (e.g. "寅卯辰乃东方属木，巳午未南方属火...各专一方之气") is actually best attributed to the 《子平真诠》 system and 徐乐吾 evaluative tradition; 《三命通會》 卷二 has no chapter titled "论三会" and does not contain this exact wording. When the engine surfaces source citations to the user, label this attribution carefully.

7. **The phrase "贪合忘冲" is not classical verbatim.** It is a 民国-era口诀 extension of 《淵海子平·论偏官》's "贪合忘煞". The doctrine is sound; the wording is folk. Do not cite a fictional classical source for it.

8. **三合 化 requires the full trio, per 三命通會 explicitly.** "若三字缺一则化不成局" — half-combinations do NOT 化 by themselves. The engine should be strict on this: 半合 produces strength-modifications and 合绊 effects, never 化, unless promoted to full 三合 via 大运/流年 引动.