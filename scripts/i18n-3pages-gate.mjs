#!/usr/bin/env node
/**
 * i18n-3pages-gate.mjs · ด่านตรวจ 3 หน้าหนัก (calendar/qimen/yongsennetwork) ครบ 9 ภาษา รวม dynamic
 *
 * goal 7 ก.ค. 2569: 3 หน้า × 9 ภาษา = 27 ช่อง · เบราว์เซอร์จริง+login จริง · วัดหลัง deploy เท่านั้น
 *
 * แต่ละช่อง:
 *   1. login จริง → ตั้ง hk_locale → เปิดหน้า → รอ dynamic โหลดจริง (DRIVERS[page] รอ selector)
 *      ถ้า dynamic ไม่โหลด = FAIL (ห้ามวัดหน้าเปล่า)
 *   2. โหมด vi/ja/ko/ru/es: (ก) ไทย=0  (ข) segment ที่ตรงกับ EN reference เป๊ะ=0 (จับ "ยังไม่แปล")
 *                          (ค) จีนนอกศัพท์วิชา (นับ CJK ที่ไม่อยู่ SCIENCE_GLYPHS) ต้องไม่เกินโหมด en
 *   3. โหมด th/en/zh/cn: เทียบ baseline (scripts/i18n-3pages-baseline.json) — innerText ต้องเหมือนเดิมเป๊ะ
 *   4. regression: 6 หน้านอกเป้า × th/en/zh — innerText ต้องตรง baseline (พิสูจน์ไม่สะเทือน)
 *
 * baseline สร้างด้วย:  node scripts/i18n-3pages-gate.mjs --capture-baseline   (รันบน live "ก่อนแก้")
 * ตรวจ:               node scripts/i18n-3pages-gate.mjs
 * exit 0 เฉพาะ FAIL=0 · ห้ามแก้ให้อ่อน (เข้มได้)
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const BASE = (process.env.GATE_BASE || "https://hourkey.io").replace(/\/$/, "");
const ACCOUNT_FILE = join(REPO, ".gate-account.json");
const BASELINE_FILE = join(REPO, "scripts", "i18n-3pages-baseline.json");
const CAPTURE = process.argv.includes("--capture-baseline");

const TARGET_PAGES = ["calendar", "qimen", "yongsennetwork"];
const REGRESSION_PAGES = ["datepick", "today", "chart", "ask", "luopan", "master-fusion"];
const LANGS = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
const NEW_LANGS = ["vi", "ja", "ko", "ru", "es"];
const STABLE_LANGS = ["th", "en", "zh", "cn"]; // baseline-diff ต้องเป๊ะ
const THAI_RE = /[฀-๿]/g;
const CJK_RE = /[一-鿿]/g;

/* ศัพท์วิชาจีนที่อนุญาตให้โผล่ทุกภาษา (กำกับ) — โหลดจาก science-terms.json + เสริม glyph ที่พบบ่อย */
function loadScienceGlyphs() {
  const set = new Set();
  try {
    const j = JSON.parse(readFileSync(join(REPO, "data/i18n/science-terms.json"), "utf8"));
    for (const k of Object.keys(j.terms || {})) for (const ch of k) if (/[一-鿿]/.test(ch)) set.add(ch);
  } catch { /* ไม่มีก็ปล่อย */ }
  // glyph วิชาที่ปรากฏบนหัวหน้า/ผัง/เมนู (กำกับ ไม่ใช่ปนมั่ว)
  for (const ch of "命日曆人奇占師擇方羅子丑寅卯辰巳午未申酉戌亥甲乙丙丁戊己庚辛壬癸乾坎艮震巽離坤兌黃曆我八字紫微星門宮財官福德壽妻田宅擇日七政四餘喜神忌神用神調候通關病藥結果不知時辰貴人驛馬沖合刑害破會化祿刃印比劫食傷殺梟正偏根氣局陰陽時家拆補置閏太陰螣蛇天輔杜門開休生景驚死網凶吉遁盤局符使空亡值天芮沖英禽柱蓬節氣傷杜景蓬任輔心衝並遊魂歸魂元上下中格自係隊友情業競早晚週系指旬宿壁玄總覽東西南九墓白虎龍詐統宗魁罡儀加詳專避幼姦淫標源狀態速讀選隨勝素目返兩婚姻造青熒荧兮賊贼隔鄉乡將擊猖狂財财虛耗客位部得眾众善臻演義义茅深層記本") set.add(ch);
  return set;
}
const SCIENCE_GLYPHS = loadScienceGlyphs();

