import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pages = [
  "calendar", "chart", "comparison", "datepick", "fengshui", "forecast", "heluo",
  "luopan", "master", "mygoal", "picker", "qimen", "today", "yongsennetwork", "palmistry",
];
const locales = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

for (const page of pages) {
  const html = read(`public/${page}.html`);
  const nav = html.match(/<a href="\/palmistry"[^>]*>[\s\S]*?<\/a>/)?.[0] || "";
  assert(nav.includes('data-i18n="hk.nav.palmistry"'), `${page}: palmistry nav must use shared key`);
}

const core = read("public/js/hk-i18n-core.js");
const sharedBlock = core.match(/window\.HK_I18N\['hk\.nav\.palmistry'\]\s*=\s*\{([\s\S]*?)\n\s*\};/)?.[1] || "";
for (const locale of locales) {
  assert(new RegExp(`\\b${locale}:\\s*['\"]`).test(sharedBlock), `shared nav is missing ${locale}`);
}

for (const locale of ["vi", "ja", "ko", "ru", "es"]) {
  const overlay = JSON.parse(read(`public/i18n/${locale}.json`));
  assert(overlay["*::hk.nav.palmistry"], `${locale} overlay is missing shared palmistry nav`);
}

const fusion = read("public/master-fusion.html");
assert(!fusion.includes('id="hk-fusion-summary-pdf" type="button" style="margin-left:8px" onclick="if(window.hkExportSummaryPdf)window.hkExportSummaryPdf()">📄 สร้างสรุป PDF (20 ยาม)</button>'), "Fusion AI PDF CTA is still hardcoded Thai");
for (const locale of locales) {
  assert(new RegExp(`\\b${locale}:['\"]`).test(fusion.match(/cta:\s*\{([^}]+)\}/)?.[1] || ""), `Fusion AI PDF CTA is missing ${locale}`);
}

const calendar = read("public/calendar.html");
assert(calendar.includes('id="hk-calendar-summary-pdf"') && calendar.includes('data-i18n="cal.pdf.ai"'), "Calendar AI PDF CTA must use cal.pdf.ai");
for (const locale of locales) {
  assert(new RegExp(`\\b${locale}:['"]`).test(calendar.match(/'cal\.pdf\.ai':\s*\{([^}]+)\}/)?.[1] || ""), `Calendar AI PDF CTA is missing ${locale}`);
}

const palm = read("public/palmistry.html");
const palmApp = read("public/js/palmistry-app.js");
assert(palm.includes('id="hk-palm-summary-pdf"') && palm.includes('data-i18n="rt.aiPdf"'), "Palm AI PDF CTA must use rt.aiPdf");
for (const locale of locales) {
  assert(new RegExp(`\\b${locale}:['\"]`).test(palmApp.match(/"rt\.aiPdf":\{([^}]+)\}/)?.[1] || ""), `Palm AI PDF CTA is missing ${locale}`);
}

console.log(`shared palmistry i18n: ${pages.length} pages, ${locales.length} locales, 3 AI PDF CTAs passed`);
