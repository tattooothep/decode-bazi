// r385 · ทดสอบ master-fusion.html — ห้องแชทต่อเนื่อง (chat room เหมือนไลน์):
//   (1) ถาม → ฟองคำถามชิดขวา + ฟองรอ (⏳ x% จริง) → ตอบเสร็จ = ฟองตอบ (การ์ดสด) ไม่ทำฟองซ้ำ
//   (2) ถามต่อ → POST /api/sifu/fusion5 มี context จริง (history 6 รอบเดิม + threadId) — mock fetch ตรวจ payload
//   (3) เปิดประวัติ → ห้องเดิม (ฟองรอบก่อนใน thread เดียวกัน) + composer พิมพ์ต่อ = seed thread เดิมก่อนส่ง
//   (4) 🆕 ห้องใหม่ → ล้างสะอาดกลับหน้าฟอร์ม · (5) reload กลางทาง → ฟองเดิม+ฟองรอกลับครบ
//   (6) ปุ่มส่งโชว์ราคายามจริง · ยามไม่พอ = ปุ่มพาไป /account · (7) i18n 3 ภาษา + 2 ธีม + node --check
// หมายเหตุ: ไม่มี jsdom → extract ฟังก์ชันจริงจาก HTML มารันกับ stub (แนวเดียวกับ test-fusion-hist-sniper-r384.mjs)
// run: node scripts/test-fusion-chat-room-r385.mjs
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
  const isAsync = src.slice(Math.max(0, idx - 6), idx) === "async ";
  let depth = 0;
  for (let j = src.indexOf("{", idx); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) return (isAsync ? "async " : "") + src.slice(idx, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
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
const T = (loc) => (k) => (I18N[loc] && I18N[loc][k] != null) ? I18N[loc][k] : (I18N.th[k] != null ? I18N.th[k] : k);

const mkClassList = () => {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; }, contains: (c) => s.has(c) };
};
const mkEl = () => ({ innerHTML: "", classList: mkClassList(), querySelector: () => null, children: [] });

// ---------- sandbox ห้องแชท (ฟังก์ชันจริง + stub บาง) ----------
function makeRoomSandbox({ locale = "th" } = {}) {
  const t = T(locale);
  const state = { locale, history: [], pendingQuestion: "", pendingAt: 0, result: null, historyView: null, busy: false, resuming: false, ready: true, fusionHistory: [], composerTopup: false, answers: {}, answerSeq: 0 };
  const roomEls = { head: mkEl(), log: mkEl(), composer: mkEl(), composerInput: { value: "", placeholder: "", style: {} }, composerSend: { textContent: "", disabled: false } };
  const els = { result: mkEl(), question: { value: "" }, meta: mkEl(), chat: mkEl() };
  const gate = { loggedIn: true, balance: 100, yam: 25, sciences: ["bazi", "western"] };
  const stubs = {
    t, state, roomEls, els,
    mdSafe: (s) => "<md>" + String(s) + "</md>",
    renderAnswerTools: (f) => (f ? '<div class="answer-tools">tools</div>' : ""),
    selectedProfileIds: () => ["p1"],
    selectedGuests: () => [],
    profileById: (id) => (id === "p1" ? { nickname: "เอี๊ยว" } : null),
    selectedProfileId: () => "p1",
    currentYam: () => gate.yam,
    isLoggedIn: () => gate.loggedIn,
    hourBalance: () => gate.balance,
    canUseFusion: () => gate.loggedIn && gate.balance >= gate.yam,
    activeSciences: () => gate.sciences,
    newRunId: () => "run-new",
    saveConversation: () => { stubs._saved = (stubs._saved || 0) + 1; },
    resetConversationForProfile: () => { state.history = []; state.pendingQuestion = ""; },
  };
  const code = [
    extract("esc"), extract("shortText"), extract("metaObj"), extract("cleanLocalHistory"), extract("findHistory"), extract("fusionFromHistory"),
    extract("roomActive"), extract("fmtBubbleTime"), extract("bubbleHtml"), extract("historyThreadKey"), extract("historyThreadRows"),
    extract("roomNames"), extract("roomTurns"), extract("roomHeadHtml"), extract("updateComposer"), extract("renderChatRoom"),
    extract("seedThreadFromHistoryView"),
  ].join("\n");
  const names = Object.keys(stubs);
  const factory = new Function(...names, code + "\nreturn { roomActive, fmtBubbleTime, bubbleHtml, historyThreadKey, historyThreadRows, roomTurns, roomHeadHtml, updateComposer, renderChatRoom, seedThreadFromHistoryView };");
  const fns = factory(...names.map((n) => stubs[n]));
  return { fns, state, roomEls, els, gate, t };
}

