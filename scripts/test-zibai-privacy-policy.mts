import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const policy = readFileSync("public/privacy.html", "utf8");
for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"]) {
  assert.match(policy, new RegExp(`${locale}:\\['`, "u"), `Zi Bai location notice is translated for ${locale}`);
}
assert.match(policy, /24 hours/u);
assert.match(policy, /3 hours/u);
assert.match(policy, /latest location/u);
assert.match(policy, /background/u);
assert.match(policy, /LOCATION_NOTICE/u);
assert.match(policy, /16 สิงหาคม 2026|August 16, 2026/u);

console.log("ZIBAI_PRIVACY_POLICY_OK locales=9");