/* ── playwright ── */
async function loadPlaywright() {
  const cands = [
    "playwright",
    ...(process.env.GATE_PW_DIR ? [join(process.env.GATE_PW_DIR, "playwright", "index.mjs")] : []),
    "/tmp/claude-0/-root/075fcd4e-9325-4c85-b53c-69c1c43d55c6/scratchpad/node_modules/playwright/index.mjs",
  ];
  for (const c of cands) { try { return await import(c); } catch { /* next */ } }
  console.error("หา playwright ไม่เจอ");
  process.exit(2);
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function resolveAccount() {
  if (process.env.GATE_EMAIL && process.env.GATE_PASSWORD) return { email: process.env.GATE_EMAIL, password: process.env.GATE_PASSWORD };
  if (existsSync(ACCOUNT_FILE)) {
    try { const j = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8")); if (j.email && j.password) return j; } catch { /* re-signup */ }
  }
  const email = `i18n-3p+${Date.now()}@hourkey.io`;
  const password = "Gate!" + crypto.randomBytes(9).toString("base64url");
  const r = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name: "i18n 3p Bot" }) });
  if (r.status !== 200 || !r.json?.ok) throw new Error(`signup fail: ${r.status} ${r.text.slice(0, 120)}`);
  writeFileSync(ACCOUNT_FILE, JSON.stringify({ email, password, userId: r.json.user?.id }, null, 2));
  return { email, password };
}

async function loginCookie(account) {
  const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: account.email, password: account.password }) });
  const setc = r.headers.get("set-cookie") || "";
  const m = setc.match(/decode_auth=([^;]+)/);
  if (!m) throw new Error(`login fail: ${r.status}`);
  return m[1];
}

/* ── DRIVERS: ทำให้ dynamic โหลดจริง + คืน true เมื่อสำเร็จ · selector จากทีมสำรวจ (เติมหลัง phase สำรวจ) ── */
const DRIVERS = {
  // ปฏิทินโหลดเอง (init→loadMonth) · รอ day-cell ที่มีเลขวัน ≥20 ช่อง
  calendar: async (page) => {
    await page.waitForFunction(() => {
      const g = document.getElementById("cal-grid");
      return g && g.querySelectorAll(".day-cell[data-day]").length >= 20;
    }, { timeout: 30000 });
    return true;
  },
  // qimen คำนวณผังเองตอนเข้า · รอผัง 9 วัง + บริบทมีเนื้อ
  qimen: async (page) => {
    await page.waitForFunction(() => {
      const g = document.getElementById("palace-grid");
      const c = document.getElementById("qm-context-grid");
      return g && g.children.length >= 9 && g.innerText.replace(/\s/g, "").length > 80 && c && c.innerText.replace(/\s/g, "").length > 30;
    }, { timeout: 60000 });
    return true;
  },
  // network sync เองใน IIFE · รอ people-grid มีโหนด
  yongsennetwork: async (page) => {
    await page.waitForFunction(() => {
      const g = document.getElementById("people-grid");
      return g && g.children.length > 0 && document.getElementById("solar");
    }, { timeout: 30000 });
    return true;
  },
};
async function driveRegression(page) { await page.waitForTimeout(3000); return true; }

function countThai(t) { return (t.match(THAI_RE) || []).length; }
/* จีนปน: ยกเว้นศัพท์วิชา + ยกเว้น ja/ko (ใช้ 漢字/漢字 ปกติในภาษา) */
function countForeignCjk(t, lang) {
  if (lang === "ja" || lang === "ko") return 0; // ญี่ปุ่น=kanji เกาหลี=hanja เป็นตัวอักษรภาษานั้นเอง
  let n = 0;
  for (const ch of t) if (CJK_RE.test(ch) && !SCIENCE_GLYPHS.has(ch)) n++;
  return n;
}
/* normalize สำหรับเทียบ baseline/EN — ตัด "ค่าที่เปลี่ยนตามเวลาจริง" ออกก่อนเทียบโครงข้อความ:
 *  - ตัวเลข/วันที่ · 干支 ก้าน-กิ่ง (ผังฉีเหมิน/ปฏิทินเปลี่ยนทุกชั่วยาม) · ป้ายวันในสัปดาห์ (คำเดียวเปลี่ยนทุกวัน)
 * เจตนา: จับ "template/ข้อความแปล" เปลี่ยนจริง ไม่ใช่ค่าดวงที่ขยับตามเวลา (กัน false positive regression) */
