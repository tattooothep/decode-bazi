# R8 readiness reconciliation — 2026-09-05

Bounded read-only audit for goal item 5: reconcile actual-sky-fact status across APK, backend, database and documentation; release only what passes the existing migration/deployment gates; never activate source-incomplete 七政四餘 predictions or waive approval to close the goal. This report is operator evidence, not a release signature or deployment authorization.

## Current truth

| Surface | Observed evidence | Honest status |
|---|---|---|
| Production backend | `/root/releases/current` resolves to `decode-app-r573-network-morning-final`; `.release-commit` = `6ebeb3b9be2c95156959717ca2e24d66119fc0ec`; Next build ID `PxQrFXWECqOc0pE8qI6Bp` | R8 is **not deployed**. Compiled app-path manifest contains no `/astronomy-facts` or Qizheng notification-detail route. The older Qizheng electional-preview route exists; it is not the R8 notification product. |
| Production DB | `default_transaction_read_only=on`, 5-second statement timeout, metadata-only queries against `decode_db` | R8 producer, occurrence, subscription and chain relations are absent. Token astronomy schema/audience columns are absent. Existing Qizheng payload column has `CHECK (qizheng_payload_schema = 0)`. R8 foundation migration is **not applied**. |
| Current backend source | Audited at `a310739379be57207180cf8c3416ecbfa6dd1916`; concurrent unrelated integration files remain dirty | Astronomy schema 1, `civil_two_hour`, geocentric seven physical bodies plus three explicitly defined calculated points; `prediction:false`, `judgment:null`. Runtime capability is `pull_only`, provider-send false. A provider-incapable shadow scheduler exists. |
| Current mobile source | HEAD `10f8c2ad17a8d33bbbe2cca6008a09ee3d97588c`, with parent-owned review fixes in progress | Astronomy schema 1, audience-bound list/detail routes and nine-locale separation exist. Astronomy and Qizheng switches remain disabled. Preview availability is currently overstated by local defaults; see finding below. No current remediation APK was built in this task. |
| Historical APK artifact | `/root/artifacts/r8-final/Hourkey-v233-r8-observed-hard-off-20260904T2013.apk`, 165348100 bytes; freshly hashed SHA-256 `c8954bda70e84ff24aa82d8d7a3ac2722c4b78da19e6e7e8c17a8647f3d3b118` | Matches the old hard-off evidence's APK hash. This does **not** prove the user installed it, that it is the current remediation build, or that any R8 notification reached a phone. Last installed user APK is unknown from this turn. |
| Qizheng sources | Canonical manifest contains volumes 7–16, all ten `pending_double_verification`, digest `af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2` | Prediction, ranking, rule-event, solar-month and annual-limit activation remain **blocked**. Existing source documents and historical astronomy fixtures do not complete the rule pack. |

No account identifiers, tokens, credentials, profile contents or notification bodies were queried or printed. Production queries were read-only metadata checks, not a migration dry-run or permission mutation.

## Concrete readiness defect: mobile invents preview availability

`src/native/notificationPreferencePolicy.ts:15` types `astronomyFactPreviewAvailable` as literal `true`; defaults at line 44 and normalization at line 84 force true. `src/greenfield/client.ts:1237` rejects an explicitly false preview flag when astronomy status is present, then line 1280 returns true even when all astronomy status fields are absent. `src/components/design/NotificationCenterScreen.tsx:1802` always renders the localized statement that preview is available; the preview control does not consult the availability field.

Independent pure reproduction (no network):

```text
normalizeNotificationPreferences({}).astronomyFactPreviewAvailable                         → true
normalizeNotificationPreferences({astronomyFactPreviewAvailable:false}).astronomyFactPreviewAvailable → true
notificationPreferenceDefaults().astronomyFactPreviewAvailable                            → true
```

