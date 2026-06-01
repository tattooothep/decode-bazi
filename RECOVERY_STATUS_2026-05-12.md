# Recovery Status · 2026-05-12

## Current stable baseline

Repo: `tattooothep/decode-bazi`

Stable main HEAD:

`90fa3e0 Merge pull request #6 from tattooothep/fix/frontend-restore-user-menu-avatar`

Recent recovery PRs merged:

1. PR #4
   `fix(frontend): restore static HTML routes`
   Restored static clean routes:
   - `next.config.ts` rewrites
   - `public/*.html`
   - removed 5 Next route blockers:
     - `src/app/page.tsx`
     - `src/app/chart/page.tsx`
     - `src/app/today/page.tsx`
     - `src/app/signup/page.tsx`
     - `src/app/signup/actions.ts`

2. PR #5
   `fix(api): restore OAuth and phone/email auth routes`
   Restored:
   - Google OAuth
   - LINE login
   - phone login/signup
   - OTP
   - forgot/reset password
   - email verification
   - required auth helper libs

3. PR #6
   `fix(frontend): restore user menu avatar script`
   Restored:
   - `public/js/hk-user-menu.js`
   - avatar/user dropdown on `/chart` and `/today`

## Validation passed

### Frontend static routes

20/20 passed:

- `/`
- `/chart`
- `/today`
- `/signup`
- `/qimen`
- `/input`
- `/goal`
- `/calendar`
- `/master`
- `/mygoal`
- `/picker`
- `/master-m`
- `/mygoal-m`
- `/calendar-m`
- `/picker-m`
- `/heluo`
- `/fengshui`
- `/datepick`
- `/comparison`
- `/network`

### Auth routes

11/11 passed:

OAuth routes returned `302`:

- `/api/auth/google`
- `/api/auth/google/callback`
- `/api/auth/line`
- `/api/auth/line/callback`

POST-only routes returned `405` on HEAD:

- `/api/auth/forgot-password`
- `/api/auth/login-phone`
- `/api/auth/resend-otp`
- `/api/auth/reset-password`
- `/api/auth/send-email-verify`
- `/api/auth/signup-phone`
- `/api/auth/verify-phone`

### Avatar/user menu

Passed:

- `/js/hk-user-menu.js` returns `200`
- `/chart` references `/js/hk-user-menu.js?v=9`
- `/today` references `/js/hk-user-menu.js?v=9`
- `/api/auth/me` returns `200`

### Build/runtime

- `npx tsc --noEmit` clean
- `npm run build` passed
- `pm2 decode-app` online

## Important architecture note

Clean URLs are still backed by static HTML files.

Example:

- `/input` → `public/input.html`
- `/chart` → `public/chart.html`
- `/today` → `public/today.html`
- `/master` → `public/master.html`
- `/picker` → `public/picker.html`

Do not delete `public/*.html`.

The `.html` is hidden from user URLs via `next.config.ts` rewrites.

## Critical guardrails for next session

Do not run blindly:

- `git reset --hard`
- `git checkout` to another branch
- `git stash pop`
- `git add .`
- force push
- broad restore from stash
- broad copy from backup
- merge large PR

Before any change, run:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git log --oneline -6
```

Expected starting point:

- branch: `main`
- HEAD includes `90fa3e0`
- `git status --short` should be empty

## Known remaining minor recovery items

Do not do these until explicitly approved.

Possible future small PRs:

1. Static assets / PWA / SEO:

   - `favicon.ico`
   - `icon-192.png`
   - `icon-512.png`
   - `manifest.json`
   - `sw.js`
   - `robots.txt`
   - `sitemap.xml`

2. Visual check:

   - confirm avatar dropdown visually on `/chart` and `/today`
   - confirm Google/LINE login buttons do not 404

3. API inventory:

   - heluo/network/qimen/sifu endpoints need separate investigation
   - do not mix with frontend or auth

4. Hourkey/data/lib inventory:

   - do not restore in bulk
   - no `git add .`
   - separate PR only after explicit approval

## What not to touch

Until explicitly approved:

- `data/i18n/*`
- Sheet / Batch text content
- formula weights
- Chinese metaphysics logic
- `public/*.html`
- auth routes
- `next.config.ts`
- package files

## If generated i18n drift appears

If these 4 files show modified only due to timestamp drift:

- `data/i18n/decode.production.json`
- `data/i18n/decode.staging.json`
- `data/i18n/qimen.production.json`
- `data/i18n/qimen.staging.json`

Do not commit them.

Clean with:

```bash
git checkout -- \
  data/i18n/decode.production.json \
  data/i18n/decode.staging.json \
  data/i18n/qimen.production.json \
  data/i18n/qimen.staging.json
```

## End state

Recovery from broken working tree is mostly complete.

Estimated recovery:

- frontend static routes: 100%
- auth routes: 100%
- avatar user menu: 100%
- overall app recovery: about 95%+

Remaining work should be done as small isolated PRs only.