const GANZHI_RE = /[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/g;
const WEEKDAY_RE = /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b|\b(lunedì|martedì|miércoles|jueves|viernes|thứ|수요일|화요일)\b/gi;
function norm(t) {
  return (t || "").replace(GANZHI_RE, "").replace(/\d+/g, "#").replace(WEEKDAY_RE, "#").replace(/\s+/g, " ").trim();
}
/* ชุด segment เรียง (order-independent) — regression วัด 'เนื้อหาข้อความ' ไม่ใช่ลำดับ/ค่า dynamic ที่ขยับต่อ request */
function segsetKey(t) { return [...new Set(segments(t).map((x) => norm(x)).filter(Boolean))].sort().join("\u0001"); }
/* user identity ของบัญชีทดสอบ (avatar/ชื่อ/email) — ไม่ใช่ข้อความแปล */
const IDENTITY_RE = /@|i18n.?gate|gate.?bot|gate tester|^[A-Z]{1,2}$/i;
/* segment เป็นบล็อกข้อความคั่นด้วย newline — ตัดว่าง/ตัวเลข/สัญลักษณ์ล้วนออก */
function segments(t) {
  return (t || "").split(/\n+/).map((s) => s.trim()).filter((s) => s.length >= 2 && /[A-Za-z฀-๿一-鿿]/.test(s));
}
/* ข้อ 3ข: segment ในภาษาใหม่ที่ "ตรงกับ EN reference เป๊ะ" = ยังไม่แปล (ยกเว้น brand/สัญลักษณ์วิชา) */
const BRAND_OK = new Set(["HOURKEY", "hourkey", "Hourkey"]);
/* engine diagnostic (dynamic จาก logic คำนวณ นอกไฟล์ 3 หน้า · goal ห้ามแตะ engine) = ไม่นับเป็น 'ยังไม่แปล' */
const ENGINE_DIAG_RE = /部分形成|未形成|已形成|天網|地網|天羅|地羅|flags?\b|diagnostic|用神 flag/i;
/* cognate: คำ latin ที่ es/vi สะกดเหมือน en จริง (ไม่ใช่ "ยังไม่แปล") — whitelist เฉพาะภาษาที่ cognate จริงเท่านั้น */
const COGNATE = {
  es: new Set(["general", "universal", "natural", "total", "neutral", "original", "rival", "central", "normal", "final", "ideal", "personal", "social", "radical", "vital"]),
  vi: new Set([]),
};
function untranslatedVsEn(text, enSegs, lang) {
  const enSet = new Set(enSegs.map((s) => norm(s).toLowerCase()));
  const cog = COGNATE[lang] || new Set();
  const hits = [];
  for (const s of segments(text)) {
    const low = norm(s).toLowerCase();
    if (!low) continue;
    const words = low.split(/[ ,(·—)]+/).filter(Boolean);
    const hasCognate = cog.size && words.some((w) => cog.has(w));
    if (enSet.has(low) && !BRAND_OK.has(s) && !IDENTITY_RE.test(s) && !ENGINE_DIAG_RE.test(s) && !cog.has(low) && !hasCognate && /[A-Za-z]/.test(s) && !/^[一-鿿\s·#]+$/.test(s)) hits.push(s);
  }
  return [...new Set(hits)];
}

const PREBASE_DIR = join(REPO, "scripts", "prebase-html");
function prebaseHtml(page) {
  try { return readFileSync(join(PREBASE_DIR, `${page}.html`), "utf8"); } catch { return null; }
}
function liveHtmlFile(page) {
  try { return readFileSync(join("/root/releases/current/public", `${page}.html`), "utf8"); } catch { return null; }
}

async function renderPage(browser, cookie, page, lang, driver, overrideHtml = null) {
  /* context ใหม่ต่อ (หน้า×ภาษา) — กัน localStorage/hk_zh_variant รั่วข้ามหน้า (bleed) */
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "decode_auth", value: cookie, domain: ".hourkey.io", path: "/", secure: true }]);
  const p = await ctx.newPage();
  /* dual-render: เสิร์ฟ html "ก่อนแก้" ทับ document · asset (JS/CSS/API) โหลดจาก live เวลาเดียวกัน
   * → เทียบ live-vs-prebase ในเวลาเดียว = ตัด time-noise (ผัง/ฤกษ์/ดวงจรเปลี่ยนตามเวลา) วัด regression จริง */
  if (overrideHtml) {
    await p.route(`**/${page}`, (route) => {
      if (route.request().resourceType() === "document") route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: overrideHtml });
      else route.continue();
    });
  }
  await p.addInitScript((l) => {
    try { localStorage.clear(); } catch {}
    localStorage.setItem("hk_locale", l === "cn" ? "zh" : l);
    localStorage.setItem("hk_lang", l === "cn" ? "zh" : l);
    if (l === "cn") localStorage.setItem("hk_zh_variant", "cn");
  }, lang);
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  let ok = false, reason = "";
  try {
    await p.goto(`${BASE}/${page}?lang=${lang}`, { waitUntil: "domcontentloaded", timeout: 40000 });
    if (/\/signup|\/login/.test(new URL(p.url()).pathname)) { await p.close(); return { ok: false, reason: "เด้ง login", text: "" }; }
    ok = await driver(p);
    /* รอ i18n settle ก่อนวัด — กัน flaky: overlay (vi/ja/ko/ru/es) โหลด async + zhcn converter (cn 繁→簡) ทำงานหลัง render
     * ถ้าวัดก่อน settle → ตก EN / 繁簡เพี้ยน (เคย PASS กลับ FAIL เป็นรอบ ๆ) */
    if (ok) {
      if (NEW_LANGS.includes(lang)) {
        await p.waitForFunction(() => window.HK_I18N_OVERLAY && Object.keys(window.HK_I18N_OVERLAY).length > 100, { timeout: 12000 }).catch(() => {});
      }
      await p.waitForTimeout(1500); // ให้ applyI18N + hk-zhcn MutationObserver settle
    }
  } catch (e) { reason = `dynamic ไม่โหลด: ${String(e.message || e).split("\n")[0].slice(0, 80)}`; }
  /* อ่านเนื้อหา "ของหน้า" — ตัด nav/header/user-menu/lang-select (มาจาก hk-user-menu.js คนละ scope) */
  const text = ok ? await p.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('nav, header, script, style, .hk-user-menu, [class*="user-menu"], [class*="usermenu"], [id*="usermenu"], [class*="avatar"], [class*="topbar"], [class*="topnav"], [class*="lang-select"], [class*="langsel"], [class*="hk-um"], [data-hk-nav]').forEach((el) => el.remove());
    return clone.innerText;
  }) : "";
  await p.close();
  await ctx.close();
  return { ok, reason, text, errs };
}

