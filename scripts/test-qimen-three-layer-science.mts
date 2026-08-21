import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  layers: Record<string, {
    calculationVersion: string; decisionRole: string;
    engineContractVersion?: string; engineSourceDigest?: string; engineProfileId?: number;
    engineDependencyClosureVersion?: string; engineDependencyClosureDigest?: string; engineNodeRuntime?: string;
  }>;
})();

assert.equal(manifest.producerEnabled, false, "the producer remains disabled until all release gates pass");
assert.deepEqual(manifest.source, {
  digest: "987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460",
  byteSize: 10629,
  editionStatus: "pinned_ctext_transcription_base_edition_unknown",
});
assert.equal(manifest.layers.month.calculationVersion, "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1");
assert.equal(manifest.layers.month.decisionRole, "raw_context_only");
assert.equal(manifest.layers.day.calculationVersion, "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1");
assert.equal(manifest.layers.day.decisionRole, "raw_context_only");
assert.equal(manifest.layers.hour.calculationVersion, "QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1");
assert.equal(manifest.layers.hour.decisionRole, "sole_action_authority");
assert.equal(manifest.layers.hour.engineContractVersion, "QIMEN_HOUR_ENGINE_DEPENDENCY_CLOSURE_V5");
assert.equal(manifest.layers.hour.engineSourceDigest, "fd78e805bde1e454fa901084acb3bd8a0d466cfc21c6523caecb295ef2ee5722");
assert.equal(manifest.layers.hour.engineDependencyClosureVersion, "QIMEN_ENGINE_DEPENDENCY_CLOSURE_V1");
assert.equal(manifest.layers.hour.engineDependencyClosureDigest, "a870f5b34ba5d7b9de90c2b13c93de88b07bdf0a0609e913c49556b8f02679e6");
assert.equal(manifest.layers.hour.engineNodeRuntime, "v22.22.1");
assert.equal(manifest.layers.hour.engineReferenceDataVersion, "QIMEN_SQLITE_REFERENCE_TABLES_V1");
assert.equal(manifest.layers.hour.engineReferenceDataDigest, "2bbe56382a78ee951da880706b3b1c895307306848319ebac026ed227d38e1c4");
assert.equal(manifest.layers.hour.engineProfileId, 1);

const canonicalManifestDocument = readFileSync(
  new URL("../docs/specs/QIMEN_C4_CANONICAL_SOURCE_MANIFEST.md", import.meta.url),
  "utf8",
);
assert.match(canonicalManifestDocument, /`QIMEN_HOUR_ENGINE_DEPENDENCY_CLOSURE_V5`/u);
assert.match(canonicalManifestDocument, /`fd78e805bde1e454fa901084acb3bd8a0d466cfc21c6523caecb295ef2ee5722`/u);
assert.match(canonicalManifestDocument, /`QIMEN_ENGINE_DEPENDENCY_CLOSURE_V1`/u);
assert.match(canonicalManifestDocument, /`a870f5b34ba5d7b9de90c2b13c93de88b07bdf0a0609e913c49556b8f02679e6`/u);
assert.match(canonicalManifestDocument, /`QIMEN_SQLITE_REFERENCE_TABLES_V1`/u);
assert.match(canonicalManifestDocument, /`2bbe56382a78ee951da880706b3b1c895307306848319ebac026ed227d38e1c4`/u);
assert.doesNotMatch(canonicalManifestDocument, /QIMEN_HOUR_ENGINE_CANONICAL_CLOCKS_V3/u);

const assertAllowedContextVersion = sourceManifest.assertAllowedContextVersion as (
  layer: string,
  calculationVersion: string,
) => string;

assert.equal(
  assertAllowedContextVersion("month", "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1"),
  "QIMEN_FAQIAO_FEIPAN_YUEJIA_V1",
);
assert.equal(
  assertAllowedContextVersion("day", "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1"),
  "FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1",
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

let contextEngine: Record<string, unknown> | null = null;
try {
  contextEngine = require("../src/lib/qimen-canonical-context-engine.cjs");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
}
assert.ok(contextEngine, "the canonical flying-plate context engine must exist");
const buildFaqiaoFeipan = contextEngine.buildFaqiaoFeipan as (input: {
  dun: "yang" | "yin";
  ju: number;
  subjectPillarZh: string;
  centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1";
}) => {
  xunHead: string;
  directSymbolStar: string;
  directEnvoyDoor: string;
  centerLodgingPalace: number;
  palaces: ReadonlyArray<{
    palace: number;
    earthInstrument: string;
    heavenInstrument: string;
    star: string;
    door: string | null;
    deity: string | null;
  }>;
};

function palace(chart: ReturnType<typeof buildFaqiaoFeipan>, palaceNumber: number) {
  return chart.palaces.find((item) => item.palace === palaceNumber)!;
}

// 《奇門法竅》卷二 worked example: 冬至上元陽遁一局 · 庚子日.
const yangOneGengZi = buildFaqiaoFeipan({
  dun: "yang", ju: 1, subjectPillarZh: "庚子",
  centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
});
assert.equal(yangOneGengZi.xunHead, "甲午");
assert.equal(yangOneGengZi.directSymbolStar, "天輔");
assert.equal(yangOneGengZi.directEnvoyDoor, "杜門");
assert.equal(yangOneGengZi.centerLodgingPalace, 8);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => palace(yangOneGengZi, number).earthInstrument),
  ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"],
);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => palace(yangOneGengZi, number).heavenInstrument),
  ["己", "庚", "辛", "壬", "癸", "丁", "丙", "乙", "戊"],
);
assert.equal(palace(yangOneGengZi, 3).star, "天輔");
assert.equal(palace(yangOneGengZi, 3).deity, "直符");
assert.equal(palace(yangOneGengZi, 1).door, "杜門");
assert.equal(palace(yangOneGengZi, 7).door, "休門");
assert.equal(palace(yangOneGengZi, 5).door, null);
assert.equal(palace(yangOneGengZi, 5).deity, null);

