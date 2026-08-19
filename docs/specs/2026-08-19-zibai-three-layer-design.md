# Zi Bai Three-Layer Month–Day–Shichen Design

Date: 2026-08-19  
Status: visual direction approved; written contract awaiting final confirmation  
Scope: Zi Bai science snapshot, notification payload/copy, and mobile detail screen

## 1. Goal

Show the solar-term month (`月盤`), apparent-solar day (`日盤`), and shichen
(`時盤`) together in one nine-palace table, then explain how the three temporal
layers interact in each sector without turning them into a fake numeric score.

The design must answer questions such as:

- What does `month 9 + day 9 + shichen 9` in the same sector mean?
- What does a mixed pattern such as `month 9 + day 5 + shichen 2` mean?
- Which layer describes persistence, which describes the current day, and which
  provides the immediate action?

This remains time-based Zi Bai. It is not Period 9, a house flying-star chart,
a natal chart, a Qi Men score, or a deterministic prediction.

## 2. Confirmed product decisions

1. Use one Lo Shu `3 × 3` table. Every palace contains three labelled rows:
   month, day, and shichen.
2. Tapping a palace opens one interpretation sheet for that direction.
3. A mixed pattern uses **caution-first** wording while preserving supportive
   context. Supportive stars never cancel a caution layer.
4. Do not add, subtract, average, multiply, rank, or percentage-score the three
   layers.
5. `9 + 9 + 9` is described as a three-layer temporal convergence. It is not
   “three times luck,” and it is not evidence from Period 9.
6. Star colors identify stars. A separate glyph and text communicate support,
   caution, mixed, or reference-only states. The entire sector must not be
   filled red or green.
7. Daily notification history contains month + day only. It must not attach one
   arbitrary shichen chart to a 24-hour summary.
8. A shichen occurrence contains all three layers and their immutable bounds.

Approved visual reference:

`https://qimen3ai.com:8443/mockups/zibai-three-layer-design-v1-20260819.png`

## 3. Canonical science

### 3.1 Existing engine

`computeFlyingLayers` in `src/lib/fengshui-luxing.ts` remains the only canonical
source. It already returns:

- `month_stars`;
- `day_stars`; and
- `hour_stars`.

The current defect is a contract omission: `buildZibaiSnapshot` discards
`month_stars`, and payload, copy, parser, and UI therefore expose only day and
shichen.

No new simplified formula or fallback is allowed.

### 3.2 Month chart

The month chart follows the existing reviewed formula:

> 子午卯酉八白求，辰戌丑未五宮游，四孟之年從二黑，逆尋月份順宮流

Contract:

- Determine the initial centre star from the year-branch group.
- Number months as `寅=1 ... 丑=12`.
- Determine the month centre by descending through the month sequence.
- Fly the resulting month chart forward through the Lo Shu path.
- Change months at the twelve section boundaries (`節`), not at every one of
  the twenty-four solar terms and not at Gregorian or lunar month boundaries.
- Required boundaries are `立春, 驚蟄, 清明, 立夏, 芒種, 小暑, 立秋, 白露,
  寒露, 立冬, 大雪, 小寒`.
- The global solar-term instant must not move with longitude or DST.

The local corpus supports the formula behavior, but its exact classical-book
attribution remains medium-confidence. The product must label the school and
calculation version rather than claim universal consensus.

### 3.3 Day and shichen charts

- The Zi Bai day changes at `23:00` true apparent solar time.
- The shichen chart changes at each two-hour true-apparent-solar boundary.
- The month solar-term instant remains global; longitude affects apparent day
  and shichen fields, not the solar-term transition instant.
- Every layer must be an exact permutation of stars `1–9` over the nine
  palaces. Any invalid layer rejects the complete snapshot.

### 3.4 Temporal roles

The three layers have different roles, not numeric weights:

| Layer | Role | User-facing meaning |
|---|---|---|
| Month | persistent background | a recurring theme from the current section boundary to the next |
| Day | daily condition | the context from apparent-solar 23:00 to the next 23:00 |
| Shichen | immediate trigger | the practical action or restraint for the current two-hour period |

