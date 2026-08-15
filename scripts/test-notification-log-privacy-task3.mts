import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const yam = require("./mobile-yam-push-cron.cjs");
const files = [
  "scripts/mobile-yam-push-cron.cjs",
  "scripts/mobile-daily-fortune-push-cron.cjs",
  "scripts/mobile-monthly-report-push-cron.cjs",
  "scripts/mobile-network-morning-push-cron.cjs",
  "scripts/mobile-personal-reminders-cron.cjs",
  "scripts/mobile-auspicious-push-cron.cjs",
  "scripts/mobile-push-retry-worker.cjs",
  "scripts/workers/admin-notify-watcher.mjs",
];

for (const file of files) {
  const loggingLines = readFileSync(file, "utf8").split("\n").filter((line) => /console\.(?:log|error|warn)/u.test(line));
  const logging = loggingLines.join("\n");
  assert.doesNotMatch(logging, /(?:u|user)\.email|user=\$\{|(?:u|user)\.id/u, `${file} logs email or stable user ID`);
  assert.doesNotMatch(logging, /notice\.(?:title|body|payload)|historyCopies|thMsg|first\.(?:title|body)/u, `${file} logs notification copy/payload`);
  assert.doesNotMatch(logging, /(?:e|error)(?:\?\.)?\.message|String\(error|console\.error\([^\n]*,\s*(?:e|error)\b/u,
    `${file} logs raw exception content instead of a fixed error code`);
}

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "task3-log-capture-secret";
const privateEmail = "private.person@example.test";
const privateId = "00000000-0000-4000-8000-000000000799";
const privateFailure = "provider failed with private payload and token";
const user = {
  id: privateId, email: privateEmail, current_org_id: null, session_version: 0,
  profile_id: "30000000-0000-4000-8000-000000000799", has_prefs: true, yam_enabled: true,
  qimen_enabled: false, user_timezone: "Asia/Bangkok", sent_today: 0,
  quiet_start: 0, quiet_end: 0, max_per_day: 10, paused_until: null,
  yam_min_quality: "best", yam_lead_minutes: 60, tokens: [],
};
const captured: string[] = [];
const originalError = console.error;
const originalLog = console.log;
const originalFetch = globalThis.fetch;
console.error = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
console.log = (...args: unknown[]) => { captured.push(args.map(String).join(" ")); };
globalThis.fetch = async () => { throw new Error(privateFailure); };
try {
  await yam.runScheduler({ async query() { return { rows: [user] }; } }, new AbortController().signal);
} finally {
  console.error = originalError;
  console.log = originalLog;
  globalThis.fetch = originalFetch;
}
const output = captured.join("\n");
assert.doesNotMatch(output, new RegExp(privateEmail.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
assert.doesNotMatch(output, new RegExp(privateId, "u"));
assert.doesNotMatch(output, /private payload|token/u);
assert.match(output, /category=yam/u, "runtime errors retain a safe category");
assert.match(output, /error_code=/u, "runtime errors retain a fixed actionable error code");

console.log(`NOTIFICATION_LOG_PRIVACY_TASK3_OK files=${files.length}`);
