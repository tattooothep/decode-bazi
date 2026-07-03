// r376 · ทดสอบ master-fusion.html: (1) % จริงตามหลักไมล์ + time-creep (แก้แถบค้าง 10%)
//        (2) มือถือ answer-mode: การ์ด progress ยุบแถวเดียว + แตะกาง + placeholder โซนคำตอบ
//        (3) resonance v3 UI: chip นับเฉพาะ independent + structural พับเป็นหมายเหตุ + i18n 3 ภาษา
// หมายเหตุ: jsdom ไม่มีใน node_modules (ดิสก์ 96% · ห้ามเพิ่ม dependency) → ใช้วิธี extract ฟังก์ชันจริง
// จากไฟล์ HTML มารันกับ DOM stub เบา ๆ — logic เดียวกับที่ browser รันทุกบรรทัด
// run: node scripts/test-fusion-mobile-progress.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "public", "master-fusion.html"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

// ---------- extract ฟังก์ชันจริงจากไฟล์ (นับวงเล็บปีกกา — string ในฟังก์ชันเหล่านี้ balance หมด) ----------
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
  return {
    add: (c) => s.add(c), remove: (c) => s.delete(c),
    toggle: (c) => (s.has(c) ? (s.delete(c), false) : (s.add(c), true)),
    contains: (c) => s.has(c),
  };
};

function makeSandbox({ mobile, answerMode }) {
  const dict = {
    "prog.read": "อ่านดวง {d}/{t} ศาสตร์เสร็จ",
    "prog.reading": "กำลังอ่านดวง {t} ศาสตร์",
    "prog.judge": "กำลังหลอมคำฟันธง",
  };
  const t = (k) => (dict[k] != null ? dict[k] : k);
  const state = {};
  const els = { progress: { classList: mkClassList() } };
  const body = { classList: mkClassList() };
  if (answerMode) body.classList.add("hk-answer-mode");
  const documentStub = { body };
  const isMobileFold = () => !!mobile;
  const code = [
    extract("fusionPanelCounts"), extract("fusionMilestone"), extract("fusionCreep"),
    extract("computeFusionPercent"), extract("progressLineText"), extract("toggleProgressFold"),
  ].join("\n");
  const factory = new Function("t", "state", "els", "document", "isMobileFold",
    code + "\nreturn { fusionPanelCounts, fusionMilestone, fusionCreep, computeFusionPercent, progressLineText, toggleProgressFold };");
  return { fns: factory(t, state, els, documentStub, isMobileFold), els, body };
}

const { fns } = makeSandbox({ mobile: false, answerMode: false });
const P = (n, states) => Object.fromEntries(states.slice(0, n).map((st, i) => [`sci${i}`, { model: `sci${i}`, role: "panel", state: st }]));
const T0 = 1_750_000_000_000;

// ===== 1) % milestones ตามสูตร: 8% → +70/N ต่อ panel เสร็จ → judge 80 → done 100 =====
{
  const queued = { phase: "queued", percent: 2, panel: P(5, ["queued", "queued", "queued", "queued", "queued"]) };
  ok("สร้างงาน (queued · 0/5 เสร็จ) = 8%", fns.computeFusionPercent(queued, T0, T0) === 8, String(fns.computeFusionPercent(queued, T0, T0)));
  const done2 = { phase: "panel", percent: 2, panel: P(5, ["ok", "ok", "running", "running", "running"]) };
  ok("panel เสร็จ 2/5 = 8+2×14 = 36%", fns.computeFusionPercent(done2, T0, T0) === 36, String(fns.computeFusionPercent(done2, T0, T0)));
  const done4 = { phase: "panel", percent: 2, panel: P(5, ["ok", "ok", "ok", "skipped", "running"]) };
  ok("panel เสร็จ 4/5 (นับ ok+skipped) = 8+4×14 = 64%", fns.computeFusionPercent(done4, T0, T0) === 64);
  const judge = { phase: "judge", percent: 2, panel: P(5, ["ok", "ok", "ok", "ok", "ok"]) };
  ok("judge เริ่ม = 80%", fns.computeFusionPercent(judge, T0, T0) === 80);
  ok("เสร็จ = 100%", fns.computeFusionPercent({ phase: "done", panel: {} }, T0, T0) === 100);
  const three = { phase: "panel", percent: 2, panel: P(3, ["ok", "running", "running"]) };
  ok("สเกลตามจำนวนศาสตร์: 3 ศาสตร์ เสร็จ 1 = 8+70/3 ≈ 31.3%", Math.abs(fns.computeFusionPercent(three, T0, T0) - 31.3) < 0.05, String(fns.computeFusionPercent(three, T0, T0)));
}

