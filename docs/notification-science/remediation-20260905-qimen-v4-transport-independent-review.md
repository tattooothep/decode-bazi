# Independent Qimen V4 transport review — 5 September 2026

Reviewer: `/root/qimen_transport_review_0905b`. Reviewer wrote only the independent test and this report, not the transport implementation. This is a bounded component review, **not one of the five final goal signatures** and not deployment or phone-delivery approval.

## Verdict

The occurrence-bound reservation/retry work is acceptable after the parent author's fix of the reproduced malformed-envelope downgrade. The public retry-worker regression now passes 19 checks. Whole-envelope size evidence and the existing implementation report still require correction; the current copy implementation is not a nine-locale implementation. Those limitations prevent calling the full notification release ready.

Reviewed worktree: `/root/worktrees/hourkey-qizheng-r8`; base HEAD when reviewed was `23699e2`. Implementation was uncommitted. Reviewed file hashes after the retry fix:

| File | SHA-256 |
| --- | --- |
| `src/lib/mobile-notification-delivery.cjs` | `4dae5477a85c7e1f6c54019d72066c2719c259fb0996ddc66f8d60284e570822` |
| `src/lib/push-send.cjs` | `9cb77d1d86a4222c9769356746abfc3b03b94d313d8cd983cc6c231a4a92edbe` |
| `src/lib/qimen-notification-presentation.cjs` | `760384118ce57db2168583db4e01a2b485a3a296480916f9b7a366204a08360e` |
| `scripts/mobile-qimen-push-cron.cjs` | `c3d807bcfdbb8eea5f4c839ef3c2565e15bd65d8a48baf0783f865741a194c19` |

Changes after those hashes require corresponding revalidation; no future copy or transport change is approved by this report.

## Reproduced issue and independent recheck

Before the fix, `applyCurrentPolicyLocked` decided whether an attempt needed occurrence attestation solely from successful parsing of its compact envelope. A mixed V4/V3 object, V4 plus an extra URL, unknown V5, or an empty payload returned a null descriptor and entered the generic historical Qimen branch.

The independent test executes the public `runRetryBatch`, not only the exported attestation helper. All SQL responses are in memory. It provides an occurrence whose consent and location are revoked, a capability-1 token, and each malformed envelope. All four incorrectly reached the send-start hook without reading the occurrence. The hook stops execution before any provider invocation.

Observed RED:

```text
QIMEN_TRANSPORT_INDEPENDENT_REVIEW checks=14 failures=4 network=0 database=mock
mixed V4/V3 envelope: send-start reached; occurrence reads=0; capability=1
extra URL envelope: send-start reached; occurrence reads=0; capability=1
unknown V5 envelope: send-start reached; occurrence reads=0; capability=1
missing envelope: send-start reached; occurrence reads=0; capability=1
```

The parent author changed retry classification to consult the persisted occurrence first and treat modern payload/source evidence as requiring strict attestation even when parsing fails. Every Qimen policy row now receives the current token capability.

Independent GREEN:

```text
npx --no-install tsx scripts/test-qimen-v4-transport-independent-review.mts
QIMEN_TRANSPORT_INDEPENDENT_REVIEW checks=19 failures=0 network=0 database=mock
```

Coverage includes:

- V2, V3 and V4 immutable reserved retries on a capability-4 installation, each through FCM and Expo;
- full occurrence `version_tuple` mutations for month, day, hour and an extra combined field;
- the four malformed-envelope cases above;
- completely stripped parent payload/source markers while the modern occurrence still exists;
- missing occurrence with either a versioned payload, snapshot digest or seasonal evidence;
- genuine pre-occurrence generic Qimen, with no modern markers, retaining its old account-policy eligibility.

The test does not establish a real phone receipt, lock behavior in PostgreSQL, or the acceptability of any calculated direction. Test chart arrangements are explicitly synthetic contract fixtures.

## Positive implementation findings

