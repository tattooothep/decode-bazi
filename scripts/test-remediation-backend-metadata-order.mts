import assert from "node:assert/strict";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { measureRemediationBackendArtifact } from "./lib/remediation-backend-artifact.mts";

const policy = "hourkey-r8-normalized-next-tree-metadata-order-v2";
const scratch = fs.mkdtempSync(join(tmpdir(), "hourkey-metadata-order-test-"));
const put = (root: string, path: string, data: string) => {
  fs.mkdirSync(join(root, ".next", path, ".."), { recursive: true });
  fs.writeFileSync(join(root, ".next", path), data);
};
const clientPath = "server/app/login/page_client-reference-manifest.js";
const client = (value: unknown) => `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/login/page"]=${JSON.stringify(value)};`;
const fontFiles = ["static/media/e4af272ccee01ff0-s.p.woff2", "static/media/7d4881bb7e1bf84d-s.p.woff2"];
const fontManifest = (files: string[], reverseKeys = false, other: string[] = ["first", "second"]) => reverseKeys
  ? { pagesUsingSizeAdjust: false, appUsingSizeAdjust: true, other, app: { "/synthetic/app/src/app/layout": files }, pages: {} }
  : { pages: {}, app: { "/synthetic/app/src/app/layout": files }, other, appUsingSizeAdjust: true, pagesUsingSizeAdjust: false };
