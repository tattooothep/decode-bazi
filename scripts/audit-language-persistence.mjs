#!/usr/bin/env node
/**
 * Audit Hourkey language persistence and visible language leaks.
 *
 * env:
 *   LANG_AUDIT_BASE=http://127.0.0.1:3350
 *   LANG_AUDIT_COOKIE=<decode_auth token> or LANG_AUDIT_EMAIL/PASSWORD
 *   GATE_PW_DIR=/path/to/node_modules
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const BASE = (process.env.LANG_AUDIT_BASE || process.env.GATE_BASE || "http://127.0.0.1:3350").replace(/\/$/, "");
const THAI_RE = /[฀-๿]/;
const LANGS = (process.env.LANG_AUDIT_LANGS || "en,zh").split(",").map((s) => s.trim()).filter(Boolean);
const SKIP_PUBLIC = new Set(["offline.html", "reset-password.html"]);
const CLEAN_PUBLIC_ROUTES = new Set([
  "/signup", "/ask", "/input", "/goal", "/chart", "/today", "/yongsennetwork", "/qimen", "/calendar",
  "/master", "/master-fusion", "/book", "/mygoal", "/picker", "/heluo", "/fengshui", "/datepick",
  "/tianxing", "/comparison", "/forecast", "/account", "/pricing", "/compass", "/compass-studio",
  "/luopan", "/fengshui-pro", "/katakagae", "/auspicious", "/solar-terms", "/accuracy",
  "/methodology", "/uranian",
]);
const EXTRA_REWRITE_ROUTES = [
  "/network", "/starhour", "/compare", "/divine", "/why-us", "/yongshen-method", "/article/geometry", "/dial",
];

async function loadPlaywright() {
  const candidates = [
    "playwright",
    ...(process.env.GATE_PW_DIR ? [join(process.env.GATE_PW_DIR, "playwright", "index.mjs")] : []),
    "/tmp/claude-0/-root/075fcd4e-9325-4c85-b53c-69c1c43d55c6/scratchpad/node_modules/playwright/index.mjs",
  ];
  for (const c of candidates) {
    try { return await import(c); } catch {}
  }
  throw new Error("Playwright not found. Set GATE_PW_DIR to a node_modules folder containing playwright.");
}

async function loginCookie() {
  if (process.env.LANG_AUDIT_COOKIE) return process.env.LANG_AUDIT_COOKIE;
  let email = process.env.LANG_AUDIT_EMAIL;
  let password = process.env.LANG_AUDIT_PASSWORD;
  if ((!email || !password) && existsSync(join(REPO, ".gate-account.json"))) {
    const j = JSON.parse(readFileSync(join(REPO, ".gate-account.json"), "utf8"));
    email = email || j.email;
    password = password || j.password;
  }
  if (!email || !password) {
    throw new Error("Missing auth. Set LANG_AUDIT_COOKIE or LANG_AUDIT_EMAIL/LANG_AUDIT_PASSWORD.");
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${text.slice(0, 160)}`);
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/decode_auth=([^;]+)/);
  if (!m) throw new Error("Login did not return decode_auth cookie.");
  return m[1];
}

function publicHtmlUrls() {
  if (process.env.LANG_AUDIT_URLS) {
    return process.env.LANG_AUDIT_URLS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const out = new Set(["/"]);
  const files = [];
  function walk(dir) {
    for (const ent of readdirSync(dir)) {
      const full = join(dir, ent);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(join(REPO, "public"));
  for (const file of files) {
    const rel = file.slice(join(REPO, "public").length).replace(/\\/g, "/");
    const name = basename(file);
    if (!name.endsWith(".html") || SKIP_PUBLIC.has(name) || rel.includes("/_preview/")) continue;
    if (name === "landing.html" || name === "landing-full.html" || name === "landing-v2.html") continue;
    out.add(rel);
    const clean = rel.replace(/\.html$/, "");
    if (CLEAN_PUBLIC_ROUTES.has(clean)) out.add(clean);
  }
  EXTRA_REWRITE_ROUTES.forEach((u) => out.add(u));
  return [...out].sort();
}

function withLang(path, lang) {
  const url = new URL(path, BASE);
  url.searchParams.set("lang", lang);
  return url.toString();
}

function expected(lang) {
  return {
    storage: lang === "zh" ? "zh" : lang,
    app: lang === "zh" ? "zh" : lang,
    htmlPrefix: lang === "zh" ? "zh" : lang,
  };
}

function samples(text, max = 3) {
  const found = [];
  const seen = new Set();
  const scrubbed = String(text || "")
    .replace(/฿/g, "")
    .replace(/ไทย/g, "");
  for (const m of scrubbed.matchAll(/[฀-๿][^\n]{0,60}/g)) {
    const s = m[0].trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    found.push(s);
    if (found.length >= max) break;
  }
  return found;
}

async function checkState(page, lang, phase) {
  const state = await page.evaluate(() => {
    const USER_TEXT_SELECTOR = "[data-user-text],[data-user-name],.hk-um-name,.hk-um-email,.user-name,.profile-name,.person-name";
    const bodyText = (() => {
      if (!document.body) return "";
      const skipTags = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
      const isHidden = (el) => {
        for (let cur = el; cur && cur !== document.body; cur = cur.parentElement) {
          if (cur.closest && cur.closest(USER_TEXT_SELECTOR)) return true;
          if (cur.hidden || cur.getAttribute("aria-hidden") === "true") return true;
          const st = getComputedStyle(cur);
          if (st.display === "none" || st.visibility === "hidden" || st.visibility === "collapse") return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || skipTags.has(parent.tagName) || isHidden(parent)) return NodeFilter.FILTER_REJECT;
          return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      const parts = [];
      while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
      return parts.join("\n");
    })();
    const attrText = [...document.querySelectorAll("[placeholder],[title],[aria-label],option")]
      .filter((el) => !el.closest(USER_TEXT_SELECTOR) && !el.matches(USER_TEXT_SELECTOR))
      .map((el) => [el.getAttribute("placeholder"), el.getAttribute("title"), el.getAttribute("aria-label"), el.selected ? el.textContent : ""].filter(Boolean).join(" "))
      .join("\n");
    const st = window.HK_LANG_STATE || (window.HK && window.HK.langState);
    return {
      htmlLang: document.documentElement.getAttribute("lang") || "",
      dataLang: document.documentElement.getAttribute("data-lang") || "",
      hkLocale: localStorage.getItem("hk_locale") || "",
      hkLang: localStorage.getItem("hk_lang") || "",
      stateRaw: st && typeof st.raw === "function" ? st.raw() : "",
      stateSifu: st && typeof st.sifu === "function" ? st.sifu() : "",
      text: bodyText,
      attrs: attrText,
      path: location.pathname + location.search,
    };
  });
  const exp = expected(lang);
  const fails = [];
  if (!state.htmlLang.toLowerCase().startsWith(exp.htmlPrefix)) fails.push(`html.lang=${state.htmlLang}`);
  if (state.dataLang !== exp.app) fails.push(`data-lang=${state.dataLang}`);
  if (state.hkLocale !== exp.storage) fails.push(`hk_locale=${state.hkLocale}`);
  if (state.hkLang !== exp.storage) fails.push(`hk_lang=${state.hkLang}`);
  if (!state.stateRaw) fails.push("stateRaw=missing");
  else if (state.stateRaw !== exp.storage) fails.push(`stateRaw=${state.stateRaw}`);
  if (!state.stateSifu) fails.push("stateSifu=missing");
  else if (state.stateSifu !== exp.storage) fails.push(`stateSifu=${state.stateSifu}`);
  const thaiText = `${state.text}\n${state.attrs}`
    .replace(/฿/g, "")
    .replace(/ไทย/g, "");
  const thai = THAI_RE.test(thaiText);
  return {
    ok: fails.length === 0 && !thai,
    phase,
    path: state.path,
    fails,
    thaiSamples: thai ? samples(thaiText) : [],
  };
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function driveDynamicChecks(page, path, lang) {
  const url = new URL(path, BASE);
  const cleanPath = url.pathname.replace(/\.html$/, "");
  const checks = [];
  if (cleanPath === "/datepick") {
    await page.waitForSelector("#btnSearch", { timeout: 20000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector("#btnSearch");
      return btn && !btn.disabled;
    }, { timeout: 45000 }).catch(() => {});
    await page.click("#btnSearch", { timeout: 10000 });
    await page.waitForFunction(() => {
      const el = document.querySelector("#resultsList");
      if (!el) return false;
      if (el.querySelector(".loading")) return false;
      return !!window._dpLastSearch && !!(el.querySelector(".result-card,.result-row,.empty-state") || (el.innerText || "").trim().length > 20);
    }, { timeout: 60000 });
    await settle(page);
    checks.push(await checkState(page, lang, "datepick-search"));
  }
  return checks;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const cookie = await loginCookie();
  const urls = publicHtmlUrls();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const lang of LANGS) {
      for (const path of urls) {
        const context = await browser.newContext({ baseURL: BASE });
        await context.addCookies([{ name: "decode_auth", value: cookie, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
        await context.addInitScript((targetLang) => {
          try { if (window.top !== window) return; } catch {}
          localStorage.setItem("hk_locale", "th");
          localStorage.setItem("hk_lang", targetLang === "zh" ? "zh" : targetLang);
          localStorage.setItem("hk_zh_variant", "hant");
        }, lang);
        const page = await context.newPage();
        page.on("pageerror", (err) => failures.push({ lang, path, phase: "pageerror", detail: err.message }));
        page.on("response", (res) => {
          if (res.status() === 404 && /hk-lang-state|hk-i18n-core|i18n\/.+\.json/.test(res.url())) {
            failures.push({ lang, path, phase: "network", detail: `404 ${res.url()}` });
          }
        });
        try {
          const res = await page.goto(withLang(path, lang), { waitUntil: "domcontentloaded", timeout: 45000 });
          if (res && res.status() >= 400) {
            failures.push({ lang, path, phase: "http", detail: `${res.status()} ${withLang(path, lang)}` });
            continue;
          }
          await settle(page);
          const first = await checkState(page, lang, "query");
          if (!first.ok) failures.push({ lang, path, ...first });
          for (const dynamicCheck of await driveDynamicChecks(page, path, lang)) {
            if (!dynamicCheck.ok) failures.push({ lang, path, ...dynamicCheck });
          }
          await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded", timeout: 45000 });
          await settle(page);
          const nav = await checkState(page, lang, "navigation");
          if (!nav.ok) failures.push({ lang, path: `${path} -> /today`, ...nav });
        } catch (err) {
          failures.push({ lang, path, phase: "exception", detail: err.message });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    for (const f of failures.slice(0, 80)) {
      console.error(`[FAIL] ${f.lang} ${f.path} ${f.phase || ""} ${f.detail || ""}`);
      if (f.fails?.length) console.error(`  state: ${f.fails.join(", ")}`);
      if (f.thaiSamples?.length) console.error(`  thai: ${f.thaiSamples.join(" | ")}`);
    }
    console.error(`ALL PASS: false · FAIL ${failures.length}`);
    process.exit(1);
  }
  console.log(`ALL PASS · FAIL 0 · checked ${urls.length} URLs × ${LANGS.length} langs`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(2);
});
