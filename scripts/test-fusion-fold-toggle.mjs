// r382 · ทดสอบ master-fusion.html:
//   (1) การ์ด 🔗/🎯 พับ/กางได้ทุกอุปกรณ์ — มือถือเริ่มพับ (หัว+สรุป 1 บรรทัด) · desktop เริ่มกาง
//   (2) จำสถานะที่ user กดต่อ job (sessionStorage) — re-render ระหว่าง polling/เปลี่ยนภาษา ไม่ reset · resume/reload คงสถานะ
//   (3) full-screen takeover มือถือ: answer-mode = หน้าอ่านเต็มจอ + read-bar สลับหน้าถาม ↔ หน้าอ่าน (desktop no-op)
// หมายเหตุ: jsdom ไม่มีใน node_modules (ห้ามเพิ่ม dependency) → extract ฟังก์ชันจริงจาก HTML มารันกับ DOM stub
// run: node scripts/test-fusion-fold-toggle.mjs
import fs from "node:fs";
import path from "node:path";
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

const mkClassList = () => {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; }, contains: (c) => s.has(c) };
};
const mkStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

// ---------- sandbox การ์ด 🔗/🎯 (render จริงทุกบรรทัด · isMobileFold/sessionStorage stub) ----------
function makeFoldSandbox({ mobile, sessionStorage }) {
  sessionStorage = sessionStorage || mkStorage();
  const dict = { "res.title": "🔗 เสียงสะท้อนข้ามศาสตร์", "res.r6": "ปีชง", "ds.title": "🎯 วันลั่นไก", "ds.days": "วัน" };
  const t = (k) => (dict[k] != null ? dict[k] : k);
  const state = { locale: "th", resonance: null };
  const els = {
    resonance: { innerHTML: "", classList: mkClassList() },
    sniper: { innerHTML: "", classList: mkClassList() },
  };
  const isMobileFold = () => !!mobile;
  const sciLabel = (s) => s;
  const prelude = "var FOLD_PREF_KEY = 'hk_fusion5_fold';\nvar foldJobKey = '';\nvar SNP_FLAG = { red:'\u{1F534}', yellow:'\u{1F7E1}', green:'\u{1F7E2}' };\n";
  const code = prelude + [
    extract("esc"),
    extract("loadFoldPref"), extract("saveFoldPref"), extract("bindFoldJob"), extract("resetFoldPref"),
    extract("cardFoldState"), extract("applyCardFold"),
    extract("resonanceFoldSummary"), extract("sniperFoldSummary"),
    extract("resThemeName"), extract("resVoteLabel"), extract("resEffLabel"), extract("resDimLabel"), extract("resHeavyLabel"),
    extract("resonanceHasContent"), extract("resonanceBodyHtml"), extract("resonancePairsHtml"),
    extract("sniperHasContent"), extract("sniperStripHtml"), extract("sniperPersonHtml"),
    extract("renderDaySniper"), extract("renderResonance"),
  ].join("\n");
  const factory = new Function("t", "state", "els", "sessionStorage", "isMobileFold", "sciLabel",
    code + "\nreturn { loadFoldPref, saveFoldPref, bindFoldJob, resetFoldPref, cardFoldState, applyCardFold, resonanceFoldSummary, sniperFoldSummary, renderResonance, renderDaySniper };");
  return { fns: factory(t, state, els, sessionStorage, isMobileFold, sciLabel), els, state, sessionStorage };
}

// data ตัวอย่าง — โครงเดียวกับ RESONANCE_PACKET/DAY_SNIPER จาก engine
const RES = {
  targetYear: 2026,
  perPerson: [{
    name: "เอี๊ยว",
    r1: { resonant: [] },
    r2: [
      { month: 3, planet: "saturn", planetTh: "เสาร์", sciences: ["bazi", "western"], evidences: [] },
      { month: 4, independence: "structural", planetTh: "เสาร์", sciences: ["bazi"], evidences: [] },
    ],
    r3: [],
    conflicts: [{ month: 5, beneficScience: "bazi", maleficScience: "western", beneficEvidence: [], maleficEvidence: [] }],
    r5: { source: "db_yongshen", neededElementTh: "น้ำ", summaryTh: "ต้องการน้ำ", evidence: [] },
    r6: { targetGanzhi: "丙午", voiceCount: 3, votes: [{ system: "bazi", heavy: true }, { system: "western", heavy: true }, { system: "vedic", heavy: true }] },
  }],
  r4Pairs: [],
  daySniper: {
    topicTh: "งาน", fromISO: "2026-07-01", toISO: "2026-09-01",
    perPerson: [{ name: "เอี๊ยว", totals: { red: 13, yellow: 11, green: 4 }, scannedDays: 60, days: [{ dateISO: "2026-07-15", flag: "red", ganzhi: "甲子", needles: ["A", "B"], a: [], b: [], c: [], context: [] }] }],
  },
};

