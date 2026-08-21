import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const prefs = readFileSync("src/lib/mobile-notification-preferences.ts", "utf8");
assert.match(route, /qimenPayloadSchema/u);
assert.match(route, /qimen_payload_schema/u);
assert.match(route, /qimenPayloadSchema === 1 \|\| qimenPayloadSchema === 2/u);
assert.match(route, /DELETE FROM mobile_qimen_installations[\s\S]{0,240}?t\.user_id<>\$1/u,
  "account transfer removes the prior owner's Qimen installation before token reassignment");
assert.match(route, /DELETE FROM mobile_qimen_installations[\s\S]{0,180}?WHERE user_id=\$1/u,
  "push unregister removes Qimen scheduler ownership for that installation");
assert.match(route, /qimen_payload_schema=EXCLUDED\.qimen_payload_schema/u);
assert.match(prefs, /INSERT INTO mobile_qimen_installations/u,
  "saving Qimen consent/location immediately creates or refreshes the per-installation due rows");
assert.match(prefs, /qimen_location_updated_at\+interval '7 days'/u);

console.log("QIMEN_PUSH_REGISTRATION_OK");
