# Western Dignity, Lots, Sect, And Specificity Pack

> Runtime derived summary for Fusion Western. This pack turns the retained classical, medieval, early-modern, public-domain modern-bridge, and licensed-internal source corpus into an operational weighting layer. It is not raw source text and must not be quoted or exposed to users.

## Purpose

Use this pack when the packet supplies `sect`, `partOfFortune`, `lots`, `minorDignity`, `topicLordMatrix`, `houseRulers`, `dispositors`, or `dominantPlanets`.

It exists to prevent broad Western readings. A Western answer should not stop at "Venus in a sign" or "10th house is important." It must say why this specific planet has strength, weakness, local authority, topic rulership, and practical consequence in this chart.

## Evidence Order

For every natal topic, weigh in this order:

1. **Topic anchor**: relevant house, angle, lot, planet, or topic row from `topicLordMatrix`.
2. **Ruler chain**: house ruler, chart ruler, dispositor, and dominant planet fields supplied by the packet.
3. **Essential dignity**: rulership/exaltation first, detriment/fall as hard weakness.
4. **Minor dignity**: active triplicity, term/bound, face/decan, and `minorDignity.score`.
5. **Sect and angularity**: day/night fit, house position, angle contacts, and whether the planet is operative or hidden.
6. **Aspects and hidden contacts**: applying major aspects first, then minor aspects, antiscia/contra-antiscia, parallels/contraparallels.
7. **Fixed stars and degree lore**: only as a secondary amplifier when the packet gives a hit to an angle, luminary, chart ruler, lot, or topic planet.
8. **Timing**: supplied transits and return cycles can activate the natal promise; they do not replace the natal promise.

Do not let a weak dignity but dramatic aspect become a confident promise unless house/topic repetition supports it. Do not let one fixed-star or degree indication override house ruler and dignity evidence.

## Minor Dignity Interpretation

Use only packet fields. Do not calculate terms, triplicities, or faces from raw degrees.

- `activeTriplicityLord` shows elemental backing by sect. If the planet is its own active triplicity lord, it can perform competently even without rulership/exaltation.
- `termLord` shows the local manager of the planet's degree. If a planet is in another planet's term, describe whose agenda or style colors the result.
- `faceLord` is the lightest support. It can make a weak planet usable in narrow, visible, skill-based ways, but cannot cancel detriment/fall alone.
- `peregrine=true` means the planet lacks supplied essential dignity. Treat it as needing external support from house, aspect, ruler, or timing before giving a strong promise.
- `minorDignity.score` is internal weight. Do not show the number to users unless the user asks for audit.

Practical wording:

- Rulership/exaltation + topic house: "can act directly."
- Triplicity/term support but no major dignity: "has a workable route but depends on context or allies."
- Face only: "specific talent/visibility, not broad stability."
- Detriment/fall: "works through friction, reversal, overcompensation, or needing discipline."
- Peregrine with hard aspects: "scattered, reactive, or dependent on stronger planets."

## Sect Rules

Use `sect` only when the packet supplies birth time.

- Day charts emphasize Sun/Jupiter/Saturn style of visibility, law, structure, public life, and daylight accountability.
- Night charts emphasize Moon/Venus/Mars style of embodiment, desire, emotional life, private action, and night-side urgency.
- A benefic of sect has cleaner support. A benefic contrary to sect can still help but may require adjustment.
- A malefic of sect is more manageable and constructive. A malefic contrary to sect is sharper and must be handled with boundaries.
- If `hasBirthTime=false`, do not infer sect and do not use lots/angles/houses.

## Lots And Part Of Fortune

Use lots only from `lots` and `partOfFortune`. Do not invent additional lots.

General rule:

1. Read the lot's sign and house.
2. Read the lot ruler's dignity, house, aspects, and topic relevance.
3. Read contacts to the lot only when the packet supplies them.
4. Translate into a concrete life channel.

Topic use:

