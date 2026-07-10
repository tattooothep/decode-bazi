import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { SignJWT } from "jose";
import { q } from "../src/lib/db.ts";
import { chromium } from "/root/.npm/_npx/c61c9351a0dbcfa7/node_modules/playwright/index.mjs";

if (process.env.HK_ALLOW_FIXTURE_DB !== "1") {
  throw new Error("Set HK_ALLOW_FIXTURE_DB=1; fixtures are temporary and deleted in finally");
}

const BASE = process.env.HK_MATRIX_BASE || "http://127.0.0.1:3360";
const screenshotDir = process.env.HK_MATRIX_SCREENSHOT_DIR || "";
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
const authSecret = process.env.AUTH_SECRET;
assert.ok(authSecret && authSecret.length >= 16, "AUTH_SECRET env is required");
const secret = new TextEncoder().encode(authSecret);

async function signFixtureSession(fixture) {
  return new SignJWT({
    userId: fixture.id,
    email: fixture.email,
    orgId: null,
    sv: 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}
const requestedPages = (process.env.HK_MATRIX_PAGES || "chart,today,calendar,network,fengshui")
  .split(",").map((item) => item.trim()).filter(Boolean);
const requestedTiers = new Set((process.env.HK_MATRIX_TIERS || "guest,free,trial,premium,master,expired")
  .split(",").map((item) => item.trim()).filter(Boolean));
const requestedViewports = new Set((process.env.HK_MATRIX_VIEWPORTS || "mobile,desktop")
  .split(",").map((item) => item.trim()).filter(Boolean));
const paths = {
  chart: "/chart",
  today: "/today",
  calendar: "/calendar",
  network: "/yongsennetwork",
  qimen: "/qimen",
  forecast: "/forecast",
  sifu: "/master",
  datepick: "/datepick",
  fengshui: "/fengshui",
  luopan: "/luopan",
  palmistry: "/palmistry",
};
const visibleBadgeLimits = { today: 0, qimen: 2, datepick: 1, luopan: 3, chart: 5, network: 8, fengshui: 4 };
for (const page of requestedPages) assert.ok(paths[page], `unknown matrix page ${page}`);

const now = Date.now();
const fixtures = [
  { state: "guest", plan: "guest", guest: true, tier: "free", trial: null, sub: null },
  { state: "free", plan: "free", tier: "free", trial: new Date(now - 86400000), sub: null },
  { state: "trial", plan: "trial", tier: "free", trial: new Date(now + 7 * 86400000), sub: null },
  { state: "premium", plan: "premium", tier: "premium", trial: null, sub: new Date(now + 20 * 86400000) },
  { state: "master", plan: "master", tier: "master", trial: null, sub: new Date(now + 20 * 86400000) },
  { state: "expired", plan: "free", tier: "premium", trial: new Date(now - 20 * 86400000), sub: new Date(now - 86400000) },
].filter((fixture) => requestedTiers.has(fixture.state))
  .map((fixture) => ({ ...fixture, id: randomUUID(), email: `codex.matrix.${fixture.state}.${Date.now()}@example.invalid` }));

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
].filter((viewport) => requestedViewports.has(viewport.name));
const birth = {
  name: "Matrix Fixture",
  date: "1990-01-15",
  time: "12:00",
  gender: "M",
  longitude: 100.5018,
  lng: 100.5018,
  latitude: 13.7563,
  birthTimeKnown: true,
  dayBoundary: "23:00",
};

let browser;
let checks = 0;
try {
  for (const fixture of fixtures) {
    if (fixture.guest) continue;
    await q(
      `INSERT INTO users(id,email,name,tier,hour_balance,is_active,email_verified,trial_ends_at,sub_expires_at,created_at)
       VALUES($1,$2,$3,$4,10000,true,true,$5,$6,now())`,
      [fixture.id, fixture.email, `Matrix ${fixture.state}`, fixture.tier, fixture.trial, fixture.sub]
    );
    fixture.token = await signFixtureSession(fixture);
  }

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HK_CHROMIUM || "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  for (const fixture of fixtures) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      if (!fixture.guest) await context.addCookies([{ name: "decode_auth", value: fixture.token, url: BASE, httpOnly: true, sameSite: "Lax" }]);
      await context.addInitScript(({ birth }) => {
        localStorage.setItem("hk_birth", JSON.stringify(birth));
        localStorage.setItem("hk_locale", "en");
        localStorage.setItem("hk_lang", "en");
        localStorage.setItem("hk_network_coach_v1", "1");
        localStorage.setItem("hk_fengshui_help_seen", "1");
      }, { birth });

      for (const pageName of requestedPages) {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const response = await page.goto(BASE + paths[pageName], { waitUntil: "domcontentloaded", timeout: 30000 });
        assert.ok(response && response.status() < 500, `${fixture.plan}/${viewport.name}/${pageName} HTTP`);
        if (fixture.guest) {
          await page.waitForTimeout(1500);
          const guestPath = new URL(page.url()).pathname;
          if (["/login", "/signup"].includes(guestPath)) {
            assert.equal(pageErrors.length, 0, `guest/${viewport.name}/${pageName} page errors: ${pageErrors.join(" | ")}`);
            checks += 2;
            await page.close();
            continue;
          }
          assert.equal(guestPath, paths[pageName], `guest/${viewport.name}/${pageName} public path`);
        }
        let productReady = false;
        for (let attempt = 0; attempt < 20 && !productReady; attempt += 1) {
          productReady = await page.evaluate(() => window.HK_PRODUCT?.ready === true);
          if (!productReady) await page.waitForTimeout(500);
        }
        assert.equal(productReady, true, `${fixture.plan}/${viewport.name}/${pageName} product ready timeout`);
        await page.waitForTimeout(pageName === "chart" ? 2500 : 1000);
        const state = await page.evaluate(() => ({
          plan: window.HK_PRODUCT?.plan || null,
          ready: !!window.HK_PRODUCT?.ready,
          locks: document.querySelectorAll("[data-locked='1']").length,
          visibleLockBadges: document.querySelectorAll(".hk-lock-preview-badge").length,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          overflowElements: Array.from(document.querySelectorAll("body *"))
            .map((el) => {
              const rect = el.getBoundingClientRect();
              return { tag: el.tagName, id: el.id, cls: String(el.className || "").slice(0, 100), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
            })
            .filter((item) => item.right > window.innerWidth + 2 || item.left < -2)
            .sort((a, b) => b.right - a.right)
            .slice(0, 8),
          boxes: [document.documentElement, document.body, document.querySelector(".topbar"), document.querySelector(".nav")]
            .filter(Boolean)
            .map((el) => ({ tag: el.tagName, cls: String(el.className || ""), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowX: getComputedStyle(el).overflowX })),
          path: location.pathname,
        }));
        console.log(JSON.stringify({ accountState: fixture.state, plan: fixture.plan, viewport: viewport.name, page: pageName, locks: state.locks, visibleLockBadges: state.visibleLockBadges, overflow: state.overflow, path: state.path }));
        assert.equal(state.ready, true, `${fixture.plan}/${viewport.name}/${pageName} product ready`);
        assert.equal(state.plan, fixture.guest ? "guest" : fixture.plan, `${fixture.state}/${viewport.name}/${pageName} plan`);
        assert.ok(state.overflow <= 2, `${fixture.plan}/${viewport.name}/${pageName} overflow=${state.overflow}`);
        assert.equal(pageErrors.length, 0, `${fixture.plan}/${viewport.name}/${pageName} page errors: ${pageErrors.join(" | ")}`);
        if (fixture.plan === "master") {
          assert.equal(state.visibleLockBadges, 0, `${fixture.plan}/${viewport.name}/${pageName} has no visible locks`);
        } else if (visibleBadgeLimits[pageName] != null) {
          assert.ok(state.visibleLockBadges <= visibleBadgeLimits[pageName], `${fixture.plan}/${viewport.name}/${pageName} visible locks are grouped`);
        }
        if (fixture.plan === "free" && viewport.name === "desktop") {
          const firstVisibleLock = page.locator("[data-locked='1']:visible").first();
          if (await firstVisibleLock.count()) {
            await firstVisibleLock.click({ force: true });
            assert.equal(await page.locator("#hk-access-modal").count(), 1, `${pageName} opens shared access dialog`);
            await page.keyboard.press("Escape");
          }
        }
        if (screenshotDir) {
          await page.screenshot({
            path: `${screenshotDir}/${fixture.state}-${viewport.name}-${pageName}.png`,
            fullPage: true,
          });
        }
        checks += 5;
        await page.close();
      }
      await context.close();
    }
  }
  console.log(`browser matrix PASS · ${checks} checks · ${fixtures.length} account states · ${viewports.length} viewports · ${requestedPages.length} pages`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [fixtures.filter((fixture) => !fixture.guest).map((fixture) => fixture.id)]).catch(() => {});
}
