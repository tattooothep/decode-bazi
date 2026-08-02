import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyShrineRealtimeRouteManifests,
} from "./verify-shrine-realtime-build.mjs";

const packageJson = JSON.parse(await readFile(
  new URL("../package.json", import.meta.url),
  "utf8",
)) as Readonly<{ scripts?: Readonly<Record<string, string>> }>;

assert.match(
  packageJson.scripts?.build ?? "",
  /verify-shrine-realtime-build\.mjs/u,
  "every production build must fail if the Realtime route is absent",
);

const validAppPaths = {
  "/api/mobile/v1/shrine/realtime/session/route":
    "app/api/mobile/v1/shrine/realtime/session/route.js",
};
const validRoutes = {
  dynamicRoutes: [],
  staticRoutes: [{ page: "/api/mobile/v1/shrine/realtime/session" }],
};

assert.doesNotThrow(() => verifyShrineRealtimeRouteManifests(
  validAppPaths,
  validRoutes,
));
assert.throws(
  () => verifyShrineRealtimeRouteManifests({}, validRoutes),
  /shrine_realtime_route_missing_from_app_paths/u,
);
assert.throws(
  () => verifyShrineRealtimeRouteManifests(validAppPaths, {
    dynamicRoutes: [],
    staticRoutes: [],
  }),
  /shrine_realtime_route_missing_from_routes/u,
);

console.log("shrine realtime release route gate passed");
