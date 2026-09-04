# HourKey Astronomy Facts and 七政四餘 Notification R8 Design

**Status:** User-approved design; implementation and production enablement remain unapproved until the final evidence gates pass.

**Approved:** 2026-09-04, Asia/Bangkok

**Backend baseline:** `261097ad7e2afe25d81f07b4a934fe3b83272a22`

**Mobile baseline:** `5af5f20687f40e55c23c52a15a6b620c700848b6`

**Current safety state:** Qizheng electional is hard-off, its mobile payload schema is `0`, and its source evidence is incomplete. This design does not authorize changing those facts.

## 1. Outcome

HourKey will add two explicitly separate notification products:

1. `astronomy_fact` — observable or calculated sky facts with no Qizheng judgment.
2. `qizheng` — source-approved 七政四餘 electional results derived from deterministic classical rules.

The products have separate names, consent, schemas, channels, analytics, producer gates, schedules, and detail screens. A fact can never become a Qizheng judgment through wording, AI, ranking, or a shared score.

The design reuses the user's canonical server profile without asking them to create or enter another birth profile. It supports two-hour, event/daily, weekly-digest, solar-month, and annual-limit cadences only where the corresponding data or classical rules genuinely support them.

Production remains hard-off until the exact implemented bundle passes all science, time, privacy, delivery, mobile, scale, rollback, and five-signature gates in this specification.

## 2. User-Facing Products

### 2.1 Information architecture

The notification center shows two independent cards:

| Product | Thai title | Meaning | Default |
|---|---|---|---|
| `astronomy_fact` | ข้อมูลท้องฟ้าจริง | Reproducible astronomy facts; not a prediction, 時辰, or auspicious-time judgment | Off |
| `qizheng` | 七政四餘 เลือกฤกษ์ | Activity-specific results from a versioned and source-approved Qizheng rule pack; no outcome guarantee | Off |

The cards must not sit behind one master switch that implies both are the same science.

### 2.2 Astronomy-fact modes

#### A. Civil two-hour sky snapshot

- Uses local civil boundaries `00:00, 02:00, ... 22:00` in the recipient display timezone.
- Is labelled “ข้อมูลท้องฟ้าทุก 2 ชั่วโมง,” never “ยามตามศาสตร์” or 時辰.
- Shows the seven physical bodies separately from calculated points.
- Calculated points must identify their exact definition, such as mean node, true node, or lunar apogee.
- 紫氣 is absent from the schema until lineage, epoch, calibration, and goldens are accepted.
- Must not contain `12宮`, `三主`, `廟旺`, `恩用仇難`, `格局`, a score, good/bad wording, advice, or personalization.

#### C1. Exact astronomy event

- Sends only event types admitted by the versioned C1 taxonomy.
- Each event definition pins geocentric or topocentric frame, apparent or mean position, crossing algorithm, precision, rounding, tolerance, and body/point definitions.
- Examples may include a physical ingress or an exact configured aspect only after its astronomy golden tests pass.
- An astronomy event has no Qizheng meaning unless a separate C2 rule independently qualifies it.

### 2.3 Qizheng modes

#### B. Activity-specific electional window

- Accepts only activities in a signed allowlist.
- Uses a deterministic matrix specifying which owner roles and natal profiles an activity requires.
- Uses the saved activity, site, direction, and required owners.
- Evaluates `體` before `用` and applies hard vetoes before any positive rules.
- Sends only qualifying actionable windows and does not promise that every shichen or day has a result.

The rule pack permanently denies:

- medical treatment, surgery, or advice replacing a clinician;
- pregnancy, child sex, fertility, or guaranteed biological outcomes;
- guarantees of wealth, rank, status, or success.

#### C2. Qizheng rule event

- Every result cites an approved rule ID and exact source page/cell.
- A modern astronomy event cannot be promoted to C2 by changing its prose.
- The complete source/rule chain is available in the authenticated expert detail.

#### D1. Rule-derived solar month

- A physical Sun ingress by itself remains C1.
- Any Qizheng solar-month meaning requires its own approved rule ID, page/cell, precedence, and goldens.
- D1 has a schema, gate, and rollout independent of B, C2, and D2.

#### D2. Annual limit

