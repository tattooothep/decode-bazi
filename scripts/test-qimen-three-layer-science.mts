import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let sourceManifest: Record<string, unknown> | null = null;
try {
  sourceManifest = require("../src/lib/qimen-canonical-source-manifest.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}

assert.ok(
  sourceManifest,
  "the canonical Qimen source-manifest runtime must exist before a three-layer producer can be built",
);

const manifest = (sourceManifest.loadCanonicalSourceManifest as () => {
  producerEnabled: boolean;
  source: { digest: string; byteSize: number; editionStatus: string };
  layers: Record<string, { calculationVersion: string; decisionRole: string }>;
})();

assert.equal(manifest.producerEnabled, false, "the producer remains disabled until all release gates pass");
assert.deepEqual(manifest.source, {
  digest: "846e4e9f7393f6451e78f9daa87bea1202ab4b36b6161ba60c570f9f7bd9e690",
  byteSize: 8597,
  editionStatus: "pinned_ctext_transcription_base_edition_unknown",
});
assert.equal(manifest.layers.month.calculationVersion, "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1");
assert.equal(manifest.layers.month.decisionRole, "raw_context_only");
assert.equal(manifest.layers.day.calculationVersion, "QIMEN_FAQIAO_FEIPAN_RIJIA_CHAIBU_V1");
assert.equal(manifest.layers.day.decisionRole, "raw_context_only");
assert.equal(manifest.layers.hour.decisionRole, "sole_action_authority");

const assertAllowedContextVersion = sourceManifest.assertAllowedContextVersion as (
  layer: string,
  calculationVersion: string,
) => string;

assert.equal(
  assertAllowedContextVersion("month", "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1"),
  "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
);
assert.equal(
  assertAllowedContextVersion("day", "QIMEN_FAQIAO_FEIPAN_RIJIA_CHAIBU_V1"),
  "QIMEN_FAQIAO_FEIPAN_RIJIA_CHAIBU_V1",
);
assert.throws(
  () => assertAllowedContextVersion("month", "preliminary_simplified_dmy"),
  /QIMEN_CANONICAL_VERSION_NOT_ALLOWED/u,
);
assert.throws(
  () => assertAllowedContextVersion("day", "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1"),
  /QIMEN_CANONICAL_VERSION_NOT_ALLOWED/u,
);

const verifyCanonicalSourceEvidence = sourceManifest.verifyCanonicalSourceEvidence as (
  evidencePath?: string,
) => { digest: string; byteSize: number };

assert.deepEqual(verifyCanonicalSourceEvidence(), {
  digest: manifest.source.digest,
  byteSize: manifest.source.byteSize,
});
assert.throws(
  () => verifyCanonicalSourceEvidence(new URL("../package.json", import.meta.url).pathname),
  /QIMEN_CANONICAL_SOURCE_DIGEST_MISMATCH/u,
);

let canonicalTables: Record<string, unknown> | null = null;
try {
  canonicalTables = require("../src/lib/qimen-canonical-tables.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(canonicalTables, "canonical Qimen tables must be versioned with the source manifest");

const resolveMonthYearJu = canonicalTables.resolveMonthYearJu as (yearPillarZh: string) => {
  dun: "yin";
  ju: 1 | 4 | 7;
  yuan: "upper" | "middle" | "lower";
};
const expectedMonthGroups = {
  upper: "甲子乙丑丙寅丁卯戊辰甲午乙未丙申丁酉戊戌己卯庚辰辛巳壬午癸未己酉庚戌辛亥壬子癸丑".match(/../gu)!,
  middle: "甲寅乙卯丙辰丁巳戊午甲申乙酉丙戌丁亥戊子己巳庚午辛未壬申癸酉己亥庚子辛丑壬寅癸卯".match(/../gu)!,
  lower: "甲辰乙巳丙午丁未戊申甲戌乙亥丙子丁丑戊寅己丑庚寅辛卯壬辰癸巳己未庚申辛酉壬戌癸亥".match(/../gu)!,
} as const;

for (const [yuan, pillars] of Object.entries(expectedMonthGroups)) {
  const expectedJu = yuan === "upper" ? 1 : yuan === "middle" ? 4 : 7;
  for (const pillar of pillars) {
    assert.deepEqual(resolveMonthYearJu(pillar), { dun: "yin", ju: expectedJu, yuan });
  }
}
assert.equal(new Set(Object.values(expectedMonthGroups).flat()).size, 60, "the primary month table covers all 60 pillars exactly once");
assert.throws(() => resolveMonthYearJu("子"), /QIMEN_MONTH_YEAR_PILLAR_INVALID/u);
assert.throws(() => resolveMonthYearJu("甲子x"), /QIMEN_MONTH_YEAR_PILLAR_INVALID/u);

console.log("qimen three-layer science source-manifest tests passed");
