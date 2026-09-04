# Qimen seasonal month-boundary oracle review — 2026-09-05

Scope: independent pure test addition on backend base `75b908e`, using the existing canonical pillar, solar-term, apparent-hour, and Yanbo nine-star helper APIs. No helper/advisory/builder/calendar or door-method implementation was changed. This is task evidence, **not a final deployment signature, production approval, or goal closure**.

## Result

The new `scripts/test-qimen-seasonal-month-boundaries.mts` passes. Its expected table is literal: all twelve month branches, their elements, the five star states in 旺/相/休/囚/廢 order, and the incoming 2026 canonical month pillars are specified independently of the production relation logic. It checks the declared Yanbo method/source digest. It neither imports the external Qimen engine nor selects or tests a new door rule.

Coverage:

- Every one of the twelve Jie boundaries at T−1 ms, T, T+1 ms: **36 instants**. Outgoing and incoming month branches, full month pillars, half-open bounds, and every element's star state match the explicit oracle.
- Every intervening Zhongqi at T−1 ms, T, T+1 ms: **36 instants**. Month pillar, branch, full month window, and vigor map remain unchanged.
- Bangkok `100.5018`, New York `-74.006`, and Tokyo `139.6917` longitudes, crossed with UTC/Bangkok/New York/Tokyo timezone labels: **1,008 transport cases**, including the earth-month checks below. The year/month tuple and seasonal maps are identical at the same UTC instant. True-solar hour bounds are timezone-label independent at fixed longitude.
- Complete 丑/辰/未/戌 month windows checked at start, midpoint, and end−1 ms: **four earth months**, not an 18-day seasonal suffix. Water star is 囚 and earth star is 相 throughout under the selected Yanbo contract.
- Same-element branch transitions explicitly retain the map; different-element month transitions explicitly change it. Thus the suite does not incorrectly require a vigor change at every Jie.
- The test's final loaded-module guard confirms no external `/qimen-api/` module or pg/sqlite driver was loaded by the pure execution path.

The event timestamps are obtained from the established pinned solar-term runtime, not an independent ephemeris. This establishes consistency of canonical boundary and source-state contracts, not absolute astronomical accuracy or predictive validity.

## Actual month-versus-hour containment challenge

All **36** tested Jie/longitude combinations occur strictly inside a shichen whose bounds remain identical at T−1 ms and T. The outgoing month ends before that hour ends; the incoming month starts after that hour starts. Therefore neither adjacent month can contain the full crossing hour. This is an actual runtime interval result, not an assumed coincidence.

For 清明 at `2026-04-04T18:40:00.000Z`:

| Longitude | Shichen start UTC | Shichen end UTC |
|---|---|---|
| 100.5018 | 2026-04-04T18:21:08.930Z | 2026-04-04T20:21:07.387Z |
| −74.006 | 2026-04-04T17:59:11.084Z | 2026-04-04T19:59:09.542Z |
| 139.6917 | 2026-04-04T17:44:23.826Z | 2026-04-04T19:44:22.284Z |

At this transition, the explicit star map changes from wood-month `水木金土火` to earth-month `火土木水金`. Treating the whole shichen as one unchanged seasonal state would therefore be incorrect.

**Integration constraint, not a calendar defect:** at the reviewed base, `src/lib/qimen-canonical-occurrence-builder.cjs:282` requires the advisory's bounds to equal the canonical full hour, and `:290` obtains the actual canonical month window. The immutable snapshot verifier at `src/lib/qimen-three-layer-notification.cjs:411` rejects an hour not wholly contained in either month/day context. Consequently a recommended crossing-hour candidate cannot simply be serialized with those full-hour bounds and either adjacent month. Preserve fail-closed behavior; changing to split/intersected hour validity or changing occurrence identity requires explicit contract review. This subtask neither implements such a change nor invokes an external engine to establish a production recommendation/delivery outcome.

## Commands actually executed

```text
node --import tsx scripts/test-qimen-seasonal-month-boundaries.mts
QIMEN_SEASONAL_MONTH_BOUNDARIES_OK 36 Jie instants; 36 Zhongqi instants; 1008 longitude/timezone cases; 4 whole earth months; 36 straddling-hour containment challenges

node --import tsx scripts/test-qimen-nine-star-month-rule.mts
QIMEN_NINE_STAR_MONTH_RULE_OK 60 explicit element/month cells; source hash matched

node --import tsx scripts/test-qimen-canonical-pillars.mts
qimen canonical independent pillar tests passed

git diff --check
(no errors)
```

All exited 0. An additional process-local mutation check replaced the helper's water-star state with 相 in memory, transpiled and executed the new test in memory, and required its explicit five-label oracle assertion to fail. Output: `QIMEN_BOUNDARY_ORACLE_MUTATION_REJECTED water-star state corrupted in memory; no file changes`. This confirms that the new test detects a corrupted state rather than merely checking the helper against itself.

No network, DB connections/writes, external engine imports, push, services, deployment, or full build were performed. Parent-owned seasonal integration remains outside this test-only approval.
