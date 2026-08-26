import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ziwei = readFileSync("src/app/api/mobile/v1/ziwei/hourly-preview/route.ts", "utf8");
const qizheng = readFileSync("src/app/api/mobile/v1/qizheng/electional-preview/route.ts", "utf8");
const shared = readFileSync("src/lib/mobile-science-preview-route.ts", "utf8");

for (const route of [ziwei, qizheng]) {
  assert.match(route, /export async function POST\(req: Request\)/);
  assert.match(route, /getSession: getMobileSession/);
  assert.match(route, /guardSciencePreviewRequest\(/);
  assert.match(route, /if \(!guard\.ok\) return/);
  assert.match(route, /readBoundedJson\(req/);
  assert.match(route, /body\.schema !== 1/);
  assert.match(route, /exactObjectKeys\(body/);
  assert.match(route, /created_by_user_id=\$3/);
  assert.match(route, /COALESCE\(is_archived, false\)=false/);
  assert.match(route, /relationship_type IS NULL OR btrim\(relationship_type\) = ''/);
  assert.match(route, /PRIVATE_NO_STORE_HEADERS/);
  assert.doesNotMatch(route, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|outbox|scheduler|notificationPayload/i);
  assert.doesNotMatch(route, /new Date\(\)/);
}

assert.match(ziwei, /ZIWEI_HOURLY_PREVIEW_ENABLED/);
assert.match(ziwei, /ZIWEI_HOURLY_PREVIEW_USER_IDS/);
assert.match(ziwei, /buildZiweiHourlyPreview/);
assert.match(ziwei, /birth_time_known=true/);
assert.match(qizheng, /QIZHENG_ELECTIONAL_PREVIEW_ENABLED/);
assert.match(qizheng, /QIZHENG_ELECTIONAL_PREVIEW_USER_IDS/);
assert.match(qizheng, /buildQizhengElectionalPreview/);
assert.match(qizheng, /typeof location\.lat === "number"/);
assert.match(qizheng, /typeof location\.lng === "number"/);
assert.match(qizheng, /typeof body\.directionDeg === "number"/);
assert.match(qizheng, /exactObjectKeys\(location/);
assert.match(shared, /enabled !== "1"/);
assert.match(shared, /allowlist\.has\(userId\)/);
assert.match(shared, /MAX_PREVIEW_BODY_BYTES = 8_192/);
assert.match(shared, /Cache-Control.*private, no-store, max-age=0/);
assert.match(shared, /Vary.*Authorization/);

console.log("PASS mobile science preview route contracts — auth, owner/self, kill switch, no-store, no writes");
