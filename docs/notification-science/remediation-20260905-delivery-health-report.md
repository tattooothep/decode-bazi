# Notification delivery health hardening — 2026-09-05

Status: code-only observability hardening. This change detects the diagnosed Expo Android credential failure plane; it does not repair provider credentials, attest readiness, send a canary, change delivery routing, or deploy anything.

## Outcome

Notification health now represents provider readiness as three independent facts:

- `fcm`: unchanged local service-account completeness check;
- `expoIos`: unchanged exact `EXPO_IOS_PUSH_READY === "true"` attestation;
- `expoAndroid`: new exact `EXPO_ANDROID_PUSH_READY === "true"` attestation, defaulting to false.

The aggregate enabled-token inventory is split into direct FCM, Expo iOS, Expo Android fallback, and an explicit unknown-platform Expo bucket. Each known Expo platform is compared only with its matching attestation. Unknown-platform Expo inventory always fails closed; the removed generic `expo` input cannot mark Android, iOS, or unknown inventory ready.

Recent terminal attempts now include `recentInvalidCredentialsCount`. Any dead attempt whose exact `last_error` is `InvalidCredentials` makes health unhealthy with `provider_invalid_credentials`, even when all three readiness facts are true. It uses the existing terminal-outcome predicate and configured `lookbackHours`; no lookback default, bound, or timestamp semantics changed.

The health response adds aggregate-only `metrics.readiness.activeProviderCounts` and `metrics.outcomes.recentInvalidCredentialsCount`. It emits no token, installation, account, credential, or provider-body data.

## Boundaries preserved

- `push.providerFor` and all sender behavior are unchanged.
- Android Expo compatibility fallback remains enabled for legacy installations.
- Direct FCM precedence remains unchanged.
- iOS Expo delivery remains unchanged.
- Registration ownership, registration preferences, retries, and token disabling are unchanged.
- No environment file, database row, service, release, or external provider was read or mutated for this patch.
- No real sender, production database, full build, push, or deployment was invoked.

## Regression evidence

TDD RED was captured before production edits:

```text
node --import tsx scripts/test-notification-delivery-health-platforms.mts
AssertionError: expected { fcm: false, expoIos: false, expoAndroid: false }
actual { fcm: false, expo: false }
```

The focused in-memory query fixture covers:

- both Expo platform attestations default false;
- Android attestation accepts only the exact lowercase value `true`;
- iOS and Android readiness are independent;
- active Android Expo fallback is unhealthy when only iOS is ready;
- active inventory is exposed by platform;
- a legacy generic `expo:true` input does not bless any Expo platform, including unknown platform inventory;
- all independently attested known platforms can be healthy;
- an in-window `InvalidCredentials` failure overrides otherwise-ready attestations;
- the terminal query continues to receive the configured 24-hour test lookback.

Existing pure CLI and endpoint fixtures were updated to the platform-specific readiness contract. The database-backed observability fixture's caller objects were updated for compatibility but it was not executed because this bounded task prohibited production/database-backed tests.

## Operational dependency still open

The diagnosed delivery root cause remains outside this code patch. An operator needs Expo/EAS credential-management authority for the production project and Firebase/Google Cloud IAM authority for its matching project to inspect or attach the Android FCM V1 service-account credential. Only after an Android Expo-only compatibility canary obtains both an accepted ticket and successful receipt should `EXPO_ANDROID_PUSH_READY=true` be placed in the runtime environment. Until then, its intentional default is false and health should remain unhealthy while Android Expo fallback inventory is active.

See `audit-20260905-expo-root-cause.md` for the sanitized production evidence and exact external repair procedure.
