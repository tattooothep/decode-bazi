# 七政四餘 · 行限/限度主 compact guard

Sources:
- 欽定古今圖書集成 · 藝術典 · 星命部 · 張果星宗十六, especially 洞微百六限, 限度主論, 行度假如.
- 果老星宗 / 張果星宗 scan and public-domain text are source authority; this file is a compact working summary, not a verbatim import.

## Packet-first timing rule
Do not invent 行限, 限度主, 洞微百六限, or transit years inside AI. Use only packet fields.

Packet v3 supplies `data.xingXian` when birth time and refDate are available:
- `chuMingAge` = 出命限 age estimated from 命度宮內度 in 3-degree rows, capped to the classical 11-20 range.
- `current.segment` = current 行限 palace/age span.
- `current.limitShu` + `current.limitDegreeLord` = current 限度 and 限度主.
- `current.limitPalaceLord` = current 限宮主.
- `dongweiHundredSix` = classical duration sequence supplied as deterministic v1.

If `xingXian` is present, do not say 行限/限度主/洞微百六限 are missing. If absent, say timing layer is not computed.

Do not ask for or claim 紫微斗數 四化(祿權科忌) in a 七政四餘 reading. The Qizheng timing/transformation vocabulary here is 行限, 限度主, 洞微百六限, 流年, 流月, 流日, and 化曜 when the engine supplies them.

## Pair / two-chart packet rule
For two-chart questions, use only `PAIR_INTERACTION_PACKET qizheng` for cross-chart claims:
- 命宮 sign relation,
- 命主 and 恩/用/仇/難 star relations across charts,
- sign-level cross contacts listed by the engine,
- partner stars falling into the other person's 妻妾 house when supplied.

Do not create extra 七政 cross-aspects, 格局, 行限, or spouse-house overlays from raw star signs. If not listed in the pair packet, say the cross-chart layer is not supplied.

## What 行限 should do
行限 is a timing layer that activates natal promise. It should not override natal structure:
1. natal 命宮/命主/恩用仇難 sets the base,
2. 格局 shows high-level pattern,
3. 十二宮 shows life area,
4. 行限/限度主 triggers when and where the promise becomes active.

Production reading order for timing questions:
1. Identify target year/refDate in `xingXian`.
2. Read current 行限 palace topic.
3. Read 限宮主 condition and natal house.
4. Read 限度主 condition, relation to 命主, and natal house.
5. Add 木土流年 as annual activation. Do not let 木土流年 override the stronger 行限 layer by itself.

## 限度主
When packet supplies 限度主:
- inspect whether the limit lord is 廟旺 or 落陷,
- inspect whether it is 恩/用 or 仇/難 relative to 命主,
- inspect which house it activates,
- inspect contacts with Sun/Moon and benefic/malefic stars.

Strong limit lord in helpful relation can open a period. Weak or hostile limit lord can make the same topic burdensome.

## 洞微百六限
Use only when the engine supplies the exact limit segment. Treat it as a classical timing key, not a generic year label. If absent, do not cite 洞微百六限.

## Source gaps to state plainly
Current packet supplies natal 命度/度主, 月為身-derived 身主, v3 行限/限度主 when birth time + refDate are available, and 十干化曜 in `data.huaYao` (per 張果星宗 變曜; see canon file 25-shigan-huayao.md — use the field, never recompute). It may still lack:
- day/night and lunar phase,
- original 逐年行限度圖 / 命度圖 facsimile calibration (v3 uses deterministic 3-degree-row 出命限),
- 流日,
- source-tagged 格局.

If `xingXian` is missing, say the reading is natal-pattern plus abbreviated 木/土 annual transit only and timing must be recomputed with the full Qizheng timing packet.