- Requires a complete double-transcribed formula, precedence table, boundary tests, and reproducible goldens.
- The existing estimated 出命限/three-degree shortcut is forbidden in notifications.
- D2 has a schema, gate, and rollout independent of the other modes.

### 2.4 Daily and weekly behavior

- “Daily” means approved exact events or qualifying electional windows occurring that day; HourKey does not synthesize a daily horoscope.
- “Weekly” is a digest of already approved occurrences. If none exist, no push is sent.
- The app may factually state that no approved occurrence was found, but must not claim the week is normal, safe, bad, or uneventful.

## 3. Source and Science Contract

### 3.1 Locked evidence

The existing `陽宅大成` booklets 7–16 and their canonical registry remain the starting evidence set. The current source digest is:

`af7999aff8395b33bc73fa3c6821e3455715bc03d76f0959afddb1392a394bf2`

No rule can enter production from a source marked `pending_double_verification`.

Every production rule must include:

- source work, volume, page, row/cell, scan digest, and crop digest;
- independent transcription A and B;
- normalized rule code and lineage;
- input fields and typed output code;
- precedence, hard-veto behavior, and missing-input behavior;
- positive, negative, boundary, and cross-lineage golden cases.

### 3.2 No hybrid rules

No Qimen, Zi Bai, Zi Wei, Yam, western electional, or hand-weighted scoring rule may contribute to a Qizheng verdict. Shared infrastructure may transport a result but cannot calculate or reinterpret it.

### 3.3 Deterministic output

AI is absent from production selection, calculation, template selection, rendering, and delivery.

Production copy uses only this fixed mapping:

```text
event_or_rule_code × context_code × locale × copy_version → template_id
```

The renderer interpolates only allowlisted typed facts. An unknown code, missing template, extra claim, or disallowed term fails closed. AI may help draft copy offline, but a human reviewer must approve and pin it before it enters the mapping.

## 4. Canonical Profile and Time Model

### 4.1 Profile ownership and reuse

The server resolver must query the exact active profile using:

```text
profile_id + org_id + created_by_user_id + active
```

It must never use `profiles[0]`, device local storage, a Bangkok fallback, a noon fallback, or a relationship-only guess for the self profile.

There is one active self profile per `(org_id, created_by_user_id)`, enforced by a partial unique constraint. A transactional upsert reuses its UUID. The mobile app asks only for a genuinely missing field and never presents a duplicate birth form or silently creates another profile.

All natal-derived modes require `birth_time_known=true`. When birth time is unknown, time-dependent outputs are absent/null and the resolver returns a typed blocked reason.

### 4.2 Persisted birth context

The canonical schema stores:

- birth wall-clock value without a forced offset;
- validated IANA timezone;
- explicit DST-fold choice where required;
- tzdb version;
- latitude, longitude, place ID, display name, provenance, and confirmation timestamp;
- `birth_time_known` and monotonic profile revision.

The resolved UTC instant is derived and versioned. It is never persisted by appending `+07:00` to non-Bangkok births.

### 4.3 Four independent contexts

The resolver keeps these contexts separate:

1. Birth wall clock, timezone, fold, and birth location.
2. Candidate/event instant, timezone, and election site.
3. Recipient display and quiet-hours timezone.
4. Observation site for topocentric or altitude/azimuth facts.

Timezone is never inferred from longitude.

### 4.4 DST and travel behavior

- A nonexistent birth wall time blocks natal calculation.
- An ambiguous birth time requires an explicit earlier/later fold choice.
- Civil two-hour snapshots use local boundaries `00, 02, ... 22`.
- A nonexistent snapshot boundary is skipped.
- A repeated boundary uses the earlier offset once.
- Its identity contains UTC instant, offset, fold, and local civil date.
- A snapshot mode emits at most 12 units per local civil day.
- Exact events are keyed by UTC instant.
- Changing display timezone, site, or location bumps the context generation, suppresses stale queued work, and regenerates only future work.

Location freshness is context-specific:

- confirmed natal location remains valid until edited;
- saved election sites carry an explicit revision;
- current-device location leases last seven days;
- stale current location suppresses only location-dependent A/C1 facts;
- a geocentric C1 event does not require a current location.

## 5. Consent, Frequency, and Multiple Devices

### 5.1 Consent receipt

Every category and submode is default-off. A versioned receipt binds:

