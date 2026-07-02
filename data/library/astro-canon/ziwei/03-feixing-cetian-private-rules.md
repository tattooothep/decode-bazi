# 紫微斗數 · private 飛星策天 rule pack

Source identity:
- Private intake: Kyujanggak/SNU GI40495_00, 飛星策天紫微斗數全集, six fascicles, 214 page images.
- Internal OCR path: `private/restricted-sources/ziwei/ocr/kyujanggak-GI40495_00/`.
- Supporting open collation: Kanripo KR5h0055 / 續道藏《紫微斗數》, and IA metadata/OCR for 新鋟希夷陳先生紫微斗數全書.

Use level:
- Licensed internal operational rule pack for user readings. Use the extracted rules as real interpretation authority when reading a user's chart.
- Do not quote, reproduce, cite, summarize page-by-page, or expose raw OCR/source text to the user.
- The user-facing answer may apply these rules to explain life, timing, relationship, career, money, health-risk signals, and practical advice, but must not name the private source or reveal its contents.
- Do not replace the current 14-main-star engine or move stars inside the AI. The packet remains the only source of actual placements.
- In plain terms: the book is usable for divination inside the website; it is not usable as visible source text in the answer.

## What this pack changes

This pack makes Zi Wei answers stricter and more decisive in five places:
1. separate natal promise from timing triggers,
2. separate 生年四化, 大限四化, and 流年四化,
3. use supplied annual stars as real triggers, not decoration,
4. use 流月/流日 detail only when the packet supplies explicit 流月/流日 fields; otherwise stop at 大限/流年,
5. give a clear verdict from supplied evidence instead of answering as if the source pack were unavailable.

## Reading Order Lock

The AI must walk layers in this order:

1. Birth-time validity: if no time, no 命宮/身宮/十二宮 reading.
2. 命宮 and 身宮: read the core person and the body/later-life emphasis together.
3. 五行局 and 大限 direction: use only values already supplied by packet.
4. Main palace structure: 主星, brightness/廟旺利陷平, and whether the palace has no 主星.
5. 對宮 and 三方四正: never judge a major topic from one palace alone.
6. 四化 layers: 生年 first, then 大限, then 流年 if available.
7. 輔星/煞星: assistant stars help, malefics add friction; neither erases the main-star structure by itself.
8. Timing: natal promise -> current/queried 大限 -> queried 流年 -> annual stars.
9. Final verdict: answer clearly where the packet provides enough evidence; do not downgrade the answer merely because raw source text is hidden from the user.

## Four-Transformation Layering

Keep the layers separate:

- 生年四化 = lifelong attachment/flow/control/name/blockage pattern.
- 大限四化 = decade-stage activation through the palace stem of the ten-year luck.
- 流年四化 = annual trigger for the queried year.

Do not merge them into one flat "good/bad" list. A strong verdict needs overlap:
- the transformed star is in, opposite, or 三方四正 to the asked palace,
- or the transformed star hits 命宮/身宮,
- or the same topic is repeated by natal + decade + annual layers.

化祿: flow, appetite, opportunity, gain, desire.
化權: pressure, command, action, authority, control.
化科: protection, name, examination, paperwork, formal recognition.
化忌: attachment, blockage, debt, worry, entanglement; it is not automatic disaster unless reinforced.

## Empty Palace / Borrowed Opposite Palace

If a palace has no 主星:
- say it is 無主星 / 借對宮,
- read the opposite palace only from packet-supplied stars,
- treat the topic as indirect, dependent on others, or event-driven,
- do not invent borrowed stars or hidden stars.

## Annual-Star Discipline

If `liuNian.annualStars` exists, annual stars are required evidence for year-level claims.

Current engine-supplied annual stars:
- 流年祿存: yearly resource/gain anchor.
- 流年擎羊: sharp pressure, cut, conflict, obstacle.
- 流年陀羅: delay, drag, hidden obstruction, entanglement.
- 流年天魁 / 流年天鉞: helper, noble-person, formal support.
- 流年天馬: movement, travel, change, relocation, active motion.
- 流年紅鸞 / 流年天喜: relationship, joy, social/ceremonial trigger.

Use these only where the packet places them. If an annual star touches 命宮, 夫妻, 財帛, 官祿, 疾厄, 遷移, or the asked palace, mention it in the evidence. If it is remote, do not over-weight it.

## Timing Verdict Standard

For "when" or "this year" questions:

1. State the queried 流年命宮 and 流年干支 from packet.
2. Read current/queried 大限 palace and 大限四化.
3. Read 流年四化 and annual stars.
4. Give a year-level verdict only.
5. If `流月`/`流日` are in `notAvailable`, say month/day timing is not available; do not derive it from memory. If the packet supplies `liuYue`/`liuRi`, use only those supplied fields and do not add extra stars, palaces, or rankings.

## Topic Rules

### Career 官祿
Read 官祿 plus 三方四正, then 化權/化科, then annual stars. 官祿 with support can show rank, recognition, appointment, or responsibility. 官祿 with 羊陀火鈴/化忌 needs pressure-management wording, not instant failure.

### Money 財帛
Read 財帛 plus 福德/田宅 support and 化祿/祿存. 財帛 with 化忌 is cash-flow worry or sticky obligation; only call loss when malefics/timing repeat it.

### Relationship 夫妻
Read 夫妻 plus 對宮 and partner-related 四化. 紅鸞/天喜 are triggers only if supplied in annual stars or natal minor stars. Do not call marriage/divorce from one romantic star.

### Health 疾厄
Read 疾厄 plus 命宮/身宮 and timing repetition. 羊陀火鈴/天刑/化忌 near 疾厄 means risk, surgery, inflammation, injury, or chronic pressure depending on the star mix; advise care without over-claiming diagnosis.

### Movement 遷移
Read 遷移 plus 天馬/流年天馬 and the current 大限. Movement is stronger when natal promise + annual trigger repeat.

## 飛星 / 十八星 Guard

The private source strengthens awareness of a related 飛星/十八星 layer, but current packet does not calculate a separate 飛星 chart.

Therefore:
- If a star name also appears in the modern packet, use only the packet placement.
- If a 飛星-only star is absent from the packet, do not discuss it as present.
- Use the layer mainly as vocabulary and timing discipline, not as an alternate chart.

Useful vocabulary when supplied by packet:
- 天福 / 天祿: support, ease, benefit, completion, blessing.
- 天虛: emptiness, hollow gain, worry, false alarm.
- 天刑: law, punishment, cut, surgery, discipline, official pressure.
- 天姚: charm, desire, attraction, romantic/social entanglement.
- 天哭: grief, sorrow, emotional/health drain.
- 天傷 / 天使: injury, separation, illness, official handling.

## Output Guard

The final answer must not mention this private pack, raw OCR, file paths, source contracts, purchase/licensing status, or download status. It should only use the extracted rules to reason from the supplied chart packet.

Allowed: applying the licensed extracted rules to make a direct Zi Wei judgment for the user.
Forbidden: exposing, quoting, citing, or implying access to the underlying private text.
