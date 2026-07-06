#!/usr/bin/env node
/**
 * i18n-final-gate.mjs · ด่านสุดท้ายตรวจการแปลของจริงบนเบราว์เซอร์ (ห้าม mock)
 *
 * ตรวจ 9 ภาษา (th,en,zh繁,cn简,vi,ja,ko,ru,es) × 6 หน้า (datepick,today,chart,qimen,luopan,master-fusion)
 * = 54 ช่อง + AI ซินแส 5 ภาษาใหม่ (vi,ja,ko,ru,es) = 59 ช่องรวม
 *
 * ต่อช่อง: เปิดหน้าจริงด้วย Chromium + ล็อกอินจริง (session token จริงจาก /api/auth/login)
 *   → ตั้ง localStorage hk_locale (+hk_zh_variant=cn สำหรับตัวย่อ)
 *   → ทำให้เครื่องคำนวณผลิตผลบนจอ (กดค้นหา/รอการ์ด/ล็อกบ้าน ตามหน้า)
 *   → อ่าน rendered document.body.innerText → นับอักษรไทย [฀-๿]
 *   → ช่องผ่าน = ผลิตผลสำเร็จ + ไทย 0 (ยกเว้น lang=th ข้ามการนับ แต่ยังต้องผลิตผลสำเร็จ)
 *
 * AI 5 ภาษาใหม่: GET /api/sifu?stream=1&mode=intro (เส้น intro = เร็วสุด ไม่ต้องมี profileId)
 *   ถามสั้น 1 คำถามเป็นภาษานั้น → ตรวจคำตอบมีอักษร/คำของภาษานั้นจริง
 *
 * รัน:   node scripts/i18n-final-gate.mjs
 * env:   GATE_BASE   base URL (default http://127.0.0.1:3350)
 *        GATE_EMAIL / GATE_PASSWORD   บัญชีทดสอบ (ไม่ตั้ง = อ่าน .gate-account.json · ไม่มี = สมัครใหม่อัตโนมัติ)
 *        GATE_PW_DIR  โฟลเดอร์ node_modules ที่มี playwright (fallback ถ้า repo ไม่มี)
 *
 * exit 0 เฉพาะเมื่อ FAIL = 0 จริงเท่านั้น · ไม่มีโหมดข้าม/whitelist
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const BASE = (process.env.GATE_BASE || "http://127.0.0.1:3350").replace(/\/$/, "");
const ACCOUNT_FILE = join(REPO, ".gate-account.json");

/* ── playwright: repo ก่อน → GATE_PW_DIR → scratchpad ที่ติดตั้ง chromium ไว้แล้ว ── */
async function loadPlaywright() {
  const candidates = [
    "playwright",
    ...(process.env.GATE_PW_DIR ? [join(process.env.GATE_PW_DIR, "playwright", "index.mjs")] : []),
    "/tmp/claude-0/-root/075fcd4e-9325-4c85-b53c-69c1c43d55c6/scratchpad/node_modules/playwright/index.mjs",
  ];
  for (const c of candidates) {
    try { return await import(c); } catch { /* ลองตัวถัดไป */ }
  }
  console.error("หา playwright ไม่เจอ · npm i playwright ใน repo หรือชี้ GATE_PW_DIR");
  process.exit(2);
}

/* ── ภาษา 9 · zh=ตัวเต็ม(繁) · cn=ตัวย่อ(简 ผ่าน hk_zh_variant) ── */
const LANGS = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
const PAGES = ["datepick", "today", "chart", "qimen", "luopan", "master-fusion"];
const THAI_RE = /[฀-๿]/g; // [฀-๿] ทั้งบล็อกไทย