- tenant/account and primary installation;
- category and submode;
- cadence and cap;
- locale and copy version;
- exact profile IDs, revisions, and owner roles;
- activity and site revisions;
- consent and update timestamps.

The sender revalidates this receipt and every current generation immediately before provider submission.

### 5.2 Caps

| Mode | User-visible cap |
|---|---:|
| A: two-hour facts | 12/day after separate high-frequency opt-in |
| C1: exact astronomy events | 4/day; overflow goes to inbox/digest |
| B: electional windows | Default 4/day; choices 1, 2, 4, or every qualifying window, always bounded by 12 |
| Weekly digest | 1/week |
| D1/D2 | Event-driven and still subject to aggregate caps |

Across all new `astronomy_fact` and `qizheng` pushes, the account receives at most 12 external pushes per local civil day and at most 12 in every rolling 24-hour interval.

Priority is deterministic:

```text
actionable B/C2/D2 > D1 > C1 > A > weekly digest
```

Lower-priority items go to inbox or are suppressed according to their contract; they are never falsely presented as delayed live advice.

Legacy Yam, Qimen, Zi Bai, and Zi Wei caps and priority remain unchanged and reserved. The UI states the possible combined total before opt-in.

### 5.3 Quiet hours

- Default quiet hours are `22:00–07:00` in the recipient display timezone and are editable.
- A snapshots expire during quiet hours and do not catch up.
- B sends after quiet hours only if the window is still actionable.
- Other events use their explicit inbox/digest behavior.
- The system must not release a morning burst at 07:00.

### 5.4 One external push, multiple inboxes

Delivery semantics are one external push per account, category, submode, and notification unit.

- The server maintains one stable random internal `account_delivery_chain_uuid` per exact tenant/account/category/submode.
- A partial unique constraint and transactional idempotent CAS/upsert enforce a single active chain.
- One endpoint is the DB-unique `primary_push_endpoint` for that chain.
- Other signed-in devices receive synchronized inbox data but no duplicate external push for the same unit.
- Token rotation, reinstall, consent edits, locale edits, and endpoint changes update a target revision under the same chain.
- Opt-out/re-enroll resumes only future unsent units.
- Tombstones prevent a possibly accepted or accepted future unit from being sent again.
- A correction requires explicit correction consent, a new labelled correction lineage, and a reference to the original.

## 6. Locale and Copy Contract

Supported BCP 47 tags are:

```text
th, en, zh-Hans, zh-Hant, vi, ja, ru, ko, es
```

The compatibility layer maps legacy `cn` to `zh-Hans` and legacy `zh` to the product's reviewed Traditional Chinese locale without changing stored legacy notification behavior.

Each immutable message pins its locale and copy version. Every locale requires human review and the same forbidden-claim scan.

The compact view must immediately state:

- astronomy facts are not predictions; or
- a Qizheng result is rule-derived and does not guarantee an outcome.

The expert view progressively discloses `體/用`, vetoes, nodes/apogee definitions, source location, model versions, profile revision, and qualify/block reasons.

Real-device tests cover Thai/CJK/Cyrillic wrapping, truncation, fonts, accessibility, calendar/date/time formats, and DST labels.

## 7. Privacy and Detail Navigation

### 7.1 Stored data

- Classified fields and snapshots are encrypted.
- Profile-derived server mappings and mobile offline snapshots have a maximum 90-day TTL and are removed earlier on revoke, profile deletion, account deletion, or account switch.
- Context digests use a versioned, domain-separated HMAC with a key ID.
- A raw or directly brute-forceable hash of birth time or location is forbidden.

### 7.2 Provider payload

The provider payload and URL contain only:

- schema and category;
- opaque occurrence ID;
- random installation-scoped audience binding that rotates on logout, transfer, or reinstall;
- allowlisted route metadata.

They contain no raw user, organization, or profile ID, no coordinates or birth facts, and no judgment text in data fields. Lock-screen preview is redacted by default.

### 7.3 Detail open

The mobile allowlist adds separate routes for astronomy facts and Qizheng detail. Every open:

- authenticates the current account;
- verifies occurrence and endpoint ownership server-side;
- uses `Cache-Control: no-store`;
- reads the stored immutable snapshot and never recomputes it;
- returns a generic unauthorized response that does not reveal existence;
- distinguishes safe expired, revoked, rollback, and offline UI states without a retry loop.

