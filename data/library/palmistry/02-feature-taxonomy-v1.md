# Hourkey Palm Feature Taxonomy v1.0

This taxonomy defines every hand dimension AI Sifu may inspect. It is intentionally broad so the canon covers the full reading surface, while guards prevent unsafe claims.

Every `HK.PALM.V1.FEAT.*` heading in this file is the `source_id` for that feature rule.

## 1. Photo Evidence

### HK.PALM.V1.FEAT.PHOTO.01 - Overall Clarity

- inspect: focus, blur, lighting, crop, glare, filter, shadow.
- output: `clear`, `partial`, `unclear`.
- use: controls whether fine marks/minor lines/color may be read.
- guard: low clarity must reduce confidence and request reshoot.

### HK.PALM.V1.FEAT.PHOTO.02 - Palm Coverage

- inspect: full palm, wrist, fingers, thumb, palm center, side edges.
- use: marks missing regions as not available.
- guard: do not infer missing wrist/finger/thumb features.

## 2. Hand Role

### HK.PALM.V1.FEAT.ROLE.01 - Dominant Hand

- inspect: user field `dominant_hand`.
- use: dominant hand = present development and choices; non-dominant = baseline/inborn tendency.
- guard: if unknown, describe left/right differences without assigning destiny.

### HK.PALM.V1.FEAT.ROLE.02 - Left/Right Comparison

- inspect: asymmetry between hands.
- use: difference can show baseline versus developed pattern.
- guard: never say one hand is "bad"; frame as tension or growth direction.

## 3. Hand Form

### HK.PALM.V1.FEAT.FORM.01 - Palm Shape

- inspect: palm long/short, broad/narrow, square/rectangular.
- safe use: general mode of processing life: practical, conceptual, sensitive, active.
- source: mainly Western T3 plus Chinese/Indian body-form support.
- guard: do not use modern four-element hand shapes as ancient universal canon.

### HK.PALM.V1.FEAT.FORM.02 - Finger-To-Palm Ratio

- inspect: long fingers vs short fingers relative to palm.
- safe use: analysis/detail vs action/directness.
- source: T1.05.

### HK.PALM.V1.FEAT.FORM.03 - Hand Firmness/Flexibility

- inspect: visible firmness cannot be fully known from image; infer only from texture and hand posture.
- safe use: if obvious, speak as tentative.
- guard: do not overread from photo alone.

## 4. Fingers

### HK.PALM.V1.FEAT.FINGER.01 - Finger Length

- inspect: long/short, proportional balance.
- safe use: temperament, detail, action speed.

### HK.PALM.V1.FEAT.FINGER.02 - Finger Shape

- inspect: tapering, square, spatulate, thick, slim, crooked.
- safe use: refinement, practicality, originality, tension in expression.
- guard: crooked fingers are not moral defects.

### HK.PALM.V1.FEAT.FINGER.03 - Finger Spacing

- inspect: open/closed gaps when hand is naturally open.
- safe use: independence, caution, openness, boundary style.
- guard: if fingers are posed unnaturally or cropped, do not read.

### HK.PALM.V1.FEAT.FINGER.04 - Finger Tips

- inspect: pointed, rounded, square, spatulate.
- safe use: intuition/feeling, sociability, practicality, experimentation.
- source: mainly Western T3, cross-checked as hand-form reading.

## 5. Thumb

### HK.PALM.V1.FEAT.THUMB.01 - Thumb Strength

- inspect: size, set, visible firmness, angle from palm.
- safe use: will, discipline, decision power, independence.
- source: Western T3, Indian/Chinese hand-strength support.
- guard: do not call weak-willed; say needs structure or decision rhythm.

### HK.PALM.V1.FEAT.THUMB.02 - Thumb Phalanges

- inspect: upper/lower phalange proportion if visible.
- safe use: will versus reasoning/practical logic.
- source: Western T3.
- guard: if thumb is hidden, omit.

### HK.PALM.V1.FEAT.THUMB.03 - Barley/Yava Mark