/* ── AI 5 ภาษาใหม่: คำถามสั้นเป็นภาษานั้น + ตัวตรวจอักษรของภาษานั้น ── */
const AI_CHECKS = {
  vi: {
    q: "Xin chào sư phụ, hôm nay có phải ngày tốt không? Vui lòng trả lời ngắn gọn hoàn toàn bằng tiếng Việt.",
    ok: (t) => /[đĐơƠưƯạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(t),
    label: "เครื่องหมายเวียดนาม",
  },
  ja: {
    q: "師匠、今日は良い日ですか？短く日本語だけで答えてください。",
    ok: (t) => /[぀-ゟ゠-ヿ]/.test(t), // ひらがな+カタカナ
    label: "かな",
  },
  ko: {
    q: "사부님, 오늘은 좋은 날인가요? 한국어로만 짧게 답해 주세요.",
    ok: (t) => /[가-힯]/.test(t), // ฮันกึล
    label: "ฮันกึล",
  },
  ru: {
    q: "Мастер, сегодня хороший день? Ответьте кратко только по-русски.",
    ok: (t) => /[Ѐ-ӿ]/.test(t), // ซีริลลิก
    label: "ซีริลลิก",
  },
  es: {
    q: "Maestro, ¿hoy es un buen día? Responde brevemente solo en español.",
    ok: (t) => {
      const words = t.toLowerCase().match(/\b(el|la|los|las|un|una|es|está|hoy|día|bueno|buena|para|con|por|según|sí|muy|energía|puede|tiene)\b/g) || [];
      return new Set(words).size >= 2 || /[¿¡ñ]/i.test(t);
    },
    label: "คำสเปนพื้นฐาน",
  },
};

/* ── helpers ── */
function thaiSamples(text, max = 3) {
  const out = [];
  const seen = new Set();
  for (const m of text.matchAll(/[฀-๿][^\n]{0,50}/g)) {
    const s = m[0].trim().slice(0, 50);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ไม่ใช่ json */ }
  return { status: res.status, json, text, headers: res.headers };
}

/* ── บัญชีทดสอบ: env → ไฟล์ → สมัครใหม่จริงผ่าน /api/auth/signup (ไม่มี OTP ในเส้นนี้) ── */
async function resolveAccount() {
  if (process.env.GATE_EMAIL && process.env.GATE_PASSWORD) {
    return { email: process.env.GATE_EMAIL, password: process.env.GATE_PASSWORD, source: "env" };
  }
  if (existsSync(ACCOUNT_FILE)) {
    try {
      const j = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
      if (j.email && j.password) return { ...j, source: "file" };
    } catch { /* ไฟล์พัง → สมัครใหม่ */ }
  }
  const email = `i18n-gate+${Date.now()}@hourkey.io`;
  const password = "Gate!" + crypto.randomBytes(9).toString("base64url");
  const r = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name: "i18n Gate Bot" }) });
  if (r.status !== 200 || !r.json?.ok) throw new Error(`สมัครบัญชีทดสอบไม่ผ่าน: ${r.status} ${r.text.slice(0, 150)}`);
  writeFileSync(ACCOUNT_FILE, JSON.stringify({ email, password, userId: r.json.user?.id, createdAt: new Date().toISOString() }, null, 2));
  try {
    const gi = readFileSync(join(REPO, ".gitignore"), "utf8");
    if (!gi.includes(".gate-account.json")) appendFileSync(join(REPO, ".gitignore"), "\n# บัญชีทดสอบ i18n gate\n.gate-account.json\n");
  } catch { /* ไม่มี .gitignore ก็ปล่อย */ }
  return { email, password, source: "signup-new" };
}

/* ── ล็อกอินจริง → token จริงจาก Set-Cookie (cookie เป็น Secure — ยัดเข้า browser ตรงเพราะ gate ยิง loopback http) ── */
async function login(account) {
  const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: account.email, password: account.password }) });
  if (r.status !== 200) throw new Error(`login ไม่ผ่าน (${r.status}): ${r.text.slice(0, 150)}`);
  const sc = r.headers.get("set-cookie") || "";
  const m = sc.match(/decode_auth=([^;]+)/);
  if (!m) throw new Error("login สำเร็จแต่ไม่พบ decode_auth ใน Set-Cookie");
  return m[1];
}

/* ── โปรไฟล์ตัวเอง (หน้า chart ต้องมีดวงให้เปิด) — ไม่มีก็สร้างจริงผ่าน API ── */
async function ensureProfile(cookie) {
  const list = await api("/api/profile", { headers: { Cookie: `decode_auth=${cookie}` } });
  const arr = Array.isArray(list.json) ? list.json : list.json?.profiles || list.json?.items || [];
  if (Array.isArray(arr) && arr.length > 0) return "existing";
  const r = await api("/api/profile", {
    method: "POST",
    headers: { Cookie: `decode_auth=${cookie}` },
    body: JSON.stringify({
      name: "Gate Tester", birthDate: "1990-05-15", birthTime: "08:30",
      birthLat: 13.7563, birthLng: 100.5018, locationName: "Bangkok", gender: "M",
    }),
  });
  if (r.status !== 200) throw new Error(`สร้างโปรไฟล์ทดสอบไม่ผ่าน: ${r.status} ${r.text.slice(0, 150)}`);
  return "created";
}

