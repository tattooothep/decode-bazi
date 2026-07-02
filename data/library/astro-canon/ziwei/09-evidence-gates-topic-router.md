# 紫微斗數 · Evidence Gates And Topic Router

> Runtime derived summary for Fusion Zi Wei. This pack coordinates the existing public-domain, Daoist Canon, Quanshu, Feixing, and licensed collation packs. It is not a raw source transcription.

## Source Scope

- Core public-domain lineage: 紫微斗數全書, 續道藏/道藏本, Kanripo, ctext/Wikisource/IA witnesses.
- Licensed/internal lineage: 飛星策天 extraction and modern licensed collation packs.
- Scan witnesses: 飛星紫微斗數原旨 and 紫微斗數方書 are retained as source witnesses unless a clean runtime rule extraction exists.
- Use only extracted operational summaries in user readings. Do not quote, cite, summarize page-by-page, expose OCR, source prose, page order, or file paths.

## First Route The Question

Classify the question before reading:

1. **Natal single chart**: 命宮, 身宮, 五行局, main stars, brightness, 三方四正, 生年四化, 12 palaces.
2. **Topic reading**: asked palace and its 三方四正, then 生年四化, 大限, 流年.
3. **Timing / future year**: 大限 first, then 流年, then 流月/流日 only when supplied.
4. **Pair / compatibility**: each natal chart first, then only `PAIR_INTERACTION_PACKET ziwei`.
5. **Month/day choice**: use 流月/流日 packet. No 流時 is currently available unless supplied.
6. **No-time chart**: close 命宮/12宮/大限-based claims when packet says birth time is missing or degraded.

Do not answer from one star alone. Do not answer timing from natal personality alone when timing fields are present.

## Evidence Chain For Any Verdict

Use this order:

1. 命宮 + 主星 + brightness and borrowed opposite palace if 命無主星.
2. 身宮 and how it shifts life focus.
3. Asked palace and its 三方四正.
4. 生年四化 landing by palace.
5. 大限 palace and 大限四化.
6. 流年 palace, 流年四化, and annual stars.
7. 流月/流日 triggers only as short-window activation.
8. Rescue/friction balance: 吉星/輔弼/昌曲/魁鉞/祿權科 versus 羊陀火鈴/空劫/天刑/化忌/大耗.

If evidence is mixed, split the answer into support, friction, and final verdict. Do not let one lucky star erase a repeated obstruction.

## Topic Gates

### Career / 官祿

Use 官祿, its 三方四正, 命宮, 財帛, 遷移, 大限/流年, 化權/化科/魁鉞/昌曲.

Strong career verdict needs repeated support:
- 官祿 has strong main stars or supportive borrowed/opposite structure,
- 化權/化科/魁鉞/昌曲 touches 官祿/命/遷移,
- 大限 or 流年 activates 官祿/遷移/財帛,
- malefic pressure is either rescued or clearly manageable.

If 官祿 has pressure plus support, say "โตจากภาระ/ความรับผิดชอบ" rather than flat good or bad.

### Money / 財帛 and 田宅

Use 財帛 for cash flow, 田宅 for retained assets/property, 官祿 for income channel, 福德 for spending/comfort, 化祿/祿存/科 for resource support, 忌/空劫/大耗 for leakage.

Separate:
- earning,
- saving/retaining assets,
- property/home base,
- documents/contracts,
- leakage/repairs/debt.

Do not call wealth from 化祿 alone if 財帛/田宅 are repeatedly hit by 忌/空劫/大耗.

### Relationship / 夫妻

Use 夫妻 palace, its 三方四正, 命宮/身宮 temperament, 福德 emotional comfort, 生年/大限/流年四化, 紅鸞/天喜 as triggers only.

Separate:
- attraction,
- stability,
- pressure/control,
- family/home support,
- timing readiness.

Do not declare marriage/divorce from one 紅鸞, one 天喜, one 化祿, or one overlay.

### Health / 疾厄

Use 疾厄, 命宮, 身宮, 福德, 煞/忌/空劫/天刑 repetition, and rescue stars such as 化科/天梁/天府/魁鉞.

Allowed wording: stress signal, check-up, rest, routine, risk management, treatment support.

Forbidden wording: diagnosis, fixed disease, death prediction, surgery instruction, medication advice, or replacing clinicians.

### Home / Property / Family 田宅

Use 田宅, 財帛, 福德, 父母/document links, 化祿/科/魁鉞 for support, 忌/空劫/大耗/煞 for repair or contract burden.

If 流年命宮 lands at 田宅, the year revolves around home/family/property even if the topic is broad. Still check 財帛 and 官祿 before promising purchase or gain.

### Movement / Outside World 遷移

Use 遷移, 官祿, 命宮, 天馬, 祿/權 support, 忌/羊陀/空劫 friction.

Separate travel, relocation, outside clients, public exposure, distance relationship, and public pressure.

## Timing Gate

If packet supplies 大限/流年/流月/流日, use them. Do not say they are missing.

For future-year answers:

1. Name the 大限 age range and decade palace.
2. Name the 流年 year palace.
3. Name the main 四化/annual-star trigger.
4. Connect the trigger to the asked palace.
5. Use 流月/流日 only for short windows and only when supplied.

Day/month triggers are weak without natal + 大限 + 流年 support. Use them for action timing, not as standalone fate.

## Pair Mode Gate

Use only the supplied `PAIR_INTERACTION_PACKET ziwei`.

Read pair in this order:

1. A natal 命/身/夫妻 and B natal 命/身/夫妻.
2. 命宮 relation between A and B.
3. A 夫妻 to B 命 and B 夫妻 to A 命 when packet supplies it.
4. `crossSiHua`: who emits the transformation, which star/type, where it lands in the other chart.
5. focal palace overlap for 命, 夫妻, 財帛, 官祿, 福德.
6. timing readiness from each person's 大限/流年.

Pair verdict categories:

- supportive: reciprocal 祿/科 or spouse-life relation with tolerable pressure.
- sticky/karmic: attraction plus 忌/煞 pressure.
- uneven: one side receives help while the other receives pressure.
- timing-not-ready: natal support exists but decade/year does not support commitment yet.

Do not invent cross-palace reactions, crossSiHua, or spouse overlays from star names outside the packet.

## Main-Star Matrix Gate

Use `05-main-star-topic-matrix` as topic language only after the packet confirms:

- star name,
- palace,
- brightness,
- supporting/malefic companions,
- 四化/timing context.

Do not describe a main star as if it alone determines the topic. A fallen star with strong 化科/魁鉞 rescue and supportive timing is not the same as a fallen star under 忌/煞 repetition.

## No-Time Mode

If birth time is absent or degraded:

- Do not use 命宮, 身宮, 12宮, 大限 palace, borrowed opposite palace, or palace-specific main-star claims unless packet explicitly supplies a reliable fallback.
- You may use year stem 四化 or general year-born pattern only if packet supplies it.
- Keep the answer useful by naming what can still be read and what cannot, without dumping unrelated missing layers.

## Output Contract

Every Zi Wei answer should include:

1. one 命宮/身宮 baseline,
2. one asked-palace line,
3. one 四化 line,
4. one 大限/流年 timing line when timing matters,
5. one support-versus-friction split,
6. one practical recommendation tied to the same evidence.

Do not output source audits, readiness percentages, book/source names, raw OCR, or broad textbook definitions in user readings.

