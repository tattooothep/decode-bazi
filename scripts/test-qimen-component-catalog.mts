import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const catalog = require("../src/lib/qimen-component-catalog.cjs") as {
  CATALOG: Record<string, Record<string, {
    code: string;
    zh: string;
    names: { th: string; en: string; zh: string };
    baseQuality: string;
    presentation: string;
  }>>;
  componentPresentation(value: unknown): string;
  resolveQimenComponent(kind: string, code: string): unknown;
};

const DATABASE = "/root/qimen-api/data/qimen.sqlite";
const TABLES = {
  deity: "qimen_deities_dict",
  door: "qimen_doors_dict",
  star: "qimen_stars_dict",
} as const;

assert.equal(catalog.componentPresentation("great_auspicious"), "supportive");
assert.equal(catalog.componentPresentation("contextual"), "contextual");
assert.equal(catalog.componentPresentation("severe"), "unsupportive");
assert.equal(catalog.componentPresentation("unknown"), "unavailable");
assert.deepEqual(catalog.resolveQimenComponent("deity", "JIU_DI"), {
  code: "JIU_DI",
  zh: "九地",
  names: { th: "เก้าพื้นดิน", en: "Jiu Di (Nine Earth)", zh: "九地" },
  baseQuality: "auspicious",
  presentation: "supportive",
});
assert.equal(catalog.resolveQimenComponent("star", "UNKNOWN"), null);

for (const [kind, table] of Object.entries(TABLES)) {
  const rows = JSON.parse(execFileSync(
    "sqlite3",
    ["-json", DATABASE, `SELECT code, zh, name_th, name_en, base_quality FROM ${table} ORDER BY code`],
    { encoding: "utf8" },
  )) as Array<{ code: string; zh: string; name_th: string; name_en: string; base_quality: string }>;
  const exported = catalog.CATALOG[kind];

  assert.deepEqual(Object.keys(exported).sort(), rows.map((row) => row.code));
  for (const row of rows) {
    const entry = catalog.resolveQimenComponent(kind, row.code) as typeof exported[string];
    assert.ok(Object.isFrozen(entry), `${kind}/${row.code} is frozen`);
    assert.ok(Object.isFrozen(entry.names), `${kind}/${row.code} names are frozen`);
    assert.deepEqual(entry, {
      code: row.code,
      zh: row.zh,
      names: { th: row.name_th, en: row.name_en, zh: row.zh },
      baseQuality: row.base_quality,
      presentation: catalog.componentPresentation(row.base_quality),
    });
  }
}

assert.ok(Object.isFrozen(catalog.CATALOG));
console.log("qimen component catalog tests passed");
