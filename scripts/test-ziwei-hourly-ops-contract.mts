import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import science from "../src/lib/notification-science.cjs";

assert.ok(science.SCHEDULER_NAMES.includes("ziwei-hourly"));
assert.ok(science.SCHEDULER_LEASE_NAMES.includes("ziwei-hourly"));
assert.equal(science.SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS["ziwei-hourly"], 180);

const service = readFileSync("ops/systemd/hourkey-mobile-ziwei-hourly-push.service", "utf8");
const timer = readFileSync("ops/systemd/hourkey-mobile-ziwei-hourly-push.timer", "utf8");
const sysusers = readFileSync("ops/sysusers.d/hourkey-notification.conf", "utf8");
const tmpfiles = readFileSync("ops/tmpfiles.d/hourkey-notification.conf", "utf8");
const scheduler = readFileSync("scripts/mobile-ziwei-hourly-push-cron.mts", "utf8");
const preflight = readFileSync("scripts/notification-observability-preflight.cjs", "utf8");

assert.match(service, /^WorkingDirectory=\/root\/releases\/current$/mu);
assert.match(service, /^ExecStart=\/usr\/bin\/env FCM_SERVICE_ACCOUNT_PATH=\/etc\/hourkey\/credentials\/fcm-service-account\.json \/usr\/bin\/node --import tsx \/root\/releases\/current\/scripts\/mobile-ziwei-hourly-push-cron\.mts$/mu);
assert.match(service, /^User=hourkey-notify$/mu);
assert.match(service, /^Group=hourkey-notify$/mu);
assert.doesNotMatch(service, /^(?:User|Group)=root$/mu);
assert.match(service, /^CapabilityBoundingSet=$/mu);
assert.match(service, /^AmbientCapabilities=$/mu);
assert.match(service, /^ProtectProc=invisible$/mu);
assert.match(service, /^ProcSubset=pid$/mu);
assert.doesNotMatch(service, /^Environment=FCM_SERVICE_ACCOUNT_PATH=/mu,
  "the shared EnvironmentFile must not be able to win over a weaker Environment assignment");
assert.match(service, /^StateDirectoryMode=0750$/mu);
assert.match(service, /^LogsDirectory=hourkey$/mu);
assert.match(sysusers, /^u hourkey-notify - "HourKey notification scheduler" \/nonexistent \/usr\/sbin\/nologin$/mu);
assert.match(tmpfiles, /^d \/var\/lib\/hourkey-notification 0750 hourkey-notify hourkey-notify -$/mu);
assert.match(tmpfiles, /^d \/var\/log\/hourkey 0750 hourkey-notify hourkey-notify -$/mu);
assert.match(tmpfiles, /^d \/etc\/hourkey 0750 root hourkey-notify -$/mu,
  "the service account must be able to traverse the credential parent without reading hourkey.env");
assert.match(tmpfiles, /^z \/etc\/hourkey\/credentials\/fcm-service-account\.json 0640 root hourkey-notify -$/mu,
  "the provisioned credential must be group-readable only by the notification service account");
assert.match(service, /^TimeoutStartSec=55$/mu);
assert.match(service, /^NoNewPrivileges=true$/mu);
assert.match(service, /^ProtectSystem=strict$/mu);
assert.match(service, /^ReadWritePaths=\/var\/lib\/hourkey-notification$/mu);
assert.match(timer, /^OnCalendar=\*-\*-\* \*:\*:00$/mu);
assert.match(timer, /^AccuracySec=1s$/mu);
assert.match(timer, /^Persistent=true$/mu);
assert.match(scheduler, /claim_mobile_ziwei_hourly_installations/u);
assert.match(scheduler, /withSchedulerRunLease\(\s*db,\s*"ziwei-hourly"/u);
assert.match(scheduler, /writeSchedulerHeartbeat\("ziwei-hourly"\)/u);
assert.match(scheduler, /if \(process\.env\.NODE_ENV === "production"\) return;/u,
  "the non-root production worker must not attempt to read the root-owned release .env.local");
assert.doesNotMatch(scheduler, /console\.(?:log|error)\([^\n]*(?:birth_lat|birth_lng|birth_wall)/u);
assert.match(preflight, /mobile-ziwei-hourly-push-cron\.mts/u);
assert.match(preflight, /hourkey-mobile-ziwei-hourly-push\.service/u);
assert.match(preflight, /hourkey-notify/u);
assert.match(preflight, /ziweiServiceAccess/u);

console.log("PASS Ziwei hourly ops contract — minute timer, lease, heartbeat, hardened service, preflight");