// ===== 2) time-creep ระหว่างหลักไมล์: 0.1-0.3%/s · เพดาน = หลักไมล์ถัดไป -2 =====
{
  const done2 = { phase: "panel", percent: 2, panel: P(5, ["ok", "ok", "running", "running", "running"]) };
  ok("คืบ 10s = 36+3 = 39% (rate 0.3/s ช่วงแรก)", fns.computeFusionPercent(done2, T0 + 10_000, T0) === 39, String(fns.computeFusionPercent(done2, T0 + 10_000, T0)));
  ok("คืบนาน 300s → ชนเพดานหลักไมล์ถัดไป (50) -2 = 48%", fns.computeFusionPercent(done2, T0 + 300_000, T0) === 48);
  ok("อัตราคืบอยู่กรอบ 0.1-0.3%/s (easing)", fns.fusionCreep(60_000) === 18 && fns.fusionCreep(180_000) === 42 && Math.abs(fns.fusionCreep(240_000) - 48) < 1e-9);
  const judge = { phase: "judge", percent: 2, panel: P(5, ["ok", "ok", "ok", "ok", "ok"]) };
  ok("judge คืบได้ถึงเพดาน 98% (ไม่แตะ 100 ก่อนเสร็จจริง)", fns.computeFusionPercent(judge, T0 + 600_000, T0) === 98);
  // synthetic (fusion5 job — server ไม่รายงานรายศาสตร์กลางทาง) → คืบทั้งเฟสเพดาน 78
  const syn = { phase: "panel", percent: 8, synthetic: true, panel: P(5, ["running", "running", "running", "running", "running"]) };
  ok("synthetic job: ไม่ค้าง 10% — 60s = 26% · 300s = 62%", fns.computeFusionPercent(syn, T0 + 60_000, T0) === 26 && fns.computeFusionPercent(syn, T0 + 300_000, T0) === 62, `${fns.computeFusionPercent(syn, T0 + 60_000, T0)}/${fns.computeFusionPercent(syn, T0 + 300_000, T0)}`);
  ok("synthetic เพดาน 78 (หลักไมล์ judge 80 -2)", fns.computeFusionPercent(syn, T0 + 3_600_000, T0) === 78);
  ok("server เคยรายงาน percent สูงกว่า → ไม่ถอยหลัง", fns.computeFusionPercent({ ...syn, percent: 50 }, T0, T0) === 50);
}

// ===== 3) deterministic ต่อ state เดียวกัน (time mock) =====
{
  const st = { phase: "panel", percent: 2, panel: P(5, ["ok", "running", "running", "running", "running"]) };
  const a = fns.computeFusionPercent(st, T0 + 47_000, T0);
  const b = fns.computeFusionPercent(st, T0 + 47_000, T0);
  ok("deterministic: (status, now, milestoneAt) เดียวกัน → % เท่ากันเป๊ะ", a === b && typeof a === "number");
}

// ===== 4) ข้อความแถวยุบ sync ตัวเลขเดียวกับแถบ % =====
{
  const done2 = { phase: "panel", panel: P(5, ["ok", "ok", "running", "running", "running"]) };
  ok("แถวยุบ: 'อ่านดวง 2/5 ศาสตร์เสร็จ · 36%'", fns.progressLineText(done2, 36) === "อ่านดวง 2/5 ศาสตร์เสร็จ · 36%", fns.progressLineText(done2, 36));
  const run0 = { phase: "panel", panel: P(5, ["running", "running", "running", "running", "running"]) };
  ok("ยังไม่มีศาสตร์เสร็จ → 'กำลังอ่านดวง 5 ศาสตร์ · 12%' (ไม่โกหก 0/5)", fns.progressLineText(run0, 12) === "กำลังอ่านดวง 5 ศาสตร์ · 12%", fns.progressLineText(run0, 12));
  ok("เฟส judge → 'กำลังหลอมคำฟันธง · 83%'", fns.progressLineText({ phase: "judge", panel: {} }, 83) === "กำลังหลอมคำฟันธง · 83%");
}

