# Independent Zibai year-seam review — 2026-09-05

## Verdict and scope

- SPEC: **APPROVED** for the bounded year-seam repair.
- QUALITY: **APPROVED**. No newly introduced blocking correctness or regression finding identified.
- Reviewed commit `088374b214cd8f61b10750688bd88d145f375d35` against its parent `23988a39e37caa8a5d3c7fb2ff9502b538739c43`, not the concurrent untracked Qimen work.
- Read `AGENTS.md`, the year-seam design, the committed implementation/test/report, the complete science module, and relevant layer, version, scheduler, and history-projection paths. The implementation diff contains one production function change, one regression script, and its report.

This task-specific review is **not** one of the five final deployment signatures, production approval, or goal closure. No production code was edited during review. No database connection, live service operation, push, deployment, or full build was performed.

## Numerical and scientific assessment

At `src/lib/zibai-science.ts:98`, let `u` be elapsed UTC milliseconds divided by the current year's total milliseconds. The new phase is `g = 2π(u − 0.5/365)`. At the end of any ordinary or leap year, the left-limit phase differs from the incoming phase by exactly `2π`. Every retained Fourier term is periodic with that period. Thus the equation of time and the unquantized apparent clock are continuous at the seam, although their derivatives may change with year length. This is consistent with a small continuity repair inside the existing approximate Fourier model; it does not establish a new astronomical ephemeris or independent absolute-accuracy result.

For the unchanged equation `E(g)` in minutes, the triangle inequality gives the global bound:

```text
|dE/dg| ≤ 229.18 × (0.001868 + 0.032077 + 2×0.014615 + 2×0.040849)
         = 33.20199414 minutes/radian
|d(60000E)/dt| ≤ 0.000396906929
d(apparent clock)/dt ≥ 0.999603093071 > 0
```

Longitude adds a constant and cannot change this bound. Continuity at seams plus the positive within-year derivative establishes monotonicity of the real-valued clock across ordinary/leap/century transitions in the relevant Gregorian date range. Integer `Date` projection is nondecreasing, not necessarily strictly increasing: ordinary rounding can produce repeated milliseconds or a two-millisecond step. Those quantization effects are compatible with the half-open solver and are not a year-seam discontinuity.

At second-aligned instants in common years, the old and new phases are algebraically identical. In leap years their phase difference has magnitude `2π × 0.5/(365×366)`, bounding the clock correction by **46.848031 ms** for all phases, rather than merely the sampled maximum. Restoring the previously discarded 0–999 milliseconds adds at most **0.396511 ms** by a conservative derivative bound. Thus even their sum is below 0.1 second. This proof concerns correction relative to the old approximation, not its absolute error relative to an astronomical reference. The pre-existing one-minute-accuracy comment at `src/lib/zibai-science.ts:94` was not independently certified by this review.

## Solver, layers, versions, and history

- `src/lib/zibai-science.ts:138`: the existing inverse brackets an outgoing and incoming integer UTC millisecond, then binary-searches the first projection at or above the target. With the repaired nondecreasing projection, its half-open first-crossing predicate is coherent, including repeated projected milliseconds. Independent checks below explicitly tested both returned boundaries and their preceding UTC millisecond.
- `src/lib/zibai-science.ts:243`: month authority remains the global solar-term reference. Day and shichen maps remain latched to their solved interval starts. `fengshui-luxing.ts` still derives month/year pillars from the separate term reference; no star-school, coefficient, map, or cache implementation changed.
- Actual day/hour boundary timestamps can move by the bounded numerical correction, including sub-millisecond changes in common years. Consequently, an instant extremely close to a boundary can intentionally belong to a different corrected interval; this is not a promise of byte-identical newly computed snapshots. A boundary close to a global term still follows the existing start-latching rule.
- `src/lib/zibai-version-runtime.cjs` is unchanged: active calculation V3, readable V2/V3, interpretation version, payload shape, and occurrence-key conventions remain unchanged. The inspected producer recomputes snapshots and has no equation-of-time/year-indexed snapshot cache requiring invalidation. Existing persisted future due timestamps are not rewritten by this source change and are recomputed through the normal scheduler path.
- `src/app/api/mobile/v1/notifications/route.ts:183` projects stored payloads, rather than invoking the science engine. `src/lib/zibai-payload-projection.cjs:90` validates/projects captured immutable data. The repair has no history rewrite path; recalculating a historical date separately is not equivalent to rewriting stored history.

## Independent execution evidence

The working copies of the two executable changed files matched the reviewed commit before testing. Pure checks used the existing local TypeScript loader. One initial stdin ESM named-import invocation failed on CJS/ESM interop before executing checks; using the project's CJS-compatible import form resolved the review harness issue without source changes.

1. Loaded the parent science source with `git show`, transpiled it in memory, and evaluated it without overwriting files. At `2028-01-01T00:00:00.000Z`, longitude `-14.33010681505132`, the parent throws `zibai_snapshot_active_interval_mismatch`; the reviewed implementation succeeds.
2. Independently tested **378,000** adjacent-millisecond pairs over ±1 second of seams in years `1600, 1700, 1800, 1899, 1900, 1901, 1999, 2000, 2001, 2023, 2024, 2025, 2027, 2028, 2029, 2099, 2100, 2101, 2399, 2400, 2401`, at nine longitudes including both exact endpoints ±180°. All projected steps were between 0 and 2 ms.
3. Across those years, aligned every one of the **12 shichen** wall starts to the UTC year seam via longitude; checked offsets −2, −1, 0, +1, +2 ms. Day and shichen intervals contained each requested instant. **5,040** boundary assertions verified that the returned first crossing projects into the incoming wall interval and its preceding UTC millisecond projects before the wall boundary. **840** full snapshots in the 1900–2101 subset also passed active month containment (snapshot construction itself checks all three layer intervals).
4. Compared the actual parent and reviewed equations at **210,528** hourly samples with millisecond offsets `0, 1, 499, 999` over years `1900, 2000, 2027, 2028, 2100, 2400`. Maximum common-year change was **0.323305 ms**, including restored fractional precision; maximum leap-year change was **38.198744 ms**. All changes were below 100 ms.
5. Executed the committed year-seam regression: **PASS**, 5,000 continuity cases, 45 active intervals, 731 comparison samples; reported maximum 38.198575 ms reproduced.
6. Executed `scripts/test-zibai-history-projection.mts`: **ZIBAI_HISTORY_PROJECTION_OK**. Inspected its scheduler import's guarded entry point before execution; it creates no pool or live delivery.
7. Executed `scripts/test-zibai-notification-copy.mts`: **ZIBAI_NOTIFICATION_COPY_OK**.

All successful commands above exited 0. The author's six-suite regression report was inspected, but those six suites were not independently rerun here; this review does not relabel that reported evidence as reviewer execution.

## Non-blocking test hardening

**Low / optional — `scripts/test-zibai-year-seam.mts:11` and `:14`:** the committed suite covers ordinary-to-ordinary and leap transitions, including common-century year 2100, but does not retain a divisible-by-400 leap-century case or all twelve shichen alignments. The independent checks above cover these successfully. Adding representative `2000/2001` or `2400/2401` cases, ±180° endpoints, and direct first-crossing assertions would make that extra coverage durable. This is not a defect in the reviewed correction and does not block the bounded approval.