// ===== 1) ห้องปิดตอนยังไม่มีอะไร · ถาม → ฟองขวา+รอ · ตอบ → ฟองตอบไม่ซ้ำการ์ดสด =====
{
  const sb = makeRoomSandbox();
  sb.fns.renderChatRoom();
  ok("ยังไม่มีบทสนทนา → ห้องปิด (head/log/composer ซ่อน)", sb.roomEls.log.classList.contains("hidden") && sb.roomEls.composer.classList.contains("hidden") && sb.roomEls.head.classList.contains("hidden"));
  // กดส่ง: pendingQuestion ติด (เหมือนใน send())
  sb.state.pendingQuestion = "ปีนี้ย้ายงานดีไหม";
  sb.state.pendingAt = Date.now();
  sb.state.busy = true;
  sb.fns.renderChatRoom();
  ok("ถาม → ห้องเปิด + ฟองคำถามชิดขวา (rb-user)", !sb.roomEls.log.classList.contains("hidden") && sb.roomEls.log.innerHTML.includes("rb-user") && sb.roomEls.log.innerHTML.includes("ปีนี้ย้ายงานดีไหม"));
  ok("หัวห้องมีชื่อดวง 🎴 + หัวเรื่อง + ปุ่มห้องใหม่", sb.roomEls.head.innerHTML.includes("เอี๊ยว") && sb.roomEls.head.innerHTML.includes("room-ico") && sb.roomEls.head.innerHTML.includes("data-room-new") && sb.roomEls.head.innerHTML.includes(sb.t("chat.newRoom")));
  ok("ฟองคำถามมีเวลาส่งใต้ฟอง (rb-time)", sb.roomEls.log.innerHTML.includes("rb-time"));
  // ตอบเสร็จ: history ได้คู่ Q/A + state.result = การ์ดสด
  sb.state.busy = false;
  sb.state.pendingQuestion = "";
  sb.state.history = [
    { role: "user", content: "ปีนี้ย้ายงานดีไหม", at: Date.now() - 60000 },
    { role: "assistant", content: "คำฟันธง: ย้ายได้ครึ่งปีหลัง", at: Date.now() },
  ];
  sb.state.result = { reply: "คำฟันธง: ย้ายได้ครึ่งปีหลัง" };
  sb.fns.renderChatRoom();
  ok("ตอบเสร็จ → ฟองคำถามอยู่ · คำตอบล่าสุด = การ์ดสด (ไม่ทำฟอง rb-sifu ซ้ำ)", sb.roomEls.log.innerHTML.includes("rb-user") && !sb.roomEls.log.innerHTML.includes("rb-sifu"));
  // ถามต่อรอบสอง → ฟองตอบรอบแรกกลายเป็นฟองซ้าย
  sb.state.history.push({ role: "user", content: "แล้วเรื่องเงินล่ะ", at: Date.now() }, { role: "assistant", content: "เงินไหลเข้าเดือน 11", at: Date.now() });
  sb.state.result = { reply: "เงินไหลเข้าเดือน 11" };
  sb.fns.renderChatRoom();
  ok("หลายรอบ → ฟองเก่าเรียงลงมา (ฟองซ้าย mdSafe + ฟองขวา) · รอบล่าสุดเป็นการ์ดสด", sb.roomEls.log.innerHTML.includes("rb-sifu") && sb.roomEls.log.innerHTML.includes("<md>คำฟันธง: ย้ายได้ครึ่งปีหลัง</md>") && sb.roomEls.log.innerHTML.includes("แล้วเรื่องเงินล่ะ") && !sb.roomEls.log.innerHTML.includes("เงินไหลเข้าเดือน 11"));
  ok("composer โผล่พร้อมราคายามบนปุ่ม 'ส่ง · 25 時'", !sb.roomEls.composer.classList.contains("hidden") && sb.roomEls.composerSend.textContent === sb.t("chat.send") + " · 25 時", sb.roomEls.composerSend.textContent);
}

