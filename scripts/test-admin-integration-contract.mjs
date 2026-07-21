import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;

function signature(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  passed++;
  console.log(`PASS ${name}`);
}

const community = read("src/lib/community-content.ts");
const communityMigration = read("migrations/20260711_community_content.sql");
signature(
  "1/5 support schema: runtime checks readiness; migration owns DDL",
  community.includes("to_regclass('public.news_items')") &&
    !community.includes("CREATE TABLE") &&
    communityMigration.includes("CREATE TABLE IF NOT EXISTS support_reports")
);

const genericGuardAllowlist = new Set([
  "src/app/api/admin/notify-prefs/route.ts",
  "src/app/api/admin/notify-test/route.ts",
  "src/app/api/admin/whoami/route.ts",
]);
const adminRouteFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "route.ts") adminRouteFiles.push(path.relative(root, full));
  }
}
walk(path.join(root, "src/app/api/admin"));
const broadGuards = adminRouteFiles.filter(
  (file) => read(file).includes("requireAdmin") && !genericGuardAllowlist.has(file)
);
signature("2/5 RBAC: mutable/admin data routes use module permissions", broadGuards.length === 0);

const packageApi = read("src/app/api/admin/packages/route.ts");
signature(
  "3/5 billing: package display uses checkout SoT and DB package edits are rejected",
  packageApi.includes("listPackagesPublic") &&
    packageApi.includes("packages_are_managed_in_server_config") &&
    packageApi.includes('requirePermission("admin.coupons.write")')
);

const researchDetail = read("src/app/api/admin/research/chats/[id]/route.ts");
signature(
  "4/5 research: Fusion list identifiers resolve by text with thread fallback",
  researchDetail.includes("f.id::text = $2") &&
    researchDetail.includes("loadResearchThread(scopeOrgId, id")
);

const invalidRouteExports = [];
for (const file of adminRouteFiles.concat([
  "src/app/api/book/route.ts",
  "src/app/api/sifu/fusion5/route.ts",
])) {
  const source = read(file);
  for (const match of source.matchAll(/^export (?:async )?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gm)) {
    const name = match[1];
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "runtime", "dynamic", "maxDuration", "revalidate", "preferredRegion", "fetchCache", "dynamicParams", "config"].includes(name)) {
      invalidRouteExports.push(`${file}:${name}`);
    }
  }
}
const rootLayout = read("src/app/layout.tsx");
const langState = read("public/js/hk-lang-state.js");
signature(
  "5/5 release/browser: valid route exports and legacy scripts cannot mutate React hydration",
  invalidRouteExports.length === 0 &&
    rootLayout.includes('data-hk-react-app="1"') &&
    langState.includes("!isReactApp && !window.__HK_LANG_UPGRADE_LOADER__")
);

console.log(`${passed}/5 admin integration signatures passed`);
