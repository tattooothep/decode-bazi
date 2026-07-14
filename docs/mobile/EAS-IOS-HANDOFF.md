# EAS iOS Handoff: Owner Setup to Question-Free Build

This runbook lets Jarvis merge the backend team's adoption templates into the existing Expo app, lets one authorized human bootstrap remote signing, and then runs preview or production iOS builds without prompts. It deliberately stops at a completed EAS build receipt.

Use EAS CLI `21.0.0`. The version was the current npm release when this handoff was prepared on 14 July 2026. The mobile app currently uses dynamic `app.config.js` over `app.json`, so both resolved Expo views are mandatory evidence.

## Boundaries

- Jarvis owns and edits the mobile repository. The backend team never copies, stages, or commits these files there.
- Start from the exact owner-approved clean Jarvis commit; do not apply this runbook to a dirty checkout.
- Merge the template fields. Do not replace plugins, permissions, Associated Domains, Android config, scheme, icons, or any other native setting.
- Remote signing assets and `EXPO_TOKEN` never enter Git or command-line arguments.
- `build:configure` is interactive and is forbidden in automation after adoption.
- `credentials`, `credentials:configure-build`, and device registration are interactive and are forbidden in automation after bootstrap.
- Question-free builds use `--non-interactive --freeze-credentials`; they fail instead of creating, repairing, refreshing, or revoking credentials.
- **STOP BEFORE SUBMISSION.** Do not run EAS Submit, auto-submit, Transporter, or App Store Connect upload commands.
- **DO NOT DEPLOY.** This pack does not authorize a production, backend, entitlement, update, or AASA deployment.

## 0. Required owner packet

Complete [EAS-IOS-OWNER-CHECKLIST.md](./EAS-IOS-OWNER-CHECKLIST.md). The operator environment must then contain these non-secret values; use the approved values, not the placeholder labels:

```bash
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${HANDOFF_ROOT:?Set HANDOFF_ROOT to the eas-ios handoff directory}"
: "${OWNER_APPROVED_MOBILE_COMMIT:?Set the exact owner-approved Jarvis commit SHA}"
: "${EXPO_OWNER:?Set EXPO_OWNER from OWNER_INPUT_EXPO_OWNER}"
: "${EAS_PROJECT_ID:?Set EAS_PROJECT_ID from OWNER_INPUT_EAS_PROJECT_ID}"
: "${IOS_BUNDLE_IDENTIFIER:?Set IOS_BUNDLE_IDENTIFIER from OWNER_INPUT_IOS_BUNDLE_IDENTIFIER}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID from OWNER_INPUT_APPLE_TEAM_ID}"
: "${IOS_BUILD_NUMBER:?Set IOS_BUILD_NUMBER from OWNER_INPUT_IOS_BUILD_NUMBER}"
```

`HANDOFF_ROOT` is the directory containing `eas.json.template.json` and `app-config.ios.template.json`. Do not export Apple credentials or the Expo token while merging config.

`EAS_PROJECT_ID` must already identify the one owner-approved remote project. This runbook never guesses or creates a project. If the project is new, finish the explicit precreation branch in the owner checklist first.

## 1. Prove the starting commit and back up config

```bash
set -euo pipefail
umask 077
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${OWNER_APPROVED_MOBILE_COMMIT:?Set the exact owner-approved Jarvis commit SHA}"
cd "$MOBILE_REPO"
test "$(git rev-parse HEAD)" = "$OWNER_APPROVED_MOBILE_COMMIT"
test -z "$(git status --porcelain --untracked-files=all)"
test -f app.json
test -f app.config.js
test -f eas.json
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hourkey-eas-ios.XXXXXX")"
export BACKUP_DIR
cp -p app.json app.config.js eas.json "$BACKUP_DIR/"
printf 'Config backup: %s\n' "$BACKUP_DIR"
```

The backup is outside the repository and contains config only. It is recovery material, not a source for credentials.

## 2. Merge the two JSON templates without overwriting native settings

