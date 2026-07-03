// r383 · ทดสอบ master-fusion.html:
//   (1) ดวงชั่วคราว (guest birth): ฟอร์ม inline → chip 🎴 → payload guestBirths ถูก shape/ลำดับช่อง · ไม่ทราบเวลา→null
//       ผสม profile+guest ≤4 · ยกเลิก→dropdown กลับ · draft รวม guest + restore · error 400 ชี้ช่อง · read-bar/snapshot เห็นชื่อ
//   (2) การ์ด Search history ถูกถอดทุกอุปกรณ์ (เหลือหัว+Refresh+list) · JS filter เดิม guard ไม่ error
//   (3) มือถือ answer-mode: หน้าอ่านไม่มี history + ไม่มี orphan progress บนหน้าถาม (root cause กฎ (d) ไม่มี :not(.hk-ask-open))
//   (4) pill ลอยมุมล่าง: งานวิ่ง "⏳ x% · แตะกลับ..." · เสร็จ "✅ ...แตะดู" · แตะ = สลับหน้าอ่าน · desktop ไม่เห็น
//   (5) i18n TH/EN/ZH ครบทุก string ใหม่ + syntax ทุก script block
// หมายเหตุ: jsdom ไม่มีใน node_modules (ห้ามเพิ่ม dependency) → extract ฟังก์ชันจริงจาก HTML มารันกับ DOM stub
// run: node scripts/test-fusion-guest-ui-r383.mjs
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
const mkEl = () => ({ style: {}, classList: mkClassList(), innerHTML: "", value: "", textContent: "" });

const DICT = {
  "guest.namePh": "ดวงชั่วคราว", "guest.noTimeShort": "ไม่ทราบเวลา", "guest.chipTag": "ไม่บันทึก", "guest.edit": "แก้",
  "guest.needDate": "กรุณาเลือกวันเกิด", "guest.badDate": "วันเกิดต้องอยู่ระหว่าง ค.ศ. 1900 – วันนี้",
  "guest.needTime": 'กรอกเวลาเกิด หรือติ๊ก "ไม่ทราบเวลาเกิด"', "guest.needGender": "กรุณาเลือกเพศ",
  "guest.badLatLng": "พิกัดไม่ถูกต้อง", "guest.badData": "ข้อมูลดวงชั่วคราวไม่ถูกต้อง", "guest.tooMany": "รวมดวงได้ไม่เกิน 4",
  "guest.slotAt": "ดวงชั่วคราวช่องที่ {n}", "guest.dateHint": "ค.ศ.", "guest.noTime": "ไม่ทราบเวลาเกิด",
  "guest.noTimeHint": "จะอ่านได้ 3 เสา · จื่อเวย/ดาวจริงจีนข้าม",
  "pill.back": "แตะกลับไปดูคำพยากรณ์", "pill.ready": "คำพยากรณ์พร้อมแล้ว · แตะดู",
};
const t = (k) => (DICT[k] != null ? DICT[k] : k);

