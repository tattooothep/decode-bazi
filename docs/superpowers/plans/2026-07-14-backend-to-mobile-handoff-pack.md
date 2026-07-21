# Backend-to-Mobile Handoff Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the durable `pland.md` checkpoint, privacy-safe mobile-r515 contract fixtures, and an executable EAS iOS handoff without modifying the mobile worktree or changing production.

**Architecture:** The repository records the owner decisions first, then produces deterministic synthetic fixture envelopes from a versioned endpoint catalog and validates their exact filenames, hashes, minimum response shapes, and privacy properties. EAS artifacts are adoption templates under `handoff/mobile/eas-ios/`; Jarvis copies or merges them into the mobile repository only after supplying owner-controlled account values and credentials outside Git. `HANDOFF-TO-MOBILE.md` binds both delivery commits, verification evidence, and the permanent ownership boundary.

**Tech Stack:** Markdown, Git plumbing, Node.js 22 ESM, JSON, Expo Application Services configuration, GitHub Actions YAML.

## Global Constraints

- Work only in `/root/decode-app` and backend worktrees.
- Never modify, stage, or commit `/root/worktrees/hourkey-mobile-p0-network-sifu`; it is read-only reference material.
- Entitlement foundation remains frozen; do not deploy, restart, reload, tag, or change production.
- Every future production deploy requires explicit owner approval.
- Preserve all unrelated dirty work and stage only literal paths owned by this plan.
- Fixtures are deterministic synthetic contract examples, never production captures or pseudonyms derived from production values.
- No committed credential, token, cookie, email, real name, real profile/account/org/device ID, private prompt/reply, exact personal location, or secret path.
- This goal ends after the three accepted deliverables and `HANDOFF-TO-MOBILE.md`; later API work waits for a new Jarvis brief.

---

## File Map

- Add `pland.md`: commit its already-current append-only decision log without changing its bytes.
- Add `TEAM-SPLIT-20260714.md`: make the owner-approved permanent ownership boundary durable beside the plan it governs.
- Add `docs/superpowers/plans/2026-07-14-backend-to-mobile-handoff-pack.md`: executable task plan and verification contract.
- Add `scripts/lib/mobile-r515-fixture-contract.mjs`: exact fixture catalog, minimum shape checks, canonical JSON, SHA-256, and privacy scan.
- Add `scripts/build-mobile-r515-fixtures.mjs`: deterministic generator that refuses unknown output and emits only the catalogued synthetic fixtures plus manifest.
- Add `scripts/test-mobile-r515-fixtures.mjs`: RED/GREEN harness for catalog completeness, shape checks, reproducibility, hashes, and sensitive canaries.
- Add `test-fixtures/mobile-r515/README.md`, `manifest.json`, and `*.sanitized.json`: portable r515 examples for every named mobile surface and endpoint variant.
- Add `handoff/mobile/eas-ios/eas.json.template.json`: mergeable preview/production EAS build profiles with no account identifiers or credential material.
- Add `handoff/mobile/eas-ios/app-config.ios.template.json`: the exact Expo iOS fields Jarvis must merge after owner input.
- Add `handoff/mobile/eas-ios/eas-ios-build.workflow.yml`: opt-in CI template using only the secret name `EXPO_TOKEN`.
- Add `docs/mobile/EAS-IOS-HANDOFF.md`: start-to-build commands and failure recovery.
- Add `docs/mobile/EAS-IOS-OWNER-CHECKLIST.md`: account, legal, identifier, signing, and access inputs the owner must supply.
- Add `scripts/test-eas-ios-handoff.mjs`: validates templates, placeholder inventory, secret absence, and documentation-command coverage.
- Add `HANDOFF-TO-MOBILE.md`: final backend-to-Jarvis handoff with SHAs, tests, adoption steps, and prohibitions.

---

### Task 1: Commit the durable owner decision checkpoint

**Files:**
- Add: `pland.md`
- Add: `TEAM-SPLIT-20260714.md`

**Interfaces:**
- Consumes: owner decisions dated 13–14 July 2026.
- Produces: `PLAND_COMMIT`, a Git object containing the exact current `pland.md` bytes.

- [ ] **Step 1: Prove the starting index is clean and record unrelated dirt without staging it**