The month is not “weaker” and the shichen is not “worth more points.” The
shichen leads the immediate action because its time horizon is current, while
day and month constrain and explain that action.

## 4. Interpretation contract

### 4.1 Evidence per sector

For each of `N, NE, E, SE, S, SW, W, NW, C`, derive:

- month, day, and optional shichen star;
- star element for each layer;
- palace element;
- star–palace relation for each layer;
- repeat count and repeated layers;
- pattern class;
- caution and action codes; and
- immutable layer bounds.

Relations retain the existing meanings:

- `same-element`: the same quality is reinforced;
- `palace-generates-star`: the palace nourishes the star;
- `star-generates-palace`: the star expresses/spends energy into the palace;
- `palace-controls-star`: the palace restrains the star;
- `star-controls-palace`: the star acts against the palace, creating friction.

A relation modifies expression; it does not turn a caution star into an
auspicious star or erase a caution.

### 4.2 Pattern classes

Use fixed, versioned codes:

- `three_layer_same_star` — the same star is present in month, day, and shichen;
- `two_layer_same_star` — the same star repeats in exactly two layers;
- `aligned` — different layers have compatible practical themes;
- `supportive_contested` — supportive context exists but one or more palace
  relations restrain or conflict with it;
- `mixed_caution_priority` — support and caution coexist;
- `heightened_caution` — repeated caution, especially when Five Yellow is
  present; and
- `reference_only` — the local corpus does not support a bounded verdict beyond
  star identity, element, relation, and temporal role.

Do not expose a confidence percentage. Separate data validity
(`complete | invalid`) from pattern coherence
(`concentrated | repeated | aligned | mixed | contested`).

### 4.3 Current supported guidance scope

Version 1 may give bounded practical guidance for the already reviewed focus
stars:

- `一白 1` — planning, communication, calm and clarity;
- `二黑 2` — order, adequate rest, and avoiding overexertion, without medical
  diagnosis;
- `五黃 5` — keep the sector calm and avoid drilling, demolition, pounding, or
  strong vibration, without predicting certain harm; and
- `九紫 9` — light, visibility, presentation, creative activity, and thoughtful
  communication.

Stars `3, 4, 6, 7, 8` must still appear in the complete table with their name,
element, layer, direction, and palace relation. Until a versioned non-Period
source is approved, they remain `reference_only`; the application must not
invent auspicious/caution copy from Period-9 valuations or modern dictionaries.

### 4.4 Three Nine Purple layers

For `month 9 + day 9 + shichen 9` in one sector:

1. Emit `three_layer_same_star` and `concentrated`.
2. State that Nine Purple is repeated continuously across the three temporal
   horizons in the current shichen.
3. Explain the relation to the sector's palace element separately for all three
   layers. Since the star and palace are the same for each layer, the relation
   repeats as well.
4. Offer a bounded Nine Purple action only when appropriate to that relation.
5. Always state that the pattern is not “three times luck” and is not Period 9.

Example for an eastern sector:

> เดือน–วัน–ยามซ้อน 九紫 ที่ทิศตะวันออก วังไม้生ดาวไฟ คุณลักษณะด้านการมองเห็น
> และงานสร้างสรรค์จึงถูกย้ำต่อเนื่องสามช่วงเวลาในยามนี้ ใช้เป็นจุดเน้นอย่าง
> พอดี ไม่ได้หมายถึงโชคสามเท่าและไม่ใช่ดาวยุค 9

The same `9–9–9` in a water palace must say that the palace restrains fire and
must not receive a fully supportive label.

### 4.5 Mixed example: month 9 + day 5 + shichen 2

This combination is `mixed_caution_priority`:

- month 9 remains visible as a background opportunity;
- day 5 provides a disruption/quiet-space caution;
- shichen 2 drives the immediate action: reduce strain, keep the sector orderly,
  and avoid overexertion;
- Nine Purple does not cancel Five Yellow or Two Black; and
- copy must not diagnose illness, promise harm, or call the sector permanently
  bad.

The headline is:

> ผลผสม — ให้ความสำคัญกับข้อควรระวังก่อน

