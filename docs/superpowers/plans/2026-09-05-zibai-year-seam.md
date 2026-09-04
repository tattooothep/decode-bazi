# Zibai Year-Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the reproduced Zibai apparent-solar reversal without changing star lineage, historical payloads or another science.

**Architecture:** Correct the continuous input phase at its source in `zibai-science.ts`. Keep the existing inverse solver, flying-layer calculations and public payload contract. Add a targeted numerical and snapshot regression suite.

**Tech Stack:** TypeScript, Node/tsx, node:assert, existing tyme4ts and Zibai runtime.

## Global Constraints

- No production/database writes, pushes, deployment, historical snapshot rewrite, or preference changes in this task.
- Do not edit Qimen, Ziwei, mobile, source manifests, release evidence or notification gates.
- Keep the NOAA Fourier coefficients and V3 star calculation/latching contract intact. No cross-science imports.
- Parent owns the branch ledger and other task reports. Commit only this task's source/test/report files.

### Task 1: Continuous Zibai fractional-year phase

**Files:**
- Modify: `src/lib/zibai-science.ts` (`equationOfTimeMinutes` only).
- Create: `scripts/test-zibai-year-seam.mts`.
- Create: `docs/notification-science/remediation-20260905-zibai-report.md`.

**Interfaces:**
- Consumes: existing `equationOfTimeMinutes(Date)`, `apparentSolarInstant(Date, longitude)`, `buildZibaiSnapshot(Date, longitude)`, `shichenAt(Date, longitude)` and `nextShichenBoundary(Date, longitude)`.
- Produces: exactly the same public APIs and payload schemas, with continuous fractional input and reliable half-open intervals.

- [ ] **Step 1: Create the failing regression.** Start the test with this concrete case and report the expected failure before changing source:

```ts
import assert from "node:assert/strict";
import { apparentSolarInstant, buildZibaiSnapshot, equationOfTimeMinutes, shichenAt, nextShichenBoundary } from "../src/lib/zibai-science.ts";
const seam = Date.parse("2028-01-01T00:00:00.000Z");
const longitude = -14.33010681505132;
assert.doesNotThrow(() => buildZibaiSnapshot(new Date(seam), longitude), "the reproduced leap-year seam belongs to an active snapshot");
for (let delta = -100; delta < 100; delta += 1) {
  const before = apparentSolarInstant(new Date(seam + delta), longitude).valueOf();
  const after = apparentSolarInstant(new Date(seam + delta + 1), longitude).valueOf();
  assert.ok(after >= before && after - before <= 2, "apparent time cannot reverse or jump at an adjacent millisecond");
}
```

Run: `node --import tsx scripts/test-zibai-year-seam.mts`.
Expected RED: the active-snapshot assertion fails with `zibai_snapshot_active_interval_mismatch` on the baseline, not a module/type error.

- [ ] **Step 2: Replace only fractional phase construction.** Preserve validation and all Fourier coefficients. Replace `day`, `fractionalHour`, and `gamma` setup with:

```ts
const elapsedYearFraction = (at.getTime() - start) / (daysInYear(at.getUTCFullYear()) * 86_400_000);
// The noon-origin phase must not change when the civil year changes length.
// Retain millisecond precision so the inverse solver sees the same clock.
const gamma = 2 * Math.PI * (elapsedYearFraction - 0.5 / 365);
```

- [ ] **Step 3: Extend the regression and run GREEN.** Test ordinary→leap and leap→ordinary seams for 2024, 2025, 2028, 2029, and 2100, with longitudes `-179.5`, `-14.33010681505132`, `0`, `100.5018`, `179.5`. Assert adjacent apparent milliseconds never reverse or jump by more than two milliseconds. Construct critical seam longitudes for apparent 23:00, 01:00 and 00:00 from the equation-of-time value (`longitude = (targetWallMs - seamMs - equationOfTimeMinutes(at) * 60000) / 240000`, wrapping by 360 if needed). At seam−1ms/seam/seam+1ms, assert every returned month/day/shichen interval contains its requested instant and `nextShichenBoundary > instant`. Compare old and corrected NOAA values over one common and one leap year at daily samples; non-leap second-aligned values differ by less than 1e-9 minute and leap values differ by less than 0.1 second. This protects the intentionally small numerical correction. Keep the old formula only as a clearly named test oracle for the bounded-difference assertion, not in production.

Run: `node --import tsx scripts/test-zibai-year-seam.mts`.
Expected GREEN: all assertions pass; print case counts and maximum clock correction.

- [ ] **Step 4: Run the targeted regression group once.**

```sh
node --import tsx scripts/test-zibai-science.mts
node --import tsx scripts/test-zibai-v3-boundary-latching.mts
node --import tsx scripts/test-zibai-month-boundaries.mts
node --import tsx scripts/test-zibai-three-layer-interpretation.mts
node --import tsx scripts/test-zibai-notification-payload.mts
node --import tsx scripts/test-zibai-scheduler.mts
```

Inspect these existing tests before execution; skip and report any unexpected live DB/network side effect. Expected: all pure suites pass without changing expectations to match the bug fix.

- [ ] **Step 5: Self-review, report and commit.** Write the source/test paths, exact RED/GREEN output, regression output, maximum numerical shift, source-scope explanation, and remaining deployment/review work to `docs/notification-science/remediation-20260905-zibai-report.md`. Commit those files only with subject `fix: keep Zibai apparent time continuous at leap-year seams`. Return status, commit, test summary and concerns. This task is not production approval and not a final goal signature.
