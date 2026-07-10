#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const tries = [
    'playwright',
    '/root/browser-automation/node_modules/playwright',
    '/root/heygen2/node_modules/playwright'
  ];
  for (const id of tries) {
    try { return require(id); } catch (_) {}
  }
  throw new Error('Cannot find playwright. Set NODE_PATH or install playwright.');
}

const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const LANGS = ['th', 'en', 'zh', 'cn', 'vi', 'ja', 'ru', 'ko', 'es'];
const CODES = new Set(LANGS);

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

function normCode(x) {
  x = String(x || '').trim().toLowerCase().replace('_', '-');
  if (!x) return '';
  if (x === 'zh-cn' || x === 'zh-hans' || x === 'hans') return 'cn';
  if (x === 'zh-tw' || x === 'zh-hk' || x === 'zh-hant' || x === 'hant') return 'zh';
  if (x.indexOf('zh') === 0) return 'zh';
  return CODES.has(x) ? x : '';
}

function discoverRoutes(mode) {
  const includePreview = arg('include-preview', '0') === '1';
  const only = arg('only', '');
  const max = Number(arg('max', '0')) || 0;
  let routes = walk(PUBLIC)
    .filter(f => includePreview || !path.relative(PUBLIC, f).startsWith('_preview/'))
    .map(f => routeFromFile(f, mode))
    .sort();
  if (only) routes = routes.filter(r => r.includes(only));
  if (max) routes = routes.slice(0, max);
  return routes;
}

function thaiRatio(text) {
  const sample = String(text || '').replace(/\s+/g, '');
  if (!sample) return 0;
  const thai = (sample.match(/[\u0E00-\u0E7F]/g) || []).length;
  return thai / Math.max(sample.length, 1);
}

function similarity(a, b) {
  a = String(a || '').slice(0, 5000).replace(/\s+/g, ' ').trim();
  b = String(b || '').slice(0, 5000).replace(/\s+/g, ' ').trim();
  if (!a || !b) return 0;
  const grams = s => {
    const set = new Set();
    for (let i = 0; i < s.length - 2; i += 3) set.add(s.slice(i, i + 3));
    return set;
  };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, Math.min(A.size, B.size));
}

function expectedOk(row) {
  if (!row.ok) return false;
  const html = String(row.htmlLang || '').toLowerCase();
  const hk = normCode(row.hkLocale || row.storageLocale || row.rawState || row.dataLang || '');
  if (row.lang === 'cn') return html === 'zh-hans' || row.zhVariant === 'cn' || hk === 'cn';
  if (row.lang === 'zh') return html === 'zh-hant' || html === 'zh' || hk === 'zh';
  if (row.lang === 'th' || row.lang === 'en') return html.indexOf(row.lang) === 0 || hk === row.lang || row.dataLang === row.lang;
  return html.indexOf(row.lang) === 0 || hk === row.lang || row.storageLocale === row.lang;
}