// ---------- sandbox guest slot (ฟอร์ม inline → chip → ลบ/ยกเลิก · รันฟังก์ชันจริงกับ DOM stub) ----------
function makeGuestSandbox() {
  const state = { mode: "pair", guests: {}, guestEdit: {} };
  const els = { profile: mkEl(), profile2: mkEl(), profile3: mkEl(), profile4: mkEl() };
  // ต่อ slot: link/chip/form · form.querySelector อ่านค่าจาก fields ที่เทสตั้ง (จำลอง user กรอก)
  const slots = {};
  [1, 2, 3, 4].forEach((n) => {
    const form = mkEl();
    form.fields = {}; // เช่น { '.gf-name': { value:'ป้าแมว' } }
    form.querySelector = (sel) => (sel in form.fields ? form.fields[sel] : null);
    slots[n] = { link: mkEl(), chip: mkEl(), form };
  });
  const documentStub = {
    querySelector: (sel) => {
      const m = sel.match(/^\[data-guest-(add|chip|form)="(\d)"\]$/);
      if (!m) return null;
      const s = slots[Number(m[2])];
      return m[1] === "add" ? s.link : m[1] === "chip" ? s.chip : s.form;
    },
    body: { classList: mkClassList() },
  };
  let selectionChanged = 0;
  const guestSelectionChanged = () => { selectionChanged++; };
  const prelude = "var GUEST_SLOTS = [1,2,3,4];\nvar GUEST_DEFAULT_LOC = { lat:13.7563, lng:100.5018 };\n";
  const code = prelude + [
    extract("esc"), extract("todayISOBkk"), extract("activeSlots"), extract("slotGuest"), extract("selectedGuests"),
    extract("guestDisplayName"), extract("guestClientError"), extract("guestPayload"), extract("normGuest"),
    extract("selectedProfileIds"), extract("profileCount"), extract("slotSelect"), extract("guestSlotEls"),
    extract("guestChipHtml"), extract("guestFormHtml"), extract("renderGuestSlot"), extract("renderGuestSlots"),
    extract("openGuestForm"), extract("closeGuestForm"), extract("readGuestFormValues"), extract("commitGuestForm"), extract("removeGuest"),
  ].join("\n");
  const factory = new Function("state", "els", "document", "t", "guestSelectionChanged",
    code + "\nreturn { todayISOBkk, activeSlots, slotGuest, selectedGuests, guestClientError, guestPayload, normGuest, selectedProfileIds, profileCount, openGuestForm, closeGuestForm, commitGuestForm, removeGuest, renderGuestSlot, renderGuestSlots };");
  const fns = factory(state, els, documentStub, t, guestSelectionChanged);
  return { state, els, slots, fns, changed: () => selectionChanged };
}