// ===== 5) แตะแถบยุบ = กาง/หุบ (มือถือ+answer-mode เท่านั้น · desktop no-op) =====
{
  const m = makeSandbox({ mobile: true, answerMode: true });
  m.fns.toggleProgressFold();
  ok("มือถือ+answer-mode: แตะครั้งแรก → กาง (prog-open)", m.els.progress.classList.contains("prog-open"));
  m.fns.toggleProgressFold();
  ok("แตะซ้ำ → หุบกลับ", !m.els.progress.classList.contains("prog-open"));
  const d = makeSandbox({ mobile: false, answerMode: true });
  d.fns.toggleProgressFold();
  ok("desktop: แตะแล้วไม่เกิดอะไร (ไม่ยุบอยู่แล้ว)", !d.els.progress.classList.contains("prog-open"));
  const nm = makeSandbox({ mobile: true, answerMode: false });
  nm.fns.toggleProgressFold();
  ok("มือถือแต่ยังไม่ answer-mode: no-op", !nm.els.progress.classList.contains("prog-open"));
}

// ===== 6) โครง CSS/markup: ยุบเฉพาะมือถือ+answer-mode · desktop ไม่เปลี่ยน =====
{
  const mediaAt = src.indexOf("r374 · Mobile answer-mode");
  const progLineHidden = src.indexOf(".prog-line{display:none}");
  ok("แถวยุบ .prog-line ซ่อนเป็น default ทั่วไฟล์ (desktop ไม่เห็น)", progLineHidden > -1 && progLineHidden < mediaAt);
  const collapseRule = src.indexOf("body.hk-answer-mode .progress-card:not(.prog-open) .progress-head");
  ok("กติกายุบ progress อยู่หลัง media ≤768 + scope body.hk-answer-mode", collapseRule > mediaAt && src.includes("body.hk-answer-mode .progress-card:not(.prog-open) .progress-models{display:none}"));
  ok("renderProgress ใส่แถวยุบ prog-line + คง prog-open ข้าม re-render", src.includes("'<div class=\"prog-line\"><span class=\"prog-line-text\">'") && src.includes("classList.contains('prog-open')"));
  ok("การ์ด progress มี ticker รายวินาที (updateProgressDom) — % ไม่ค้าง", src.includes("setInterval(updateProgressDom, 1000)"));
  ok("โซนคำตอบจองพื้นที่ตอนรัน: placeholder run-wait + min-height + desktop คงข้อความเดิม", src.includes("result-empty.run-wait{min-height:46vh") && src.includes("runWaitPlaceholderHtml(t('runningAsync'))") && src.includes("runWaitPlaceholderHtml(t('running'))") && src.includes(".run-wait .run-wait-ico,.run-wait .run-wait-mobile{display:none}"));
  ok("startSyntheticProgress ติดธง synthetic:true (job ไม่มีสถานะรายศาสตร์กลางทาง)", src.includes("synthetic:true"));
}

// ===== 7) i18n 3 ภาษา: prog.* + answerWait + res.struct ครบทุก locale =====
{
  const th = src.slice(src.indexOf("th:{"), src.indexOf("en:{"));
  const en = src.slice(src.indexOf("en:{"), src.indexOf("zh:{"));
  const zh = src.slice(src.indexOf("zh:{"));
  const keys = ["'prog.read'", "'prog.reading'", "'prog.judge'", "'answerWait'", "'res.struct'"];
  ok("i18n th ครบ (prog.read/reading/judge + answerWait + res.struct)", keys.every((k) => th.includes(k)));
  ok("i18n en ครบ", keys.every((k) => en.includes(k)));
  ok("i18n zh ครบ", keys.every((k) => zh.includes(k)));
}

// ===== 8) resonance v3 UI: chip นับเฉพาะ independent + structural พับเป็นหมายเหตุ + แถวจาง =====
{
  ok("chip R2/R3 นับเฉพาะ independent (r2Ind/r3Ind)", src.includes("var r2Ind = r2.filter(function(c){ return !isStruct(c); });") && src.includes("' × ' + r2Ind.length") && src.includes("' × ' + r3Ind.length"));
  ok("structural พับเป็นหมายเหตุ res-structnote × n", src.includes('res-structnote">ℹ️ ') && src.includes(".res-structnote{margin-top:5px"));
  ok("ตาราง R2/R3 แถว structural ติด class res-struct + ℹ️ + จางลง", src.includes("' class=\"res-struct\"'") && src.includes(".md-t tr.res-struct td{opacity:.62}"));
  ok("มือถือพับการ์ด (hk-fold) ซ่อนหมายเหตุ structural ด้วย", src.includes(".hk-fold .res-structnote{display:none}"));
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
