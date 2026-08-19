# Android Time-Alert Delivery Design

## Goal

Make current-period Yam/QiMen and Zi Bai alerts interrupt visibly on Android without allowing obsolete period alerts to arrive later.

## Evidence and cause

- Production generated all five inspected alerts and FCM accepted each exactly once.
- Current time alerts use `priority: NORMAL`, no sound, the `hourkey-reminders` channel at `DEFAULT` importance, and a 300-second TTL.
- The older notification design used `hourkey-updates` at `HIGH`; Android can preserve that old channel across upgrades, while a fresh install receives only the newer default-importance channel.
- FCM acceptance is not proof of device receipt or Android display. Normal-priority messages can be delayed while a device sleeps; a five-minute TTL can then expire.
- Android does not allow an app to raise the importance of an already-created channel, so changing `hourkey-reminders` in place is insufficient.

## Approved design

1. Add a new immutable Android channel ID: `hourkey-time-alerts-v2`.
2. Mobile creates that channel at `AndroidImportance.HIGH` with default sound and vibration.
3. Backend maps only `yam`, `qimen`, and `zibai` to the new channel and sends them at provider priority `HIGH` with sound `default` for both FCM and Expo.
4. Preserve the 300-second TTL so stale two-hour/daily advice cannot arrive much later.
5. Keep ordinary daily, goal, saved-date, and shrine notifications on `hourkey-reminders` at their existing non-intrusive policy.
6. Change the Firebase manifest default channel from stale `hourkey-updates` to the actually-created `hourkey-reminders`; explicit time alerts still use `hourkey-time-alerts-v2`.
7. No payload, calculation, consent, quiet-hours, cap, privacy, retry, or history behavior changes.

## Verification contract

- Backend tests must prove FCM and Expo Yam/QiMen/Zi Bai messages use the new channel, high priority, default sound, and 300-second TTL.
- Tests must prove ordinary daily reminders remain normal/default and use `hourkey-reminders`.
- Mobile source/config tests must prove the new channel is created at HIGH and the manifest default names a channel that the runtime creates.
- Existing strict payload, provider parity, retry-expiry, notification wiring, TypeScript, and diff checks must remain green.
- Final acceptance requires three independent read-only signatures on exact clean backend and mobile commits.

## Non-goals

- Do not override a user's Android notification settings.
- Do not reuse security/service channels for time alerts.
- Do not lengthen time-bound TTLs or replay expired occurrences.
- Do not change Zi Bai or QiMen science/copy.
