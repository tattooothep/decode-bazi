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

console.log("NOTIFICATION_DAILY_QUIET_DELAY_OK cases=6");