Validate the environment again, then run the deterministic merge. It preserves all existing top-level Expo fields, `plugins`, `associatedDomains`, Android settings, development build profiles, and existing submit metadata. It replaces only the owner/EAS link, the five iOS adoption fields, EAS CLI policy, and the two named build profiles.

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${HANDOFF_ROOT:?Set HANDOFF_ROOT to the eas-ios handoff directory}"
: "${EXPO_OWNER:?Set EXPO_OWNER from OWNER_INPUT_EXPO_OWNER}"
: "${EAS_PROJECT_ID:?Set EAS_PROJECT_ID from OWNER_INPUT_EAS_PROJECT_ID}"
: "${IOS_BUNDLE_IDENTIFIER:?Set IOS_BUNDLE_IDENTIFIER from OWNER_INPUT_IOS_BUNDLE_IDENTIFIER}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID from OWNER_INPUT_APPLE_TEAM_ID}"
: "${IOS_BUILD_NUMBER:?Set IOS_BUILD_NUMBER from OWNER_INPUT_IOS_BUILD_NUMBER}"
cd "$MOBILE_REPO"

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function checked(name, pattern, description) {
  const value = required(name);
  if (!pattern.test(value)) throw new Error(`${name} must be ${description}`);
  return value;
}

const replacements = new Map([
  ["OWNER_INPUT_EXPO_OWNER", checked("EXPO_OWNER", /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "an Expo account or organization slug without @")],
  ["OWNER_INPUT_EAS_PROJECT_ID", checked("EAS_PROJECT_ID", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "a canonical EAS project UUID")],
  ["OWNER_INPUT_IOS_BUNDLE_IDENTIFIER", checked("IOS_BUNDLE_IDENTIFIER", /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/, "an explicit reverse-DNS bundle identifier")],
  ["OWNER_INPUT_APPLE_TEAM_ID", checked("APPLE_TEAM_ID", /^[A-Z0-9]{10}$/, "a 10-character Apple Team ID")],
  ["OWNER_INPUT_IOS_BUILD_NUMBER", checked("IOS_BUILD_NUMBER", /^[1-9][0-9]*$/, "a positive integer build-number string")],
]);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function substitute(value) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map(substitute);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, substitute(child)]));
  }
  return value;
}

function writeJsonAtomically(filename, value) {
  const temporary = `${filename}.eas-handoff.tmp`;
  const mode = fs.statSync(filename).mode & 0o777;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temporary, filename);
}

const handoffRoot = required("HANDOFF_ROOT");
const appTemplate = substitute(readJson(path.join(handoffRoot, "app-config.ios.template.json")));
const easTemplate = substitute(readJson(path.join(handoffRoot, "eas.json.template.json")));
const app = readJson("app.json");
const eas = readJson("eas.json");

app.expo = {
  ...app.expo,
  owner: appTemplate.expo.owner,
  extra: {
    ...(app.expo.extra ?? {}),
    ...(appTemplate.expo.extra ?? {}),
    eas: {
      ...(app.expo.extra?.eas ?? {}),
      ...(appTemplate.expo.extra?.eas ?? {}),
    },
  },
  ios: {
    ...(app.expo.ios ?? {}),
    ...appTemplate.expo.ios,
  },
};

eas.cli = { ...(eas.cli ?? {}), ...easTemplate.cli };
eas.build = { ...(eas.build ?? {}) };
for (const profile of ["preview", "production"]) {
  eas.build[profile] = {
    ...(eas.build[profile] ?? {}),
    ...easTemplate.build[profile],
    ios: {
      ...(eas.build[profile]?.ios ?? {}),
      ...(easTemplate.build[profile].ios ?? {}),
    },
  };
}

const merged = JSON.stringify({ app, eas });
if (merged.includes("OWNER_INPUT_")) throw new Error("An owner placeholder remains unresolved");
writeJsonAtomically("app.json", app);
writeJsonAtomically("eas.json", eas);
NODE
```

Inspect exactly what changed and make the Jarvis-owned adoption commit:

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${BACKUP_DIR:?Run the config backup step first}"
: "${EXPO_OWNER:?Set EXPO_OWNER from OWNER_INPUT_EXPO_OWNER}"
: "${EAS_PROJECT_ID:?Set EAS_PROJECT_ID from OWNER_INPUT_EAS_PROJECT_ID}"
: "${IOS_BUNDLE_IDENTIFIER:?Set IOS_BUNDLE_IDENTIFIER from OWNER_INPUT_IOS_BUNDLE_IDENTIFIER}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID from OWNER_INPUT_APPLE_TEAM_ID}"
: "${IOS_BUILD_NUMBER:?Set IOS_BUILD_NUMBER from OWNER_INPUT_IOS_BUILD_NUMBER}"
cd "$MOBILE_REPO"
git diff --check -- app.json app.config.js eas.json
git diff -- app.json app.config.js eas.json
npx expo config --type public --json > "$BACKUP_DIR/expo-public.json"
npx expo config --type introspect --json > "$BACKUP_DIR/expo-introspect.json"

node <<'NODE'
const fs = require("node:fs");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} did not survive resolved app.config.js`);
}

