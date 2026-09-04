# Qimen seasonal root implementation — independent bounded review

Date: 2026-09-05. Reviewed root implementation checkpoint `d960e8e` and the small registration/preferences/constraint expansion committed as `4a152cc4561ec66b49249383dfbb20d1aeacb030` during review.

**Verdict: PASS for this bounded code review. No actionable implementation defect was found in the reviewed changes.** This is not release approval, predictive-validity approval, full transport sign-off, permission to choose a door method, or the final goal signature.

## Scope and independence

Reviewed root-owned changes in:

- `src/lib/qimen-seasonal-vigor.cjs`
- `src/lib/qimen-notification-advisory.cjs`
- `src/lib/qimen-canonical-occurrence-builder.cjs`
- `scripts/mobile-qimen-push-cron.cjs`
- The seasonal source/evidence/component/occurrence/scheduler tests and synthetic engine witness.
- The later small expansion in `src/app/api/mobile/v1/push/route.ts`, `src/lib/mobile-notification-preferences.ts`, `migrations/20260905_mobile_qimen_schema4_compatibility.sql`, and their focused tests.

The reviewer did not modify these implementation files. The earlier backend V4 snapshot/compact contract was implemented by this reviewer and is therefore **not independently approved by this review**. The only review additions are this report and `scripts/test-qimen-seasonal-root-review.mts`.

No database connection, migration execution, external Qimen engine import, calculate POST, push, deployment, full build or environment change was performed. The full `test-qimen-scheduler.mts` was deliberately not run because it contains live calculation calls. Scheduler behavior here uses in-memory query/transport doubles; local source files and pure canonical clock helpers are used directly.

## Evidence supporting the verdict

### Explicit source and method boundaries

The Yanbo rule uses star and month as separate operands. Its five-element order is not copied from cached `chart.wang_xiang_status`. Nine component mappings include central 天禽 as earth. Tests use literal source-derived expected tables for all 60 valid sexagenary pillars (540 component assertions), rather than reconstructing the production relation algorithm as their oracle.

The two candidate door profiles have separate identifiers, state vocabularies and provenance classes. Ordinary five-element behavior is explicitly labeled existing editorial/product policy; Tongzong 暗餘氣 is labeled as the separate primary-source profile. The pinned Tongzong source bytes and relevant text are tested, with 192 door/profile/month assertions. Neither profile changes the fixed Yanbo star map. No helper default chooses a profile.

The exact ten-key seasonal evidence reader rejects malformed shape, extra/accessor/inherited keys, unknown methods, invalid dates, and mismatched source/version/profile pins. Its comment correctly states that it is not an astronomical calendar oracle. The actual occurrence path derives the canonical global-Jie month and bounds, and binds those facts into the full snapshot.

### Causal calculation and unchanged decision gates

`buildQimenAdvisory` has an explicit schema-4 branch. Defaults retain legacy schema-3 behavior and legacy advisory version; a door profile supplied without schema 4 is rejected. V4 separates star and door state maps and returns no misleading shared cached order.

`buildCanonicalQimenOccurrence` recomputes V4 selection from the same raw engine response later used for all nine full-grid palaces. It does not trust an injected/stale advisory. The external arrangement contract/source/closure/reference pins remain unchanged. The requested instant and all four engine pillars are checked before returning a no-direction outcome, so bad source identity is not concealed as ordinary ineligibility.

Score floor, hard-warning vetoes, soft-warning budget, component evidence, 旺/相 action support, selected-direction authority, and unmodified raw engine data are retained. The correction does not turn a strong star into permission to ignore a weak door. New 廢 warnings have their own `FEI` label rather than being relabeled 死.

Whole true-solar hours remain unchanged. Month and day contexts must contain the complete hour; no Jie clipping, broadened month interval, fabricated raw-context vigor, or replacement remote-detail behavior is added. Existing boundary tests cover 36 Jie instants, 36 Zhongqi instants, 1008 longitude/timezone cases, and all four whole earth months. The independent review test additionally calls the actual V4 occurrence builder for **72 Jie-crossing cases** (12 Jie × before/exact/after × 2 explicit door profiles), all rejected with `QIMEN_CONTEXT_TRANSITION_INSIDE_HOUR`.