The current production backend has neither these capability fields/routes nor the audience column. The client can therefore advertise preview availability against a backend that cannot supply it. The preview request then fails before or at retrieval; this is not proof that sky data is ready. Existing R8 tests pass because they encode the hard-off implementation's optimistic availability assumption, not old-server compatibility truth.

Bounded next implementation: preserve missing/false preview capability as unavailable or explicitly unknown; accept a truthful false capability response; gate the preview wording/action on server capability and current account/installation audience readiness. Keep separate states for service unavailable, authorized empty result, available detail, offline/expired/revoked/rollback. Add old-server/missing-field/explicit-false/account-switch/empty-preview tests across all nine locale copies. Do not turn this into user preference writes, profile re-entry, Qizheng enablement or a synthetic sky-data fallback. Parent was notified before any fix; this reviewer made no implementation change.

## Scope that is implemented versus scope that is not

The current astronomy implementation is a **civil two-hour position snapshot** at local `00,02,…22` boundaries, with skipped DST gaps and the earlier repeated boundary. Physical bodies are Sun, Moon, Mercury, Venus, Mars, Jupiter and Saturn. Rahu/Ketu are explicitly mean ascending/descending lunar nodes; Yuebo is mean lunar apogee. These calculated points are not physical planets. The schema excludes 紫氣 and contains no auspicious ranking or personalized Qizheng judgment.

It is not an exact ingress/aspect/transit-event (C1) scheduler merely because the positions change over time. The existing R8 design describes C1 separately, but current runtime/occurrence schema and shadow selector admit only `civil_two_hour`. Do not advertise exact transit-event delivery without that distinct definition, golden tests and activation evidence.

The list endpoint reads stored account/org/installation/audience-bound occurrences. It does not generate facts on demand. Fresh migration alone leaves no approved shadow cohort, subscriptions/chains/endpoints or generated facts; therefore **migration + code deployment does not itself make every account's preview nonempty**. Shadow cohort selection explicitly requires approval and a disabled production subscription; it cannot be treated as production consent. Any scoped internal cohort provisioning is a separately authorized operational write, not something performed by this audit.

## Why old five-signature evidence cannot approve this release

`qizheng-r8-release-evidence.json` remains internally self-consistent: the pure evidence inspector returns `ok:true`, `bundleDigestValid:true`, `hardOff:true`, `signaturesValid:true` for its historical bundle `d1f86822b35d7a9d261f5a7730d5cea289ff579f0a24233193711b3e12f24880`. Its backend commit is `d36ec3d37ff326d889748682f86f02cefcc374dd`, mobile commit `dcbbeabfaf442ed52cd1abdd0de92a77bf3db27a`, mode `hard_off`, provider attempts zero, and `productionMigrationApplied:false`.

Direct comparisons against those exact git blobs found:

- The astronomy model dependency closure (package/lockfile, JPL golden fixture, astronomy implementation, ephemeris) and R8 SQL migration are byte-identical to the historical signed versions.
- Within the gate's backend runtime list, current `scripts/notification-health.cjs` and `src/app/api/mobile/v1/push/route.ts` differ.
- Within its mobile runtime list, `App.tsx`, `src/native/push.ts`, `src/navigation/notificationPayload.ts` and `src/types/mobile.ts` differ.
- Other current remediation files and source trees also changed. The exact-artifact gate requires the actual current application source/tree and builds, not selective unchanged astronomy files.

Thus old evidence is useful provenance and a regression baseline only. Its accelerated provider-free 72-hour simulation is neither current deployed observation nor physical notification receipt. Its five approvals do not authorize current code, new enrollment, active astronomy pushes, or Qizheng predictions. Preserve it as historical evidence; create a fresh exact-bundle record after current integration and verification rather than overwriting its meaning or copying its signatures.

## Safe next actions under the existing gates