const evidenceDir = required("BACKUP_DIR");
const publicConfig = JSON.parse(fs.readFileSync(`${evidenceDir}/expo-public.json`, "utf8"));
const introspectedConfig = JSON.parse(fs.readFileSync(`${evidenceDir}/expo-introspect.json`, "utf8"));
equal(publicConfig.owner, required("EXPO_OWNER"), "Expo owner");
equal(publicConfig.extra?.eas?.projectId, required("EAS_PROJECT_ID"), "EAS project ID");
equal(publicConfig.ios?.bundleIdentifier, required("IOS_BUNDLE_IDENTIFIER"), "iOS bundle identifier");
equal(publicConfig.ios?.appleTeamId, required("APPLE_TEAM_ID"), "Apple Team ID");
equal(publicConfig.ios?.buildNumber, required("IOS_BUILD_NUMBER"), "iOS build number");
equal(publicConfig.ios?.supportsTablet, true, "iPad support");
equal(introspectedConfig.ios?.bundleIdentifier, required("IOS_BUNDLE_IDENTIFIER"), "introspected bundle identifier");

const associatedDomains = publicConfig.ios?.associatedDomains ?? [];
if (!associatedDomains.includes("applinks:hourkey.io")) throw new Error("Associated Domains was lost during merge");
const entitlements = introspectedConfig.ios?.entitlements
  ?? introspectedConfig._internal?.modResults?.ios?.entitlements
  ?? {};
if (!(entitlements["com.apple.developer.associated-domains"] ?? []).includes("applinks:hourkey.io")) {
  throw new Error("Associated Domains entitlement is absent from introspected config");
}

const pluginNames = (publicConfig.plugins ?? []).map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
for (const plugin of ["expo-notifications", "expo-iap"]) {
  if (!pluginNames.includes(plugin)) throw new Error(`${plugin} was lost during merge`);
}
console.log("RESOLVED_EXPO_CONFIG_OK owner,project,ios,domains,notifications,iap");
NODE
```

Before staging, inspect `expo-public.json` and `expo-introspect.json` in `BACKUP_DIR`. Confirm the owner, project ID, bundle ID, Apple team, build number, tablet support, Associated Domains, notifications/IAP plugins, permission usage descriptions, and absence of unintended background modes all match the owner-approved starting app plus the five approved inputs. Do not commit either report.

If the assertion reports that a value did not survive `app.config.js`, stop without staging. In `app.config.js`, remove the conflicting hard-coded owner, `extra.eas`, or iOS value and make its returned object preserve the incoming `config`, `config.extra`, and `config.ios` fields. Keep its existing Android/API-key behavior, rerun both resolved-config commands and the assertion, and commit only after it prints `RESOLVED_EXPO_CONFIG_OK`. Never hide the mismatch by injecting these identity fields from an untracked environment variable.

After the resolved reports and diff are approved, make the Jarvis-owned adoption commit:

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
cd "$MOBILE_REPO"
git --literal-pathspecs add -- app.json app.config.js eas.json
git diff --cached --name-only
git diff --cached --check
git diff --cached -- app.json app.config.js eas.json
git commit -m "build(ios): adopt owner-approved EAS configuration"
test -z "$(git status --porcelain --untracked-files=all)"
```

## 3. One-time authorized interactive bootstrap

Only the named credential operator runs this section. Use an interactive terminal with Apple two-factor authentication available. Ensure `EXPO_TOKEN` is unset so the login identity is unambiguous.

