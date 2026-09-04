import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectHealth } = require("../src/lib/notification-observability.cjs") as {
  collectHealth: (db: unknown, input: Record<string, unknown>) => Promise<Record<string, any>>;
};
const { SCHEDULER_NAMES } = require("../src/lib/notification-science.cjs") as {
  SCHEDULER_NAMES: string[];
};
const cliHealth = require("./notification-health.cjs") as {
  providerReadiness: (env: NodeJS.ProcessEnv) => Record<string, boolean>;
};
const { providerReadiness: routeProviderReadiness } = await import("../src/lib/notification-health-route.ts");

const now = new Date("2026-09-05T03:00:00.000Z");
const heartbeat = {
  workerAt: now.toISOString(),
  schedulers: Object.fromEntries(SCHEDULER_NAMES.map((name) => [name, now.toISOString()])),
};

function fixtureDb(options: {
  inventory?: Record<string, number>;
  terminal?: Record<string, number>;
} = {}) {
  const terminalParameters: unknown[][] = [];
  let inventorySql = "";
  let terminalSql = "";
  return {
    terminalParameters,
    get inventorySql() { return inventorySql; },
    get terminalSql() { return terminalSql; },
    async query(sql: string, parameters: unknown[] = []) {
      if (/AS active_fcm_count/u.test(sql)) {
        inventorySql = sql;
        return { rows: [options.inventory || {}] };
      }
      if (/AS dead_letter_count/u.test(sql)) {
        terminalSql = sql;
        terminalParameters.push(parameters);
        return { rows: [options.terminal || {}] };
      }
      if (/GROUP BY l\.kind,a\.provider,a\.status/u.test(sql)) return { rows: [] };
      return { rows: [{}] };
    },
  };
}

async function health(options: {
  providerReady: Record<string, boolean>;
  inventory?: Record<string, number>;
  terminal?: Record<string, number>;
}) {
  const db = fixtureDb(options);
  const report = await collectHealth(db, {
    now,
    lookbackHours: 24,
    heartbeat,
    providerReady: options.providerReady,
  });
  return { db, report };
}

const noCredentialPath = "/definitely-not-a-real-hourkey-fcm-credential.json";
for (const readiness of [
  cliHealth.providerReadiness({ FCM_SERVICE_ACCOUNT_PATH: noCredentialPath }),
  routeProviderReadiness({ FCM_SERVICE_ACCOUNT_PATH: noCredentialPath }),
]) {
  assert.deepEqual(readiness, { fcm: false, expoIos: false, expoAndroid: false },
    "health readiness is platform-specific and both Expo attestations default false");
}
assert.deepEqual(cliHealth.providerReadiness({
  FCM_SERVICE_ACCOUNT_PATH: noCredentialPath,
  EXPO_IOS_PUSH_READY: "true",
  EXPO_ANDROID_PUSH_READY: "TRUE",
}), { fcm: false, expoIos: true, expoAndroid: false },
"Android Expo readiness accepts only the exact reviewed true attestation");
assert.deepEqual(routeProviderReadiness({
  FCM_SERVICE_ACCOUNT_PATH: noCredentialPath,
  EXPO_IOS_PUSH_READY: "TRUE",
  EXPO_ANDROID_PUSH_READY: "true",
}), { fcm: false, expoIos: false, expoAndroid: true },
"route and CLI use exact, independent Expo platform attestations");

const androidMismatch = await health({
  providerReady: { fcm: true, expoIos: true, expoAndroid: false },
  inventory: {
    active_fcm_count: 1,
    active_expo_ios_count: 1,
    active_expo_android_count: 2,
    active_expo_unknown_count: 0,
  },
});
assert.equal(androidMismatch.report.ok, false,
  "active Android Expo fallback inventory fails health when only iOS Expo is attested");
assert.deepEqual(androidMismatch.report.metrics.readiness.activeProviderCounts, {
  fcm: 1, expoIos: 1, expoAndroid: 2, expoUnknown: 0,
}, "aggregate active inventory remains visible by actual delivery platform");
assert.equal(androidMismatch.report.metrics.readiness.credentialMismatchCount, 1);
assert.ok(androidMismatch.report.reasons.includes("provider_readiness_mismatch"));
assert.match(androidMismatch.db.inventorySql, /platform='ios'.*active_expo_ios_count/su,
  "inventory isolates iOS Expo registrations");
assert.match(androidMismatch.db.inventorySql, /platform='android'.*active_expo_android_count/su,
  "inventory isolates Android Expo fallback registrations");
assert.match(androidMismatch.db.inventorySql, /NOT IN \('android','ios'\).*active_expo_unknown_count/su,
  "inventory retains an explicit fail-closed bucket for unknown Expo platforms");

const allPlatformsReady = await health({
  providerReady: { fcm: true, expoIos: true, expoAndroid: true },
  inventory: {
    active_fcm_count: 1,
    active_expo_ios_count: 1,
    active_expo_android_count: 2,
    active_expo_unknown_count: 0,
  },
});
assert.equal(allPlatformsReady.report.ok, true,
  "independently attested active provider platforms are healthy absent delivery failures");

const iosMismatch = await health({
  providerReady: { fcm: true, expoIos: false, expoAndroid: true },
  inventory: {
    active_fcm_count: 1,
    active_expo_ios_count: 1,
    active_expo_android_count: 2,
    active_expo_unknown_count: 0,
  },
});
assert.equal(iosMismatch.report.metrics.readiness.credentialMismatchCount, 1,
  "iOS Expo readiness fails independently without masking ready Android Expo fallback");

const legacyGenericExpo = await health({
  providerReady: { fcm: true, expo: true },
  inventory: {
    active_fcm_count: 1,
    active_expo_ios_count: 1,
    active_expo_android_count: 1,
    active_expo_unknown_count: 1,
  },
});
assert.equal(legacyGenericExpo.report.metrics.readiness.credentialMismatchCount, 3,
  "legacy generic Expo readiness neither blesses known platforms nor unknown-platform Expo inventory");

const recentInvalidCredentials = await health({
  providerReady: { fcm: true, expoIos: true, expoAndroid: true },
  inventory: {
    active_fcm_count: 1,
    active_expo_ios_count: 1,
    active_expo_android_count: 1,
    active_expo_unknown_count: 0,
  },
  terminal: {
    dead_letter_count: 1,
    invalid_token_count: 0,
    uncertain_count: 0,
    recent_invalid_credentials_count: 1,
  },
});
assert.equal(recentInvalidCredentials.report.ok, false,
  "recent InvalidCredentials fails health even when all active provider platforms are attested");
assert.equal(recentInvalidCredentials.report.metrics.outcomes.recentInvalidCredentialsCount, 1);
assert.ok(recentInvalidCredentials.report.reasons.includes("provider_invalid_credentials"));
assert.deepEqual(recentInvalidCredentials.db.terminalParameters, [["24"]],
  "InvalidCredentials detection keeps the existing bounded terminal-outcome lookback");
assert.match(recentInvalidCredentials.db.terminalSql,
  /last_error='InvalidCredentials'.*updated_at >= now\(\)-\(\$1::text\|\|' hours'\)::interval/su,
  "InvalidCredentials uses the existing recent terminal-outcome window rather than an unbounded query");

console.log("NOTIFICATION_DELIVERY_HEALTH_PLATFORMS_OK");
