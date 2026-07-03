// r381 · ทดสอบ master-fusion.html: มือถือ browser evict tab → reload กลางงาน fusion
//   (1) เปิดหน้าแล้วมี jobId ค้างใน localStorage → hk-answer-mode ติดทันที (sync ก่อน network) + ask-summary มีคำถาม
//   (2) snapshot (hk_fusion5_snap) → แถบ % paint ต่อจากค่าเดิม ไม่รีเซ็ต 8% + creep นับจากเวลาเริ่มงานจริง
//   (3) job done ระหว่างเราไม่อยู่ → กลับมาเห็นคำตอบจาก snapshot ทันที · ล้าง = สะอาด · desktop = CSS ใน @media เท่านั้น
// หมายเหตุ: jsdom ไม่มีใน node_modules → extract ฟังก์ชันจริงจากไฟล์ HTML มารันกับ DOM stub (pattern เดียวกับ test-fusion-mobile-progress.mjs)
// run: node scripts/test-fusion-resume-restore.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "public", "master-fusion.html"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

// ---------- extract ฟังก์ชันจริง (รองรับ async function ด้วย) ----------
function extract(name) {
  const idx = src.indexOf(`function ${name}(`);
  if (idx < 0) throw new Error(`missing function ${name}`);
  const isAsync = src.slice(Math.max(0, idx - 6), idx) === "async ";
  let depth = 0;
  for (let j = src.indexOf("{", idx); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return (isAsync ? "async " : "") + src.slice(idx, j + 1); }
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

function makeSandbox() {
  const localStorage = mkStorage();
  const state = {};
  const body = { classList: mkClassList() };
  const documentStub = { body };
  const askSummary = { name: { textContent: "" }, q: { textContent: "" }, bar: {} };
  const els = { result: { innerHTML: "" }, question: { value: "" } };
  const calls = { renderProgress: [], setRunState: [], setStatus: [], renderJobDone: [], showRunError: [], endRun: 0, clearedJob: 0 };
  const t = (k) => k;
  const esc = (s) => String(s);
  const mdSafe = (s) => "<md>" + String(s) + "</md>";
  const sciLabel = (s) => s;
  const DISCIPLINES = { bazi: { ai: "a" }, qizheng: { ai: "b" }, ziwei: { ai: "c" }, western: { ai: "d" }, vedic: { ai: "e" } };
  const SCI_ORDER = ["bazi", "qizheng", "ziwei", "western", "vedic"];
  const JOB_MAX_MS = 20 * 60 * 1000;
  const FUSION_JOB_KEY = "hk_fusion5_job";
  const FUSION_DRAFT_KEY = "hk_fusion5_draft";
  const SNAP_REPLY_MAX = 50000;
  const FUSION_SNAP_KEY = "hk_fusion5_snap";
  const stubs = {
    stopProgressPolling: () => {},
    renderProgress: (st) => calls.renderProgress.push(st),
    setRunState: (a, b) => calls.setRunState.push([a, b]),
    setStatus: (a, b) => calls.setStatus.push([a, b]),
    runWaitPlaceholderHtml: (txt) => "<wait>" + txt + "</wait>",
    profileById: (id) => ({ 1: { nickname: "เอี๊ยว" }, 2: { name: "ใหม่" } })[id] || null,
    renderResonance: () => {},
    renderJobDone: (r, m) => calls.renderJobDone.push([r, m]),
    showRunError: (h) => calls.showRunError.push(h),
    endRun: () => { calls.endRun++; },
    fusionErrorText: (e) => String(e || "err"),
  };
  const code = [
    extract("loadJobMeta"), extract("saveJob"), extract("clearJob"), extract("jobStartedAt"),
    extract("loadSnap"), extract("clearSnap"), extract("saveSnap"), extract("snapMatches"), extract("snapNames"),
    extract("resetProgressMeter"), extract("startSyntheticProgress"), extract("paintResumeFromLocal"),
    extract("fusionPanelCounts"), extract("fusionMilestone"), extract("fusionCreep"), extract("computeFusionPercent"),
    extract("pollJob"),
  ].join("\n");
  const params = ["localStorage", "state", "document", "askSummary", "els", "t", "esc", "mdSafe", "sciLabel", "DISCIPLINES", "SCI_ORDER",
    "JOB_MAX_MS", "FUSION_JOB_KEY", "FUSION_DRAFT_KEY", "SNAP_REPLY_MAX", "FUSION_SNAP_KEY", "fetch", ...Object.keys(stubs)];
  const factory = new Function(...params,
    code + "\nreturn { loadJobMeta, saveJob, clearJob, jobStartedAt, loadSnap, clearSnap, saveSnap, snapMatches, snapNames, resetProgressMeter, startSyntheticProgress, paintResumeFromLocal, computeFusionPercent, pollJob };");
  const make = (fetchStub) => factory(localStorage, state, documentStub, askSummary, els, t, esc, mdSafe, sciLabel, DISCIPLINES, SCI_ORDER,
    JOB_MAX_MS, FUSION_JOB_KEY, FUSION_DRAFT_KEY, SNAP_REPLY_MAX, FUSION_SNAP_KEY, fetchStub, ...Object.values(stubs));
  return { make, localStorage, state, body, askSummary, els, calls };
}

const NOW = Date.now();

// ===== 1) reload พร้อม jobId ค้าง → answer-mode ติดทันที + summary มีคำถาม + % ต่อจาก snapshot =====
{
  const sb = makeSandbox();
  const fns = sb.make(null);
  fns.saveJob({ jobId: "job-1", clientRunId: "run-1", question: "ปีนี้ย้ายงานดีไหม", profileIds: ["1"], sciences: ["bazi", "ziwei"], startedAt: NOW - 120000 });
  fns.saveSnap({ jobKey: "job-1", phase: "running", pct: 42, question: "ปีนี้ย้ายงานดีไหม", names: "เอี๊ยว" });
  const painted = fns.paintResumeFromLocal();
  ok("reload มี jobId ค้าง → paint ทันที (return true)", painted === true);
  ok("hk-answer-mode ติดที่ body ทันที (ก่อน network ใดๆ)", sb.body.classList.contains("hk-answer-mode"));
  ok("hk-ask-open ถูกล้าง (การ์ดยุบจริง ไม่ค้างสถานะกาง)", !sb.body.classList.contains("hk-ask-open"));
  ok("ask-summary มีคำถามจากงานค้าง", sb.askSummary.q.textContent === "ปีนี้ย้ายงานดีไหม", sb.askSummary.q.textContent);
  ok("ask-summary มีชื่อดวงจาก snapshot (profiles ยังไม่โหลด)", sb.askSummary.name.textContent === "เอี๊ยว", sb.askSummary.name.textContent);
  ok("โซนคำตอบ = placeholder รอคำตอบ (ไม่ใช่ฟอร์มเปล่า)", sb.els.result.innerHTML.startsWith("<wait>"));
  ok("สถานะ = running", sb.calls.setRunState.some((c) => c[0] === "running"));
  const st = sb.calls.renderProgress[sb.calls.renderProgress.length - 1];
  ok("snapshot paint: % seed = 42 ไม่รีเซ็ต 8", st && st.percent === 42, JSON.stringify(st && st.percent));
  ok("synthetic progress ใช้ศาสตร์จาก meta (2 ศาสตร์)", st && Object.keys(st.panel).length === 2);
  ok("time-creep นับจากตอนเริ่มงานจริง (startedAt เดิม)", st && Math.abs(st.startedAt - (NOW - 120000)) < 2000 && sb.state.progressMark && sb.state.progressMark.at === st.startedAt);
  const pct = fns.computeFusionPercent(st, Date.now(), sb.state.progressMark.at);
  ok("% ที่คำนวณต่อไม่ต่ำกว่าค่า snapshot (monotonic)", pct >= 42, String(pct));
}

// ===== 2) job done ระหว่างที่เราไม่อยู่ → กลับมาเห็นคำตอบทันทีจาก snapshot =====
{
  const sb = makeSandbox();
  const fns = sb.make(null);
  fns.saveJob({ jobId: "job-2", question: "การเงินครึ่งปีหลัง", profileIds: ["1"], sciences: ["bazi"], startedAt: NOW - 60000 });
  fns.saveSnap({ jobKey: "job-2", phase: "done", pct: 100, question: "การเงินครึ่งปีหลัง", names: "เอี๊ยว", reply: "# คำฟันธง\nไปได้" });
  ok("paint สำเร็จ", fns.paintResumeFromLocal() === true);
  ok("เห็นคำตอบทันที (render ผ่าน mdSafe)", sb.els.result.innerHTML === "<md># คำฟันธง\nไปได้</md>", sb.els.result.innerHTML.slice(0, 40));
  ok("การ์ดถามยุบ (answer-mode) พร้อมคำตอบ", sb.body.classList.contains("hk-answer-mode"));
  ok("ตั้ง flag resumePaintedDone (กัน placeholder ทับตอน resume จริง)", sb.state.resumePaintedDone === true);
}

// ===== 3) snapshot ไม่ตรงงาน (jobKey คนละงาน) → ใช้ meta อย่างเดียว seed 8% =====
{
  const sb = makeSandbox();
  const fns = sb.make(null);
  fns.saveJob({ jobId: "job-3", question: "สุขภาพ", profileIds: ["1"], sciences: ["bazi"], startedAt: NOW - 5000 });
  fns.saveSnap({ jobKey: "job-OLD", phase: "done", pct: 100, names: "คนเก่า", reply: "ของเก่า" });
  ok("paint ได้จาก meta", fns.paintResumeFromLocal() === true);
  ok("ไม่หยิบคำตอบ/ชื่อจาก snapshot งานเก่า", sb.els.result.innerHTML.startsWith("<wait>") && sb.askSummary.name.textContent === "—");
  const st = sb.calls.renderProgress[sb.calls.renderProgress.length - 1];
  ok("% เริ่ม 8 ตามปกติ (ไม่มี snapshot ที่เชื่อได้)", st && st.percent === 8);
}

// ===== 4) ล้าง = สะอาด + งานเก่าเกิน 20 นาที = ไม่ paint =====
{
  const sb = makeSandbox();
  const fns = sb.make(null);
  ok("ไม่มีงานค้าง → ไม่ paint (ฟอร์มปกติ)", fns.paintResumeFromLocal() === false && !sb.body.classList.contains("hk-answer-mode"));
  fns.saveJob({ jobId: "job-4", question: "x", startedAt: NOW - 25 * 60 * 1000 });
  ok("งานค้างเกิน JOB_MAX_MS (20 นาที) → ไม่ paint", fns.paintResumeFromLocal() === false);
  fns.saveJob({ jobId: "job-5", question: "y", startedAt: NOW });
  fns.saveSnap({ jobKey: "job-5", pct: 30 });
  fns.clearJob();
  fns.clearSnap();
  ok("clearJob + clearSnap → paint ไม่ทำงาน · localStorage สะอาด", fns.paintResumeFromLocal() === false && fns.loadSnap() === null && fns.loadJobMeta() === null);
}

// ===== 5) saveSnap: จำกัดขนาดคำตอบ ≤50KB =====
{
  const sb = makeSandbox();
  const fns = sb.make(null);
  fns.saveSnap({ jobKey: "j", phase: "done", reply: "ก".repeat(120000) });
  const snap = fns.loadSnap();
  ok("คำตอบยาวถูกตัดเหลือ ≤50,000 ตัวอักษร", snap && snap.reply.length === 50000, String(snap && snap.reply.length));
}

// ===== 6) pollJob hook: เก็บ snapshot ทุกรอบ poll · done เก็บคำตอบ · error ล้าง snapshot =====
{
  const sb = makeSandbox();
  const mkRes = (json) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });
  let payload = { status: "running" };
  const fns = sb.make(() => mkRes(payload));
  const meta = { jobId: "job-6", question: "ลงทุน", profileIds: ["1", "2"], startedAt: NOW };
  sb.state.activeJob = meta;
  sb.state.progressPct = 37.4;
  await fns.pollJob(meta);
  let snap = fns.loadSnap();
  ok("poll running → snapshot pct จากแถบจริง (37) + phase running", snap && snap.phase === "running" && snap.pct === 37, JSON.stringify(snap));
  ok("snapshot เก็บคำถาม + ชื่อดวง (เอี๊ยว + ใหม่)", snap && snap.question === "ลงทุน" && snap.names === "เอี๊ยว + ใหม่", snap && snap.names);
  payload = { status: "done", result: { reply: "คำตอบสุดท้าย" } };
  await fns.pollJob(meta);
  snap = fns.loadSnap();
  ok("poll done → snapshot done + เก็บคำตอบ + pct 100", snap && snap.phase === "done" && snap.reply === "คำตอบสุดท้าย" && snap.pct === 100);
  ok("done → renderJobDone ถูกเรียก + job meta ถูกล้าง", sb.calls.renderJobDone.length === 1 && fns.loadJobMeta() === null);
  // error → snapshot ถูกล้าง
  const sb2 = makeSandbox();
  const fns2 = sb2.make(() => mkRes({ status: "error", error: "boom" }));
  const meta2 = { jobId: "job-7", question: "q", profileIds: [], startedAt: NOW };
  sb2.state.activeJob = meta2;
  fns2.saveSnap({ jobKey: "job-7", phase: "running", pct: 20 });
  await fns2.pollJob(meta2);
  ok("poll error → snapshot ถูกล้าง + showRunError", fns2.loadSnap() === null && sb2.calls.showRunError.length === 1);
}

