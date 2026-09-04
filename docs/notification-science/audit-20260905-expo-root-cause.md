# Expo `InvalidCredentials` root-cause audit — 2026-09-05

Status: read-only production diagnosis. This is not a delivery signature, deployment approval, or evidence that Expo credentials have been repaired.

## Executive conclusion

The 14 Expo failures in the production seven-day window are **not caused by duplicate/stale parallel registration rows and are not caused by the server's direct-FCM project configuration**.

They are two still-enabled legacy Android installations from app `1.0.0`. Neither installation has a native FCM token, so the central routing function deliberately falls back to its Expo token. Expo accepts the HTTP request but returns a per-message ticket error `InvalidCredentials`. Because every failed target is Android, Expo's documented meaning points to the Android FCM V1 credential attached to the EAS project being absent, invalid, revoked, or attached to the wrong Firebase sender/project. The available evidence cannot distinguish those four external credential states because this host has no authenticated EAS session.

The minimal root repair is therefore to have an authorized EAS/Firebase operator attach a valid FCM V1 service-account key for the same Firebase project to the EAS project's Android production push credential. Preserve both the direct-FCM route and the iOS Expo route. Do not disable or delete the legacy Android registrations: an Expo token cannot be converted into a native FCM token by the backend, and those installations need the repaired Expo compatibility path until the app is upgraded and re-registers.

There is also a monitoring defect: `EXPO_IOS_PUSH_READY=true` is currently reported as global `expo` readiness while the active Expo inventory combines Android fallback and iOS. This is why health reports `ok:true` and zero credential mismatches while also reporting 14 dead Expo attempts. This defect did not cause the sends to fail, but it hid the actionable provider failure.

## Scope and safety

- Live symlink inspected: `/root/releases/current` resolves to `/root/releases/decode-app-r573-network-morning-final`.
- The live and worktree copies of `src/lib/push-send.cjs` and `src/lib/mobile-notification-delivery.cjs` are byte-identical. The live readiness helper contains the same `expoIosPushReady` behavior; the worktree only adds unrelated R8 readiness exports. The push registration route differs only for the in-progress R8 additions; the provider/ownership behavior described below is common to both.
- All production SQL ran inside `BEGIN READ ONLY` with a 10-second `statement_timeout` and connection-level `default_transaction_read_only=on`.
- Database and provider credential values were parsed internally. No token, account identifier, installation identifier, key, email address, or credential content was printed or copied into this report.
- No sender was invoked, no credential was rotated, no database row was changed, no service was restarted, and nothing was deployed or pushed.

## Sanitized production evidence

### Seven-day provider outcomes

| Provider | Outcome | Category | Attempts | Distinct installations | Platform |
|---|---|---:|---:|---:|---|
| Expo | dead / `InvalidCredentials` | daily | 2 | 2 | Android |
| Expo | dead / `InvalidCredentials` | service | 2 | 2 | Android |
| Expo | dead / `InvalidCredentials` | yam | 10 | 2 | Android |
| FCM | provider accepted | daily | 1 | 1 | Android |
| FCM | provider accepted | service | 1 | 1 | Android |
| FCM | provider accepted | yam | 5 | 1 | Android |
| FCM | provider accepted | zibai | 91 | 2 | Android |
| FCM | provider accepted | ziwei | 84 | 2 | Android |

The 14 failures are seven parent notifications — daily 1, service 1, yam 5 — fanned out to two installations. All 14 made exactly one provider attempt and have no Expo ticket ID or provider message ID. `InvalidCredentials` is terminal in the sender, so there is no retry storm.

### Failed cohort

| Fact | Aggregate |
|---|---:|
| Platform | Android only |
| App version | `1.0.0` only |
| Native FCM present | 0 of 2 installations |
| Expo identity present | 2 of 2 installations |
| Registration enabled now | 2 of 2 installations |
| Registration last refreshed | both at least 30 days ago |
| Accounts | 1 |
| Historical token rows per failing installation | exactly 1 |
| Historical Expo identities per failing installation | exactly 1 |
| Historical native identities per failing installation | 0 |

