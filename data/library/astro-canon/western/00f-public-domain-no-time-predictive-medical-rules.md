# Western Public-Domain No-Time, Predictive, And Medical Guards

> Derived rule pack from additional public-domain Western astrology files downloaded into the private source library. This is an operational summary for Hourkey readings, not a transcription.

## Local Source Family

- Alan Leo: natal textbook, own-nativity, primary directions, and `The Progressed Horoscope` 1906 public-domain witness.
- Max Heindel / Augusta Foss Heindel: natal, medical, and spiritual astrology vocabulary.
- Sepharial: foreknowledge and directional timing materials.
- Hiram E. Butler: solar-biology style character/date analysis.
- Heinrich Daath / Frank White: medical astrology materials.
- Nicholas Culpeper / Richard Saunders: historical decumbiture and medical-astrology judgment.

## Purpose

Use this pack to strengthen:

- readings without a known birth time,
- topic-specific natal synthesis,
- future-year answers,
- health-risk wording,
- timing claims that must be evidence-bound,
- concrete user-facing verdicts without generic horoscope language.

Do not use this pack to invent houses, angles, lots, primary directions, progressions, medical diagnoses, or exact event dates.

## Unknown Birth Time Mode

When `hasTime=false` or the packet marks time unknown:

- Treat Sun, Moon sign, planetary signs, planetary aspects, retrograde state, and slow-planet contacts as usable.
- Treat Ascendant, MC, house cusps, Lots/Parts, chart ruler, house overlays, and angularity as unavailable unless the packet explicitly supplies a rectified or trusted time.
- If the engine supplies a noon chart, say internally it is a convenience chart; do not present noon houses as birth houses.
- Use a **solar chart** only as a labeled fallback: Sun sign as house 1 for broad topical scaffolding, not as a replacement for a timed natal chart.
- Do not give house-based statements such as “career house”, “marriage house”, or “hidden enemies house” unless the packet has reliable houses.
- For relationship without time, prioritize interplanetary contacts: Sun/Moon/Venus/Mars/Saturn/Nodes. House overlay claims are disabled.

Required answer shape for no-time readings:

1. state what remains reliable,
2. state what is withheld because time is missing,
3. give a direct judgment from available planet/aspect evidence,
4. avoid apologetic over-hedging when the available evidence is strong.

## Topic-Specific Natal Drilldown

To avoid broad answers, bind every claim to one of these topic anchors:

- **Identity / direction**: Sun, Moon, Asc/chart ruler if timed, dominant planet, tight luminary aspects.
- **Work / status**: MC and 10th ruler if timed; otherwise Sun, Saturn, Mars, Mercury, Jupiter, dominant aspects, and public-facing stellium.
- **Money**: 2nd/8th/11th rulers if timed; otherwise Venus, Jupiter, Saturn, Mars, Part of Fortune only if timed, and repeated material-topic aspects.
- **Relationship**: 7th ruler if timed; otherwise Venus/Mars/Moon/Sun/Saturn contacts, Nodes, and pair inter-aspects.
- **Health / stamina**: 1st/6th/12th rulers if timed; otherwise Sun/Moon/Mars/Saturn, hard aspects, combustion/affliction, and repeated stress signatures.
- **Home / family**: IC/4th ruler if timed; otherwise Moon, Saturn, Venus, Cancer/Capricorn emphasis, and family-topic aspects.

If a topic lacks a timed house anchor, the answer may still be decisive from planet/aspect evidence, but it must not pretend to know the exact life field from houses.

## Predictive Timing Discipline

The additional timing sources include directions and forecasting doctrine, but Hourkey must obey packet evidence.

- Use transits only when packet supplies transit positions, natal targets, aspects, and a reference date/window.
- Use primary directions only when packet supplies directed points, promissors/significators, arc, and date.
- Use secondary/progressed-horoscope material only when packet supplies progressed positions and aspects.
- Use solar return only when packet supplies the return chart.
- Use annual/monthly claims only when the packet gives a target-year or target-month calculation.

For future-year questions:

- If the system resolves a target-year refDate, do not claim the year is unavailable.
- Separate **natal promise** from **year trigger**.
- A strong year answer should name the triggering planet, natal target, aspect, orb/applying state if available, and topic anchor.
- If only a coarse cycle is supplied, give a coarse verdict and say exact month/day needs the missing timing layer.

## Primary Directions Guard

Primary directions are powerful but dangerous when faked.

Do not infer primary directions from natal aspects. A primary direction requires:

- directed significator and promissor,
- direction type,
- arc or time key,
- date range,
- target natal point,
- direction hit status.

If missing, write: “ชั้น primary directions ยังไม่ได้คำนวณใน packet” internally and answer from available transit/natal evidence.

## Progressed Horoscope Guard

Alan Leo-style progressed-horoscope rules require computed progressed positions.

Do not infer a progressed Moon, progressed Sun, progressed angles, or progressed house contacts from natal placements. A progressed-horoscope judgment requires:

- progressed planet or angle,
- natal target or progressed-to-progressed target,
- aspect type and orb,
- date/window,
- house/topic mapping from a reliable timed chart.

If missing, answer from natal promise plus supplied transits/return cycles, and mention the progressed layer is not computed only if the user asks for it.

## Medical Astrology Safety

Medical-astrology material is only a symbolic risk/stamina layer.

Allowed:

- describe stress signatures, body-system themes, stamina patterns, recovery discipline, sleep/routine sensitivity, and when to seek ordinary medical care.
- connect health comments to chart anchors such as 6th/12th rulers, Mars/Saturn afflictions, luminary stress, or repeated mutable/cardinal/fixed strain.
- describe decumbiture only if the packet supplies a decumbiture chart; a natal chart alone cannot time disease onset or recovery.

Forbidden:

- diagnose disease,
- predict death, surgery necessity, infertility, cancer, pregnancy outcome, or medication effect,
- tell a user to stop medical treatment,
- replace a doctor, therapist, lawyer, or financial adviser.
- prescribe herbs, bleeding, purging, dosage, fasting, or any treatment from historical medical texts.

User-facing wording should be firm but safe:

- “มีสัญญาณให้ระวัง...” not “คุณเป็นโรค...”
- “ควรตรวจ/ปรึกษาผู้เชี่ยวชาญถ้ามีอาการจริง” not “ต้องผ่าตัด/ไม่ต้องผ่าตัด”

## Solar Biology / Date-Only Layer

Solar-biology style date analysis can help when time is absent, but it is a lower-confidence auxiliary layer.

- Use it for temperament, vitality rhythm, and general aptitude only.
- Do not use it to override natal planetary aspects or timed houses.
- Do not use it for precise relationship, career timing, medical diagnosis, or electional verdicts.

## Decisive But Evidence-Bound Output

Western answers should not become vague because some layers are missing.

Use this decision policy:

- If 3 or more independent anchors agree, give a clear verdict.
- If 2 anchors agree and no major contradiction appears, give a clear lean.
- If evidence is mixed, split the verdict by life area instead of saying “อาจจะ”.
- If a layer is absent, name the missing layer once and continue with what is present.
- Never fill a missing layer with invented computation.

Concrete answer template:

1. **ฟันธง:** one sentence tied to the user’s topic.
2. **หลักฐานจากผัง:** 4-6 specific anchors.
3. **แปลเป็นชีวิตจริง:** consequences by work/money/love/health/timing as relevant.
4. **ข้อจำกัด:** only the missing layer that materially affects this question.

## Pair Reading With No Time

For pair readings when one or both times are unknown:

- Use only interplanetary aspects and sign-based Moon/Venus/Mars/Saturn/Node contacts supplied by `PAIR_INTERACTION_PACKET`.
- Disable house overlays, angle contacts, composite houses, and Part/Lot contacts unless timed.
- Saturn contacts describe responsibility, delay, pressure, or durability; do not call them automatically bad.
- Venus/Mars contacts describe attraction style; Moon contacts describe emotional fit; Sun contacts describe identity recognition; Mercury contacts describe communication.
- If pair evidence is strong, answer decisively even without houses, but label the missing house-overlay layer.