- inspect: clear barley-like mark on thumb/finger area.
- safe use: Indian T3: seed, stored capacity, practical gain through cultivation.
- guard: no fertility/children prediction.

## 6. Nails

### HK.PALM.V1.FEAT.NAIL.01 - Nail Shape

- inspect: long/short, broad/narrow, clean/unclear.
- safe use: refinement, sensitivity, detail habit, pressure-bearing style.
- guard: no medical diagnosis from nails.

### HK.PALM.V1.FEAT.NAIL.02 - Nail Color

- inspect: only if high lighting reliability.
- safe use: generally avoid unless user asks and image is clear.
- guard: no disease claim.

## 7. Palm Surface

### HK.PALM.V1.FEAT.PALM.01 - Texture

- inspect: fine/coarse, smooth/rough, dry/soft appearance.
- safe use: T1.06.

### HK.PALM.V1.FEAT.PALM.02 - Line Density

- inspect: many fine lines, moderate lines, few lines.
- safe use: sensitivity/mental load vs simplicity/directness.
- source: T2.05 plus Western line texture.

### HK.PALM.V1.FEAT.PALM.03 - Color/Qi

- inspect: red/bright/warm/dull only under reliable lighting.
- safe use: vitality/momentum/stress tendency.
- source: Chinese qise and Indian color.
- guard: no medical diagnosis; if white balance unreliable say cannot read color.

## 8. Major Lines

### HK.PALM.V1.FEAT.LINE.LIFE

- inspect: arc around thumb base, depth, continuity, branches.
- safe use: vitality, stamina, recovery, roots, family foundation, life rhythm.
- guard: never lifespan.

### HK.PALM.V1.FEAT.LINE.HEAD

- inspect: line across palm, straight/curved, start, separation from life line, length, branches.
- safe use: decision style, concentration, imagination, stress, planning.
- guard: no mental health diagnosis.

### HK.PALM.V1.FEAT.LINE.HEART

- inspect: upper line under fingers, depth, curve, endpoint, chains/breaks.
- safe use: emotion, affection, expectations, relationship expression.
- guard: no deterministic breakup/divorce prediction.

### HK.PALM.V1.FEAT.LINE.FATE

- inspect: vertical line through center toward middle finger, origin, breaks.
- safe use: work path, responsibility, pressure, direction shifts.
- guard: if absent, say flexible/self-built path, not "no fate."

## 9. Secondary Lines

### HK.PALM.V1.FEAT.LINE.SUN

- inspect: vertical line under ring finger.
- safe use: recognition, portfolio, pride in work, creative visibility.
- source: Western T3.

### HK.PALM.V1.FEAT.LINE.MERCURY

- inspect: line under little finger.
- safe use: communication, analysis, trade, negotiation, mental workload.
- source: Western T3.
- guard: no health diagnosis.

### HK.PALM.V1.FEAT.LINE.MARS

- inspect: support line inside/parallel to life line or Mars area.
- safe use: resilience, backup energy, ability to withstand pressure.
- source: Western T3.

### HK.PALM.V1.FEAT.LINE.RELATIONSHIP

- inspect: small horizontal lines near little finger edge if visible.
- safe use: relationship pattern, expectations, boundary style.
- guard: no marriage/divorce certainty.

### HK.PALM.V1.FEAT.LINE.TRAVEL_MOON

- inspect: lines toward/within Luna/Moon side.
- safe use: travel, outside networks, imagination, foreign/remote influence.
- source: Western T3; compare Chinese/Indian only if source-specific mark exists.

### HK.PALM.V1.FEAT.LINE.WRIST

- inspect: wrist/rashi/mṇibandha lines if visible.
- safe use: foundation, body rhythm, early support, stability.
- source: Indian T3/Western wrist line support.
- guard: no lifespan count.

## 10. Line Modifiers

### HK.PALM.V1.FEAT.MOD.DEPTH