```bash
set -euo pipefail
umask 077
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${EAS_PROJECT_ID:?Set EAS_PROJECT_ID from OWNER_INPUT_EAS_PROJECT_ID}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID from OWNER_INPUT_APPLE_TEAM_ID}"
cd "$MOBILE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
BOOTSTRAP_EVIDENCE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hourkey-eas-bootstrap.XXXXXX")"
export BOOTSTRAP_EVIDENCE_DIR
unset EXPO_TOKEN
npx --yes eas-cli@21.0.0 login
npx --yes eas-cli@21.0.0 whoami
npx --yes eas-cli@21.0.0 project:init --id "$EAS_PROJECT_ID" --non-interactive
npx --yes eas-cli@21.0.0 project:info
test -z "$(git status --porcelain --untracked-files=all)"
npx --yes eas-cli@21.0.0 config --platform ios --profile preview --non-interactive --json > "$BOOTSTRAP_EVIDENCE_DIR/eas-preview.json"
npx --yes eas-cli@21.0.0 config --platform ios --profile production --non-interactive --json > "$BOOTSTRAP_EVIDENCE_DIR/eas-production.json"

DEVICE_LIMIT=100
DEVICE_OFFSET=0
DEVICE_PAGE_INDEX=0
DEVICE_PAGE_DIR="$BOOTSTRAP_EVIDENCE_DIR/apple-device-pages"
mkdir -p "$DEVICE_PAGE_DIR"
while :; do
  printf -v DEVICE_PAGE '%s/page-%06d.json' "$DEVICE_PAGE_DIR" "$DEVICE_PAGE_INDEX"
  npx --yes eas-cli@21.0.0 device:list --apple-team-id "$APPLE_TEAM_ID" --offset "$DEVICE_OFFSET" --limit "$DEVICE_LIMIT" --non-interactive --json > "$DEVICE_PAGE"
  PAGE_COUNT="$(node - "$DEVICE_PAGE" "$DEVICE_LIMIT" <<'NODE'
const fs = require("node:fs");
const page = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const limit = Number(process.argv[3]);
if (!Array.isArray(page)) throw new Error("EAS device:list JSON must be an array");
if (page.length > limit) throw new Error("EAS device:list returned more than the requested limit");
console.log(page.length);
NODE
)"
  DEVICE_PAGE_INDEX=$((DEVICE_PAGE_INDEX + 1))
  DEVICE_OFFSET=$((DEVICE_OFFSET + PAGE_COUNT))
  if (( PAGE_COUNT < DEVICE_LIMIT )); then break; fi
done

node - "$DEVICE_PAGE_DIR" "$BOOTSTRAP_EVIDENCE_DIR/apple-devices.json" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [pageDir, output] = process.argv.slice(2);
const pages = fs.readdirSync(pageDir).filter((name) => /^page-[0-9]{6}\.json$/.test(name)).sort();
if (pages.length === 0) throw new Error("No EAS device pages were captured");
const devices = pages.flatMap((name) => {
  const page = JSON.parse(fs.readFileSync(path.join(pageDir, name), "utf8"));
  if (!Array.isArray(page)) throw new Error(`${name} is not an array`);
  return page;
});
const identifiers = devices.map((device) => device.identifier);
if (identifiers.some((identifier) => typeof identifier !== "string" || identifier.length === 0)) {
  throw new Error("A registered Apple device has no identifier");
}
if (new Set(identifiers).size !== identifiers.length) throw new Error("Duplicate Apple device identifiers across pages");
fs.writeFileSync(output, `${JSON.stringify(devices, null, 2)}\n`, { mode: 0o600 });
console.log(`APPLE_DEVICES_COMPLETE_OK count=${devices.length} pages=${pages.length}`);
NODE
printf 'Bootstrap evidence: %s\n' "$BOOTSTRAP_EVIDENCE_DIR"
```

The loop uses EAS CLI's maximum page size and continues until it receives a short page, so `apple-devices.json` represents the complete selected team rather than the first 50 devices. Compare that file with the owner-approved preview UDID list. If any registered device is missing, the authorized operator runs `npx --yes eas-cli@21.0.0 device:create`, completes Apple prompts, reruns the whole pagination loop, and compares again. Device evidence contains real UDIDs: keep `BOOTSTRAP_EVIDENCE_DIR` outside Git and do not upload it as a general CI artifact. Device registration is never a CI step.

