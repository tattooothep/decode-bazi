import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PATHS = Object.freeze({
  eas: "handoff/mobile/eas-ios/eas.json.template.json",
  app: "handoff/mobile/eas-ios/app-config.ios.template.json",
  workflow: "handoff/mobile/eas-ios/eas-ios-build.workflow.yml",
  runbook: "docs/mobile/EAS-IOS-HANDOFF.md",
  checklist: "docs/mobile/EAS-IOS-OWNER-CHECKLIST.md",
});

let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}

function requiredText(key) {
  const relativePath = PATHS[key];
  const absolutePath = resolve(ROOT, relativePath);
  check(
    existsSync(absolutePath),
    `missing required EAS handoff file: ${relativePath}`,
  );
  const value = readFileSync(absolutePath, "utf8");
  check(value.endsWith("\n"), `${relativePath} must end with LF`);
  return value;
}

function requiredJson(key) {
  const text = requiredText(key);
  checks += 1;
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    assert.fail(`${PATHS[key]} must be valid JSON: ${error.message}`);
  }
}

function includes(text, needle, label) {
  check(
    text.includes(needle),
    `${label} must include ${JSON.stringify(needle)}`,
  );
}

function matches(text, pattern, label) {
  check(pattern.test(text), `${label} must match ${pattern}`);
}

const { text: easText, value: eas } = requiredJson("eas");
const { text: appText, value: app } = requiredJson("app");
const workflow = requiredText("workflow");
const runbook = requiredText("runbook");
const checklist = requiredText("checklist");

equal(
  eas.cli?.version,
  "21.0.0",
  "EAS CLI must be pinned to the verified current version",
);
equal(
  eas.cli?.appVersionSource,
  "remote",
  "EAS app version source must be remote",
);
for (const [profile, distribution] of [
  ["preview", "internal"],
  ["production", "store"],
]) {
  check(eas.build?.[profile], `missing ${profile} build profile`);
  equal(
    eas.build[profile].credentialsSource,
    "remote",
    `${profile} must use remote credentials`,
  );
  equal(
    eas.build[profile].distribution,
    distribution,
    `${profile} distribution must be explicit`,
  );
  check(
    eas.build[profile].ios && typeof eas.build[profile].ios === "object",
    `${profile}.ios must exist`,
  );
}
check(
  !Object.hasOwn(eas, "submit"),
  "handoff EAS template must not configure submission",
);

equal(
  app.expo?.owner,
  "OWNER_INPUT_EXPO_OWNER",
  "Expo owner placeholder is required",
);
equal(
  app.expo?.extra?.eas?.projectId,
  "OWNER_INPUT_EAS_PROJECT_ID",
  "EAS project placeholder is required",
);
equal(
  app.expo?.ios?.bundleIdentifier,
  "OWNER_INPUT_IOS_BUNDLE_IDENTIFIER",
  "bundle ID placeholder is required",
);
equal(
  app.expo?.ios?.appleTeamId,
  "OWNER_INPUT_APPLE_TEAM_ID",
  "Apple team placeholder is required",
);
equal(
  app.expo?.ios?.buildNumber,
  "OWNER_INPUT_IOS_BUILD_NUMBER",
  "build number placeholder is required",
);
equal(app.expo?.ios?.supportsTablet, true, "tablet support must stay enabled");

const allowedPlaceholders = [
  "OWNER_INPUT_APPLE_TEAM_ID",
  "OWNER_INPUT_EAS_PROJECT_ID",
  "OWNER_INPUT_EXPO_OWNER",
  "OWNER_INPUT_IOS_BUILD_NUMBER",
  "OWNER_INPUT_IOS_BUNDLE_IDENTIFIER",
];
const deliverables = [easText, appText, workflow, runbook, checklist].join(
  "\n",
);
const observedPlaceholders = [
  ...new Set(deliverables.match(/OWNER_INPUT_[A-Z0-9_]+/g) ?? []),
].sort();
equal(
  observedPlaceholders,
  allowedPlaceholders,
  "placeholder inventory must be exact",
);