// ===== 2) ฟองยาว >12 บรรทัด → clamp + อ่านเต็ม · ฟอง user escape · ฟอง sifu ผ่าน mdSafe =====
{
  const sb = makeRoomSandbox();
  const long = Array.from({ length: 20 }, (_, i) => "บรรทัดที่ " + i).join("\n");
  const h = sb.fns.bubbleHtml({ role: "assistant", content: long, at: Date.now() });
  ok("ฟองตอบยาว → rb-clamp + ปุ่มอ่านเต็ม ▾", h.includes("rb-clamp") && h.includes("data-rb-more") && h.includes(sb.t("chat.more")));
  const shortB = sb.fns.bubbleHtml({ role: "assistant", content: "สั้น" });
  ok("ฟองสั้น → ไม่ clamp", !shortB.includes("rb-clamp") && !shortB.includes("data-rb-more"));
  const xss = sb.fns.bubbleHtml({ role: "user", content: "<img onerror=x>" });
  ok("ฟอง user escape กัน XSS", xss.includes("&lt;img") && !xss.includes("<img"));
  ok("ฟอง sifu ผ่าน mdSafe + ปุ่มหลักฐานเมื่อมี fusion meta", sb.fns.bubbleHtml({ role: "assistant", content: "x", fusion: { answers: [] } }).includes("answer-tools"));
}

// ===== 3) เวลาใต้ฟอง 3 ภาษา (ข้ามวัน = มีวันที่) =====
{
  const past = new Date(); past.setDate(past.getDate() - 40);
  const th = makeRoomSandbox({ locale: "th" }).fns.fmtBubbleTime(past.getTime());
  const en = makeRoomSandbox({ locale: "en" }).fns.fmtBubbleTime(past.getTime());
  const zh = makeRoomSandbox({ locale: "zh" }).fns.fmtBubbleTime(past.getTime());
  ok("เวลาใต้ฟอง 3 ภาษา (th มีเดือนไทย · zh มี 月 · en มีเดือนอังกฤษ)", /[ก-๙]/.test(th) && zh.includes("月") && /[A-Z][a-z][a-z]/.test(en), [th, en, zh].join(" | "));
  ok("ไม่มีเวลา (ฟองเก่าไม่มี at) → ไม่โชว์บรรทัดเวลา", makeRoomSandbox().fns.fmtBubbleTime(undefined) === "" && !makeRoomSandbox().fns.bubbleHtml({ role: "user", content: "x" }).includes("rb-time"));
}

