# Western Astrology · compact addenda for AI panel

Source policy:
- Ptolemy, Tetrabiblos, Ashmand 1822 translation: public-domain source for sect, marriage significators, lots, fixed-star doctrine, and signs of equal power.
- William Lilly, Christian Astrology, 1647: public-domain source for houses, essential dignity weights, Part of Fortune practice, declination/parallels, directions/profections/revolutions/transits.
- Vivian Robson, Fixed Stars and Constellations in Astrology, 1923: use only as secondary fixed-star tradition if packet supplies fixed-star hits.
- Raphael, Manual of Astrology, 1828: secondary support for later predictive vocabulary; never overrides packet evidence.

## Packet-first rule
AI must not calculate missing astrology from raw degrees. Use only packet fields:
- Lots/Part of Fortune: use `partOfFortune` only if packet supplies it.
- Minor dignities: use `minorDignity` only if packet supplies triplicity/term/face.
- Fixed stars: use only `fixedStarHits` supplied by the packet. If the list is empty, the limited catalog was checked and no tight hit was found; do not invent star names from zodiac degree memory.
- Antiscia/declination/transits: use only packet `hiddenContacts`, `fixedStarHits`, `transits`, and `timingSupport`.

## Part of Fortune / Lots
Fortune is a calculated point, not a planet. Read it through:
1. sign and house of Fortune,
2. ruler of that sign,
3. aspects or contacts to Fortune,
4. condition of the Fortune ruler.

Use it for livelihood, prosperity, bodily fortune, and material ease. Do not invent Spirit, Necessity, Eros, Courage, Victory, or Nemesis unless packet supplies those lots.

Formula provenance guard:
- Ptolemy/Lilly tradition often presents Fortune as Asc + Moon - Sun without reversing by sect.
- Later Arabic/medieval practice often reverses the formula by sect.
- If the packet labels a sect-reversed formula, describe it as "sect-reversed Fortune formula"; do not call that specific formula strictly Lilly/Ptolemy.

## Essential dignity layers
Major dignity:
- rulership: strongest essential strength.
- exaltation: high but more specialized strength.
- detriment/fall: essential weakness; do not cancel it without a supplied mitigation.

Minor dignity:
- triplicity shows elemental support and depends on sect.
- term/bound shows a planet operating under another planet's local authority.
- face/decan gives the lightest essential dignity.
- Peregrine means no supplied essential dignity; do not decide peregrine if packet lacks minor dignity.

Lilly-style weights are interpretive aids only:
rulership 5, exaltation 4, triplicity 3, term 2, face 1; detriment/fall are debilities. Do not report numeric scores to the user unless asked for audit.

## Sect
Use packet sect only.
- Day chart: Sun above the horizon; day triplicity ruler has priority.
- Night chart: Sun below the horizon; night triplicity ruler has priority.
- If no birth time, sect is unavailable; do not infer it.

## Marriage / partner significators
For relationship questions:
1. 7th house and its ruler are primary.
2. Venus describes affection and attraction generally.
3. Male native: Moon is the spouse significator.
4. Female native: Sun is the spouse significator.
5. If gender is unknown or defaulted, say partner significator is uncertain.

## Pair / synastry packet rule
For two-chart questions, use only `PAIR_INTERACTION_PACKET western` for cross-chart claims:
- cross-chart major aspects and orbs,
- mutual whole-sign house overlays,
- spouse significator contacts,
- antiscia, contra-antiscia, parallel, and contraparallel contacts.

Do not create extra synastry aspects from the two natal charts. If a planet pair, angle contact, fixed-star contact, or overlay is absent from the pair packet, treat it as not supplied.

## Fixed stars
Fixed stars are a fine layer, not a basic judgment layer. Use them only when packet supplies a named hit and orb.
Prefer tight conjunction/opposition/parallel to Sun, Moon, Ascendant, MC, chart ruler, or Fortune ruler. Interpret by Ptolemaic planetary nature. Do not invent star hits from zodiac degree memory.

## Antiscia and declination
Antiscia/contra-antiscia are hidden/reflected contacts. Treat them as secondary evidence under actual aspects.
Declination parallels:
- parallel acts like a soft conjunction,
- contraparallel acts like a soft opposition,
- angular/luminary/chart-ruler contacts matter more.

## Transits and timing
Use packet transits only.
- Applying/exact transit contacts are stronger than separating contacts.
- Prioritize contacts to angles, luminaries, chart ruler, 7th ruler, 10th ruler, Fortune, and Fortune ruler.
- For annual timing, never promise an event from transit alone; connect transit to natal promise and the user's question topic.
- `timingSupport.returnCycles` is a coarse Jupiter/Saturn return-cycle aid, not a full solar/lunar return chart. Use it for return-cycle context only.
- If the question asks for Secondary Progression, Solar Return, Lunar Return, eclipses, horary, electional, astrocartography, medical astrology, rectification, mundane/event charts, harmonic charts, composite charts, Chiron, or lots beyond Fortune, check `unsupportedSpecialtyPackets`. If listed, say the current packet does not support that specialty layer and do not fabricate it.