### 7.4 Deletion order

Deletion performs these operations in order:

1. Acquire the exclusive delivery fence.
2. Suppress scheduled, claimed, and outboxed work.
3. Purge provider-message plaintext and detail mappings.
4. Queue a mobile purge for the next authenticated contact.
5. Destroy the per-user envelope key.

Permanent audit data must be aggregate and cryptographically unlinkable; a hashed user identifier is not acceptable.

## 8. Backend Architecture

### 8.1 Lane isolation

The runtime lane key is:

```text
science_id + submode + schema_version
```

Each lane has a separate producer gate, queue/partition, worker quota, rate limit, circuit breaker, scheduler lease namespace, and monotonic rollout epoch. Fences run at enqueue and immediately before provider submission.

Domain subscription, occurrence, and producer-state records are separate for `astronomy_fact` and `qizheng`. Existing transport primitives may be reused only through the lane contract; no new payload may masquerade as `yam`, `qimen`, `zibai`, `ziwei`, `daily`, or `service`.

Old clients advertising Qizheng schema `0` are never eligible.

### 8.2 Notification units

`notification_unit_id` is collision-free and defined per submode:

| Submode | Unit identity |
|---|---|
| A | Civil boundary instant and fold |
| C1 | Exact event type, frame, sorted bodies/subject/object, crossing instant |
| B | Activity subscription, qualified window start/end, site/direction intent |
| C2/D1/D2 | Approved stable rule-event unit code, applicable interval, and intent |

No coalescing occurs by default. If enabled later, the bundle must contain a versioned `coalescing_rule_id`, the exact sorted code set, and every contributing rule ID in audit evidence.

Bundle upgrades require a signed deterministic old-to-new lineage alias map. If a safe map cannot be constructed, activation waits until the old scheduling and delivery horizon expires with no overlap.

### 8.3 Two-key identity model

```text
delivery_lineage_key = account_delivery_chain_uuid + notification_unit_id
```

The lineage excludes rotatable HMAC keys and result, profile, rulepack, schema, copy, and rollout revisions.

```text
result_revision_key = delivery_lineage_key
  + typed intent/context HMAC
  + profile/site/owner/consent generations
  + rulepack/calculation/schema/copy/rollout versions
```

The canonical identity record uses versioned canonical CBOR. Every field is non-null, using a tagged `absent` sentinel where necessary. A `BINARY(32)` identity hash is DB-unique, or the implementation must prove equivalent `NULLS NOT DISTINCT` behavior.

The typed context covers activity, direction, roles, subscription intent, and all result-affecting inputs. Any relevant change creates a new result revision and suppresses the old pending revision. Across every revision and alias of one lineage, at most one provider attempt may be classified `possibly_accepted` or `accepted`.

### 8.4 Transactional state machine

The outbox state machine is:

```text
scheduled
  → claimed
  → outboxed
  → provider_submitting
  → accepted | submit_unknown | rejected_retryable
  → acknowledged | failed | expired | suppressed
```

Each attempt has a monotonic attempt number, stable correlation ID, immutable payload digest, max age, and one acceptance class:

- `authoritative_not_accepted`
- `possibly_accepted`
- `accepted`

A retry is allowed only when provider-specific evidence proves `authoritative_not_accepted`, and is bounded by max attempts and max age. A timeout, crash, or stale `provider_submitting` becomes `submit_unknown/possibly_accepted` and is never resent. This accepts a possible missed notification to prevent duplicate external submission.

Changing `possibly_accepted` to `accepted` updates the same attempt record. `accepted` or `submitted` is never reported as `delivered`; delivery requires provider/device evidence. Otherwise the receipt reaches an explicit unknown terminal state.

The client inbox also deduplicates the opaque occurrence ID.

### 8.5 Revocation linearization

The sender obtains a durable dispatch lease/CAS only when consent, ownership, endpoint, and context generations match. A mutation sets `revocation_pending` and obtains the exclusive delivery fence. The sender holds a compatible fence from its final policy read through the durable provider result.

Revoke/delete returns success only after an earlier in-flight call is durable as terminal or unknown. No new provider submission may begin after successful revoke returns. A notification accepted before revoke began may still appear later and is recorded as prior in-flight evidence.

