#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const tries = ['playwright', '/root/browser-automation/node_modules/playwright', '/root/heygen2/node_modules/playwright'];
  for (const id of tries) {
    try { return require(id); } catch (_) {}
  }
  throw new Error('Cannot find playwright');
}

const { chromium, devices } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find(x => x.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function routeFromFile(file, mode) {
  const rel = path.relative(PUBLIC, file).split(path.sep).join('/');
  if (mode === 'live') {
    if (rel === 'landing.html') return '/';
    return '/' + rel.replace(/\.html$/, '');
  }
  return '/' + rel;
}

function discoverRoutes(mode) {
  const only = arg('only', '');
  let routes = walk(PUBLIC)
    .filter(f => !path.relative(PUBLIC, f).startsWith('_preview/'))
    .map(f => routeFromFile(f, mode))
    .sort();
  if (only) routes = routes.filter(r => r.includes(only));
  return routes;
}

function thaiRatio(text) {
  const sample = String(text || '').replace(/\s+/g, '');
  if (!sample) return 0;
  const thai = (sample.match(/[\u0E00-\u0E7F]/g) || []).length;
  return thai / Math.max(sample.length, 1);
}

async function clickEnglish(page) {
  const button = page.locator('button[data-lang],a[data-lang],button[id^="lang-"],a[id^="lang-"]').filter({ hasText: /EN|English/i }).first();
  try {
    if (await button.count()) {
      await button.click({ timeout: 3000 });
      return 'button';
    }
  } catch (_) {}

  const selected = await page.evaluate(() => {
    function visible(el) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }
    const sels = Array.from(document.querySelectorAll('select')).filter(visible);
    const sel = sels.find(s => Array.from(s.options || []).some(o => /^en$/i.test(o.value || '') || /English|EN/i.test(o.textContent || '')));
    if (!sel) return false;
    const opt = Array.from(sel.options || []).find(o => /^en$/i.test(o.value || '') || /English|EN/i.test(o.textContent || ''));
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (selected) return 'select';

  await page.evaluate(() => {
    if (window.HK_LANG_STATE && window.HK_LANG_STATE.set) window.HK_LANG_STATE.set('en');
  });
  return 'programmatic';
}

async function auditOne(browser, base, route) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    const txt = msg.text();
    if (msg.type() === 'error' && !/favicon|Failed to load resource|404|401|RefererNotAllowedMapError/.test(txt)) errors.push(txt);
  });
  const url = `${base}${route}${route.includes('?') ? '&' : '?'}lang=th`;
  let status = 0, navError = '';
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(900);
  } catch (e) {
    navError = e.message;
  }
  let clickMode = 'none';
  if (!navError) {
    try {
      clickMode = await clickEnglish(page);
      if (clickMode === 'programmatic') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      }
      await page.waitForTimeout(1200);
    } catch (e) {
      errors.push('click: ' + e.message);
    }
  }
  const data = await page.evaluate(() => {
    function visible(el) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }
    function internalPageHref(href) {
      try {
        if (!href || /^(mailto:|tel:|sms:|javascript:|#)/i.test(href)) return null;
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return null;
        const p = u.pathname || '/';
        if (p.indexOf('/api/') === 0 || p.indexOf('/assets/') === 0 || p.indexOf('/js/') === 0 || p.indexOf('/css/') === 0 || p.indexOf('/i18n/') === 0) return null;
        if (/\.(png|jpe?g|webp|gif|svg|ico|mp4|webm|css|js|json|pdf|txt|xml|map|woff2?)$/i.test(p)) return null;
        return u;
      } catch (_) { return null; }
    }
    const h1 = Array.from(document.querySelectorAll('h1')).find(visible);
    const bodyText = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    const badLinks = [];
    Array.from(document.querySelectorAll('a[href]')).forEach(a => {
      const u = internalPageHref(a.getAttribute('href') || '');
      if (!u) return;
      if (u.searchParams.get('lang') !== 'en') badLinks.push(a.getAttribute('href'));
    });
    return {
      finalUrl: location.href,
      htmlLang: document.documentElement.lang || '',
      dataLang: document.documentElement.getAttribute('data-lang') || '',
      hkLocale: document.documentElement.getAttribute('data-hk-locale') || '',
      zhVariant: document.documentElement.getAttribute('data-zh-variant') || '',
      storageLocale: localStorage.getItem('hk_locale') || '',
      title: document.title || '',
      h1: h1 ? h1.innerText.trim() : '',
      bodyText,
      badLinks: badLinks.slice(0, 10),
      badLinkCount: badLinks.length
    };
  }).catch(e => ({ evaluateError: e.message }));
  await ctx.close();
  const row = { route, url, status, navError, errors, clickMode, ...data };
  const pageUrl = (() => { try { return new URL(row.finalUrl); } catch (_) { return null; } })();
  row.urlOk = !!pageUrl && pageUrl.searchParams.get('lang') === 'en';
  row.localeOk = /^en/i.test(row.htmlLang || '') || row.hkLocale === 'en' || row.storageLocale === 'en';
  row.thaiRatio = thaiRatio(row.bodyText);
  row.thaiLeak = row.bodyText && row.bodyText.length > 500 && row.thaiRatio > 0.12;
  row.linksOk = row.badLinkCount === 0;
  row.pass = !navError && status >= 200 && status < 400 && row.urlOk && row.localeOk && row.linksOk && !row.thaiLeak && !errors.length;
  return row;
}

async function pool(items, limit, fn) {
  const out = [];
  let index = 0;
  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

(async () => {
  const base = arg('base', 'http://127.0.0.1:3361');
  const mode = arg('mode', 'live');
  const concurrency = Number(arg('concurrency', '3')) || 3;
  const outFile = arg('out', '/tmp/hourkey-mobile-lang-click.json');
  const routes = discoverRoutes(mode);
  console.error(`Mobile click-auditing ${routes.length} routes against ${base}`);
  const browser = await chromium.launch({ headless: true });
  const rows = await pool(routes, concurrency, route => auditOne(browser, base, route));
  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), base, mode, routes, rows }, null, 2));
  const failed = rows.filter(r => !r.pass);
  console.log(`Wrote ${outFile}`);
  console.log(`Routes: ${routes.length}, failed: ${failed.length}`);
  for (const r of failed) {
    const reasons = [];
    if (r.navError || r.status < 200 || r.status >= 400) reasons.push('load');
    if (!r.urlOk) reasons.push('url');
    if (!r.localeOk) reasons.push('locale');
    if (!r.linksOk) reasons.push('links');
    if (r.thaiLeak) reasons.push('thai-leak');
    if (r.errors && r.errors.length) reasons.push('js-error');
    console.log(`${r.route} :: ${reasons.join(',')} :: mode=${r.clickMode} :: badLinks=${r.badLinkCount || 0} :: h1=${JSON.stringify(r.h1 || '').slice(0, 90)}`);
  }
})();
