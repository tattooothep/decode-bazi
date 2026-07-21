import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const playwrightEntry = process.env.PLAYWRIGHT_ENTRY || "/root/browser-automation/node_modules/playwright/index.js";
const playwrightModule = await import(pathToFileURL(playwrightEntry).href);
const chromium = (playwrightModule.default || playwrightModule).chromium;

const base = process.env.PDF_TEST_BASE || "http://127.0.0.1:3360";
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const palaces = [
  [1, "N", "休門", "天蓬", "九地"], [2, "SW", "死門", "天芮", "螣蛇"], [3, "E", "傷門", "天沖", "六合"],
  [4, "SE", "杜門", "天輔", "太陰"], [5, "C", "", "天禽", ""], [6, "NW", "開門", "天心", "九天"],
  [7, "W", "驚門", "天柱", "白虎"], [8, "NE", "生門", "天任", "值符"], [9, "S", "景門", "天英", "玄武"],
].map(([id, direction, door, star, deity], index) => ({
  palace_id: id, direction, door_zh: door, star_zh: star, deity_zh: deity,
  heaven_stem_zh: "甲", earth_stem_zh: "戊", display_score: 55 + index,
  beginner_reading: { label_th: index > 4 ? "เด่น" : "กลาง", summary_th: "ข้อมูลตัวอย่างจาก engine", reasons: [] },
}));

const qimenState = {
  chart: { dun_type: "yang", ju_number: 1, dun_gan_zh: "戊", yuan_cycle_zh: "上元", system_type: "chaibu", pillars: {} },
  palaces, stored_formations: [], compound_formations: [], source_formations: [],
};

const datepickState = {
  top: Array.from({ length: 5 }, (_, i) => ({
    date: `2026-07-${String(12 + i).padStart(2, "0")}`, time: `${String(9 + i).padStart(2, "0")}:00`, score: 82 - i * 4,
    science_reasons: [{ text: `Engine evidence ${i + 1}` }], matches: [`Engine evidence ${i + 1}`],
  })),
  cutSlots: [], total_scanned: 48, candidate_pool: 12, search_window: { label: "2026-07-12 - 2026-07-16" },
};

const luopanEngine = {
  ok: true,
  summary: {
    schema_version: "pdf-browser-fixture",
    top_good_degrees: [{ degree: 180, m24: "午", score: 82 }, { degree: 90, m24: "卯", score: 76 }],
    top_bad_degrees: [{ degree: 0, m24: "子", score: 38 }, { degree: 270, m24: "酉", score: 42 }],
  },
  degrees: [{ degree: 180, m24: "午", direction: "S", scoring: { final_score: 82, evidence: ["ENGINE_FIXTURE"] } }],
};

async function installRoutes(page, posts) {
  for (const name of ["datepick", "qimen", "luopan"]) {
    await page.route(`${base}/${name}`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: readFileSync(new URL(`../public/${name}.html`, import.meta.url), "utf8"),
    }));
  }
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { id: "pdf-test" } }) }));
  await page.route("**/api/account/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hour_balance: 1000 }) }));
  await page.route("**/api/luopan/profiles", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, profiles: [], active_profile_id: null }) }));
  await page.route("**/api/houses", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ houses: [], count: 0, limit: 5, plan: "trial" }) }));
  await page.route("**/api/luopan/degrees", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(luopanEngine) }));
  await page.route("**/api/fengshui-snapshot**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/api/export/summary**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      posts.push(request.postDataJSON());
      return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: "pdf-browser-test", status: "running" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "error", error: "browser_test_stop" }) });
  });
}

async function captureQuick(page, route, setup, button, expectedPages) {
  await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(900);
  await page.evaluate(({ setupSource }) => {
    // eslint-disable-next-line no-eval
    eval(setupSource);
    window.__pdfCaptured = null;
    if (!window.HKPrint?.openDocument) throw new Error("HKPrint V2 missing");
    window.HKPrint.openDocument = (doc) => { window.__pdfCaptured = doc; };
  }, { setupSource: setup });
  await page.evaluate((selector) => {
    const control = document.querySelector(selector);
    if (!(control instanceof HTMLElement)) throw new Error(`missing control ${selector}`);
    control.click();
  }, button);
  await page.waitForFunction(() => !!window.__pdfCaptured, null, { timeout: 15_000 });
  const result = await page.evaluate(() => ({
    version: window.__pdfCaptured.version,
    kind: window.__pdfCaptured.report.kind,
    pages: window.__pdfCaptured.pages.length,
    reportId: window.__pdfCaptured.report.id,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.equal(result.version, "hourkey.pdf.v2");
  assert.equal(result.kind, "quick");
  assert.equal(result.pages, expectedPages);
  assert.match(result.reportId, /^HK/);
  assert.ok(result.width <= result.viewport + 4, `horizontal overflow: ${result.width} > ${result.viewport}`);
}

async function captureAiPost(page, posts, button, pageName, nativeConfirm = false) {
  posts.length = 0;
  if (nativeConfirm) page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate((selector) => {
    const control = document.querySelector(selector);
    if (!(control instanceof HTMLElement)) throw new Error(`missing control ${selector}`);
    control.click();
  }, button);
  if (!nativeConfirm) {
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const overlays = Array.from(document.body.children).filter((el) => el instanceof HTMLElement && el.style.position === "fixed");
      const buttons = overlays.flatMap((overlay) => Array.from(overlay.querySelectorAll("button")));
      const confirm = buttons.at(-1);
      if (!(confirm instanceof HTMLElement)) throw new Error("AI confirmation control missing");
      confirm.click();
    });
  }
  const started = Date.now();
  while (!posts.length && Date.now() - started < 15_000) await page.waitForTimeout(100);
  assert.equal(posts.length, 1, `${pageName} AI POST count`);
  assert.equal(posts[0].page, pageName);
  assert.equal(posts[0].lang.length >= 2, true);
  if (pageName === "luopan") assert.equal(posts[0].inputs?.luopan?.version, "luopan_evidence_v2");
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const posts = [];
    await installRoutes(page, posts);
    await captureQuick(page, "/datepick", `window._dpLastSearch=${JSON.stringify(datepickState)};`, "#dp-pdf-btn", 4);
    console.log(`PASS ${viewport.name} datepick quick trigger`);
    await captureAiPost(page, posts, "#dp-ai-pdf-btn", "datepick");
    console.log(`PASS ${viewport.name} datepick AI trigger`);
    await captureQuick(page, "/qimen", `window._qimenLast=${JSON.stringify(qimenState)};`, "#qm-pdf-btn", 4);
    console.log(`PASS ${viewport.name} qimen quick trigger`);
    await captureAiPost(page, posts, "#qm-summary-pdf-btn", "qimen");
    console.log(`PASS ${viewport.name} qimen AI trigger`);
    await captureQuick(page, "/luopan", "", "#luopanQuickPdfBtn", 4);
    console.log(`PASS ${viewport.name} luopan quick trigger`);
    await captureAiPost(page, posts, "#luopanAiPdfBtn", "luopan", true);
    console.log(`PASS ${viewport.name} luopan AI trigger`);
    await context.close();
  }
} finally {
  await browser.close();
}