## 9. Mobile Architecture

The mobile release adds, independently for each category:

- capability schema declaration;
- strict payload parser with exact keys and size limits;
- Android channel and iOS category;
- allowlisted route and route dispatcher target;
- authenticated detail coordinator and screen;
- notification-center controls and copy;
- primary-endpoint state and synchronized inbox behavior;
- encrypted TTL-bound offline snapshot;
- logout/account-switch/profile-delete purge;
- foreground, background, and killed-app open tests.

The app must not enable the switch until backend capability, source gate, mobile schema, detail route, and account/profile eligibility all agree.

## 10. Observability and Capacity

Metrics are partitioned by science, submode, schema, rollout epoch, provider, and outcome without including PII.

Required measurements include:

- due-to-submit p50/p95/p99;
- oldest due and receipt backlog age;
- queue depth, claims, lease overlap, and stale submissions;
- provider rejection/accepted/unknown/receipt outcomes;
- suppression reason and cap/quiet-hour decisions;
- detail success, current 404/410, unauthorized, expired, and offline;
- DB pool use, worker saturation, rate limit, and provider quota;
- legacy-lane latency and error deltas.

Release gates are:

- p95 due-to-submit at most 5 minutes;
- p99 at most 10 minutes;
- oldest due and receipt backlog below 10 minutes;
- at least 2× tested peak headroom;
- DB pool and provider quota below 70%;
- legacy p95 regression below 5%;
- zero lineages with more than one possibly accepted/accepted attempt.

## 11. Deployment and Rollback

### 11.1 Build provenance

The implementation branch descends from the full backend and mobile baseline SHAs above. The final immutable release bundle additionally pins:

- final backend and mobile commits;
- Android APK/AAB and iOS archive/build digests;
- dependency lockfiles;
- astronomy library and dataset versions;
- reference-frame and C1 taxonomy versions;
- tzdb and ICU versions;
- rule/source/copy/schema digests;
- runtime-reported bundle digest.

### 11.2 Rollout sequence

1. Additive migrations and code with every new producer hard-off.
2. Authenticated pull-only facts.
3. Shadow mode whose process has no provider-send capability.
4. A 72-hour, 10,000-user combined soak.
5. Internal cohort.
6. 1% cohort.
7. 10% cohort.
8. Wide rollout per submode only after that submode's gates pass.

The soak includes 120,000/day boundary bursts, A+C1+B+C2+D1+D2, legacy noisy-neighbor load, timezones and DST, provider throttling, retries, delayed receipts, DLQ/detail traffic, crashes, restarts, deletion/revoke storms, and endpoint races.

### 11.3 Rollback

Every producer, queue envelope, sender, and endpoint target carries a monotonic rollout epoch. Rollback atomically:

1. Bumps and disables the affected producer epoch.
2. Stops new claims.
3. Fences stale queued and in-flight work before submission.
4. Marks unsent attempts terminal/suppressed.
5. Preserves occurrences, attempts, receipts, bundle digests, and audit evidence.
6. Leaves Yam, Qimen, Zi Bai, Zi Wei, security, service, and other lanes running.

## 12. Acceptance Tests

### 12.1 Science and reproducibility

- Seven physical bodies and each calculated point match pinned authoritative ephemeris goldens.
- Reference-frame, mean/true point, mansion boundary, precision, and tolerance tests pass.
- Every Qizheng rule passes positive, hard-veto, boundary, cross-lineage negative, and missing-input cases.
- D1 and D2 remain off until their independent goldens pass.
- 紫氣 remains absent until separately approved.
- No generated or heuristic wording can enter a production notification.

### 12.2 Profile and time

- DST gaps/folds in New York, Berlin, and London.
- Bangkok no-DST, Kolkata half-hour, Kathmandu quarter-hour, ±14-hour zones, Samoa skipped date, and dateline year changes.
- Same instant/different display zones preserve geocentric position.
- Same wall clock/different birth zones produce different instants.
- Concurrent self upserts leave one active self UUID.
- Cross-account/profile access is rejected.
- Local-device fallback and Bangkok/noon substitution fail closed.
- Profile, owner, activity, direction, site, timezone, and location mutations suppress stale work.
- Local-day and rolling-24-hour caps both hold during travel/timezone changes.