### 4.6 Centre palace

`C / 中宮` participates in all three star maps and may show convergence. It is
not a compass travel direction. Its action copy refers to the centre of the
space, never “travel toward centre.”

## 5. Mobile experience

### 5.1 Main screen

The main Zi Bai detail screen contains:

1. title and disclaimer;
2. three exact period labels and bounds;
3. a visible `N ↑` orientation marker;
4. one Lo Shu `3 × 3` table;
5. one legend; and
6. a tap target for each entire palace.

Each palace shows exactly three labelled rows:

```text
NW
เดือน  [9]
วัน    [9]
ยาม    [9]
ซ้อน 3 ชั้น
```

For daily history, the shichen row is explicitly unavailable. The client must
not compute a current shichen and mix it into an old immutable daily snapshot.

### 5.2 Color and symbols

- Circular chip color identifies the star.
- `✓` with text means supported focus guidance.
- `!` with text means caution.
- `±` with text means mixed, caution-first.
- `•` with text means reference-only.
- Cell background remains neutral.
- Color is never the only signal.

The screen states:

> ดาว 9 เก้าม่วงเป็นดาวของชั้นเวลา ไม่ใช่ยุค 9 สีไม่ใช่คำตัดสินบ้าน

### 5.3 Palace sheet

Tapping a palace opens a bottom sheet containing:

- direction and palace element;
- month/day/shichen star identity;
- exact bounds for each layer;
- star–palace relation for each layer;
- repeat or mixed pattern explanation;
- caution-first headline when mixed;
- one bounded immediate action; and
- the no-Period-9/no-house-verdict disclaimer.

### 5.4 Accessibility and responsive fallback

- Each palace is one accessible button with at least a `44 × 44` target.
- Screen readers announce direction, month star, day star, shichen star, pattern,
  and “double tap for interpretation” once.
- Child labels are hidden from accessibility to prevent duplicate speech.
- At large font scales, switch to nine direction rows with three columns rather
  than shrinking text or requiring horizontal scrolling.
- Opening the sheet moves focus to its heading; closing returns focus to the
  originating palace.

## 6. Immutable payload v2

Do not add keys to the existing exact-key payload. Introduce a distinct schema
that new mobile clients explicitly advertise support for.

Required top-level metadata:

- `snapshotSchema: 2`;
- `calculationVersion`;
- `interpretationVersion: "zibai-3layer-rule-v1"`;
- account, notification, event, reference, route, and immutable occurrence
  identifiers.

Required layers:

```text
month:
  palaces, startAt, endAt
  yearBranch, monthBranch, jieqiMonth
  startTermCode, endTermCode, flight

day:
  palaces, startAt, endAt
  apparentSolarDate, dayPillar, flight

shichen:
  palaces, startAt, endAt, key, flight
  or null for a daily occurrence
```

Required sector records for all nine palaces:

```text
direction
palaceElement
month/day/shichen: star, starElement, relation
repeatCount, repeatedLayers
patternCode, coherenceCode
warningCodes, actionCode
```

Validation requirements:

- exact own enumerable primitive/data fields only;
- exact map keys and exact permutations `1–9`;
- exact relations derived from map + palace element;
- valid non-overlapping nested bounds;
- month boundaries match the named solar terms;
- sector records must reproduce deterministically from the three maps;
- no coordinates, house identity, Period-9 values, natal data, Qi Men scores, or
  floor-plan data; and
- FCM, Expo, durable history, and opened detail use the same immutable snapshot.

### 6.1 Compatibility

1. New app versions first accept both legacy two-layer payloads and v2 payloads.
2. Legacy history displays two layers with: “รายการเก่ายังไม่มีข้อมูลเดือน.”
3. Backend sends v2 only to installations that advertise the exact capability.
4. Do not infer capability from a version string alone.
5. After adoption is proven, v2 becomes the default for capable installations;
   legacy clients continue receiving the old exact payload.

## 7. Notification copy

Do not place all 27 star entries in lock-screen copy. The notification contains:

- solar-term month name and bounds;
- the most important repeated focus pattern, if any;
- the most important caution layer, if any;
- explicit “not Period 9” wording when Nine Purple repeats; and
- a prompt to open the full nine-palace table.

