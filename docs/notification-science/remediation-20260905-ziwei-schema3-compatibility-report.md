# Ziwei schema-3 compatibility expansion — 2026-09-05

Status: backend compatibility implementation only. The migration was not executed, no schema-3 client was enrolled, and this is not a rollout or provider-delivery signature.

## Result

The backend now recognizes Ziwei payload schemas 2 and 3 as the two delivery-capable, lossless formats while preserving schemas 0 and 1 as accepted historical/non-enrolled values.

- Push registration accepts only exact numeric schemas `0`, `1`, `2`, or `3`; omitted capability remains `0`, and arbitrary future values remain invalid before database mutation.
- The existing iOS readiness gate remains authoritative. An iOS request for schema 3 persists/enrolls as schema 3 only when `EXPO_IOS_PUSH_READY === "true"`; otherwise its effective schema remains 0. Android preserves an explicitly validated schema 3.
- Valid schema-2 and schema-3 registrations can both enable an installation when the existing account preference, self-profile ownership, confirmed birth context, canonical resolver, and fingerprint checks succeed.
- Preference resynchronization, notification health inventory, and the birth-context recovery preflight now treat schemas 2 and 3 as eligible.
- No user preference, profile, ownership, canonical-context, quiet-hour, or other-science rule changed.

## Additive migration

`20260905_mobile_ziwei_schema3_compatibility.sql` drops and recreates only `mobile_push_tokens_ziwei_payload_schema_check`, expanding its domain from `(0,1,2)` to `(0,1,2,3)`. It is transactional and rerunnable and performs no row update, insert, or delete.

The migration sets `lock_timeout='1s'` and `statement_timeout='5s'`. It therefore fails fast rather than waiting behind notification reads or registrations while requesting PostgreSQL's `ACCESS EXCLUSIVE` table lock. There is no retry loop inside the transaction and no service-pause choreography. If lock contention aborts the migration, an operator should retry the entire migration off-peak after the failed transaction has ended; they should not lengthen the lock wait or pause notification services.

The historical `20260826_mobile_hourly_sciences.sql` migration remains unchanged with its original `(0,1,2)` constraint. A repository-wide migration scan found no stored database function that filters `ziwei_payload_schema=2`, so no function replacement belongs in this compatibility migration.

## RED / GREEN evidence

The new pure contract was run before implementation and failed at the missing additive migration:

```text
AssertionError: expected BEGIN ... DROP CONSTRAINT ... schema-3 compatibility expansion
actual: empty migration source
```

The lock hardening was also pinned RED before its implementation:

```text
AssertionError: compatibility DDL fails fast instead of queuing an access-exclusive lock behind live traffic
actual: SET LOCAL lock_timeout = '55s'
expected: SET LOCAL lock_timeout = '1s'
```

After the implementation:

```text
ZIWEI_SCHEMA3_COMPATIBILITY_OK
PASS mobile hourly science preferences — separate toggles, self profile, Qizheng hard unavailable
MOBILE_PUSH_IOS_READINESS_OK
PASS Ziwei canonical consumers — chart/preview/prefs/push/scheduler share one resolver fingerprint
ZIWEI_NOTIFICATION_OBSERVABILITY_OK
QIMEN_PUSH_REGISTRATION_OK
```

The focused contract verifies:

- historical migration preservation and exact additive constraint expansion;
- exact one-second lock and five-second statement timeouts with no in-transaction retry loop;
- absence of capability-migration data rewrites or unnecessary stored-function replacements;
- exact request validation through schema 3 and rejection of unreviewed future schemas;
- effective platform-gated schema-2/schema-3 enrollment;
- exact iOS fail-closed behavior for schema 3;
- both preference SQL predicates needed for `enabled` and `next_due_at`;
- schema-2/schema-3 health and recovery-preflight eligibility.

No database-backed suite, migration execution, production database, full build, provider send, environment mutation, deployment, or push was used.

`scripts/test-notification-integrity-contract.mts` was also invoked and failed on an unrelated pre-existing source regex that requires the literal single-line text `UPDATE mobile_push_tokens SET enabled=false`. The baseline route already places `SET` on the following line and includes the R8 audience rotation. This task changes only the earlier Ziwei request validation and enrollment expressions, so the unrelated fixture was not altered.

## Deployment and rollback boundary

Deploy the schema-3-capable server readers together with the additive expansion migration before distributing or enabling APK schema-3 enrollment. The compatibility expansion becomes a permanent floor once any client has registered schema 3.

A later scheduler or APK activation rollback may stop producing new V3 notifications, but it must retain:

- the broadened database constraint;
- route acceptance and effective iOS gating for schema 3;
- schema-3 installation eligibility in preference synchronization;
- schema-3 observability and recovery-preflight visibility;
- V3 parsing/history support.

Narrowing the constraint or reverting these readers after schema-3 rows exist would make valid registrations invisible or cause foreground re-registration to fail. This change therefore intentionally has no downgrade migration that rewrites or rejects schema-3 registrations.
