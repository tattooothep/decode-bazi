import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/mobile/v1/zibai/route.ts", "utf8");
const state = readFileSync("src/lib/mobile-zibai-installation.ts", "utf8");
const history = readFileSync("src/app/api/mobile/v1/notifications/route.ts", "utf8");
const pushRoute = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const sessionRoute = readFileSync("src/app/api/mobile/v1/session/route.ts", "utf8");
const deleteRoute = readFileSync("src/app/api/mobile/v1/account/delete/route.ts", "utf8");
const devicesRoute = readFileSync("src/app/api/account/devices/route.ts", "utf8");

assert.match(route, /getMobileSession\(req\)/u);
assert.match(route, /rateLimit\(`mobile-zibai:/u);
assert.match(route, /parseZibaiMutation/u);
assert.match(route, /mutateZibaiInstallation\(pool, auth\.session\.userId/u);
assert.match(state, /mobile_push_tokens[\s\S]*user_id=\$1 AND installation_id=\$2 AND enabled=true FOR UPDATE/u);
assert.match(state, /location_expires_at[\s\S]*MAX_LOCATION_RETENTION_MS/u);
assert.match(state, /MAX_LOCATION_AGE_MS/u);
assert.match(state, /shichen_enabled=false,next_shichen_at=NULL/u);
assert.doesNotMatch(route, /latitude|longitude/u, "API response boundary must not mention coordinates");
assert.match(history, /"zibai"/u);
assert.match(pushRoute, /DELETE FROM mobile_zibai_installations/u, "push unregister atomically removes Zi Bai preferences and retained location");
assert.match(pushRoute, /DELETE FROM mobile_zibai_installations z USING mobile_push_tokens t/u, "push ownership transfer removes the prior account's Zi Bai location before enabling the new owner");
assert.match(sessionRoute, /DELETE FROM mobile_zibai_installations[\s\S]*user_id=\$1/u, "session sign-out deletes the signed-out installation's retained location");
assert.match(deleteRoute, /DELETE FROM mobile_zibai_installations WHERE user_id=\$1/u, "account deletion removes every retained Zi Bai location");
assert.match(devicesRoute, /DELETE FROM mobile_zibai_installations[\s\S]*installation_id<>\$2/u, "sign-out-others removes retained locations for every revoked installation");

console.log("ZIBAI_API_CONTRACT_OK");
