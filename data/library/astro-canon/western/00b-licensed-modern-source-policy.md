# Western Licensed Modern Sources · Internal-Use Policy

> This pack is for Hourkey internal Western astrology readings only. The user has represented that web-only commercial license permission has been purchased for the listed modern sources. Use the derived rules to read user charts. Do not expose raw book text, page-by-page summaries, or source excerpts in user-facing answers.

## License Boundary

- Allowed: apply extracted concepts, classifications, matrices, and paraphrased operational rules to produce chart readings on Hourkey.
- Allowed: use the sources as internal authority for interpreting aspects, house placements, synastry, composite charts, midpoints, Chiron, psychological timing, and modern counseling language.
- Forbidden: quote or reproduce copyrighted passages, chapters, tables, example delineations, exercises, screenshots, scans, or OCR text.
- Forbidden: cite book titles/authors/publishers in normal user readings unless the product/admin UI explicitly asks for source audit.
- Forbidden: expose raw OCR, page numbers, exact paragraph sequence, or close paraphrase that lets a user reconstruct the book.
- Forbidden: export these packs to any other website, API customer, public repository, downloadable dataset, or model training corpus outside the licensed Hourkey use.
- User-facing answer style: do not say “according to [author/book]”. Say the chart judgment directly.

## Internal Source Families Purchased / Targeted

Use these families only as internal operating rules after extraction:

1. **Modern natal aspect matrix**
   - Planet-to-planet aspect meanings.
   - Aspect type modifiers: conjunction, sextile, square, trine, opposition, inconjunct/quincunx, selected minor aspects.
   - Psychological conflict/integration language.

2. **Modern house and ruler-depth layer**
   - Planet in house.
   - House ruler in another house.
   - House connections and topic flow.
   - Psychological domain nuance for houses.

3. **Aspect-pattern layer**
   - T-square, Grand Trine, Grand Cross, Yod, Kite, mystic rectangle, stellium, unaspected planets.
   - Apex/focal planet logic.
   - Pattern priority and repeated-theme weighting.

4. **Midpoint / cosmobiology layer**
   - Planetary midpoint pictures.
   - Asc/MC/Node midpoint handling.
   - Compact event/psychological synthesis from A=B/C style pictures.

5. **Synastry / relationship layer**
   - Inter-aspects between charts.
   - House overlays A-in-B and B-in-A.
   - Venus/Mars/Moon/Sun relationship needs.
   - Saturn, Node, angle, and luminary contacts.
   - Composite chart and Davison chart, when computed.

6. **Outer planet / psychological depth layer**
   - Uranus/Neptune/Pluto contacts to luminaries, angles, personal planets.
   - Generational pressure versus personal trigger distinction.
   - Projection, complex, fate-language safety, and transformation framing.

7. **Chiron layer**
   - Chiron sign/house/aspect, Chiron return, wound/healing theme.
   - Use only when Chiron is computed and supplied in packet. Do not invent Chiron when unsupported.

8. **Predictive modern layer**
   - Transits to natal planets/angles.
   - Progressions, solar arcs, return charts, progressed synastry only when packet supplies the computed data.

## Source Handling Rule

Raw purchased files must stay under:

`private/restricted-sources/western/incoming/`

Extracted working notes must stay under:

`private/restricted-sources/western/extracted/`

Only short internal rule packs may be copied into:

`data/library/astro-canon/western/`

Before copying any rule into `data/library`, rewrite it as:

- a chart-field rule,
- a matrix row,
- a weighting rule,
- a topic rule,
- or an output guard.

Do not copy prose commentary from a purchased source.

## User-Facing Output Rule

When using this licensed layer, the AI must:

1. Read the actual chart packet first.
2. Choose the relevant modern rule family.
3. Bind every claim to a chart-specific anchor: planet, aspect, house, ruler, angle, lot, midpoint, or synastry contact.
4. Answer decisively when evidence is present.
5. Avoid broad horoscope language.
6. Avoid source credits and book references in normal readings.
7. Avoid raw excerpts.

## Missing File Status

As of this policy file, the server has ingested the accessible public-domain / official-excerpt Western source library (174 files in the private manifest), but still has no purchased full-book files in the restricted incoming folder. Official public product pages checked from the server do not expose full PDF/EPUB links without account/order access. Ingestion should proceed after the authorized download URLs or purchased files are placed in the private incoming folder.
