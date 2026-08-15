# Task 3 — Notification scheduler atomicity and science inputs

Date: 2026-08-15
Base: `600c9fd9de752a97d559f373e4f81b2b08731455`
Scope: notification-layer science adapters, schedulers, payloads, privacy, and guards only. No canonical engine algorithm was changed. No production send, build, deploy, or legacy containment action was performed.

## Result

- Yam now gates every Qimen/location read behind explicit `qimen_enabled=true`. The database projection returns Qimen coordinates only under that consent, and the behavioral test uses a throwing location proxy plus a fetch spy to prove the disabled path reads/fetches neither.
- Qimen scheduler requests carry one explicit IANA timezone and UTC instant through scheduler request, entitlement gate, response input, and Qimen upstream payload. Bangkok, Tokyo, and New York spring/fall DST fixtures share identical scheduler/gate civil clocks.
- Goal notification calls no longer pass an arbitrary oldest profile. The goals adapter computes each row with its own bound, active, owned profile, and uses the user's IANA-local date/instant.
- Saved-date SQL scopes by user and organization and filters individual 45–75 minute or 23h45–24h15 reminder windows before ordering, so a nearer non-due row cannot shadow a due row.
- Daily Today/Hours calls share one 12-second abort deadline.
- All six schedulers (`yam`, `daily-fortune`, `auspicious`, `personal-reminders`, `monthly-report`, `network-morning`) use named PostgreSQL session advisory run leases. Monthly/network were moved onto the durable notification delivery path.
- Logical reservation and daily-cap reservation now share one user advisory transaction. The cap includes pending reservations and is based on the user's local calendar date, not a rolling 24-hour interval. A disposable PostgreSQL concurrency test admitted exactly one of eight simultaneous reservations at cap 1 and admitted a new-day row despite a prior-day notification still being inside rolling 24 hours.
- Added strict version-1 typed payload builders in TypeScript and CJS for the exact mobile parser keys and destinations for all eight categories: security, saved date, daily, Yam, Qimen, shrine, goal, and service. Account ownership is embedded as `accountId`; unexpected keys/invalid routes/facts are rejected.
- Expo provider data remains the exact typed stored payload. Direct FCM uses the Expo Notifications native bridge contract (`data.body` JSON object string), which restores exact numeric `v`, `lead`, and `score` types in `request.content.data` for the strict parser. The immutable provider message remains retryable without scheduler recomputation.
- Added sanitized replay fixtures for all eight categories. They contain synthetic account/reference IDs only and assert source facts → typed stored payload → exact provider data/copy accepted by the mobile parser.
- `privacy_preview=false` is the safe default. Saved date, daily, Yam, Qimen, shrine, and goal lock-screen title/body are locale-specific redacted copy; security/service remain actionable transactional copy. `privacy_preview=true` preserves detailed copy. Authenticated history keeps full title/body, strict payload, and sanitized `source_facts`. Credential-shaped source-fact keys are rejected before storage.
- Locale-specific provider copy is stored per installation in the immutable attempt row; provider copy is no longer represented as universal Thai truth. Parent history retains full authenticated facts and the server preference locale remains authoritative for fallback.

## TDD evidence

Initial RED results were observed before implementation:

1. `test-notification-science-task3.mts` failed because `notification-science.cjs` did not exist.
2. `test-notification-payload-task3.mts` failed because the typed payload builder/fixtures did not exist.
3. `test-notification-atomicity-task3.mts` failed because `trySchedulerRunLease` did not exist.
4. After adding the provider-adapter replay assertion, it failed because legacy provider data added `categoryId/category` and stringified typed values. The adapter now preserves exact Expo data and uses the Android native bridge JSON envelope for FCM.
5. Task 2 retry regression initially exposed optional-column and no-preference fixture compatibility in the cap query; the query now reads legacy optional columns additively and enforces advisory caps only for persisted preference rows (all advisory categories already require consent rows).

## Fresh verification

Passing Task 3 focused checks:

- `npx tsx scripts/test-notification-science-task3.mts` — 8 checks.
- `npx tsx scripts/test-notification-payload-task3.mts` — all 8 categories; TS/CJS/mobile parser/Expo/FCM bridge parity.
- `npx tsx scripts/test-notification-atomicity-task3.mts` — lease and atomic SQL guards.
- `npx tsx scripts/test-notification-cap-task3.mts` — disposable DB, 8 concurrent contenders → 1 reservation, local-day boundary, privacy/history/provider exactness; DB and role removed.

Passing existing cron/science checks:

- `test-push-guard.mts` — 22/22.
- `test-push-pause.mts` — 8/8.
- `test-festival-days.mts` — 13/13.
- `test-yam-qimen-line.mts` — 21/21.
- `test-notification-integrity-contract.mts` — pass.
- `test-qimen-canon-wire.mts` — 71/71.
- `test-qimen-dmy-scope-wire.mts` — 26/26.
- `test-datepick-qimen-science.mts` — smoke pass.

Passing Task 2 delivery/retry/sender checks:

- `test-mobile-push-retry-worker.mts` — 49/49.
- `test-push-send.mts` — 13/13.
- `test-fcm-direct.mts` — pass.
- `test-notification-integrity-migration.mts` — pass.
- `test-mobile-push-delivery.mts` — 6/6 against a newly created schema-only disposable database and disposable login role; both removed after the test.

Static verification:

- `npx tsc --noEmit` — pass.
- `node --check` — all six changed cron scripts and all changed/new CJS notification libraries pass.
- `git diff --check` — pass.

## Baseline concerns outside Task 3 scope

- `test-activity-profile-qimen-scoring.mts` reports the pre-existing assertion `datepick final SQL hard modules must re-filter qi_men after activity profile merge`. No datepick engine/scoring file is changed in this task.
- `test-today-qimen-now.mjs` reports 22 missing public Today-page Qimen UI hooks and exits 0. No public Today asset is changed in this task.
- Direct FCM necessarily stores an immutable transport envelope whose `data.body` is JSON text because FCM accepts string data values. Expo Notifications' Android bridge parses that JSON back into the exact typed `request.content.data`; this behavior is covered against the checked-in Expo native bridge contract and the payload replay test.

## Safety

- No raw provider credential is copied into payloads, source facts, fixtures, or evidence.
- All provider interactions in tests are mocked; no real push was sent.
- Only explicitly named disposable databases/roles were created, and catalog cleanup was performed.
- No production database, service, build, deployment, legacy endpoint, canonical science engine, or Bangkok fixture was mutated.
