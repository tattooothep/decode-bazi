# Task 3 — Notification scheduler/science and delivery final report

Date: 2026-08-15
Original base: `600c9fd9de752a97d559f373e4f81b2b08731455`
First review correction: `196b539793fcfe24cda76bf79894d010e1371bb6`

Scope remained limited to backend notification schedulers, notification-facing science/API adapters, durable delivery/payload infrastructure, the notification integrity migration, sanitized fixtures, and tests. No canonical science algorithm, production database, real provider send, build, deployment, legacy API, or mobile-worktree file was changed.

## Final implementation

### Scheduler timeout and lease fencing

- The ordinary internal-call timeout remains prompt for daily API calls, including a callback that never settles.
- Leased scheduler runs use a separate fenced total timeout. At the deadline it aborts the one shared signal, but the lease wrapper does not return, throw, unlock, or return the pooled session until the original callback actually settles.
- An abort-ignoring callback therefore keeps the advisory lease fenced. A concurrent run cannot acquire it. Once the old callback settles, the wrapper reports `notification_internal_timeout`, unlocks exactly once, and a subsequent run can acquire.
- Yam and network check `signal.throwIfAborted()` before and after loading users, before and after every user, around fetch and response-body parsing, and around network inter-user delay. Abort is rethrown from catches rather than converted to a skip. Tests cover an already-aborted run and an abort raised during JSON parsing.
- Unlock failure still destroys the pooled session instead of returning an uncertain advisory-lock session to the pool.

### Trusted transactional policy

- Reservation rejects `transactional:true` before any query unless `kind` is exactly `security` or `service`; it no longer silently treats an advisory/science notice as privileged.
- Retry joins and trusts the stored parent kind. A raw transactional flag on `daily`, Yam, or another advisory/science parent is terminal policy failure, not a consent/pause/quiet/cap bypass.
- PostgreSQL independently enforces the same invariant. An attempt trigger validates the referenced parent kind on insert/update, and a parent trigger prevents later changing a transactional security/service parent to another kind.
- Rollback/reapply tests prove direct transactional daily writes and parent-kind mutation fail while service succeeds.

### Locale-correct authenticated history and privacy

- Each live producer builds bounded full `th`, `en`, and `zh` history copies from the same server facts. Reservation selects the authenticated parent `title/body` using `mobile_notification_prefs.locale`: Thai for `th`, Chinese for `zh/cn`, and English fallback for `en/vi/ja/ru/ko/es`.
- Device attempts remain independently localized by installation locale. A DB test uses Chinese account history with an English installation and verifies both simultaneously when preview is enabled.
- Privacy-off provider title/body remain concise and redacted for every category, while authenticated history retains the full useful localized copy, typed payload, and sanitized `source_facts`.
- DB reservation tests cover Yam, daily, monthly, network, saved date, Qimen, shrine, goal, admin security, and admin service across Thai, Chinese, and English-fallback account locales.

### Genuine source-result replay and live producers

- `task3-source-results.sanitized.json` contains sanitized canonical source results only: Today/hours results, Qimen palaces/request, saved-date row, festival result, goal engine result, network API result, and admin events. It contains no hand-authored final notification copy or credentials.
- Import-safe production adapters now perform extraction, copy formatting, strict v1 payload building, localized history building, per-installation message construction, and source-fact construction for Yam, daily, monthly, network, saved date, Qimen, shrine, goal, security, and service.
- The actual scheduler paths call these adapters before `deliver`; notification construction is no longer duplicated separately from replay coverage.
- Replay executes source result → live extraction/formatter → strict builder → real durable reservation → stored parent/payload/source facts → immutable provider message → current mobile parser for all currently supported category routes.
- Monthly `/calendar` and network `/network` remain asserted as the intended strict backend service contract; current external mobile parsing for those two new service routes remains a separately assigned mobile task.

### Log privacy

- Final scheduler/admin logs contain aggregate counts, category, run configuration, and fixed error codes only.
- Dry/error paths no longer log email, stable user IDs, notification title/body/content/payload, coordinates/direction details, provider tokens, or raw exception messages.
- Static logging-line checks cover all six schedulers, retry worker, and admin watcher. A production Yam error-path capture injects an email, stable ID, private content, and token-like text and proves none appears while `category=yam` and a fixed `error_code` remain.

### Preserved Task 3 behavior

