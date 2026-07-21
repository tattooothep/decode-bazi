/**
 * Live fusion5 fire · guest birth · 6 sciences + palm toggle
 *   node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/test-fusion7-live.mjs
 */
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { SignJWT } = require("jose");

function loadEnv() {
  const p = fs.existsSync(".env.local")
    ? ".env.local"
    : "/root/releases/decode-app-r509-support-notification-p0/.env.local";
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv();

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3349";
const question = "ปี 2026 การงาน การเงิน และสุขภาพ ควรระวังอะไร";
const sciences = ["bazi", "qizheng", "ziwei", "western", "vedic", "uranian"];

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

async function tryQ(sql, params = []) {
  try {
    return await c.query(sql, params);
  } catch (e) {
    return { error: e.message, rows: [] };
  }
}

let inserted = false;
for (const sql of [
  `INSERT INTO users (id, email, password_hash, trial_ends_at) VALUES ($1,$2,$3,$4)`,
  `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`,
]) {
  const params = sql.includes("trial")
    ? [userId, email, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV", trialEnd]
    : [userId, email, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV"];
  const r = await tryQ(sql, params);
  if (!r.error) {
    inserted = true;
    console.log("user ok");
    break;
  }
  console.log("insert try fail", r.error.slice(0, 100));
}
if (!inserted) {
  console.error("cannot insert user");
  process.exit(1);
}

// hours columns vary
for (const col of ["hour_balance", "hours_balance", "credit_hours", "yam_balance"]) {
  const r = await tryQ(`UPDATE users SET ${col} = 999 WHERE id=$1`, [userId]);
  if (!r.error) {
    console.log("hours set", col);
    break;
  }
}

// master plan → fusion max_sciences 6 (trial only allows 3)
const subEnd = new Date(Date.now() + 30 * 864e5).toISOString();
for (const sql of [
  `UPDATE users SET tier='master', sub_expires_at=$2, trial_ends_at=$2 WHERE id=$1`,
  `UPDATE users SET tier='master', sub_expires_at=$2 WHERE id=$1`,
  `UPDATE users SET tier='master' WHERE id=$1`,
]) {
  const params = sql.includes("$2") ? [userId, subEnd] : [userId];
  const r = await tryQ(sql, params);
  if (!r.error) {
    console.log("tier set master");
    break;
  }
  console.log("tier try fail", String(r.error).slice(0, 80));
}

// also try hour_transactions grant pattern if exists
await tryQ(
  `INSERT INTO hour_transactions (user_id, amount, reason, created_at) VALUES ($1, 999, 'e2e_fusion7', NOW())`,
  [userId]
);

let sv = 0;
const svR = await tryQ(`SELECT session_version FROM users WHERE id=$1`, [userId]);
if (svR.rows[0]) sv = Number(svR.rows[0].session_version) || 0;

const token = await new SignJWT({ userId, email, orgId: null, sv })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("3h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cookie = `decode_auth=${token}`;

const palmR = await tryQ(`SELECT id FROM palm_readings WHERE user_id=$1 LIMIT 1`, [userId]);
console.log("palm for user:", palmR.rows.length ? "yes" : "no (science 7 will skip content)");

const body = {
  guestBirths: [
    {
      name: "ทดสอบ7ศาสตร์",
      birthDate: "1990-05-15",
      birthTime: "12:30",
      lat: 13.7563,
      lng: 100.5018,
      gender: "M",
      place: "Bangkok",
    },
  ],
  sciences,
  includePalm: true,
  message: question,
  question,
  lang: "th",
  history: [],
};

console.log("POST", BASE + "/api/sifu/fusion5", "sciences", sciences.join(","));
const t0 = Date.now();
const r = await fetch(`${BASE}/api/sifu/fusion5`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify(body),
});
const j = await r.json().catch(() => ({}));
console.log("POST", r.status, JSON.stringify(j).slice(0, 400));

const jobId = j.jobId || j.job_id || j.id || j.job?.id;
if (!jobId) {
  console.error("no jobId");
  await tryQ(`DELETE FROM users WHERE id=$1`, [userId]);
  await c.end();
  process.exit(1);
}

let final = null;
for (let i = 0; i < 150; i++) {
  await new Promise((res) => setTimeout(res, 10000));
  const pr = await fetch(`${BASE}/api/sifu/fusion5?jobId=${encodeURIComponent(jobId)}`, {
    headers: { Cookie: cookie },
  });
  const pj = await pr.json().catch(() => ({}));
  const st = pj.status || pj.job?.status || pj.state || pj.phase;
  const panels = pj.fusion5?.panels || pj.result?.fusion5?.panels || pj.panels || pj.job?.result?.fusion5?.panels;
  console.log(`poll ${i + 1} http=${pr.status} status=${st} panels=${Array.isArray(panels) ? panels.length : "-"}`);
  if (["done", "degraded", "fail", "failed", "error", "complete", "completed"].includes(String(st))) {
    final = pj;
    break;
  }
  if (pj.reply || pj.result?.reply) {
    final = pj;
    break;
  }
  // dump keys once
  if (i === 0) console.log("sample keys", Object.keys(pj));
}

const ms = Date.now() - t0;
console.log("\n=== LIVE RESULT ms=", ms, "===");
if (!final) {
  console.log("TIMEOUT / no final");
} else {
  const f5 = final.fusion5 || final.result?.fusion5 || final.job?.result?.fusion5 || {};
  const panels = f5.panels || final.panels || [];
  const judge = f5.judge || final.judge || {};
  console.log("status", final.status || final.job?.status);
  console.log("science   model            ok    reply_chars  error");
  for (const p of panels) {
    console.log(
      String(p.science || "-").padEnd(10),
      String(p.model || "-").padEnd(16),
      String(!!p.ok).padEnd(5),
      String((p.reply || "").length).padStart(11),
      String(p.error || "").slice(0, 90)
    );
  }
  const reply = final.reply || final.result?.reply || "";
  console.log(
    "judge     ",
    String(judge.model || "claude-max-cli").padEnd(16),
    String(!!judge.ok).padEnd(5),
    String(reply.length).padStart(11),
    String(judge.error || "").slice(0, 90)
  );
  const okN = panels.filter((p) => p.ok).length;
  console.log("\nOK panels", okN, "/", panels.length, "judge", !!judge.ok);
  fs.writeFileSync(
    "/tmp/fusion7-live-report.json",
    JSON.stringify({ ms, jobId, status: final.status, panels, judge, replyLen: reply.length }, null, 2)
  );
}

// cleanup
await tryQ(`DELETE FROM users WHERE id=$1`, [userId]);
await c.end();
console.log("done");
