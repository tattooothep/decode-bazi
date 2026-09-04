import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
const prefs = readFileSync("src/lib/mobile-notification-preferences.ts", "utf8");
assert.match(route, /qimenPayloadSchema/u);
assert.match(route, /qimen_payload_schema/u);
assert.match(route, /qimenPayloadSchema === 1 \|\| qimenPayloadSchema === 2 \|\| qimenPayloadSchema === 3 \|\| qimenPayloadSchema === 4/u);
assert.match(route, /\$3::smallint IN \(3,4\)/u,
  "only a schema-3 or schema-4 registration enables its compatible Qimen occurrence flow");
assert.match(route, /DELETE FROM mobile_qimen_installations[\s\S]{0,240}?t\.user_id<>\$1/u,
  "account transfer removes the prior owner's Qimen installation before token reassignment");
assert.match(route, /DELETE FROM mobile_qimen_installations[\s\S]{0,180}?WHERE user_id=\$1/u,
  "push unregister removes Qimen scheduler ownership for that installation");
assert.match(route, /qimen_payload_schema=EXCLUDED\.qimen_payload_schema/u);
assert.match(prefs, /INSERT INTO mobile_qimen_installations/u,
  "saving Qimen consent/location immediately creates or refreshes the per-installation due rows");
assert.match(prefs, /qimen_location_updated_at\+interval '7 days'/u);
assert.match(prefs, /t\.qimen_payload_schema IN \(3,4\)/u,
  "preference refreshes keep compatible schema-3 and schema-4 Qimen installations eligible");

console.log("QIMEN_PUSH_REGISTRATION_OK");