1. Fix the mobile truth-state defect, retain all hard-off controls, and finish the current shared push/enrollment integration. Re-run focused R8 old-server/account/audience, other-science and migration compatibility checks. Keep completed profiles reused; no birth-data re-entry or history regeneration.
2. Prepare an exact clean committed backend/mobile release and fresh evidence under the existing verifier. The current historical final-gate command is pinned to its old application commits and must not be reported green for current code. Run the authorized isolated migration apply-twice/rollback/least-privilege tests, astronomy golden/DST tests, source checks, full builds, nine-locale and lifecycle/non-regression suites when that release phase is authorized. None of those build or database-mutating tests was run in this audit.
3. Obtain five independent reviews for the **new exact bundle**, covering the required current remediation dimensions. Do not let an author sign their own work. Confirm the combined release rollback floor retains new Qimen/Ziwei readers/enrollment compatibility; do not nominate old r573 as a universally safe rollback after new-client enrollment.
4. At the authorized production change window, follow **migration then application**. Use the existing additive `20260904_mobile_science_notifications_r8.sql`; verify exact schema fingerprint, all five producer rows/source/model digests, forced-false send/subscription/chain controls, scoped function hardening and actual runtime-role privileges. New shared registration/deletion routes reference the R8 columns/functions, so deploying them before migration risks unrelated account/push flows. Do not pause the whole notification service or alter other-science preferences/history.
5. Validate the installed release commit, source/tree/runtime/build digests and R8 preflight `application_ready` against actual read-only DB proof. This means the **hard-off foundation** is ready, not provider activation. Retain the containment rollback SQL: it preserves occurrence evidence and affects R8 lifecycle only, not other sciences. Actual rollback remains an explicitly authorized write with current bundle compatibility checks.
6. For permitted pull-only/internal shadow testing, use a registered, owned, explicitly approved internal account/installation cohort and provider-incapable shadow process. Prove authenticated real detail opening, empty/unavailable truth and account isolation without making up a forecast. Fresh preview requires actual eligible stored facts. Do not confuse an internal shadow fixture with a delivered push.
7. Actual astronomy provider activation still requires the **separate signed activation migration and submode rollout gates** specified by the historical design/implementation artifacts, plus consent, quotas/caps, retries/fences, approved soak and physical receipt/detail evidence. The current migration has `CHECK(provider_send_enabled=false)`, `CHECK(enabled=false)` and `CHECK(active=false)` and the readiness function returns false: changing an environment flag is not a valid activation path. Qizheng remains schema 0 regardless of progress on astronomy facts, until its ten-source/rule/calibration gates and separate authorization genuinely pass.

The existing documents under `docs/superpowers/` were read as approved source artifacts only; no Superpower workflow, new brainstorming or replacement plan was used.

## Checks performed here

- `node_modules/.bin/tsx scripts/test-notification-r8-contract.mts` — PASS, source-incomplete/provider-off.
- `node_modules/.bin/tsx scripts/test-mobile-science-notification-detail-r8.mts` — PASS, stubbed auth-bound stored-only detail.
- `HOURKEY_MOBILE_ROOT=/root/worktrees/hourkey-mobile-zibai-v3-p0 HOURKEY_MOBILE_SHA=dcbbeabfaf442ed52cd1abdd0de92a77bf3db27a node_modules/.bin/tsx scripts/test-mobile-science-payload-r8.mts` — PASS, strict separated hard-off contract.
- Mobile `node --no-warnings --experimental-strip-types scripts/testNotificationScienceR8.mts` — PASS, nine-locale hard-off/source separation contract; not a physical UI/device test.
- Pure local availability reproduction, direct historical git-blob comparisons, old APK SHA/size, compiled production route inventory and read-only PostgreSQL schema metadata.

No external calculation engine was imported, no new astronomical computation or source verification was claimed, and no network/POST, production write, migration, build, push, device install, service restart or preference/history mutation occurred. R8 readiness remains **foundation implemented, production not deployed, preview truth fix needed, astronomy send inactive, Qizheng blocked**.