/* ── ตัวขับแต่ละหน้า: ทำให้เครื่องคำนวณผลิตผลจริงบนจอ · คืน throw ถ้าไม่สำเร็จ ── */
const DRIVERS = {
  async datepick(page) {
    // เลือกกิจกรรมแรกจากลิสต์จริง แล้วกดค้นหาฤกษ์ → รอผลลัพธ์จริง (การ์ดฤกษ์)
    await page.waitForSelector("#btnSearch", { timeout: 30000 });
    await page.waitForSelector("#activityProfileList .mission-btn", { timeout: 30000 });
    await page.click("#activityProfileList .mission-btn");
    await page.click("#btnSearch");
    await page.waitForFunction(() => {
      const r = document.getElementById("resultsList");
      const m = document.getElementById("resultsMeta");
      return r && r.children.length > 0 && !r.querySelector(".loading") && !r.querySelector(".spinner")
        && m && m.innerText.trim().length > 0;
    }, { timeout: 120000 });
  },
  async today(page) {
    // การ์ดคะแนนดวงวันนี้ + ตาราง 12 ยาม + แผงทิศ
    await page.waitForFunction(() => {
      const g = document.getElementById("t-hours-grid");
      const d = document.getElementById("t-dir-layers");
      const tag = document.getElementById("t-verdict-tag");
      return g && g.children.length >= 12 && d && d.children.length > 0 && tag && tag.innerText.trim().length > 0;
    }, { timeout: 60000 });
  },
  async chart(page) {
    // หน้า chart เปิดดวงโปรไฟล์แรก (self) อัตโนมัติ → รอตารางเสา + section ชีวิตจริงที่คำนวณแล้ว
    await page.waitForFunction(() => {
      const t = document.getElementById("hk-pillar-table");
      const p = document.getElementById("hk-personal-sec");
      return t && t.innerText.replace(/\s/g, "").length > 30 && p && p.innerText.replace(/\s/g, "").length > 30;
    }, { timeout: 60000 });
  },
  async qimen(page) {
    // ผัง 9 วัง + คำอ่านหัวผัง (符使/ดาวนำ/ประตูนำ) ต้องคำนวณเสร็จ
    await page.waitForFunction(() => {
      const g = document.getElementById("palace-grid");
      const c = document.getElementById("qm-context-grid");
      return g && g.children.length >= 9 && g.innerText.replace(/\s/g, "").length > 80
        && c && c.innerText.replace(/\s/g, "").length > 30;
    }, { timeout: 60000 });
  },
  async luopan(page) {
    // ล็อกบ้าน default (ไม่ต้องกรอก — engine ใช้ทิศตั้งต้น) → รอสถานะล็อก + แผง inspector
    await page.waitForSelector("#btnLock", { timeout: 30000 });
    await page.click("#btnLock");
    await page.waitForFunction(() => {
      const s = document.getElementById("lockStatus");
      const insp = document.querySelector(".inspector");
      return s && s.innerText.includes("🔒") && insp && insp.innerText.replace(/\s/g, "").length > 40;
    }, { timeout: 60000 });
  },
  async "master-fusion"(page) {
    // แค่หน้า + แผงประวัติ (ไม่รัน AI เต็ม — แพง)
    await page.waitForFunction(() => {
      const st = document.getElementById("run-state");
      const h = document.getElementById("history-list");
      return st && st.innerText.trim().length > 0 && h && !!document.getElementById("send");
    }, { timeout: 45000 });
    await page.waitForTimeout(1500); // ให้ประวัติ/ป้ายแปล render จบ
  },
};

/* ── ช่องหน้าเว็บ 1 ช่อง ── */
async function runPageCell(ctx, lang, pageName) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/${pageName}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (/\/signup|\/login/.test(new URL(page.url()).pathname)) {
      return { pass: false, thai: -1, reason: "โดนเด้งไปหน้า login — session ไม่ติด" };
    }
    await DRIVERS[pageName](page);
    const text = await page.evaluate(() => document.body.innerText);
    const thai = (text.match(THAI_RE) || []).length;
    if (lang === "th") return { pass: true, thai, skippedCount: true }; // th ข้ามการนับ (แต่ต้องผลิตผลสำเร็จ)
    return { pass: thai === 0, thai, samples: thai > 0 ? thaiSamples(text) : [] };
  } catch (e) {
    // ผลิตผลไม่สำเร็จ = FAIL ไม่ว่าภาษาไหน · แนบไทยเท่าที่เห็นเพื่อ debug
    let thai = -1, samples = [];
    try {
      const text = await page.evaluate(() => document.body.innerText);
      thai = (text.match(THAI_RE) || []).length;
      samples = thaiSamples(text);
    } catch { /* หน้าตายไปแล้ว */ }
    return { pass: false, thai, samples, reason: `ผลิตผลบนจอไม่สำเร็จ: ${String(e.message || e).split("\n")[0].slice(0, 120)}` };
  } finally {
    await page.close().catch(() => {});
  }
}