async function auditOne(browser, base, route, lang) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    const t = msg.type();
    const txt = msg.text();
    if (t === 'error' && !/favicon|Failed to load resource|404/.test(txt)) errors.push(txt);
  });
  const url = `${base}${route}${route.includes('?') ? '&' : '?'}lang=${encodeURIComponent(lang)}`;
  let status = 0;
  let navError = '';
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(900);
  } catch (e) {
    navError = e.message;
  }
  let data = {};
  try {
    data = await page.evaluate(() => {
      function visible(el) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }
      function code(x) {
        x = String(x || '').trim().toLowerCase().replace('_', '-');
        if (x === 'zh-cn' || x === 'zh-hans' || x === 'cn') return 'cn';
        if (x === 'zh-hant' || x === 'zh-tw' || x === 'zh-hk') return 'zh';
        if (x.indexOf('zh') === 0) return 'zh';
        return ['th','en','vi','ja','ru','ko','es'].indexOf(x) >= 0 ? x : '';
      }
      const found = new Set();
      document.querySelectorAll('button[data-lang],[role="button"][data-lang],a[data-lang]').forEach(el => {
        if (visible(el)) { const c = code(el.getAttribute('data-lang')); if (c) found.add(c); }
      });
      document.querySelectorAll('button[id^="lang-"],a[id^="lang-"]').forEach(el => {
        if (visible(el)) { const c = code(el.id.replace(/^lang-/, '')); if (c) found.add(c); }
      });
      document.querySelectorAll('select').forEach(sel => {
        const id = String(sel.id || sel.name || sel.className || '').toLowerCase();
        const opts = Array.from(sel.options || []).map(o => code(o.value)).filter(Boolean);
        if ((/lang|locale/.test(id) || opts.length >= 3) && visible(sel)) opts.forEach(c => found.add(c));
      });
      const h1 = Array.from(document.querySelectorAll('h1')).find(visible);
      let rawState = '';
      try { rawState = window.HK_LANG_STATE && window.HK_LANG_STATE.raw ? window.HK_LANG_STATE.raw() : ''; } catch (_) {}
      let storageLocale = '', storageLang = '';
      try { storageLocale = localStorage.getItem('hk_locale') || ''; storageLang = localStorage.getItem('hk_lang') || ''; } catch (_) {}
      return {
        htmlLang: document.documentElement.getAttribute('lang') || '',
        dataLang: document.documentElement.getAttribute('data-lang') || '',
        hkLocale: document.documentElement.getAttribute('data-hk-locale') || '',
        zhVariant: document.documentElement.getAttribute('data-zh-variant') || '',
        rawState,
        storageLocale,
        storageLang,
        title: document.title || '',
        h1: h1 ? h1.textContent.trim() : '',
        controlCodes: Array.from(found).sort(),
        bodyText: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 7000)
      };
    });
  } catch (e) {
    errors.push('evaluate: ' + e.message);
  }
  await ctx.close();
  const row = {
    route, lang, url, status,
    ok: !navError && status >= 200 && status < 400,
    navError,
    errors,
    ...data
  };
  row.localeOk = expectedOk(row);
  row.controlCount = row.controlCodes ? row.controlCodes.length : 0;
  row.controlOk = row.controlCount === 0 || LANGS.every(c => row.controlCodes.includes(c));
  row.thaiRatio = thaiRatio(row.bodyText);
  row.thaiLeak = !['th'].includes(lang) && row.bodyText && row.bodyText.length > 500 && row.thaiRatio > 0.12;
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
  const base = arg('base', 'http://127.0.0.1:19091');
  const mode = arg('mode', 'static');
  const concurrency = Number(arg('concurrency', '4')) || 4;
  const outFile = arg('out', '/tmp/hourkey-i18n9-audit.json');
  const routes = discoverRoutes(mode);
  const jobs = [];
  for (const route of routes) for (const lang of LANGS) jobs.push({ route, lang });

  console.error(`Auditing ${routes.length} routes x ${LANGS.length} languages (${jobs.length} loads) against ${base}`);
  const browser = await chromium.launch({ headless: true });
  const rows = await pool(jobs, concurrency, job => auditOne(browser, base, job.route, job.lang));
  await browser.close();

  const byRoute = {};
  for (const row of rows) {
    byRoute[row.route] = byRoute[row.route] || {};
    byRoute[row.route][row.lang] = row;
  }
  for (const route of Object.keys(byRoute)) {
    const th = byRoute[route].th && byRoute[route].th.bodyText;
    const en = byRoute[route].en && byRoute[route].en.bodyText;
    for (const lang of LANGS) {
      const row = byRoute[route][lang];
      row.similarToTh = lang === 'th' ? 1 : similarity(th, row.bodyText);
      row.similarToEn = lang === 'en' ? 1 : similarity(en, row.bodyText);
      row.sameAsThai = lang !== 'th' && row.similarToTh > 0.92;
      row.sameAsEnglish = !['th','en'].includes(lang) && row.similarToEn > 0.92;
      row.pass = row.ok && row.localeOk && row.controlOk && !row.thaiLeak && !row.sameAsThai && row.errors.length === 0;
    }
  }

  const failed = rows.filter(r => !r.pass);
  const routeSummary = routes.map(route => {
    const rs = LANGS.map(l => byRoute[route][l]);
    const reasons = new Set();
    for (const r of rs) {
      if (!r.ok) reasons.add('load');
      if (!r.localeOk) reasons.add('locale');
      if (!r.controlOk) reasons.add('control');
      if (r.errors.length) reasons.add('js-error');
      if (r.thaiLeak) reasons.add('thai-leak');
      if (r.sameAsThai) reasons.add('same-as-th');
    }
    return {
      route,
      pass: rs.every(r => r.pass),
      reasons: Array.from(reasons).sort(),
      controlCodes: Array.from(new Set(rs.flatMap(r => r.controlCodes || []))).sort(),
      failedLangs: rs.filter(r => !r.pass).map(r => r.lang)
    };
  });

  const payload = { generatedAt: new Date().toISOString(), base, mode, langs: LANGS, routes, routeSummary, rows };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outFile}`);
  console.log(`Routes: ${routes.length}, loads: ${rows.length}, failed loads/checks: ${failed.length}`);
  for (const s of routeSummary.filter(x => !x.pass)) {
    console.log(`${s.route} :: ${s.reasons.join(',') || 'unknown'} :: failed=${s.failedLangs.join(',')} :: controls=${s.controlCodes.join('|') || '-'}`);
  }
})().catch(err => {
  console.error(err && err.stack || err);
  process.exit(1);
});