// ===== 4) เปิดประวัติ → ห้องเดิม: ฟองรอบก่อนของ thread เดียวกันขึ้นเหนือการ์ด =====
const THREAD_ROWS = [
  { id: "h1", question: "ถามรอบแรก", answer: "ตอบรอบแรก", profile_id: "p1", created_at: "2026-07-01T10:00:00Z", request_payload: { thread_id: "th-1" }, response_meta: {} },
  { id: "h2", question: "ถามรอบสอง", answer: "ตอบรอบสอง", profile_id: "p1", created_at: "2026-07-02T10:00:00Z", request_payload: { thread_id: "th-1" }, response_meta: {} },
  { id: "h9", question: "คนละห้อง", answer: "คนละเรื่อง", profile_id: "p1", created_at: "2026-07-01T12:00:00Z", request_payload: { thread_id: "th-9" }, response_meta: {} },
];
{
  const sb = makeRoomSandbox();
  sb.state.fusionHistory = THREAD_ROWS;
  sb.state.historyView = { id: "h2", question: "ถามรอบสอง", names: "เอี๊ยว" };
  sb.fns.renderChatRoom();
  ok("เปิดประวัติแถวล่าสุดของ thread → ฟองรอบแรกขึ้น (Q+A) · แถวที่เปิด = การ์ดใหญ่ ไม่ทำฟองซ้ำ", sb.roomEls.log.innerHTML.includes("ถามรอบแรก") && sb.roomEls.log.innerHTML.includes("<md>ตอบรอบแรก</md>") && !sb.roomEls.log.innerHTML.includes("ถามรอบสอง"));
  ok("thread อื่นไม่ปน", !sb.roomEls.log.innerHTML.includes("คนละห้อง"));
  ok("composer เปิดให้พิมพ์ต่อจากประวัติได้เลย", !sb.roomEls.composer.classList.contains("hidden"));
  ok("historyThreadRows เรียงเก่า→ใหม่ + จับเฉพาะ thread เดียวกัน", JSON.stringify(sb.fns.historyThreadRows(THREAD_ROWS[1]).map((r) => r.id)) === '["h1","h2"]');
  ok("แถวเก่าไม่มี thread_id → key = id ตัวเอง (ห้องเดี่ยว)", sb.fns.historyThreadKey({ id: "solo" }) === "solo");
  // พิมพ์ต่อจากประวัติ → seed บริบทห้องเดิมก่อนส่ง
  sb.fns.seedThreadFromHistoryView();
  ok("seed จากประวัติ: threadId = thread เดิม + history ครบทุกฟองของ thread", sb.state.threadId === "th-1" && sb.state.history.length === 4 && sb.state.history[0].content === "ถามรอบแรก" && sb.state.history[3].content === "ตอบรอบสอง");
  ok("seed แล้วออกจากโหมดดูประวัติ (historyView = null)", sb.state.historyView === null);
}

// ===== 5) 🆕 ห้องใหม่ → ล้างสะอาดกลับหน้าฟอร์ม =====
{
  const t = T("th");
  const state = { busy: false, resuming: false, historyView: { id: "x" }, preHistoryView: {}, activeHistoryId: "x", result: { reply: "r" }, answers: { a: 1 }, answerSeq: 3, history: [{ role: "user", content: "q" }] };
  const roomEls = { composerInput: { value: "ค้าง", style: { height: "80px" } } };
  const els = { meta: mkEl(), question: { value: "q" }, chat: mkEl(), result: mkEl() };
  const calls = { resonance: [], progress: [], runState: [], answerMode: [], histList: 0, chatRoom: 0, gate: 0, status: [], newConv: 0 };
  const stubs = {
    t, state, roomEls, els,
    esc: (s) => String(s),
    setStatus: (m, k) => calls.status.push([m, k]),
    startNewConversation: () => { calls.newConv++; state.history = []; state.threadId = "fresh"; },
    renderResonance: (r) => calls.resonance.push(r),
    renderProgress: (p) => calls.progress.push(p),
    setRunState: (s) => calls.runState.push(s),
    setAnswerMode: (on) => calls.answerMode.push(on),
    renderHistoryList: () => calls.histList++,
    renderChatRoom: () => calls.chatRoom++,
    applyFusionGate: () => calls.gate++,
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, extract("startNewRoom") + "\nreturn startNewRoom;")(...names.map((n) => stubs[n]));
  fn();
  ok("ห้องใหม่: ล้าง thread + result + answers + historyView + การ์ด 🔗🎯", calls.newConv === 1 && state.result === null && state.historyView === null && Object.keys(state.answers).length === 0 && calls.resonance[0] === null && state.threadId === "fresh");
  ok("ห้องใหม่: กลับหน้าฟอร์ม (answer-mode off + resultEmpty + composer ว่าง)", calls.answerMode[0] === false && els.result.innerHTML.includes("result-empty") && roomEls.composerInput.value === "" && calls.chatRoom === 1 && calls.gate === 1);
  state.busy = true;
  fn();
  const lastStatus = calls.status[calls.status.length - 1];
  ok("job วิ่งอยู่ → ห้องใหม่ถูกบล็อกสุภาพ (hist.busy)", lastStatus && lastStatus[0] === t("hist.busy") && lastStatus[1] === "err" && calls.newConv === 1);
}

