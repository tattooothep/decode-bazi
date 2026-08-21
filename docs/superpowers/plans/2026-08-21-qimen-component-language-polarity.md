# Qimen Component Language and Polarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a backward-compatible Qimen C4 notification that follows the owner's locale and explicitly labels every deity, door, and star as intrinsically supportive, contextual, unsupportive, or unavailable without changing the hour chart's sole action authority.

**Architecture:** Add an attested component catalog and immutable schema-v3 snapshot/provider payload while preserving all schema-v2 readers and stored history. The backend resolves canonical quality and lock-screen copy; mobile v222 registers schema 3, validates the attested values, localizes names by canonical code, and renders semantic chips without calculating a cross-layer score.

**Tech Stack:** Node.js/CommonJS canonical runtime, TypeScript/Next.js API, PostgreSQL migration, React Native/Expo, strict JSON/digest validation, Node assertion test scripts.

## Global Constraints

- Follow the notification owner's locale; Thai shows localized text with canonical Han in parentheses.
- Intrinsic quality mapping is `great_auspicious|auspicious -> supportive`, `contextual|neutral|normal -> contextual`, `inauspicious|severe -> unsupportive`, and unknown -> unavailable.
- Never infer quality from a name, color, or `旺相休囚死`; unknown never becomes green or silently neutral.
- Month and day remain raw context; hour remains sole action authority.
- Do not average month/day/hour or create a synthetic palace verdict.
- Lock-screen uses glyph plus text; in-app uses glyph, label, and semantic color.
- Preserve schema-v2 payload parsing and old notification history.
- Producer remains disabled until a localized full-format device canary passes tray, sound, and tap.
- Three reviewers must sign the exact final backend/mobile/engine tuple.

---

### Task 1: Canonical component catalog

**Files:**
- Create: `src/lib/qimen-component-catalog.cjs`
- Create: `scripts/test-qimen-component-catalog.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveQimenComponent(kind, code)` returning frozen `{ code, zh, names: { th, en, zh }, baseQuality, presentation }`.
- Produces: `componentPresentation(baseQuality)` returning `supportive | contextual | unsupportive | unavailable`.
- Consumes: canonical rows currently attested by `/root/qimen-api/data/qimen.sqlite`; the test compares every exported row against that database.

- [ ] **Step 1: Write the failing catalog test**

```ts
const catalog = require("../src/lib/qimen-component-catalog.cjs");
assert.equal(catalog.componentPresentation("great_auspicious"), "supportive");
assert.equal(catalog.componentPresentation("contextual"), "contextual");
assert.equal(catalog.componentPresentation("severe"), "unsupportive");
assert.equal(catalog.componentPresentation("unknown"), "unavailable");
assert.deepEqual(catalog.resolveQimenComponent("deity", "JIU_DI"), {
  code: "JIU_DI", zh: "九地",
  names: { th: "เก้าพื้นดิน", en: "Jiu Di (Nine Earth)", zh: "九地" },
  baseQuality: "auspicious", presentation: "supportive",
});
assert.equal(catalog.resolveQimenComponent("star", "UNKNOWN"), null);
```

Read `/root/qimen-api/data/qimen.sqlite` in the same test and assert exact code, Han, Thai, English, and `base_quality` parity for all accepted deity/door/star rows.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx scripts/test-qimen-component-catalog.mts`

Expected: FAIL with `MODULE_NOT_FOUND` for `qimen-component-catalog.cjs`.

- [ ] **Step 3: Implement the frozen catalog**

```js
const QUALITY = Object.freeze({
  great_auspicious: "supportive", auspicious: "supportive",
  contextual: "contextual", neutral: "contextual", normal: "contextual",
  inauspicious: "unsupportive", severe: "unsupportive",
});

function componentPresentation(value) {
  return QUALITY[String(value || "")] || "unavailable";
}

