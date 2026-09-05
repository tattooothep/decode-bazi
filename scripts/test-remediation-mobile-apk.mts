import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  apkUnsignedContentSha256, assertApkInspection, readOnlyEnvironment, V234,
} from "./verify-remediation-mobile-apk.mts";

let checks = 0;
function test(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
test("child environment preserves only original HOME and fixed safe values", () => {
  const env = readOnlyEnvironment("/usr/bin/unzip", { HOME: "/synthetic/home", API_KEY: "synthetic", NODE_OPTIONS: "--synthetic" });
  assert.deepEqual(env, { HOME: "/synthetic/home", PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC" });
  assert.equal(Object.hasOwn(readOnlyEnvironment("/usr/bin/unzip", {}), "HOME"), false);
  assert.equal(readOnlyEnvironment("/usr/bin/unzip", { HOME: "" }).HOME, "");
});
test("Git disables optional writes, external configuration and network operations", () => {
  const env = readOnlyEnvironment("/usr/bin/git", {});
  for (const [key, value] of Object.entries({ GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "" })) assert.equal(env[key], value);
  const source = readFileSync(new URL("./verify-remediation-mobile-apk.mts", import.meta.url), "utf8");
  assert.ok(source.includes('"core.fsmonitor=false"'));
  assert.ok(source.includes('"core.untrackedCache=false"'));
});
const synthetic = Buffer.alloc(96);
synthetic.writeBigUInt64LE(40n, 16);
synthetic.writeBigUInt64LE(40n, 40);
synthetic.write("APK Sig Block 42", 48, "ascii");
synthetic.writeUInt32LE(0x06054b50, 74);
synthetic.writeUInt32LE(64, 90);
test("original unsigned comparator ignores signing-block payload only", () => {
  const changed = Buffer.from(synthetic); changed[25] = 1;
  assert.equal(apkUnsignedContentSha256(changed), apkUnsignedContentSha256(synthetic));
  changed[0] = 1;
  assert.notEqual(apkUnsignedContentSha256(changed), apkUnsignedContentSha256(synthetic));
});
test("original comparator rejects unsigned ZIP and malformed signing block", () => {
  assert.throws(() => apkUnsignedContentSha256(Buffer.alloc(96)));
  const changed = Buffer.from(synthetic); changed[16] = 41;
  assert.throws(() => apkUnsignedContentSha256(changed));
});
test("unsigned helper is byte-identical to the selected historical function", () => {
  const own = readFileSync(new URL("./verify-remediation-mobile-apk.mts", import.meta.url), "utf8");
  const body = own.slice(own.indexOf("function apkUnsignedContentSha256("), own.indexOf("\n\nexport function assertApkInspection"));
  assert.equal(createHash("sha256").update(body.trim()).digest("hex"),
    "2c24f552f66fc92f14a38aa8d27549879193672dd7e3e2e8063bf8f453ad096e");
});
const good = {
  badging: "package: name='io.hourkey.app' versionCode='234' versionName='1.0.234'\n",
  signature: [
    "Verified using v1 scheme (JAR signing): false",
    "Verified using v2 scheme (APK Signature Scheme v2): true",
    "Verified using v3 scheme (APK Signature Scheme v3): false",
    "Verified using v3.1 scheme (APK Signature Scheme v3.1): false",
    "Verified using v4 scheme (APK Signature Scheme v4): false",
    "Verified for SourceStamp: false", "Number of signers: 1",
    `Signer #1 certificate SHA-256 digest: ${V234.signerSha256}`,
  ].join("\n"),
  inventory: "lib/arm64-v8a/libil2cpp.so\nassets/index.android.bundle\n",
  permissions: ["POST_NOTIFICATIONS", "ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE_LOCATION"]
    .map(name => `uses-permission: name='android.permission.${name}'`).join("\n"),
  manifest: 'A: android:name="com.google.firebase.messaging.default_notification_channel_id"\nA: android:value="hourkey-reminders"\n',
};
test("current internal APK metadata and notification postgates pass", () => assertApkInspection(good, "hourkey-reminders"));
for (const [name, change] of [
  ["wrong version", { badging: good.badging.replace("234'", "233'") }],
  ["wrong signer", { signature: good.signature.replace(V234.signerSha256, "a".repeat(64)) }],
  ["missing signature verification", { signature: good.signature.replace("v2): true", "v2): false") }],
  ["extra signer", { signature: good.signature.replace("signers: 1", "signers: 2") }],
  ["wrong ABI", { inventory: good.inventory + "lib/x86_64/libextra.so\n" }],
  ["no native ABI", { inventory: "assets/index.android.bundle\n" }],
  ["missing notification permission", { permissions: "" }],
  ["wrong default channel", { manifest: good.manifest.replace("hourkey-reminders", "wrong-channel") }],
  ["duplicate default channel", { manifest: good.manifest + good.manifest }],
] as const) test(`rejects ${name}`, () => assert.throws(() => assertApkInspection({ ...good, ...change }, "hourkey-reminders")));
test("recorded V234 inspections satisfy the new parser without re-executing a tool", () => {
  const receipt = JSON.parse(readFileSync("/root/artifacts/hourkey-v234-notification-build-46H3ru/v234-native-comparison-baseline.private.json", "utf8"));
  assert.equal(receipt.unsignedContentSha256, V234.unsignedContentSha256);
  // The existing baseline deliberately did not repeat permission/channel checks.
  assertApkInspection({ ...good, badging: receipt.commands.badging.stdout.text,
    signature: receipt.commands.signature.stdout.text, inventory: receipt.commands.inventory.stdout.text }, "hourkey-reminders");
});
console.log(`remediation mobile APK adapter tests: PASS (${checks} checks; synthetic/retained parser evidence, not a native build)`);
