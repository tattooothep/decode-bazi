import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { internalAppOrigin } from "../src/lib/internal-app-origin";

const proxied = new Request("https://127.0.0.1:3352/api/mobile/v1/chart");
assert.equal(
  internalAppOrigin(proxied, { NODE_ENV: "production" }),
  "http://127.0.0.1:3349",
  "production self-call must use local HTTP, not the forwarded HTTPS URL",
);
assert.equal(
  internalAppOrigin(proxied, { NODE_ENV: "production", SIFU_INTERNAL_BASE_URL: "http://127.0.0.1:3399/" }),
  "http://127.0.0.1:3399",
);
assert.equal(
  internalAppOrigin(proxied, { NODE_ENV: "development" }),
  "https://127.0.0.1:3352",
  "development keeps the active dev-server origin",
);

const routes = [
  "src/app/api/mobile/v1/chart/route.ts",
  "src/app/api/mobile/v1/datepick/route.ts",
  "src/app/api/mobile/v1/network/sifu/route.ts",
  "src/app/api/mobile/v1/profiles/[id]/route.ts",
  "src/app/api/mobile/v1/profiles/related/route.ts",
  "src/app/api/mobile/v1/sifu/chat/route.ts",
  "src/app/api/mobile/v1/sifu/group/route.ts",
  "src/app/api/mobile/v1/sifu/history/route.ts",
];
for (const route of routes) {
  const source = readFileSync(route, "utf8");
  assert.match(source, /internalAppOrigin\(req\)/, `${route} must use the trusted internal origin`);
  assert.doesNotMatch(source, /new URL\(req\.url\)\.origin|const origin = url\.origin/, `${route} still trusts proxy URL for self-call`);
}

console.log(`mobile internal origin PASS · ${routes.length} self-call routes`);
