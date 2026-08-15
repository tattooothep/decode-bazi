# Task 3 — Notification scheduler/science and delivery review corrections

Date: 2026-08-15
Original base: `600c9fd9de752a97d559f373e4f81b2b08731455`
Correction base: `4de9c2654025326918c6727e56d80328937b8c7f`

Scope stayed within notification schedulers, notification-facing adapters, payload/delivery infrastructure, migrations, and tests. No canonical science algorithm, production database, real provider send, build, deployment, legacy API, or mobile-worktree file was changed.

## Final implementation

- Yam's live user query no longer projects `profiles.birth_lat` or `profiles.birth_lng`. Current Qimen coordinates and freshness are `CASE`-gated by `qimen_enabled=true`. A disposable PostgreSQL test executes the production query through a role that has no permission to birth-coordinate columns; the disabled row contains no profile location and only null Qimen location. The Yam science adapter and personal Qimen scheduler both short-circuit before location access or API fetch when consent is false; the personal test uses throwing coordinate properties and a fetch spy.
- Personal-reminder SQL also `CASE`-gates Qimen coordinates. Qimen requests preserve one explicit IANA timezone and instant through scheduler/gate calls; Bangkok, Tokyo, New York spring DST, and New York fall DST fixtures remain stable.
- Goal copy is produced from each goal's bound profile result and server-provided date/hour. English, Chinese, and every non-Thai fallback format their own date label and never reuse the engine's Thai `dayLabel`. The goal API remains user-local-date/profile-bound.
- Saved-date SQL filters the 1-hour/24-hour due windows before ordering, so an earlier non-due future row cannot shadow a due event.
- All six schedulers retain named advisory run leases. The lease session is discarded on unlock failure. Yam and network run under one abortable total deadline; their fetches receive the shared abort signal, timeout releases the lease in `finally`, and an immediate next run can acquire it.
- Cap reservation remains under a per-user transaction advisory lock and compares the user's local calendar date, not a rolling 24 hours. Nontransactional service notices now follow the same cap; only attempts explicitly marked `transactional=true` may bypass ordinary consent/pause/quiet/cap policy.
- Retry pre-send policy is re-read under the installation lock plus user cap lock before `send_started_at`. Current category consent, pause, quiet hours, privacy preference, local day, and cap are checked transactionally. Revoked, expired-day, cap-blocked, or privacy-conflicting detailed attempts become terminal without a provider call; pause/quiet hours get durable retry time. Tests toggle every policy after reservation and verify zero provider calls. Explicitly transactional security/service can bypass ordinary policy only when its immutable preview is already privacy-safe.
- `privacy_preview=false` now redacts security and service lock-screen copy as well as all six advisory/science categories. Authenticated `mobile_push_log` history retains full useful title/body, strict payload, and sanitized `source_facts`. Attempts persist `privacy_safe`; switching from detailed preview to privacy-off cancels the old detailed attempt instead of mutating or leaking it.
- Credential-key rejection now uses the same normalization family as provider filtering (`authorization`, `auth`, cookie, session, API/private/access keys, bearer, access/refresh tokens, credentials, secrets, passwords, and normalized `*key`). An actual disposable-DB reservation test proves rejection occurs before a parent history row is stored.
- Expo send-ticket acceptance and Expo receipt `status=ok` both remain `provider_accepted`; neither is called device-delivered. Receipt success is durably marked checked to prevent repolling, while the API/parent status remains accepted. FCM 401/403 invalidates the cached OAuth ticket and retries the identical immutable request once. A generic 400 `INVALID_ARGUMENT` is not treated as a dead token; token-specific invalid-registration text is.
- The notification migration normalizes all blank/whitespace native tokens to `NULL` before dedupe, recreates the active-native partial unique index with a non-whitespace predicate on every forward run, and preserves unrelated blank-token installations. It also adds durable privacy/transactional/receipt-checked attempt fields upgrade-safely.
- The live admin watcher now builds strict v1 security/service payloads and delegates native delivery to the durable reservation/retry path. Stored payload and provider data are identical; device credentials stay transport-only. Support/store/account destinations map to valid mobile routes. A durable dead child can no longer be reported as an outbox success, while the existing inbox/no-subscription semantics remain.
- Monthly report and network morning are strict nontransactional `service` notifications, not `daily`. Stable payloads use `monthly_report_ready` + `monthly|YYYY-MM` → `/calendar`, and `network_morning` + `network|date|centerProfileId` → `/network`. The unsupported network `--email` claim/branch was removed; zero durable attempts remain a failure, not a false success.
- Live copy formatters now retain exact server facts and one clear action: date/time/window, score, quality, direction, festival/event, or recommendation as applicable, with the tap destination matching the action. All accepted locale inputs (`th/en/zh/cn/vi/ja/ru/ko/es`) use Thai, Chinese, or English fallback families as intended; untranslated locales never receive Thai. Title/body provider bounds remain enforced. Privacy-off copy stays short and generic.
- The strict v1 builder still covers all eight categories and exact keys/account/destination. Sanitized replay fixtures and production producer tests verify source facts → stored payload → exact provider data/copy for security, saved date, daily, Yam, Qimen, shrine, goal, and service without client science recalculation.