// ===== 1) ฟอร์ม guest → chip → payload ถูก shape/ลำดับช่อง =====
{
  const sb = makeGuestSandbox();
  sb.fns.openGuestForm(1);
  ok("เปิดฟอร์ม slot 1: dropdown+ลิงก์ซ่อน · ฟอร์มโชว์", sb.state.guestEdit[1] === true && sb.els.profile.style.display === "none" && sb.slots[1].link.style.display === "none" && !sb.slots[1].form.classList.contains("hidden"));
  const markup = sb.slots[1].form.innerHTML;
  ok("ฟอร์มมีครบ: ชื่อเล่น + วันเกิด(min 1900 + hint ค.ศ.) + เวลา + ไม่ทราบเวลา + เพศ M/F + สถานที่ + lat/lng + ใช้ดวงนี้/ยกเลิก",
    markup.includes("gf-name") && markup.includes('min="1900-01-01"') && markup.includes("ค.ศ.") && markup.includes("gf-time") && markup.includes("gf-notime") && markup.includes('value="M"') && markup.includes('value="F"') && markup.includes("gf-place") && markup.includes("gf-lat") && markup.includes("gf-lng") && markup.includes("gf-use") && markup.includes("gf-cancel"));
  // user กรอก: ชื่อ + วันเกิด + เวลา + เพศหญิง + เว้นพิกัด (default กรุงเทพ)
  sb.slots[1].form.fields = {
    ".gf-name": { value: " ป้าแมว  ทองดี " }, ".gf-date": { value: "1990-05-20" },
    ".gf-notime": { checked: false }, ".gf-time": { value: "08:30" },
    ".gf-gender:checked": { value: "F" }, ".gf-lat": { value: "" }, ".gf-lng": { value: "" },
    ".gf-place": { value: "เชียงใหม่" }, ".gf-err": { textContent: "" },
  };
  ok("กดใช้ดวงนี้ → commit ผ่าน", sb.fns.commitGuestForm(1) === true);
  const g1 = sb.state.guests[1];
  ok("guest shape ตรง spec r381: birthDate/birthTime/gender/lat/lng + ชื่อ trim ช่องว่างซ้ำ",
    g1 && g1.birthDate === "1990-05-20" && g1.birthTime === "08:30" && g1.gender === "F" && g1.name === "ป้าแมว ทองดี" && g1.place === "เชียงใหม่");
  ok("พิกัดเว้นว่าง = default กรุงเทพ 13.7563,100.5018", g1.lat === 13.7563 && g1.lng === 100.5018);
  ok("chip 🎴 โชว์ชื่อ+วันเวลา+เพศ + ป้ายไม่บันทึก + ปุ่มแก้/ลบ · dropdown ยังซ่อน",
    sb.slots[1].chip.innerHTML.includes("🎴") && sb.slots[1].chip.innerHTML.includes("ป้าแมว ทองดี") && sb.slots[1].chip.innerHTML.includes("1990-05-20") && sb.slots[1].chip.innerHTML.includes("ไม่บันทึก") && sb.slots[1].chip.innerHTML.includes('data-guest-act="edit"') && sb.slots[1].chip.innerHTML.includes('data-guest-act="remove"') && sb.els.profile.style.display === "none");
  ok("commit แจ้งเปลี่ยน selection (ยาม/คัมภีร์/draft เดินสายเดิม)", sb.changed() >= 1);
  // payload + ลำดับช่อง: เพิ่ม guest ช่อง 3 → guestBirths = [ช่อง1, ช่อง3]
  sb.state.guests[3] = { name: "", birthDate: "2001-01-05", birthTime: null, gender: "M", lat: 18.79, lng: 98.98, place: "" };
  const payload = sb.fns.selectedGuests().map(sb.fns.guestPayload);
  ok("guestBirths เรียงตามลำดับช่อง (1 → 3)", payload.length === 2 && payload[0].birthDate === "1990-05-20" && payload[1].birthDate === "2001-01-05");
  ok("payload ตัด field ว่าง (ไม่มี name/place = ไม่ส่ง) + เก็บชื่อเมื่อมี", payload[0].name === "ป้าแมว ทองดี" && !("name" in payload[1]) && !("place" in payload[1]));
  ok("payload คีย์ตรง spec: birthDate,birthTime,gender,lat,lng", ["birthDate", "birthTime", "gender", "lat", "lng"].every((k) => k in payload[1]));
}