Across all durable attempt history currently retained, Expo has 142 attempts from 2026-08-16 through 2026-09-04: all 142 are dead with `InvalidCredentials`, and none were provider accepted. This means `EXPO_IOS_PUSH_READY=true` is not corroborated by an accepted Expo attempt in this database. It does **not** prove iOS is broken because there are currently no enabled iOS registrations and the observed failures are Android-only.

### Current routable registration inventory

| Route selected from current row | App version | Registrations / installations | Accounts |
|---|---|---:|---:|
| Android Expo fallback | `1.0.0` | 3 | 2 |
| Android direct FCM | `1.0.233` | 1 | 1 |
| iOS Expo | none | 0 | 0 |

The failed account has multiple installation IDs, but there is no evidence that two rows claim the same installation or token. Current ownership anomaly checks returned zero for:

- more than one enabled row for an installation;
- more than one enabled row for an Expo identity;
- more than one enabled row for a native identity.

The database enforces this with a unique Expo-token index plus partial unique indexes on enabled `installation_id` and enabled nonblank `device_push_token`. The registration route also locks identities in the global installation → user → Expo → native order, disables a prior owner before upsert, and writes the supplied native token rather than resurrecting an older value.

Conclusion: the two rows are old, but they are not stale *parallel registration records* in the data-integrity sense. They are distinct, currently owned legacy installations. Deleting them would discard potentially valid device reachability without repairing the provider credential.

## End-to-end trace

1. Daily, service/network-morning, and yam producers load every enabled token and pass both native and Expo fields to the durable delivery layer.
2. `mobile-notification-delivery.cjs` re-reads the enabled row under the account and installation identity, then calls `push.providerFor(...)` before reserving an immutable provider attempt (`src/lib/mobile-notification-delivery.cjs:560-605`). A retry can only acquire a currently enabled row for that same account, installation, and already-reserved provider (`:696-725`, `:1333-1343`).
3. `providerFor` prefers direct FCM only when a non-iOS row has a native device token; otherwise a present Expo token selects Expo (`src/lib/push-send.cjs:139-146`). The failed legacy rows therefore select Expo by construction. This is the immediate routing condition, not a race.
4. Expo returns an HTTP-success response with a ticket whose `details.error` is `InvalidCredentials`. The sender maps HTTP failures to `expo_<status>` first and only reads `InvalidCredentials` from an Expo ticket after `response.ok` (`src/lib/push-send.cjs:315-347`). Therefore the absent `EXPO_PUSH_ACCESS_TOKEN` is not the observed failure: an Expo access-control rejection would be an HTTP error such as `expo_401`/`expo_403`, not this ticket-level provider error.
5. The sender marks `InvalidCredentials` non-retryable, and the durable layer makes it dead without disabling the token. Token disabling is reserved for `gone`/`DeviceNotRegistered` outcomes. That behavior is correct: a provider credential failure says nothing about whether the individual device token is dead.
6. The registration API intentionally accepts the nullable native pair for legacy compatibility but reports an Android registration deliverable only when it contains `device_token_type='fcm'` and a nonblank native token (`src/app/api/mobile/v1/push/route.ts:107-140`, `:175-198`, `:504-517`).
7. The current Android client closes the legacy gap: it retrieves a native device token, refuses an Android registration if no native token is available, and sends both that token and an Expo token bound to the configured EAS project (`hourkey-mobile-zibai-v3-p0/src/native/push.ts:335-453`). Thus app `1.0.233` routes direct FCM; the failed `1.0.0` installs predate this behavior.

## Credential and project findings

Local direct-FCM configuration is internally consistent:

- both service-account JSON locations are readable by the processes that use them and contain all required fields;
- both service accounts name the same Firebase project;
- that Firebase project matches the current mobile `google-services.json`;
- the Android package matches the package in `google-services.json`;
- 22 inspected mobile app configurations with an EAS project ID all use one common EAS project ID;
- direct FCM provider acceptance in production proves the key used by the sender can mint a usable FCM credential and send for this project.