Run:

```bash
cd /root/decode-app
git diff --cached --quiet
git status --short -- pland.md TEAM-SPLIT-20260714.md docs/superpowers/plans/2026-07-14-backend-to-mobile-handoff-pack.md
```

Expected: the index is empty; `pland.md` and `TEAM-SPLIT-20260714.md` are untracked and the implementation plan remains outside this checkpoint.

- [ ] **Step 2: Verify §27 is already current without adding a duplicate row**

The existing final rows must cover all three owner decisions exactly once:

```markdown
| 2026-07-13 บ่าย | Owner addendum: ภาพเจน+โมดัล parity 9 ข้อ + backend entitlement foundation (ข้อ 9) | Accepted | เพิ่มโดยทีม backend (owner-attributed) |
| 2026-07-14 | ข้อ 1–3 (ภาพเจน) ถอดจาก gate → เฟสอาร์ตนำร่อง 3 หน้า ไม่บล็อก APK · gate จริง = โมดัล parity (4–7)+ตา VLM | Accepted | เจ้าของเคาะ "เอาสายกลาง" — จาวิสบันทึก |
| 2026-07-14 | แบ่งเขตถาวร: จาวิส=แอพทั้งก้อน · ทีม backend=decode-app/เส้น API · deploy ทุกครั้งเจ้าของเคาะ | Accepted | ดู TEAM-SPLIT-20260714.md · entitlement deploy = แช่รอเคาะ |
```

Run `tail -n 80 pland.md` and compare these rows with `TEAM-SPLIT-20260714.md`; do not edit `pland.md` if they match.

- [ ] **Step 3: Self-check decision history and forbidden scope**

Run:

```bash
rg -n 'backend entitlement foundation|แบ่งเขตถาวร|ข้อ 1–3 \(ภาพเจน\)' pland.md
git diff --check -- pland.md TEAM-SPLIT-20260714.md
(cd /root/worktrees/hourkey-mobile-p0-network-sifu && git status --short)
```

Expected: every owner decision is present, whitespace check passes, and no mobile-worktree path is touched by this task.

- [ ] **Step 4: Create the exact checkpoint commit**

Run:

```bash
git --literal-pathspecs add -- pland.md TEAM-SPLIT-20260714.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs: checkpoint backend mobile handoff decisions"
PLAND_COMMIT="$(git rev-parse HEAD)"
git show "${PLAND_COMMIT}:pland.md" | cmp - pland.md
git diff --cached --quiet
```

Expected: staged names are exactly `pland.md` and `TEAM-SPLIT-20260714.md`; `cmp` exits 0 and `PLAND_COMMIT` is the SHA reported in the final handoff.

---

### Task 2: Build deterministic sanitized r515 fixtures

**Files:**
- Add: `scripts/lib/mobile-r515-fixture-contract.mjs`
- Add: `scripts/build-mobile-r515-fixtures.mjs`
- Add: `scripts/test-mobile-r515-fixtures.mjs`
- Add: `test-fixtures/mobile-r515/README.md`
- Add: `test-fixtures/mobile-r515/manifest.json`
- Add: `test-fixtures/mobile-r515/*.sanitized.json`

**Interfaces:**
- Produces: `FIXTURE_SPECS`, `canonicalJson(value)`, `sha256(bytes)`, `validateFixture(key, value)`, `scanFixturePrivacy(key, value)`, and `buildFixtureSet()`.
- Produces these endpoint families: Today, Hours, Directions, Goals, Chart, Calendar, Network, Qimen, Datepick plus Saved Dates, Luopan, and Sifu.

- [ ] **Step 1: Write the failing fixture test**

The test must first import the nonexistent contract module and then, once available, assert:

```js
assert.equal(FIXTURE_SPECS.length, 30);
assert.deepEqual(new Set(FIXTURE_SPECS.map((spec) => spec.family)), new Set([
  "today", "hours", "directions", "goals", "chart", "calendar",
  "network", "qimen", "datepick", "luopan", "sifu",
]));
assert.equal(scanFixturePrivacy("canary", { email: "private-at-example" }).ok, false);
const opaqueId = ["11111111", "1111", "4111", "8111", "111111111111"].join("-");
assert.equal(scanFixturePrivacy("canary", { profile_id: opaqueId }).ok, false);
assert.equal(scanFixturePrivacy("canary", { authorization: "private-value" }).ok, false);
```

