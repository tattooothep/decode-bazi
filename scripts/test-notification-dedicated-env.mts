import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const helper = require("./derive-hourkey-notification-env.cjs");
const privatePassword = "private-password-with-#-marker";
const source = [
  "PGHOST=127.0.0.1",
  "PGPORT=5433",
  "PGDATABASE=decode_db",
  "PGUSER=hourkey_app",
  `PGPASSWORD=${privatePassword}`,
  "EXPO_PUSH_ACCESS_TOKEN=private-expo-token",
  "ZIWEI_HOURLY_PRODUCER_ENABLED=1",
  `HOURKEY_RELEASE_COMMIT=${"a".repeat(40)}`,
  "EXPO_IOS_PUSH_READY=false",
  "NOTIFICATION_SCHEDULER_HEARTBEAT_DIR=/var/lib/hourkey-notification/schedulers",
  "HOURKEY_INTERNAL_JOB_TOKEN=must-not-copy",
  "NEXTAUTH_SECRET=must-not-copy",
  "FCM_SERVICE_ACCOUNT_PATH=/root/shared-secret-path",
].join("\n");

const derived = helper.deriveEnvironmentText(source);
assert.deepEqual(derived.keys, [
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "EXPO_PUSH_ACCESS_TOKEN",
  "ZIWEI_HOURLY_PRODUCER_ENABLED", "HOURKEY_RELEASE_COMMIT", "EXPO_IOS_PUSH_READY",
  "NOTIFICATION_SCHEDULER_HEARTBEAT_DIR",
]);
for (const allowed of derived.keys) assert.match(derived.text, new RegExp(`^${allowed}=`, "mu"));
for (const excluded of ["HOURKEY_INTERNAL_JOB_TOKEN", "NEXTAUTH_SECRET", "FCM_SERVICE_ACCOUNT_PATH", "must-not-copy", "/root/shared-secret-path"]) {
  assert.equal(derived.text.includes(excluded), false, `dedicated environment excludes ${excluded}`);
}
assert.equal(derived.text.includes(privatePassword), true, "derivation preserves an allowed value without evaluating it");
assert.throws(() => helper.deriveEnvironmentText("PGHOST=127.0.0.1\n"), /invalid notification environment contract/u,
  "the installer cannot atomically replace the target with an empty or partial contract");
assert.throws(() => helper.deriveEnvironmentText(source.replace("a".repeat(40), "short")), /invalid notification environment contract/u,
  "the release provenance must be an exact lowercase 40-hex commit");
assert.throws(() => helper.deriveEnvironmentText(source.replace("PGUSER=hourkey_app", "PGUSER=decode_user")), /invalid notification environment contract/u,
  "the dedicated notification environment must connect as exactly hourkey_app");
assert.throws(() => helper.deriveEnvironmentText(source.replace("EXPO_IOS_PUSH_READY=false", "EXPO_IOS_PUSH_READY=TRUE")), /invalid notification environment contract/u,
  "Expo iOS readiness accepts only exact true/false values");
assert.equal(helper.validateInstalledEnvironment(derived.text, {
  uid: 0, gid: 4040, mode: 0o640, expectedGid: 4040, regularFile: true,
}), true, "preflight accepts the exact root:hourkey-notify 0640 contract");
for (const invalid of [
  { uid: 1, gid: 4040, mode: 0o640, expectedGid: 4040, regularFile: true },
  { uid: 0, gid: 4041, mode: 0o640, expectedGid: 4040, regularFile: true },
  { uid: 0, gid: 4040, mode: 0o644, expectedGid: 4040, regularFile: true },
  { uid: 0, gid: 4040, mode: 0o640, expectedGid: 4040, regularFile: false },
]) assert.equal(helper.validateInstalledEnvironment(derived.text, invalid), false,
  "preflight rejects an owner, group, mode, or file-type mismatch");
assert.equal(helper.validateInstalledEnvironment(derived.text.replace("PGPASSWORD=", "UNRELATED_SECRET=x\nPGPASSWORD="), {
  uid: 0, gid: 4040, mode: 0o640, expectedGid: 4040, regularFile: true,
}), false, "preflight rejects an installed file with any unreviewed key");

const helperSource = readFileSync("scripts/derive-hourkey-notification-env.cjs", "utf8");
assert.match(helperSource, /chownSync\([^\n]+,\s*0,\s*groupId\)/u,
  "the installer assigns root ownership and the resolved hourkey-notify group");
assert.match(helperSource, /chmodSync\([^\n]+,\s*0o640\)/u,
  "the installed dedicated environment is mode 0640");
assert.match(helperSource, /renameSync/u, "installation uses an atomic final rename");
assert.doesNotMatch(helperSource, /console\.(?:log|error)\([^\n]*(?:value|text|source|PGPASSWORD|EXPO_PUSH_ACCESS_TOKEN)/u,
  "the helper never logs environment values or source text");

console.log("NOTIFICATION_DEDICATED_ENV_OK");
