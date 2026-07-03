// r384 · ทดสอบ master-fusion.html (2 งาน UX):
//   (1) เปิดประวัติ → คำถาม+คำตอบเก่าขึ้นการ์ดหลัก (ป้าย 📜 · มือถือเข้าโหมดอ่าน · job วิ่ง = บล็อกสุภาพ · ปุ่มถามต่อ/กลับ)
//   (2) การ์ด 🎯 เล่าแบบมนุษย์ 3 ชั้น: หัวชื่อ+topic → วันเด่นแดง3/เขียว3 + เหตุผลภาษาคน → พับทุกวันที่ติดธง (default พับ)
// หมายเหตุ: ไม่มี jsdom → extract ฟังก์ชันจริงจาก HTML มารันกับ stub (แนวเดียวกับ test-fusion-fold-toggle.mjs)
// run: node scripts/test-fusion-hist-sniper-r384.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "public", "master-fusion.html"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

function extract(name) {
  const idx = src.indexOf(`function ${name}(`);
  if (idx < 0) throw new Error(`missing function ${name}`);
  let depth = 0;
  for (let j = src.indexOf("{", idx); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(idx, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
// ดึง I18N จริงจากไฟล์ (balanced braces) → t() เหมือน production
function extractI18N() {
  const at = src.indexOf("var I18N = {");
  let depth = 0;
  for (let j = src.indexOf("{", at); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return new Function(src.slice(at, j + 1) + "\nreturn I18N;")(); }
  }
  throw new Error("unbalanced I18N");
}
const I18N = extractI18N();

const mkClassList = () => {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; }, contains: (c) => s.has(c) };
};

// ---------- sandbox การ์ด 🎯 (t = i18n จริง) ----------
function makeSniperSandbox({ mobile = false, locale = "th" } = {}) {
  const t = (k) => (I18N[locale] && I18N[locale][k] != null) ? I18N[locale][k] : (I18N.th[k] != null ? I18N.th[k] : k);
  const state = { locale, resonance: null };
  const els = { sniper: { innerHTML: "", classList: mkClassList() }, resonance: { innerHTML: "", classList: mkClassList() } };
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const isMobileFold = () => !!mobile;
  const prelude = "var FOLD_PREF_KEY = 'hk_fusion5_fold';\nvar foldJobKey = '';\nvar SNP_FLAG = { red:'\u{1F534}', yellow:'\u{1F7E1}', green:'\u{1F7E2}' };\n";
  const code = prelude + [
    extract("esc"), extract("loadFoldPref"), extract("cardFoldState"), extract("applyCardFold"),
    extract("sniperFoldSummary"), extract("sniperHasContent"), extract("sniperStripHtml"), extract("sniperPersonHtml"), extract("renderDaySniper"),
  ].join("\n");
  const factory = new Function("t", "state", "els", "sessionStorage", "isMobileFold",
    code + "\nreturn { renderDaySniper, sniperPersonHtml };");
  return { fns: factory(t, state, els, sessionStorage, isMobileFold), els };
}