- deep/clear vs shallow/faint. See T1.02/T1.03.

### HK.PALM.V1.FEAT.MOD.BREAK

- break/cut/interruption. See T1.04.

### HK.PALM.V1.FEAT.MOD.ISLAND

- oval/island on line.
- safe use: diffusion, stuck period, stress pocket in that domain.
- source: Western T3.
- guard: no illness claim.

### HK.PALM.V1.FEAT.MOD.CHAIN

- chained line.
- safe use: sensitivity, repeated small pressures, unstable rhythm.
- source: Western T3.

### HK.PALM.V1.FEAT.MOD.BRANCH_UP

- upward branch.
- safe use: improvement, aspiration, support, constructive effort. See T2.04.

### HK.PALM.V1.FEAT.MOD.BRANCH_DOWN

- downward branch.
- safe use: energy drain, distraction, emotional/financial leakage depending on line.
- source: Western T3 with safety language.

### HK.PALM.V1.FEAT.MOD.FORK

- fork/split at end or start.
- safe use: dual interest, branching path, need to integrate two directions.

## 11. Regions And Mounts

### Chinese Regions

- `CN.REGION.BAGUA9`: bagua/nine-palace symbolic map.
- use only as T3-cn.

### Indian Regions

- Indian signs often depend on palm/finger/wrist location, sacred marks, and upward lines.
- use only as T3-in unless overlap exists.

### Western Mounts

- Jupiter: leadership, ambition, dignity.
- Saturn: responsibility, seriousness, patience.
- Apollo/Sun: creativity, visibility, recognition.
- Mercury: communication, business, analysis.
- Venus: warmth, vitality, affection, family.
- Mars: courage, conflict endurance, pressure response.
- Luna/Moon: imagination, travel, sensitivity, outside influence.
- guard: always T3-west.

### Mesopotamian Body-Sign Adjunct

- `MESO.BODY.REGION`: visible body signs are organized by body location in Mesopotamian physiognomy.
- `MESO.HAND.LINE.NOTE`: hand-line material is a historical source-note only, not a named modern palm-line map.
- `MESO.HAND.MARK.NOTE`: hand-area marks require clear visibility and exact location before they can support any reading.
- `MESO.FINGER.MARK.NOTE`: finger marks and finger morphology are support-only body-feature context, not palm-line evidence.
- `MESO.NAIL.NOTE`: nail material is support-only visible-feature context and must never become a health diagnosis.
- use only as T3-ms historical context when a line or mark is clearly visible and already allowed by Chinese, Indian, or Western rules.
- guard: no Mesopotamian palm regions, no zodiac/month mapping, no skin-blemish/lesion reading, no right/left fate claims.

## 12. Special Marks

### Geometric Marks

- triangle: skill/strategy, T2 if visible.
- square: containment/protection/system, Western T3 unless Chinese 井 is clearly intended.
- cross: conflict/intersection/decision pressure, read by location.
- star: concentration/intensity, Western T3, requires clear mark.
- grille: scattered energy in a mount/region, Western T3.

### Auspicious Symbols

- fish: T2 Chinese+Indian support.
- conch, wheel, lotus, flag, barley, pot, goad, rope/garland, makara, temple, altar, well: Indian T3.
- 川字紋, 魚紋, 十字, 井: Chinese T3, read by source and location.

## 13. Topic Coverage Matrix

- Personality: hand shape, fingers, thumb, head line, texture.
- Energy/stress: life line, texture, color if reliable, line density, chains/islands.
- Career: fate line, head line, thumb, upward branches, Saturn/Jupiter/Mercury/Sun evidence.
- Money/resources: line quality, fate/work line, fish/triangle, Mercury/Jupiter/Sun support.
- Relationship: heart line, Venus area, relationship lines if visible, finger openness.
- Supporters: fate line origin, Moon side, fish/square/support lines, clear branches.
- Turning points: breaks/cuts/branches on major lines, but only broad life stages.
- Advice: must come from strongest visible signals and safety guard.
