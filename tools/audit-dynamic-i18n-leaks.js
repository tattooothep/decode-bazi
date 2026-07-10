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

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find(x => x.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function splitCsv(value, fallback) {
  const s = String(value || '').trim();
  if (!s) return fallback;
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function unique(arr) {
  return Array.from(new Set(arr));
}

const LANGS = splitCsv(arg('langs', 'ja,vi,ru,ko,es'), []);
const ROUTES = splitCsv(arg('routes', '/today'), []);
const BASE = arg('base', 'http://127.0.0.1:3363');
const OUT = arg('out', '/tmp/hourkey-dynamic-i18n-leaks.json');
const SCREENSHOTS = arg('screenshots', '');
const WAIT_MS = Math.max(0, Number(arg('wait', '4500')) || 4500);
const MOBILE = arg('mobile', '0') === '1';
const AUTH = arg('auth', 'none');
const AUTH_TOKEN = arg('auth-token', '');
const SEED_BIRTH = arg('seed-birth', '0') === '1';
const SEED_PROFILE = arg('seed-profile', SEED_BIRTH ? '1' : '0') === '1';

const BIRTH_FIXTURE = {
  date: '1990-05-05',
  time: '12:30',
  gender: 'M',
  longitude: 100.5018,
  lng: 100.5018,
  birthTimeKnown: true,
  dayBoundary: '23:00'
};

const ALLOW_LINE = [
  /^hourkey\b/i,
  /^AI Sifu\b/i,
  /^Master Fusion\b/i,
  /^Premium\b/i,
  /^Free\b/i,
  /^(TH|EN|JA|VI|RU|KO|ES|繁|简|ไทย|English|繁體|简体|Tiếng Việt|日本語|Русский|한국어|Español)$/i,
  /^[A-Z]{1,3}$/i,
  /^\d+$/,
  /^[0-9:,./\-\s]+$/,
  /^[子丑寅卯辰巳午未申酉戌亥甲乙丙丁戊己庚辛壬癸用忌命盤時吉凶日月年曆奇門羅盤方位財業情健中西南北東]+$/,
];

const EN_WORDS = [
  'today','tomorrow','yesterday','chart','score','moderate','good','avoid','caution','excellent',
  'mild','positive','negative','direction','energy','current','timing','annual','helps','routine',
  'preparation','focus','rule','how','use','window','wealth','career','love','health','steady',
  'strong','signal','proceed','documents','contract','doctor','exercise','water','basic','people',
  'meet','network','color','wear','reduce','offer','sacrifice','burial','coffin','open','close',
  'loading','error','empty','sign','signing','submit','work','decision','decisions','calendar',
  'almanac','pillar','branch','stem','element','flying','star','gate','boost','neutral'
];
const EN_RE = new RegExp(`\\b(?:${EN_WORDS.join('|')})\\b`, 'i');

function stripAllowedTerms(line) {
  return String(line || '')
    .replace(/\b(hourkey|AI Sifu|Master Fusion|BaZi|Zi Wei|Qi Men|Uranian|Tongshu|Tianxing|Datepick|PromptPay|Stripe|Premium|Master|Free)\b/gi, ' ')
    .replace(/[子丑寅卯辰巳午未申酉戌亥甲乙丙丁戊己庚辛壬癸用忌命盤時吉凶日月年曆奇門羅盤方位財業情健五行十神沖害刑破合化三會三合六合黄黃曆紫白飛星董公天星]/g, ' ')
    .replace(/[0-9/:.,+%·\-–—()[\]{}|<>★☆✓✔✕×▲▼●○▾‹›←→]/g, ' ')
    .trim();
}

function hasThaiLeak(line) {
  const s = stripAllowedTerms(line);
  return /[\u0E00-\u0E7F]/.test(s);
}

function hasEnglishLeak(line, lang) {
  const s = stripAllowedTerms(line);
  if (!s || ALLOW_LINE.some(re => re.test(s))) return false;
  if (lang === 'en') return false;
  if (!EN_RE.test(s)) return false;
  const words = s.match(/[A-Za-z][A-Za-z']+/g) || [];
  const hits = words.filter(w => EN_WORDS.includes(w.toLowerCase()));
  if (['ja','ko','ru'].includes(lang)) return hits.length >= 1;
  return hits.length >= 2 || /\b(?:how to use|current timing|mild positive|your chart|basic bazi)\b/i.test(s);
}

function lineOk(line) {
  const s = String(line || '').trim();
  if (!s) return true;
  return ALLOW_LINE.some(re => re.test(s));
}

function analyzeLines(lines, lang) {
  const thai = [];
  const english = [];
  for (const raw of lines) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!line || lineOk(line)) continue;
    if (hasThaiLeak(line)) thai.push(line);
    if (hasEnglishLeak(line, lang)) english.push(line);
  }
  return {
    thai: unique(thai).slice(0, 40),
    english: unique(english).slice(0, 60)
  };
}

function safeName(value) {
  return String(value || '').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'root';
}

async function auditOne(browser, route, lang) {
  const ctxOpts = MOBILE ? { ...devices['iPhone 13'], ignoreHTTPSErrors: true } : { viewport: { width: 1365, height: 940 }, ignoreHTTPSErrors: true };
  const ctx = await browser.newContext(ctxOpts);
  if (SEED_BIRTH) {
    await ctx.addInitScript(({ lang, birth }) => {
      try {
        localStorage.setItem('hk_locale', lang);
        localStorage.setItem('hk_lang', lang);
        localStorage.setItem('hk_birth', JSON.stringify(birth));
        localStorage.setItem('hk_birth_source', 'i18n-audit');
      } catch (_) {}
    }, { lang, birth: BIRTH_FIXTURE });
  }
  if (AUTH_TOKEN) {
    await ctx.addCookies([{
      name: 'decode_auth',
      value: AUTH_TOKEN,
      url: BASE,
      httpOnly: true,
      sameSite: 'Lax',
      secure: BASE.startsWith('https://')
    }]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    const txt = msg.text();
    if (msg.type() === 'error' && !/favicon|Failed to load resource|404|401|RefererNotAllowedMapError/.test(txt)) errors.push(txt);
  });
  const url = `${BASE}${route}${route.includes('?') ? '&' : '?'}lang=${encodeURIComponent(lang)}`;
  let status = 0;
  let navError = '';
  let auth = AUTH_TOKEN ? { mode: 'token', ok: true } : { mode: AUTH, ok: AUTH === 'none' };
  try {
    if (AUTH === 'signup' && !AUTH_TOKEN) {
      const email = `i18n.audit.${Date.now()}.${Math.random().toString(16).slice(2)}@hourkey.test`;
      await page.goto(`${BASE}/signup?lang=${encodeURIComponent(lang)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      auth = await page.evaluate(async ({ email, lang, birth }) => {
        try {
          localStorage.setItem('hk_locale', lang);
          localStorage.setItem('hk_lang', lang);
          localStorage.setItem('hk_birth', JSON.stringify(birth));
        } catch (_) {}
        const res = await fetch('/api/mobile/v1/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password: 'Audit12345!', name: 'i18n Audit' })
        });
        const body = await res.json().catch(() => ({}));
        return { mode: 'signup', ok: res.ok && !!body.ok, status: res.status, email, error: body.error || null, accessToken: body.access_token || null };
      }, { email, lang, birth: BIRTH_FIXTURE });
      if (auth.accessToken) {
        await ctx.addCookies([{
          name: 'decode_auth',
          value: auth.accessToken,
          url: BASE,
          httpOnly: true,
          sameSite: 'Lax',
          secure: BASE.startsWith('https://')
        }]);
      }
      if (!auth.ok) errors.push(`auth signup failed: ${auth.status} ${auth.error || ''}`.trim());
      if (SEED_PROFILE && auth.ok) {
        auth.profile = await page.evaluate(async ({ birth }) => {
          const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: 'i18n Audit',
              nickname: 'i18n Audit',
              birthDate: birth.date,
              birthTime: birth.time,
              birthLng: birth.lng,
              birthLat: 13.7563,
              locationName: 'Bangkok',
              gender: 'male',
              birthTimeKnown: birth.birthTimeKnown,
              dayBoundary: birth.dayBoundary
            })
          });
          const body = await res.json().catch(() => ({}));
          const check = await fetch('/api/profile', { credentials: 'include', cache: 'no-store' })
            .then(r => r.json().then(j => ({ status: r.status, body: j })).catch(() => ({ status: r.status, body: {} })))
            .catch(e => ({ status: 0, body: { error: e.message } }));
          return { ok: res.ok && !!body.ok, status: res.status, error: body.error || null, profileId: body.profile?.id || null, checkStatus: check.status, profileCount: Array.isArray(check.body?.profiles) ? check.body.profiles.length : 0 };
        }, { birth: BIRTH_FIXTURE });
        if (!auth.profile.ok || !auth.profile.profileCount) errors.push(`profile seed failed: ${auth.profile.status} ${auth.profile.error || ''}`.trim());
      }
    }
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(WAIT_MS);
    await page.evaluate(async () => {
      const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y < Math.min(document.body.scrollHeight, 5000); y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
  } catch (e) {
    navError = e.message;
  }
  const data = await page.evaluate(() => {
    function visible(el) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }
    const lines = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const parent = n.parentElement;
      if (!parent || !visible(parent)) continue;
      const text = String(n.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (text) lines.push(text);
    }
    return {
      finalUrl: location.href,
      htmlLang: document.documentElement.lang || '',
      dataLang: document.documentElement.getAttribute('data-lang') || '',
      hkLocale: document.documentElement.getAttribute('data-hk-locale') || '',
      title: document.title || '',
      h1: Array.from(document.querySelectorAll('h1')).find(visible)?.textContent.trim() || '',
      lines
    };
  }).catch(e => ({ evaluateError: e.message, lines: [] }));
  let screenshot = '';
  if (SCREENSHOTS) {
    try {
      fs.mkdirSync(SCREENSHOTS, { recursive: true });
      screenshot = path.join(SCREENSHOTS, `${safeName(route)}-${lang}-${MOBILE ? 'mobile' : 'desktop'}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
    } catch (e) {
      errors.push(`screenshot failed: ${e.message}`);
    }
  }
  await ctx.close();
  const leaks = analyzeLines(data.lines || [], lang);
  const pass = !navError && status >= 200 && status < 400 && errors.length === 0 && leaks.thai.length === 0 && leaks.english.length === 0;
  return { route, lang, url, status, navError, auth, errors, screenshot, ...data, leaks, pass };
}

(async () => {
  console.error(`Dynamic i18n leak audit ${ROUTES.length} routes x ${LANGS.length} languages against ${BASE} auth=${AUTH_TOKEN ? 'token' : AUTH} seedBirth=${SEED_BIRTH ? '1' : '0'} seedProfile=${SEED_PROFILE ? '1' : '0'}`);
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  for (const route of ROUTES) {
    for (const lang of LANGS) rows.push(await auditOne(browser, route, lang));
  }
  await browser.close();
  const payload = { generatedAt: new Date().toISOString(), base: BASE, mobile: MOBILE, routes: ROUTES, langs: LANGS, rows };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const failed = rows.filter(r => !r.pass);
  console.log(`Wrote ${OUT}`);
  console.log(`Routes: ${ROUTES.length}, languages: ${LANGS.length}, failed: ${failed.length}`);
  for (const row of failed) {
    console.log(`${row.route} ${row.lang} :: thai=${row.leaks.thai.length} english=${row.leaks.english.length} errors=${row.errors.length}`);
    row.leaks.thai.slice(0, 5).forEach(x => console.log(`  TH: ${x.slice(0, 180)}`));
    row.leaks.english.slice(0, 8).forEach(x => console.log(`  EN: ${x.slice(0, 180)}`));
  }
  if (failed.length) process.exitCode = 1;
})();
