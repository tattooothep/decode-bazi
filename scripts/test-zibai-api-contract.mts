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
assert.match(state, /background_location/u, "background callbacks use a separate consent-checked mutation");
assert.match(state, /mutation\.action === "background_location"[\s\S]*!current\.shichen_enabled[\s\S]*zibai_shichen_disabled/u,
  "background location is rejected atomically after shichen opt-out");
assert.match(state, /row\.longitude === null \? NaN/u, "missing longitude never fabricates a Greenwich solar time");
assert.doesNotMatch(route, /latitude|longitude/u, "API response boundary must not mention coordinates");
assert.match(history, /"zibai"/u);
assert.match(pushRoute, /DELETE FROM mobile_zibai_installations/u, "push unregister atomically removes Zi Bai preferences and retained location");
assert.match(pushRoute, /DELETE FROM mobile_zibai_installations z USING mobile_push_tokens t/u, "push ownership transfer removes the prior account's Zi Bai location before enabling the new owner");
assert.match(pushRoute, /deleted_at IS NULL AND is_active IS DISTINCT FROM false[\s\S]*FOR UPDATE/u,
  "push registration rechecks active account state under the shared user lock");
assert.match(sessionRoute, /DELETE FROM mobile_zibai_installations[\s\S]*user_id=\$1/u, "session sign-out deletes the signed-out installation's retained location");
assert.match(deleteRoute, /DELETE FROM mobile_zibai_installations WHERE user_id=\$1/u, "account deletion removes every retained Zi Bai location");
assert.match(devicesRoute, /DELETE FROM mobile_zibai_installations[\s\S]*installation_id<>\$2/u, "sign-out-others removes retained locations for every revoked installation");
assert.match(devicesRoute, /deviceHash\(candidate\.installation_id, row\.ua \|\| ""\)/u,
  "device removal matches installations with the existing portable Node hash contract");
assert.doesNotMatch(devicesRoute, /\bdigest\s*\(/u, "device removal does not require an undeclared PostgreSQL crypto extension");
for (const source of [sessionRoute, deleteRoute, devicesRoute]) {
  assert.match(source, /BEGIN[\s\S]*DELETE FROM mobile_zibai_installations[\s\S]*COMMIT/u,
    "privacy cleanup is required inside the state-changing transaction");
}

console.log("ZIBAI_API_CONTRACT_OK");
