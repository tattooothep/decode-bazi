# Ziwei V3 scheduler and immutable delivery integration

Status: implemented and locally tested; not deployed, database-tested, physically delivered, or finally signed off.

## Changes

- Per-installation scheduling accepts existing schema 2 and new schema 3 only. Schema 2 keeps its historical compact copy/transport. Schema 3 selects the lossless codec and readable Type-C copy together, using the same profile and unchanged factual snapshot.
- Capability does not enter the occurrence key. Upgrading the app during a shichen cannot manufacture another occurrence identity.
- New V3 source facts record payload schema, readable presentation version, readable catalog SHA, full-meaning catalog SHA, and the presentation locale. The scientific calculation source digest is unchanged because no Ziwei calculation source changed.
- Reservation and retry reconstruct the exact selected V2 or V3 payload from the persisted immutable occurrence. Mixed, extra-key, unsupported, owner/profile/generation-mismatched or downgraded payloads fail closed. Current capability 3 can receive an already-sealed V2 attempt; capability 2 cannot receive a sealed V3 attempt. Arbitrary future capabilities are not presumed compatible.
- The locked account locale determines both history and provider copy at initial reservation. This fixes a pre-existing race where the claim/token locale could remain English while the locked history had switched to Thai. Private preview stays generic, localized, and governed by the existing user preference.
- V3 public meaning is independently recomputed from the immutable snapshot before history is written, then again from the snapshot and stored presentation locale during retry. Matching forged history text, provider text and message hash are not enough. A later account-locale change does not rewrite a sealed message.
- V2 historical source-fact shape and historical attestation remain accepted. No occurrence, history, registration or preference is rewritten by this code change.

## RED evidence

1. Scheduler sent `ziweiHourlyV2` for an explicitly capable schema-3 installation.
2. Existing retry policy rejected a valid sealed V2 attempt after a token's capability upgraded to 3.
3. In-memory reservation with stale claim locale `en` and locked account locale `th` produced English phone copy while stored history was Thai.
4. An independent reviewer identified a meaning-binding gap. An adversarial fixture replaced both public history and provider text with an unsupported lucky-hour claim and recomputed the message hash. The old attestation returned true. V3 now recomputes exact readable meaning from the immutable snapshot and stored presentation locale and rejects this case.

## GREEN evidence

- `test-ziwei-hourly-scheduler.mts`: exact schema/copy pairing, source fingerprints, stable occurrence identity, nine localized histories, unknown-capability rejection, unchanged source/release gates.
- `test-ziwei-hourly-notification-delivery-contract.mts`: V2 upgrade compatibility, V3 downgrade/future/mixed-schema rejection, expiry, consent, profile ownership/generation, quiet hours, privacy and uncapped hourly policy.
- `test-ziwei-hourly-v3-reservation.mts`: 72 accepted combinations = nine locales × two wire versions × two providers × public/private preview. SQL is mocked in memory; no database is contacted. Exercises exact reserved payload/message/hash, round-trip retry attestation, locked-locale race, semantic-copy forgery rejection, fingerprint/locale mutation, downgrade and owner/profile fences, and pre-transaction mixed-envelope rejection.
- `test-ziwei-hourly-readable-copy.mts`: 126 cases, nine locales, body max 361 characters, whole FCM request max 3882 bytes and Expo max 3593 bytes under the unchanged 4000-byte test guard.
- Relevant unchanged-science/shared checks: `test-zibai-delivery-contract`, `test-zibai-privacy-policy`, `test-qimen-three-layer-v3`, `test-qimen-push-registration`, `test-notification-r8-contract`, `test-notification-invariant-sharing`, `test-notification-atomicity-task3` all pass. These focused checks are not a claim that every repository test or scientific rule now passes.
- Parent independently reran mobile account/store clients (47/47), Ziwei capability, notification wiring and V3 wire tests at mobile `0e95e761e249d2c17771be02f89f6a976d51972c`; actual FCM/Expo fixtures passed the installed SDK remapper and live/cold-start offline routing in the mock harness. No physical device was used.

## Remaining gates

- Independently review this integration, including the final semantic-copy fence; obtain all five final goal signatures on exact release artifacts only after the other goal work streams are ready.
- Execute the additive migration against a disposable verification database before any production migration. The compatibility migration is fail-fast (`lock_timeout=1s`, `statement_timeout=5s`), permanent and does not rewrite rows. A timeout is an operator retry condition, not permission to pause the service or remove locking guards.
- Compatible backend, preference/registration readers, scheduler loaders and immutable V3 retry readers must all be available before APK schema-3 enrollment. Earlier compatibility-only commits that still have a schema-2-only scheduler are NOT adequate rollback targets.
- Preserve schema-3 acceptance, scheduler eligibility and history/detail decoding in any rollback artifact once schema-3 installations exist. Keep the database expansion. No downgrade/relabeling of stored payloads or deletion of registrations is permitted.
- Build actual backend/APK artifacts; check startup, database migration, provider receipt, phone display and detail opening. Provider acceptance is not proof of display. No live push or migration has been performed here.
- A separate pre-existing `test-notification-integrity-contract.mts` source-regex mismatch expects a single-line `UPDATE mobile_push_tokens SET enabled=false`; the existing route has a newline between the table and `SET`. It was reported by the compatibility reviewer and has not been silenced or changed in this task.

The broader goal remains active: Qimen month-dependent star integration and door-lineage decision, external Expo credentials, R8/runtime reconciliation, staged deployment and final independent reviews are still outstanding.
