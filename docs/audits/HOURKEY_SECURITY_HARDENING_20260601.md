# Hourkey Security Hardening - 2026-06-01

Scope: hourkey.io nginx edge and `/root/decode-app` API route inventory.

## Applied Edge Controls

- Active vhost: `/etc/nginx/sites-enabled/hourkey.io`
- Shared hardening config: `/etc/nginx/conf.d/00-hourkey-hardening.conf`
- Active upstream release: `/root/releases/decode-app-r158-tongshu` on `127.0.0.1:3246`
- Rate limiting is enforced, not dry-run.
- Excess traffic returns `429`.
- API logs are separated at `/var/log/nginx/hourkey.api.access.log`.
- Logs intentionally omit query strings and referrers.
- CSP is `Report-Only` and reports to `/api/security/csp-report`.
- CSP report endpoint is handled by nginx as a `204` sink; report bodies are not stored.
- `/master-group` is no longer public and returns `404`.
- `/api/formulas*` is no longer public at nginx and returns `404`.
- `/api/engine-audit/status` is no longer public at nginx and returns `404`.
- `/api/maps-script` requires an hourkey.io referrer; direct/hotlinked requests return `403`.
- Dotfiles and sensitive backup/source extensions are blocked at nginx:
  `.env`, `.git`, `.sql`, `.bak`, `.old`, `.log`, `.conf`, `.map`, etc.

## Edge Rate Policy

| Area | Zone | Current policy |
|---|---:|---|
| AI routes | `hourkey_ai` | `1r/s`, burst `2-3` |
| Compute routes | `hourkey_compute` | `3r/s`, burst `6` |
| Auth routes | `hourkey_auth` | `5r/m`, burst `10` |
| General API | `hourkey_api` | `10r/s`, burst `20` |
| Connections | `hourkey_conn` | `80` concurrent connections per IP |

Important: nginx rate limits protect the edge. They do not replace app-level authorization.

## API Permission Matrix

### Admin Only

All routes below use `requireAdmin()` in code and should remain admin-only:

- `/api/admin/engine`
- `/api/admin/engine/:id`
- `/api/admin/engine/audit`
- `/api/admin/engine/export`
- `/api/admin/engine/import`
- `/api/admin/formulas`
- `/api/admin/formulas/:id`
- `/api/admin/formulas/export`
- `/api/admin/formulas/import`
- `/api/admin/library`
- `/api/admin/library/file`
- `/api/admin/paraphrase/:type`
- `/api/admin/paraphrase/:type/:id`
- `/api/admin/paraphrase/audit`
- `/api/admin/paraphrase/export`
- `/api/admin/paraphrase/import`
- `/api/admin/paraphrase/translate`
- `/api/admin/paraphrase/types`
- `/api/admin/sifu-prompts`

Current nginx adds an additional `hourkey_api` edge limit on `/api/admin/`.

### Login Required / Account Scoped

These routes use `getSession()` directly and should remain scoped to the session or org:

- `/api/account/history`
- `/api/account/me`
- `/api/account/mock-purchase`
- `/api/account/spend`
- `/api/chart-deep`
- `/api/chart/overview`
- `/api/chart/sifu-history`
- `/api/direction-analysis`
- `/api/houses`
- `/api/houses/:id`
- `/api/houses/qr/generate`
- `/api/luopan/profiles`
- `/api/profile`
- `/api/profile-form`
- `/api/profile/:id`
- `/api/profile/:id/snapshot`
- `/api/profile/create`
- `/api/sifu`
- `/api/sifu/group`

Risk note: `/api/sifu` is long-running and expensive; nginx limits are active, but app-level Redis limiting is still recommended before real production.

### Login/Credit Protected Indirectly

These routes call `spendHours()`, which checks session and deducts credit:

- `/api/network/ai-parse-bulk`
- `/api/network/sifu`
- `/api/qimen/sifu`

