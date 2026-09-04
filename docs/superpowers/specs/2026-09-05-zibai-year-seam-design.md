# Zibai apparent-solar year-seam repair

This implements the already-approved remediation goal's Zibai item. It does not change flying-star lineage, notification settings, month/day/hour authority, payload schema, or past history.

## Root cause and chosen correction

The NOAA approximation uses a periodic fractional-year phase. The old phase divides the half-day noon offset by the current civil year's length. When the year length changes between 365 and 366 days, the phase jumps and the apparent clock can reverse. It also discards UTC milliseconds.

Keep the existing NOAA coefficients and civil-year progression, but express elapsed time as fractional milliseconds and use one constant half-day phase offset (`0.5 / 365`) in every year. This preserves non-leap-year second-aligned values, removes the year-boundary jump, and shifts leap-year values by less than 0.1 second. It is a numerical correction to the V3 monotonic-clock contract, not a new star-calculation lineage. No Qimen module is imported or changed.

Alternatives not selected: widening the inverse search cannot repair a clock that reverses; replacing the entire ephemeris/clock model would unnecessarily move all notification windows and need a separate model migration.

## Acceptance

The precise reported failing instant must produce a valid active snapshot. Apparent UTC must never reverse around either ordinary or leap-year seams, and year boundaries must not skip apparent time. The same guarantees apply to Zi/day and other shichen boundaries across longitudes. Existing day/month latching, DST, payload and copy tests must stay green. Existing histories are frozen and untouched. A branch commit and independent review precede any production rollout.