Example:

> เดือน申 立秋→白露 · 九紫ซ้อนเดือน–วัน–ยามที่ตะวันตกเฉียงเหนือ — ไม่ใช่ยุค 9
> · ชั้นวันมี五黃ที่เหนือ แตะดูครบ 9 วัง

Copy remains within the existing provider limit and retains generic redaction
when privacy preview is off.

## 8. Failure behavior

Fail closed and show no partial v2 chart for:

- missing or invalid month metadata;
- any invalid star permutation;
- invalid or contradictory bounds;
- month transition moved by longitude or DST;
- semantic sector records that do not match the maps;
- unsupported interpretation version; or
- malformed capability negotiation.

History after expiry still shows the original immutable chart with “ช่วงเวลานี้
สิ้นสุดแล้ว.” It never recomputes from current location or current time.

## 9. Tests and acceptance

### 9.1 Science

- all three year-branch groups × all twelve solar-term months;
- one second before, at, and after all twelve `節` boundaries;
- all twelve intermediate `中氣` boundaries must not change the month;
- `立春` changes year and month consistently;
- longitude and DST must not move the month boundary instant;
- month/day/shichen maps are exact permutations;
- daily 23:00 and every shichen boundary remain exact; and
- mutation gates reject Period-9 and simplified formulas.

### 9.2 Interpretation

- all `9³ × 9 = 6,561` layer/sector combinations are deterministic;
- `1–1–1`, `2–2–2`, `5–5–5`, and `9–9–9` across every palace element;
- `9–5–2` and other mixed permutations remain caution-first;
- adding a supportive star never removes `five_present` or another warning;
- restraining a caution star never returns a fully supportive verdict;
- changing layer order may change the immediate action but not erase safety
  evidence; and
- unsupported stars remain reference-only rather than receiving invented copy.

### 9.3 Contract and UI

- exact v2 parser mutation tests;
- legacy v1 history still opens;
- capability negotiation prevents v2 delivery to old APKs;
- provider envelope, durable history, and mobile parser parity;
- payload headroom and TH/EN/ZH copy limits;
- all nine sectors and 27 entries rendered;
- sheet examples for `9–9–9` and `9–5–2`;
- large-font list fallback and screen-reader order;
- privacy-off redaction; and
- no Period-9, house, natal, Qi Men, or coordinate leakage.

## 10. Rollout

1. Add science and schema behind a disabled capability flag.
2. Add dual-version mobile parser and UI without changing producers.
3. Replay sanitized monthly boundary and triple-layer fixtures.
4. Enable v2 for internal canary installations only.
5. Verify physical-device layout, history, cold/warm taps, privacy, and
   accessibility.
6. Run three independent source reviews on exact clean backend/mobile commits.
7. Build and verify artifact provenance.
8. Enable v2 producer capability gradually; retain v1 rollback.

### 10.1 Three-signature hard gate

The feature is not accepted, released, or described as complete until three
independent agents each return `SIGNED APPROVE` for the same exact clean backend
commit, mobile commit, and built artifact. An approval for an older commit does
not carry forward. Any code or artifact change invalidates all earlier
signatures. Any `SIGNED REJECT` stops release; after correction all three reviews
restart from the replacement exact hashes. The implementation agent cannot sign
its own work.

## 11. Non-goals

- Period-9 prosperity or house-chart judgment;
- house sitting/facing, floor-plan identity, or natal personalization;
- Qi Men ranking changes;
- numeric good/bad scores;
- claims of “three times luck” or “three times danger”;
- medical diagnosis or certain-harm predictions;
- recomputing old notifications with current location/time; and
- adding a separate monthly notification toggle in this phase.

## 12. Evidence and known limits

The implementation must cite and test the current month formula in
`src/lib/fengshui-luxing.ts`. The local corpus does not yet provide a named
primary-book attribution for that exact month verse, so the UI must present the
calculation school/version honestly. Before expanding practical good/bad copy
beyond stars `1, 2, 5, 9`, a new source review and interpretation-version bump
are required.