Configure remote credentials for each distribution profile:

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
cd "$MOBILE_REPO"
npx --yes eas-cli@21.0.0 credentials:configure-build --platform ios --profile preview
npx --yes eas-cli@21.0.0 credentials:configure-build --platform ios --profile production
npx --yes eas-cli@21.0.0 credentials --platform ios
npx --yes eas-cli@21.0.0 build:version:set --platform ios --profile production
test -z "$(git status --porcelain --untracked-files=all)"
```

In the prompts, select the approved Apple team, reuse the approved Apple Distribution certificate, bind preview to the Ad Hoc provisioning profile containing all registered devices, bind production to the App Store provisioning profile, confirm the APNs key for `expo-notifications`, and set remote iOS version state from `OWNER_INPUT_IOS_BUILD_NUMBER`. Never revoke or replace an existing shared credential unless the owner separately approves that action.

Finish bootstrap with a successful interactive build for both profiles. This proves both credential sets before automation:

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
cd "$MOBILE_REPO"
npx --yes eas-cli@21.0.0 build --platform ios --profile preview --wait
npx --yes eas-cli@21.0.0 build --platform ios --profile production --wait
test -z "$(git status --porcelain --untracked-files=all)"
```

Preview is an internal Ad Hoc build, not a simulator build. It installs only on a registered device whose UDID is present in its provisioning profile. Production produces a store-distribution archive; this runbook does not upload it.

## 4. Create CI access without exposing the token

Use the CI identity branch approved in the owner checklist. For an Expo Organization, prefer a dedicated Robot user with the `Developer` role; do not use an Owner/Admin token. A personal access token is permitted only when the owner recorded the fallback exception and accepted that it acts across every Expo account and organization the person can access. A repository administrator inserts the selected token value directly into the mobile repository secret named `EXPO_TOKEN`. Jarvis receives only the expected `whoami` identity and confirmation that the secret exists, never the token value.