This rules out a repo-side Firebase project drift for the working direct route. It cannot prove what FCM credential, if any, is attached inside Expo/EAS. Expo documents `InvalidCredentials` for Android as invalid standalone-app push credentials and directs operators to upload/configure the Android FCM V1 service-account key:

- [Send notifications with the Expo Push Service — response errors](https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors)
- [Obtain Google Service Account Keys using FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/)

No EAS credential metadata was available from this host. There is no global or local EAS CLI, no project dependency providing it, and no `EXPO_TOKEN`. The local Expo state file has only non-authentication device/analytics state. No new CLI was installed and no login was attempted.

## Candidate verdicts

| Candidate | Verdict | Evidence |
|---|---|---|
| Stale parallel registrations | Rejected as root cause | Zero active ownership collisions; each failed installation has one historical row and one Expo identity; retry revalidates same owner + installation. |
| Android Expo fallback | Confirmed immediate route | All 14 failures are Android `1.0.0`, Expo-present, native-FCM-absent. `providerFor` necessarily chooses Expo. |
| Local Firebase/server project mismatch | Rejected | Service account, mobile Firebase project, package, and direct FCM delivery agree. |
| Expo/EAS Android provider credential invalid or unbound | Confirmed failure plane; exact external state needs authorized inspection | Expo returned ticket-level `InvalidCredentials` for Android on every retained Expo attempt. The specific missing/revoked/wrong-key condition is not observable locally. |

## Exact minimal repair

### Required root repair — external credential plane

An operator with both of these authorities must act:

1. **Expo/EAS project credential authority** for the single project ID embedded in the production mobile builds (Owner/Admin or another role permitted to manage Android production credentials).
2. **Firebase/Google Cloud IAM authority** for the Firebase project used by `google-services.json`, sufficient to provide or create a service-account key authorized for FCM V1 (Expo documents the Firebase Cloud Messaging API Admin role).

Using the EAS dashboard or `eas credentials`, select Android → production → the `io.hourkey.app` application identifier → Service Credentials → FCM V1 service-account key, then attach a valid key for the matching Firebase project. The locally deployed direct-FCM key is a technically matching, working candidate, but whether it may be shared with EAS is an operator/security-policy decision. This audit did not export or rotate it.

After the attachment, perform one controlled Android **Expo-only compatibility canary** from the same EAS project and require both an `ok` Expo ticket and an `ok` receipt. Do not infer success from the upload screen alone. A current-build direct-FCM canary and an iOS Expo canary should also remain green.

No backend routing, token deletion, or registration disabling is required to make the legacy path usable after the EAS credential repair. Future notifications to the two legacy installations will continue through Expo; current builds continue to prefer direct FCM. Historical time-bound dead attempts should not be replayed.

### Minimal code hardening — make health platform-specific

This should be a small observability patch, not a sender-route change:

1. In both `scripts/notification-health.cjs::providerReadiness` and `src/lib/notification-health-route.ts::providerReadiness`, return distinct readiness facts:
   - `fcm` from the local FCM service-account check;
   - `expoIos` from `expoIosPushReady(env)`;
   - `expoAndroid` from a new exact, fail-closed `EXPO_ANDROID_PUSH_READY === "true"` attestation, set only after the credential canary succeeds.
2. In `src/lib/notification-observability.cjs::collectHealth`, split `active_expo_count` into:
   - `active_expo_android_count`: Android, no usable native FCM, nonblank Expo token;
   - `active_expo_ios_count`: iOS with nonblank Expo token.
   Compare these counts with `expoAndroid` and `expoIos` respectively. Keep `active_fcm_count` unchanged.
3. Add `invalid_credentials_count` to the terminal-outcome aggregate and emit `provider_invalid_credentials` whenever it is nonzero in the configured lookback. Today `deadLetterCount` is informational and is not added to `reasons`, allowing `ok:true` with 14 credential failures (`src/lib/notification-observability.cjs:150-155`, `:311-322`, `:402`).
4. Keep `push.providerFor`, the iOS Expo route, the Android Expo compatibility fallback, and all ownership rows unchanged.

