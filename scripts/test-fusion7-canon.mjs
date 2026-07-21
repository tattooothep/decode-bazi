/**
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { SignJWT } = require("jose");
 * Test 7 sciences: prompt canon fullness + live fusion5 fire (guest birth)
 */
import fs from "fs";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { join } from "path";

const root = process.cwd();
function loadEnv() {
  const p = fs.existsSync(".env.local") ? ".env.local" : "/root/releases/decode-app-r509-support-notification-p0/.env.local";
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv();

const bp = await import(pathToFileURL(join(root, "src/lib/fusion5/build-prompt.ts")).href);
const disc = await import(pathToFileURL(join(root, "src/lib/fusion5/disciplines.ts")).href);
const { buildSciencePrompt, FUSION_PANEL_PROMPT_MAX_CHARS, CANON_TEXT_MAX_CHARS } = bp;
const { DISCIPLINES, JUDGE_MODEL } = disc;

const birth = {
  name: "ทดสอบ7ศาสตร์",
  dtUTC: new Date("1990-05-15T05:30:00.000Z"),
  lat: 13.7563,
  lng: 100.5018,
  hasTime: true,
  gender: "M",
  birthDate: "1990-05-15",
  birthTime: "12:30",
};
const question = "ปี 2026 การงาน การเงิน และสุขภาพ ควรระวังอะไร";

const sciences = ["bazi", "qizheng", "ziwei", "western", "vedic", "uranian"];
console.log("=== A) PROMPT / CANON AUDIT (offline engine) ===");
console.log({ CANON_TEXT_MAX_CHARS, FUSION_PANEL_PROMPT_MAX_CHARS, JUDGE_MODEL });
console.log("Q:", question);

const promptRows = [];
for (const s of sciences) {
  if (s === "bazi") {
    // bazi fusion profile path uses /api/sifu full · guest uses external ~measure via guest-birth if importable
    promptRows.push({
      science: s,
      path: "via /api/sifu (profile) or guest externalPrompt",
      model: DISCIPLINES.bazi.defaultModel,
      note: "ไม่ใช่ buildSciencePrompt · claude full / guest≤panel cap",
    });
    continue;
  }
  const t0 = Date.now();
  let p = "", err = null;
  try {
    p = buildSciencePrompt(s, [birth], question, "th");
  } catch (e) {
    err = e.message;
  }
  const ms = Date.now() - t0;
  const nLic = (p.match(/LICENSED\/PROJECT EXTRACT/g) || []).length;
  const nSot = /PROJECT SOURCE OF TRUTH/.test(p);
  const nPacket = (p.match(/STRUCTURED_CHART_PACKET/g) || []).length;
  const nCanon = /=== คัมภีร์/.test(p);
  const dropped = (p.match(/CANON_DROPPED_FOR_BUDGET: ([^\n—]+)/) || [])[1] || "";
  const nDrop = dropped ? dropped.split(/,\s*/).filter(Boolean).length : 0;
  const ret = (p.match(/RETRIEVAL_LICENSED:[^\n]+/) || [])[0] || "";
  const sources = ((p.match(/SOURCE_MAP: ([^\n]+)/) || [])[1] || "").split(" | ").filter(Boolean).length;
  const hard = /TRUNCATED_NONCRITICAL/.test(p);
  promptRows.push({
    science: s,
    model: DISCIPLINES[s].defaultModel,
    promptChars: p.length,
    pctCap: +((100 * p.length) / FUSION_PANEL_PROMPT_MAX_CHARS).toFixed(1),
    sources,
    licensedBlocks: nLic,
    hasSot: nSot,
    packets: nPacket,
    hasCanon: nCanon,
    droppedFiles: nDrop,
    hardTrunc: hard,
    retrieval: ret.slice(0, 100),
    ms,
    err,
    fullEnough: !err && nCanon && nPacket > 0 && !hard && p.length > 50_000,
  });
}

console.log("\nscience   model            chars    %cap  src  lic  packet sot  drop hard full?");
for (const r of promptRows) {
  if (r.path) {
    console.log(String(r.science).padEnd(10), "PATH", r.path, "|", r.model);
    continue;
  }
  if (r.err) {
    console.log(r.science, "ERR", r.err);
    continue;
  }
  console.log(
    r.science.padEnd(10),
    r.model.padEnd(16),
    String(r.promptChars).padStart(8),
    String(r.pctCap).padStart(5) + "%",
    String(r.sources).padStart(4),
    String(r.licensedBlocks).padStart(4),
    String(r.packets).padStart(6),
    String(r.hasSot).padStart(5),
    String(r.droppedFiles).padStart(4),
    String(r.hardTrunc).padStart(5),
    r.fullEnough ? "YES" : "CHK"
  );
}

// palm block measure if possible
let palmNote = "no palm reading for test user yet";
console.log("\n=== B) LIVE FUSION5 FIRE (guest birth · 6 sciences + palm if any) ===");

const c = new Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
await c.connect();

const userId = crypto.randomUUID();
const email = `e2e_fusion7_${Date.now()}@test.local`;
const trialEnd = new Date(Date.now() + 7 * 864e5).toISOString();
// insert user with hours balance if possible
try {
  await c.query(
    `INSERT INTO users (id, email, password_hash, trial_ends_at) VALUES ($1,$2,$3,$4)`,
    [userId, email, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV", trialEnd]
  );
} catch (e) {
  console.log("user insert try1", e.message.slice(0, 100));
  try {
    await c.query(`INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`, [
      userId, email, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV",
    ]);
  } catch (e2) {
    console.log("user insert fail", e2.message.slice(0, 120));
  }
}
// grant hours if column exists
for (const sql of [
  `UPDATE users SET hour_balance = 500 WHERE id=$1`,
  `UPDATE users SET hours_balance = 500 WHERE id=$1`,
  `UPDATE users SET balance_hours = 500 WHERE id=$1`,
]) {
  try {
    await c.query(sql, [userId]);
    console.log("hours via", sql.split("SET")[1].trim().slice(0, 40));
    break;
  } catch {}
}
// org for profile optional - guest only
let sv = 0;
try {
  const r = await c.query(`SELECT session_version FROM users WHERE id=$1`, [userId]);
  sv = Number(r.rows[0]?.session_version) || 0;
} catch {}

const token = await new SignJWT({ userId, email, orgId: null, sv })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cookie = `decode_auth=${token}`;

// check palm for this user (none expected)
try {
  const pr = await c.query(`SELECT id FROM palm_readings WHERE user_id=$1 LIMIT 1`, [userId]);
  palmNote = pr.rows.length ? "has palm" : "no palm for this test user (science 7 judge block skipped)";
} catch (e) {
  palmNote = "palm table: " + e.message.slice(0, 60);
}
console.log("palm:", palmNote);

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3349";
const body = {
  guestBirths: [
    {
      name: "ทดสอบ7ศาสตร์",
      date: "1990-05-15",
      time: "12:30",
      lat: 13.7563,
      lng: 100.5018,
      gender: "M",
      birthTimeKnown: true,
    },
  ],
  sciences: ["bazi", "qizheng", "ziwei", "western", "vedic", "uranian"],
  includePalm: true,
  message: question,
  question,
  lang: "th",
  history: [],
};

const tFire = Date.now();
const r = await fetch(`${BASE}/api/sifu/fusion5`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify(body),
});
const j = await r.json().catch(() => ({}));
console.log("POST status", r.status, "keys", Object.keys(j));
if (!r.ok) {
  console.log("POST body", JSON.stringify(j).slice(0, 500));
}

const jobId = j.jobId || j.job_id || j.id;
console.log("jobId", jobId);

async function poll() {
  if (!jobId) return null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pr = await fetch(`${BASE}/api/sifu/fusion5?jobId=${encodeURIComponent(jobId)}`, {
      headers: { Cookie: cookie },
    });
    const pj = await pr.json().catch(() => ({}));
    const st = pj.status || pj.job?.status || pj.state;
    const panels = pj.fusion5?.panels || pj.result?.fusion5?.panels || pj.panels;
    process.stdout.write(`  poll ${i + 1} status=${st} panels=${Array.isArray(panels) ? panels.length : "-"}\n`);
    if (st === "done" || st === "degraded" || st === "fail" || st === "error" || st === "failed") {
      return pj;
    }
    // sometimes result nested
    if (pj.reply || pj.result?.reply) return pj;
  }
  return { timeout: true };
}