const putFonts = (root: string, value: unknown) => {
  const json = JSON.stringify(value);
  put(root, "server/next-font-manifest.json", json);
  put(root, "server/next-font-manifest.js", `self.__NEXT_FONT_MANIFEST='${json}';`);
};
function fixture(leaf: string) {
  const root = join(scratch, leaf);
  put(root, "BUILD_ID", "build_identifier_fixture");
  put(root, "required-server-files.json", JSON.stringify({ appDir: "/synthetic/app" }));
  put(root, "prerender-manifest.json", JSON.stringify({ preview: { previewModeId: "preview-id-value" } }));
  put(root, "server/server-reference-manifest.json", JSON.stringify({ encryptionKey: "server-action-key-value" }));
  return root;
}
// The v2 option is deliberately opt-in; default measurements must remain v1.
const measure = (root: string) => measureRemediationBackendArtifact(root, { reproduciblePolicy: policy });
try {
  const a = fixture("a"), b = fixture("b");
  const firstClient = { moduleLoading: { prefix: "/_next/" }, clientModules: { z: { chunks: ["1", "one.js", "2", "two.js"], id: 1 }, a: { id: 2 } } };
  const reorderedClient = { clientModules: { a: { id: 2 }, z: { id: 1, chunks: ["1", "one.js", "2", "two.js"] } }, moduleLoading: { prefix: "/_next/" } };
  put(a, clientPath, client(firstClient)); put(b, clientPath, client(reorderedClient));
  for (const path of ["app-path-routes-manifest.json", "server/app-paths-manifest.json"]) {
    put(a, path, JSON.stringify({ z: "last", a: "first" }, null, 2));
    put(b, path, JSON.stringify({ a: "first", z: "last" }, null, 2));
  }
  putFonts(a, fontManifest(fontFiles));
  putFonts(b, fontManifest([...fontFiles].reverse(), true));
  const before = fs.readFileSync(join(a, ".next", clientPath));
  const left = measure(a), right = measure(b);
  assert.equal(left.reproducible.algorithm, policy);
  assert.equal(left.schema, "hourkey-remediation-backend-artifact/v2");
  assert.equal(left.reproducible.sha256, right.reproducible.sha256, "only approved metadata ordering is equivalent");
  assert.notEqual(left.installed.sha256, right.installed.sha256, "installed identity still preserves metadata bytes");
  assert.ok(left.historicalReproducible && right.historicalReproducible);
  assert.notEqual(left.historicalReproducible.sha256, right.historicalReproducible.sha256);
  const historical = measureRemediationBackendArtifact(a);
  assert.equal(historical.schema, "hourkey-remediation-backend-artifact/v1");
  assert.deepEqual(left.historicalReproducible, historical.reproducible, "v1 output and pins are retained, not relabeled");
  assert.equal(Object.hasOwn(historical, "historicalReproducible"), false);
  assert.equal(Object.hasOwn(left, "releaseReady"), false);
  assert.deepEqual(fs.readFileSync(join(a, ".next", clientPath)), before, "measurement does not rewrite artifacts");
  const baseline = right.reproducible.sha256;
  const differs = (label: string) => assert.notEqual(measure(b).reproducible.sha256, baseline, label);

  const chunksChanged = structuredClone(reorderedClient);
  chunksChanged.clientModules.z.chunks.reverse();
  put(b, clientPath, client(chunksChanged)); differs("client chunk arrays remain ordered");
  put(b, clientPath, client({ ...reorderedClient, unknown: "new-value" })); differs("unknown object values cannot disappear");
  put(b, clientPath, client(reorderedClient));

  putFonts(b, fontManifest([...fontFiles, fontFiles[0]], true)); differs("font duplicates are significant");
  putFonts(a, fontManifest([...fontFiles, fontFiles[0]]));
  assert.equal(measure(a).reproducible.sha256, measure(b).reproducible.sha256, "same duplicate-sensitive multiset may reorder");
  putFonts(b, fontManifest(fontFiles, true));
  assert.notEqual(measure(a).reproducible.sha256, measure(b).reproducible.sha256, "removing a duplicate cannot be normalized away");
  putFonts(a, fontManifest(fontFiles));
  putFonts(b, fontManifest([fontFiles[0], "static/media/aaaaaaaaaaaaaaaa-s.p.woff2"], true)); differs("font filenames remain meaningful");
  putFonts(b, fontManifest(fontFiles, true, ["second", "first"])); differs("unknown font-manifest arrays remain ordered");
  putFonts(b, fontManifest(fontFiles, true));
  for (const path of ["app-path-routes-manifest.json", "server/app-paths-manifest.json"]) {
    put(a, path, JSON.stringify({ items: ["a", "b"] }, null, 2)); put(b, path, JSON.stringify({ items: ["b", "a"] }, null, 2));
    assert.notEqual(measure(a).reproducible.sha256, measure(b).reproducible.sha256, "route-map arrays remain ordered");
    put(a, path, JSON.stringify({ z: "last", a: "first" }, null, 2)); put(b, path, JSON.stringify({ a: "first", z: "last" }, null, 2));
  }
  for (const path of ["server/ordinary.json", "static/page_client-reference-manifest.js", "server/app/login/page.js"]) {
    put(a, path, JSON.stringify({ a: 1, b: 2 })); put(b, path, JSON.stringify({ b: 2, a: 1 }));
    assert.notEqual(measure(a).reproducible.sha256, measure(b).reproducible.sha256, "unlisted files retain byte-order sensitivity");
    fs.unlinkSync(join(a, ".next", path)); fs.unlinkSync(join(b, ".next", path));
  }
  const unlistedClientPath = "server/app/new/page_client-reference-manifest.js";
  put(a, unlistedClientPath, client(firstClient).replace("/login/page", "/new/page"));
  put(b, unlistedClientPath, client(reorderedClient).replace("/login/page", "/new/page"));
  assert.notEqual(measure(a).reproducible.sha256, measure(b).reproducible.sha256,
    "an unlisted client-reference route retains byte-order sensitivity even with the valid Next wrapper");
  fs.unlinkSync(join(a, ".next", unlistedClientPath)); fs.unlinkSync(join(b, ".next", unlistedClientPath));
  put(b, clientPath, `${client(reorderedClient)}globalThis.extra=true;`);
  assert.throws(() => measure(b), /metadata/u, "extra JavaScript is rejected, never executed or discarded");
  put(b, clientPath, client(reorderedClient).replace('"id":1', '"id":0,"id":1'));
  assert.throws(() => measure(b), /metadata/u, "duplicate JSON object keys are rejected rather than erased by parsing");
  put(b, clientPath, client(reorderedClient));
  put(b, "server/next-font-manifest.js", "self.__NEXT_FONT_MANIFEST=globalThis.execute();");
  assert.throws(() => measure(b), /metadata/u, "font JS accepts only the exact data wrapper");
  putFonts(b, fontManifest(fontFiles, true));
  assert.equal(measure(b).reproducible.sha256, baseline);
  assert.throws(() => measureRemediationBackendArtifact(a, { reproduciblePolicy: "unknown" } as any), /policy/u);
  console.log("PASS metadata-order v2: opt-in only, historical pins retained, exact metadata classes, ordered unknown arrays/values/files, duplicate-sensitive preload arrays, no artifact writes");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