// ===== 6) ถามต่อ → POST มี context จริง (mock fetch ตรวจ payload) =====
{
  const t = T("th");
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const state = {
    busy: false, resuming: false, ready: true, locale: "th", mode: "single",
    threadId: "th-1", pendingQuestion: "", history: [
      { role: "user", content: "ถามรอบแรก", at: 1 }, { role: "assistant", content: "ตอบรอบแรก", at: 2 },
    ],
    historyView: null, preHistoryView: null, activeTab: "", answers: {}, answerSeq: 0, resumePaintedDone: false,
  };
  const els = { question: { value: "ถามต่อรอบสอง" }, send: { disabled: false }, result: mkEl() };
  const captured = { posts: [] };
  const fetchStub = async (url, opts) => {
    captured.posts.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ jobId: "job-9", threadId: "th-1" }) };
  };
  const calls = { polling: [], saveJob: [], answerMode: [] };
  const stubs = {
    t, state, els, localStorage, fetch: fetchStub,
    stopRecoveryRetry: () => {},
    selectedProfileIds: () => ["p1"],
    selectedGuests: () => [],
    activeSciences: () => ["bazi", "western"],
    setStatus: () => {},
    canUseFusion: () => true,
    applyFusionGate: () => {},
    fusionGateMessage: () => "",
    newRunId: () => "run-x",
    setAnswerMode: (on) => calls.answerMode.push(on),
    setRunState: () => {},
    startSyntheticProgress: () => {},
    runWaitPlaceholderHtml: (x) => "<wait>" + x + "</wait>",
    renderResonance: () => {},
    guestPayload: (g) => g,
    saveDraft: () => {},
    saveJob: (m) => calls.saveJob.push(m),
    clearSnap: () => {},
    resetFoldPref: () => {},
    saveSnap: () => {},
    snapNames: () => "เอี๊ยว",
    bindFoldJob: () => {},
    startJobPolling: (m) => calls.polling.push(m),
    recoverJobFromServer: async () => ({ job: null, reason: "" }),
    resumeKnownJob: () => {},
    serverJobToMeta: (j) => j,
    endRun: () => {},
    clearJob: () => {},
    showRunError: () => {},
    fusionErrorText: (e) => String(e),
    renderJobDone: () => {},
  };
  const code = [extract("cleanLocalHistory"), extract("payloadHistory"), extract("send")].join("\n");
  const names = Object.keys(stubs);
  const sendFn = new Function(...names, code + "\nreturn send;")(...names.map((n) => stubs[n]));
  await sendFn();
  const body = captured.posts[0] && captured.posts[0].body;
  ok("ถามต่อ → POST /api/sifu/fusion5 จริง 1 ครั้ง", captured.posts.length === 1 && captured.posts[0].url === "/api/sifu/fusion5");
  ok("payload มี context ห้องเดิม: history 2 ฟองรอบแรก (role+content)", body && Array.isArray(body.history) && body.history.length === 2 && body.history[0].content === "ถามรอบแรก" && body.history[1].role === "assistant");
  ok("payload ผูกห้อง: threadId เดิม + threadProfileId + คำถามใหม่", body && body.threadId === "th-1" && body.threadProfileId === "p1" && body.question === "ถามต่อรอบสอง");
  ok("ยิงแล้วเข้าโหมดรอ: pendingQuestion + pendingAt + polling เริ่ม", state.pendingQuestion === "ถามต่อรอบสอง" && state.pendingAt > 0 && calls.polling.length === 1 && calls.polling[0].jobId === "job-9");
}