const mkDay = (dateISO, flag, needles, extra = {}) => Object.assign({ dateISO, ganzhi: "甲子", flag, needles, a: [], b: [], c: [], context: [] }, extra);
const iso = (d) => d.toISOString().slice(0, 10);
function buildDays() {
  const days = [];
  const base = Date.UTC(2026, 6, 2); // 2026-07-02
  // 13 แดง: ตัวแรงสุด 3 ตัวมีหลักฐานจริง (เข็ม 2-3) · ที่เหลือเข็ม 2 เปล่า
  days.push(mkDay("2026-07-19", "red", ["A", "B"], {
    a: [{ rule: "沖", strength: "strong_warning", pillarKey: "day", detail: "流日辛巳 沖(巳亥) เสาวัน(己亥)", canonRef: "x" }],
    b: [{ targetTh: "ดาวคู่", targetName: "Venus", aspect: "conjunction", polarity: "warning", timeTH: "", detail: "จันทร์☌ดาวคู่กำเนิด 14:22น." }],
  }));
  days.push(mkDay("2026-07-25", "red", ["A", "B", "C"], {
    a: [{ rule: "六合", strength: "warning", pillarKey: "month", detail: "x", canonRef: "x" }],
    c: [{ transit: "Saturn", natal: "Moon", aspect: "square", polarity: "warning", dateISO: "2026-07-25", detail: "เสาร์เหลี่ยมกดจันทร์กำเนิด (exact 2026-07-25)" }],
  }));
  days.push(mkDay("2026-08-04", "red", ["A", "B", "C"], {}));
  for (let i = 0; i < 10; i++) days.push(mkDay(iso(new Date(base + (30 + i * 2) * 86400000)), "red", ["A", "B"]));
  for (let i = 0; i < 11; i++) days.push(mkDay(iso(new Date(base + (5 + i * 3) * 86400000)), "yellow", ["A"]));
  for (let i = 0; i < 4; i++) days.push(mkDay(iso(new Date(base + (8 + i * 7) * 86400000)), "green", ["A"], {
    b: i === 0 ? [{ targetTh: "ดาวศุภเคราะห์", targetName: "Jupiter", aspect: "trine", polarity: "benefic", timeTH: "", detail: "จันทร์△ดาวพฤหัสกำเนิด (มุมดี)" }] : [],
  }));
  return days.sort((x, y) => x.dateISO.localeCompare(y.dateISO));
}
const DS = {
  version: "day_sniper_v1", topicKey: "money", topicTh: "การเงิน", fromISO: "2026-07-01", toISO: "2026-09-30",
  perPerson: [{ name: "เอี๊ยว", skippedNote: null, days: buildDays(), totals: { red: 13, yellow: 11, green: 4 }, droppedCount: 0, scannedDays: 92 }],
  notes: [],
};

// ===== 1) fixture 13 แดง → หัวชื่อ+topic · วันเด่น 3+3 · เหตุผลภาษาคน · พับ default =====
{
  const s = makeSniperSandbox({ mobile: false });
  s.fns.renderDaySniper(DS);
  const html = s.els.sniper.innerHTML;
  ok("หัวการ์ดระบุชื่อเจ้าของดวง (วันสำคัญของเอี๊ยว)", html.includes("วันสำคัญของเอี๊ยว"), html.slice(0, 200));
  ok("หัวการ์ดระบุหัวข้อจาก topicKey (เรื่องการเงิน)", html.includes("(เรื่องการเงิน)"));
  ok("มีบรรทัดอธิบาย 🔴/🟢 ภาษาคน", html.includes("หลายศาสตร์ชี้ตรงกัน เลี่ยงตัดสินใจใหญ่"));
  const dayCards = (html.match(/class="snp-day"/g) || []).length;
  ok("วันเด่น = แดง 3 + เขียว 3 (จาก 13 แดง/4 เขียว)", dayCards === 6, `got ${dayCards}`);
  ok("แดงแรงสุด (เข็ม 3) ขึ้นก่อน — 25 ก.ค. + 4 ส.ค. อยู่ใน top", html.includes("25 ก.ค.") && html.includes("4 ส.ค."));
  const sunday = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][new Date(Date.UTC(2026, 6, 19)).getUTCDay()];
  ok("วันที่แบบไทย+วันในสัปดาห์ (เช่น " + sunday + " 19 ก.ค.)", html.includes(sunday + " 19 ก.ค."));
  ok("เหตุผล A แปลเป็นไทย: วันชงเสาวัน", html.includes("วันชงเสาวัน"));
  ok("เหตุผล B แปลเป็นไทย: จันทร์จริงชนดาวคู่", html.includes("จันทร์จริงชนดาวคู่"));
  const whys = [...html.matchAll(/class="snp-day-why">([^<]*)</g)].map((m) => m[1]);
  ok("เหตุผล C ใช้ detail ไทย + ตัด (exact ...) ในบรรทัดเหตุผล", whys.some((w) => w.includes("เสาร์เหลี่ยมกดจันทร์กำเนิด")) && whys.every((w) => !w.includes("(exact")), whys.join(" | "));
  ok("เหตุผลเขียว: จันทร์มุมดี (bGood)", html.includes("จันทร์จริงทำมุมดีกับดาวศุภเคราะห์"));
  ok("ไม่มีตัวเข็มดิบ A+B / A+B+C โผล่", !/[>"\s](A\+B|B\+C|A\+C|A\+B\+C)[<"\s]/.test(html), (html.match(/[>"\s](A\+B|B\+C|A\+C|A\+B\+C)[<"\s]/) || [""])[0]);
  ok("ตารางพับใช้ชื่อสัญญาณไทยแทนตัวเข็ม (ปาจื้อ+จันทร์)", html.includes("ปาจื้อ+จันทร์"));
  ok("ทุกวันที่ติดธงพับใน details (default ปิด ทั้ง desktop/มือถือ)", html.includes('<details class="res-details"><summary>') && !html.includes('<details class="res-details" open'));
  ok("summary บอกจำนวนวัน: ดูทุกวันที่ติดธง (28 วัน)", html.includes("ดูทุกวันที่ติดธง (28 วัน)"));
  ok("chips 🔴×13 ย้ายไปอยู่ในส่วนพับ (หลัง <details>)", html.indexOf('class="res-chips"') > html.indexOf("<details"));
  ok("desktop: การ์ดเริ่มกาง (ไม่มี hk-fold) — ของ r382 ไม่พัง", !s.els.sniper.classList.contains("hk-fold"));
}