## TDD evidence

Review RED failures were reproduced before their fixes:

1. `/calendar` service payload rejected; security/service privacy-off copy remained detailed.
2. normalized credential keys were accepted; pooled scheduler unlock failure returned the uncertain session to the pool.
3. Expo receipt `ok` returned `delivered`; cached FCM auth was not refreshed.
4. two unrelated whitespace native tokens were not both normalized/preserved.
5. retry attempts sent after consent/pause/quiet/privacy/cap/local-day changes.
6. total-timeout scheduler lease helper did not exist.
7. live admin producer used untyped direct sending and could mark a dead native child sent.

Each failure is now covered by an executable production-path test. The live-producer suite uses production formatter/builder functions, a limited-column disposable PostgreSQL role for Yam, personal Qimen location/fetch spies, durable admin dependency injection, real provider adapters, and the checked-in current mobile parser for the existing eight-category destinations.

## Fresh verification

Task 3 and live producer checks:

- `test-notification-science-task3.mts` — 8/8.
- `test-notification-payload-task3.mts` — 8 categories; TypeScript/CJS/current-mobile-parser/Expo/FCM parity.
- `test-notification-atomicity-task3.mts` — scheduler lock, discard-on-unlock-failure, timeout release, next-run reacquisition, atomic/local-day SQL guards.
- `test-notification-cap-task3.mts` — disposable DB; credential rejection-before-storage, 8 contenders → 1 reservation, local-day boundary, full history/privacy/provider parity.
- `test-notification-live-producers-task3.mts` — 169 checks; all 8 production categories, all 9 accepted locale inputs, copy bounds/action/facts, provider/parser parity, live admin watcher outcomes, Yam/personal query behavior. Disposable DB/role removed.

Existing cron/science checks:

- `test-push-guard.mts` — 22/22.
- `test-push-pause.mts` — 8/8.
- `test-festival-days.mts` — 13/13.
- `test-yam-qimen-line.mts` — 21/21.
- `test-notification-integrity-contract.mts` — pass.
- `test-qimen-canon-wire.mts` — 71/71.
- `test-qimen-dmy-scope-wire.mts` — 26/26.
- `test-datepick-qimen-science.mts` — pass.

Task 2 delivery/retry/sender checks:

- `test-mobile-push-retry-worker.mts` — 58/58, including all post-reservation policy toggles and corrected receipt semantics.
- `test-push-send.mts` — 15/15, including FCM auth refresh and generic/token-specific failure separation.
- `test-fcm-direct.mts` — pass.
- `test-notification-integrity-migration.mts` — rollback/reapply and whitespace-token fixtures pass; disposable DB removed.
- `test-mobile-push-delivery.mts` — 6/6 against a fresh schema-only disposable DB/login role; both removed.

Static verification:

- `npx tsc --noEmit` — pass.
- `node --check`/`node -c` — admin watcher, all six cron scripts, retry worker, and changed CJS libraries pass.
- `git diff --check` — pass.

## Explicit cross-repo dependency

Per parent direction, this backend task intentionally did not edit the mobile worktree. The backend builder now accepts the required service destinations `/calendar` and `/network`; the current external mobile parser still accepts only the pre-existing service destinations `/account`, `/support`, and `/store`. A separate mobile TDD task must add `/calendar` and `/network` parser/dispatcher routes before combined release. Existing eight-category live cases continue to parse with the current parser, and backend tests assert the intended new monthly/network contract directly.

## Baseline-only diagnostics

- `test-notification-support-p0.mjs` cannot start in this worktree because ignored `.env.local` is absent.
- `test-notification-support-signatures.mjs` and `test-admin-integration-contract.mjs` cannot start because their pre-existing referenced `migrations/20260711_*.sql` files are absent from this worktree. The new import-safe admin watcher behavioral tests pass and no unrelated migration/test file was added or modified to mask those baseline omissions.
- `test-mobile-qimen-parity.mjs` likewise requires the missing worktree `.env.local`/live service configuration; an attempted alternate-cwd run reached PostgreSQL and failed baseline authentication before product assertions.

## Safety

- No real provider call was made; all provider behavior used mocks.
- Only hard-named disposable test databases/roles were created, and each was removed (including cleanup after an initial credential-config diagnostic).
- No raw provider credential was written to payloads, source facts, fixtures, evidence, or logs.
- Canonical Bangkok engine algorithms/results and Task 1/2 ownership/delivery behavior were not changed.
