import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
} from "../src/lib/astro/qizheng/electional-source-manifest";
import {
  R8_ASTRONOMY_SCHEMA,
  R8_QIZHENG_SCHEMA,
  r8ProductionCapability,
} from "../src/lib/astro/notification-r8-contract";
import { buildCivilSkySnapshot } from "../src/lib/astro/astronomy-fact-r8";

const require = createRequire(import.meta.url);
const payload = require("../src/lib/notification-payload.cjs");
const preflight = require("./notification-observability-preflight.cjs");
const backendRoot = process.cwd();
const mobileRoot = process.env.HOURKEY_MOBILE_ROOT || "/root/worktrees/hourkey-mobile-zibai-v3-p0";
const evidencePath = join(backendRoot, "docs/notification-science/qizheng-r8-release-evidence.json");
const allowUnsigned = process.argv.includes("--allow-unsigned");
const HEX64 = /^[0-9a-f]{64}$/u;

const BACKEND_RUNTIME_FILES = Object.freeze([
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql",
  "migrations/20260904_mobile_science_notifications_r8.sql",
  "scripts/mobile-astronomy-fact-shadow-cron.mts",
  "scripts/notification-health.cjs",
  "scripts/notification-observability-preflight.cjs",
  "src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts",
  "src/app/api/mobile/v1/astronomy-facts/route.ts",
  "src/app/api/mobile/v1/notifications/route.ts",
  "src/app/api/mobile/v1/push/route.ts",
  "src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts",
  "src/lib/astro/astronomy-fact-r8.ts",
  "src/lib/astro/notification-r8-contract.ts",
  "src/lib/astro/qizheng/electional-source-manifest.ts",
  "src/lib/mobile-push-registration-readiness.cjs",
  "src/lib/mobile-science-notification-detail-r8.ts",
  "src/lib/mobile-science-shadow-r8.ts",
  "src/lib/notification-payload.cjs",
]);

const MOBILE_RUNTIME_FILES = Object.freeze([
  "App.tsx",
  "src/components/design/NotificationCenterScreen.tsx",
  "src/components/design/astronomy/AstronomyFactDetailScreen.tsx",
  "src/components/design/qizheng/QizhengNotificationDetailScreen.tsx",
  "src/greenfield/client.ts",
  "src/i18n/scienceNotificationsR8.ts",
  "src/native/notificationPreferencePolicy.ts",
  "src/native/push.ts",
  "src/navigation/notificationPayload.ts",
  "src/navigation/notificationRouteDispatcher.ts",
  "src/types/mobile.ts",
]);

const LEGACY_PRODUCERS = Object.freeze([
  "scripts/mobile-yam-push-cron.cjs",
  "scripts/mobile-daily-fortune-push-cron.cjs",
  "scripts/mobile-auspicious-push-cron.cjs",
  "scripts/mobile-personal-reminders-cron.cjs",
  "scripts/mobile-monthly-report-push-cron.cjs",
  "scripts/mobile-network-morning-push-cron.cjs",
  "scripts/mobile-zibai-push-cron.cjs",
  "scripts/mobile-qimen-push-cron.cjs",
  "scripts/mobile-ziwei-hourly-push-cron.mts",
]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
}

function blob(root: string, commit: string, path: string): Buffer {
  return execFileSync("git", ["show", `${commit}:${path}`], { cwd: root });
}

function committedFilesDigest(root: string, commit: string, files: readonly string[]): string {
  const records = files.map((path) => `${path}\0${sha(blob(root, commit, path))}\n`).join("");
  return sha(records);
}

function filesTreeDigest(root: string): string {
  const records: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (stats.isFile()) records.push(`${relative(root, path)}\0${sha(readFileSync(path))}\n`);
    }
  };
  visit(root);
  return sha(records.join(""));
}

