import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const policy = readFileSync("public/privacy.html", "utf8");
for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"]) {
  assert.match(policy, new RegExp(`${locale}:\\['`, "u"), `Zi Bai location notice is translated for ${locale}`);
}
assert.match(policy, /7 days/u);
assert.doesNotMatch(policy, /use it for at most 3 hours|clear it within 24 hours/u);
assert.match(policy, /latest location/u);
assert.match(policy, /background/u);
const spanishStart = policy.indexOf("es:['11. Ubicación para avisos Zi Bai'");
const spanish = policy.slice(spanishStart, policy.indexOf("]]", spanishStart) + 2);
assert.ok(spanishStart >= 0 && spanish.length > 80);
assert.doesNotMatch(spanish, /latest location|7 days|recopilación background/u,
  "Spanish Zi Bai privacy copy must not fall back to English fragments");
assert.match(policy, /LOCATION_NOTICE/u);
assert.match(policy, /17 สิงหาคม 2026|August 17, 2026/u);

console.log("ZIBAI_PRIVACY_POLICY_OK locales=9");