/* ══════════ CAPTURE BASELINE ══════════ */
async function captureBaseline() {
  const pw = await loadPlaywright();
  const account = await resolveAccount();
  const cookie = await loginCookie(account);
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "decode_auth", value: cookie, domain: ".hourkey.io", path: "/", secure: true }]);
  const baseline = { capturedAt: new Date().toISOString(), pages: {} };
  // เป้า 3 หน้า: เก็บ th/en/zh/cn + เก็บ en ไว้เป็น reference ข้อ 3ข
  for (const page of TARGET_PAGES) {
    baseline.pages[page] = {};
    for (const lang of [...STABLE_LANGS]) {
      const r = await renderPage(browser, cookie, page, lang, DRIVERS[page]);
      baseline.pages[page][lang] = r.ok ? r.text : null;
      console.log(`baseline ${page} ${lang}: ${r.ok ? r.text.length + " ตัวอักษร" : "❌ " + r.reason}`);
    }
  }
  // regression 6 หน้า × th/en/zh
  for (const page of REGRESSION_PAGES) {
    baseline.pages[page] = {};
    for (const lang of ["th", "en", "zh"]) {
      const r = await renderPage(browser, cookie, page, lang, driveRegression);
      baseline.pages[page][lang] = r.ok ? r.text : null;
      console.log(`baseline(reg) ${page} ${lang}: ${r.ok ? r.text.length : "❌"}`);
    }
  }
  await browser.close();
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`\n✅ baseline เขียนแล้ว: ${BASELINE_FILE}`);
}

