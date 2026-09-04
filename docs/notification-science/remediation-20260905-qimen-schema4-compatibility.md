# Qimen capability4 compatibility — 2026-09-05

Source-only expansion; no migration, registration or environment mutation was executed.

The push registration route accepts exact numeric schemas1/2/3/4 and rejects unknown or coerced values before connecting to the database. Both registration and preference refresh retain Qimen eligibility for schemas3/4 with the same existing consent, location/freshness, ownership-generation and quiet-hours behavior. No user toggle is enabled by this migration.

The new `20260905_mobile_qimen_schema4_compatibility.sql` only expands the constraint domain, in one transaction with1s lock timeout and5s statement timeout. It does not rewrite tokens, snapshots, preferences or historical migrations. Lock contention must abort and be retried as a whole transaction later; do not pause services or extend lock waits.

Fresh RED: the actual transpiled route returned400 for numeric capability4. GREEN: the route validation harness now passes1–4 up to an intentional stop before DB; rejects9 malformed/future values without connecting; preserves Qizheng hard-off, unsupported-locale and native-platform identity rejection. SQL shape checks prove the two enrollment paths agree; they do not prove PostgreSQL execution or physical delivery.

Passing commands:

```sh
node --no-warnings --experimental-strip-types scripts/test-qimen-schema4-compatibility.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-push-registration.mts
node --no-warnings --experimental-strip-types scripts/test-ziwei-schema3-compatibility.mts
node --no-warnings --experimental-strip-types scripts/test-mobile-push-ios-readiness.mts
```

Independent scoped review is recorded in `remediation-20260905-qimen-seasonal-root-review.md`. This is not one of the final release signatures.

Deploy order remains: complete/test compatible backend producer, reservation/retry and all detail readers; apply expansion safely; configure explicitly approved door method; then release mobile capability4. After enrollment, rollback must retain capability4 API/schema/producer eligibility plus V4 historical detail/retry readers. Old demotion rollback migrations are unsafe for this release. Source compatibility alone neither fixes Expo credentials nor activates corrected Qimen on production.