### 12.3 Identity, delivery, and races

- Canonical CBOR property tests cover field order, tagged absent, account/context isolation, and version migrations across implementations.
- Same-instant multi-event/multi-body and multi-activity/direction cases do not collide.
- Concurrent enrollment and repeated request/crash create one active chain.
- Two-device primary races select one endpoint.
- Token rotation, reinstall, logout/login, opt-out/re-opt-in, and accepted future units do not resend.
- Provider reject, timeout, crash-before-call, crash-after-call, receipt delay, and receipt expiry obey the state machine.
- More than one possibly accepted/accepted attempt per lineage is impossible.
- Revocation and deletion races produce no provider submission after successful return.

### 12.4 Mobile, locale, and privacy

- Android and iOS real-device tests open the correct detail from foreground, background, and killed states.
- Old schema-0 clients never receive new payloads.
- All nine locales pass human review, layout, accessibility, and forbidden-claim tests.
- Title, body, action labels, inbox, detail, payload, logs, analytics, and DLQ contain no forbidden PII or astronomy judgment.
- Unauthorized detail access reveals no occurrence existence.
- Offline, expired, revoked, and rollback states do not open another science or retry-loop.
- Logout/account switch/profile deletion purges local encrypted snapshots.

### 12.5 Non-regression

A pinned replay corpus compares the deployed baseline to the candidate after excluding only nondeterministic IDs, timestamps, and provider IDs. It covers:

- Yam;
- auspicious-time notifications;
- Qimen schemas v1/v2/v3 and detail routing;
- Zi Bai schemas v1/v2;
- Zi Wei schemas 0/2;
- security and service notifications;
- preference writes, caps, quiet hours, routes, channels, schedulers, receipts, and shared-resource load.

The expected result is byte-equivalent canonical payload behavior and no functional change in legacy lanes.

## 13. Kill Gates

The affected new lane is disabled immediately if any of these occur:

- cross-account ownership leak greater than zero;
- schema-0 send greater than zero;
- more than one possibly accepted/accepted attempt in a lineage;
- PII in any notification surface, log, analytics, or DLQ;
- astronomy-fact judgment or prediction wording;
- a Qizheng permanent-denylist claim;
- wrong template/rule, stale context, post-revoke-return submission, or digest/golden mismatch;
- unexpected current detail 404/410 above 0.5% in one hour;
- due or receipt backlog above 10 minutes for two consecutive checks;
- DB pool exhaustion, lease overlap, restart duplicate, or failed isolation gate.

Rollback preserves evidence and does not stop legacy lanes.

## 14. Existing Baseline Evidence

On the isolated backend worktree at the approved base commit:

- TypeScript typecheck passes.
- Qizheng factual electional preview passes and remains non-notifying.
- Qizheng 化曜 tests pass 26/26.
- Notification integrity and shared-invariant tests pass.
- iOS notification readiness passes.
- Science final-blocker test passes.
- The existing Qizheng timeline test passes 18/19 but produces a 297,635-character prompt against a 118,000-character cap. This is a pre-existing release blocker and further evidence that no AI/timeline prompt belongs in the R8 production notification path. It must be green or removed from the release path with explicit evidence before rollout.

## 15. Approval Gates

### 15.1 Design signatures

All five independent design reviewers approved `QZ-NOTIFY-DESIGN-R8` as design-only:

1. Science and source integrity — `DESIGN SIGNATURE 1 R8: APPROVE`
2. Product, UX, locale, and privacy — `DESIGN SIGNATURE 2 R8: APPROVE`
3. Architecture, delivery, and scale — `DESIGN SIGNATURE 3 R8: APPROVE`
4. Profile, time, location, and reproducibility — `DESIGN SIGNATURE 4 R8: APPROVE`
5. Red-team, safety, and cross-science regression — `DESIGN SIGNATURE 5 R8: APPROVE`

These signatures do not approve the current engine, source transcription, implementation, build, or production enablement.

### 15.2 Final implementation signatures

Production can open only when five independent reviewers approve the same immutable bundle digest containing source scans and double transcription, rulepack, ephemeris/reference frame, C1 taxonomy, tzdb/ICU, schemas, exact backend/mobile diff, builds, and test evidence.

No feature flag, administrator action, cohort rule, or deployment script may bypass this gate.