This platform split is the minimum precise correction because the current health implementation maps `EXPO_IOS_PUSH_READY` to the single key `expo` (`scripts/notification-health.cjs:21-29`) while its inventory puts Android fallback and iOS into the same `active_expo_count` (`src/lib/notification-observability.cjs:143-148`). Production consequently reports `credentialMismatchCount=0`, `deadLetterCount=14`, and `ok:true` at the same time.

## Regression design

All automated tests below use mocked providers or disposable databases; none should call a real sender.

1. **Routing matrix — `push-send.cjs`**
   - Android + native FCM + Expo → `fcm`.
   - Android + Expo only → `expo` compatibility route.
   - iOS + APNs/native + Expo → `expo`.
   - No usable token → `null`/`no_token`.
   - A mocked HTTP-200 Expo ticket with `InvalidCredentials` is terminal and does not disable the token.
   - A mocked Expo HTTP 401 maps to `expo_401`, proving it is distinct from provider `InvalidCredentials`.

2. **Registration and ownership — existing mobile push endpoint fixtures**
   - Two genuinely distinct installations for one account remain two enabled delivery targets.
   - Token rotation for one installation leaves exactly one enabled row.
   - Account transfer by installation, Expo identity, or native identity disables the old owner atomically.
   - An old Android payload with no native token remains registered but returns `deliverable:false`; it is not silently reported ready.
   - A current Android payload with FCM returns `deliverable:true` and overwrites a prior nullable native field.
   - iOS deliverability remains gated only by the exact iOS readiness flag.

3. **Platform-scoped health — `test-notification-observability*.mts`**
   - Active Android Expo-only + `expoAndroid:false` → one credential mismatch and unhealthy reason.
   - Active iOS Expo + `expoIos:true` does not mask the Android mismatch.
   - Active iOS Expo + `expoIos:false` is independently unhealthy.
   - Active direct-FCM + readable matching local key remains ready.
   - One recent `InvalidCredentials` row makes health unhealthy even if both readiness attestations are true.
   - No notification token, credential value, or provider body appears in health output.

4. **Post-repair production acceptance (credential-authorized operator only)**
   - Android legacy Expo-only canary: ticket `ok`, receipt `ok`.
   - Android current direct-FCM canary: provider accepted; route remains FCM.
   - iOS Expo canary: ticket `ok`, receipt `ok`; `EXPO_IOS_PUSH_READY` stays true only with this evidence.
   - Sanitized 24-hour aggregate: `InvalidCredentials=0`, while FCM accepted outcomes continue. Do not replay expired daily/yam attempts.

## Remaining uncertainty

The data proves the failure boundary but not the exact EAS credential defect. Only an authenticated EAS credential view can distinguish no key, revoked key, wrong Firebase project/sender, or an attached key lacking the required IAM role. This environment has no authenticated EAS tooling, so that inspection and the credential canary require the external authorities listed above.

## Related provider payload-size clarification

This does not affect the `InvalidCredentials` diagnosis, but it constrains a separate Ziwei regression guard:

- Firebase describes the limit as: “Maximum payload for both message types is 4096 bytes.” Its surrounding text defines notification messages as predefined visible keys plus an optional data payload and data messages as custom key/value data. See [Firebase — Set message type](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type).
- Expo describes `MessageTooBig` as the “total notification payload” sent to Apple or Google exceeding 4096 bytes, and says its `data` object may be “up to about 4KiB.” See [Expo — push receipt errors and message request format](https://docs.expo.dev/push-notifications/sending-notifications/).

These primary documents describe the notification/message payload rather than HTTP headers. They do not state precisely enough whether the target token and Android transport configuration are excluded from the provider's byte calculation. Therefore a test that counts the entire serialized HTTP request body is demonstrably conservative, but these documents alone are not sufficient evidence to relax the production guard or choose a less conservative exact byte budget. Any change should first obtain a provider-grounded definition or a bounded non-production acceptance test covering the exact FCM and Expo envelopes.