Risk note: credit deduction is a business guard, not a traffic guard. Keep nginx limits and later add Redis limits.

### Auth/Public Auth Flow

These are intentionally public but rate-limited at nginx and/or app level:

- `/api/auth/forgot-password`
- `/api/auth/google`
- `/api/auth/google/callback`
- `/api/auth/line`
- `/api/auth/line/callback`
- `/api/auth/login`
- `/api/auth/login-form`
- `/api/auth/login-phone`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/resend-otp`
- `/api/auth/reset-password`
- `/api/auth/send-email-verify`
- `/api/auth/signup`
- `/api/auth/signup-form`
- `/api/auth/signup-phone`
- `/api/auth/verify-email/:token`
- `/api/auth/verify-phone`

Risk note: app-level rate limits exist on the main brute-force/OTP routes. nginx now adds `/api/auth/` edge limiting.

### Token Only

- `/api/houses/qr/verify/:token`

Risk note: token is the authorization boundary. Confirm token entropy and expiry are strong before production.

### Public Compute / Public Data

These are public or do not use session checks in code. They are currently protected at nginx by edge rate limiting:

- `/api/activity-classify`
- `/api/akg`
- `/api/akg/hex-deep`
- `/api/akg/solar-terms`
- `/api/auspicious`
- `/api/auspicious/profile`
- `/api/calendar`
- `/api/chart`
- `/api/daily-activity/signals`
- `/api/daily/score`
- `/api/decisions`
- `/api/dictionary/search`
- `/api/dictionary/types`
- `/api/dictionary/:type`
- `/api/dictionary/:type/:id`
- `/api/engine-audit/status`
- `/api/fengshui-snapshot`
- `/api/forecast`
- `/api/formulas`
- `/api/formulas/presets`
- `/api/formulas/:code`
- `/api/formulas/:code/test`
- `/api/health`
- `/api/insights`
- `/api/katakagae`
- `/api/luopan/degrees`
- `/api/maps-script`
- `/api/network/own-score`
- `/api/network/score`
- `/api/qimen`
- `/api/qimen/search`
- `/api/sifu/compare`
- `/api/today`
- `/api/today/actions`
- `/api/today/directions`
- `/api/today/hours`

High-priority public routes to review next:

- `/api/chart` - public, compute-heavy, returns large chart output.
- `/api/qimen/search` - public, potentially many internal calls.
- `/api/sifu/compare` - public AI/streaming path with in-memory limiter.
- `/api/network/score` and `/api/network/own-score` - public scoring endpoints.
- `/api/maps-script` - public Google Maps proxy; make sure the browser key is restricted in Google Cloud.

## Observed After Phase 1

- `/` returned `200`.
- `/api/health` returned `200`.
- `/master-group` returned `404`.
- `/api/formulas*` returned `404` after nginx block.
- `/api/engine-audit/status` returned `404` after nginx block.
- `/api/maps-script` returned `403` with no referrer and `200` with `https://hourkey.io/...` referrer.
- `/.env` and `/test.sql` returned `403`.
- `/test.map` returned `403`; no public source maps were found in the active release.
- Repeated `/api/auth/me` requests eventually returned `429`, confirming enforcement.
- Live API log shows normal user/test flows passing with `limit=PASSED`.
- One `/api/sifu` request buffered body to disk; not a security failure, but request bodies are large enough to monitor.

## Recommended Next Changes

1. Add app-level Redis rate limits for expensive public routes.
2. Decide whether `/api/chart` should remain public or require a signed/session context.
3. Restrict the Google Maps browser key in Google Cloud to `https://hourkey.io/*` and `https://www.hourkey.io/*`.
4. Replace nginx CSP sink with an app/storage-backed report collector if report detail is needed.
5. Move CSP from `Report-Only` to enforced mode after violations are clean.
6. Clean up old pm2/Next processes and stale release ports; many historical next-server processes are still running.
7. Remove the `/master-group` block permanently once confirmed unused.