includes(workflow, "workflow_dispatch:", "workflow");
matches(workflow, /node-version:\s*["']?24["']?\b/, "workflow");
matches(workflow, /\brun:\s*npm ci\b/, "workflow");
includes(workflow, "git status --porcelain", "workflow clean-checkout guard");
includes(
  workflow,
  "npx --yes eas-cli@21.0.0",
  "workflow pinned CLI invocation",
);
matches(
  workflow,
  /eas-cli@21\.0\.0 build --platform ios --non-interactive --freeze-credentials --wait --json\b/,
  "workflow frozen non-interactive build",
);
const secretReferences = [
  ...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g),
].map((match) => match[1]);
equal(
  [...new Set(secretReferences)],
  ["EXPO_TOKEN"],
  "workflow may reference only the EXPO_TOKEN secret name",
);
equal(
  secretReferences.length,
  2,
  "EXPO_TOKEN must be injected only into the two EAS command steps",
);
check(
  !/^ {4}env:\s*\n(?:^ {6}[^\n]*\n)*^ {6}EXPO_TOKEN:/m.test(workflow),
  "EXPO_TOKEN must not be exposed through job-level env",
);
for (const stepName of [
  "Verify identity, project, and resolved EAS configuration",
  "Build without changing remote credentials",
]) {
  matches(
    workflow,
    new RegExp(
      `- name: ${stepName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\n\\s+env:\\n\\s+EXPO_TOKEN: \\$\\{\\{ secrets\\.EXPO_TOKEN \\}\\}`,
    ),
    `${stepName} secret scope`,
  );
}
matches(
  workflow,
  /:\s*"\$\{EXPO_TOKEN:\?[^"\n]+\}"/,
  "workflow must fail closed when EXPO_TOKEN is absent",
);
check(
  !/(?:credentials:configure-build|\bbuild:configure\b|\bdevice:create\b|\bsubmit\b|auto-submit|\bdeploy\b|refresh-ad-hoc)/i.test(
    workflow,
  ),
  "workflow must never bootstrap credentials, submit, or deploy",
);

for (const ownerInput of allowedPlaceholders)
  includes(checklist, ownerInput, "owner checklist");
for (const requiredChecklistTerm of [
  "Account Holder",
  "active membership",
  "accepted agreements",
  "Team ID",
  "Certificates, Identifiers & Profiles",
  "App Store Connect",
  "@owner/hourkey-mobile",
  "EAS project UUID",
  "build capacity",
  "io.hourkey.app",
  "reverse-DNS",
  "TestFlight",
  "build number",
  "support URL",
  "privacy URL",
  "SKU",
  "legal entity",
  "export compliance",
  "Paid Applications Agreement",
  "expo-iap",
  "Apple Distribution certificate",
  "App Store provisioning profile",
  "Ad Hoc provisioning profile",
  "UDID",
  "APNs key",
  "expo-notifications",
  "EXPO_TOKEN",
  "rotation owner",
  "revoke",
  "Associated Domains",
  "AASA",
  "<APPLE_TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>",
  "Existing branch",
  "New branch",
  "disposable clean copy",
])
  includes(checklist, requiredChecklistTerm, "owner checklist");
matches(
  checklist,
  /\.p8[^\n]+\.p12[^\n]+provisioning profile[^\n]+private key[^\n]+Git/i,
  "owner checklist credential boundary",
);
matches(
  checklist,
  /eas-cli@21\.0\.0 project:init\s*\n/,
  "new-project branch must create and capture a remote project before adoption",
);

for (const requiredRunbookTerm of [
  "OWNER_APPROVED_MOBILE_COMMIT",
  "git status --porcelain",
  "mktemp",
  "merge",
  "app.config.js",
  "npx expo config --type public",
  "npx expo config --type introspect",
  "eas-cli@21.0.0 login",
  "eas-cli@21.0.0 whoami",
  "project:init --id",
  "project:info",
  "credentials:configure-build",
  "successful interactive build",
  "EXPO_TOKEN",
  "eas-cli@21.0.0 config",
  "--non-interactive --freeze-credentials --wait --json",
  "registered device",
  "UDID",
  "Apple Distribution certificate",
  "provisioning profile",
  "Troubleshooting",
  "STOP BEFORE SUBMISSION",
  "DO NOT DEPLOY",
])
  includes(runbook, requiredRunbookTerm, "runbook");