// ===== 7) composer: ส่ง = ย้ายข้อความเข้ากล่องถามเดิมแล้วเรียก send · ยามไม่พอ = พาไป /account =====
{
  const t = T("th");
  const state = { busy: false, resuming: false, historyView: null, composerTopup: false };
  const roomEls = { composerInput: { value: "  ถามต่อ  ", style: {} }, composerSend: {} };
  const els = { question: { value: "" } };
  const calls = { send: 0, seed: 0, href: [] };
  const stubs = {
    t, state, roomEls, els,
    window: { location: { set href(v) { calls.href.push(v); } } },
    send: () => calls.send++,
    seedThreadFromHistoryView: () => calls.seed++,
  };
  const names = Object.keys(stubs);
  const fn = new Function(...names, extract("composerSend") + "\nreturn composerSend;")(...names.map((n) => stubs[n]));
  fn();
  ok("composer ส่ง → trim ข้อความเข้า els.question + เรียก send + ล้างช่องพิมพ์", calls.send === 1 && els.question.value === "ถามต่อ" && roomEls.composerInput.value === "");
  ok("ไม่ได้ดูประวัติอยู่ → ไม่ seed ซ้ำ", calls.seed === 0);
  state.historyView = { id: "h2" };
  roomEls.composerInput.value = "พิมพ์ต่อจากประวัติ";
  fn();
  ok("พิมพ์ต่อจากหน้าประวัติ → seed thread เดิมก่อนแล้วค่อย send", calls.seed === 1 && calls.send === 2);
  state.composerTopup = true;
  fn();
  ok("ยามไม่พอ (composerTopup) → ปุ่มพาไป /account ไม่ยิงงาน", calls.href.length === 1 && calls.href[0] === "/account" && calls.send === 2);
  state.composerTopup = false;
  state.busy = true;
  roomEls.composerInput.value = "x";
  fn();
  ok("job วิ่งอยู่ → composer ไม่ส่งซ้อน", calls.send === 2);
}

// ===== 8) ปุ่มส่ง: ราคายามจริง + ยามไม่พอ = ป้ายเติมยาม =====
{
  const sb = makeRoomSandbox();
  sb.state.history = [{ role: "user", content: "q", at: 1 }, { role: "assistant", content: "a", at: 2 }];
  sb.fns.renderChatRoom();
  ok("ยามพอ → ปุ่ม 'ส่ง · 25 時' กดได้", sb.roomEls.composerSend.textContent.includes("25 時") && sb.roomEls.composerSend.disabled === false);
  sb.gate.balance = 5;
  sb.fns.updateComposer();
  ok("ยามไม่พอ → ปุ่มกลายเป็น 'ยามไม่พอ · ไปเติมยาม' + ยังกดได้ (พาไปเติม)", sb.roomEls.composerSend.textContent === sb.t("chat.topup") && sb.roomEls.composerSend.disabled === false && sb.state.composerTopup === true);
  sb.gate.balance = 100;
  sb.state.busy = true;
  sb.fns.updateComposer();
  ok("งานวิ่งอยู่ → ปุ่มส่ง disabled", sb.roomEls.composerSend.disabled === true && sb.state.composerTopup === false);
}

