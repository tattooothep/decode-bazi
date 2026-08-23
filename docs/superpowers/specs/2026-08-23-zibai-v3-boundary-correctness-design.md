# Zi Bai V3 Boundary Correctness Design

**Status:** Approved by the user on 2026-08-23 and signed by five independent auditors.

## Incident

On the Bangkok apparent-solar day `2026-08-23` (`己巳`), the same advertised
day interval produced centre star `4` before the exact `處暑` instant and centre
star `7` after it. The producer sampled one current solar-term reference for
all three layers, while the wire contract advertised the day map as immutable
for the complete apparent-solar `[23:00, next 23:00)` interval.

The delivery queue and FCM submission did not corrupt the data. The science
snapshot and its stated validity interval contradicted each other.

## Selected Policy

Hourkey Zi Bai V3 uses independent half-open anchors for each layer:

- Month: calculate at the requested instant. Month boundaries remain exact,
  global `節` instants and remain independent of longitude and DST.
- Day: calculate the day pillar and six-period selector at the exact solved
  start of the current true-apparent-solar day. Keep the day map fixed for the
  complete `[day.start, day.end)` interval.
- Shichen: calculate the branch and half-year selector at the exact solved
  start of the current true-apparent-solar shichen. Keep the hour map fixed for
  the complete `[shichen.start, shichen.end)` interval.
- If a solar-term instant equals a layer start exactly, the incoming regime is
  active for that new half-open interval.

For the reported Bangkok incident, the complete `己巳` day remains centre `4`.
The next apparent-solar day (`庚午`) begins centre `6`. The raw `巳` shichen may
also have centre `7`; equality between the incorrect V2 day map and the hour map
was coincidental.

## Implementation Boundary

The generic `computeFlyingLayers` function retains its existing instant-based
behavior for other callers. `buildZibaiSnapshot` becomes the Zi Bai notification
policy boundary and performs separate pure calculations for month, day, and
shichen using their respective anchors.

The calculation version changes to `zibai-zaoming-true-solar-v3`. Payload shape
`snapshotSchema: 2` and interpretation version `zibai-3layer-rule-v1` remain
unchanged. Readers accept the closed set V2/V3 and require the reference suffix,
payload calculation version, occurrence version, and source facts to agree.

## Compatibility and Durability

- Existing V1/V2 history remains byte-for-byte immutable and readable.
- New occurrences are V3 only after activation.
- Logical occurrence uniqueness is independent of calculation version so a
  rollout cannot send the same daily or shichen slot once as V2 and again as V3.
- Unknown versions fail closed.
- Mobile ships V3 parser support before or with backend V3 activation.
- Production activation uses a committed release and atomic release-link swap;
  the running service is not stopped.

## Failure Gates

Before persistence, the producer rejects a snapshot unless:

- the requested instant is inside all advertised active layer intervals;
- day and shichen maps are invariant at the start, interior probes, and final
  millisecond of their declared intervals in regression tests;
- each layer is an exact permutation of stars `1–9`;
- version fields and reference identifiers agree; and
- the installation is activated for the producer calculation version.

## Acceptance Tests

1. `處暑 2026` at Bangkok: `T-1ms`, `T`, and `T+1ms` retain the same `己巳`
   day map and bounds; only the next day boundary changes to `庚午` centre `6`.
2. All six daily period anchors across Bangkok, Greenwich, New York, and Sydney:
   equal day bounds imply equal day map, flight, and pillar.
3. `夏至` and `冬至` inside a shichen cannot change its map or flight before
   the next shichen boundary.
4. All twelve month `節` boundaries still change exactly at the global instant.
5. Daily and shichen notifications on opposite sides of an internal term share
   the same V3 day map.
6. Backend and mobile accept valid V2 and V3, reject mixed/unknown versions,
   and preserve V2 history.
7. Cross-version logical duplicate admission is rejected.
8. Full Zi Bai science, payload, scheduler, migration, delivery, history,
   cross-repository E2E, TypeScript, and production build gates pass.

## Rollback

Rollback swaps the release link to the preceding committed release and applies
the forward-compatible activation rollback that changes active installation
rows back to V2 without deleting V3 occurrence history. Existing V3 history
remains readable by the compatibility release.