// ===== 2) มือถือยังพับการ์ดเริ่มต้น (r382) + perPerson หลายคน (jsonb เก่า) render คนแรกคนเดียว =====
{
  const s = makeSniperSandbox({ mobile: true });
  const multi = JSON.parse(JSON.stringify(DS));
  multi.perPerson.push({ name: "ใหม่", skippedNote: null, days: [mkDay("2026-07-10", "red", ["A", "B"])], totals: { red: 1, yellow: 0, green: 0 }, droppedCount: 0, scannedDays: 92 });
  s.fns.renderDaySniper(multi);
  ok("มือถือ: การ์ด 🎯 เริ่มพับ (hk-fold r382 คงเดิม)", s.els.sniper.classList.contains("hk-fold"));
  const persons = (s.els.sniper.innerHTML.match(/class="res-person"/g) || []).length;
  ok("งานเก่าหลาย perPerson → render คนแรกคนเดียว", persons === 1, `got ${persons}`);
  ok("หัวการ์ดยังเป็นชื่อคนแรก", s.els.sniper.innerHTML.includes("วันสำคัญของเอี๊ยว") && !s.els.sniper.innerHTML.includes("วันสำคัญของใหม่"));
}

// ===== 3) 0 วันเด่น → ข้อความตามเนื้อผ้า =====
{
  const s = makeSniperSandbox();
  const empty = { ...DS, perPerson: [{ name: "เอี๊ยว", skippedNote: null, days: [], totals: { red: 0, yellow: 0, green: 0 }, droppedCount: 0, scannedDays: 92 }] };
  s.fns.renderDaySniper(empty);
  ok("ไม่มีวันติดธงเลย → 'ตัดสินใจได้ตามเนื้อผ้า'", s.els.sniper.innerHTML.includes("ตัดสินใจได้ตามเนื้อผ้า"));
  const s2 = makeSniperSandbox();
  const onlyYellow = { ...DS, perPerson: [{ name: "เอี๊ยว", skippedNote: null, days: [mkDay("2026-07-10", "yellow", ["A"]), mkDay("2026-07-20", "yellow", ["B"])], totals: { red: 0, yellow: 2, green: 0 }, droppedCount: 0, scannedDays: 92 }] };
  s2.fns.renderDaySniper(onlyYellow);
  ok("มีแต่เหลือง (ไม่มีวันเด่นแดง/เขียว) → ตามเนื้อผ้า + ตารางยังพับดูได้", s2.els.sniper.innerHTML.includes("ตัดสินใจได้ตามเนื้อผ้า") && s2.els.sniper.innerHTML.includes("<details"));
}