// ===== 7) desktop = พฤติกรรมเดิม: กติกายุบทั้งหมดอยู่ใน @media (max-width:768px) เท่านั้น =====
{
  const styleStart = src.indexOf("<style>");
  const styleEnd = src.indexOf("</style>");
  const css = src.slice(styleStart, styleEnd);
  const mOpen = css.indexOf("@media (max-width:768px){");
  let depth = 0, mClose = -1;
  for (let j = css.indexOf("{", mOpen); j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (!depth) { mClose = j; break; } }
  }
  let outside = 0, i = -1;
  while ((i = css.indexOf("body.hk-answer-mode", i + 1)) !== -1) { if (i < mOpen || i > mClose) outside++; }
  ok("CSS body.hk-answer-mode ทุกกฎอยู่ใน @media 768px → desktop ติด class ก็ไม่ยุบ", mOpen > 0 && mClose > mOpen && outside === 0, `outside=${outside}`);
}

// ===== 8) source-level: hooks ครบทุกเส้นทาง resume/visibility =====
{
  const between = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const resumeKnown = extract("resumeKnownJob");
  ok("resumeKnownJob: seed % จาก snapshot (loadSnap + snapMatches + jobStartedAt)", /loadSnap\(\)/.test(resumeKnown) && /snapMatches\(/.test(resumeKnown) && /startedAt:\s*jobStartedAt\(meta\)/.test(resumeKnown));
  ok("resumeKnownJob: ไม่ทับคำตอบที่ paint จาก snapshot (guard resumePaintedDone)", /resumePaintedDone/.test(resumeKnown));
  const syncFn = extract("syncFusionOnReturn");
  ok("syncFusionOnReturn: งานยังวิ่ง → บังคับ hk-answer-mode (ไม่ลบ hk-ask-open)", /classList\.add\('hk-answer-mode'\)/.test(syncFn) && !/classList\.remove\('hk-ask-open'\)/.test(syncFn));
  const sendFn = extract("send");
  ok("send: กดรัน → เก็บ snapshot คำถาม+ชื่อดวงทันที + ผูก jobId เมื่อได้", /clearSnap\(\)/.test(sendFn) && /saveSnap\(\{\s*jobKey:pendingMeta\.clientRunId/.test(sendFn) && /saveSnap\(\{\s*jobKey:j\.jobId\s*\}\)/.test(sendFn));
  const resumeAny = extract("resumeJobIfAny");
  ok("resumeJobIfAny: server ยืนยันไม่มีงาน → คลี่การ์ดกลับ + ล้าง snapshot + progress", /setAnswerMode\(false\)/.test(resumeAny) && /clearSnap\(\)/.test(resumeAny) && /renderProgress\(null\)/.test(resumeAny));
  ok("boot ล้ม (เน็ตมือถือยังไม่กลับ) + มีงานค้าง → retry boot อัตโนมัติ", /scheduleBootRetry\(\)/.test(extract("bootFusion")) && /bootAttempts/.test(extract("scheduleBootRetry")));
  ok("paintResumeFromLocal ถูกเรียกตอนโหลดหน้า (sync ก่อน bootFusion)", src.indexOf("paintResumeFromLocal();") > -1 && src.indexOf("paintResumeFromLocal();") < src.indexOf("bootFusion();"));
  ok("เปิดจากประวัติ → answer-mode (ของเดิม r374 ยังอยู่)", /setAnswerMode\(true\); \/\/ r374: เปิดประวัติ/.test(src));
  ok("ปุ่มล้าง → clearSnap ด้วย", /clearDraft\(\);\s*\n\s*clearSnap\(\); \/\/ r381/.test(src));
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