- Yam still avoids all profile/current location reads and Qimen fetches when consent is false; Qimen instant/timezone fixtures remain stable across Bangkok, Tokyo, New York, and DST.
- Goal profile binding/local date, saved-date due-row ordering, local-calendar cap serialization, all six advisory scheduler locks, current retry consent/pause/quiet/privacy/cap policy, Expo/FCM semantics, blank-token normalization, strict eight-category payloads, actionable copy, locale fallbacks, `/calendar` and `/network` destinations, and admin durable outbox truth remain intact.
- Provider/source payloads still exclude credential-like keys and source facts are not recalculated by clients.

## TDD evidence

Observed RED failures before production fixes included:

1. A timed-out abort-ignoring callback released the scheduler lease immediately; overlap acquired before the callback settled.
2. Yam/network swallowed aborts at user catches and response-body parsing.
3. Reservation queried before rejecting transactional daily; retry allowed the raw flag; PostgreSQL accepted direct transactional daily and later service-parent mutation.
4. Authenticated history stored the producer's Thai default instead of the account preference locale.
5. Live producer adapters for canonical source-result replay did not exist (`buildYamProducer is not a function`).
6. Final cron logging exposed emails, stable IDs, notification copy, and raw errors.
7. The first aggregate found the general timeout had been fenced too broadly; the daily never-settling timeout test caught it. Per-call and lease-fenced timeout semantics were separated.
8. The Yam compatibility test caught removal of its fixed failure marker; the safe marker was restored without raw error content.

Every item was rerun GREEN before the aggregate.

## Fresh verification

Task 3 focused:

- `test-notification-source-replay-task3.mts` — 10 live notice variants; disposable DB/role removed.
- `test-notification-live-producers-task3.mts` — 174 checks, including all supported locale inputs, production copy/facts, admin durability, disabled-Qimen spies, limited-column Yam DB role, and abort-before/during-body behavior.
- `test-notification-log-privacy-task3.mts` — 8 final paths plus actual captured Yam failure output.
- `test-notification-science-task3.mts` — 8/8.
- `test-notification-payload-task3.mts` — all 8 categories.
- `test-notification-atomicity-task3.mts` — lock fencing, overlap refusal, settle-then-unlock, unlock discard, cap/local-day SQL, trusted transactional app policy.
- `test-notification-cap-task3.mts` — credential rejection-before-storage, 8 contenders → 1 reservation, local-day boundary, account-locale history, privacy/provider parity; disposable DB/role removed.
- `test-notification-integrity-migration.mts` — blank tokens, transactional-kind triggers, parent mutation defense, rollback/reapply; disposable DB removed.

Task 2 delivery/retry/sender:

- `test-mobile-push-retry-worker.mts` — 58/58.
- `test-push-send.mts` — 15/15.
- `test-fcm-direct.mts` — pass.
- `test-mobile-push-delivery.mts` — 6/6 against a newly schema-cloned, explicitly named disposable DB/login role; both removed.

Existing guard/science:

- `test-push-guard.mts` — 22/22.
- `test-push-pause.mts` — 8/8.
- `test-festival-days.mts` — 13/13.
- `test-yam-qimen-line.mts` — 21/21.
- `test-notification-integrity-contract.mts` — pass.
- `test-qimen-canon-wire.mts` — 71/71.
- `test-qimen-dmy-scope-wire.mts` — 26/26.
- `test-datepick-qimen-science.mts` — pass.

Static:

- `npx tsc --noEmit` — pass.
- `node --check` — changed libraries, all six cron scripts, and admin watcher pass.
- `git diff --check` — pass.

## Explicit cross-repo dependency

Per parent direction, this backend task did not edit the mobile worktree. Backend strict service payloads use `/calendar` for monthly report and `/network` for network morning. The external mobile parser/dispatcher still needs its separately assigned compatibility change for those two new routes before combined release. Existing eight-category supported-route replay parses with the current mobile parser.

## Baseline-only diagnostics

- `test-notification-support-p0.mjs` cannot start in this isolated worktree because ignored `.env.local` is absent.
- `test-notification-support-signatures.mjs` and `test-admin-integration-contract.mjs` reference pre-existing absent `migrations/20260711_*.sql` files. Live admin producer/durable behavior is covered by the new executable tests; unrelated files were not added to mask those baseline omissions.
- `test-mobile-qimen-parity.mjs` requires the absent worktree `.env.local`/live service configuration; an earlier alternate-cwd attempt reached PostgreSQL and failed baseline authentication before assertions.

## Safety

- No real provider request was made; provider behavior used mocks.
- Only explicitly named disposable databases/roles were created and each was removed.
- No raw credential was written to payloads, source facts, fixtures, evidence, or logs.
- Canonical Bangkok science algorithms/results and Task 1/2 ownership/delivery behavior were not changed.