It must also rebuild into a temporary directory twice, compare every byte and manifest hash, verify that output contains exactly the catalogued basenames plus `manifest.json` and `README.md`, and ensure malformed `ok` envelopes or missing required fields fail with pointer-only errors that contain no fixture value.

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/test-mobile-r515-fixtures.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `scripts/lib/mobile-r515-fixture-contract.mjs`.

- [ ] **Step 3: Implement the exact 30-entry catalog**

Use the following basename and endpoint mapping; GET and POST variants that return different contracts stay separate:

```text
today.sanitized.json                 GET|POST /api/mobile/v1/today
today-hours.sanitized.json           GET|POST /api/mobile/v1/today/hours
today-directions.sanitized.json      GET|POST /api/mobile/v1/today/directions
today-goals.sanitized.json           GET /api/mobile/v1/today/goals
chart.sanitized.json                 GET|POST /api/mobile/v1/chart; GET /api/mobile/v1/chart/[id]
calendar.sanitized.json              GET|POST /api/mobile/v1/calendar
network.sanitized.json               GET /api/mobile/v1/network
network-sifu.sanitized.json          POST /api/mobile/v1/network/sifu
network-bulk.sanitized.json          POST /api/mobile/v1/network/bulk
qimen-basic.sanitized.json           POST /api/mobile/v1/qimen
qimen-professional.sanitized.json    POST /api/mobile/v1/qimen (professional)
qimen-search.sanitized.json          POST /api/mobile/v1/qimen/search
qimen-sifu.sanitized.json            POST /api/mobile/v1/qimen/sifu
datepick.sanitized.json              POST /api/mobile/v1/datepick
datepick-save.sanitized.json         POST /api/mobile/v1/datepick/save
datepick-saved.sanitized.json        GET /api/mobile/v1/datepick/saved
datepick-delete.sanitized.json       DELETE /api/mobile/v1/datepick/saved/[id]
luopan-rings.sanitized.json          GET /api/mobile/v1/luopan/rings
luopan-bootstrap.sanitized.json      GET /api/mobile/v1/luopan/bootstrap
luopan-rings-w4.sanitized.json       GET /api/mobile/v1/luopan/rings (W4)
luopan-analysis.sanitized.json       POST /api/mobile/v1/luopan/analysis
luopan-snapshot.sanitized.json       GET /api/mobile/v1/luopan/snapshot
luopan-measurements-get.sanitized.json GET /api/mobile/v1/luopan/measurements
luopan-measurements-post.sanitized.json POST /api/mobile/v1/luopan/measurements
luopan-sifu.sanitized.json           POST /api/mobile/v1/luopan/sifu
luopan-vision.sanitized.json         POST /api/mobile/v1/luopan/vision
sifu-chat.sanitized.json             POST /api/mobile/v1/sifu/chat (JSON mode)
sifu-chat-stream.sanitized.json      POST /api/mobile/v1/sifu/chat?stream=1 (SSE frames)
sifu-history.sanitized.json          GET /api/mobile/v1/sifu/history
sifu-group.sanitized.json            POST /api/mobile/v1/sifu/group
```

`luopan-bootstrap.sanitized.json` is the single W4-rich bootstrap fixture and contains the complete 24-mountain reference; a second bootstrap-W4 filename would duplicate the same wire contract. Rings keeps both base and W4 fixtures because they exercise distinct locked/open entitlement responses.

Each catalog row carries `key`, `family`, `filename`, `method`, `endpoint`, `aliases`, `variant`, `status`, `contentType`, `requiredPointers`, `retainedClasses`, and `removedClasses`. Saved-date creation and Luopan measurement creation record status 201. The stream fixture remains valid JSON and stores ordered `meta`, `first`, `chunk`, and `done` event frames plus `contentType: "text/event-stream"` and `cacheControl: "no-cache"`; it contains no raw session data. `canonicalJson` recursively sorts object keys, preserves array order, rejects non-finite numbers and non-plain objects, uses two-space JSON, and ends with one LF.

