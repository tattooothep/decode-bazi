import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const daily = require("./mobile-daily-fortune-push-cron.cjs");

assert.equal(daily.effectiveDailyMinute(7 * 60, 21, 8), 8 * 60,
  "a 07:00 daily summary inside 21:00-08:00 quiet hours must be delayed to 08:00");
assert.equal(daily.effectiveDailyMinute(19 * 60 + 30, 8, 21), 21 * 60,
  "an evening summary inside a daytime quiet interval must be delayed to its end");
assert.equal(daily.effectiveDailyMinute(7 * 60, 22, 7), 7 * 60,
  "a summary exactly at quiet-end is already eligible");
assert.equal(daily.effectiveDailyMinute(7 * 60, 0, 0), 7 * 60,
  "equal quiet endpoints mean quiet hours are disabled");
assert.equal(daily.effectiveDailyMinute(19 * 60 + 30, 21, 8), 19 * 60 + 30,
  "a summary outside quiet hours keeps its chosen time");
assert.throws(() => daily.effectiveDailyMinute(-1, 21, 8), /daily_target_minute_invalid/u);
assert.notEqual(daily.dailySchedulerLeaseName("morning"), daily.dailySchedulerLeaseName("evening"),
  "morning and evening cron processes must not suppress each other at the same minute");
assert.equal(daily.dailySchedulerLeaseName("morning"), "daily-fortune-morning");
assert.equal(daily.dailySchedulerLeaseName("evening"), "daily-fortune-evening");
assert.throws(() => daily.dailySchedulerLeaseName("noon"), /daily_slot_invalid/u);
assert.deepEqual(daily.effectiveDailySchedule(19 * 60 + 30, 19, 8), { minute: 8 * 60, dayOffset: 1 },
  "an evening occurrence delayed across midnight retains its original occurrence day");
assert.equal(daily.dailyForecastDate("evening", "2026-08-17", 1), "2026-08-17",
  "the delayed evening summary forecasts the originally intended next day, not one extra day ahead");
assert.equal(daily.dailyForecastDate("evening", "2026-08-16", 0), "2026-08-17");

console.log("NOTIFICATION_DAILY_QUIET_DELAY_OK cases=9");