function resolveQimenComponent(kind, code) {
  const row = CATALOG[kind]?.[String(code || "").toUpperCase()];
  return row || null;
}
```

Populate `CATALOG` with the exact canonical sqlite rows and freeze every nested value. Do not include variant-only codes that the three-layer engine cannot emit.

- [ ] **Step 4: Verify GREEN and catalog coverage**

Run: `npx tsx scripts/test-qimen-component-catalog.mts`

Expected: PASS with `qimen component catalog tests passed` and exact sqlite parity.

- [ ] **Step 5: Commit the catalog**

```bash
git add src/lib/qimen-component-catalog.cjs scripts/test-qimen-component-catalog.mts package.json
git commit -m "feat: attest qimen component qualities"
```

---

### Task 2: Immutable schema-v3 snapshot and compact payload

**Files:**
- Modify: `src/lib/qimen-three-layer-notification.cjs`
- Modify: `src/lib/qimen-canonical-occurrence-builder.cjs`
- Modify: `src/lib/mobile-qimen-notification-detail.cjs`
- Create: `scripts/fixtures/qimen-three-layer-valid-snapshot-v3.cjs`
- Create: `scripts/test-qimen-three-layer-v3.mts`
- Modify: `scripts/test-qimen-three-layer-snapshot.mts`
- Modify: `scripts/test-qimen-three-layer-payload.mts`

**Interfaces:**
- Produces: `buildQimenThreeLayerSnapshotV3(input)`, `verifyQimenThreeLayerSnapshotV3(value)`, `buildQimenV3ProviderData(snapshot)`, `parseQimenV3ProviderData(value)`.
- Preserves: every existing v2 function byte-for-byte behavior for old history.
- Adds per component: `deityBaseQuality`, `doorBaseQuality`, `starBaseQuality` with canonical values or explicit `unavailable` for a missing center component.

- [ ] **Step 1: Write failing v3 contract tests**

```ts
const snapshot = runtime.buildQimenThreeLayerSnapshotV3(fixture.input("acct_test_owner"));
assert.equal(snapshot.snapshotSchema, 3);
assert.equal(snapshot.selectedEvidence.month.deityBaseQuality, "auspicious");
assert.equal(snapshot.selectedEvidence.month.starBaseQuality, "severe");
assert.equal(snapshot.layers.month.palaces[4].doorBaseQuality, "unavailable");
assert.equal(runtime.verifyQimenThreeLayerSnapshotV3(snapshot), true);

const provider = runtime.buildQimenV3ProviderData(snapshot);
assert.deepEqual(Object.keys(provider), ["qimenV3"]);
const compact = runtime.parseQimenV3ProviderData(provider);
assert.equal(compact.v, 3);
assert.equal(compact.layers.hour.doorBaseQuality, snapshot.selectedEvidence.hour.doorBaseQuality);
assert.ok(Buffer.byteLength(provider.qimenV3, "utf8") < 3_500);
```

Also tamper one quality and assert digest verification fails. Call every v2 fixture/test and assert it still passes unchanged.

- [ ] **Step 2: Run the v3 test and verify RED**

Run: `npx tsx scripts/test-qimen-three-layer-v3.mts`

Expected: FAIL because `buildQimenThreeLayerSnapshotV3` does not exist.

- [ ] **Step 3: Add strict v3 builders/parsers**

Use the catalog to attach exact qualities by canonical code before digesting. Define distinct strict key arrays for v2 and v3. Reject a quality that does not equal the catalog value, reject duplicate keys/accessors, and keep v3 under the provider byte limit.

```js
function qualityFor(kind, code, zh, allowUnavailable) {
  if (allowUnavailable && code === null && zh === null) return "unavailable";
  const entry = componentCatalog.resolveQimenComponent(kind, code);
  if (!entry || entry.zh !== zh) throw invalid();
  return entry.baseQuality;
}
```

Build new canonical occurrences with schema 3. Make notification detail dispatch verification by `snapshot.snapshotSchema`, accepting both 2 and 3.

- [ ] **Step 4: Verify v3 GREEN and v2 regression safety**

Run:

```bash
npx tsx scripts/test-qimen-three-layer-v3.mts
npx tsx scripts/test-qimen-three-layer-snapshot.mts
npx tsx scripts/test-qimen-three-layer-payload.mts
npx tsx scripts/test-qimen-notification-detail.mts
npx tsx scripts/test-qimen-three-layer-science.mts
```

Expected: all PASS; v2 stored history still verifies and opens.

- [ ] **Step 5: Commit the v3 contract**

```bash
git add src/lib/qimen-three-layer-notification.cjs src/lib/qimen-canonical-occurrence-builder.cjs src/lib/mobile-qimen-notification-detail.cjs scripts/fixtures/qimen-three-layer-valid-snapshot-v3.cjs scripts/test-qimen-three-layer-v3.mts scripts/test-qimen-three-layer-snapshot.mts scripts/test-qimen-three-layer-payload.mts
git commit -m "feat: add attested qimen notification schema v3"
```

---

### Task 3: Capability negotiation and localized provider copy

**Files:**
- Create: `migrations/20260821_mobile_qimen_component_quality_v3.sql`
- Create: `migrations/20260821_mobile_qimen_component_quality_v3.rollback.sql`
- Modify: `src/app/api/mobile/v1/push/route.ts`
- Modify: `src/lib/mobile-notification-preferences.ts`
- Modify: `src/lib/mobile-notification-delivery.cjs`
- Modify: `scripts/mobile-qimen-push-cron.cjs`
- Modify: `scripts/test-qimen-scheduler.mts`
- Modify: `scripts/test-qimen-push-registration.mts`
- Modify: `scripts/test-qimen-migration.mts`
- Modify: `scripts/test-qimen-migration-db.mts`

**Interfaces:**
- Registration accepts `qimenPayloadSchema: 1 | 2 | 3`.
- New C4 production sends require schema 3; schema 2 remains accepted for old history/retries but receives no incompatible v3 occurrence.
- `buildQimenCopy(locale, snapshot)` uses canonical localized names and base-quality presentation labels.

- [ ] **Step 1: Write failing registration, migration, and copy tests**

```ts
assert.match(route, /qimenPayloadSchema === 3/u);
assert.match(migration, /CHECK \(qimen_payload_schema IN \(1,2,3\)\)/u);

