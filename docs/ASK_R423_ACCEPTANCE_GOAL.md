# `/ask` r423 Acceptance Goal

Status: **deployed after explicit user approval**

Production was kept on r422 until the user explicitly approved deployment with `deploy`.

## Objective

Rewrite `/ask` into a LuckyLoveMe-style full-screen funnel while keeping Hourkey branding, assets, backend preview, and payment safety.

This work is complete only after the acceptance criteria below are verified against production.

## Deploy Gate

Do not deploy future changes unless the user gives an explicit deploy instruction.

Examples of explicit approval:

- `deploy`
- `deploy r423`
- `ขึ้น prod`
- `ปล่อยขึ้นจริง`

Non-approval examples:

- `รื้อ`
- `ทำต่อ`
- `ดู`
- `ตรวจ`
- `เหมือนกี่ %`
- `ให้ agent ตรวจ`

If approval is ambiguous, stop and ask. Do not infer deployment approval from implementation or test instructions.

## Current State

- Production current symlink: `/root/releases/current`
- Expected production after approval: `/root/releases/decode-app-r423-ask-funnel-reference`
- Previous r422 production `/ask.html` hash: `8b35132f5bfda672390625b851463d1e2b089e10f2b0d91c83bc3a45824d0030`
- r423 production `/ask.html` hash: `762287368beb347a67f69f6444dac9fc70f9fd76235d14833cdc17d8984c412c`

## Acceptance Criteria

### Layout

- Intro screen is full-screen video-backed, max-width 640px, centered on desktop.
- Mobile viewport uses the full screen; no split desktop layout.
- Desktop viewport remains a centered mobile-app column, not a two-column marketing page.
- Intro and Step 1-5 must not create page-level vertical scroll; `window.scrollY` must remain `0` after wheel/drag attempts.
- No visible Hourkey nav/header in the funnel state.
- Step content is bottom-aligned over the video, matching the reference funnel pattern.
- Progress is five small top dots/bars, not a card progress header.
- Step 1 does not show a back button in the bottom controls.
- Controls use reference-style Thai labels: `ถัดไป`, `ก่อนหน้า`, final `ดูดวงชะตาของฉัน`.

### Funnel Flow

- Intro -> Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Loading -> Result/Preview.
- Step 1: `คุณเกิดเมื่อไหร่?`, solar/lunar, leap-month when lunar, BE/CE, numeric year/month/day.
- Step 2: `บอกเวลาเกิดของคุณ`, hour/minute, unknown time, Yajasi option.
- Step 3: male/female only.
- Step 4: name/nickname.
- Step 5: worry/question textarea, max 200 characters, visible counter.
- Loading state is full-screen and visually close to the reference processing overlay.

### Logic

- BE/CE switch preserves the same actual CE date.
- Date validation rejects impossible dates and future dates.
- Time can be omitted through unknown-time behavior.
- Invalid time such as `99:99` is rejected by the backend.
- Preview API still returns `4p` with birth time and `3p` without birth time.
- Checkout/payment route remains auth-gated and uses safe `/ask` return path.

### Verification Before Any Deploy Approval

Required local/non-production checks:

- Inline JS parses.
- r423 candidate `/ask` and `/ask.html` return 200 and hash to the r423 candidate hash.
- r423 candidate video and poster assets return 200.
- Browser capture verifies mobile and desktop layout:
  - mobile hero width equals viewport width
  - desktop hero width is about 640px and centered
  - Step 1 visible buttons are only `สุริยคติ`, `จันทรคติ`, `พ.ศ.`, `ค.ศ.`, `ถัดไป`
  - intro and form states have document/body scroll height equal to viewport height and wheel attempts keep `window.scrollY=0`
- API smoke:
  - birth time payload -> `chartPreview.mode=4p`
  - unknown time payload -> `chartPreview.mode=3p`
  - invalid `99:99` -> `400 invalid_birth_time`

Required agent gate:

- Run 5-agent audit again after the rewrite.
- Report layout %, logic %, and overall %.
- Do not call it final if layout is still materially below target.

## Production Safety Check

Before and after any local testing, verify no accidental deployment:

```sh
readlink -f /root/releases/current
sha256sum /root/releases/current/public/ask.html
for svc in hourkey-decode.service hourkey-decode@3350.service hourkey-decode@3351.service hourkey-decode@3352.service; do
  pid=$(systemctl show -p MainPID --value "$svc")
  echo "$svc pid=$pid cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || true)"
done
ss -ltnp | rg ':3362|:3363|:3349|:3350|:3351|:3352'
```

Expected after explicit deploy approval:

- `/root/releases/current` resolves to r423.
- All production service cwd values resolve to r423.
- `/root/releases/current/public/ask.html` hash is the r423 hash.
- No local test servers remain running after checks.
