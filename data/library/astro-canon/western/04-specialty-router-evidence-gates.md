# Western Specialty Router And Evidence Gates

> Runtime summary pack for Fusion Western. This is a rule router, not a raw source pack. It applies public-domain/classical, early-modern, and licensed-internal summaries without exposing source text.

## Source Scope

- Classical natal and judgment: Ptolemy, Manilius, Firmicus, Hephaestio, Lilly, Bonatti, Haly, Sahl, Alcabitius, Morin, Placidus, Gadbury, Dariot, Ramesey, Coley, Partridge, Kirby/Bishop, Simmonite/Story, Zadkiel, Raphael.
- Timing and modern bridge: Alan Leo progression/direction witnesses, Sepharial, Raphael, Pearce, Broughton, Saint-Germain, Robson fixed stars, notable-nativity and periodical witnesses.
- Horary/electional/mundane/medical: Lilly, Ramesey, Penseyre, Gadbury, Culpeper, Saunders, Abu Ma'shar conjunction/revolution witnesses, Haly, Lilly/Partridge mundane witnesses, Goad, Sibly, Raphael, H. S. Green.
- Licensed modern materials: use only as extracted operational summaries for user readings. Do not quote, cite, reproduce, or expose licensed raw text.

## First Route The Question

Before interpreting, classify the question into one or more branches:

1. **Natal / personal character**: use planets, sign, house, dignity, sect, lots, aspects, chart ruler, house rulers, dispositors, dominant planets.
2. **Pair / synastry**: use only `PAIR_INTERACTION_PACKET western` plus each natal chart. Do not invent cross-chart aspects.
3. **Current/future timing**: use packet `transits` and `timingSupport.returnCycles` first. If the user names a year, use the supplied refDate transit packet for that target year.
4. **Progressions / directions / solar arcs / profections / returns**: require computed specialty fields. If absent, answer from natal promise plus transits/return cycles only.
5. **Horary**: requires a question chart for the moment/place of asking, significators, Moon condition, application/separation, reception, prohibition, collection, or translation.
6. **Electional / date selection**: requires candidate datetime/location chart, Asc/MC, Moon condition, action-house ruler, benefic/malefic angularity, and natal tie-in when relevant.
7. **Medical / decumbiture**: requires medical or decumbiture packet. Without it, only describe natal stress/stamina themes and ordinary caution.
8. **Mundane / event / country / weather**: requires event, ingress, lunation, eclipse, mundane, comet, or market-public packet. Do not turn mundane texts into private fate claims.
9. **Rectification**: requires event history and candidate times. The AI may name chart-sensitive factors but must not assert a corrected birth time by itself.
10. **Locality / astrocartography**: requires locality/geodetic line packet. Without it, discuss only natal travel/relocation themes.

## Packet Gate

Use a specialty branch only when the matching packet data exists. The core Western packet currently supports:

- natal positions, aspects, dignity, minor dignity, sect, lots available from engine,
- fixed-star contacts when `fixedStarHits` exists,
- hidden contacts when `hiddenContacts` exists,
- target-date transits when `transits.refDate` exists,
- Jupiter/Saturn return-cycle approximation when `timingSupport.returnCycles` exists.

Alan Leo's `The Progressed Horoscope` and related primary-direction/progression witnesses are evidence for interpretation only after computed direction/timing/house/progression fields are supplied by the packet. They do not authorize the AI to calculate or invent those layers.

The following are **not** in the current packet unless a future field explicitly supplies them:

- `secondaryProgressions`, `progressed chart`, `primaryDirections`, `solarArcDirections`,
- `annualProfection`, time-lords, distributions,
- `solarReturnChart`, `lunarReturnChart`, eclipse charts,
- `horaryQuestionChart`, `electionalSearch`,
- `astrocartographyLines`, relocation line maps,
- `medicalAstrologyProtocol`, decumbiture chart,
- `rectificationCandidates`, corrected-time workflow,
- `mundaneEventChart`, national/event charts,
- `compositeChart`, `harmonicCharts`, Chiron, additional lots not supplied by the packet.

If asked about one of these unsupported layers, do **not** stop at "missing." Give the strongest valid answer from natal + supplied transits/pair evidence, and name the missing specialty layer once.

Example behavior:

- Good: "No solar-return chart is supplied, so I will not judge Solar Return houses. From natal promise plus 2028 transits, the strongest career signal is..."
- Bad: "I cannot answer 2028 because solar return is missing."
- Bad: inventing progressed Moon, profection house, horary significator, or astrocartography line.

## Timing Weight Order

For a dated question, judge in this order:

1. Natal promise for the topic: relevant house, ruler, dignity, sect, angularity, aspects, lots, chart ruler.
2. Target-date transit contacts to natal planets/angles/lots that the packet supplies.
3. Jupiter/Saturn return-cycle context as a coarse background.
4. Specialty timing only if computed fields are supplied.

Do not let a generic outer-planet transit override natal promise without a direct contact to a relevant natal factor.

## Topic Drilldown

Every answer must attach each claim to a concrete chart anchor:

- Career: 10th house/MC, 10th ruler, Sun, Saturn, chart ruler, dominant planets, 6th work routine, 2nd/11th income support.
- Money: 2nd house/ruler, 8th debt/shared money, 11th gains, Part of Fortune/lots if available, Venus/Jupiter, afflictions to money rulers.
- Relationship: 7th house/ruler, Venus, spouse significator by gender if supplied, Moon/Sun condition, synastry packet in pair mode.
- Health/routine: 1st/6th/12th rulers, Moon, Mars, Saturn, Nemesis lot if supplied. Use caution language, not diagnosis.
- Relocation/travel: 9th/3rd/12th, ruler condition, angular contacts, transits to relevant rulers. No astrocartography claim without line packet.

## No-Time Mode

If `hasBirthTime=false`, close all angle/house/lot/sect/chart-ruler claims. Use only planet signs, dignities, retrograde/combustion if supplied, aspects, element/modality balance, and Moon with uncertainty. Do not pretend noon-anchor houses are real houses.

## Decisive But Evidence-Bound Output

Fusion user answers should be direct, not audit reports.

- If the relevant data exists, make a clear verdict.
- If a specialty layer is missing, mention it once and continue with available evidence.
- Do not dump every missing advanced technique.
- Do not cite source titles in normal readings.
- Do not use percentages or readiness scores.
- Each evidence bullet must contain: planet/point, condition/aspect, house/topic when reliable, and one practical consequence.