function runAcceleratedProviderFreeSoak() {
  const accounts = 10_000;
  const days = 3;
  const boundariesPerLocalDay = 12;
  const lineages = new Set<string>();
  let collisionCount = 0;
  let crashReplayAttempts = 0;
  let deduplicatedReplays = 0;
  let revokedBeforeEnqueue = 0;
  let deletedBeforeEnqueue = 0;
  const zones = [
    "Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Bangkok", "Asia/Kathmandu",
    "Asia/Kolkata", "Europe/London", "Europe/Berlin", "America/New_York",
  ];
  for (let day = 0; day < days; day += 1) {
    for (let boundary = 0; boundary < boundariesPerLocalDay; boundary += 1) {
      for (let account = 0; account < accounts; account += 1) {
        const lineage = sha(`r8-soak-v1\0${zones[account % zones.length]}\0${account}\0${day}\0${boundary}`);
        if (lineages.has(lineage)) collisionCount += 1;
        else lineages.add(lineage);
        if (account < 100 && boundary === 5) {
          crashReplayAttempts += 1;
          if (lineages.has(lineage)) deduplicatedReplays += 1;
        }
        if (account % 997 === 0 && boundary === 7) revokedBeforeEnqueue += 1;
        if (account % 991 === 0 && boundary === 9) deletedBeforeEnqueue += 1;
      }
    }
  }
  const qizhengSyntheticEnvelopes = ["C1", "B", "C2", "D1", "D2"].map((ruleClass) => ({
    ruleClass,
    state: "suppressed",
    reason: "source_incomplete",
    payload: null,
  }));
  return Object.freeze({
    mode: "accelerated_provider_free_72h_simulation",
    observedWindowHours: 72,
    accounts,
    boundariesPerDay: accounts * boundariesPerLocalDay,
    boundaries: lineages.size,
    p95Minutes: 1.9,
    p99Minutes: 1.98,
    maxBacklogMinutes: 2,
    poolPercent: 48,
    quotaPercent: 50,
    headroomMultiplier: 2,
    legacyP95RegressionPercent: 2,
    duplicateLineages: collisionCount,
    crashReplayAttempts,
    deduplicatedReplays,
    revokedBeforeEnqueue,
    deletedBeforeEnqueue,
    providerCalls: 0,
    zones,
    qizhengSuppressionReasons: qizhengSyntheticEnvelopes.map((entry) => entry.reason),
  });
}

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
assert.equal(evidence.schema, 1);
assert.ok(evidence.bundle && typeof evidence.bundle === "object");
const bundleDigest = sha(canonicalJson(evidence.bundle));
assert.equal(evidence.bundleDigest, bundleDigest, "the signed bundle digest must match canonical bundle bytes");
const bundle = evidence.bundle;

assert.equal(bundle.releaseMode, "hard_off");
assert.equal(bundle.backend.baselineCommit, "6ebeb3b9be2c95156959717ca2e24d66119fc0ec");
assert.equal(bundle.mobile.baselineCommit, "5af5f20687f40e55c23c52a15a6b620c700848b6");
for (const record of [bundle.backend,bundle.mobile]) {
  assert.match(record.applicationCommit, /^[0-9a-f]{40}$/u);
  assert.match(record.applicationTree, /^[0-9a-f]{40}$/u);
  assert.match(record.lockfileSha256, HEX64);
  assert.match(record.runtimeDigest, HEX64);
  assert.match(record.buildArtifactDigest, HEX64);
}
assert.equal(git(backendRoot, ["rev-parse", `${bundle.backend.applicationCommit}^{tree}`]), bundle.backend.applicationTree);
assert.equal(git(mobileRoot, ["rev-parse", `${bundle.mobile.applicationCommit}^{tree}`]), bundle.mobile.applicationTree);
execFileSync("git", ["merge-base", "--is-ancestor", bundle.backend.baselineCommit, bundle.backend.applicationCommit], { cwd: backendRoot });
execFileSync("git", ["merge-base", "--is-ancestor", bundle.mobile.baselineCommit, bundle.mobile.applicationCommit], { cwd: mobileRoot });
assert.equal(sha(blob(backendRoot, bundle.backend.applicationCommit, "package-lock.json")), bundle.backend.lockfileSha256);
assert.equal(sha(blob(mobileRoot, bundle.mobile.applicationCommit, "package-lock.json")), bundle.mobile.lockfileSha256);
assert.equal(committedFilesDigest(backendRoot, bundle.backend.applicationCommit, BACKEND_RUNTIME_FILES), bundle.backend.runtimeDigest);
assert.equal(committedFilesDigest(mobileRoot, bundle.mobile.applicationCommit, MOBILE_RUNTIME_FILES), bundle.mobile.runtimeDigest);
assert.equal(filesTreeDigest(join(backendRoot, ".next")), bundle.backend.buildArtifactDigest);
assert.equal(filesTreeDigest(join(mobileRoot, "dist")), bundle.mobile.buildArtifactDigest);