// 《奇門法竅》卷二 worked example: 夏至上元陰遁九局 · 丁卯日.
const yinNineDingMao = buildFaqiaoFeipan({
  dun: "yin", ju: 9, subjectPillarZh: "丁卯",
  centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
});
assert.equal(yinNineDingMao.xunHead, "甲子");
assert.equal(yinNineDingMao.directSymbolStar, "天英");
assert.equal(yinNineDingMao.directEnvoyDoor, "景門");
assert.equal(yinNineDingMao.centerLodgingPalace, 2);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => palace(yinNineDingMao, number).earthInstrument),
  ["乙", "丙", "丁", "癸", "壬", "辛", "庚", "己", "戊"],
);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => palace(yinNineDingMao, number).heavenInstrument),
  ["庚", "己", "戊", "乙", "丙", "丁", "癸", "壬", "辛"],
);
assert.equal(palace(yinNineDingMao, 3).star, "天英");
assert.equal(palace(yinNineDingMao, 3).deity, "直符");
assert.equal(palace(yinNineDingMao, 6).door, "景門");
assert.equal(palace(yinNineDingMao, 7).door, "休門");
assert.equal(palace(yinNineDingMao, 5).door, null);
assert.equal(palace(yinNineDingMao, 5).deity, null);
assert.throws(
  () => buildFaqiaoFeipan({
    dun: "yang", ju: 0, subjectPillarZh: "庚子",
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  }),
  /QIMEN_FEIPAN_INPUT_INVALID/u,
);
assert.throws(
  () => buildFaqiaoFeipan({
    dun: "yin", ju: 9, subjectPillarZh: "丁",
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  }),
  /QIMEN_FEIPAN_INPUT_INVALID/u,
);
assert.throws(
  () => buildFaqiaoFeipan({
    dun: "yin", ju: 9, subjectPillarZh: "丁卯",
    centerLodgingPolicy: "silent_default" as never,
  }),
  /QIMEN_CENTER_LODGING_POLICY_REQUIRED/u,
);

const sixJuGoldens = require("./fixtures/qimen-faqiao-six-ju-goldens.cjs") as ReadonlyArray<{
  dun: "yang" | "yin"; ju: number; subjectPillarZh: string; xunHead: string;
  directSymbolStar: string; directEnvoyDoor: string;
  earth: ReadonlyArray<string>; heaven: ReadonlyArray<string>; star: ReadonlyArray<string>;
  door: ReadonlyArray<string | null>; deity: ReadonlyArray<string | null>;
}>;
assert.equal(sixJuGoldens.length, 6, "the release profile pins all six nominal day Ju as literal fixtures");
for (const golden of sixJuGoldens) {
  const chart = buildFaqiaoFeipan({
    dun: golden.dun, ju: golden.ju, subjectPillarZh: golden.subjectPillarZh,
    centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1",
  });
  assert.equal(chart.xunHead, golden.xunHead);
  assert.equal(chart.directSymbolStar, golden.directSymbolStar);
  assert.equal(chart.directEnvoyDoor, golden.directEnvoyDoor);
  assert.deepEqual(chart.palaces.map((entry) => entry.earthInstrument), golden.earth);
  assert.deepEqual(chart.palaces.map((entry) => entry.heavenInstrument), golden.heaven);
  assert.deepEqual(chart.palaces.map((entry) => entry.star), golden.star);
  assert.deepEqual(chart.palaces.map((entry) => entry.door), golden.door);
  assert.deepEqual(chart.palaces.map((entry) => entry.deity), golden.deity);
  assert.ok(Object.isFrozen(chart) && chart.palaces.every(Object.isFrozen));
}

const sixty = "甲子乙丑丙寅丁卯戊辰己巳庚午辛未壬申癸酉甲戌乙亥丙子丁丑戊寅己卯庚辰辛巳壬午癸未甲申乙酉丙戌丁亥戊子己丑庚寅辛卯壬辰癸巳甲午乙未丙申丁酉戊戌己亥庚子辛丑壬寅癸卯甲辰乙巳丙午丁未戊申己酉庚戌辛亥壬子癸丑甲寅乙卯丙辰丁巳戊午己未庚申辛酉壬戌癸亥".match(/../gu)!;
const instruments = new Set(["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"]);
for (const { dun, ju } of sixJuGoldens) {
  for (const subjectPillarZh of sixty) {
    const chart = buildFaqiaoFeipan({ dun, ju, subjectPillarZh, centerLodgingPolicy: "FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1" });
    assert.deepEqual(new Set(chart.palaces.map((entry) => entry.earthInstrument)), instruments);
    assert.deepEqual(new Set(chart.palaces.map((entry) => entry.heavenInstrument)), instruments);
    assert.equal(new Set(chart.palaces.map((entry) => entry.star)).size, 9);
    assert.equal(new Set(chart.palaces.filter((entry) => entry.door).map((entry) => entry.door)).size, 8);
    assert.equal(new Set(chart.palaces.filter((entry) => entry.deity).map((entry) => entry.deity)).size, 8);
    assert.equal(palace(chart, 5).door, null);
    assert.equal(palace(chart, 5).deity, null);
  }
}

console.log("qimen three-layer science source-manifest tests passed");
