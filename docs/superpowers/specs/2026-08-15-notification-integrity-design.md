# Notification Integrity Repair Design

Date: 2026-08-15  
Status: approved scope, pending implementation plan  
Mobile baseline: `c6947567ca466f79990ea5ad9606971f130bb14e`  
Backend baseline: `e3b41e2b3ac5019957ef0d642497b618e8f5451c`

## Goal

Repair the notification system so that device status is bounded and truthful,
notification data cannot cross accounts, delivery failures recover durably, and
science notifications use the correct owner, profile, timezone, consent and
canonical engine outputs. The repair must not change unrelated application
features, the core astrology engines, Shrine runtime content, billing, auth
semantics outside notification teardown, or existing public notification copy
unless the copy is unsafe on a locked device.

No build, export, deployment, real push, credential rotation or production
mutation is allowed before all source tests pass and three independent agents
sign `APPROVE` on the final diff.

## Chosen Approach

Use a bounded phased retrofit rather than a rewrite or a one-line status fix.
Each phase owns a narrow interface, begins with a meaningful failing test, and
lands as a separate commit. Existing central guard, FCM sender, notification
center and canonical science APIs remain in place; the repair adds lifecycle,
durability and exact-data contracts around them.

Implementation is decomposed into three independently reviewable plans:

1. Mobile status, ownership, payload routing and privacy.
2. Backend token ownership, delivery durability and science correctness.
3. Legacy containment, staging E2E, artifact/device verification and rollout.

Plan 2 does not change shared contracts until Plan 1 names the exact
backward-compatible payload schema. Plan 3 cannot mutate production until the
source gate for Plans 1 and 2 is complete.

Rejected alternatives:

- Full notification rewrite: excessive blast radius and difficult rollback.
- Device-status-only hotfix: leaves account leakage, lost retries and incorrect
  science timing untouched.
- Provider-only retry patch: would improve delivery while leaving the client and
  data contracts untrustworthy.

## Global Constraints

- Work only in the existing isolated mobile worktree and the clean backend
  worktree matching production source; never edit `/root/releases/current`.
- Do not use Superpower.
- Do not modify astrology engine core, scoring weights, ephemeris data, Unity,
  Shrine scene/content, Sifu, payments, subscriptions or unrelated UI.
- Do not send a real notification or expose a token, location, profile, email or
  secret in tests/logs/evidence.
- Default advisory consent remains off; `security` and `service` remain mandatory
  transactional categories.
- Preserve the eight canonical categories: `security`, `service`, `saved_date`,
  `daily`, `yam`, `qimen`, `shrine`, `goal`.
- Preserve existing successful Bangkok science results; timezone fixes must add
  non-Bangkok correctness without changing Bangkok fixtures.
- Every schema change must be additive, indexed, rollbackable and compatible
  with the currently deployed clients during staged rollout.
- A final pass requires three independent signed agent approvals. A rejection
  must be fixed and re-reviewed by the rejecting agent.

## Phase 1: Mobile Device Status and Ownership

### Device status

Wrap native permission lookup, SecureStore installation lookup and server status
in one total deadline. On timeout or failure, publish `error`, invalidate the
in-flight request, and let Retry create a fresh request rather than coalescing
onto the stale promise. The status must distinguish OS permission, server
subscription and server deliverability without retaining a previous account's
result.

### Installation identity

Make installation-ID creation single-flight. All concurrent registration,
status and unregister calls must observe one UUID. Existing valid IDs remain
unchanged.

### Account lifecycle

Notification items, unread count, preferences, device status, pending tap/action
and all request generations become account-owned. Sign-out invalidates them
before network work. Notification history responses publish only if the access
token/account generation still matches.

Unregister failure creates an account+installation tombstone in secure local
storage. It is retried before registration for another account and on resume.
The old account cannot silently re-register after logout. A successful delete
removes the tombstone.

### Tap and action handling

Validate payloads by category and preserve the exact date, direction, goal,
saved-date or shrine context in the route intent. Consume and clear the initial
notification response after routing. Bind actions to the originating account;
an action from account A cannot change account B.

The killed-app `mute today` action must either use a registered background task
that can authenticate safely or open the app. The product must not claim a
background action works when no background handler exists.

### Privacy

Add a privacy-preview preference with a safe default for sensitive categories.
When enabled, goal titles, saved activities, dates, Qimen direction and other
personal science details are omitted from the lock-screen notification body but
remain available after authenticated app open.

## Phase 2: Backend Token and API Ownership

- Enforce one active owner for each native token and installation identity.
  Registration transfers ownership atomically and disables stale rows in the
  same transaction. Database constraints/indexes prevent two active accounts
  from owning the same native token.
- Preserve Expo-token compatibility during migration, but an installation that
  lacks a usable transport is reported as not deliverable.
- Push registration/unregistration, notification history and preference APIs
  retain session, rate-limit and bounded-input checks.
- Explicit profile lookups used by notification science require both
  organization and creator ownership. Deleted/archived profiles are excluded.
- Exact sent payload metadata contains category, logical notification ID,
  installation ID, locale, schema version and a hash of the data sent to that
  installation. It must not store raw provider credentials.

## Phase 3: Durable Delivery State Machine

Replace the current implicit `accepted` meaning with explicit transitions:

`reserved -> provider_accepted -> receipt_confirmed/device_ack -> opened/action`

Failure transitions are:

`reserved/provider_accepted -> retry_due -> dead_letter`

Requirements:

- A retry worker claims due failures with a lease and `SKIP LOCKED`, applies
  bounded exponential backoff, honors provider `Retry-After`, and moves exhausted
  attempts to a dead-letter state.