// ===== 1) มือถือ render → พับ + สรุป 1 บรรทัดถูกต้อง (ทั้ง 🔗 และ 🎯) =====
{
  const m = makeFoldSandbox({ mobile: true });
  m.fns.resetFoldPref("run-1");
  m.fns.renderResonance(RES);
  ok("มือถือ: การ์ด 🔗 เริ่มแบบพับ (hk-fold)", m.els.resonance.classList.contains("hk-fold"));
  ok("มือถือ: การ์ด 🎯 เริ่มแบบพับ (hk-fold)", m.els.sniper.classList.contains("hk-fold"));
  ok("การ์ด 🔗 มีแถบสรุปตอนพับ (res-foldsum)", m.els.resonance.innerHTML.includes('class="res-foldsum"'));
  ok("สรุป 🔗 ถูก: ⚠️ ปีชง 3/3 · R2 นับเฉพาะ independent ×1 · 🌊 · ⚡", m.els.resonance.innerHTML.includes("⚠️ ปีชง 3/3 · R2×1 · 🌊×1 · ⚡×1"), m.els.resonance.innerHTML.slice(0, 400));
  ok("สรุป 🎯 ถูก: 🔴13 🟡11 🟢4", m.els.sniper.innerHTML.includes("🔴13 🟡11 🟢4"), m.els.sniper.innerHTML.slice(0, 300));
  ok("ตอนพับ เนื้อหาเต็ม (res-person) ยังอยู่ใน DOM — ซ่อนด้วย CSS เท่านั้น ไม่เสีย state", m.els.resonance.innerHTML.includes('class="res-person"'));
}

// ===== 2) แตะกาง → คงสถานะข้าม re-render (polling/เปลี่ยนภาษา) · แยกการ์ดใครการ์ดมัน =====
{
  const m = makeFoldSandbox({ mobile: true });
  m.fns.resetFoldPref("run-1");
  m.fns.renderResonance(RES);
  // user แตะการ์ด 🔗 ตอนพับ = กาง (logic เดียวกับ listener: remove hk-fold + saveFoldPref(false))
  m.els.resonance.classList.remove("hk-fold");
  m.fns.saveFoldPref("res", false);
  m.fns.renderResonance(RES); // re-render รอบ polling
  m.fns.renderResonance(RES); // re-render เปลี่ยนภาษา
  ok("แตะกาง 🔗 แล้ว re-render ×2 → ยังกางอยู่ (ไม่ reset)", !m.els.resonance.classList.contains("hk-fold"));
  ok("การ์ด 🎯 ไม่ถูกพลอยกาง (สถานะแยกต่อการ์ด)", m.els.sniper.classList.contains("hk-fold"));
  // user พับ 🔗 กลับ
  m.fns.saveFoldPref("res", true);
  m.fns.renderResonance(RES);
  ok("กดพับกลับ → re-render แล้วยังพับ", m.els.resonance.classList.contains("hk-fold"));
}

// ===== 3) desktop: เริ่มกาง + กดพับได้ (สถานะคงข้าม re-render) =====
{
  const d = makeFoldSandbox({ mobile: false });
  d.fns.resetFoldPref("run-2");
  d.fns.renderResonance(RES);
  ok("desktop: การ์ด 🔗 เริ่มแบบกาง (ไม่มี hk-fold)", !d.els.resonance.classList.contains("hk-fold"));
  ok("desktop: การ์ด 🎯 เริ่มแบบกาง", !d.els.sniper.classList.contains("hk-fold"));
  d.fns.saveFoldPref("snp", true); // user กดหัวการ์ด 🎯 = พับ
  d.fns.renderResonance(RES);
  ok("desktop กดพับ 🎯 → คงพับข้าม re-render · 🔗 ยังกาง", d.els.sniper.classList.contains("hk-fold") && !d.els.resonance.classList.contains("hk-fold"));
}

