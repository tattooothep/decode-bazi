# 七政四餘 · Topic Evidence Gates

> Runtime derived summary for Fusion Qizheng. Use as an operational rule pack, not a raw text pack. It summarizes the available Guolao/Qizheng corpus and keeps noisy OCR/source witnesses out of user-facing answers.

## Source Scope

- Core method: 果老星宗 / 張果星宗 layers already extracted in `00-method`, `01-enyong-12gong`, `02-miaowang`, `03-geju`, `04-xingqing`, and `05-xingxian`.
- Collation families retained privately: 星學大成, 增補星平會海命學全書, 星命溯源, 五星三命大全, 七政四餘命學 scan witness, and astronomical/catalog witnesses.
- This pack is summary-only. Do not quote raw OCR, page order, filenames, or source passages to users.

## Main Judgment Order

For every topic, judge by this chain before writing a verdict:

1. **三主**: 命主, 命度/度主, 身宮/身主.
2. **Target palace**: the 12宮 matching the question.
3. **Palace lord**: status of the ruler, where it lands, whether it is in a strong/weak palace.
4. **Stars inside the palace**: their 廟旺/落陷, retrograde flag, 宿 placement, and whether they are 恩/用/仇/難 relative to 命主.
5. **格局**: named 合格/忌格, 八格賦 bucket, or 三方/拱夾 support only when packet evidence lists it.
6. **Timing**: 行限/限度主/洞微百六限 first, then 木/土 annual transit row as activation.

Do not let the engine's one-word `verdictTh` or a single good/bad house badge override this evidence chain.

## Topic Gates

### Career / 官祿

Use 官祿 palace, 官祿 ruler, 命主/度主 strength, 福德 support, and named 貴格/官祿格.

Strong career verdict requires at least two of:
- 官祿 ruler 廟旺/升殿/入垣 or falling into a helpful palace,
- 官祿 receives 恩/用 or a strong benefic star in palace,
- 命度主 or 身主 supports 官祿/福德/命宮,
- 貴格, 官福互垣, 日月拱官/夾官, or similar packet-listed pattern,
- current 行限 or target-year trigger touches 官祿/福德/命宮.

If 官祿 is good but 疾厄/奴僕 is weak, say "career can rise, but work process/people/health drain must be managed."

### Money / 財帛 and 田宅

Use 財帛 for cash flow, 田宅 for assets/property/root, 福德 for fortune base, 官祿 for income channel.

Strong money verdict requires repeated support, not one lucky star:
- 財帛/田宅 ruler strong or supported by 恩/用,
- 財/田 palace has good star and no repeated 仇/難 pressure,
- 富格, 田財互垣, 財星合格, 官福生田財, or 八格賦 富格 chain,
- 行限/木土 annual trigger activates 財帛/田宅/官祿.

If 財帛 is mixed, split "earning ability" from "retaining assets." A strong 官祿 with weak 財帛 means money comes through work but leaks or is delayed.

### Relationship / 妻妾

Use 妻妾 palace and ruler first, then 命主/身主 condition, 福德 emotional base, and pair packet when in pair mode.

Relationship support needs:
- 妻妾 ruler strong or placed in helpful palace,
- no repeated 仇/難/malefic pressure directly on 妻妾/命宮/身主,
- 合格 around 妻宮, spouse-house overlay in pair packet, or supportive 命宮 relation,
- timing readiness from 行限 or target year.

If pair mode exists, never judge from one side's 妻妾 alone. Use `PAIR_INTERACTION_PACKET qizheng` only. Distinguish attraction, stability, pressure, and timing.

### Health / 疾厄 and 身主

Use 疾厄 palace, 身主, 命度主, Saturn/Mars/Rahu/Ketu-like pressure only as packet-listed stars/roles, and 疾格 when listed.

Allowed output: vitality, stamina, stress pattern, workload risk, caution around routines.

Forbidden output: diagnosis, fixed disease, surgery instruction, death prediction, medication, or telling the user to avoid medical care.

If 疾厄 is weak but 命度主/身主 is strong, say the constitution has support but the trouble channel is active. If both are weak, use strong caution language but not medical certainty.

### Travel / 遷移

Use 遷移 palace/ruler, 命主/度主 relation, stars in 遷移, and 行限/木土 trigger.

Good 遷移 means external opportunity, movement, clients, foreign field, or visibility outside the home base. Bad 遷移 means pressure from movement, legal/travel friction, unstable external help, or separation strain. Do not turn it into guaranteed migration success without repeated support.

### Home / 田宅

Use 田宅 palace/ruler, 財帛 support, 福德 root, and target-year timing. 田宅 good with 財帛 weak = property desire/root exists but cash pressure must be planned. 財帛 good with 田宅 weak = earning can happen but asset consolidation is harder.

## Star-Nature Use

The clean runtime packet already supplies star status, palace, role, and 恩用仇難. Use those first.

Use star nature only as a **secondary semantic layer**:

- 七政/四餘 element and cycle data from `04-xingqing`: 木 grows/learns/plans, 火 activates/heats/conflicts, 土 stabilizes/burdens/slows, 金 cuts/orders/values, 水 moves/communicates/flows; 紫氣=木餘, 月孛=水餘, 羅睺=火餘, 計都=土餘.
- 金箱歌 / 賦歌 material in `03-geju` can sharpen wording for personality, resource, illness-symbol, or female-chart language, but it is T3 narration. It cannot override palace/lord/status evidence.
- Do not claim full verbatim 星情/personality/organ/profession tables are cleanly extracted. If a user asks exactly for a star dictionary, answer from the available extracted layer and say the full dictionary layer is not a clean runtime source yet.

## Timing Gate

If `xingXian` exists, do not say 行限/限度主/洞微百六限 are missing.

For year questions:

1. Use 行限 current segment and 限度主.
2. Check whether the segment domain matches the topic.
3. Check the natal condition of 限度主 and 限宮主.
4. Use the target-year 木/土 row as opportunity/burden activation.
5. Avoid exact month/day claims unless 流月/流日 fields exist.

## Output Contract

Every Qizheng answer must include concrete evidence:

- one 三主 line,
- one topic palace line,
- one palace-lord or star-inside-palace line,
- one 恩用仇難 or 廟旺/落陷 line,
- one 格局 or timing line if relevant.

If evidence is mixed, state the split plainly: "งานขึ้นแต่เงินเก็บรั่ว", "คู่มีแรงดึงแต่ timing ยังหนัก", "สุขภาพไม่ใช่ตัดฤกษ์ แต่เป็นภาระต้องจัดวินัย."

Do not output readiness percentages, gap registers, or source audit in user readings.

