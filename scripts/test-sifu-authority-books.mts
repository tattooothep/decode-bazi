/**
 * Sifu authority books guard.
 *
 * Read-only test. It validates Phase 5A authority book files and catalog
 * without importing or changing /api/sifu runtime routes.
 *
 * Run:
 *   node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-sifu-authority-books.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SIFU_AUTHORITY_BOOK_DESCRIPTORS,
  buildSifuAuthorityBooksCatalog,
  summarizeSifuAuthorityBooksCatalog,
} from "../src/lib/sifu-authority-books.ts";
import { buildSifuSourceManifest } from "../src/lib/sifu-source-manifest.ts";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function ck(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}${detail ? " · " + detail : ""}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? " · " + detail : ""}`);
  }
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...listSourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

console.log("[sifu-authority-books]");

const generatedAt = "2026-06-06T00:00:00.000Z";
const manifest = buildSifuSourceManifest("sifu-single-full-current", { generatedAt });
const catalog = buildSifuAuthorityBooksCatalog({ manifest, generatedAt });
const summary = summarizeSifuAuthorityBooksCatalog(catalog);
const summaryJson = JSON.stringify(summary);

const expectedBooks = [
  "bazi-authority-interactions",
  "bazi-authority-geju-xiangshen",
  "bazi-authority-tiaohou-yongshen",
  "bazi-authority-conghua-special-ge",
  "bazi-authority-shishen-roles",
  "bazi-authority-yingqi-timing",
  "bazi-authority-hehun-liuqin",
  "bazi-authority-shensha-secondary",
  "bazi-authority-nayin-texture",
];

ck("catalog has exactly 9 requested authority books", catalog.bookCount === 9, `books=${catalog.bookCount}`);
ck("book ids match requested authority book list", JSON.stringify(SIFU_AUTHORITY_BOOK_DESCRIPTORS.map((b) => b.bookId)) === JSON.stringify(expectedBooks));
ck("catalog hash is sha256", /^[0-9a-f]{64}$/.test(catalog.catalogHashSha256), catalog.catalogHashSha256);
ck("catalog uses current source manifest hash", catalog.sourceManifestHash === manifest.sourceManifestHash, catalog.sourceManifestHash);
ck("all authority source ids resolve to manifest", catalog.books.every((book) => book.missingSourceIds.length === 0));
ck("authority catalog maps 23 source rows including compact retrieval sources where relevant", catalog.books.reduce((sum, book) => sum + book.sourceRows.length, 0) === 23, `sourceRows=${catalog.books.reduce((sum, book) => sum + book.sourceRows.length, 0)}`);
ck("every authority source row has source and prompt segment hashes", catalog.books.every((book) => book.sourceRows.every((row) => /^[0-9a-f]{64}$/.test(row.sourceHashSha256) && /^[0-9a-f]{64}$/.test(row.promptSegmentHashSha256))));
ck("all authority files are substantial but not full corpus duplicates", catalog.books.every((book) => book.chars > 1_200 && book.chars < 8_000), catalog.books.map((book) => `${book.bookId}:${book.chars}`).join(", "));

for (const book of catalog.books) {
  const text = readFileSync(join(ROOT, book.relativePath), "utf8");
  ck(`${book.bookId} has Source Priority`, /## Source Priority/.test(text));
  ck(`${book.bookId} has Source Map`, /## Source Map/.test(text));
  ck(`${book.bookId} has Decision Order`, /## Decision Order/.test(text));
  ck(`${book.bookId} has Conflict Default`, /## Conflict Default/.test(text));
  ck(`${book.bookId} has Do Not Use As`, /## Do Not Use As/.test(text));
  ck(`${book.bookId} has Router Notes`, /## Router Notes/.test(text));
}

ck("summary is audit-safe and compact", summaryJson.length < 20_000, `summaryChars=${summaryJson.length}`);
ck("summary excludes full authority prose", !summaryJson.includes("Decision Order"));
ck("manifest source counts remain current", manifest.knownSourceCount === 26 && manifest.sourceCount === 23, `known=${manifest.knownSourceCount} included=${manifest.sourceCount}`);

const appRuntimeImports = listSourceFiles(join(ROOT, "src/app"))
  .filter((path) => /sifu-authority-books|SIFU_AUTHORITY_BOOKS|bazi-authority-interactions|bazi-authority-geju-xiangshen|bazi-authority-tiaohou-yongshen/.test(readFileSync(path, "utf8")))
  .map((path) => path.slice(ROOT.length + 1));
ck("authority books are not imported by runtime app routes", appRuntimeImports.length === 0, appRuntimeImports.join(", "));

console.log(`\n[sifu-authority-books] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);

