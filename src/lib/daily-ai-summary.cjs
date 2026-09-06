/**
 * daily-ai-summary.cjs — สรุปดวงรายวันภาษาคนด้วย AI จากผลเครื่องยนต์ 4 ศาสตร์
 *
 * กติกาที่เคาะ 6 ก.ย. 2569 (goal สาย ข):
 *  - เครื่องยนต์คำนวณ AI แค่ตีความ — ตัวเลข/ยาม/ทิศ ทุกตัวมาจาก facts ที่ engine
 *    คำนวณแล้วเท่านั้น AI ห้ามคิดเลขเอง (prompt สั่ง + validator บังคับโครง)
 *  - ศาสตร์อิสระ ≥2 ชี้ทางเดียวกันถึงฟันธงหนัก · ศาสตร์เดียว = ข้อระวัง · ขัดกันไม่ซ่อน
 *  - ศาสตร์ที่ไม่มีข้อมูลใน facts ห้าม AI เอ่ยถึง
 *  - AI พัง/ตอบผิดโครง = คนเรียกถอยไปใช้ข้อความสูตรเดิม (ไม่มีวันเงียบ)
 *
 * โมดูลนี้ pure logic + ตัวเรียก CLI แยก inject ได้ — เทสด้วย mock ล้วน
 */
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const LOCALES = ["th", "en", "zh"];
const SCIENCES = ["bazi", "tongshu", "qimen", "sky"];
const LIFE_KEYS = ["work", "money", "love", "health", "travel"];
const STANCES = ["support", "caution", "neutral"];
const AI_TIMEOUT_MS = 180_000;