- **Part of Fortune**: livelihood, bodily fortune, material ease, cashflow channels, and where life becomes materially workable.
- **Spirit**: intention, calling, chosen action, career direction, agency.
- **Eros**: attraction, creative pull, pleasure, romance, desire.
- **Necessity**: duty, pressure, constraint, obligations, unavoidable work.
- **Courage**: confrontation, risk, contest, assertion, protection.
- **Victory**: winning strategy, public success, competition, visible achievement.
- **Nemesis**: cost, restraint, consequence, rivalry, hidden backlash.

Do not use a lot alone. A lot becomes strong only when its ruler and relevant house/topic chain repeat the same message.

## Topic-Specific Use

### Career

Use MC/10th, 10th ruler, chart ruler, Sun, Saturn, Mercury, Spirit, Victory, dominant planets, and timing contacts.

Strong career verdict requires at least two of:

- 10th ruler or MC strongly dignified/active,
- chart ruler tied to 10th/6th/11th/2nd,
- Spirit or Victory tied to angular/work/income houses,
- dominant planet repeats the work theme,
- transits/return cycles activate career factors.

Name the work channel from the actual planet/house chain: authority, analysis, commerce, writing, technical systems, beauty/arts, law/teaching, property, finance, hidden/backstage work, service, or public leadership.

### Money

Use 2nd/8th/11th, Part of Fortune, Fortune ruler, Venus/Jupiter/Mercury, and Saturn for long-term structure or scarcity.

Separate:

- earning,
- savings/assets,
- gains/network,
- debt/shared money,
- risk/speculation,
- leakage.

If Fortune is strong but 2nd ruler is weak, say money opportunities exist but retention needs structure. If 2nd is strong but Fortune is pressured, say income can be built but ease/luck is not automatic.

### Relationship

Single chart: use 7th, 7th ruler, Venus, Moon/Sun spouse significator by gender when supplied, Eros, Necessity, and hard/soft aspects.

Pair mode: use `PAIR_INTERACTION_PACKET western` as the closed cross-chart list. House overlays, angle contacts, and lots in synastry are valid only when both birth times are known.

Separate:

- attraction,
- emotional fit,
- stability,
- pressure/duty,
- public/family support,
- timing.

Do not declare marriage or separation from Venus alone, Eros alone, or one synastry aspect.

### Health / Routine

Use 1st/6th/12th, chart ruler, Moon, Saturn, Mars, Nemesis, and supplied timing. Use symbolic caution, not diagnosis.

Allowed: vitality, workload, sleep, stress, inflammation symbol, chronic pressure, habit correction, check-up.

Forbidden: disease naming, medication, surgery instruction, death prediction.

### Travel / Foreign / Study

Use 3rd/9th/12th, their rulers, Mercury/Jupiter/Moon, Spirit, Fortune, and timing. Separate short travel, foreign clients, relocation, distance relationship, retreat, hospital/rest/isolation, and study/teaching.

## No-Time Mode

When birth time is missing:

- Use planet signs, dignities, minor dignity, aspects, retrograde/combustion if supplied, element/modality balance, and planet-to-planet transits.
- Close Ascendant, MC, houses, house rulers, lots, sect, chart ruler, Fortune, angle contacts, and house overlays.
- Moon may be useful but should be marked conditional if the date could shift the Moon's sign/nakshatra/degree enough to change judgment.

The answer should remain useful, but it must say "this is a planet-sign/aspect reading, not a house/lot reading."

## Output Rule

Every Western evidence bullet should contain:

- the concrete field from the packet,
- the dignity/lot/sect/house/aspect condition,
- the life consequence,
- and whether it is a main verdict, support, or caution.

Bad: "Your money is good because Jupiter helps."

Good shape: "Money is tied to X because Fortune/2nd ruler is in Y house/sign with Z dignity/aspect; this points to [specific channel], while [specific pressure] means [practical caution]."