- [ ] **Step 4: Implement synthetic contract values and fail-closed privacy checks**

Every fixture must have a successful envelope and only bounded synthetic science/product values. Identity-bearing objects are absent or null; UUIDs and email-like strings are forbidden; free-form questions/messages are null or absent; coordinates are omitted; saved-date identifiers use `fixture-saved-date-01`, never UUIDs. A success response that contractually requires reply text may contain only one exact exported constant, `SYNTHETIC_REPLY`, and stream chunks may contain only its ordered fragments; captured or arbitrary free text is rejected. Preserve structured examples needed by clients: pillars, 12 hour rows, eight directions, six goal scores, chart element analysis, one calendar day with `yi`/`ji`/`gods`/`goals`, Qimen nine palaces and entitlement revision, datepick scoring/display, 24 Luopan mountains and W4 layers, and Sifu envelope/history counts.

Enforce cross-fixture invariants: Today Goals equals the selected Calendar day's `goals` and `intentStatus`; saved create/list/delete share `fixture-saved-date-01`; every Qimen `request_context.entitlement_revision` equals `entitlement.revision`; Network `count` equals `people.length`; Luopan bootstrap has exactly 24 mountains in canonical order; stream events are exactly `meta → first → chunk+ → done`.

Privacy validation recursively rejects:

```text
email syntax; UUID; JWT/Bearer/basic-auth shape; credential/secret/password/token/cookie/session keys;
org/user/account/device/profile identifier values; contact/address/birth fields; exact latitude/longitude;
non-null question/prompt/query/message/answer/guidance/private-note fields; reply values other than `SYNTHETIC_REPLY`.
```

Allowed scientific labels such as `star_name_th`, `hexagram_name_zh`, and `mountain.name` are not personal names and must remain.

- [ ] **Step 5: Build the committed set and run GREEN**

Run:

```bash
node scripts/build-mobile-r515-fixtures.mjs --output-dir test-fixtures/mobile-r515
node scripts/test-mobile-r515-fixtures.mjs
node scripts/test-mobile-r515-contract.mjs
node --experimental-strip-types --import ./scripts/register-loader.mjs --test scripts/test-mobile-r515-unit.mts
```

Expected: generator reports `MOBILE_R515_FIXTURES_BUILT count=30`; fixture tests, existing r515 contract checks, and nine unit tests all pass.

- [ ] **Step 6: Run acceptance scans and commit fixtures**

Run:

```bash
find test-fixtures/mobile-r515 -maxdepth 1 -type f -name '*.sanitized.json' -print0 | sort -z | xargs -0 node -e '
  const fs=require("node:fs");
  for (const p of process.argv.slice(1)) JSON.parse(fs.readFileSync(p,"utf8"));
' 
node scripts/test-mobile-r515-fixtures.mjs --privacy-only
git diff --check -- scripts/lib/mobile-r515-fixture-contract.mjs scripts/build-mobile-r515-fixtures.mjs scripts/test-mobile-r515-fixtures.mjs test-fixtures/mobile-r515
git --literal-pathspecs add -- scripts/lib/mobile-r515-fixture-contract.mjs scripts/build-mobile-r515-fixtures.mjs scripts/test-mobile-r515-fixtures.mjs test-fixtures/mobile-r515
git diff --cached --name-only
git diff --cached --check
git commit -m "test(mobile): add sanitized r515 contract fixtures"
FIXTURE_COMMIT="$(git rev-parse HEAD)"
git diff --cached --quiet
```

Expected: only fixture implementation/artifact paths are staged; no raw directory, capture receipt, or unrelated dirty file enters the commit.

---

### Task 3: Prepare the EAS iOS adoption pack

**Files:**
- Add: `handoff/mobile/eas-ios/eas.json.template.json`
- Add: `handoff/mobile/eas-ios/app-config.ios.template.json`
- Add: `handoff/mobile/eas-ios/eas-ios-build.workflow.yml`
- Add: `docs/mobile/EAS-IOS-HANDOFF.md`
- Add: `docs/mobile/EAS-IOS-OWNER-CHECKLIST.md`
- Add: `scripts/test-eas-ios-handoff.mjs`

