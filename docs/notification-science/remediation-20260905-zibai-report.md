# Zibai year-seam remediation report — 2026-09-05

## Scope

- Changed only `equationOfTimeMinutes` in `src/lib/zibai-science.ts`.
- Added `scripts/test-zibai-year-seam.mts` as a bounded numerical and active-interval regression.
- Preserved the NOAA Fourier coefficients, inverse solver, flying-star rules, calculation and payload versions, historical data, services, preferences, and delivery behavior.
- No database, network, deployment, or push-send action was performed. No full build was run.

## Root cause and correction

The old fractional-year phase divided its noon origin by the current civil year's length. At a common/leap transition, that changed the phase origin discontinuously and could make apparent solar time reverse across an adjacent UTC millisecond. The correction computes elapsed-year fraction at millisecond precision while holding the noon-origin offset at `0.5 / 365`, so the phase is continuous modulo a complete annual turn across the year seam.

This is a numerical phase correction inside the existing approximate NOAA Fourier model. It is not a change to the Fourier coefficients or the Zibai lineage/rules.

## RED

Baseline command:

```text
node --import tsx scripts/test-zibai-year-seam.mts
```

Exact failure (exit 1):

```text
AssertionError [ERR_ASSERTION]: Got unwanted exception: the reproduced leap-year seam belongs to an active snapshot
Actual message: "zibai_snapshot_active_interval_mismatch"
```

The failure occurred for `2028-01-01T00:00:00.000Z` at longitude `-14.33010681505132`, before changing production source.

## GREEN and numerical bound

Focused command:

```text
node --import tsx scripts/test-zibai-year-seam.mts
```

Exact output (exit 0):

```text
zibai year-seam regression passed: 5000 continuity cases, 45 active-interval cases, 731 numerical samples; maximum clock correction 38.198575 ms (common 2.398e-14 min, leap 6.366429187e-4 min)
```

Coverage includes Gregorian seams entering 2024, 2025, 2028, 2029, and 2100; five fixed longitudes from `-179.5` to `179.5`; critical apparent-wall targets at 23:00, 00:00, and 01:00; and seam−1 ms/seam/seam+1 ms interval containment. Adjacent apparent time remained monotonic with no step above 2 ms. Every returned month/day/shichen interval contained the requested instant and every next shichen boundary was later than it.

The old equation is retained only in the test as a named oracle. Daily second-aligned comparison over common year 2027 and leap year 2028 measured:

- Common-year maximum difference: `2.398e-14` minute, below `1e-9` minute.
- Leap-year maximum difference: `6.366429187e-4` minute = `0.038198575` second, below `0.1` second.

## Targeted regression group

The six requested test files were inspected before execution. The scheduler suite imports a DB-capable module, but its executable entry point is guarded and the test injects an in-memory query stub; no pool, network, DB write, or push send is initiated.

All ran once and passed without expectation changes:

```text
ZIBAI_SCIENCE_OK
ZIBAI_V3_BOUNDARY_LATCHING_OK
ZIBAI_MONTH_BOUNDARIES_OK
ZIBAI_THREE_LAYER_INTERPRETATION_OK 6561
ZIBAI_NOTIFICATION_PAYLOAD_OK
ZIBAI_NOTIFICATION_PAYLOAD_BYTES shichen=1594 daily=1488
ZIBAI_SCHEDULER_OK
```

## Scientific review and remaining work

The fixed `0.5 / 365` term preserves the established NOAA phase convention in common years and prevents the origin itself from changing when a leap-year denominator is selected. The year denominator still controls elapsed phase, so leap years span one complete annual cycle without introducing a seam discontinuity. The observed sub-0.04-second leap-year shift is safely bounded by the regression and is small relative to the pre-existing approximation error of this NOAA model.

Concern: this patch does not improve or independently validate the absolute astronomical accuracy of the approximate NOAA equation; it only repairs its numerical phase continuity and interval behavior. Independent review and parent integration remain required. This report is not production approval, deployment evidence, or a final goal signature.