// ===== 4) i18n en/zh render ไม่หลุดไทย/คีย์ดิบ =====
{
  const en = makeSniperSandbox({ locale: "en" });
  en.fns.renderDaySniper(DS);
  ok("en: หัว Key days for + about money + Sun date", en.els.sniper.innerHTML.includes("Key days for เอี๊ยว") && en.els.sniper.innerHTML.includes("(about money)") && en.els.sniper.innerHTML.includes("Sun 19 Jul"));
  ok("en: เหตุผล clash with day pillar + Moon hits natal Venus", en.els.sniper.innerHTML.includes("clash with your day pillar") && en.els.sniper.innerHTML.includes("Moon hits natal Venus"));
  const zh = makeSniperSandbox({ locale: "zh" });
  zh.fns.renderDaySniper(DS);
  ok("zh: 關鍵日 + 關於財運 + 週日 7月19日", zh.els.sniper.innerHTML.includes("未來三個月關鍵日") && zh.els.sniper.innerHTML.includes("關於財運") && zh.els.sniper.innerHTML.includes("週日 7月19日"));
  ok("ไม่มีคีย์ i18n ดิบหลุด (ds./hist.)", ![en, zh].some((s) => /ds\.[a-zA-Z]|hist\.[a-zA-Z]/.test(s.els.sniper.innerHTML)));
  const KEYS = ["'ds.titleOf'", "'ds.forTopic'", "'ds.explain'", "'ds.topRed'", "'ds.topGreen'", "'ds.all'", "'ds.calm'", "'ds.nA'", "'ds.aFmt'", "'ds.bWarn'", "'ds.t.money'", "'hist.fromTag'", "'hist.askMore'", "'hist.back'", "'hist.busy'", "'hist.pick'"];
  const th = src.slice(src.indexOf("th:{"), src.indexOf("en:{"));
  const enS = src.slice(src.indexOf("en:{"), src.indexOf("zh:{"));
  const zhS = src.slice(src.indexOf("zh:{"));
  ok("i18n คีย์ใหม่ครบ 3 ภาษา (" + KEYS.length + " คีย์)", KEYS.every((k) => th.includes(k) && enS.includes(k) && zhS.includes(k)), KEYS.filter((k) => !(th.includes(k) && enS.includes(k) && zhS.includes(k))).join(","));
}

// ===== 5) เปิดประวัติ → การ์ดหลัก (functional sandbox) =====
function makeHistSandbox() {
  const t = (k) => (I18N.th[k] != null ? I18N.th[k] : k);
  const state = { busy: false, resuming: false, result: null, resonance: null, historyView: null, preHistoryView: null, activeHistoryId: "x" };
  const els = { result: { innerHTML: "" }, meta: { innerHTML: "" } };
  const calls = { status: [], answerMode: [], runState: [], resonance: [], fusion5: [], keep: 0, scroll: 0, readBar: 0, histList: 0, winScroll: [] };
  let mobile = false;
  const stubs = {
    t, state, els,
    keepHistoryOnAskPage: () => calls.keep++,
    setStatus: (m, k) => calls.status.push([m, k]),
    fusionFromHistory: (row) => (row && row.response_meta) || {},
    historyChartNames: () => "เอี๊ยว",
    rowDate: () => "3 ก.ค. 2026 17:00",
    renderResonance: (r) => { calls.resonance.push(r); state.resonance = r; },
    historyMainHtml: (row) => '<div class="hist-view">📜 ' + (row.question || "") + "</div>",
    setRunState: (x) => calls.runState.push(x),
    setAnswerMode: (on) => calls.answerMode.push(on),
    isMobileFold: () => mobile,
    document: { querySelector: () => ({ scrollIntoView: () => calls.scroll++ }) },
    window: { scrollTo: (o) => calls.winScroll.push(o) }, // r384b: มือถือเริ่มอ่านหัวการ์ด
    renderHistoryList: () => calls.histList++,
    renderFusion5: (d) => { calls.fusion5.push(d); state.result = d; },
    updateReadBar: () => calls.readBar++,
    esc: (s) => String(s == null ? "" : s),
  };
  const code = [extract("openHistoryInMain"), extract("closeHistoryView")].join("\n");
  const names = Object.keys(stubs);
  const factory = new Function(...names, code + "\nreturn { openHistoryInMain, closeHistoryView };");
  const fns = factory(...names.map((n) => stubs[n]));
  return { fns, state, els, calls, setMobile: (m) => { mobile = m; } };
}
const ROW = { id: "h1", question: "ปีนี้ย้ายงานดีไหม", answer: "คำตอบเก่า", profile_id: "p1", created_at: "2026-07-01T10:00:00Z", response_meta: { resonance: { targetYear: 2026, daySniper: DS } } };
{
  const h = makeHistSandbox();
  h.fns.openHistoryInMain(ROW);
  ok("เปิดประวัติ → คำตอบขึ้นการ์ดหลัก (els.result = hist-view)", h.els.result.innerHTML.includes("hist-view") && h.els.result.innerHTML.includes("ปีนี้ย้ายงานดีไหม"));
  ok("เข้าโหมดอ่าน (setAnswerMode(true)) — มือถือ = เต็มจอ", h.calls.answerMode.length === 1 && h.calls.answerMode[0] === true);
  ok("การ์ด 🔗/🎯 ของรอบนั้นกลับมาจาก response_meta.resonance", h.calls.resonance.length === 1 && h.calls.resonance[0] && h.calls.resonance[0].targetYear === 2026);
  ok("state.historyView ถูกตั้ง (id+คำถาม+ชื่อดวง)", h.state.historyView && h.state.historyView.id === "h1" && h.state.historyView.names === "เอี๊ยว");
  ok("runState = history", h.calls.runState.includes("history"));
  ok("desktop: scroll ไปการ์ดคำตอบหลัก", h.calls.scroll === 1);
  // ปิด (ไม่มีผลรันสดก่อนหน้า) → กลับสภาพว่างปกติ
  h.fns.closeHistoryView();
  ok("ปุ่มกลับ (ไม่มีงานเก่าค้าง) → การ์ดหลักกลับ resultEmpty + ออกโหมดอ่าน", h.els.result.innerHTML.includes("result-empty") && h.calls.answerMode[h.calls.answerMode.length - 1] === false && h.state.historyView === null);
  ok("ปิดแล้วล้าง resonance card", h.calls.resonance[h.calls.resonance.length - 1] === null);
}
{
  const h = makeHistSandbox();
  h.state.result = { reply: "ผลสด", fusion5: {} };
  h.state.resonance = { targetYear: 2027 };
  h.fns.openHistoryInMain(ROW);
  ok("เปิดทับผลสด → เก็บ preHistoryView ไว้", h.state.preHistoryView && h.state.preHistoryView.result && h.state.preHistoryView.result.reply === "ผลสด");
  h.fns.closeHistoryView();
  ok("ปุ่มกลับ → คืนคำพยากรณ์สดรอบล่าสุด (renderFusion5 + resonance เดิม)", h.calls.fusion5.length === 1 && h.calls.fusion5[0].reply === "ผลสด" && h.state.resonance && h.state.resonance.targetYear === 2027);
}
{
  const h = makeHistSandbox();
  h.state.busy = true; // job กำลังวิ่ง
  h.fns.openHistoryInMain(ROW);
  ok("job วิ่งอยู่ → บล็อกสุภาพ (toast hist.busy) ไม่ทับจอ", h.calls.status.length === 1 && h.calls.status[0][0].includes("รอคำพยากรณ์ปัจจุบันเสร็จก่อน") && h.calls.status[0][1] === "err");
  ok("บล็อกแล้วไม่แตะการ์ดหลัก/answer-mode + มือถือคงหน้าถาม (keepHistoryOnAskPage)", h.els.result.innerHTML === "" && h.calls.answerMode.length === 0 && h.calls.keep === 1 && !h.state.historyView);
}