matches(
  runbook,
  /:\s*"\$\{MOBILE_REPO:\?[^"\n]+\}"/,
  "runbook must validate MOBILE_REPO",
);
matches(
  runbook,
  /:\s*"\$\{OWNER_APPROVED_MOBILE_COMMIT:\?[^"\n]+\}"/,
  "runbook must validate approved SHA",
);
matches(
  runbook,
  /:\s*"\$\{EXPO_TOKEN:\?[^"\n]+\}"/,
  "runbook must validate EXPO_TOKEN",
);
matches(
  runbook,
  /build --platform ios --profile preview --wait\b/,
  "runbook preview interactive build",
);
matches(
  runbook,
  /build --platform ios --profile production --wait\b/,
  "runbook production interactive build",
);
matches(
  runbook,
  /build --platform ios --non-interactive --freeze-credentials --wait --json\b/,
  "runbook question-free build",
);
matches(
  runbook,
  /build:configure[^\n]+interactive[^\n]+forbidden in automation/i,
  "runbook build configuration boundary",
);
matches(
  runbook,
  /credentials[^\n]+interactive[^\n]+forbidden in automation/i,
  "runbook credential boundary",
);
const resolvedConfigGate = runbook.indexOf("RESOLVED_EXPO_CONFIG_OK");
const configStage = runbook.indexOf(
  "git --literal-pathspecs add -- app.json app.config.js eas.json",
);
check(
  resolvedConfigGate >= 0 && configStage > resolvedConfigGate,
  "resolved dynamic Expo config must be asserted before app config is staged",
);
includes(runbook, "stop without staging", "dynamic app.config.js recovery");
includes(
  runbook,
  "preserve the incoming `config`, `config.extra`, and `config.ios` fields",
  "dynamic app.config.js recovery",
);
const bootstrapStart = runbook.indexOf(
  "## 3. One-time authorized interactive bootstrap",
);
const bootstrapEnd = runbook.indexOf("## 4.", bootstrapStart);
check(
  bootstrapStart >= 0 && bootstrapEnd > bootstrapStart,
  "runbook must have a bounded bootstrap section",
);
const bootstrap = runbook.slice(bootstrapStart, bootstrapEnd);
includes(bootstrap, "umask 077", "bootstrap evidence permissions");
includes(
  bootstrap,
  'BOOTSTRAP_EVIDENCE_DIR="$(mktemp -d',
  "bootstrap evidence isolation",
);
check(
  !bootstrap.includes("$BACKUP_DIR"),
  "fresh credential-operator shell must not depend on Jarvis BACKUP_DIR",
);
includes(bootstrap, '--limit "$DEVICE_LIMIT"', "device pagination");
includes(bootstrap, '--offset "$DEVICE_OFFSET"', "device pagination");
includes(bootstrap, "APPLE_DEVICES_COMPLETE_OK", "device pagination");
const workflowSectionStart = runbook.indexOf(
  "## 4. Create CI access without exposing the token",
);
const workflowSectionEnd = runbook.indexOf("## 5.", workflowSectionStart);
check(
  workflowSectionStart >= 0 && workflowSectionEnd > workflowSectionStart,
  "runbook must have a bounded workflow-adoption section",
);
const workflowSection = runbook.slice(workflowSectionStart, workflowSectionEnd);
includes(workflowSection, "umask 077", "workflow backup permissions");
includes(
  workflowSection,
  'WORKFLOW_BACKUP_DIR="$(mktemp -d',
  "workflow backup isolation",
);
check(
  !workflowSection.includes("$BACKUP_DIR"),
  "fresh workflow-adoption shell must not depend on config BACKUP_DIR",
);
includes(
  runbook,
  "build.project?.ownerAccount?.name",
  "EAS v21 build owner field",
);
includes(runbook, "build.project?.slug", "EAS v21 build slug field");
includes(
  runbook,
  "build.artifacts?.applicationArchiveUrl",
  "EAS v21 optional application archive field",
);
includes(
  runbook,
  "https://expo.dev/accounts/",
  "deterministic EAS dashboard URL",
);
for (const unsupportedBuildField of [
  "build.buildDetailsPageUrl",
  "build.url",
  "build.artifacts?.buildUrl",
]) {
  check(
    !runbook.includes(unsupportedBuildField),
    `unsupported EAS v21 build field: ${unsupportedBuildField}`,
  );
}
for (const robotRequirement of [
  "Robot user",
  "lowest documented organization role",
  "personal access token breadth",
  "npx --yes eas-cli@21.0.0 whoami",
]) {
  includes(checklist, robotRequirement, "Expo CI identity policy");
}
matches(
  workflow,
  /- name: Preserve the EAS build receipt\n\s+if: always\(\)/,
  "workflow must preserve the receipt after a failed waited build",
);

const urls = deliverables.match(/https:\/\/[^\s)>]+/g) ?? [];
check(
  urls.length >= 8,
  "handoff pack must cite current official setup sources",
);
for (const rawUrl of urls) {
  const url = new URL(rawUrl.replace(/[.,;:]$/, ""));
  check(
    ["docs.expo.dev", "expo.dev", "developer.apple.com"].includes(url.hostname),
    `non-official documentation URL: ${url.href}`,
  );
}

for (const [label, text] of Object.entries({
  easText,
  appText,
  workflow,
  runbook,
  checklist,
})) {
  check(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),
    `${label} contains private-key material`,
  );
  check(
    !/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(
      text,
    ),
    `${label} contains JWT-like material`,
  );
  check(
    !/\b(?:gh[opusr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{12,})\b/.test(
      text,
    ),
    `${label} contains token-like material`,
  );
  check(
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),
    `${label} contains an email address`,
  );
}

console.log(
  `EAS_IOS_HANDOFF_OK checks=${checks} files=${Object.keys(PATHS).length}`,
);
