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
const { writeFileSync, unlinkSync, chownSync, chmodSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");

const LOCALES = ["th", "en", "zh"];
// 4 ตัวแรก = facts ตรงจาก engine รายวัน · 4 ตัวหลังมากับคำอ่าน fusion 5 ศาสตร์
// (ท่อเดียวกับหน้า /fusion บนเว็บ: panel ต่อศาสตร์ + judge — เจ้านายสั่ง 6 ก.ย.)
const SCIENCES = ["bazi", "tongshu", "qimen", "sky", "ziwei", "qizheng", "western", "vedic"];
const LIFE_KEYS = ["work", "money", "love", "health", "travel"];
const STANCES = ["support", "caution", "neutral"];
// 9 ก.ย. 69: 180 วิคับเมื่อ prompt มีคำอ่าน fusion (~11K ตัวอักษร) — สรุป 3 ภาษา
// หลุดไปชั้นสำรองทั้งที่ claude ปกติ · ขยายเป็น 6 นาที (cron มีงบรอบละ 15 นาทีอยู่แล้ว)
const AI_TIMEOUT_MS = 360_000;

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
  // คำอ่าน fusion (judge 5 ศาสตร์จากเว็บ) เปิดสิทธิ์ศาสตร์ที่ panel วิ่งจริงเท่านั้น
  if (facts && facts.fusion && typeof facts.fusion === "object"
    && typeof facts.fusion.reading === "string" && facts.fusion.reading.trim()) {
    for (const s of Array.isArray(facts.fusion.sciences) ? facts.fusion.sciences : []) {
      if (SCIENCES.includes(s) && !out.includes(s)) out.push(s);
    }
  }
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
    "5.1 ถ้ามี FUSION_READING (คำอ่านจากซินแส 5 ศาสตร์): ใช้เป็นแกนหลักของคำฟันธง — สังเคราะห์เสียงของแต่ละศาสตร์ให้เห็นชัดใน scienceNotes (ศาสตร์ละ 1 note) และให้ agree สะท้อนศาสตร์ที่เห็นตรงกันจริงตามคำอ่าน ห้ามคัดลอกยาวๆ ให้ย่อยเป็นภาษาคนกระชับ",
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

/** เรียก Grok CLI (pin 0.2.64 ผ่าน SIFU_GROK_BIN · login เป็น jarvis) แบบเดียวกับ sifu */
function invokeGrokCli(prompt, opts = {}) {
  const timeoutMs = Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : AI_TIMEOUT_MS;
  const bin = process.env.SIFU_GROK_BIN || "/root/.grok/bin/grok";
  const promptFile = `/tmp/daily_ai_${crypto.randomUUID()}.txt`;
  writeFileSync(promptFile, [
    "=== GROK CLI TEXT-ONLY ADAPTER ===",
    "You are invoked non-interactively. Do not call tools, read files, use web search, memory, or subagents.",
    "Return only the final JSON answer through CLI output.",
    prompt,
  ].join("\n"), { mode: 0o600 });
  try {
    const ids = execFileSync("id", ["-u", "jarvis"]).toString().trim();
    const gid = execFileSync("id", ["-g", "jarvis"]).toString().trim();
    chownSync(promptFile, Number(ids), Number(gid));
    chmodSync(promptFile, 0o600);
  } catch { try { chmodSync(promptFile, 0o644); } catch { /* อ่านได้ก็พอ */ } }
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-u", "jarvis", "-H", bin,
      "--prompt-file", promptFile,
      "--verbatim", "--no-memory", "--no-subagents", "--disable-web-search",
      "--tools", "todo_write", "--max-turns", "2",
      "--output-format", "plain",
    ], { cwd: "/home/jarvis", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { unlinkSync(promptFile); } catch { /* ไฟล์ชั่วคราว */ }
      fn(value);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(reject, new Error("daily_ai_timeout")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { err += chunk.toString().slice(0, 2_000); });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (code === 0 && out.trim()) finish(resolve, out);
      else finish(reject, new Error(`daily_ai_grok_exit_${code}:${err.slice(0, 200)}`));
    });
  });
}

/** ทางสำรองชั้น 3: OpenRouter API (คีย์เดียวกับ sifu intro) — ไม่พึ่ง login CLI */
async function invokeOpenRouter(prompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("daily_ai_no_openrouter_key");
  const model = process.env.DAILY_AI_OPENROUTER_MODEL || process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.4 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`daily_ai_openrouter_${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("daily_ai_openrouter_empty");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** ทางสำรองชั้น 4: Gemini API (คีย์เดียวกับ sifu gemini-api) */
async function invokeGemini(prompt, opts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("daily_ai_no_gemini_key");
  const model = (process.env.SIFU_GEMINI_MODEL || "gemini-3.1-pro-preview").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : AI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`daily_ai_gemini_${res.status}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    if (!text.trim()) throw new Error("daily_ai_gemini_empty");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * สร้างสรุปดวง 3 ภาษาจาก facts — invoke ฉีดได้เพื่อเทส
 * ตัวจริงไล่ตามลำดับ: Claude CLI → Grok CLI → OpenRouter API → Gemini API
 * คืน { summary, model, factsDigest } หรือโยน error (คนเรียกต้อง fallback เอง)
 */
async function generateDailySummary(facts, options = {}) {
  if (!options.invoke) {
    const prompt = buildDailyAiPrompt(facts);
    const attempts = [
      ["claude-max-cli", invokeClaudeCli],
      ["grok-cli", invokeGrokCli],
      ["openrouter", invokeOpenRouter],
      ["gemini-api", invokeGemini],
    ];
    let lastError = new Error("daily_ai_all_backends_failed");
    for (const [model, invoke] of attempts) {
      try {
        const raw = await invoke(prompt, options);
        const summary = validateDailySummary(raw, facts);
        if (!summary) { lastError = new Error("daily_ai_summary_invalid"); continue; }
        return { summary, model, factsDigest: factsDigest(facts) };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
  const invoke = options.invoke;
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
  invokeGrokCli,
  buildDailyAiPrompt,
  extractJsonObject,
  factsDigest,
  generateDailySummary,
  invokeClaudeCli,
  validateDailySummary,
};
