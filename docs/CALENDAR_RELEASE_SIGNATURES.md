# Calendar Release Signatures

Date: 2026-07-11 (Asia/Bangkok)
Base production release: `r502-menu-admin` / Git `64d8ea9`

## 1. Science Signature: PASS

- Audited live engine is used for 建除, 黃黑道, 28宿 and 紫白日.
- 730 civil days across 2026-2027 were swept.
- Coverage: 12/12 officers, 12/12 road spirits, 28/28 mansions and 9/9
  daily flying stars.
- Unknown 神煞 remained neutral in every case.
- Daily personal verdict regression: 60 Sifu golden rows, MAE 9.3 versus
  legacy 14.1; severe bucket flips 4 versus legacy 14.

## 2. Data Identity Signature: PASS

- Personal profile queries require both the current `org_id` and authenticated
  `created_by_user_id`.
- Explicit foreign/stale profiles return not found; there is no first-row
  fallback.
- Calendar, hour and direction APIs ignore browser-supplied birth/chart/useful
  god inputs.
- Anonymous requests with forged birth parameters produced the exact same
  universal payload hash as clean anonymous requests.
- No birth profile means universal-only output and no synthetic hour pillar.

## 3. Consistency Signature: PASS

- Universal and personal intent status, scores and ranked cards use separate
  sources.
- A personal clash cannot mutate universal output.
- UI, quick PDF and AI PDF use the same selected mode and API snapshot.
- Forbidden activities are capped and cannot retain a high broad-goal score.
- Runtime Calendar integrity suite: 43/43.
- Cross-page owner-profile regression suite: 26/26.

## 4. Regression Signature: PASS

- TypeScript `npx tsc --noEmit`: pass against source files.
- Inline Calendar JavaScript parse: 17/17 scripts.
- Chromium screenshots: 9 languages x desktop/mobile = 18/18, with no
  horizontal overflow, JavaScript errors, `undefined`, non-Thai Thai leakage,
  fake hours or personal card without a profile.
- Direct quick-PDF payload capture: 9/9 languages, two pages each, no Thai
  leakage outside Thai.
- Shared PDF artifact regression: 18/18 (9 languages x quick/AI).

## 5. Release Signature: PASS

- Webpack production compile mode completed and produced all Calendar/API
  routes.
- The production artifact started under `next start` and anonymous Calendar
  smoke returned HTTP 200, 31 days, universal-only identity and canonical
  Traditional Chinese lunar text.
- Production `r502` Calendar delta was reviewed and its `hk-user-menu.js?v=24`
  cache bump was preserved.
- Release must be assembled from current `r502`, overlaying only this commit's
  Calendar files. Never deploy the older branch tree as a whole.
- Rollback target: `/root/releases/decode-app-r502-menu-admin`.

## Build Note

The repository's monolithic Next type-generation path reports pre-existing
invalid named exports in `/api/book` and `/api/sifu/fusion5`. Those files are
unchanged in this release. The production compile-mode build and source
TypeScript gate are used so Calendar remains isolated from that baseline issue.
