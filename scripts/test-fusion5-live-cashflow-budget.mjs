import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `fusion5-live-cashflow-budget-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const BASE_URL = process.env.FUSION_BASE_URL || "http://127.0.0.1:3349";
const TEST_EMAIL = process.env.FUSION5_TEST_EMAIL || "livetest-aeaw@deadbeef.local";
const REPORT_DIR = "/root/decode-app/reports";
const REPORT_PATH = `${REPORT_DIR}/${RUN_ID}.json`;
const HTTP_TIMEOUT_MS = Number(process.env.FUSION5_LIVE_TEST_HTTP_TIMEOUT_MS || 60_000);
const POLL_TIMEOUT_MS = Number(process.env.FUSION5_LIVE_TEST_POLL_TIMEOUT_MS || 900_000);

const question = [
  "ปี 2028 cashflow runway burn rate monthly expenses fixed cost cost control cash reserve tax reserve accounts receivable delayed payment AI cost ad cost SaaS cost ต้องคุมยังไง",
  "ควร build reserve, freeze hiring, cut tools, renegotiate vendor, tighten collection, reduce ad spend, cap AI cost, delay expansion หรือ invest only from surplus ไหม",
  "ฟันธงให้เฉพาะดวงนี้ อย่าตอบกว้าง และคำตอบต้องสอดคล้องกับคัมภีร์/packet เท่านั้น",
].join(" ");

const sciences = ["qizheng", "ziwei", "western", "vedic"];

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(method, url, payload, headers = {}) {
  const body = payload == null ? "" : JSON.stringify(payload);
  const target = new URL(url);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(target, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...headers,
      },
      timeout: HTTP_TIMEOUT_MS,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 2_000) }; }
        resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, json, text });
      });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => req.destroy(new Error(`http_timeout_${HTTP_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function signSession(row) {
  return new SignJWT({ userId: row.user_id, email: row.email, orgId: row.org_id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

async function pickSubject() {
  const { rows } = await pool.query(`
    SELECT u.id AS user_id, u.email, u.current_org_id AS org_id, u.hour_balance,
           p.id AS profile_id, coalesce(p.nickname, p.name, p.id::text) AS profile_label,
           p.birth_time_known
      FROM users u
      JOIN org_members om ON om.org_id = u.current_org_id AND om.user_id = u.id AND om.status = 'active'
      JOIN profiles p ON p.org_id = u.current_org_id AND p.is_archived = false
     WHERE u.email = $1
       AND p.birth_time_known IS TRUE
     ORDER BY p.created_at DESC
     LIMIT 1
  `, [TEST_EMAIL]);
  if (!rows[0]) throw new Error(`No timed test profile found for ${TEST_EMAIL}`);
  return rows[0];
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function evaluatePanel(science, reply) {
  const text = String(reply || "");
  const common = {
    cashflow: hasAny(text, [/cash\s*flow|cashflow|กระแสเงินสด|เงินหมุน|เงินสด/i]),
    runway: hasAny(text, [/runway|รันเวย์|burn\s*rate|เงินสำรอง|reserve|สำรอง/i]),
    costControl: hasAny(text, [/cost|ต้นทุน|ค่าใช้จ่าย|ค่า\s*AI|ค่าแอด|SaaS|เครื่องมือ|ลด|คุม|freeze|cut|cap/i]),
    collection: hasAny(text, [/receivable|delayed\s*payment|collection|เก็บเงิน|ลูกหนี้|จ่ายช้า|vendor|คู่ค้า|customer|ลูกค้า/i]),
    concreteAction: hasAny(text, [/build\s*reserve|freeze|cut|renegotiate|tighten|reduce|cap|delay|surplus|สำรอง|หยุดจ้าง|ตัด|ต่อรอง|เก็บเงิน|ลดค่าแอด|ชะลอ/i]),
  };
  const scienceChecks = {
    qizheng: {
      owner: hasAny(text, [/三主|命度|度主|身主|เจ้าชะตา|ตัวเจ้าของ/i]),
      cash: hasAny(text, [/財帛|cash|เงินสด|รายรับ|เก็บเงิน/i]),
      reserve: hasAny(text, [/田宅|reserve|สำรอง|ฐานทรัพย์|fixed/i]),
      operation: hasAny(text, [/官祿|operation|ควบคุม|ระบบ|authority/i]),
      terms: hasAny(text, [/兄弟|妻妾|invoice|เอกสาร|ลูกค้า|vendor|คู่ค้า/i]),
      burn: hasAny(text, [/奴僕|ทีม|staff|tool|platform|AI|SaaS/i]),
      risk: hasAny(text, [/疾厄|仇|難|leak|หนี้|ภาษี|refund|รั่ว/i]),
      timing: hasAny(text, [/行限|流年|ปี\s*2028|จังหวะ|timing/i]),
    },
    ziwei: {
      owner: hasAny(text, [/命宮|身宮|เจ้าชะตา|ตัวเจ้าของ/i]),
      cash: hasAny(text, [/財帛|cash|เงินสด|รายรับ|เก็บเงิน/i]),
      reserve: hasAny(text, [/田宅|reserve|สำรอง|ฐานทรัพย์|fixed/i]),
      operation: hasAny(text, [/官祿|operation|ควบคุม|ระบบ|authority/i]),
      terms: hasAny(text, [/兄弟|父母|夫妻|invoice|เอกสาร|ลูกค้า|vendor|คู่ค้า/i]),
      burn: hasAny(text, [/僕役|ทีม|staff|tool|platform|AI|SaaS/i]),
      risk: hasAny(text, [/疾厄|化忌|煞曜|leak|หนี้|ภาษี|refund|รั่ว/i]),
      timing: hasAny(text, [/大限|流年|流月|流日|四化|ปี\s*2028|จังหวะ|timing/i]),
    },
    western: {
      owner: hasAny(text, [/Asc|chart[-\s]?ruler|ลัคนา|เจ้าดวง|ตัวเจ้าของ/i]),
      cash: hasAny(text, [/2nd|Fortune|เรือน\s*2|cash|เงินสด|รายรับ|เก็บเงิน/i]),
      reserve: hasAny(text, [/4th|IC|เรือน\s*4|reserve|สำรอง|fixed/i]),
      operation: hasAny(text, [/MC|10th|เรือน\s*10|operation|ควบคุม|ระบบ|authority/i]),
      terms: hasAny(text, [/3rd|Mercury|9th|7th|invoice|เอกสาร|ลูกค้า|vendor|คู่ค้า/i]),
      burn: hasAny(text, [/6th|เรือน\s*6|staff|tool|platform|AI|SaaS/i]),
      risk: hasAny(text, [/8th|12th|Saturn|Mars|leak|หนี้|ภาษี|refund|รั่ว/i]),
      timing: hasAny(text, [/transit|return|ปี\s*2028|จังหวะ|timing/i]),
    },
    vedic: {
      owner: hasAny(text, [/Lagna|Moon|ลัคนา|จันทร์|ตัวเจ้าของ/i]),
      cash: hasAny(text, [/2nd|11th|เรือน\s*2|เรือน\s*11|cash|เงินสด|รายรับ|เก็บเงิน/i]),
      reserve: hasAny(text, [/4th|เรือน\s*4|reserve|สำรอง|fixed/i]),
      operation: hasAny(text, [/10th|D10|เรือน\s*10|operation|ควบคุม|ระบบ|authority/i]),
      terms: hasAny(text, [/3rd|Mercury|9th|7th|invoice|เอกสาร|ลูกค้า|vendor|คู่ค้า/i]),
      burn: hasAny(text, [/6th|เรือน\s*6|staff|tool|platform|AI|SaaS/i]),
      risk: hasAny(text, [/8th|12th|Rahu|Ketu|Mars|Saturn|leak|หนี้|ภาษี|refund|รั่ว/i]),
      timing: hasAny(text, [/dasha|gochara|ทศา|โคจร|ปี\s*2028|จังหวะ|timing/i]),
    },
  }[science] || {};
  const anchorCount = Object.values(scienceChecks).filter(Boolean).length;
  const checks = { ...common, ...scienceChecks };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (anchorCount < 6) missing.push("canonPacketAnchors");
  return {
    ok: missing.length === 0 && text.trim().length >= 700,
    missing,
    chars: text.length,
    excerpt: text.replace(/\s+/g, " ").trim().slice(0, 900),
  };
}

try {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET missing");
  mkdirSync(REPORT_DIR, { recursive: true });
  const subject = await pickSubject();
  const token = await signSession(subject);
  const headers = { Cookie: `decode_auth=${encodeURIComponent(token)}` };
  const post = await requestJson("POST", `${BASE_URL}/api/sifu/fusion5`, {
    profileIds: [subject.profile_id],
    sciences,
    question,
    lang: "th",
    threadId: RUN_ID,
    history: [],
  }, headers);
  if (!post.ok || !post.json?.jobId) {
    throw new Error(`POST failed status=${post.status} body=${JSON.stringify(post.json).slice(0, 600)}`);
  }
  const jobId = post.json.jobId;
  const started = Date.now();
  let poll = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await sleep(5_000);
    poll = await requestJson("GET", `${BASE_URL}/api/sifu/fusion5?jobId=${encodeURIComponent(jobId)}`, null, headers);
    if (!poll.ok) throw new Error(`POLL failed status=${poll.status} body=${JSON.stringify(poll.json).slice(0, 600)}`);
    if (poll.json?.status && poll.json.status !== "running") break;
  }
  if (!poll?.json || poll.json.status === "running") throw new Error(`job_timeout jobId=${jobId}`);
  const result = poll.json.result || {};
  const panels = Array.isArray(result?.fusion5?.panels) ? result.fusion5.panels : [];
  const byScience = Object.fromEntries(panels.map((p) => [p.science, p]));
  const evaluations = Object.fromEntries(sciences.map((science) => {
    const panel = byScience[science] || {};
    const ev = panel.ok ? evaluatePanel(science, panel.reply || "") : { ok: false, missing: [`panel_error:${panel.error || "missing"}`], chars: 0, excerpt: "" };
    return [science, {
      panelOk: panel.ok === true,
      model: panel.model || null,
      error: panel.error || null,
      ...ev,
    }];
  }));
  const pass = sciences.every((science) => evaluations[science]?.ok === true);
  const output = {
    runId: RUN_ID,
    baseUrl: BASE_URL,
    testEmail: TEST_EMAIL,
    profile: { id: subject.profile_id, label: subject.profile_label },
    question,
    jobId,
    post: post.json,
    status: poll.json.status,
    judgeOk: result?.fusion5?.judge?.ok === true,
    evaluations,
    pass,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    runId: RUN_ID,
    pass,
    status: poll.json.status,
    jobId,
    reportPath: REPORT_PATH,
    summary: Object.fromEntries(sciences.map((science) => [science, {
      ok: evaluations[science].ok,
      panelOk: evaluations[science].panelOk,
      missing: evaluations[science].missing,
      chars: evaluations[science].chars,
      model: evaluations[science].model,
    }])),
  }, null, 2));
  process.exit(pass ? 0 : 2);
} finally {
  await pool.end();
}