// ===== 4) resume/reload: pref ย้ายตาม jobId + งานใหม่ reset + ไม่มี pref = ค่าเริ่มต้นตามอุปกรณ์ =====
{
  const store = mkStorage();
  const m1 = makeFoldSandbox({ mobile: true, sessionStorage: store });
  m1.fns.resetFoldPref("client-run-7"); // กดรัน → pref เกาะ clientRunId
  m1.fns.saveFoldPref("res", false);    // user กางระหว่างรัน
  m1.fns.bindFoldJob("job-77");         // server ตอบ jobId จริง → ย้าย pref ตาม
  ok("bindFoldJob ย้าย pref clientRunId → jobId (ยังกางอยู่)", m1.fns.cardFoldState("res") === false);
  // จำลอง reload กลางทาง (tab เดิม sessionStorage อยู่): sandbox ใหม่ + resume ผูก jobId เดิม
  const m2 = makeFoldSandbox({ mobile: true, sessionStorage: store });
  m2.fns.bindFoldJob("job-77");
  ok("resume หลัง reload: อ่าน pref เดิมจาก sessionStorage → 🔗 ยังกางตามที่ user เลือก", m2.fns.cardFoldState("res") === false);
  ok("resume: การ์ดที่ user ไม่เคยแตะ (🎯) = ค่าเริ่มต้นมือถือ → พับ", m2.fns.cardFoldState("snp") === true);
  // resume งานคนละ job → pref เก่าไม่ถูกใช้
  const m3 = makeFoldSandbox({ mobile: true, sessionStorage: store });
  m3.fns.bindFoldJob("job-99");
  ok("job อื่น: ไม่หยิบ pref ของ job เก่า → พับตามค่าเริ่มต้นมือถือ", m3.fns.cardFoldState("res") === true);
  // งานใหม่ (กดรันใหม่) → reset
  m1.fns.resetFoldPref("client-run-8");
  ok("กดรันงานใหม่ → resetFoldPref ล้าง pref เดิม (กลับค่าเริ่มต้น)", m1.fns.cardFoldState("res") === true);
}

// ===== 5) read-bar สลับ หน้าอ่าน ↔ หน้าถาม (state ไม่หาย · desktop no-op เพราะ CSS อยู่ใน media) =====
{
  const body = { classList: mkClassList() };
  const documentStub = { body };
  const readBar = { bar: {}, btn: { textContent: "" }, label: { innerHTML: "" } };
  const dict = { "read.back": "กลับไปดูคำพยากรณ์" };
  const t = (k) => (dict[k] != null ? dict[k] : k);
  const state = { pendingQuestion: "ปีนี้ย้ายงานดีไหม", history: [] };
  const els = { question: { value: "" } };
  const selectedProfileIds = () => ["1", "2", "3"];
  const profileById = (id) => ({ 1: { nickname: "ไนท์" }, 2: { name: "ใหม่" }, 3: { nickname: "เอี๊ยว" } })[id] || null;
  const cleanLocalHistory = (l) => l || [];
  const code = [extract("esc"), extract("summaryQuestionText"), extract("updateReadBar"), extract("setAnswerMode")].join("\n");
  const factory = new Function("document", "readBar", "t", "state", "els", "selectedProfileIds", "profileById", "cleanLocalHistory",
    code + "\nreturn { updateReadBar, setAnswerMode };");
  const fns = factory(documentStub, readBar, t, state, els, selectedProfileIds, profileById, cleanLocalHistory);
  fns.setAnswerMode(true); // กดรัน/resume → เข้าโหมดอ่าน
  ok("answer-mode: body ติด hk-answer-mode + ไม่ติด hk-ask-open (มือถือ = หน้าอ่านเต็มจอ)", body.classList.contains("hk-answer-mode") && !body.classList.contains("hk-ask-open"));
  ok("read-bar หน้าอ่าน: ปุ่ม ← + ชื่อกลุ่มย่อ 'ไนท์ +2' + คำถาม ellipsis", readBar.btn.textContent === "←" && readBar.label.innerHTML.includes("ไนท์ +2") && readBar.label.innerHTML.includes("ปีนี้ย้ายงานดีไหม"), readBar.label.innerHTML);
  // แตะแถบ = สลับไปหน้าถาม (logic เดียวกับ listener: toggle class + updateReadBar)
  body.classList.toggle("hk-ask-open");
  fns.updateReadBar();
  ok("แตะแถบ → หน้าถาม: ปุ่ม → + ป้าย 'กลับไปดูคำพยากรณ์'", body.classList.contains("hk-ask-open") && readBar.btn.textContent === "→" && readBar.label.innerHTML.includes("กลับไปดูคำพยากรณ์"), readBar.label.innerHTML);
  ok("สลับหน้าไม่แตะ state ฟอร์ม/คำตอบ (แค่ class บน body)", state.pendingQuestion === "ปีนี้ย้ายงานดีไหม" && body.classList.contains("hk-answer-mode"));
  body.classList.toggle("hk-ask-open");
  fns.updateReadBar();
  ok("แตะซ้ำ → กลับหน้าอ่าน (toggle ไปมาได้)", !body.classList.contains("hk-ask-open") && readBar.btn.textContent === "←");
  fns.setAnswerMode(false); // รันพลาด/ไม่มีงาน → กลับหน้าปกติ
  ok("setAnswerMode(false) → ออกจาก takeover ทั้งสอง class", !body.classList.contains("hk-answer-mode") && !body.classList.contains("hk-ask-open"));
}