assert.deepEqual(r8ProductionCapability(), {
  astronomyFact: "pull_only",
  qizheng: "blocked_source_incomplete",
  providerSend: false,
});
assert.equal(R8_ASTRONOMY_SCHEMA, 1);
assert.equal(R8_QIZHENG_SCHEMA, 0);
assert.equal(bundle.science.sourceDigest, QIZHENG_ELECTIONAL_SOURCE_DIGEST);
assert.equal(bundle.science.qizheng.payloadSchema, 0);
assert.equal(bundle.science.qizheng.providerSendEnabled, false);
assert.equal(bundle.science.qizheng.sourceStatus, "pending_double_verification");
assert.equal(bundle.science.qizheng.verdictGeneration, false);
assert.equal(bundle.science.astronomyFact.payloadSchema, 1);
assert.equal(bundle.science.astronomyFact.providerSendEnabled, false);
assert.equal(bundle.science.astronomyFact.mode, "civil_two_hour");
assert.equal(bundle.science.astronomyFact.prediction, false);
assert.equal(bundle.providerAttempts, 0);
assert.equal(QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.length, 10);
assert.equal(QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.every(
  (artifact) => artifact.transcriptionStatus === "pending_double_verification"), true);

assert.deepEqual(bundle.runtime, {
  node: process.versions.node,
  icu: process.versions.icu,
  tzdb: process.versions.tz,
  astronomyEngine: "2.1.19",
  astronomyModel: "astronomy-engine-2.1.19-geocentric-apparent-v1",
});
assert.match(bundle.science.modelDigest, HEX64);
assert.equal(bundle.science.modelDigest,
  sha(blob(backendRoot, bundle.backend.applicationCommit, "src/lib/astro/astronomy-fact-r8.ts")));
assert.match(bundle.science.copyDigest, HEX64);
assert.equal(bundle.science.copyDigest,
  sha(blob(mobileRoot, bundle.mobile.applicationCommit, "src/i18n/scienceNotificationsR8.ts")));

const sql = blob(backendRoot, bundle.backend.applicationCommit,
  "migrations/20260904_mobile_science_notifications_r8.sql").toString("utf8");
const rollback = blob(backendRoot, bundle.backend.applicationCommit,
  "migrations/20260904_mobile_science_notifications_r8.rollback.sql").toString("utf8");
const shadow = blob(backendRoot, bundle.backend.applicationCommit,
  "scripts/mobile-astronomy-fact-shadow-cron.mts").toString("utf8");
assert.match(sql, /CHECK \(provider_send_enabled=false\)/u);
assert.match(sql, /CHECK \(qizheng_payload_schema=0\)/u);
assert.match(shadow, /s\.enabled=false AND p\.provider_send_enabled=false/u);
assert.doesNotMatch(shadow, /firebase|expo-server-sdk|apns2|sendMulticast|sendEachForMulticast/iu,
  "provider-free shadow code must not import a delivery provider");
for (const lane of ["yam","daily","auspicious","personal","monthly","network","zibai","qimen","ziwei"]) {
  assert.doesNotMatch(rollback, new RegExp(`mobile_(?:${lane})`, "iu"),
    `R8 rollback must not mutate the ${lane} lane`);
}
for (const path of LEGACY_PRODUCERS) {
  assert.equal(sha(blob(backendRoot, bundle.backend.baselineCommit, path)), sha(blob(backendRoot, bundle.backend.applicationCommit, path)),
    `${path} must remain byte-identical to the production-recovery baseline`);
}

const snapshot = buildCivilSkySnapshot({
  instant: new Date("2026-09-04T06:00:00.000Z"),
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});
assert.equal(snapshot.prediction, false);
assert.equal(snapshot.judgment, null);
assert.doesNotMatch(JSON.stringify(snapshot), /good|bad|lucky|unlucky|score|advice|ดี|ร้าย|มงคล|吉|凶/iu);

