import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeUrl = new URL(
  "../src/app/api/auth/google/callback/route.ts",
  import.meta.url,
);
const flowUrl = new URL(
  "../src/lib/oauth-google-callback-flow.ts",
  import.meta.url,
);

let flow: typeof import("../src/lib/oauth-google-callback-flow");
try {
  flow = await import(flowUrl.href);
} catch (error) {
  assert.fail(
    `mobile Google callback classifier must exist: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const challenge = "A".repeat(43);

assert.deepEqual(flow.classifyGoogleCallback(null), { kind: "web" });
assert.deepEqual(flow.classifyGoogleCallback("/today"), { kind: "web" });
assert.deepEqual(flow.classifyGoogleCallback(`/__mobile__/${challenge}`), {
  kind: "mobile",
  challenge,
});
assert.deepEqual(flow.classifyGoogleCallback("/__mobile__/short"), {
  kind: "invalid_mobile",
});

assert.equal(
  flow.googleAccountAction({ kind: "mobile", challenge }, "browser-user-a"),
  "login",
  "mobile OAuth must ignore a stale browser session and log in as the selected Google account",
);
assert.equal(flow.googleAccountAction({ kind: "web" }, "browser-user-a"), "link");
assert.equal(flow.googleAccountAction({ kind: "web" }, null), "login");
assert.equal(typeof (flow as any).googleCallbackErrorLocation, "function");
assert.equal(
  (flow as any).googleCallbackErrorLocation(
    { kind: "mobile", challenge },
    "oauth_cancelled",
    "ยกเลิกการเข้าสู่ระบบด้วย Google",
  ),
  "hourkey://auth/google?error=oauth_cancelled",
);
assert.match(
  (flow as any).googleCallbackErrorLocation(
    { kind: "web" },
    "oauth_cancelled",
    "ยกเลิกการเข้าสู่ระบบด้วย Google",
  ),
  /^\/signup\?tab=login&err=/u,
);

const route = readFileSync(routeUrl, "utf8");
assert.match(
  route,
  /classifyGoogleCallback\(stateData\.next\)/,
  "callback route must classify the signed state before selecting the account",
);
assert.match(
  route,
  /callbackFlow\.kind === "web"\s*\? await getSession\(\)\s*:\s*null/,
  "mobile callback must not read or trust the system browser session",
);
assert.match(
  route,
  /accountAction === "link"\s*\? await linkGoogleToUser\(current!\.userId, profile\)\s*:\s*await findOrCreateUser\(profile\)/,
  "mobile callback must resolve the selected Google identity as a login",
);
assert.ok(
  route.indexOf("const callbackFlow = classifyGoogleCallback(stateData.next)")
    < route.indexOf("if (error)"),
  "a valid signed mobile state must be classified before OAuth cancellation/error routing",
);
assert.match(
  route,
  /googleCallbackErrorLocation\(callbackFlow, "google_verify_failed"/u,
  "provider verification failures must close the mobile auth session through the app deep link",
);
assert.match(
  route,
  /googleCallbackErrorLocation\(callbackFlow, "account_resolution_failed"/u,
  "account-resolution failures must close the mobile auth session through the app deep link",
);

console.log("[mobile-google-auth-cookie-isolation] 17/17 passed");
