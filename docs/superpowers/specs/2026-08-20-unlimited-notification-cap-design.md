# Unlimited Notification Cap Design

## Decision

`mobile_notification_prefs.max_per_day = 0` means unlimited. Positive values keep their existing daily-cap meaning. This is backward compatible with the existing wire range (`0..10`) and database constraint, and no production preference row currently uses zero.

## Runtime contract

- `push-guard.cjs` allows an opted-in non-transactional notification when `max_per_day` is zero, subject to pause and quiet hours.
- Durable reservation and retry policy apply the cap only when it is positive. This keeps producer guards and the external-send boundary consistent.
- The mobile settings UI exposes a localized Unlimited choice that writes `maxPerDay: 0`; existing 1, 2, and 4 choices remain.
- Defaults remain capped. Only an explicit user choice or owner-approved account update enables unlimited delivery.

## Release and safety

- Capture RED/GREEN tests for guard, reservation/retry, API serialization, mobile parsing, and the settings control.
- Deploy backend before writing zero to production so the old zero-means-block behavior is never active for the account.
- Build a monotonic mobile version and require the established three independent signatures before publishing it.
