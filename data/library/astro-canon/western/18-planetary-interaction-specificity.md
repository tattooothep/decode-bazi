# Western Planetary Interaction, Aspect, And Contact Specificity Pack

License mode: summary-only operational rule pack. Use for Hourkey runtime readings only. Do not expose raw OCR, licensed source prose, page order, or private source file paths.

## Purpose

Use this pack when the user asks about "ปฏิกิริยาดาว", "ดาวกระทบกัน", "มุมดาว", "ดาวชน", "aspect", "conjunction", "opposition", "square", "trine", "sextile", "parallel", "antiscia", or planetary contact questions in Western astrology.

This pack routes the existing public-domain interaction rules into a stricter answer contract. The AI must answer the specific contact, not give a generic planet description.

## Interaction Chain

1. Name the two bodies/points and their chart roles: chart ruler, luminary, house ruler, topic lord, Venus/Mars, Saturn/Jupiter, lot, angle, fixed star target, or pair-packet owner.
2. Name the contact: aspect type, orb, applying/separating, hidden contact, declination/parallel, antiscia, fixed-star hit, or closed synastry packet contact.
3. Judge capacity: essential dignity, minor dignity, sect, reception, retrograde/combustion if supplied, and house/angle strength.
4. Bind to the topic house/ruler requested by the user.
5. Translate into concrete behavior: support, friction, delay, mediation, overreach, attraction, conflict, visibility, leakage, or discipline.

## Contact Weighting

- Luminary, Asc/MC, chart ruler, topic ruler, Fortune/Spirit, Venus/Mars/Saturn contacts outweigh minor contacts.
- Applying contacts are active/building; separating contacts are established patterns.
- Reception can make hard aspects workable; poor dignity can make easy aspects weak.
- Minor aspects, antiscia, parallels, and fixed stars are secondary unless tight and tied to angle/luminary/topic lord.
- Pair mode must use owner direction from `PAIR_INTERACTION_PACKET western`; house overlays are asymmetric.

## Output Contract

For planetary interaction answers, include:

- one contact line naming both planets/points and aspect/contact type,
- one role line naming each body's chart role/house/topic,
- one capacity line naming dignity/sect/reception/applying-orb if supplied,
- one support-versus-friction line,
- one concrete topic consequence,
- one guard line if the requested contact is unsupported or not in the packet.
