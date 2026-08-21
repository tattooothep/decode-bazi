import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/mobile-personal-reminders-cron.cjs", "utf8");

assert.doesNotMatch(source,
  /qimen-notification-advisory|buildQimenCopy|buildQimenProducer|loadQimenLocation|qimenNotice|qimen_enabled|qimen_latitude|qimen_longitude|qimen_location_updated_at/u,
  "personal reminders must not retain a legacy Qimen producer, location path, or preference inventory");
assert.doesNotMatch(source, /\[savedDateNotice\s*,\s*qimenNotice\s*,\s*goalNotice\]/u,
  "personal scheduler must run only saved-date and goal tasks");
assert.match(source, /\[savedDateNotice\s*,\s*goalNotice\]/u,
  "personal scheduler retains saved-date and goal delivery");

console.log("PERSONAL_QIMEN_SEPARATION_OK");
