# 紫微斗數 · 流月 / 流日 / 四化飛星 operational pack

Source use:
- Derived internal operating rules from Zi Wei source corpus, including public-domain 全書/道藏 witnesses and licensed 飛星策天 extraction.
- This file is a compact rule pack, not a raw transcription.
- Use only with structured packet fields: 生年四化, 大限四化, 流年, 流月, 流日, pair crossSiHua.

## Availability Rule

If `liuNian`, `liuYue`, or `liuRi` is present in the packet, do not say that annual/month/day timing is missing.

If the user asks a specific year/date:
- use the `refDate` resolved by Fusion,
- read `liuNian.year`, `liuYue.lunarMonth`, and `liuRi.dateISO`,
- explain the date as an activation signal, not as a guaranteed fate.

There is currently no `流時` field in the packet. If the user asks exact hour timing, say the chart supports day/month/year timing but not hour-flow timing yet.

## Four Transformation Layering

Read 四化 by layer:

1. 生年四化 = lifelong wiring.
2. 大限四化 = decade-stage force.
3. 流年四化 = year trigger.
4. 流月四化 = month trigger.
5. 流日四化 = day trigger.
6. Pair `crossSiHua` = one person's transformed star location in the other person's chart.

Verdict rule:
- One 化 is a signal.
- Two layers hitting the same palace/topic are a strong theme.
- Three layers repeating the same topic should be stated directly and practically.

Do not treat 化忌 as automatic disaster. It means attachment/blockage/unfinished knot. It becomes heavy when:
- it repeats across natal/decade/year/month/day,
- it touches 命宮/身宮/夫妻/財帛/官祿/疾厄,
- it is reinforced by 羊陀火鈴/空劫/天刑.

## 流年

Use 流年 for the year's main stage.

Read order:
1. `liuNian.mingPalaceName`: what field the year revolves around.
2. `liuNian.siHua`: what stars transform and which palaces they occupy.
3. `liuNian.annualStars`: trigger stars such as 流年祿存, 流年擎羊, 流年陀羅, 流年天魁, 流年天鉞, 流年天馬, 流年紅鸞, 流年天喜.
4. Compare to natal palace and 大限 palace.

Annual star guard:
- 紅鸞/天喜 = emotional/relationship/social trigger; not marriage proof alone.
- 天馬 = movement/change/travel; not relocation proof alone.
- 祿存 = resource/flow; not wealth proof alone.
- 擎羊/陀羅 = pressure, cut, delay, conflict; not disaster proof alone.
- 天魁/天鉞 = formal help, senior support, paperwork support.

## 流月

Use 流月 to narrow the year into a month-stage.

Read order:
1. `liuYue.mingPalaceName`: monthly life focus.
2. `liuYue.siHua`: monthly transformation.
3. `liuYue.monthlyStars`: support/pressure trigger for that month.
4. `liuYue.monthPalaces`: list of all 12 lunar-month life-palace positions.

If the user asks "เดือนไหนดี":
- compare monthPalaces against the asked topic palace,
- prefer months where monthly life palace or monthly transformations support the topic,
- avoid months where monthly 忌/擎羊/陀羅 repeats on the same stressed topic.

Do not claim exact Gregorian month if only lunar month is supplied. Translate carefully: "เดือนจันทรคติ X" unless the UI supplies converted date range.

## 流日

Use 流日 only for short-window action.

Read order:
1. `liuRi.dateISO` and `liuRi.mingPalaceName`.
2. `liuRi.siHua`.
3. `liuRi.dailyStars`.
4. Confirm against 流月 and 流年. Day trigger without month/year support is weak.

Suitable day wording:
- "เหมาะใช้เป็นวันลงมือ/คุย/ยื่น/นัด" when support repeats.
- "ใช้ได้แต่ต้องคุมความเสี่ยง" when support and pressure mix.
- "ไม่ใช่วันเปิดเรื่องใหญ่" when 忌/煞 repeats on the topic.

## Pair 四化飛星

Use only `PAIR_INTERACTION_PACKET ziwei.data.crossSiHua`.

Read each cross line as:
- fromOwner = who emits the transformation,
- star/type = what transformation,
- inOtherChart.palaceName = where it lands in the other person's chart.

Pair support:
- A's 化祿/化科 landing in B's 命宮/夫妻/福德/田宅 = A can ease or stabilize B in that field.
- A's 化權 landing in B's 官祿/命宮 = A pushes B to act, lead, decide, or carry responsibility.
- Mutual 化祿/科 to core palaces = reciprocal support.

Pair stress:
- A's 化忌 landing in B's 命宮/夫妻/福德/疾厄 = A becomes a knot/pressure point in B's self, relationship, emotional comfort, or health-stress field.
- 化權 plus 煞/忌 pattern = pressure/control; not automatically abuse, but must be named as power friction.
- One-way support with one-way 忌 = uneven relationship. Say plainly who is helped and who is pressured.

Do not invent crossSiHua from star names outside the packet.

## Topic Use

Career:
- 官祿 + 化權/化科 repeated by 大限/流年 = career push/recognition.
- 官祿 + 化忌 repeated = work knot, delay, reputation anxiety, obligation.

Money:
- 財帛/田宅/官祿 receiving 祿/祿存 = resource channel.
- 財帛/田宅 receiving 忌/空劫/羊陀 = leakage, stuck funds, repairs, document burden.

Relationship:
- 夫妻/命宮/福德 receiving 祿/科 = attraction plus emotional support.
- 夫妻/命宮/福德 receiving 忌/羊陀火鈴 = attachment plus conflict/stress.

Health:
- 疾厄/命宮/身宮/福德 receiving 忌 or 煞 repeatedly = caution, check-up, rest and routine.
- 化科 around 疾厄/命身 = support for treatment/recovery/order.

Home/property:
- 田宅 receiving 祿/科 = property/home/document support.
- 田宅 receiving 忌/煞/空劫 = repairs, family burden, contract delay, unexpected cost.

Movement:
- 遷移 + 天馬/祿/權 = movement/opportunity outside.
- 遷移 + 忌/羊陀 = stressful travel/public/client entanglement.

## User-Facing Rule

When answering timing questions, include:
- decade layer if relevant,
- annual layer,
- month/day layer if packet supplies it,
- which palace receives the transformation,
- concrete action advice.

Never answer a date question with only general personality material.