const th = scheduler.buildQimenCopy("th", snapshotV3);
assert.match(th.body, /เก้าพื้นดิน \(九地\).*✓ ส่งเสริม/u);
assert.match(th.body, /ดาวเทียนรุ่ย \(天芮\).*! ไม่ส่งเสริม/u);
assert.match(th.body, /ผังยามเป็นผู้ตัดสิน/u);
assert.ok(th.body.length <= 400);

const en = scheduler.buildQimenCopy("en", snapshotV3);
assert.match(en.body, /Jiu Di \(Nine Earth\) \(九地\)/u);
const zh = scheduler.buildQimenCopy("zh", snapshotV3);
assert.doesNotMatch(zh.body, /九地 \(九地\)/u);
```

Assert unknown/tampered quality rejects instead of rendering green. Assert a schema-2 token is skipped with `payload_capability_missing`, while a schema-3 token builds `qimenV3`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx scripts/test-qimen-scheduler.mts
npx tsx scripts/test-qimen-push-registration.mts
npx tsx scripts/test-qimen-migration.mts
```

Expected: FAIL on raw Chinese copy and missing schema 3.

- [ ] **Step 3: Implement negotiation and localized copy**

Migration replaces the check constraint with `(1,2,3)` and rollback safely maps 3 to 2 before restoring `(1,2)`. Update API types/validation and all delivery policy checks to require 3 for new v3 notices.

```js
const STATE_COPY = Object.freeze({
  th: { supportive: "✓ ส่งเสริม", contextual: "• ขึ้นกับบริบท", unsupportive: "! ไม่ส่งเสริม", unavailable: "? ยังไม่มีข้อมูล" },
  en: { supportive: "✓ Supportive", contextual: "• Contextual", unsupportive: "! Unsupportive", unavailable: "? Unavailable" },
  zh: { supportive: "✓ 助", contextual: "• 視情境", unsupportive: "! 不助", unavailable: "? 無資料" },
});
```

Format each layer from code and attested base quality, retain Han in non-Chinese locales, and keep the final body within 400 characters. Persist the same localized history copies used by provider delivery.

- [ ] **Step 4: Verify GREEN including a real migration database**

Run:

```bash
npx tsx scripts/test-qimen-scheduler.mts
npx tsx scripts/test-qimen-push-registration.mts
npx tsx scripts/test-qimen-migration.mts
npx tsx scripts/test-qimen-migration-db.mts
npx tsx scripts/test-mobile-push-retry-worker.mts
```

Expected: all PASS and v2 history policy remains covered.

- [ ] **Step 5: Commit backend delivery changes**

```bash
git add migrations/20260821_mobile_qimen_component_quality_v3.* src/app/api/mobile/v1/push/route.ts src/lib/mobile-notification-preferences.ts src/lib/mobile-notification-delivery.cjs scripts/mobile-qimen-push-cron.cjs scripts/test-qimen-scheduler.mts scripts/test-qimen-push-registration.mts scripts/test-qimen-migration.mts scripts/test-qimen-migration-db.mts
git commit -m "feat: localize qimen component alerts"
```

---

### Task 4: Mobile v3 validation and accessible polarity UI

**Files (mobile worktree `/root/worktrees/zibai-three-layer-mobile`):**
- Create: `src/qimen/componentPresentation.ts`
- Create: `scripts/test-qimen-component-presentation.mts`
- Modify: `src/qimen/notificationContract.ts`
- Modify: `src/i18n/qimenNotification.ts`
- Modify: `src/components/design/qimen/QimenNotificationDetailScreen.tsx`
- Modify: `src/native/push.ts`
- Modify: `src/types/mobile.ts`
- Modify: `scripts/test-qimen-notification-payload-v2.mts`
- Create: `scripts/test-qimen-notification-payload-v3.mts`
- Modify: `scripts/test-qimen-notification-c4.mts`
- Modify: `scripts/test-qimen-notification-render.mts`
- Modify: `scripts/test-qimen-notification-android.mts`

**Interfaces:**
- Parses both `qimenV2` and `qimenV3`; v2 old history renders with explicit unavailable status, never a guessed green state.
- Registers `qimen_payload_schema: 3` only after the Android channel exists; iOS advertises 3 when its notification runtime supports the same route.
- `componentDisplay(locale, kind, code, zh, baseQuality)` returns `{ name, han, state, glyph, label }` and validates the attested quality.

- [ ] **Step 1: Write failing contract and render tests**

```ts
const parsed = parseQimenV3ProviderData(providerV3);
assert.equal(parsed.layers.month.deityBaseQuality, "auspicious");
assert.throws(() => parseQimenV3ProviderData(tamperedQuality));
assert.doesNotThrow(() => parseQimenV2ProviderData(oldProviderV2));

const html = render("th", 1);
assert.match(html, /เก้าพื้นดิน \(九地\)/u);
assert.match(html, /✓ ส่งเสริม/u);
assert.match(html, /• ขึ้นกับบริบท/u);
assert.match(html, /! ไม่ส่งเสริม/u);
assert.match(html, /\? ยังไม่มีข้อมูล/u);
assert.equal((html.match(/data-component-quality=/gu) || []).length >= 27, true);
```