// ===== 6) source-level: CSS takeover อยู่ใน @media 768 · listener/wiring ครบทุกเส้นทาง =====
{
  const mediaAt = src.indexOf("r374 · Mobile answer-mode");
  ok("หน้าอ่านซ่อน topbar + แบนเนอร์หัวเพจ (main > .header) — เฉพาะใน media มือถือ", src.indexOf("body.hk-answer-mode:not(.hk-ask-open) .topbar") > mediaAt && src.includes("main > .header{display:none}"));
  ok("หน้าถาม (hk-ask-open) ซ่อนฝั่งพยากรณ์ทั้งใบ", src.indexOf("body.hk-answer-mode.hk-ask-open .result-panel{display:none}") > mediaAt);
  ok("read-bar โชว์เฉพาะ answer-mode ใน media · base display:none (desktop ไม่เห็นตลอด)", src.indexOf("body.hk-answer-mode .read-bar{display:flex}") > mediaAt && src.includes(".read-bar{display:none;position:sticky"));
  ok("หน้าอ่าน: การ์ดถามตัด chrome (border/หัว) เหลือ status+progress", src.includes("body.hk-answer-mode:not(.hk-ask-open) .ask-panel{border:0") && src.includes("body.hk-answer-mode:not(.hk-ask-open) .ask-panel .panel-head{display:none}"));
  ok("ask-summary เดิมถูกถอดหมด (แทนด้วย read-bar)", !src.includes("ask-summary"));
  ok("กติกาพับการ์ดอยู่ base (ทุกอุปกรณ์): ซ่อน res-person + โชว์ foldsum + chevron ▾/▸", src.includes(".hk-fold .res-person{display:none}") && src.includes(".hk-fold .res-foldsum{display:block") && src.includes("content:' ▸'"));
  ok("listener การ์ด: พับ→แตะกาง · กาง→แตะหัว/สรุปพับ · จำ pref ทั้งสองทาง", src.includes("saveFoldPref(cardKey, false)") && src.includes("saveFoldPref(cardKey, true)") && src.includes("closest('.res-head, .res-foldsum')"));
  ok("send: งานใหม่ reset pref + ผูก jobId เมื่อได้ (bindFoldJob)", src.includes("resetFoldPref(pendingMeta.clientRunId)") && src.includes("bindFoldJob(j.jobId)"));
  ok("resume ทุกเส้นทางผูก job: resumeKnownJob + paintResumeFromLocal", src.includes("bindFoldJob(meta.jobId); // r382") && src.includes("bindFoldJob(meta.jobId || meta.clientRunId)"));
  ok("ประวัติ: บล็อก 🔗/🎯 เป็น details — มือถือเริ่มพับ · desktop เริ่มกาง (open)", src.split("res-histfold").length >= 3 && src.includes("(isMobileFold() ? '' : ' open')"));
  const th = src.slice(src.indexOf("th:{"), src.indexOf("en:{"));
  const en = src.slice(src.indexOf("en:{"), src.indexOf("zh:{"));
  const zh = src.slice(src.indexOf("zh:{"));
  ok("i18n read.back ครบ 3 ภาษา", [th, en, zh].every((s) => s.includes("'read.back'")));
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