// ===== 2) ไม่ทราบเวลาเกิด → birthTime null · validate ฝั่ง client =====
{
  const sb = makeGuestSandbox();
  sb.fns.openGuestForm(2);
  sb.slots[2].form.fields = {
    ".gf-name": { value: "" }, ".gf-date": { value: "1975-11-02" },
    ".gf-notime": { checked: true }, ".gf-time": { value: "" },
    ".gf-gender:checked": { value: "M" }, ".gf-lat": { value: "" }, ".gf-lng": { value: "" },
    ".gf-place": { value: "" }, ".gf-err": { textContent: "" },
  };
  ok("ติ๊กไม่ทราบเวลา → commit ผ่าน + birthTime = null", sb.fns.commitGuestForm(2) === true && sb.state.guests[2].birthTime === null);
  ok("ฟอร์มมี hint 3 เสา (จื่อเวย/ดาวจริงจีนข้าม)", src.includes("guest.noTimeHint") && src.includes("จะอ่านได้ 3 เสา"));
  ok("chip โชว์ 'ไม่ทราบเวลา' แทนเวลา", sb.slots[2].chip.innerHTML.includes("ไม่ทราบเวลา"));
  // validate: ไม่เลือกเพศ / วันเกิดอนาคต / เวลาว่างแต่ไม่ติ๊ก / พิกัดเพี้ยน
  const bad = (fields) => { sb.fns.openGuestForm(4); sb.slots[4].form.fields = Object.assign({ ".gf-err": { textContent: "" } }, fields); const r = sb.fns.commitGuestForm(4); return { r, err: sb.slots[4].form.fields[".gf-err"].textContent }; };
  let x = bad({ ".gf-date": { value: "1988-01-01" }, ".gf-notime": { checked: true }, ".gf-time": { value: "" }, ".gf-lat": { value: "" }, ".gf-lng": { value: "" }, ".gf-place": { value: "" }, ".gf-name": { value: "" } });
  ok("ไม่เลือกเพศ → commit ไม่ผ่าน + ข้อความชี้เพศ", x.r === false && x.err === DICT["guest.needGender"]);
  x = bad({ ".gf-date": { value: "2099-01-01" }, ".gf-notime": { checked: true }, ".gf-time": { value: "" }, ".gf-gender:checked": { value: "M" }, ".gf-lat": { value: "" }, ".gf-lng": { value: "" }, ".gf-place": { value: "" }, ".gf-name": { value: "" } });
  ok("วันเกิดอนาคต → badDate", x.r === false && x.err === DICT["guest.badDate"]);
  x = bad({ ".gf-date": { value: "1988-01-01" }, ".gf-notime": { checked: false }, ".gf-time": { value: "" }, ".gf-gender:checked": { value: "M" }, ".gf-lat": { value: "" }, ".gf-lng": { value: "" }, ".gf-place": { value: "" }, ".gf-name": { value: "" } });
  ok("เวลาว่าง + ไม่ติ๊กไม่ทราบเวลา → needTime", x.r === false && x.err === DICT["guest.needTime"]);
  x = bad({ ".gf-date": { value: "1988-01-01" }, ".gf-notime": { checked: true }, ".gf-time": { value: "" }, ".gf-gender:checked": { value: "M" }, ".gf-lat": { value: "999" }, ".gf-lng": { value: "0" }, ".gf-place": { value: "" }, ".gf-name": { value: "" } });
  ok("lat 999 → badLatLng", x.r === false && x.err === DICT["guest.badLatLng"]);
}

// ===== 3) ผสม profile+guest ≤4 + ยาม/เวลาเกิดนับ guest + ยกเลิก→dropdown =====
{
  const sb = makeGuestSandbox();
  sb.els.profile.value = "p1";
  sb.els.profile3.value = "p2";
  sb.state.guests[2] = { name: "กิ๊ก", birthDate: "1992-02-02", birthTime: "12:00", gender: "F", lat: 13.75, lng: 100.5, place: "" };
  sb.state.guests[4] = { name: "", birthDate: "1993-03-03", birthTime: null, gender: "M", lat: 13.75, lng: 100.5, place: "" };
  ok("ช่อง guest ข้าม dropdown ช่องนั้น: profiles = [p1,p2]", JSON.stringify(sb.fns.selectedProfileIds()) === '["p1","p2"]');
  ok("profileCount นับ guest ด้วย (yam preview): 2 profile + 2 guest = 4", sb.fns.profileCount() === 4);
  ok("send block เกิน 4 รวม guest (client)", /totalCharts > 4/.test(extract("send")) && /guest\.tooMany/.test(extract("send")));
  ok("send แนบ guestBirths ตามลำดับช่อง + ไม่ส่ง field ว่าง", /guestBirths:guests\.length \? guests\.map\(guestPayload\) : undefined/.test(extract("send")));
  ok("guest ไม่มีเวลาเกิด → allSelectedHaveTime เท็จ (จื่อเวย/ดาวจริงจีนโดนปิด)", /selectedGuests\(\)\.every\(function\(g\)\{ return g\.birthTime !== null; \}\)/.test(extract("allSelectedHaveTime")));
  // ยกเลิก → dropdown กลับ
  sb.fns.openGuestForm(3);
  ok("เปิดฟอร์มช่องที่มี profile เลือกอยู่ → dropdown ซ่อนชั่วคราว", sb.els.profile3.style.display === "none");
  sb.fns.closeGuestForm(3);
  ok("ยกเลิก → dropdown ช่อง 3 กลับมา + ฟอร์มปิด + ไม่มี guest ค้าง", sb.els.profile3.style.display === "" && sb.slots[3].form.classList.contains("hidden") && !sb.state.guests[3]);
  sb.fns.removeGuest(2);
  ok("ลบ chip → dropdown ช่อง 2 กลับมา + guest หาย", sb.els.profile2.style.display === "" && !sb.state.guests[2]);
}