Reference: [Expo programmatic access](https://docs.expo.dev/accounts/programmatic-access/) and [trigger builds from CI](https://docs.expo.dev/build/building-on-ci/).

To adopt the workflow, Jarvis copies `eas-ios-build.workflow.yml` to the mobile repository's `.github/workflows/eas-ios-build.yml`, reviews the diff, and commits that one file. The template exposes only a manual `workflow_dispatch`; it has no push trigger, credential repair, submission, or deployment step.

```bash
set -euo pipefail
umask 077
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${HANDOFF_ROOT:?Set HANDOFF_ROOT to the eas-ios handoff directory}"
WORKFLOW_BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hourkey-eas-workflow.XXXXXX")"
export WORKFLOW_BACKUP_DIR
cd "$MOBILE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
mkdir -p .github/workflows
WORKFLOW_DEST=".github/workflows/eas-ios-build.yml"
export WORKFLOW_DEST
if [[ -f "$WORKFLOW_DEST" ]]; then cp -p "$WORKFLOW_DEST" "$WORKFLOW_BACKUP_DIR/"; fi
printf 'Workflow backup: %s\n' "$WORKFLOW_BACKUP_DIR"
cp "$HANDOFF_ROOT/eas-ios-build.workflow.yml" "$WORKFLOW_DEST"
git diff --check -- "$WORKFLOW_DEST"
git diff -- "$WORKFLOW_DEST"
git --literal-pathspecs add -- "$WORKFLOW_DEST"
git diff --cached --name-only
git diff --cached --check
git diff --cached -- "$WORKFLOW_DEST"
git commit -m "ci(ios): add manual frozen-credential EAS build"
test -z "$(git status --porcelain --untracked-files=all)"
```

## 5. Question-free Jarvis or CI build

Use this same command sequence locally with a token or through the workflow. The token must already be present in the process environment; never paste it into a command, shell history, file, or log.

```bash
set -euo pipefail
: "${MOBILE_REPO:?Set MOBILE_REPO to the clean Jarvis repository path}"
: "${EXPO_TOKEN:?Set EXPO_TOKEN through the secure process environment}"
: "${BUILD_PROFILE:?Set BUILD_PROFILE to preview or production}"
: "${BUILD_RESULT_JSON:?Set BUILD_RESULT_JSON to a temporary JSON receipt path}"
cd "$MOBILE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
case "$BUILD_PROFILE" in
  preview|production) ;;
  *) printf 'BUILD_PROFILE must be preview or production\n' >&2; exit 64 ;;
esac
npx --yes eas-cli@21.0.0 whoami
npx --yes eas-cli@21.0.0 project:info
npx --yes eas-cli@21.0.0 config --platform ios --profile "$BUILD_PROFILE" --non-interactive --json
npx --yes eas-cli@21.0.0 build --platform ios --non-interactive --freeze-credentials --wait --json --profile "$BUILD_PROFILE" > "$BUILD_RESULT_JSON"
node -e '
  const fs = require("node:fs");
  const parsed = JSON.parse(fs.readFileSync(process.env.BUILD_RESULT_JSON, "utf8"));
  const build = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!build || typeof build !== "object") throw new Error("EAS did not return a build object");
  const owner = build.project?.ownerAccount?.name;
  const slug = build.project?.slug;
  const id = build.id;
  if (![owner, slug, id].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("Build receipt has no owner, project slug, or build ID");
  }
  const dashboardUrl = `https://expo.dev/accounts/${encodeURIComponent(owner)}/projects/${encodeURIComponent(slug)}/builds/${encodeURIComponent(id)}`;
  console.log(JSON.stringify({
    id,
    status: build.status ?? null,
    dashboardUrl,
    applicationArchiveUrl: build.artifacts?.applicationArchiveUrl ?? null,
  }, null, 2));
'
```

Success evidence is the exit-zero command, the JSON receipt, its EAS build ID/status, and the dashboard URL constructed from the receipt's owner, project slug, and build ID. Keep the receipt as a CI artifact or outside Git. `applicationArchiveUrl` is optional and may be absent, especially for a failed build. For preview, install any available archive only on an approved registered device. For production, retain any available archive URL and stop.

## Troubleshooting

### `whoami` is the wrong Expo identity

Stop. Do not relink the project. The token owner must grant the correct project role or replace the repository secret, then rerun `whoami` and `project:info`. Revoke any exposed token using [Expo programmatic access](https://docs.expo.dev/accounts/programmatic-access/).

### `project:info` or resolved config points to the wrong project

Stop before building. Restore `app.json` and `eas.json` from `BACKUP_DIR`, compare the approved EAS project UUID and Expo owner, then repeat the merge. Use `project:init --id` only in the authorized bootstrap. Do not create a second EAS project.

### `--freeze-credentials` reports missing or invalid credentials

This is the intended fail-closed behavior. Do not remove `--freeze-credentials` and do not add repair flags to CI. The authorized credential operator reruns the interactive credential section, selects the approved Apple Distribution certificate and provisioning profile, completes an interactive build, and then retries automation. See [Expo app credentials](https://docs.expo.dev/app-signing/app-credentials/).

### Preview build installs on one device but not another

Confirm the failing device is a registered device and its UDID appears in the Ad Hoc provisioning profile. The authorized operator registers the missing UDID, refreshes the preview profile interactively, and creates a new preview build. Existing IPA files do not gain newly registered devices. See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

### Apple rejects the build number as already used

Stop automation. Compare the highest TestFlight/App Store number with the remote EAS version. The authorized operator runs `build:version:set` interactively with the owner-approved next number, then repeats the interactive build before CI. See [Expo app version management](https://docs.expo.dev/build-reference/app-versions/).

### Bundle ID, team, or entitlement mismatch

Stop. Compare the public and introspected Expo config with the selected App ID, Team ID, Associated Domains, Push Notifications, and In-App Purchase capabilities. Reuse the existing explicit App ID; do not create a duplicate. See [Register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/) and [Expo's iOS build process](https://docs.expo.dev/build-reference/ios-builds/).

### EAS build itself fails

Open the build dashboard URL from the JSON receipt, find the first failed build phase, and fix only the mobile source/config responsible for that phase. Repeat resolved config checks and a clean local commit before retrying. Expo's current starting point is [Create your first build](https://docs.expo.dev/build/setup/).

## Final stop condition

The handoff is complete when the selected EAS build finishes successfully and its JSON receipt plus URL are recorded outside Git. **STOP BEFORE SUBMISSION** and **DO NOT DEPLOY** remain in force. App Store submission, TestFlight distribution, production release, EAS Update, backend deployment, entitlement activation, credential revocation, and AASA changes each require their own owner approval and separate goal.
