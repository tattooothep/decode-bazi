# 續道藏《紫微斗數》三卷 — working notes for AI use

Source identity:
- Work: 紫微斗數, 《正統道藏》本, 續道藏, 三卷.
- ctext e-text: https://ctext.org/wiki.pl?if=gb&res=979714
- ctext facsimile: https://ctext.org/library.pl?if=gb&res=85160
- Wikisource transcription: https://zh.wikisource.org/zh-hant/紫微斗數
- Kanripo text line: https://github.com/kanripo/KR5h0055
- ctext URNs found from public pages: work `ctp:wb979714`; chapters `ctp:ws729141`, `ctp:ws747849`, `ctp:ws848348`.
- ctext library metadata says the facsimile is in 《正統道藏》第1114-1115冊, 續道藏, 三卷, and the wiki e-text is OCR-matched to that base.
- Local source witnesses: ctext cleaned chapters, Kanripo text, and Wikisource `紫微斗數` transcription are retained under `private/restricted-sources/ziwei/public-domain/`.

Use level:
- This is a related/independent lineage, not the same operating text as the modern 14-main-star 紫微斗數全書 tradition.
- Use as interpretive support for reading order, timing discipline, and minor/十八飛星 vocabulary.
- Do not use it to alter current engine 安星 tables unless a separate Daoist-canon lineage packet is created.

## Verified contents

The ctext table of contents for 卷一 includes:
- 論次序
- 照膽經四言十八飛星直指序
- 十二宮分
- 四星分宮
- 順排流年例
- 凶十八星於十二宮歌
- 起紫微例
- 安命例
- 安身例
- 起大限例
- 起小運例
- 論大小限
- 一命宮 through 十二相貌宮
- 十八星所屬

卷二 includes 太乙金井局陰陽玄妙論, 骨肉三局賦, 定諸宮分合.

卷三 is mostly star-by-star and limit/year readings for the Daoist-canon star set, including 貫索, 文昌, 天福, 天祿, 天虛, 天刑, 天哭, and related palace/limit judgments.

## Rules extracted for prompt behavior

### 1. Reading order is multi-layered

The Daoist-canon text opens with a strict sequence: set time, derive eight characters, establish structure, place stars, set 命, start major luck, start 大限, write transformations, write likes/avoidances, then judge good/bad.

Prompt rule:
- The AI must not judge from one star alone.
- Use packet layers in this order: birth/time validity, natal palace/star structure, 身宮, 三方四正, 四化, 大限, 流年.
- This supports the existing packet-first guard and strengthens the reason to use 大限四化/流年四化 when available.

### 2. 身命 and 三方四正 are central

卷一 says 命宮 stars, 三方四正, and 運限生剋 are part of the core check. 卷二 says to first settle 身宮 and then push 命宮/time depth; good stars with 祿旺 and 得地 can make a clear/noble chart, but weak timing or poor placement reduces effect.

Prompt rule:
- Read 命宮 and 身宮 together.
- Any claim about career, money, movement, spouse, or health should be tied back to the relevant palace plus 三方四正 if packet supplies it.
- If the packet lacks a field, state unavailable instead of calculating inside the AI answer.

### 3. Timing requires 大限 plus 流年

卷一 has 起大限例, 起小運例, 論大小限, and 順排流年例. Its order explicitly includes 流年星宮 after 運限. 卷二 says 行限所遇善星/惡星 affects the concrete good/bad event.

Prompt rule:
- 大限 is the decade environment.
- 流年 is the annual trigger.
- Use supplied 大限四化, 流年四化, 流月四化, 流日四化, corresponding 流曜, and 流年/流月/流日命宮. Do not replace natal structure with timing, and do not invent timing layers absent from the packet.

### 4. Annual stars are not decoration

The Daoist-canon text lists a 12-step annual sequence: 太歲, 太陽, 喪門, 太陰, 官符, 死符, 歲破, 龍德, 白虎, 福星, 吊客, 病符. It repeatedly phrases judgments as 運限/流年 meeting a star.

Prompt rule:
- If the packet includes annual stars, mention at least the annual stars touching 命宮, 夫妻, 財帛, 官祿, 疾厄, or the asked palace.
- If annual stars are absent, do not pretend year-level trigger details are available.

### 5. 十八飛星 vocabulary is a variant layer

卷一 has 凶十八星於十二宮歌 and 十八星所屬. The listed Daoist-canon set includes names such as 紫微, 天虛, 天貴, 天印, 天壽, 天空, 紅鸞, 天庫, 天貫, 文昌, 天福, 天祿, plus 天杖, 天異, 毛頭, 天刃, 天姚, 天刑, 天哭.

Prompt rule:
- Treat these as a related 十八飛星 vocabulary layer.
- Do not claim this is the full later 十八飛星策天全集 lineage.
- If modern packet stars overlap by name, use the general meaning carefully, but do not import palace placements from the Daoist-canon text.

### 6. Minor-star reminders from Daoist-canon chapter 3

Use only when packet supplies the star:
- 天福: auspicious support, ease, blessings, safety through difficulty, especially when clean and supported.
- 天祿: gain, fulfillment, official/resource benefit, easier completion of plans.
- 天虛: emptiness, false alarm, depleted name/profit, hollow outcomes, worry; stronger when tied to 刑/哭/姚/刃.
- 天刑: law, punishment, cutting, military/authority, injury or official trouble; can become status/authority if supported by good stars and strong placement.
- 天姚: desire, charm, romantic/social entanglement; can bring pleasure or trouble depending on support.
- 天哭: grief, mourning, dangerous emotional/health drain when it hits limits or annual triggers; do not overstate unless repeated by other bad indicators.

## Operational warning

ctext permits reading/citation but warns against automated bulk download of many pages. The local corpus keeps one cleaned three-chapter witness for this single work, the Kanripo line, and the Wikisource transcription plus concise operational notes. Do not quote raw source text in user-facing readings.