// ===== 6) source-level: สายไฟครบ + ของเก่าถูกถอด =====
{
  ok("คลิกรายการประวัติ → openHistoryInMain (แทน expand ท้ายหน้า)", /openHistoryInMain\(findHistory\(nextHistoryId\)\)/.test(src));
  ok("ปุ่ม 'ถามต่อจากคำตอบนี้' ใช้กลไก context เดิม (data-hact continue → continueFromHistory)", extract("historyMainHtml").includes('data-hact="continue"') && /if \(act === 'continue'\) \{ continueFromHistory\(row\); return; \}/.test(src));
  ok("ปุ่มกลับ (hist-close) → closeHistoryView", extract("historyMainHtml").includes('data-hact="hist-close"') && /if \(act === 'hist-close'\) \{ closeHistoryView\(\); return; \}/.test(src));
  ok("ป้าย 📜 จากประวัติ + วันที่ บนการ์ดหลัก", extract("historyMainHtml").includes("hist.fromTag") && extract("historyMainHtml").includes("hist-tag"));
  ok("คำตอบเก่า render ผ่าน mdSafe (markdown ปลอดภัย) + proof + ปุ่มหลักฐานราย AI", /mdSafe\(row\.answer \|\| ''\)/.test(extract("historyMainHtml")) && extract("historyMainHtml").includes("renderFusionProof(fusion)") && extract("historyMainHtml").includes("renderAnswerTools(fusion)"));
  ok("detail expand แบบเก่าถูกถอด (show-answer + showHistoryAnswerId หายหมด)", !src.includes("show-answer") && !src.includes("showHistoryAnswerId"));
  ok("read-bar โชว์คำถามเก่า+ชื่อดวงตอนดูประวัติ (historyView branch)", extract("updateReadBar").includes("state.historyView"));
  ok("ถามต่อ/รันใหม่/ล้าง → ออกจากโหมดดูประวัติ (กัน state ค้าง)", /state\.historyView = null; \/\/ r384: ถามต่อ/.test(src) && /state\.historyView = null; \/\/ r384: รันใหม่/.test(src) && /state\.historyView = null; \/\/ r384: ล้าง/.test(src));
  ok("เปลี่ยนดวง → ปิดโหมดดูประวัติ", /if \(state\.historyView\) closeHistoryView\(\);/.test(src));
  ok("desktop scroll guard ด้วย !isMobileFold()", /if \(!isMobileFold\(\)\) \{\s*\n\s*var panel = document\.querySelector\('\.result-panel'\)/.test(src));
  ok("CSS การ์ดประวัติ (hist-tag/hist-q/hist-actions) + วันเด่น (snp-day) มีครบ 2 ธีมผ่าน var()", src.includes(".hist-tag{") && src.includes(".hist-q{") && src.includes(".hist-actions{") && src.includes(".snp-day{") && src.includes('[data-theme="light"] .snp-day'));
}

// ===== 6b) r384b · มือถือโหมดอ่าน: การ์ดคำตอบไม่โดนบีบ (root cause: .layout 2 คอลัมน์ของ visual refresh อยู่นอก media ทับกฎมือถือ) =====
function extractBlockAt(startIdx) {
  let depth = 0;
  for (let j = src.indexOf("{", startIdx); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return src.slice(startIdx, j + 1); }
  }
  throw new Error("unbalanced css block");
}
{
  const twoColIdx = src.indexOf("grid-template-columns:minmax(330px,410px)");
  const m900Idx = src.lastIndexOf("@media (max-width:900px)");
  const m900 = extractBlockAt(m900Idx);
  ok("มือถือ ≤900: .layout กลับเป็น 1 คอลัมน์ 'หลัง' กฎ 2 คอลัมน์ของ refresh (cascade ชนะ → การ์ดคำตอบเต็มกว้าง)",
    twoColIdx > -1 && m900Idx > twoColIdx && /\.layout\{[^}]*grid-template-columns:1fr/.test(m900));
  const m768 = extractBlockAt(src.indexOf("@media (max-width:768px)"));
  ok("answer-mode มือถือ: ไม่มี max-height บีบกล่องคำตอบ (สูงตามเนื้อหา)", !/max-height/.test(m768));
  ok("answer-mode มือถือ: ไม่มี overflow:auto/scroll ซ้อนในกล่องคำตอบ (ใช้ scroll ของหน้า)", !/overflow(-y)?:\s*(auto|scroll)/.test(m768));
  ok("กล่องคำตอบ (.result-content ใน answer-mode) ใช้ min-height เท่านั้น",
    /body\.hk-answer-mode \.result-panel \.result-content\{[^}]*min-height:52vh/.test(src) && !/body\.hk-answer-mode[^{]*\.result-content\{[^}]*max-height/.test(src));
  ok("มือถือเปิดประวัติ → เริ่มอ่านจากหัวการ์ด (window.scrollTo top:0 ใน branch มือถือ)",
    /window\.scrollTo\(\{ top:0/.test(extract("openHistoryInMain")));
}
{
  const h = makeHistSandbox();
  h.setMobile(true);
  h.fns.openHistoryInMain(ROW);
  ok("มือถือ: เข้าโหมดอ่าน + ไม่ใช้ desktop scrollIntoView", h.calls.answerMode[0] === true && h.calls.scroll === 0);
  ok("มือถือ: window.scrollTo top:0 (กัน scroll ค้างกลางการ์ดหลัง takeover ย่อหน้า)", h.calls.winScroll.length === 1 && h.calls.winScroll[0].top === 0);
}

// ===== 7) script ทั้งก้อน parse ผ่าน (node --check) =====
{
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let allOk = blocks.length > 0;
  blocks.forEach((b, i) => {
    const f = path.join(os.tmpdir(), `mf-r384-${process.pid}-${i}.js`);
    fs.writeFileSync(f, b[1]);
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch { allOk = false; }
    fs.unlinkSync(f);
  });
  ok(`script block ทุกก้อน parse ผ่าน (${blocks.length} ก้อน)`, allOk);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
