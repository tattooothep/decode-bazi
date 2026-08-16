import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import science from "../src/lib/notification-science.cjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.ok(science.SCHEDULER_NAMES.includes("zibai"));
assert.equal(science.SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS.zibai, 600);
const service = readFileSync("ops/systemd/hourkey-mobile-zibai-push.service", "utf8");
const timer = readFileSync("ops/systemd/hourkey-mobile-zibai-push.timer", "utf8");
const scheduler = readFileSync("scripts/mobile-zibai-push-cron.cjs", "utf8");
assert.match(service, /NoNewPrivileges=true/u);
assert.match(service, /ProtectSystem=strict/u);
assert.match(service, /--batch=500/u);
assert.match(service, /--workers=20/u, "the production service must use the same bounded multi-worker path proven by the 10k queue fixture");
assert.match(service, /\/usr\/bin\/node --import tsx/u);
assert.equal(packageJson.dependencies?.tsx, "^4.23.0", "production scheduler loader must be a runtime dependency");
assert.equal(packageJson.devDependencies?.tsx, undefined);
assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00/u);
assert.match(scheduler, /FOR UPDATE SKIP LOCKED LIMIT \$2/u);
assert.match(scheduler, /claimDueBatches\(db, at, BATCH, WORKERS\)/u);
assert.match(scheduler, /forEachBounded\(claims, WORKERS/u);
assert.match(scheduler, /location_expires_at IS NOT NULL AND location_expires_at<=\$1/u);
assert.match(scheduler, /writeSchedulerHeartbeat\("zibai"\)/u);
assert.doesNotMatch(scheduler, /console\.(?:log|error)\([^\n]*(?:latitude|longitude)/u);

console.log("ZIBAI_OPS_CONTRACT_OK");
