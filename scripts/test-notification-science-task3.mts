import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const science = require("../src/lib/notification-science.cjs");

let checks = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    checks += 1;
    console.log(`  ok ${name}`);
  });
}

await check("Qimen highlight support never reads location or fetches when consent is false", async () => {
  let fetches = 0;
  const location = new Proxy({}, {
    get() { throw new Error("disabled Qimen must not read location"); },
  });
  const result = await science.yamQimenHighlight({
    qimenEnabled: false,
    location,
    fetchHighlight: async () => { fetches += 1; return { direction: "N" }; },
  });
  assert.equal(result, null);
  assert.equal(fetches, 0);
});

await check("Qimen scheduler and gate share the same IANA timezone and instant", () => {
  const fixtures = [
    ["Asia/Bangkok", "2026-08-15T01:05:00.000Z", "2026-08-15", "08:05"],
    ["Asia/Tokyo", "2026-08-14T23:05:00.000Z", "2026-08-15", "08:05"],
    ["America/New_York", "2026-03-08T06:59:00.000Z", "2026-03-08", "01:59"],
    ["America/New_York", "2026-03-08T07:01:00.000Z", "2026-03-08", "03:01"],
    ["America/New_York", "2026-11-01T05:30:00.000Z", "2026-11-01", "01:30"],
  ];
  for (const [timezone, iso, date, time] of fixtures) {
    const request = science.buildQimenSchedulerRequest({
      timezone, instant: new Date(iso), latitude: 13.75, longitude: 100.5,
    });
    assert.deepEqual(request, {
      date, time, timezone, instant: iso,
      lat: 13.75, lng: 100.5, purpose: "travel", school: "chaibu", system_type: "hour",
    });
    assert.deepEqual(science.qimenGateClock(request.timezone, new Date(request.instant)), { date, time });
  }
});

await check("each goal request uses its own bound profile and user's local date", () => {
  const goals = [
    { id: "goal-a", profileId: "profile-new", activityKey: "launch" },
    { id: "goal-b", profileId: "profile-other", activityKey: "travel" },
  ];
  const requests = science.buildGoalScienceRequests(goals, "America/New_York", new Date("2026-08-15T02:00:00Z"));
  assert.deepEqual(requests.map((r: any) => [r.goalId, r.profileId, r.date]), [
    ["goal-a", "profile-new", "2026-08-14"],
    ["goal-b", "profile-other", "2026-08-14"],
  ]);
  assert.equal(JSON.stringify(requests).includes("oldest"), false);
});

await check("saved-date due selection is not shadowed by an earlier non-due future row", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const selected = science.selectDueSavedDate([
    { id: "future-not-due", start: "2026-08-15T05:00:00Z" },
    { id: "due-24h", start: "2026-08-16T00:03:00Z" },
    { id: "due-1h", start: "2026-08-15T01:03:00Z" },
  ], now);
  assert.equal(selected.id, "due-1h");
  assert.equal(selected.lead, "1h");
});

await check("daily calls use one total deadline even when a call never resolves", async () => {
  const started = Date.now();
  await assert.rejects(
    science.withTotalTimeout(async () => new Promise(() => {}), 25),
    /notification_internal_timeout/,
  );
  assert.ok(Date.now() - started < 250);
});

await check("all heartbeat and execution scheduler names have stable advisory lease keys", () => {
  assert.deepEqual(science.SCHEDULER_NAMES, [
    "yam", "daily-fortune", "auspicious", "personal-reminders", "monthly-report", "network-morning", "zibai", "qimen",
  ]);
  assert.deepEqual(science.SCHEDULER_LEASE_NAMES, [
    "yam", "daily-fortune-morning", "daily-fortune-evening", "auspicious",
    "personal-reminders", "monthly-report", "network-morning", "zibai", "qimen",
  ]);
  assert.equal(new Set(science.SCHEDULER_LEASE_NAMES.map(science.schedulerLeaseKey)).size, 9);
});

await check("all scheduler entrypoints acquire their named DB run lease", () => {
  const files = {
    yam: "scripts/mobile-yam-push-cron.cjs",
    auspicious: "scripts/mobile-auspicious-push-cron.cjs",
    "personal-reminders": "scripts/mobile-personal-reminders-cron.cjs",
    "monthly-report": "scripts/mobile-monthly-report-push-cron.cjs",
    "network-morning": "scripts/mobile-network-morning-push-cron.cjs",
    zibai: "scripts/mobile-zibai-push-cron.cjs",
    qimen: "scripts/mobile-qimen-push-cron.cjs",
  };
  for (const [name, file] of Object.entries(files)) {
    assert.match(readFileSync(file, "utf8"), new RegExp(`(?:try|with)SchedulerRunLease\\(db, ["']${name}["']`));
  }
  const daily = require("../scripts/mobile-daily-fortune-push-cron.cjs");
  assert.equal(daily.dailySchedulerLeaseName("morning"), "daily-fortune-morning");
  assert.equal(daily.dailySchedulerLeaseName("evening"), "daily-fortune-evening");
  assert.notEqual(science.schedulerLeaseKey(daily.dailySchedulerLeaseName("morning")),
    science.schedulerLeaseKey(daily.dailySchedulerLeaseName("evening")));
});

await check("scheduler adapters wire consent, timezone, bound goals, due rows, and total deadline", () => {
  const yam = readFileSync("scripts/mobile-yam-push-cron.cjs", "utf8");
  assert.doesNotMatch(yam, /qimen-notification-advisory|yamQimenHighlight|qimenNotificationEntitlement|qimen_enabled/u);
  const yamInventory = /const YAM_USERS_SQL = `([\s\S]*?)`;/u.exec(yam)?.[1] || "";
  assert.doesNotMatch(yamInventory, /qimen_/u);
  const personal = readFileSync("scripts/mobile-personal-reminders-cron.cjs", "utf8");
  assert.doesNotMatch(personal, /goals\/custom\$\{user\.profile_id/u);
  assert.match(personal, /timezone:\s*user\.user_timezone/u);
  assert.match(personal, /interval '45 minutes'[\s\S]+interval '75 minutes'[\s\S]+interval '23 hours 45 minutes'/u);
  assert.match(personal, /fetchCanonicalQimenAdvisory\(request\)/u);
  assert.doesNotMatch(personal, /getJson\(user, `\$\{BASE\}\/api\/qimen/u);
  assert.doesNotMatch(yam, /fetchCanonicalQimenAdvisory/u);
  const daily = readFileSync("scripts/mobile-daily-fortune-push-cron.cjs", "utf8");
  assert.match(daily, /withTotalTimeout/u);
  const qimenRoute = readFileSync("src/app/api/qimen/route.ts", "utf8");
  assert.match(qimenRoute, /gateQimenRequest\(date, time, timezone, instant\)/u);
  assert.match(qimenRoute, /timeZone:\s*timezone/u);
});

console.log(`NOTIFICATION_SCIENCE_TASK3_OK checks=${checks}`);