These boundary tests verify coherence against the established pinned application calendar; they are not independent ephemeris-accuracy or predictive-validity evidence.

### Scheduler, concurrency and immutable history

The new-occurrence path accepts capability 3 or 4 and requires new snapshot schema to equal that capability. Creating V4 requires the exact explicitly selected dependency or `QIMEN_SEASONAL_DOOR_METHOD`; absent/unknown configuration produces a named audited skip reason. No method default or environment assignment was introduced.

Recovery happens before new method selection. Capability 4 can recover an already claimed V3 snapshot unchanged, even when no new V4 method is configured. Capability 3 cannot receive V4. The engine memo key includes schema and door profile, preventing reuse of a legacy advisory or other profile across that boundary.

After an INSERT conflict, owner, purpose, full hour bounds, schema capability, snapshot validity and admission deadline are rechecked. The independent test executes the real `admitOccurrence` query path against a query double: the first recoverable SELECT is empty, INSERT conflicts, and the second SELECT returns the immutable winner. It verifies exact V3 compact bytes and legacy source facts survive recovery by capability 4, while V4-to-3 and wrong-owner conflict winners are rejected before delivery.

Location permission/freshness, pause, quiet-hour, producer source/backend-commit gates, entitlement behavior, and delivery deferral remain in place. The existing free-plan current-hour entitlement is intentionally preserved; this review does not invent a premium-only gate. There are no changes to another science's enrollment or calculation path in this diff.

### Compatibility expansion

Registration now accepts numeric Qimen capabilities 1–4, retaining strict rejection of strings, null, fractional values and unrelated values. Its VM test executes the actual transpiled route with authentication/rate-limit/DB doubles; accepted cases stop at a deliberately throwing mock connection, never at a live database. Invalid cases fail before that mock connection. Qizheng remains hard-off and platform/native-token identity checks are unchanged.

The four SQL predicate changes broaden only the Qimen-compatible 3/4 domain. Existing consent, coordinates, seven-day location lease, owner-generation and conflict-refresh semantics are retained. The new migration is one transaction with a 1-second lock timeout and 5-second statement timeout, replacing only the Qimen schema check with `(1,2,3,4)`. It contains no data rewrite or automatic capability promotion. Only its source was reviewed; this report does not establish production lock duration or authorize execution.

## Verification performed

All following commands passed using `node --no-warnings --experimental-strip-types`:

1. `scripts/test-qimen-seasonal-evidence.mts`
2. `scripts/test-qimen-seasonal-vigor.mts`
3. `scripts/test-qimen-seasonal-occurrence-builder.mts`
4. `scripts/test-qimen-seasonal-scheduler.mts`
5. `scripts/test-qimen-nine-star-component-month.mts`
6. `scripts/test-qimen-separated-door-month-rules.mts`
7. `scripts/test-qimen-seasonal-month-boundaries.mts`
8. `scripts/test-qimen-notification-truth.mts`
9. `scripts/test-qimen-canonical-occurrence-builder.mts`
10. `scripts/test-qimen-seasonal-root-review.mts` — independent additional conflict/source/boundary checks.
11. `scripts/test-qimen-schema4-compatibility.mts`
12. `scripts/test-qimen-push-registration.mts`

`git diff --check` also passed. No product defect RED was confirmed; the new review assertions required no implementation change.

## Remaining release boundaries

- The user must explicitly choose the production door method. Supporting both named candidates is not selecting either.
- Complete and independently verify V4 transport, privacy-safe copy, final whole-provider byte caps, reservation/retry compatibility and mobile acceptance/presentation before activation.
- Backend V4 registration/detail/reservation support and the expand-only constraint must precede capability-4 advertising. Rollback must retain V4 acceptance once such clients or immutable records exist.
- EAS/build/distribution authority, any device acceptance, and actual deployment remain separate unresolved work. No APK release or production activation is approved here.
