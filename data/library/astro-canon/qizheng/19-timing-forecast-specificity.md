# 七政四餘 · Timing, Forecast, And Event-Window Specificity Pack

License mode: summary-only operational rule pack. Use for Hourkey runtime readings only. Do not expose raw OCR, source prose, page order, or private source file paths.

## Purpose

Use this pack when the user asks about a year, month, future period, "when", timing, turning point, or event window in Qizheng / Guolao.

The answer must become more time-specific without inventing unavailable layers. Do not say the chart only has the current year when `STRUCTURED_CHART_PACKET` supplies the target-year rows.

## Timing Hierarchy

1. Natal promise first: 命主, 命度/度主, 身宮/身主, 恩用仇難, 廟旺/升殿/落陷, asked palace, and 格局.
2. Limit layer next: 行限, 限度主, current limit degree, 洞微百六限, and any age/target-year fields supplied in `xingXian`.
3. Annual activation next: target-year 木/土 transit rows, year-to-palace mapping, and repeated hit to the asked palace or 三主.
4. Topic confirmation: connect timing to the asked topic palace: 官祿 for work, 財帛/田宅 for money/property, 疾厄/身主 for health/routine, 妻妾/福德 for relationship, 遷移 for movement.
5. Missing layer guard: if 流月/流日/化曜 are unavailable, say the yearly/limit window can be read but monthly/day precision is not proved by Qizheng packet.

## Forecast Rules

- A time window is strong only when natal promise, limit layer, and target-year activation point in the same direction.
- A good target-year transit does not erase a weak 命主/度主 or a damaged asked palace; write "ได้แต่เหนื่อย/ได้ผ่านแรงกด" if both appear.
- A difficult target-year transit does not cancel a strong natal and limit promise; write "มีแรงเสียดทานแต่ยังเดินได้" if support is stronger.
- If target-year activation hits a topic palace but not 三主 or 度主, treat it as an external event trigger rather than a life-defining turning point.
- If only natal promise exists and no target-year/limit row is supplied, answer as broad tendency and explicitly avoid exact timing.

## Output Contract

For timing/forecast answers, include:

- one natal-promise line naming 命主/命度/度主 or the asked palace,
- one 行限/限度主/洞微百六限 line when supplied,
- one target-year 木/土 activation line when supplied,
- one topic palace line matching the question,
- one confidence/precision line saying year-only, month/day unavailable, or exact-date if supplied,
- one decisive forecast verdict for the exact timing question.
