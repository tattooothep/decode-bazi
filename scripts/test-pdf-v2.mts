import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePdfDocumentV2 } from "../src/lib/pdf-document-v2";
import { aiSectionsFromMarkdown, assertAiSectionCount, assertEvidenceBoundMeasurements, pdfReportId } from "../src/lib/export/pdf-v2";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
let passed = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; }
};

const fixture = {
  version: "hourkey.pdf.v2" as const,
  report: { id: "HK-TEST", kind: "quick" as const, lang: "th", title: "รายงานทดสอบ", issuedAt: new Date().toISOString() },
  cover: { title: "รายงานทดสอบ", meta: [], glyph: "時" },
  pages: [{ landscape: false, blocks: [
    { type: "facts" as const, columns: 2 as const, items: [{ label: "A", value: "B" }] },
    { type: "table" as const, compact: false, columns: [{ key: "a", label: "A" }], rows: [{ a: "B" }] },
  ] }],
};

ok("PdfDocumentV2 schema accepts a valid structured report", () => assert.equal(parsePdfDocumentV2(fixture).version, "hourkey.pdf.v2"));
ok("PdfDocumentV2 rejects tables wider than six columns", () => {
  const bad = structuredClone(fixture) as any;
  bad.pages[0].blocks[1].columns = Array.from({ length: 7 }, (_, i) => ({ key: String(i), label: String(i) }));
  assert.throws(() => parsePdfDocumentV2(bad));
});
ok("AI section parser preserves the required H2 contract", () => {
  const sections = aiSectionsFromMarkdown("## One\nText\n- Item\n## Two\nText");
  assert.equal(sections.length, 2);
  assertAiSectionCount("## One\nText\n## Two\nText", 2);
  assert.throws(() => assertAiSectionCount("## One\nText", 2));
});
ok("AI measurement gate rejects invented facts", () => {
  const evidence = { date: "2026-07-10", time: "09:30", degree: 180, score: 72 };
  assert.doesNotThrow(() => assertEvidenceBoundMeasurements("Use 2026-07-10 at 09:30, facing 180° with 72/100.", evidence));
  assert.throws(() => assertEvidenceBoundMeasurements("Use 2026-07-11.", evidence));
  assert.throws(() => assertEvidenceBoundMeasurements("Confidence is 80%.", evidence));
});
ok("Report IDs are deterministic for cached evidence", () => assert.equal(pdfReportId("HKDP", { a: 1 }), pdfReportId("HKDP", { a: 1 })));

ok("Shared renderer removes fake QR and supports contextual verification", () => {
  const client = read("public/js/hk-print.js");
  const server = read("src/lib/export-pdf.ts");
  assert.match(client, /c\.qr === true && c\.qrHtml/);
  assert.match(server, /c\.qr === true && c\.qrHtml/);
  assert.doesNotMatch(client, /QR<br>/);
  assert.doesNotMatch(server, /QR<br>/);
  assert.doesNotMatch(client, /TST verified/);
  assert.doesNotMatch(server, /TST verified/);
});
ok("All three product pages expose separate quick and AI report controls", () => {
  const luopan = read("public/luopan.html");
  const datepick = read("public/datepick.html");
  const qimen = read("public/qimen.html");
  assert.match(luopan, /luopanQuickPdfBtn/); assert.match(luopan, /luopanAiPdfBtn/);
  assert.match(datepick, /dpExportPdfV2/); assert.match(datepick, /รายงาน AI · 20 ยาม/);
  assert.match(qimen, /exportQimenPdfV2/); assert.match(qimen, /รายงาน AI · 20 ยาม/);
});
ok("Luopan AI handler is registered without changing entitlement or payment code", () => {
  const route = read("src/app/api/export/summary/route.ts");
  assert.match(route, /luopan: luopanHandler/);
  assert.match(route, /const EXPORT_YAM = 20/);
});
ok("Science prompts require evidence-bound sections", () => {
  const dp = read("src/lib/export/datepick.ts");
  const qm = read("src/lib/export/qimen.ts");
  const lp = read("src/lib/export/luopan.ts");
  assert.match(dp, /assertAiSectionCount\(ai\.reply, 6\)/);
  assert.match(qm, /assertAiSectionCount\(ai\.reply, 7\)/);
  assert.match(lp, /assertAiSectionCount\(ai\.reply, 7\)/);
  assert.match(qm, /ไม่มีหลักฐาน應期ที่ engine ส่งมา/);
  assert.match(lp, /water_complete/);
  assert.match(dp, /pdfVersion: "hourkey\.pdf\.v2"/);
  assert.match(qm, /pdfVersion: "hourkey\.pdf\.v2"/);
});
ok("Accepted visual form is stored as a release contract", () => {
  const contract = read("docs/pdf/PDF_V2_DESIGN_CONTRACT.md");
  assert.match(contract, /Quick engine report/);
  assert.match(contract, /AI Sifu report \(20 yam\)/);
  assert.match(contract, /Length target: 3-5 pages/);
  assert.match(contract, /Length target: 6-8 pages/);
});

if (!process.exitCode) console.log(`\n${passed}/${passed} PDF V2 contract checks passed`);