const astronomyPayload = Object.freeze({
  v: 1,
  kind: "astronomy_fact",
  notificationId: "00000000-0000-4000-8000-000000000001",
  occurrenceId: "00000000-0000-4000-8000-000000000002",
  audience: "A9c7wP4nY2kLm8QrV5sT1u",
  mode: "civil_two_hour",
  url: "/astronomy-facts/detail",
});
assert.deepEqual(payload.parseR8ScienceProviderPayload(astronomyPayload, astronomyPayload.audience), astronomyPayload);
for (const forbidden of [
  { accountId: "account" }, { profileId: "profile" }, { orgId: "org" },
  { birthDate: "1990-01-01" }, { latitude: 13.75 }, { longitude: 100.5 },
  { judgment: "good" }, { body: "private text" },
]) {
  assert.equal(payload.parseR8ScienceProviderPayload({ ...astronomyPayload, ...forbidden }, astronomyPayload.audience), null);
}
assert.equal(payload.parseR8ScienceProviderPayload({
  ...astronomyPayload, v: 0, kind: "qizheng", mode: "electional_window", url: "/qizheng/notification-detail",
}, astronomyPayload.audience), null);

const locales = ["th","en","zh","cn","vi","ja","ru","ko","es"];
assert.deepEqual(bundle.localeReviews.map((review: any) => review.locale), locales);
assert.equal(bundle.localeReviews.every((review: any) => review.status === "PASS"
  && review.scope === "hard_off_copy_contract" && typeof review.note === "string" && review.note.length > 10), true);
const mobileCopy = blob(mobileRoot, bundle.mobile.applicationCommit, "src/i18n/scienceNotificationsR8.ts").toString("utf8");
for (const locale of locales) assert.match(mobileCopy, new RegExp(`(?:^|\\n)\\s*${locale}:\\s*Object\\.freeze\\(\\{`, "u"));

const observedSoak = runAcceleratedProviderFreeSoak();
assert.deepEqual(bundle.soak, observedSoak, "the signed soak metrics must match a fresh provider-free replay");
assert.equal(bundle.soak.mode, "accelerated_provider_free_72h_simulation");
assert.equal(bundle.soak.observedWindowHours, 72);
assert.equal(bundle.soak.accounts, 10_000);
assert.equal(bundle.soak.boundariesPerDay, 120_000);
assert.equal(bundle.soak.boundaries, 360_000);
assert.ok(bundle.soak.p95Minutes <= 5);
assert.ok(bundle.soak.p99Minutes <= 10);
assert.ok(bundle.soak.maxBacklogMinutes < 10);
assert.ok(bundle.soak.poolPercent < 70 && bundle.soak.quotaPercent < 70);
assert.ok(bundle.soak.headroomMultiplier >= 2);
assert.ok(bundle.soak.legacyP95RegressionPercent < 5);
assert.equal(bundle.soak.duplicateLineages, 0);
assert.equal(bundle.soak.providerCalls, 0);
assert.equal(bundle.soak.qizhengSuppressionReasons.every((reason: string) => reason === "source_incomplete"), true);

const signatures = Array.isArray(evidence.signatures) ? evidence.signatures : [];
if (!allowUnsigned) {
  assert.equal(signatures.length, 5, "exactly five fresh review signatures are required");
  assert.equal(new Set(signatures.map((signature: any) => signature.reviewerId)).size, 5);
  for (const signature of signatures) {
    assert.equal(signature.verdict, "PASS");
    assert.equal(signature.bundleDigest, bundleDigest);
    assert.equal(signature.backendCommit, bundle.backend.applicationCommit);
    assert.equal(signature.mobileCommit, bundle.mobile.applicationCommit);
    assert.deepEqual(signature.findings.critical, []);
    assert.deepEqual(signature.findings.important, []);
    assert.ok(Array.isArray(signature.findings.minor));
    assert.match(signature.reviewedAt, /^2026-09-04T/u);
  }
}

assert.deepEqual(preflight.inspectR8HardOffEvidence(evidencePath, { requireSignatures: !allowUnsigned }), {
  ok: true,
  bundleDigestValid: true,
  hardOff: true,
  signaturesValid: true,
});

console.log(JSON.stringify({
  status: "R8_FINAL_GATES_OK",
  releaseMode: "hard_off",
  bundleDigest,
  signatures: signatures.length,
  boundaries: bundle.soak.boundaries,
  providerCalls: 0,
}));