/* ── AI ซินแส 1 ช่อง (SSE จริง เส้น intro) ── */
async function runAiCell(cookie, lang) {
  const { q: question, ok, label } = AI_CHECKS[lang];
  const url = `${BASE}/api/sifu?stream=1&mode=intro&lang=en&message=${encodeURIComponent(question)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 300000); // intro grok-cli first token ~60s · เผื่อ 5 นาที
  let reply = "", errEvent = null;
  try {
    const res = await fetch(url, { headers: { Cookie: `decode_auth=${cookie}` }, signal: ac.signal });
    if (res.status !== 200) return { pass: false, reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}` };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop();
      for (const b of blocks) {
        const ev = (b.match(/^event: (.+)$/m) || [])[1];
        const dataRaw = (b.match(/^data: (.+)$/m) || [])[1];
        if (!ev || !dataRaw) continue;
        let data = {};
        try { data = JSON.parse(dataRaw); } catch { /* ข้าม */ }
        if (ev === "chunk" && data.text) reply += data.text;
        if (ev === "error") errEvent = data.error || "error";
      }
    }
  } catch (e) {
    if (!reply) return { pass: false, reason: `stream ล้ม: ${String(e.message || e).slice(0, 100)}` };
  } finally {
    clearTimeout(timer);
  }
  if (!reply.trim()) return { pass: false, reason: `ไม่มีคำตอบจาก AI${errEvent ? ` (error: ${String(errEvent).slice(0, 80)})` : ""}` };
  const langOk = ok(reply);
  const thai = (reply.match(THAI_RE) || []).length;
  return {
    pass: langOk, thai,
    reason: langOk ? undefined : `คำตอบไม่มี${label} (ยาว ${reply.length} ตัว · ไทย ${thai} · ขึ้นต้น: "${reply.trim().slice(0, 60)}")`,
  };
}

/* ── main ── */
const { chromium } = await loadPlaywright();
const account = await resolveAccount();
console.log(`# i18n-final-gate · BASE=${BASE}`);
console.log(`# บัญชีทดสอบ: ${account.email} (ที่มา: ${account.source})`);
const cookie = await login(account);
const profileState = await ensureProfile(cookie);
console.log(`# โปรไฟล์ดวงทดสอบ: ${profileState}`);

const browser = await chromium.launch();
const u = new URL(BASE);
const results = [];

for (const lang of LANGS) {
  const ctx = await browser.newContext({ baseURL: BASE, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  await ctx.addCookies([{ name: "decode_auth", value: cookie, domain: u.hostname, path: "/", httpOnly: true, secure: u.protocol === "https:", sameSite: "Lax" }]);
  const storeLocale = lang === "cn" ? "zh" : lang;
  const zhVariant = lang === "cn" ? "cn" : null;
  await ctx.addInitScript(({ l, v }) => {
    localStorage.setItem("hk_locale", l);
    localStorage.setItem("hk_lang", l);
    if (v) localStorage.setItem("hk_zh_variant", v);
    else localStorage.removeItem("hk_zh_variant");
  }, { l: storeLocale, v: zhVariant });

  for (const pageName of PAGES) {
    const r = await runPageCell(ctx, lang, pageName);
    results.push({ lang, page: pageName, ...r });
    printLine(results[results.length - 1]);
  }
  await ctx.close();
}
await browser.close();

for (const lang of Object.keys(AI_CHECKS)) {
  const r = await runAiCell(cookie, lang);
  results.push({ lang, page: "ai-sifu", ...r });
  printLine(results[results.length - 1]);
}

function printLine(r) {
  const tag = r.pass ? "[PASS]" : "[FAIL]";
  const thaiStr = r.thai === -1 ? "?" : String(r.thai);
  let line = `${tag} ${r.lang} ${r.page} · ไทย ${thaiStr}`;
  if (r.skippedCount) line += " (th ข้ามการนับ)";
  if (r.reason) line += ` · ${r.reason}`;
  if (r.samples?.length) line += ` · ตัวอย่าง: ${r.samples.map((s) => JSON.stringify(s)).join(" | ")}`;
  console.log(line);
}

const failed = results.filter((r) => !r.pass);
console.log("");
console.log(new Date().toISOString());
console.log(`ตรวจทั้งหมด ${results.length} ช่อง`);
if (failed.length === 0) {
  console.log("ALL PASS · FAIL 0");
  process.exit(0);
} else {
  console.log(`FAIL ${failed.length}`);
  process.exit(1);
}