function factsDigest(facts) {
  return crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

/** ศาสตร์ที่มีข้อมูลจริงใน facts — AI ได้รับอนุญาตพูดถึงเฉพาะชุดนี้ */
function availableSciences(facts) {
  const out = [];
  if (facts && facts.bazi && typeof facts.bazi === "object") out.push("bazi");
  if (facts && facts.tongshu && typeof facts.tongshu === "object") out.push("tongshu");
  if (facts && facts.qimen && typeof facts.qimen === "object") out.push("qimen");
  if (facts && facts.sky && typeof facts.sky === "object") out.push("sky");
  return out;
}

function buildDailyAiPrompt(facts) {
  const sciences = availableSciences(facts);
  if (sciences.length < 2) throw new Error("daily_ai_not_enough_sciences");
  return [
    "คุณคือซินแสอาวุโสของ HourKey เขียนสรุปดวงประจำวันจากผลคำนวณของเครื่องยนต์เท่านั้น",
    "",
    "== กฎเหล็ก ==",
    "1. ห้ามคำนวณหรือแต่งตัวเลข/ยาม/ทิศ/องศาเองเด็ดขาด — ใช้เฉพาะที่อยู่ใน ENGINE_FACTS",
    `2. พูดถึงได้เฉพาะศาสตร์ที่มีข้อมูล: ${sciences.join(", ")} — ศาสตร์อื่นห้ามเอ่ยถึง`,
    "3. ฟันธงหนักได้เมื่อศาสตร์อิสระ ≥2 ชี้ทางเดียวกัน · ศาสตร์เดียวชี้ = เขียนเป็นข้อระวัง ไม่ใช่คำห้าม",
    "4. ศาสตร์ขัดกันห้ามซ่อน — บอกทั้งด้านดีและด้านต้องระวังตรงๆ",
    "5. ภาษาคนล้วน ห้ามศัพท์เทคนิค (ห้ามคำว่า 沖/合/aspect/transit) — ผู้อ่านคือคนทั่วไป",
    "6. กล้าฟันธง ห้ามกั๊ก ห้ามคำว่า 'อาจจะ/น่าจะ' เกิน 1 ครั้งต่อภาษา",
    "7. ห้ามทำนายเรื่องต้องห้าม: ความตาย โรคร้ายแรง คดีความ ผลการเมือง การพนัน หวย",
    "",
    "== ENGINE_FACTS (ผลคำนวณจริง ห้ามแก้ไขตัวเลข) ==",
    JSON.stringify(facts, null, 1),
    "",
    "== รูปแบบคำตอบ ==",
    "ตอบเป็น JSON ล้วนก้อนเดียว ไม่มีข้อความอื่นนำหน้า/ต่อท้าย โครงตามนี้เป๊ะ:",
    JSON.stringify({
      th: {
        pushTitle: "วลีสั้น ≤40 ตัวอักษร สรุปจุดเด่นของวัน",
        pushBody: "ฟันธง 2-3 ประโยค ≤240 ตัวอักษร อ่านจบบนจอล็อก",
        verdict: "ฟันธงประจำวันฉบับเต็ม 2-4 ประโยค",
        agree: ["รายชื่อศาสตร์ที่ชี้ทางเดียวกัน จากชุดที่อนุญาต"],
        life: [{ key: "work|money|love|health|travel ครบ 5 หมวด", stars: "จำนวนเต็ม 1-5", text: "คำอธิบายหมวด 1-3 ประโยค", tip: "คำแนะนำสั้น 1 บรรทัด" }],
        doList: ["ควรทำวันนี้ 2-3 ข้อ"],
        avoidList: ["ควรเลี่ยงวันนี้ 2-3 ข้อ"],
        scienceNotes: [{ science: "bazi|tongshu|qimen|sky", stance: "support|caution|neutral", text: "เหตุผลภาษาคน 1-2 ประโยค" }],
      },
      en: "โครงเดียวกับ th เป็นภาษาอังกฤษ",
      zh: "โครงเดียวกับ th เป็นจีนตัวเต็ม",
    }, null, 1),
    "",
    "life ต้องมีครบทั้ง 5 หมวดเรียง work, money, love, health, travel ทุกภาษา",
    "agree และ scienceNotes[].science ใช้ได้เฉพาะ: " + sciences.join(", "),
  ].join("\n");
}

function cleanShortText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validateLocaleSummary(entry, sciences) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const okScience = (s) => typeof s === "string" && sciences.includes(s);
  if (!cleanShortText(entry.pushTitle, 60) || !cleanShortText(entry.pushBody, 320)
    || !cleanShortText(entry.verdict, 700)) return null;
  if (!Array.isArray(entry.agree) || entry.agree.length > SCIENCES.length || !entry.agree.every(okScience)) return null;
  if (new Set(entry.agree).size !== entry.agree.length) return null;
  if (!Array.isArray(entry.life) || entry.life.length !== LIFE_KEYS.length) return null;
  const lifeKeys = entry.life.map((item) => item && item.key);
  if (LIFE_KEYS.some((key, index) => lifeKeys[index] !== key)) return null;
  for (const item of entry.life) {
    if (!item || typeof item !== "object" || !Number.isInteger(item.stars) || item.stars < 1 || item.stars > 5
      || !cleanShortText(item.text, 700) || !cleanShortText(item.tip, 240)) return null;
  }
  const goodList = (list) => Array.isArray(list) && list.length >= 1 && list.length <= 4
    && list.every((line) => cleanShortText(line, 160));
  if (!goodList(entry.doList) || !goodList(entry.avoidList)) return null;
  if (!Array.isArray(entry.scienceNotes) || entry.scienceNotes.length < 1 || entry.scienceNotes.length > SCIENCES.length) return null;
  for (const note of entry.scienceNotes) {
    if (!note || typeof note !== "object" || !okScience(note.science)
      || !STANCES.includes(note.stance) || !cleanShortText(note.text, 500)) return null;
  }
  return {
    pushTitle: entry.pushTitle.trim(),
    pushBody: entry.pushBody.trim(),
    verdict: entry.verdict.trim(),
    agree: [...entry.agree],
    life: entry.life.map((item) => ({ key: item.key, stars: item.stars, text: item.text.trim(), tip: item.tip.trim() })),
    doList: entry.doList.map((line) => line.trim()),
    avoidList: entry.avoidList.map((line) => line.trim()),
    scienceNotes: entry.scienceNotes.map((note) => ({ science: note.science, stance: note.stance, text: note.text.trim() })),
  };
}

/** ดึง JSON ก้อนแรกจากข้อความ AI (เผื่อโมเดลใส่ prose/fence มาด้วย) */
function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validateDailySummary(raw, facts) {
  const sciences = availableSciences(facts);
  const parsed = typeof raw === "string" ? extractJsonObject(raw) : raw;
  if (!parsed || typeof parsed !== "object") return null;
  const out = {};
  for (const locale of LOCALES) {
    const entry = validateLocaleSummary(parsed[locale], sciences);
    if (!entry) return null;
    out[locale] = entry;
  }
  // กันฟันธงหนักจากศาสตร์เดียว: agree ต้องว่างหรือ ≥2 เสมอ (1 ศาสตร์ = ข้อระวัง ไม่ใช่เสียงหนุน)
  for (const locale of LOCALES) {
    if (out[locale].agree.length === 1) return null;
  }
  return out;
}

