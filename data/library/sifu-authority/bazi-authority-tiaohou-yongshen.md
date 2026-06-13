# bazi-authority-tiaohou-yongshen

Version: bazi-authority-tiaohou-yongshen-v1
Scope: 調候, 月令 climate, 用神 selection support, 病藥 climate/medicine boundary
Status: authority index only; source files remain intact and authoritative

## Source Priority

1. chartPacket locked 日干, 月令, 用神, 忌神, boundary warnings
2. qtbj-tiaohou-clean exact DM x month canonical block
3. qtbj-tiaohou-lookup selected Thai lookup blocks
4. yongshen-selection-engine-reference
5. qtbj-tiaohou-thai-notes
6. sftk-clean for 病藥 and medicine framing
7. compact baseline QTBJ/tiaohou layer

## Source Map

- qtbj-tiaohou-clean: canonical 窮通寶鑑 DM x month climate text
- qtbj-tiaohou-lookup: compact lookup source for selected DM/month retrieval
- qtbj-tiaohou-thai-notes: Thai teaching notes for climate interpretation
- yongshen-selection-engine-reference: platform reference for choosing usable elements
- sftk-clean: 病藥, 動靜, 蓋頭, marriage/medicine support when relevant

## Decision Order

1. Lock 日干 and 月令 from PILLAR LOCK.
2. If month is borderline, retrieve both possible DM x month blocks and label every dependent conclusion "เฉพาะถ้า...".
3. Read canonical QTBJ first, Thai lookup/notes second.
4. Extract primary climate method: 先用, 專用, 為尊, 先取.
5. Extract secondary support: 次取, 佐之, 參用.
6. Extract blockers: 忌, 病, 困, 破.
7. Compare with packet 用神/忌神 and structure layer; QTBJ wins inside climate/month-command scope, while packet values remain structural/provenance evidence outside that scope.
8. Translate climate into warmth/coldness, dryness/wetness, pressure, relief, timing, or practical medicine.

## Conflict Default

QTBJ wins inside climate/month-command scope. It cannot override FACT LOCK or PILLAR LOCK, but it can override raw packet/engine climate medicine when the selected canonical block is explicit. If climate medicine differs from structural medicine, explain both layers and do not collapse them into one 用神.

## Do Not Use As

- Do not load the full QTBJ corpus for every request once router is active.
- Do not answer from training memory when DM/month extraction fails.
- Do not promote a shaping element to default 調候用神 unless the selected block and packet support it.
- Do not collapse 調候, 格局, 通關, and practical lucky element into one word.

## Router Notes

Select this book whenever packet has 日干/月令, the question asks 用神/調候/month/heat/cold/dry/wet, or the model needs DM x month QTBJ support. For Codex, select compact baseline plus targeted qtbj source chunks only.