// ===== 9) reload กลางทาง → paintResumeFromLocal คืน ฟองเดิม + ฟองรอ (สาย r381 เดิมไม่แตะ) =====
{
  const pr = extract("paintResumeFromLocal");
  ok("paint จาก local คืน history ฟองเดิม (typeof-guard สำหรับเทส sandbox เดิม)", /typeof cleanLocalHistory === 'function'/.test(pr) && /state\.history = cleanLocalHistory\(meta\.history\)/.test(pr));
  ok("paint จาก local วาดห้องทันที (renderChatRoom guard)", /typeof renderChatRoom === 'function'/.test(pr) && /state\.pendingAt = jobStartedAt\(meta\)/.test(pr));
  ok("resumeKnownJob วาดห้องตอนกู้งาน", /typeof renderChatRoom === 'function'/.test(extract("resumeKnownJob")));
  ok("จบงาน → renderJobDone วาดห้อง (การ์ดสด = ฟองล่าสุด)", /typeof renderChatRoom === 'function'/.test(extract("renderJobDone")));
  ok("งานพลาด → ฟองรอถูกเก็บ (pendingQuestion ล้าง + วาดห้องใหม่)", /state\.pendingQuestion = ''/.test(extract("showRunError")) && /typeof renderChatRoom === 'function'/.test(extract("showRunError")));
  // functional: paint แล้วฟองเดิมกลับมา + ฟองรอ (ผ่าน sandbox ห้อง — จำลองสิ่งที่ paintResumeFromLocal ตั้งให้)
  const sb = makeRoomSandbox();
  sb.state.history = [{ role: "user", content: "ถามค้างไว้ก่อน reload", at: 1 }, { role: "assistant", content: "ตอบรอบแรก", at: 2 }];
  sb.state.pendingQuestion = "คำถามที่งานกำลังวิ่ง";
  sb.state.pendingAt = Date.now();
  sb.fns.renderChatRoom();
  ok("reload กลางทาง: ฟองเดิมครบ + ฟองคำถามที่วิ่งอยู่ต่อท้าย", sb.roomEls.log.innerHTML.includes("ถามค้างไว้ก่อน reload") && sb.roomEls.log.innerHTML.includes("<md>ตอบรอบแรก</md>") && sb.roomEls.log.innerHTML.includes("คำถามที่งานกำลังวิ่ง"));
}

// ===== 10) ฟองรอโชว์ % จริง (r379a/r376 tick เดิม) =====
{
  ok("placeholder ฟองรอมีช่อง % (run-wait-pct)", extract("runWaitPlaceholderHtml").includes("run-wait-pct"));
  ok("tick รายวินาทีเติม % ลงฟองรอ (chat.wait + pct)", /run-wait-pct/.test(extract("updateProgressDom")) && /t\('chat\.wait'\) \+ ' ' \+ pct \+ '%'/.test(extract("updateProgressDom")));
  ok("render แรกก็เติม % ทันที ไม่รอ tick", /run-wait-pct/.test(extract("renderProgress")));
}

// ===== 11) สายไฟ: ทุกทางเดินบริบทวาดห้อง + ห้องผูกกับชุดดวง =====
{
  ok("renderThreadNote (ทุกจุดที่บริบทเปลี่ยน) → วาดห้อง", /typeof renderChatRoom === 'function'/.test(extract("renderThreadNote")));
  ok("เปิดประวัติ → วาดห้อง (ฟองรอบก่อน + composer)", /typeof renderChatRoom === 'function'/.test(extract("openHistoryInMain")));
  ok("ปิดหน้าประวัติ → วาดห้องกลับ", /typeof renderChatRoom === 'function'/.test(extract("closeHistoryView")));
  ok("send → วาดห้อง (ฟองขวา+ฟองรอ)", /typeof renderChatRoom === 'function'/.test(extract("send")));
  ok("ถามต่อจากประวัติ (ปุ่มเดิม) seed ทุกฟองของ thread ไม่ใช่แค่รอบเดียว", /historyThreadRows\(row\)/.test(extract("continueFromHistory")));
  ok("เวลาส่งเก็บใน history (at) และรอดข้าม reload (cleanLocalHistory เก็บ at)", /out\.at = at/.test(extract("cleanLocalHistory")) && /at:askedAt/.test(extract("rememberCompletedTurn")));
  ok("เปลี่ยนดวง/โหมด = คนละห้อง (scope เดิม r383 ครอบ mode+ids+guest)", /'fusion5:' \+ state\.mode \+ ':' \+ ids\.join\(':'\)/.test(extract("conversationScope")));
  ok("ปุ่มล้าง → ล้าง composer + วาดห้อง", /roomEls\.composerInput\.value = ''/.test(src) && /renderChatRoom\(\); \/\/ r385: ล้าง/.test(src));
  ok("เปลี่ยนภาษา → วาดห้องตามภาษาใหม่", /renderChatRoom\(\); \/\/ r385: ฟอง\/หัวห้อง/.test(src));
  ok("desktop: Enter ส่ง · Shift+Enter ขึ้นบรรทัด · มือถือ Enter = ขึ้นบรรทัด", /e\.key === 'Enter' && !e\.shiftKey && !isMobileFold\(\)/.test(src));
  ok("ปุ่มอ่านเต็ม ▾ toggle rb-clamp (delegate บน room-log)", /data-rb-more/.test(src) && /rb-clamp/.test(src) && src.includes("btn.textContent = clamped ? t('chat.more') : t('chat.less')"));
  ok("ปุ่มห้องใหม่ delegate บน room-head", src.includes("closest('[data-room-new]')") && src.includes("startNewRoom()"));
}

