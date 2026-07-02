#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const science = process.argv[2];
if (!science || !/^[a-z0-9_-]+$/i.test(science)) {
  console.error("Usage: node scripts/ingest-astro-restricted-sources.mjs <science>");
  process.exit(2);
}

const root = process.cwd();
const base = join(root, "private/restricted-sources", science);
const inputDirs = [
  { bucket: "licensed_incoming", dir: join(base, "incoming") },
  { bucket: "public_domain", dir: join(base, "public-domain") },
  { bucket: "official_excerpts", dir: join(base, "official-excerpts") },
];
const extractedDir = join(base, "extracted");
const manifestDir = join(base, "manifests");
mkdirSync(extractedDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function slug(s) {
  return s
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(p));
    else if (name.isFile()) out.push(p);
  }
  return out;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout || r.status}`);
}

function convert(inputPath, outputPath) {
  const ext = extname(inputPath).toLowerCase();
  if ([".txt", ".md"].includes(ext)) {
    copyFileSync(inputPath, outputPath);
    return "copy_text";
  }
  if (ext === ".pdf") {
    run("pdftotext", ["-layout", "-enc", "UTF-8", inputPath, outputPath]);
    return "pdftotext_layout";
  }
  if ([".epub", ".html", ".htm", ".docx"].includes(ext)) {
    run("pandoc", [inputPath, "-t", "plain", "-o", outputPath]);
    return "pandoc_plain";
  }
  throw new Error(`unsupported extension ${ext || "(none)"}`);
}

const rows = [];
for (const { bucket, dir } of inputDirs) {
  for (const file of walk(dir)) {
    const ext = extname(file).toLowerCase();
    if (![".txt", ".md", ".pdf", ".epub", ".html", ".htm", ".docx"].includes(ext)) continue;
    const rawHash = sha256File(file);
    const outName = `${bucket}__${slug(basename(file))}__${rawHash.slice(0, 12)}.txt`;
    const out = join(extractedDir, outName);
    const row = {
      science,
      bucket,
      rawPath: relative(root, file),
      rawBytes: statSync(file).size,
      rawSha256: rawHash,
      extractedPath: relative(root, out),
      extractedBytes: 0,
      method: null,
      status: "pending",
      error: null,
      usableForCanon: bucket !== "licensed_incoming" ? "summary_or_verbatim_if_public_domain" : "derived_summary_only_no_quotes",
    };
    try {
      row.method = convert(file, out);
      row.extractedBytes = statSync(out).size;
      row.status = row.extractedBytes > 0 ? "ok" : "empty";
    } catch (e) {
      row.status = "failed";
      row.error = e.message;
    }
    rows.push(row);
  }
}

const manifest = {
  science,
  generatedAt: new Date().toISOString(),
  policy: {
    rawFilesStayPrivate: `private/restricted-sources/${science}`,
    noRawTextInUserOutput: true,
    licensedIncomingUse: "derive internal rule packs only; do not copy prose into data/library",
  },
  counts: {
    total: rows.length,
    ok: rows.filter((r) => r.status === "ok").length,
    failed: rows.filter((r) => r.status === "failed").length,
  },
  rows,
};

writeFileSync(join(manifestDir, "ingest-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(manifestDir, "ingest-manifest.tsv"),
  [
    "status\tscience\tbucket\trawBytes\textractedBytes\tmethod\trawPath\textractedPath\terror",
    ...rows.map((r) => [r.status, r.science, r.bucket, r.rawBytes, r.extractedBytes, r.method || "", r.rawPath, r.extractedPath, r.error || ""].join("\t")),
  ].join("\n") + "\n",
);

console.log(`Ingested ${manifest.counts.ok}/${manifest.counts.total} ${science} source files`);
if (manifest.counts.failed) {
  for (const r of rows.filter((x) => x.status === "failed")) console.log(`FAILED\t${r.rawPath}\t${r.error}`);
}