- Reservation and retry compare the complete persisted occurrence version tuple to the immutable snapshot, not only the hour version.
- V4 source facts must bind the seasonal context object exactly; selected direction, account, installation, start/end, digest, deadline and payload reconstruction are checked.
- V4 copy is recomputed from the persisted snapshot and locked historical presentation locale. Matching forged parent/provider text plus a matching replacement hash is still rejected.
- Known capability upgrades retain older payload versions. Unknown capabilities and V4-to-V3 downgrade fail closed in the attested path.
- Exact valid Qimen provider data contain only `notificationId` and one versioned payload. FCM retains the Expo native bridge `data.body` JSON shape; Expo retains the direct data shape.
- The extracted presentation module imports only snapshot runtime and component catalog. It does not load the cron, PostgreSQL, a worker or environment files. The cron still re-exports its historical copy function.
- Provider selection, channel, TTL and target isolation code are unchanged. This review did not change credentials or registrations.

## Other-science and focused checks

The following fresh checks passed with `globalThis.fetch` replaced by a function that throws `REVIEW_NETWORK_FORBIDDEN`:

| Test | Result |
| --- | --- |
| `test-qimen-v4-durable-delivery.mts` before the parent retry fix | 24 reservations passed |
| `test-qimen-seasonal-root-review.mts` | 72 boundary cases; real INSERT-conflict harness; V3 bytes and owner/downgrade gates passed |
| `test-ziwei-hourly-v3-reservation.mts` | 72 in-memory reservations, 9 locales, 2 schemas/providers/privacy modes passed |
| `test-ziwei-hourly-notification-delivery-contract.mts` | PASS |
| `test-zibai-delivery-contract.mts` | PASS |

After the retry fix, the author test reached its final obsolete source-regex assertion and failed because it still expected descriptor-only `qimenAttested` classification. The new behavioral regression passes; the obsolete assertion must be updated rather than restoring the vulnerable condition. Fresh all-green aggregate evidence must be collected after that update and any concurrent copy changes.

## Size evidence limitation

The author's 4,000-byte assertion measures the credential-free `prepareMessage` result. It does not measure the final HTTP body, and there is no numeric 4,000-byte runtime guard in the reviewed delivery or push-send files.

Using the valid V4 fixture, a 256-character synthetic target, and the exact current transport wrapper:

| Thai fixture / provider | Prepared message | HTTP request body |
| --- | ---: | ---: |
| Ordinary door profile / FCM | 3,772 B | 4,051 B |
| Dark-residual door profile / FCM | 3,744 B | 4,023 B |
| Ordinary door profile / Expo | 3,251 B | 3,534 B |
| Dark-residual door profile / Expo | 3,223 B | 3,506 B |

These are measurements, **not proof that FCM rejects those messages**: provider limits may count fields differently from total HTTP bytes. They do disprove treating this test as evidence that the whole HTTP envelope is below 4,000 bytes. The chosen engineering budget must be defined, tested on the final copied/localized payload and enforced without truncating required meaning.

## Language and evidence limitations

The reviewed copy builder selects Thai, Chinese or English, with other locales falling back to English. Accepting nine locale identifiers in `QIMEN_PRESENTATION_LOCALES` does not prove nine-language meaning. Current V3 hashes establish compatibility for the three fixture copies only. The separately assigned nine-locale work needs a new bounded payload/copy review.

The author report's claim that every listed test was pure and made no engine request is inaccurate. `test-qimen-scheduler.mts` calls `buildCanonicalQimenOccurrence` eight times without a calculation override. The default advisory fetch path issues `POST /api/qimen/calculate` with `skip_save: true`. This reviewer inspected that call chain but did **not** run the test, replay those requests, import the external engine/database module, or claim that `skip_save` proves absence of every service-side effect.

Tests importing the cron also execute its existing `.env.local` loader, so they should be described as in-memory/no DB connection rather than completely environment-free. This report does not assert which prior test commands were actually run beyond their reported evidence.

## Release boundaries

No DB write, live push, credential operation, deployment or external-engine import was performed in this review. Immutable history and already-reserved V2/V3 retry support remain required. Once V4 occurrences exist, rollback must retain V4 readers and a compatible retry runtime; reverting only to an enrollment-aware but V4-unaware sender is unsafe. The full goal still requires independent final-artifact review, controlled deployment and real-device receive/open-detail evidence.