// ===== 12) DOM + CSS + 2 ธีม + มือถือ =====
{
  ok("DOM ห้องแชทครบ: room-head / room-log / composer / composer-input / composer-send", ["room-head", "room-log", 'id="composer"', "composer-input", "composer-send"].every((x) => src.includes(x)));
  ok("การ์ดคำตอบสด (fusion5-result) อยู่ก่อน 🔗🎯 (การ์ดพับใต้ฟองตอบ)", src.indexOf('<div id="fusion5-result"></div>') < src.indexOf('<div id="resonance-card" class="hidden"></div>'));
  ok("CSS ฟอง: rb-user ชิดขวา (justify-self:end) · rb-sifu ชิดซ้าย", src.includes(".rb-user{justify-self:end") && src.includes(".rb-sifu{justify-self:start"));
  ok("CSS clamp 12 บรรทัด + composer sticky ล่าง", src.includes("-webkit-line-clamp:12") && src.includes(".composer{position:sticky;bottom:0"));
  ok("ธีมสว่างครบ: room-head / rb-user / rb-sifu / composer", ['[data-theme="light"] .room-head', '[data-theme="light"] .rb-user', '[data-theme="light"] .rb-sifu', '[data-theme="light"] .composer'].every((x) => src.includes(x)));
  // กฎ hk-answer-mode ใหม่ต้องอยู่ในบล็อก @media 768 เดิมเท่านั้น (สัญญาเดิม r374/r381)
  const mOpen = src.indexOf("@media (max-width:768px)");
  let depth = 0, mClose = -1;
  for (let j = src.indexOf("{", mOpen); j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) { mClose = j; break; } }
  }
  const mobileComposer = src.indexOf("body.hk-answer-mode:not(.hk-ask-open) .composer");
  const mobileOverflow = src.indexOf("body.hk-answer-mode:not(.hk-ask-open) .result-panel{overflow:visible}");
  ok("มือถือ: composer ติดล่าง (แก้ sticky ใต้ overflow:hidden) — กฎอยู่ใน @media 768 เท่านั้น", mobileComposer > mOpen && mobileComposer < mClose && mobileOverflow > mOpen && mobileOverflow < mClose);
}

// ===== 13) i18n คีย์ใหม่ครบ 3 ภาษา =====
{
  const KEYS = ["chat.send", "chat.newRoom", "chat.more", "chat.less", "chat.ph", "chat.wait", "chat.topup", "chat.newRoomHint"];
  ok("i18n chat.* ครบ 3 ภาษา (" + KEYS.length + " คีย์)", KEYS.every((k) => I18N.th[k] && I18N.en[k] && I18N.zh[k]), KEYS.filter((k) => !(I18N.th[k] && I18N.en[k] && I18N.zh[k])).join(","));
  ok("EN/ZH ไม่หลุดไทย (ปุ่มส่ง/ห้องใหม่)", !/[ก-๙]/.test(I18N.en["chat.send"] + I18N.en["chat.newRoom"] + I18N.zh["chat.send"] + I18N.zh["chat.newRoom"]));
}

// ===== 14) script ทุกก้อน parse ผ่าน (node --check) =====
{
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let allOk = blocks.length > 0;
  blocks.forEach((b, i) => {
    const f = path.join(os.tmpdir(), `fusion-chat-blk-${i}.js`);
    fs.writeFileSync(f, b[1]);
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch { allOk = false; }
    fs.unlinkSync(f);
  });
  ok(`script block ทุกก้อน parse ผ่าน (${blocks.length} ก้อน)`, allOk);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
