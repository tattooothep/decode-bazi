# Jyotish Functional Topic Specificity Pack

> Runtime derived summary for Fusion Vedic/Jyotish. It is built from the retained Parashari, Jataka, dasha, varga, ashtakavarga, gochara, prashna, muhurta, tajika, and licensed-internal collation corpus. It is not raw source text and must not be quoted or exposed to users.

## Purpose

Use this pack to make Vedic answers specific to the chart packet instead of broad. Every verdict must be anchored to the supplied `lagna`, `bhavas`, `grahas`, `drishti`, `vargas`, `shadbala`, `ashtakavarga`, `vimshottari`, and `gochara` fields.

If birth time is missing, close Lagna/bhava/varga-house/dasha-heavy conclusions according to packet flags.

## Functional Reading Chain

For any topic, read in this order:

1. **Lagna baseline**: Lagna, Lagnesha, Moon, and Moon nakshatra. If no time, use graha/rashi and Moon only as conditional.
2. **Topic bhava**: house sign, house lord, planets in house, and whether the lord is in kendra/trikona/upachaya/dusthana/maraka context.
3. **Natural karaka**: topic planet such as Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, or Ketu.
4. **Graha condition**: dignity, rashi-lord relationship, combustion, retrograde, speed, dusthana placement, drishti received/given.
5. **Varga confirmation**: D9 for maturity/dharma/relationship, D10 for work/status, other supplied vargas only as support.
6. **Bala and bindu**: shadbala band and ashtakavarga bindu confirm strength/resilience; they do not override a badly damaged topic lord alone.
7. **Yoga and cancellation**: use `yogaCandidates` only as candidates. Check dignity, house, malefic pressure, and dasha before declaring a yoga operative.
8. **Timing**: Vimshottari mahadasha/antardasha sets the field; gochara/ashtakavarga trigger or pressure the field.

Do not answer from one graha, one yoga, one transit, or one bindu count alone.

## Functional Benefic / Malefic Guard

The AI may describe functional behavior only from packet facts:

- A graha ruling Lagna/trikona supports identity, dharma, skill, or protection when not badly damaged.
- A graha ruling 6th/8th/12th brings work, conflict, debt, chronic pressure, loss, retreat, or transformation into the topic it touches.
- A graha tied to 2nd/7th can become relationship, family, resource, or maraka-style pressure depending on context. Do not predict death.
- A graha connected to 3rd/6th/10th/11th often works through effort, competition, skill, service, ambition, and gains.
- Natural benefic/malefic status is secondary to functional lordship, dignity, house, and dasha.

Do not invent a formal yogakaraka/maraka label unless the packet facts clearly support it. In user answers, prefer plain language: "supports," "pressures," "turns into work/obligation," "creates gains through effort."

## Career / D10

Strong career verdict requires repetition from at least two:

- 10th bhava/lord or planets in 10th,
- Lagnesha tied to 10th/6th/11th/2nd,
- Sun/Saturn/Mercury or the work karaka tied to the topic,
- D10 repeats the same graha/sign/strength,
- dasha lord connects to 10th/6th/11th/2nd,
- gochara activates 10th lord/house or work graha.

Name the channel from evidence:

- Sun/Jupiter: leadership, teaching, advisory, law, public authority.
- Mercury: trade, language, analysis, writing, technology, calculation.
- Saturn: systems, operations, discipline, long-term responsibility, institutions.
- Mars: engineering, action, competition, surgery/tools, command.
- Venus: art, beauty, design, luxury, negotiation, relationship business.
- Moon: public care, hospitality, changeable public contact, mind/body services.
- Rahu/Ketu: foreign, unconventional, technical, disruptive, hidden, research, spiritual, or nonstandard channels.

## Money / Dhana

Separate money into:

- earning from 2nd/10th/6th,
- gains/network from 11th,
- fortune/speculation/intelligence from 5th/9th,
- family/savings from 2nd,
- debt/tax/shared money from 8th,
- leakage/foreign/retreat from 12th.

Use Jupiter/Venus/Mercury as natural money helpers only when topic houses and dasha support them.

Rahu in 2nd/11th may show unusual earning, foreign channel, appetite, volatility, or amplification. It is not stable wealth unless the house lord, dasha, and bindu support retention.

## Relationship / D9

Single chart:

- Use 7th bhava/lord, Venus, Jupiter for husband significator when applicable, Moon, 2nd/4th/11th family support, and D9.
- Separate attraction, marriage stability, family/social support, emotional fit, conflict style, and timing.
- D9 confirms maturity and relationship dharma; it should not override a severely damaged 7th lord without repeated support.

Pair mode:

- Use `PAIR_INTERACTION_PACKET vedic` only for cross-chart contacts.
- If either birth time is missing, close Lagna relation, bhava overlays, Navamsa synastry, and dasha cross-reference; Moon/tara compatibility is conditional if packet marks Moon uncertain.

Do not declare marriage/divorce from Venus alone, D9 alone, or one tara-bala support.

## Health / Risk

Use Lagna/Lagnesha, 6th/8th/12th, Moon, Sun, Saturn, Mars, Rahu/Ketu, dasha, gochara, shadbala, and ashtakavarga.

Allowed wording:

- vitality,
- sleep/routine pressure,
- workload strain,
- chronic symbolism,
- acute heat/inflammation symbolism,
- discipline/check-up/rest.

Forbidden:

- diagnosis,
- fixed disease,
- surgery instruction,
- medication advice,
- death prediction.

If 6th/8th/12th are active in dasha and gochara, say the period asks for discipline and practical care, not fear.

## Timing Specificity

For year questions:

1. Name current/target mahadasha and antardasha from packet.
2. State each lord's natal house/sign/dignity and topic lordship when available.
3. Confirm with D9/D10 if relevant.
4. Confirm or weaken with shadbala/ashtakavarga.
5. Add gochara hits to natal graha/house from Lagna/Moon if supplied.
6. Do not claim exact month/day unless the packet supplies sub-period or transit-window fields.

Good timing answer shape:

"The main field is [mahadasha lord] because it sits/rules [packet fact]. The concrete trigger is [antardasha lord] because [packet fact]. Gochara [field] activates/pressures it, so [specific likely life channel]."

## No-Time Mode

If `hasBirthTime=false`:

- Use graha rashi, dignity, combustion, retrograde, drishti between graha, and broad Moon/nakshatra only if stable.
- Do not use Lagna, bhava, house lordship, D9/D10 house claims, dasha-heavy marriage/career/home/health verdicts, or exact timing.
- State the reading is "graha-rashi/aspect only" and keep it useful by naming planet-specific patterns.

## Output Rule

Every Vedic answer should include:

- one chart-specific baseline,
- one topic-house or no-time substitute,
- one graha strength/weakness line,
- one varga/bala/bindu confirmation when supplied,
- one dasha/gochara line when timing matters,
- one practical recommendation tied to the same evidence.

If a sentence could fit many charts, rewrite it with a packet field.
