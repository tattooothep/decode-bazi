# Western Licensed Modern Extraction Framework

> Operational target for turning licensed modern Western astrology books into safe internal rule packs. This is a framework, not a copy of any purchased book.

## Extraction Output Types

Every extracted idea must become one of these safe forms:

- `aspect_matrix`: planet A, planet B, aspect type, support tone, friction tone, topic tags.
- `aspect_modifier`: dignity, house, sect, applying/separating, retrograde, combustion, angularity, orb band, pattern membership.
- `house_matrix`: planet or ruler, house, topic domain, constructive expression, stress expression.
- `synastry_matrix`: owner A point, owner B point/house, direction, relationship domain, attraction/support/friction/commitment tags.
- `composite_matrix`: composite placement/aspect, relationship-as-entity theme, strength, stress, action advice.
- `midpoint_matrix`: midpoint picture, topic tags, constructive expression, stress expression.
- `pattern_matrix`: pattern type, focal/apex planet, required geometry, life expression, handling advice.
- `timing_matrix`: transit/progression/solar arc/return trigger, orb/time window, event domain, caution.
- `counseling_language`: safe phrasing templates that are direct but not fatalistic.

## Priority A · Natal Aspect Matrix

Build rows for:

- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn.
- Add Uranus, Neptune, Pluto as modern depth layer.
- Add Ascendant and MC contacts when packet supplies angles.
- Add Chiron only after Chiron support exists in the engine packet.

For each pair:

1. conjunction
2. sextile
3. square
4. trine
5. opposition
6. quincunx/inconjunct

Each row should contain:

- `core_dynamic`: what the two functions are trying to do together.
- `support_expression`: how it works when integrated.
- `stress_expression`: how it fails or overcompensates.
- `topic_bias`: likely life topics when connected to houses/rulers.
- `body_mind_note`: only general wellness language; not medical diagnosis.
- `career_note`
- `money_note`
- `relationship_note`
- `timing_note`
- `avoid_language`: words that overstate or frighten.

## Priority B · House / Ruler Connection Matrix

Build:

- planet in house 1-12
- ruler of house X in house Y
- angular/succedent/cadent modifier
- hidden houses 6/8/12 modifier
- social houses 7/10/11 modifier

Rules:

- House meaning must be bound to planet condition.
- Ruler connections must explain “source house sends energy to target house”.
- Do not make house keywords generic; tie them to topic matrix.

## Priority C · Synastry Matrix

Build directional rows:

- A Sun/Moon/Mercury/Venus/Mars/Jupiter/Saturn/ASC/MC/Node to B Sun/Moon/Mercury/Venus/Mars/Jupiter/Saturn/ASC/MC/Node.
- A planet overlay in B house 1-12.
- B planet overlay in A house 1-12.

Each row must split:

- `support_factor`
- `friction_factor`
- `attraction_factor`
- `commitment_factor`
- `communication_factor`
- `sexual_or_drive_factor`
- `emotional_safety_factor`
- `practical_advice`

Output rule:

- Always name direction: A affects B or B affects A.
- House overlays are asymmetric.
- Saturn/Node/angle/luminary contacts get priority.
- Do not summarize a relationship as one score unless a scoring policy is explicitly supplied.

## Priority D · Composite / Davison

Only use after the engine computes composite/Davison fields.

Needed packet fields:

- composite planets/signs/houses
- composite aspects
- composite ASC/MC
- Davison date/time/place if supported
- transits/progressions to relationship chart if supported

Extract:

- relationship identity
- emotional climate
- conflict style
- commitment/structure
- money/shared resources
- public/social function
- sexual/creative chemistry
- long-term growth pressure

## Priority E · Midpoints

Needed packet fields:

- midpoint list
- midpoint hits by conjunction/opposition/square or 90-degree dial mode
- orb
- point/planet owner

Extract rows as:

- midpoint picture key
- psychological theme
- event trigger theme
- relationship theme
- career/money theme
- risk of overstatement

Midpoints should not override the natal chart by themselves. They confirm or sharpen themes already shown by planets, houses, aspects, angles, or timing.

## Priority F · Aspect Patterns

For each pattern:

- exact geometry definition
- involved planets
- focal/apex planet
- release point if applicable
- constructive expression
- stress expression
- practical handling

Priority:

1. Tight orb pattern involving luminary/angle/chart ruler.
2. Pattern involving personal planets.
3. Pattern involving only outer planets = background unless it contacts personal points.

## Priority G · Predictive Timing

Only use when the packet supplies computed timing fields.

Fields needed:

- exact transit windows
- applying/separating
- first exact / retrograde exact / final exact
- transit house
- natal house ruled by transiting planet
- progressed Moon/Sun/angles if available
- solar arc direction if available
- solar/lunar return if available

Output:

- date range, not fake precision.
- theme by planet + natal point + house/topic.
- action advice.
- caution if medical/legal/financial.

## Safety Conversion Rules

- Convert fatalistic phrases into concrete tendencies.
- Do not predict death, disaster, divorce, or illness as certainty.
- For health, say “astrological caution around...” and advise professional help for real symptoms.
- For money/legal/marriage, say what the chart favors/warns, not what the user must do.
- Be decisive about the chart signal, but not coercive about life decisions.

## Ingestion Checklist

Before marking a licensed extraction usable:

1. Confirm file exists under `private/restricted-sources/western/incoming/`.
2. Record filename, checksum, purchase/license note, and allowed scope.
3. Extract text privately.
4. Create derived matrix/rule rows.
5. Remove raw quotes.
6. Add “do not cite source” guard.
7. Run Fusion canon contract test.
8. Run at least one single-chart and one pair-chart prompt check.