- A stale-reservation sweeper safely reclaims expired leases. Logical dedupe and
  per-installation attempt identity prevent duplicate sends after crashes.
- Scheduler runs use a distributed/DB lease. Daily cap reservation and logical
  notification reservation occur atomically using the user's local calendar day.
- Partial installation success remains visible per installation; a failure is
  retried only for the failed installation.
- Persist FCM message names and Expo ticket/receipt IDs when provided. Provider
  acceptance is never labeled device-delivered.
- Parent events are `sent` only when policy-defined success exists. An event with
  all child deliveries dead is `failed`, not `sent`; successful retry clears stale
  error fields.
- Monitoring covers retry backlog, oldest due retry, stale lease, dead-letter
  count, invalid-token count, provider latency/error and device ACK/open rates.

## Phase 4: Science Notification Correctness

### Yam

Use the existing canonical Today Hours result unchanged. Add Qimen enrichment
only when both `yam` and `qimen` consent are enabled and the location is fresh.
Store the exact direction/deity/score evidence used by the localized sent copy.

### Daily

Continue using `/api/mobile/v1/today` and `/api/today/hours`. Add timeouts and
propagate the user's local civil date. Do not invent missing score, label, Tongshu
or golden-hour data.

### Qimen

Carry the user's IANA timezone and coordinates through request, entitlement gate
and chart calculation. Bangkok inputs must remain byte-equivalent to approved
fixtures. Choose only a valid non-center palace with finite `display_score >= 50`.

### Goal

Use the profile stored on each goal. The scheduler must not override every goal
with an arbitrary oldest profile. Candidate windows and future comparison use the
user's local civil timezone; the engine remains `/api/auspicious`. Persist score,
profile ID and engine evidence/version in the logical payload.

### Saved date

Select rows whose individual 24-hour or 1-hour reminder window is due, rather
than selecting the earliest future row before evaluating its window. Scope by
owner and organization and preserve the saved timezone/offset.

### Shrine

Keep the approved lunar/festival calculations and one-day lead. Failed one-shot
festival notifications enter the durable retry state without creating a second
logical notification.

## Phase 5: Legacy Containment

Before any public rollout:

- Disable the legacy Qimen Web Push cron and public unauthenticated test and
  unsubscribe routes.
- Move the VAPID private key out of source and rotate it. Never print the old or
  new secret in evidence.
- Keep the Qimen calculation service available; only the legacy push surface is
  disabled.
- Remove environment-email authorization bypass for notification targeting or
  require the same persisted RBAC permission as every other admin recipient.
- Add explicit retention jobs for notification payloads/logs and restrictive log
  permissions/rotation.

These operational changes occur only after the final three source reviewers
approve the reviewed commands and exact targets.

## Testing Strategy

Every phase follows RED -> GREEN -> regression:

- Mobile unit tests: never-resolving native/storage/server dependencies, retry
  after timeout, concurrent installation creation, A->B delayed-history response,
  offline sign-out tombstone, restart/resume recovery, stale tap/action, typed
  payload routing and killed-app behavior.
- Backend unit/integration tests: global token ownership, atomic cap, lease/retry,
  stale pending, partial success, provider IDs, parent status truth, exact payload
  hashes and rollback migration.
- Science tests: Bangkok unchanged; London/New York/Tokyo local date/time; goal
  profile ownership; saved-date shadow regression; Yam/Qimen consent; festival
  one-shot retry.
- Security tests: cross-account token/history/action attempts, archived/deleted
  profile, unauthenticated legacy routes and admin permission bypass.
- End-to-end staging with fake providers: all eight categories across foreground,
  background and terminated lifecycle; provider accept/receipt/device ACK/open;
  overlap/restart/retry; 10,000-user scheduler and queue load without production
  traffic.

The existing notification, account, auth, Today, Qimen, goals, saved-date,
festival and mobile full suites must remain green. Tests that only search source
strings do not substitute for behavioral acceptance.

## Three-Signature Gates

### Source gate

After all scoped source commits and fresh source tests:

1. Mobile/device reviewer signs account isolation, status, tap/action and source
   lifecycle contracts.
2. Backend/science reviewer signs delivery state, retries, exact payloads and all
   science/timezone/profile contracts.
3. Security/E2E reviewer signs consent, token ownership, privacy, legacy
   containment, observability and no unrelated regression.

No artifact build, production migration, credential rotation, service reload or
deployment is authorized before all three source signatures are `APPROVE`.

### Artifact and rollout gate

The approved source may then produce a staging/internal artifact. Physical-device
tests run against those exact bytes, and the three reviewers independently verify
artifact/source identity plus their assigned contracts. Production migration,
credential rotation, service reload and deployment remain blocked until all three
artifact signatures are also `APPROVE`.

## Rollback

- Mobile changes are isolated commits and can be reverted without backend schema
  rollback because backend additions remain backward compatible.
- Backend feature flags keep the old scheduler disabled only after the new worker
  proves healthy; rollback re-enables the old scheduler while retaining new audit
  columns.
- Schema rollback drops only new indexes/columns/tables after confirming no new
  worker uses them; no existing notification history is deleted.
- Legacy push disable has an exact service/cron/nginx rollback where the backed
  up original is not VAPID-bearing. The rollback manifest machine-marks every
  transition whose original or applied target references VAPID as
  `retain_applied`; rollback recomputes that policy before writes and never
  writes a VAPID-bearing backup, so even an older manifest cannot reintroduce
  the credential after rotation.
- Legacy rollback is compensating across its complete file set. A later target
  failure returns every already-restored target to its captured contained bytes,
  mode, uid and gid, retains the reusable manifest, and emits only a fixed
  failure code. Any failed compensation blocks service/cron reload and requires
  read-only incident audit.
