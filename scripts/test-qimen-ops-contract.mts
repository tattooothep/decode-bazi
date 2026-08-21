import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import science from "../src/lib/notification-science.cjs";
import sourceManifest from "../src/lib/qimen-canonical-source-manifest.cjs";

assert.ok(science.SCHEDULER_NAMES.includes("qimen"));
assert.ok(science.SCHEDULER_LEASE_NAMES.includes("qimen"));
assert.equal(science.SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS.qimen, 180);
assert.equal(sourceManifest.loadCanonicalSourceManifest().producerEnabled, false,
  "source-incomplete Qimen production remains disabled even when the timer is installed");

const service = readFileSync("ops/systemd/hourkey-mobile-qimen-push.service", "utf8");
const timer = readFileSync("ops/systemd/hourkey-mobile-qimen-push.timer", "utf8");
const scheduler = readFileSync("scripts/mobile-qimen-push-cron.cjs", "utf8");
const migration = readFileSync("migrations/20260821_mobile_qimen_three_layer.sql", "utf8");
const preflight = readFileSync("scripts/notification-observability-preflight.cjs", "utf8");

assert.match(service, /^WorkingDirectory=\/root\/releases\/current$/mu);
assert.match(service, /^ExecStart=\/usr\/bin\/node --import tsx \/root\/releases\/current\/scripts\/mobile-qimen-push-cron\.cjs --batch=500 --workers=20$/mu);
assert.match(service, /^TimeoutStartSec=55$/mu);
assert.match(service, /^NoNewPrivileges=true$/mu);
assert.match(service, /^ProtectSystem=strict$/mu);
assert.match(service, /^ReadWritePaths=\/var\/lib\/hourkey-notification$/mu);
assert.match(timer, /^OnCalendar=\*-\*-\* \*:\*:00$/mu);
assert.match(timer, /^AccuracySec=1s$/mu);
assert.match(timer, /^Persistent=true$/mu);
assert.match(migration, /FOR UPDATE SKIP LOCKED/u);
assert.match(scheduler, /withSchedulerRunLease\(db, "qimen"/u);
assert.match(scheduler, /writeSchedulerHeartbeat\("qimen"\)/u);
assert.doesNotMatch(scheduler, /mobile-(?:yam|zibai|personal-reminders)-push/iu);
assert.doesNotMatch(scheduler, /console\.(?:log|error)\([^\n]*(?:latitude|longitude)/u);
assert.match(preflight, /mobile-qimen-push-cron\.cjs/u);
assert.match(preflight, /hourkey-mobile-qimen-push\.service/u);

console.log("QIMEN_OPS_CONTRACT_OK");