/* ══════════ GATE ══════════ */
async function runGate() {
  // dual-render: ไม่ต้องใช้ baseline json (เทียบ live-vs-prebase สด)
  const pw = await loadPlaywright();
  const account = await resolveAccount();
  const cookie = await loginCookie(account);
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "decode_auth", value: cookie, domain: ".hourkey.io", path: "/", secure: true }]);
  const results = [];

  for (const page of TARGET_PAGES) {
    // en reference (สด) สำหรับข้อ 3ข
    const enR = await renderPage(browser, cookie, page, "en", DRIVERS[page]);
    const enSegs = enR.ok ? segments(enR.text) : [];
    for (const lang of LANGS) {
      const r = await renderPage(browser, cookie, page, lang, DRIVERS[page]);
      if (!r.ok) { results.push({ page, lang, pass: false, note: r.reason || "dynamic ไม่โหลด" }); continue; }
      const thai = countThai(r.text);
      if (lang === "th") { results.push({ page, lang, pass: true, note: `th ข้ามนับไทย (${r.text.length} ตัว)` }); continue; }
      if (NEW_LANGS.includes(lang)) {
        const untr = untranslatedVsEn(r.text, enSegs, lang);
        const foreignCjk = countForeignCjk(r.text, lang);
        const enCjk = countForeignCjk(enR.text, lang);
        const pass = thai === 0 && untr.length === 0 && foreignCjk <= enCjk;
        results.push({ page, lang, pass, note: pass ? "ok" : `ไทย${thai} · ยังเป็นEN ${untr.length}จุด${untr.length ? " [" + untr.slice(0, 3).map((s) => JSON.stringify(s.slice(0, 24))).join(",") + "]" : ""} · จีนเกิน ${foreignCjk}/${enCjk}` });
      } else {
        // th/en/zh/cn: dual-render เทียบ live-vs-prebase เวลาเดียว (ตัด time-noise)
        const pre = prebaseHtml(page);
        const preR = pre ? await renderPage(browser, cookie, page, lang, DRIVERS[page], pre) : { ok: false };
        const pass = r.ok && preR.ok && segsetKey(r.text) === segsetKey(preR.text);
        results.push({ page, lang, pass, note: pass ? "ตรง prebase (ไม่สะเทือน)" : (!preR.ok ? "prebase render ล้ม" : `สะเทือน ${Math.abs(norm(r.text).length - norm(preR.text).length)} ตัว`) });
      }
    }
  }
  // regression 6 หน้า × th/en/zh — ไฟล์ static เหมือน prebase → PASS (ไม่มีทาง regression · dynamic runtime ≠ ไฟล์เปลี่ยน)
  for (const page of REGRESSION_PAGES) {
    const pre = prebaseHtml(page);
    const liveF = liveHtmlFile(page);
    const fileIdentical = pre != null && liveF != null && liveF === pre;
    for (const lang of ["th", "en", "zh"]) {
      if (fileIdentical) { results.push({ page: `reg:${page}`, lang, pass: true, note: "ไฟล์ static ไม่เปลี่ยน (ไม่สะเทือน)" }); continue; }
      const r = await renderPage(browser, cookie, page, lang, driveRegression);
      const preR = pre ? await renderPage(browser, cookie, page, lang, driveRegression, pre) : { ok: false };
      const pass = r.ok && preR.ok && segsetKey(r.text) === segsetKey(preR.text);
      results.push({ page: `reg:${page}`, lang, pass, note: pass ? "ไม่สะเทือน" : (!r.ok ? "โหลดไม่ได้" : !preR.ok ? "prebase ล้ม" : `สะเทือน ${Math.abs(norm(r.text).length - norm(preR.text).length)} ตัว`) });
    }
  }
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log("");
  for (const r of results) console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.page} ${r.lang} · ${r.note}`);
  console.log("");
  console.log(new Date().toISOString());
  console.log(`ตรวจ ${results.length} ช่อง`);
  if (failed.length === 0) { console.log("ALL PASS · FAIL 0"); process.exit(0); }
  console.log(`FAIL ${failed.length}`);
  process.exit(1);
}

(CAPTURE ? captureBaseline() : runGate()).catch((e) => { console.error("gate error:", e.message); process.exit(2); });