/** เรียก Claude CLI แบบเดียวกับ sifu (sudo -u jarvis · text-only · ไม่มี tool) */
function invokeClaudeCli(prompt, opts = {}) {
  const timeoutMs = Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : AI_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-u", "jarvis", "-H", "claude", "-p", "--safe-mode", "--tools", ""], {
      cwd: "/var/www/checklist-app",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      reject(new Error("daily_ai_timeout"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { err += chunk.toString().slice(0, 2_000); });
    child.on("error", (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`daily_ai_cli_exit_${code}:${err.slice(0, 200)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * สร้างสรุปดวง 3 ภาษาจาก facts — invoke ฉีดได้เพื่อเทส
 * คืน { summary, model, factsDigest } หรือโยน error (คนเรียกต้อง fallback เอง)
 */
async function generateDailySummary(facts, options = {}) {
  const invoke = options.invoke || invokeClaudeCli;
  const model = options.model || "claude-max-cli";
  const prompt = buildDailyAiPrompt(facts);
  const raw = await invoke(prompt, options);
  const summary = validateDailySummary(raw, facts);
  if (!summary) throw new Error("daily_ai_summary_invalid");
  return { summary, model, factsDigest: factsDigest(facts) };
}

/**
 * เอาข้อความ AI ทับสำเนาแจ้งเตือนของ notice ที่ตัวยิงเช้าสร้างไว้ (per-locale)
 * แตะเฉพาะ title/body — key กันซ้ำ, payload, guard, tokens คงเดิมทั้งหมด
 */
function applyAiCopiesToNotice(notice, summary, meta = {}) {
  if (!notice || typeof notice !== "object" || !summary) return notice;
  const dateLabel = typeof meta.dateLabel === "string" ? meta.dateLabel : "";
  const isTomorrow = meta.isTomorrow === true;
  const score = Number.isFinite(meta.score) ? meta.score : null;
  const compose = (locale) => {
    const entry = summary[locale] || summary.th;
    if (!entry) return null;
    const head = locale === "zh"
      ? (isTomorrow ? `🌙 明日運勢（${dateLabel}）` : `☀️ 今日運勢（${dateLabel}）`)
      : locale === "en"
        ? (isTomorrow ? `🌙 Tomorrow (${dateLabel})` : `☀️ Today (${dateLabel})`)
        : (isTomorrow ? `🌙 ดวงพรุ่งนี้ (${dateLabel})` : `☀️ ดวงวันนี้ (${dateLabel})`);
    const scorePart = score === null ? "" : locale === "zh" ? ` · 日力 ${score}` : locale === "en" ? ` · day power ${score}` : ` · พลังวัน ${score}`;
    return { title: `${head} — ${entry.pushTitle}${scorePart}`, body: entry.pushBody };
  };
  const copies = { th: compose("th"), en: compose("en"), zh: compose("zh") };
  if (!copies.th || !copies.en || !copies.zh) return notice;
  const localeOf = (value) => {
    const family = String(value || "th").toLowerCase();
    return family.startsWith("en") ? "en" : family.startsWith("zh") || family.startsWith("cn") ? "zh" : "th";
  };
  return {
    ...notice,
    title: copies.th.title,
    body: copies.th.body,
    historyCopies: { th: copies.th, en: copies.en, zh: copies.zh },
    aiSummary: true,
    messages: (notice.messages || []).map((message) => {
      const copy = copies[localeOf(message.locale)];
      return copy ? { ...message, title: copy.title, body: copy.body } : message;
    }),
  };
}

module.exports = {
  AI_TIMEOUT_MS,
  LIFE_KEYS,
  LOCALES,
  SCIENCES,
  applyAiCopiesToNotice,
  availableSciences,
  buildDailyAiPrompt,
  extractJsonObject,
  factsDigest,
  generateDailySummary,
  invokeClaudeCli,
  validateDailySummary,
};
