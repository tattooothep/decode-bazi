import assert from "node:assert/strict";

// Explicit opt-in policy for the observed Next metadata ordering difference.
// No JavaScript evaluation, broad JSON matching, or global array sorting.
export const METADATA_ORDER_POLICY = "hourkey-r8-normalized-next-tree-metadata-order-v2";
// Exactly the 30 client-reference paths in the approved retained difference
// inventory. New routes are not implicitly enrolled in this ordering exception.
const clientPaths = new Set([
  "server/app/_global-error/page_client-reference-manifest.js",
  "server/app/_not-found/page_client-reference-manifest.js",
  "server/app/admin/affiliate/page_client-reference-manifest.js",
  "server/app/admin/ai-cost/page_client-reference-manifest.js",
  "server/app/admin/community/page_client-reference-manifest.js",
  "server/app/admin/engine/page_client-reference-manifest.js",
  "server/app/admin/finance/page_client-reference-manifest.js",
  "server/app/admin/formulas/page_client-reference-manifest.js",
  "server/app/admin/iam/page_client-reference-manifest.js",
  "server/app/admin/library/page_client-reference-manifest.js",
  "server/app/admin/members/page_client-reference-manifest.js",
  "server/app/admin/notify/page_client-reference-manifest.js",
  "server/app/admin/orders/page_client-reference-manifest.js",
  "server/app/admin/packages/page_client-reference-manifest.js",
  "server/app/admin/page_client-reference-manifest.js",
  "server/app/admin/paraphrase/page_client-reference-manifest.js",
  "server/app/admin/research/page_client-reference-manifest.js",
  "server/app/admin/settings/page_client-reference-manifest.js",
  "server/app/admin/sifu-prompts/page_client-reference-manifest.js",
  "server/app/admin/support/page_client-reference-manifest.js",
  "server/app/admin/users/[id]/page_client-reference-manifest.js",
  "server/app/chart-v2/page_client-reference-manifest.js",
  "server/app/dashboard/page_client-reference-manifest.js",
  "server/app/decisions/page_client-reference-manifest.js",
  "server/app/login/page_client-reference-manifest.js",
  "server/app/onboarding/page_client-reference-manifest.js",
  "server/app/sifu-live/page_client-reference-manifest.js",
  "server/app/yongshen/connections/page_client-reference-manifest.js",
  "server/app/yongshen/network/page_client-reference-manifest.js",
  "server/app/yongshen/page_client-reference-manifest.js",
]);
const routeMaps = new Set(["app-path-routes-manifest.json", "server/app-paths-manifest.json"]);
const fontPaths = new Set(["server/next-font-manifest.json", "server/next-font-manifest.js"]);
const clientWrapper = /^(globalThis\.__RSC_MANIFEST=\(globalThis\.__RSC_MANIFEST\|\|\{\}\);globalThis\.__RSC_MANIFEST\["(?:[^"\\]|\\.)*"\]=)(\{[\s\S]*\});$/u;
const fontWrapper = /^self\.__NEXT_FONT_MANIFEST='([^'\\]*)';$/u;

function parseMetadata(json: string, indent?: 2): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json);
  assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed), "metadata root must be an object");
  // Next emits JSON.stringify output. This roundtrip rejects duplicate keys,
  // noncanonical numbers/escapes and other syntax that JSON.parse would erase.
  assert.ok(JSON.stringify(parsed, null, indent) === json, "metadata must retain exact JSON values and unique keys");
  return parsed as Record<string, unknown>;
}

function canonical(value: unknown, path: string[], font: boolean): string {
  if (Array.isArray(value)) {
    let entries = value;
    // Only the observed app-layout font preload list is order-insensitive.
    // Every value and occurrence remains present; all other arrays stay ordered.
    if (font && path.length === 2 && path[0] === "app" && path[1] === "<APP_ROOT>/src/app/layout") {
      assert.ok(value.every((entry) => typeof entry === "string"
        && /^static\/media\/[a-f0-9]{16}-s\.p\.woff2$/u.test(entry)), "metadata preload list contains an unsupported value");
      entries = [...value].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    }
    return `[${entries.map((entry, index) => canonical(entry, [...path, String(index)], font)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key], [...path, key], font)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Input bytes have already undergone the unchanged historical substitutions. */
export function normalizeKnownNextMetadata(path: string, bytes: Buffer): Buffer {
  const client = clientPaths.has(path), font = fontPaths.has(path), routes = routeMaps.has(path);
  if (!client && !font && !routes) return bytes;
  const source = bytes.toString("utf8");
  assert.ok(Buffer.from(source).equals(bytes), "metadata must be valid UTF-8");
  if (client) {
    const match = clientWrapper.exec(source);
    assert.ok(match, "metadata client-reference JavaScript wrapper is unsupported");
    return Buffer.from(`${match[1]}${canonical(parseMetadata(match[2]), [], false)};`);
  }
  if (path === "server/next-font-manifest.js") {
    const match = fontWrapper.exec(source);
    assert.ok(match, "metadata font JavaScript wrapper is unsupported");
    return Buffer.from(`self.__NEXT_FONT_MANIFEST='${canonical(parseMetadata(match[1]), [], true)}';`);
  }
  const ordered = canonical(parseMetadata(source, routes ? 2 : undefined), [], font);
  // The two route maps are emitted with two-space indentation, unlike the
  // compact font JSON. Preserve that exact format rather than waive whitespace.
  return Buffer.from(routes ? JSON.stringify(JSON.parse(ordered), null, 2) : ordered);
}