**Interfaces:**
- Consumes: Jarvis's existing Expo app config and owner-supplied `EXPO_OWNER`, `EAS_PROJECT_ID`, `IOS_BUNDLE_IDENTIFIER`, `APPLE_TEAM_ID`, current iOS build-number state, Apple Team access, pre-provisioned remote signing credentials, and local/CI `EXPO_TOKEN`.
- Produces: templates and an ordered runbook that stop before submission and never contain credential values.

- [ ] **Step 1: Write the failing handoff validator**

Assert that both JSON templates parse; profiles `preview` and `production` exist with `credentialsSource: "remote"`; `cli.appVersionSource` is `remote`; iOS config names `bundleIdentifier`, `appleTeamId`, `buildNumber`, and `supportsTablet`; workflow has `workflow_dispatch`, pinned Node 24 setup, `npm ci`, a clean-checkout guard, EAS CLI `20.5.1`, `eas build --platform ios --non-interactive --freeze-credentials --wait --json`, and references `${{ secrets.EXPO_TOKEN }}` only by name. Assert the docs contain every owner input, `eas login`, `eas whoami`, `project:init --id`, `project:info`, resolved Expo config checks, authorized interactive credential bootstrap, question-free Jarvis execution, preview device prerequisites, certificate/provisioning choice, troubleshooting, and explicit no-submit/no-deploy boundaries.

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/test-eas-ios-handoff.mjs
```

Expected: failure because the template files do not exist.

- [ ] **Step 3: Create mergeable configuration templates**

Use string placeholders `OWNER_INPUT_EXPO_OWNER`, `OWNER_INPUT_EAS_PROJECT_ID`, `OWNER_INPUT_IOS_BUNDLE_IDENTIFIER`, `OWNER_INPUT_APPLE_TEAM_ID`, and `OWNER_INPUT_IOS_BUILD_NUMBER`; the validator requires all five and forbids unknown placeholder names. EAS profiles must use remote versioning and remote credentials, `preview` must be explicit internal/Ad Hoc distribution, and `production` must be explicit store distribution. The workflow template must be stored as handoff material, not installed under `.github/workflows/` in this repository, and must never create/repair credentials, register devices, submit, deploy, or auto-submit.

- [ ] **Step 4: Write the owner checklist and no-question runbook**

The checklist must give exact enrollment and collection steps for:

1. Apple Developer Program legal Account Holder, active membership, accepted agreements, exact team name/Team ID, and authorized credential operator.
2. App Store Connect app status and role access; organization operators need Certificates, Identifiers & Profiles access.
3. Expo account or organization owner, confirmation that `@owner/hourkey-mobile` is new or existing, exact EAS project UUID, and build-capacity confirmation.
4. Confirmation that current `io.hourkey.app` is owned/available on the selected Apple team, or the final owner-approved reverse-DNS bundle ID; never create a duplicate App ID for an existing app.
5. Existing TestFlight/App Store build number, display name, support/privacy URLs, SKU, legal entity, export-compliance answer, distribution choice, and Paid Applications Agreement status for `expo-iap`.
6. EAS-managed remote signing: Apple Distribution certificate, production App Store profile, preview Ad Hoc profile plus registered device UDIDs, and APNs key for `expo-notifications`; no `.p8`, `.p12`, profile, Apple password, or private key enters Git.
7. CI `EXPO_TOKEN` creation, secure repository-secret insertion, role/rotation owner, and revocation step.
8. Associated Domains confirmation that the deployed AASA file authorizes `<APPLE_TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>`.

The runbook must start with an exact owner-approved clean Jarvis commit, back up existing config, merge fields rather than overwrite native settings, and inspect `npx expo config --type public` plus `--type introspect` because `app.config.js` is dynamic. It then splits into (A) one-time authorized owner bootstrap using `eas login`, `project:init --id`, `credentials:configure-build`, and one successful interactive build, and (B) question-free Jarvis/CI execution using `EXPO_TOKEN`, `whoami`, `project:info`, `eas config`, and `eas build --non-interactive --freeze-credentials --wait --json`. It must state that `build:configure` and `credentials` are interactive and therefore forbidden in automation, explain preview's registered-device requirement, retrieve the build URL/JSON, and stop before store submission. Every automation command uses shell variables validated with `${VAR:?message}`.

- [ ] **Step 5: Verify against current official documentation and run GREEN**

Use only current official Expo and Apple URLs in the runbook. Run:

```bash
node scripts/test-eas-ios-handoff.mjs
git diff --check -- handoff/mobile/eas-ios docs/mobile/EAS-IOS-HANDOFF.md docs/mobile/EAS-IOS-OWNER-CHECKLIST.md scripts/test-eas-ios-handoff.mjs
```

Expected: all template, placeholder, secret-name, and command-coverage assertions pass.

- [ ] **Step 6: Commit the EAS adoption pack with exact scope**

Run:

```bash
git --literal-pathspecs add -- handoff/mobile/eas-ios docs/mobile/EAS-IOS-HANDOFF.md docs/mobile/EAS-IOS-OWNER-CHECKLIST.md scripts/test-eas-ios-handoff.mjs
git diff --cached --name-only
git diff --cached --check
git commit -m "docs(mobile): prepare EAS iOS build handoff"
EAS_COMMIT="$(git rev-parse HEAD)"
git diff --cached --quiet
```

Expected: only the three templates, two EAS documents, and one validator are committed; no mobile-worktree file or credential material is staged.

---

### Task 4: Bind the delivery in `HANDOFF-TO-MOBILE.md`

**Files:**
- Add: `HANDOFF-TO-MOBILE.md`
- Add: `docs/superpowers/plans/2026-07-14-backend-to-mobile-handoff-pack.md`

**Interfaces:**
- Consumes: `PLAND_COMMIT`, `FIXTURE_COMMIT`, `EAS_COMMIT`, fixture manifest hashes, official-doc links, and verification logs.
- Produces: the single backend-to-Jarvis adoption entrypoint.

- [ ] **Step 1: Write the handoff with reproducible evidence**

Include status, ownership, exact commits, scoped dirty-tree warning, fixture file/count/manifest path, test commands and observed totals, EAS adoption order, owner inputs, environment-variable names only, known limitations, rollback (revert handoff commits; no production rollback because nothing deployed), and the next three Jarvis actions. State that entitlement remains frozen and future API work requires a new brief.

- [ ] **Step 2: Run the full local verification matrix**

Run:

```bash
node scripts/test-mobile-r515-fixtures.mjs
node scripts/test-mobile-r515-contract.mjs
node --experimental-strip-types --import ./scripts/register-loader.mjs --test scripts/test-mobile-r515-unit.mts
node scripts/test-eas-ios-handoff.mjs
git show "${PLAND_COMMIT}:pland.md" | cmp - pland.md
git diff --check -- HANDOFF-TO-MOBILE.md handoff/mobile/eas-ios docs/mobile scripts/test-eas-ios-handoff.mjs
```

Expected: every command exits 0; the `pland.md` blob is byte-identical.

- [ ] **Step 3: Commit the EAS handoff and final handoff document**

Run:

```bash
git --literal-pathspecs add -- HANDOFF-TO-MOBILE.md docs/superpowers/plans/2026-07-14-backend-to-mobile-handoff-pack.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs(mobile): publish backend handoff ledger"
HANDOFF_COMMIT="$(git rev-parse HEAD)"
git diff --cached --quiet
```

Expected: only `HANDOFF-TO-MOBILE.md` and the implementation plan are committed; the handoff records the three immutable delivery SHAs and avoids a self-referential final-commit placeholder.

- [ ] **Step 4: Obtain independent final review**

Give the reviewer the approved goal, three commit SHAs, exact changed paths, fixture manifest, test output, and constraints. Require a severity-ranked report and fix/re-review loop until `0 Critical / 0 Important`; verify no reviewer writes to the mobile worktree or deploys anything.

- [ ] **Step 5: Close the finite goal**

Run final read-only checks:

```bash
git show "${PLAND_COMMIT}:pland.md" | cmp - pland.md
git log --oneline -3
git status --short
(cd /root/worktrees/hourkey-mobile-p0-network-sifu && git status --short)
```

Report `PLAND_COMMIT`, `FIXTURE_COMMIT`, `HANDOFF_COMMIT`, fixture count, test totals, independent review verdict, and the pre-existing unrelated dirty paths separately. Mark the goal complete only after all acceptance checks pass.