Assert screen-reader labels state component type, localized name, Han, and status. Assert the nine-palace grid uses component glyphs but has no computed average/palace-quality function. Assert v2 old history opens.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx scripts/test-qimen-notification-payload-v3.mts
npx tsx scripts/test-qimen-notification-render.mts
npx tsx scripts/test-qimen-notification-android.mts
```

Expected: FAIL on missing v3 parser, raw Han-only UI, and schema 2 registration.

- [ ] **Step 3: Implement v3 parser and component presentation**

Keep the current strict v2 parser unchanged. Add strict v3 keys and canonical quality validation. Centralize locale names and states in `componentPresentation.ts`; return unavailable for a v2 payload or center component without attested quality.

Render each row as localized name + Han + glyph/text chip. Use `c.good`, `c.fgSoft`, `c.bad`, and `c.fgFaint`; never rely on those colors without glyph and text. Show the fixed four-state legend before the nine-palace grid. Keep `doorVigor/starVigor`, warnings, formations, and hour authority as separate lines.

- [ ] **Step 4: Verify mobile GREEN and full regression suite**

Run:

```bash
npx tsx scripts/test-qimen-component-presentation.mts
npx tsx scripts/test-qimen-notification-payload-v2.mts
npx tsx scripts/test-qimen-notification-payload-v3.mts
npx tsx scripts/test-qimen-notification-c4.mts
npx tsx scripts/test-qimen-notification-render.mts
npx tsx scripts/test-qimen-notification-android.mts
node scripts/mobile-full-suite.mjs
```

Expected: all focused tests PASS and full suite reports every command green.

- [ ] **Step 5: Commit mobile implementation**

```bash
git add src/qimen/componentPresentation.ts src/qimen/notificationContract.ts src/i18n/qimenNotification.ts src/components/design/qimen/QimenNotificationDetailScreen.tsx src/native/push.ts src/types/mobile.ts scripts/test-qimen-component-presentation.mts scripts/test-qimen-notification-payload-v2.mts scripts/test-qimen-notification-payload-v3.mts scripts/test-qimen-notification-c4.mts scripts/test-qimen-notification-render.mts scripts/test-qimen-notification-android.mts
git commit -m "feat: show localized qimen component polarity"
```

---

### Task 5: Release verification, three signatures, deploy, and canary

**Files:**
- Modify only if verification exposes an in-scope defect.
- Create immutable backend release directory from the clean backend commit.
- Build signed internal-QA APK v222 from the clean mobile commit.

**Interfaces:**
- Produces exact tuple: backend commit, mobile commit, engine source digest, engine dependency-closure digest, engine reference-data digest.
- Produces public APK URL and SHA-256.
- Produces device canary evidence for provider acceptance, tray, sound, tap, and snapshot/history parity.

- [ ] **Step 1: Run backend release verification**

```bash
npx tsx scripts/test-qimen-component-catalog.mts
npx tsx scripts/test-qimen-three-layer-v3.mts
npx tsx scripts/test-qimen-scheduler.mts
npx tsx scripts/test-qimen-notification-detail.mts
npx tsx scripts/test-qimen-three-layer-science.mts
npm run build
git diff --check
git status --short
```

Expected: all PASS, build succeeds, worktree clean.

- [ ] **Step 2: Run mobile release verification and build v222**

Run the full mobile suite again, then use the repository's existing v221 release script/config with version code 222 and the same upgrade-compatible internal-QA certificate. Verify with `aapt dump badging`, `apksigner verify --verbose --print-certs`, SHA-256, and file size.

Expected: package `io.hourkey.app`, versionCode `222`, signed verification success.

- [ ] **Step 3: Obtain three independent exact-tuple signatures**

Give each reviewer the same tuple and require independent evidence for:

1. science truth: base quality vs vigor and hour-only authority;
2. mobile/UI truth: locale, four-state accessibility, v2 history compatibility;
3. delivery truth: schema negotiation, Android tray/sound/tap, migration/rollback, producer guard.

Any source edit invalidates all three signatures and restarts this step.

- [ ] **Step 4: Deploy guarded backend and migration**

Back up the current schema, apply the v3 constraint migration, build an immutable release from the signed backend commit, update the release symlink, restart the four web instances and Qimen scheduler timer, and verify public/internal health. Keep `producerEnabled:false` and the release-commit environment guard unset.

- [ ] **Step 5: Publish/install APK and send full-format test canary**

Publish v222 at a stable HTTPS URL, install/open it, verify production registration aggregates show exactly the intended owner installation with `qimen_payload_schema=3`, and send a full-format simulated C4 notification from an actual canonical good snapshot. The copy must clearly say it is a test if the snapshot is not current.

Record provider acceptance and ask the owner to confirm tray visibility, sound, and successful tap to the immutable detail. Verify app engagement rows when available. Clean up the exact simulated future occurrence after confirmation so it cannot suppress the natural occurrence.

- [ ] **Step 6: Natural canary and producer activation**

At the next actual current good hour, run one guarded acceptance occurrence for the registered device and verify the same tray/sound/tap path without future simulation. Only then set the DB producer state, runtime manifest, and exact `HOURKEY_RELEASE_COMMIT` guard to the signed backend commit. Observe scheduler heartbeat, due lag, duplicate count, and provider failures before marking the goal complete.