// ===== 4) error 400 จาก server ชี้ช่อง (invalid_guest_birth* + guestIndex) =====
{
  const state = { mode: "pair", guests: { 2: { birthDate: "x" }, 4: { birthDate: "y" } }, locale: "th" };
  const code = "var GUEST_SLOTS=[1,2,3,4];\n" + [extract("activeSlots"), extract("slotGuest"), extract("fusionErrorText")].join("\n");
  const factory = new Function("state", "t", "currentYam", "yamShortMsg", code + "\nreturn fusionErrorText;");
  const fusionErrorText = factory(state, t, () => 10, (n) => "ยามไม่พอ " + n);
  ok("invalid_guest_birth_date + guestIndex 1 → ข้อความไทย + ชี้ช่องที่ 4 (guest ตัวที่ 2 อยู่ช่อง 4)",
    fusionErrorText("invalid_guest_birth_date", 400, { guestIndex: 1 }) === DICT["guest.badDate"] + " · ดวงชั่วคราวช่องที่ 4");
  ok("invalid_guest_gender + guestIndex 0 → ชี้ช่องที่ 2", fusionErrorText("invalid_guest_gender", 400, { guestIndex: 0 }).includes("ช่องที่ 2"));
  ok("too_many_births → ข้อความรวมดวงเกิน", fusionErrorText("too_many_births", 400, {}).includes(DICT["guest.tooMany"]));
  ok("error เดิม (insufficient_hours) ไม่เพี้ยน", fusionErrorText("insufficient_hours", 402, { required: 30 }) === "ยามไม่พอ 30");
}

// ===== 5) draft รวม guest + restore กลับเป็น chip =====
{
  ok("saveDraft เก็บ guests รายช่อง", /guests: state\.guests/.test(extract("saveDraft")));
  const rd = extract("restoreDraft");
  ok("restoreDraft กู้ guest ผ่าน normGuest + validate ก่อน (เพี้ยน = ข้าม)", /normGuest\(j\.guests\[n\]\)/.test(rd) && /guestClientError\(g\)/.test(rd));
  ok("restoreDraft: guest ช่อง 2-4 + draft โหมดคู่ → setMode('pair') ให้ chip โผล่", /setMode\('pair'\)/.test(rd) && /renderGuestSlots\(\)/.test(rd));
  // รันจริง: draft → state ใหม่
  const state = { mode: "single", guests: {}, guestEdit: {}, sci: {} };
  const storage = mkStorage();
  storage.setItem("hk_fusion5_draft", JSON.stringify({ updatedAt: Date.now(), question: "การงานปีนี้", mode: "pair", profileIds: [], guests: { 2: { name: "กิ๊ก", birthDate: "1992-02-02", birthTime: null, gender: "F", lat: 13.75, lng: 100.5, place: "" } } }));
  const calls = { renderGuestSlots: 0, setMode: [] };
  const code = "var GUEST_SLOTS=[1,2,3,4];\nvar GUEST_DEFAULT_LOC={lat:13.7563,lng:100.5018};\nvar FUSION_DRAFT_KEY='hk_fusion5_draft';\n" +
    [extract("todayISOBkk"), extract("normGuest"), extract("guestClientError"), extract("slotGuest"), extract("restoreDraft")].join("\n");
  const factory = new Function("state", "localStorage", "t", "applyProfileSelection", "renderGuestSlots", "renderSciList", "updateYam", "setMode", "els", "SCI_ORDER", "loadConversationForSelection", "renderThreadNote",
    code + "\nreturn restoreDraft;");
  const restoreDraft = factory(state, storage, t, () => {}, () => { calls.renderGuestSlots++; }, () => {}, () => {}, (m) => { calls.setMode.push(m); state.mode = m; }, { question: { value: "" } }, [], () => {}, () => {});
  restoreDraft();
  ok("restore แล้ว guest ช่อง 2 กลับมา (birthTime null คงเดิม)", state.guests[2] && state.guests[2].name === "กิ๊ก" && state.guests[2].birthTime === null && state.guests[2].gender === "F");
  ok("restore สลับโหมดคู่ + วาด chip", calls.setMode.includes("pair") && calls.renderGuestSlots >= 1);
}

