# Western Astrology · synastry / timing / no-time / fixed-star weighting pack

Source use:
- Derived from the Western public-domain OCR/excerpt corpus and internal operational summaries, including Alan Leo's 1906 `The Progressed Horoscope` as progression/direction support.
- This pack is not a raw quotation pack.
- Use only computed packet fields and closed pair packets. Do not invent progressions, returns, composite charts, or exact windows not supplied by the engine.

## Synastry Closed-List Rule

For pair readings, use only `PAIR_INTERACTION_PACKET western`.

Weight order:
1. Each person's own natal relationship promise: 7th house/ruler, Venus, Mars, Moon/Sun spouse significator, chart ruler, and hard/soft aspect structure.
2. Cross aspects in the closed list, with owner fields (`fromOwner`, `toOwner`).
3. House overlays, only if both charts have birth time.
4. Hidden contacts: antiscia/contra-antiscia/parallel/contraparallel as secondary evidence.
5. Timing transits only if the packet supplies them.

Strong support:
- Luminary-to-luminary or luminary-to-angle conjunction/trine/sextile with tight orb.
- Venus/Mars/Moon/Sun support to the other person's Asc/Desc/7th ruler/Venus.
- Benefic contact to the other person's relationship ruler or angle.
- House overlay into 1st/5th/7th/8th/10th/11th that repeats the relationship topic.

Strong friction:
- Saturn/Mars/Rahu/Ketu hard aspect to the other person's Moon, Venus, Asc, 7th ruler, or Sun/Moon spouse significator.
- Tight opposition/square involving chart rulers or relationship rulers.
- One-way overlay where one person activates the other's 12th/6th/8th repeatedly without balancing support.

Pair verdict:
- Do not say "compatible" from one trine alone.
- Do not say "bad" from one square alone.
- State attraction/support and operating friction separately, then decide which is stronger.

Composite charts are not currently computed. If user asks composite, answer from synastry packet and say composite needs a computed composite packet.

## Timing / Predictive Layer

Use timing fields in this order:
1. Natal promise by house/ruler/aspect.
2. Current or target-year `transits.aspectsToNatal`.
3. `timingSupport.returnCycles` for Jupiter/Saturn phase.
4. Retrograde status if supplied.
5. Do not create secondary progressions/progressed-horoscope positions, solar arcs, primary directions, profections, solar returns, or lunar returns unless packet fields exist.

When the user asks a future year:
- use the resolved target refDate in the packet,
- name the exact transit-to-natal aspect supplied,
- translate the natal target into topic houses,
- avoid saying "only current year" if the packet was generated for the future year.

Transit strength:
- Strong: transiting Saturn/Jupiter/Mars/Venus to Asc/MC/Sun/Moon/chart ruler/topic ruler within tight orb.
- Medium: transits to non-topic planets or wider orb.
- Weak: return-cycle phase without a concrete transit aspect.

Saturn:
- structure, delay, accountability, pressure, commitment, consolidation.
- In user language: "must make it real / carry responsibility / remove weak structure".

Jupiter:
- expansion, help, teaching, opportunity, confidence, protection.
- In user language: "opening channel / support / larger audience".

Mars:
- action, conflict, urgency, heat, injury risk.
- In user language: "move fast but control damage".

Venus:
- attraction, money ease, agreement, aesthetics, comfort.
- In user language: "softens negotiation and relationship tone".

## Annual Profection / Solar Return / Progression Guard

The source corpus supports these traditions, but Fusion should not pretend they are computed.

If user asks:
- "profection": say not in packet unless supplied, then answer from house rulers/transits.
- "solar return": say no solar-return chart is supplied, then use transits/return cycle.
- "secondary progression" or "progressed horoscope": say no progressed chart is supplied, then use natal + transits.
- "rectification": say the chart can show candidates, but birth-time correction requires event history; do not assert a corrected birth time.

## No Birth Time Mode

If `hasBirthTime=false` or `birthTimeMode=no_time`:

Do not use:
- Ascendant,
- MC,
- houses,
- house rulers,
- Part of Fortune by sect/house,
- house overlays in synastry,
- exact angle/fixed-star hits to angles,
- exact timing dependent on houses.

Allowed:
- Sun sign and planetary sign placements,
- Moon only if packet marks uncertainty as acceptable,
- planetary aspects by longitude if supplied,
- dignity by sign,
- broad transit-to-planet contacts,
- relationship reading from Venus/Mars/Sun/Moon with uncertainty stated.

No-time answer style:
- "อ่านได้แบบไม่มีเวลาเกิด: ใช้ดาว-ราศี-มุมดาว ไม่ใช้เรือน/ลัคนา"
- If Moon may change sign/nakshatra/degree significantly, state the alternatives.
- Do not degrade into a generic horoscope; still cite exact supplied planets/aspects.

## Fixed-Star Weighting

Fixed stars are amplifiers, not primary verdicts.

Weight order:
1. Star hit to Asc/MC/Sun/Moon/chart ruler/Fortune/topic ruler.
2. Contact type and orb.
3. Condition of the planet being hit.
4. Repetition by natal aspect or transit.

Use:
- Spica-type benefic contact = protection, talent, public grace, but only through the contacted planet/house.
- Aldebaran/Antares-type high-stakes contact = ambition, visibility, rivalry, volatility; do not call disaster.
- Sirius/Fomalhaut-type contact = prominence/idealism/spiritual or public charge; needs planet/house context.

Do not let fixed-star symbolism override:
- weak dignity,
- severe hard aspects,
- topic ruler condition,
- missing birth-time limitations.

## OCR Witness Caveat

The local Western source library includes promoted public-domain OCR witnesses from LOC/WDL for Abu Ma'shar `Flores astrologiae`, Haly Abenragel `Complete Book of the Judgment of the Stars`, Abu Ma'shar `Great Conjunctions`, Alcabitius `Principles of Judicial Astronomy`, and Albohali `De judiciis nativitatum`. They are useful for audit/source coverage and medieval rule collation, but noisy because they are early print/manuscript material. Use extracted runtime summaries, not raw OCR wording, in user answers.

## Anti-Generic Output

Every Western answer must include:
- at least five chart-specific anchors for single chart, or six cross-chart anchors for pair,
- exact planet/point/aspect/house/dignity when supplied,
- a topic consequence,
- timing trigger if timing is asked.

Avoid broad phrasing unless every broad claim is immediately tied to a chart fact.