const result = await poll();
const ms = Date.now() - tFire;
console.log("\n=== LIVE RESULT ===", "ms=", ms);

const f5 = result?.fusion5 || result?.result?.fusion5 || {};
const panels = f5.panels || result?.panels || [];
const judge = f5.judge || result?.judge || {};

console.log("\nscience   model            ok    chars  error");
for (const p of panels) {
  const reply = p.reply || "";
  console.log(
    String(p.science || "-").padEnd(10),
    String(p.model || "-").padEnd(16),
    String(!!p.ok).padEnd(5),
    String(reply.length).padStart(6),
    (p.error || "").slice(0, 80)
  );
}
console.log(
  "judge     ",
  String(judge.model || JUDGE_MODEL).padEnd(16),
  String(!!judge.ok).padEnd(5),
  String((result?.reply || result?.result?.reply || "").length).padStart(6),
  (judge.error || "").slice(0, 80)
);

// cleanup user
try {
  await c.query(`DELETE FROM users WHERE id=$1`, [userId]);
} catch {}
await c.end();

const liveOk = panels.filter((p) => p.ok).length;
const liveFail = panels.filter((p) => !p.ok).length;
const out = {
  promptAudit: promptRows,
  live: {
    jobId,
    ms,
    panelsOk: liveOk,
    panelsFail: liveFail,
    judgeOk: !!judge.ok,
    palm: palmNote,
    status: result?.status || result?.timeout || "unknown",
  },
};
fs.writeFileSync("/tmp/fusion7-test-report.json", JSON.stringify(out, null, 2));
console.log("\nREPORT /tmp/fusion7-test-report.json");
console.log("SUMMARY prompt_full=", promptRows.filter((r) => r.fullEnough).map((r) => r.science).join(",") || "(bazi path separate)");
console.log("SUMMARY live_ok=", liveOk, "live_fail=", liveFail, "judge=", !!judge.ok);
process.exit(liveFail > 3 ? 1 : 0);