// ===== 6) resume/read-bar/ประวัติ เห็นชื่อ guest =====
{
  ok("serverJobToMeta พก guestBirths จาก GET → meta.guests", /guests: \(job && Array\.isArray\(job\.guestBirths\)/.test(extract("serverJobToMeta")));
  ok("applyJobSelection คืน chip guest (applyGuestSelection)", /applyGuestSelection\(meta\)/.test(extract("applyJobSelection")));
  const ags = extract("applyGuestSelection");
  ok("applyGuestSelection: guest ลงช่องถัดจาก profiles + >1 ดวง → โหมดคู่", /pids\.length \+ 1/.test(ags) && /setMode\('pair'\)/.test(ags));
  // snapNames รวมชื่อ guest (ฟังก์ชันจริง)
  const code = [extract("snapNames")].join("\n");
  const factory = new Function("profileById", "t", code + "\nreturn snapNames;");
  const snapNames = factory((id) => ({ 1: { nickname: "เอี๊ยว" } })[id] || null, t);
  ok("snapNames: profile + guest = 'เอี๊ยว + 🎴ป้าแมว'", snapNames({ profileIds: ["1"], guests: [{ name: "ป้าแมว" }] }) === "เอี๊ยว + 🎴ป้าแมว");
  ok("guest ไม่ตั้งชื่อ → ใช้ป้าย 'ดวงชั่วคราว'", snapNames({ profileIds: [], guests: [{ name: "" }] }) === "🎴ดวงชั่วคราว");
  ok("updateReadBar ต่อชื่อ guest ท้ายรายชื่อ (guard typeof สำหรับ sandbox เทสเดิม)", /typeof selectedGuests === 'function'/.test(extract("updateReadBar")));
  ok("ประวัติ: list+detail มีป้าย guest จาก response_meta.guest_births", /historyGuestLabel/.test(extract("renderHistoryList")) && /historyGuestLabel/.test(extract("renderHistoryDetail")) && /guest_births/.test(extract("historyGuestLabel")));
  ok("conversationScope แยก thread ตาม guest (ถามต่อไม่ปนดวง)", /gsig/.test(extract("conversationScope")));
}

// ===== 7) การ์ด Search history ถูกถอด DOM ทุกอุปกรณ์ · Refresh อยู่ · JS guard =====
{
  const bodyHtml = src.slice(src.indexOf("<body>"), src.indexOf("</body>"));
  ok("ไม่มี input/select filter ใน DOM (Search/Topic/Mode/Status/From/To)",
    !bodyHtml.includes('id="history-q"') && !bodyHtml.includes('id="history-topic"') && !bodyHtml.includes('id="history-mode"') && !bodyHtml.includes('id="history-status"') && !bodyHtml.includes('id="history-from"') && !bodyHtml.includes('id="history-to"') && !bodyHtml.includes('id="history-search"') && !bodyHtml.includes('class="history-filters"'));
  ok("หัว Premium Fusion History + ปุ่ม Refresh + list ยังอยู่", bodyHtml.includes("Premium Fusion History") && bodyHtml.includes('id="history-refresh"') && bodyHtml.includes('id="history-list"'));
  ok("Refresh ยังทำงาน (listener ผูกตรง element ที่ยังอยู่)", /els\.historyRefresh\.addEventListener\('click'/.test(src));
  const lfh = extract("loadFusionHistory");
  ok("loadFusionHistory guard element filter ที่หายแล้ว (ไม่ throw)", /els\.historyQ && els\.historyQ\.value/.test(lfh) && /els\.historyTopic && els\.historyTopic\.value/.test(lfh) && /els\.historyTo && els\.historyTo\.value/.test(lfh));
  ok("listener filter เดิม guard null (ไม่พังตอน init)", /if \(el\) el\.addEventListener\('change'/.test(src) && /if \(els\.historyQ\) els\.historyQ\.addEventListener/.test(src));
}

// ===== 8) มือถือ answer-mode: หน้าอ่านไม่มี history · หน้าถามไม่มี orphan progress (กฎอยู่ใน media 768 เท่านั้น) =====
{
  const mediaAt = src.indexOf("r374 · Mobile answer-mode");
  ok("หน้าอ่านซ่อน history ทั้ง section", src.indexOf("body.hk-answer-mode:not(.hk-ask-open) .history-panel{display:none}") > mediaAt);
  ok("root cause orphan: กฎ (d) โชว์ prog-line ทั้ง answer-mode → หน้าถามต้องสั่งซ่อน progress-card ชัดเจน",
    src.indexOf("body.hk-answer-mode.hk-ask-open .ask-panel .panel-body > .progress-card{display:none!important}") > mediaAt);
  ok("pill โชว์เฉพาะ มือถือ+answer-mode+หน้าถาม", src.indexOf("body.hk-answer-mode.hk-ask-open .run-pill{display:inline-flex}") > mediaAt);
  ok("pill base ซ่อนตลอด (desktop ไม่เห็นแม้ติด class)", /\.run-pill\{display:none;position:fixed/.test(src) && src.indexOf(".run-pill{display:none;position:fixed") < mediaAt);
  ok("pill.hidden ชนะกฎโชว์ (!important)", src.includes(".run-pill.hidden{display:none!important}"));
  // ทุกกฎ hk-answer-mode ยังอยู่ใน media block เดียว (desktop เดิม 100%)
  const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
  const mOpen = css.indexOf("@media (max-width:768px){", css.indexOf("r374"));
  let depth = 0, mClose = -1;
  for (let j = css.indexOf("{", mOpen); j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (!depth) { mClose = j; break; } }
  }
  let outside = 0, i = -1;
  while ((i = css.indexOf("body.hk-answer-mode", i + 1)) !== -1) { if (i < mOpen || i > mClose) outside++; }
  ok("กฎ body.hk-answer-mode ใหม่ทั้งหมดอยู่ใน @media 768 (desktop layout เดิม)", outside === 0, `outside=${outside}`);
}

// ===== 9) pill ลอยมุมล่าง: โผล่/ข้อความ/แตะสลับ/เปลี่ยน ✅ =====
{
  const els = { runPill: mkEl() };
  els.runPill.classList.add("hidden");
  const state = {};
  const code = [extract("setRunPill"), extract("refreshRunPill")].join("\n");
  const factory = new Function("els", "state", "t", code + "\nreturn { setRunPill, refreshRunPill };");
  const fns = factory(els, state, t);
  fns.setRunPill("running", 16.4);
  ok("งานวิ่ง 16% → '⏳ 16% · แตะกลับไปดูคำพยากรณ์' + โผล่", els.runPill.textContent === "⏳ 16% · แตะกลับไปดูคำพยากรณ์" && !els.runPill.classList.contains("hidden"));
  fns.setRunPill("running", 78);
  ok("% เดินตาม tick", els.runPill.textContent.includes("78%"));
  fns.setRunPill("done");
  ok("งานเสร็จ → '✅ คำพยากรณ์พร้อมแล้ว · แตะดู'", els.runPill.textContent === "✅ คำพยากรณ์พร้อมแล้ว · แตะดู" && !els.runPill.classList.contains("hidden"));
  fns.setRunPill("");
  ok("idle/ล้าง/รันพลาด → pill หาย", els.runPill.classList.contains("hidden"));
  fns.setRunPill("running", 40);
  fns.refreshRunPill();
  ok("refreshRunPill คงสถานะเดิม (ใช้ตอนเปลี่ยนภาษา)", els.runPill.textContent.includes("40%"));
  // wiring จริงใน source
  ok("ticker รายวินาทีอัปเดต pill (updateProgressDom)", /setRunPill\('running', pct\); \/\/ r383/.test(extract("updateProgressDom")));
  ok("renderProgress: done → ✅ · null → ซ่อน", /setRunPill\(status\.phase === 'done' \? 'done' : 'running', pct\)/.test(extract("renderProgress")) && /setRunPill\(''\)/.test(extract("renderProgress")));
  ok("แตะ pill = กลับหน้าอ่าน (ลบ hk-ask-open)", /els\.runPill\.addEventListener\('click', function\(\)\{\s*document\.body\.classList\.remove\('hk-ask-open'\)/.test(src));
  ok("เปิดประวัติบนมือถือ → คงหน้าถาม (history อยู่หน้าถามเท่านั้น)", /keepHistoryOnAskPage\(\)/.test(src) && /classList\.add\('hk-ask-open'\); updateReadBar\(\); \}/.test(extract("keepHistoryOnAskPage")));
}

// ===== 10) i18n ครบ 3 ภาษา + Places lazy + syntax ทุก script block =====
{
  const th = src.slice(src.indexOf("th:{"), src.indexOf("en:{"));
  const en = src.slice(src.indexOf("en:{"), src.indexOf("zh:{"));
  const zh = src.slice(src.indexOf("zh:{"));
  const keys = ["'guest.link'", "'guest.name'", "'guest.gender'", "'guest.birthDate'", "'guest.dateHint'", "'guest.birthTime'", "'guest.noTime'", "'guest.noTimeHint'", "'guest.place'", "'guest.manualLatLng'", "'guest.locFail'", "'guest.locHint'", "'guest.use'", "'guest.cancel'", "'guest.chipTag'", "'guest.edit'", "'guest.needDate'", "'guest.badDate'", "'guest.needTime'", "'guest.needGender'", "'guest.badLatLng'", "'guest.tooMany'", "'guest.badData'", "'guest.slotAt'", "'pill.back'", "'pill.ready'"];
  ok("i18n th ครบ " + keys.length + " คีย์ใหม่", keys.every((k) => th.includes(k)), keys.filter((k) => !th.includes(k)).join(","));
  ok("i18n en ครบ", keys.every((k) => en.includes(k)), keys.filter((k) => !en.includes(k)).join(","));
  ok("i18n zh ครบ", keys.every((k) => zh.includes(k)), keys.filter((k) => !zh.includes(k)).join(","));
  ok("ตัวแปร state ไม่มี substring ชนตัวคั่น i18n ('en:{' โผล่ก่อน 'th:{' — บั๊กที่เคยทำเทสเดิมตก)", src.indexOf("en:{") > src.indexOf("th:{"));
  ok("Google Places โหลด lazy ผ่าน /api/maps-script ตอน focus ช่องสถานที่ + fallback lat/lng", src.includes("/api/maps-script?callback=") && /focusin/.test(src) && /wireGuestPlaces\(e\.target\)/.test(src) && /gf-manual/.test(extract("wireGuestPlaces")));
  ok("ธีมสว่างมีสไตล์ guest (CSS vars เดิม)", src.includes('[data-theme="light"] .guest-form') && src.includes('[data-theme="light"] .guest-chip') && src.includes('[data-theme="light"] .run-pill'));
  // syntax ทุก script block (เทียบเท่า node --check)
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let syntaxOk = blocks.length > 0;
  for (const b of blocks) { try { new Function(b[1]); } catch (e) { syntaxOk = false; console.log("   syntax:", e.message); } }
  ok("script block ทุกก้อน parse ผ่าน (" + blocks.length + " ก้อน)", syntaxOk);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
