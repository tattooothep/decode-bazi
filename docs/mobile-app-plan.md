# HourKey Mobile App Plan

Status: Phase 2 started · scaffold plus first mobile auth/profile API
Date: 2026-06-04
Owner boundary: native/mobile app work must not modify existing web pages or AI Sifu logic.

## Goal

Build a separate iOS/Android app for HourKey without destabilizing the existing web product.

The app should start as a small native shell that calls the existing HourKey backend, then gradually move to dedicated mobile API endpoints where native behavior differs from browser behavior.

## Non-Goals

- Do not rewrite existing pages such as `today.html`, `datepick.html`, `yongsennetwork.html`, `master.html`, or `account.html`.
- Do not change AI Sifu prompt, packet, scoring, or classics retrieval logic in this phase.
- Do not add real mobile payments in the first scaffold. Apple/Google payment policy needs a separate review.
- Do not replace the web app or force mobile users into the native app.

## Recommended Architecture

```text
decode-app/              Existing Next.js web/backend
hourkey-mobile/          New Expo React Native app

Web pages               Existing API/cookie auth
Native app              Dedicated mobile API/token auth over HTTPS
```

The scaffold can call safe existing endpoints:

- `GET /api/health`
- `POST /api/today`
- `POST /api/auspicious`
- `POST /api/network/score`
- `POST /api/sifu`
- `GET /api/sifu/history`

Sensitive mobile calls should use versioned endpoints:

- `GET /api/mobile/v1/session`
- `POST /api/mobile/v1/session`
- `DELETE /api/mobile/v1/session`
- `GET /api/mobile/v1/me`
- `GET /api/mobile/v1/profiles`
- `POST /api/mobile/v1/today`
- `POST /api/mobile/v1/datepick`
- `POST /api/mobile/v1/network/score`
- `POST /api/mobile/v1/sifu/chat`
- `GET /api/mobile/v1/sifu/history`

## Auth Boundary

Current web login uses cookie session:

- `POST /api/auth/login` sets an auth cookie.
- `GET /api/auth/me` reads cookie session.

Native app should not depend on browser cookie behavior long-term. Use:

- short-lived access token
- refresh token
- secure storage on device
- `Authorization: Bearer <access_token>`

Phase 2 adds the first mobile session endpoint. Native clients should store the returned Bearer token and send it in `Authorization`.

## MVP Screens

1. Login
   - Email/password form.
   - Phase 2 uses `/api/mobile/v1/session`.
   - Production should move token storage into secure device storage.

2. Home / Today
   - Daily score summary.
   - Key advice.
   - CTA: ask Sifu about today.

3. Datepick
   - Activity category.
   - People picker.
   - Results grouped by science.
   - Thai-first labels.

4. Network
   - Group filter.
   - Person cards.
   - Thai-first relationship explanation.

5. Sifu
   - Mobile chat.
   - Streaming support later.
   - History synced from DB.

6. Account
   - Tier.
   - Credits.
   - History.
   - Settings entry.

## Store Readiness Checklist

Before Play Store / App Store submission:

- App icon and splash.
- Privacy policy URL.
- Terms URL.
- Delete account / data request path.
- Crash/error logging decision.
- Push notification permission text if used.
- Payment policy decision.
- Test account for store review.
- iOS/Android package identifiers.
- Production API base URL pinned to `https://hourkey.io`.

## Safety Rules

- Native app is a separate project. It must not import or mutate web page files.
- Any backend changes for native must live under `/api/mobile/v1/*` unless explicitly approved.
- Any shared business logic should be moved into `src/lib/*` only when it reduces duplication and has tests.
- Existing web API contracts must not be broken.
- AI Sifu logic is read-only for this phase.

## Phase Plan

### Phase 1: Scaffold

- Create `/root/hourkey-mobile`.
- Expo + TypeScript.
- Basic navigation tabs.
- Health check against `https://hourkey.io/api/health`.
- Mobile-safe visual system.

### Phase 2: Read-Only Data

- Add `/api/mobile/v1/session`, `/api/mobile/v1/me`, and `/api/mobile/v1/profiles`.
- Show account/profiles through Bearer token auth.
- Show Today from existing APIs.
- No write actions except login/logout.

### Phase 3: Dedicated Mobile Auth

- Store tokens in secure storage.
- Add refresh/revocation if token lifetime needs to be shortened.
- Add device/session audit rows if research needs per-device tracking.

### Phase 4: Core Mobile Workflows

- Datepick grouped results.
- Network people picker.
- Sifu chat and history sync.

### Phase 5: Store Prep

- EAS config.
- Privacy/terms.
- Icons/splash.
- Internal testing builds.

## Initial Technical Choice

Use Expo React Native because it can target iOS and Android from one codebase, iterate quickly, and later ship through EAS Build.
