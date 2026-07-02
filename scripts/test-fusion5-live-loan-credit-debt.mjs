import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `fusion5-live-loan-credit-debt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const BASE_URL = process.env.FUSION_BASE_URL || "http://127.0.0.1:3349";
const TEST_EMAIL = process.env.FUSION5_TEST_EMAIL || "livetest-aeaw@deadbeef.local";
const REPORT_DIR = "/root/decode-app/reports";
const REPORT_PATH = `${REPORT_DIR}/${RUN_ID}.json`;
const HTTP_TIMEOUT_MS = Number(process.env.FUSION5_LIVE_TEST_HTTP_TIMEOUT_MS || 60_000);
const POLL_TIMEOUT_MS = Number(process.env.FUSION5_LIVE_TEST_POLL_TIMEOUT_MS || 900_000);

const question = [
  "ปี 2028 loan approval credit card debt repayment debt restructuring refinance interest rate installment principal collateral guarantor creditor default",
  "ปิดหนี้ รวมหนี้ รีไฟแนนซ์ บัตรเครดิต ดอกเบี้ย ค่างวด หลักประกัน ค้ำประกัน",
  "ควร borrow, borrow only with cap, refinance, restructure, consolidate, negotiate, pay down first, avoid new debt, prepare documents หรือ increase reserve ไหม",
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

function requestJson(method, url, payload, headers = {}) {
  const body = payload == null ? "" : JSON.stringify(payload);
  const target = new URL(url);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(target, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}), ...headers },
      timeout: HTTP_TIMEOUT_MS,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 2_000) }; }
        resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, json });
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
    SELECT u.id AS user_id, u.email, u.current_org_id AS org_id,
           p.id AS profile_id, coalesce(p.nickname, p.name, p.id::text) AS profile_label
      FROM users u
      JOIN org_members om ON om.org_id = u.current_org_id AND om.user_id = u.id AND om.status = 'active'
      JOIN profiles p ON p.org_id = u.current_org_id AND p.is_archived = false
     WHERE u.email = $1 AND p.birth_time_known IS TRUE
     ORDER BY p.created_at DESC
     LIMIT 1
  `, [TEST_EMAIL]);
  if (!rows[0]) throw new Error(`No timed test profile found for ${TEST_EMAIL}`);
  return rows[0];
}

function evaluatePanel(science, reply) {
  const text = String(reply || "");
  const common = {
    loan: hasAny(text, [/loan|สินเชื่อ|เงินกู้|กู้|貸款|贷款|借款/i]),
    debt: hasAny(text, [/debt|หนี้|債務|债务/i]),
    refinance: hasAny(text, [/refinanc|รีไฟแนนซ์|restructur|รวมหนี้|ปรับโครงสร้าง|再融資|再融资|重組|重组/i]),
    installment: hasAny(text, [/interest|installment|instalment|principal|ดอกเบี้ย|ค่างวด|เงินต้น|利息|本金|分期/i]),
    action: hasAny(text, [/borrow only with cap|borrow|refinance|restructure|consolidate|negotiate|pay down|avoid new debt|prepare documents|increase reserve|กู้|รีไฟแนนซ์|ปรับโครงสร้าง|รวมหนี้|เจรจา|ปิดหนี้|เลี่ยงหนี้/i]),
  };
  const scienceChecks = {
    qizheng: {
      owner: hasAny(text, [/三主|命度|度主|身主|เจ้าชะตา/i]),
      cash: hasAny(text, [/財帛|debt[-\s]?service|installment|ค่างวด|เงินสด|ดอกเบี้ย/i]),
      collateral: hasAny(text, [/田宅|collateral|reserve|asset|หลักประกัน|จำนอง/i]),
      lender: hasAny(text, [/官祿|lender|approval|credit\s*policy|อนุมัติ|ธนาคาร/i]),
      creditor: hasAny(text, [/妻妾|creditor|guarantor|co[-\s]?borrower|เจ้าหนี้|ผู้ค้ำ/i]),
      document: hasAny(text, [/兄弟|application|credit\s*file|repayment\s*schedule|เอกสาร|ตารางผ่อน/i]),
      execution: hasAny(text, [/奴僕|auto[-\s]?pay|admin|collection|payment[-\s]?admin|payment\s*routine|repayment\s*routine|debt[-\s]?service\s*discipline|monthly\s*payment|routine|ทวงหนี้|ติดตาม|หักอัตโนมัติ|ตามเก็บ|รูทีนชำระ|วินัยชำระ|ระบบชำระ/i]),
      risk: hasAny(text, [/疾厄|仇|難|default|penalty|hidden\s*fee|refinance\s*trap|ผิดนัด|ค่าปรับ/i]),
      timing: hasAny(text, [/行限|流年|限度主|ปี\s*2028|จังหวะ|timing/i]),
    },
    ziwei: {
      owner: hasAny(text, [/命宮|身宮|เจ้าชะตา/i]),
      cash: hasAny(text, [/財帛|debt[-\s]?service|installment|ค่างวด|เงินสด|ดอกเบี้ย/i]),
      collateral: hasAny(text, [/田宅|collateral|reserve|asset|หลักประกัน|จำนอง/i]),
      lender: hasAny(text, [/官祿|lender|approval|credit\s*policy|อนุมัติ|ธนาคาร/i]),
      creditor: hasAny(text, [/夫妻|creditor|guarantor|co[-\s]?borrower|เจ้าหนี้|ผู้ค้ำ/i]),
      document: hasAny(text, [/兄弟|父母|application|credit\s*file|repayment\s*schedule|เอกสาร|ตารางผ่อน/i]),
      execution: hasAny(text, [/僕役|auto[-\s]?pay|admin|collection|payment[-\s]?admin|payment\s*routine|repayment\s*routine|debt[-\s]?service\s*discipline|monthly\s*payment|routine|ทวงหนี้|ติดตาม|หักอัตโนมัติ|ตามเก็บ|รูทีนชำระ|วินัยชำระ|ระบบชำระ/i]),
      risk: hasAny(text, [/疾厄|化忌|煞曜|default|penalty|hidden\s*fee|refinance\s*trap|ผิดนัด|ค่าปรับ/i]),
      timing: hasAny(text, [/大限|流年|流月|流日|四化|ปี\s*2028|จังหวะ|timing/i]),
    },
    western: {
      owner: hasAny(text, [/Asc|chart[-\s]?ruler|ลัคนา|เจ้าดวง|Moon/i]),
      cash: hasAny(text, [/2nd|Fortune|debt[-\s]?service|installment|ค่างวด|เงินสด|ดอกเบี้ย/i]),
      debtHouse: hasAny(text, [/8th|loan|refinance|shared\s*liability|หนี้|รีไฟแนนซ์/i]),
      collateral: hasAny(text, [/4th|IC|collateral|reserve|asset|หลักประกัน|จำนอง/i]),
      creditor: hasAny(text, [/7th|creditor|guarantor|co[-\s]?borrower|เจ้าหนี้|ผู้ค้ำ/i]),
      document: hasAny(text, [/3rd|Mercury|application|credit\s*file|repayment\s*schedule|เอกสาร|ตารางผ่อน/i]),
      execution: hasAny(text, [/6th|เรือน\s*6|auto[-\s]?pay|admin|collection|payment[-\s]?admin|payment\s*routine|repayment\s*routine|debt[-\s]?service\s*discipline|monthly\s*payment|routine|ทวงหนี้|ติดตาม|หักอัตโนมัติ|ตามเก็บ|รูทีนชำระ|วินัยชำระ|ระบบชำระ/i]),
      risk: hasAny(text, [/12th|Saturn|Mars|default|penalty|hidden\s*fee|refinance\s*trap|ผิดนัด|ค่าปรับ/i]),
      timing: hasAny(text, [/transit|return|ปี\s*2028|จังหวะ|timing/i]),
    },
    vedic: {
      owner: hasAny(text, [/Lagna|Moon|ลัคนา|จันทร์/i]),
      cash: hasAny(text, [/2nd|11th|debt[-\s]?service|installment|ค่างวด|เงินสด|ดอกเบี้ย/i]),
      debtHouse: hasAny(text, [/6th|debt|creditor|repayment|หนี้|เจ้าหนี้/i]),
      hiddenDebt: hasAny(text, [/8th|refinance|shared\s*liability|hidden\s*debt|รีไฟแนนซ์/i]),
      collateral: hasAny(text, [/4th|collateral|reserve|asset|หลักประกัน|จำนอง/i]),
      creditor: hasAny(text, [/7th|creditor|guarantor|co[-\s]?borrower|เจ้าหนี้|ผู้ค้ำ/i]),
      document: hasAny(text, [/3rd|Mercury|application|credit\s*file|repayment\s*schedule|เอกสาร|ตารางผ่อน/i]),
      risk: hasAny(text, [/12th|Rahu|Ketu|Mars|Saturn|default|penalty|hidden\s*fee|refinance\s*trap|ผิดนัด|ค่าปรับ/i]),
      timing: hasAny(text, [/dasha|gochara|ทศา|โคจร|ปี\s*2028|จังหวะ|timing/i]),
    },
  }[science] || {};
  const anchorCount = Object.values(scienceChecks).filter(Boolean).length;
  const checks = { ...common, ...scienceChecks };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (anchorCount < 6) missing.push("canonPacketAnchors");
  return { ok: missing.length === 0 && text.trim().length >= 700, missing, chars: text.length, excerpt: text.replace(/\s+/g, " ").trim().slice(0, 900) };
}

try {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET missing");
  mkdirSync(REPORT_DIR, { recursive: true });
  const subject = await pickSubject();
  const token = await signSession(subject);
  const headers = { Cookie: `decode_auth=${encodeURIComponent(token)}` };
  const post = await requestJson("POST", `${BASE_URL}/api/sifu/fusion5`, {
    profileIds: [subject.profile_id], sciences, question, lang: "th", threadId: RUN_ID, history: [],
  }, headers);
  if (!post.ok || !post.json?.jobId) throw new Error(`POST failed status=${post.status} body=${JSON.stringify(post.json).slice(0, 600)}`);
  const started = Date.now();
  let poll = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await sleep(5_000);
    poll = await requestJson("GET", `${BASE_URL}/api/sifu/fusion5?jobId=${encodeURIComponent(post.json.jobId)}`, null, headers);
    if (!poll.ok) throw new Error(`POLL failed status=${poll.status} body=${JSON.stringify(poll.json).slice(0, 600)}`);
    if (poll.json?.status && poll.json.status !== "running") break;
  }
  if (!poll?.json || poll.json.status === "running") throw new Error(`job_timeout jobId=${post.json.jobId}`);
  const result = poll.json.result || {};
  const panels = Array.isArray(result?.fusion5?.panels) ? result.fusion5.panels : [];
  const byScience = Object.fromEntries(panels.map((p) => [p.science, p]));
  const evaluations = Object.fromEntries(sciences.map((science) => {
    const panel = byScience[science] || {};
    const ev = panel.ok ? evaluatePanel(science, panel.reply || "") : { ok: false, missing: [`panel_error:${panel.error || "missing"}`], chars: 0, excerpt: "" };
    return [science, { panelOk: panel.ok === true, model: panel.model || null, error: panel.error || null, ...ev }];
  }));
  const pass = sciences.every((science) => evaluations[science]?.ok === true);
  const output = { runId: RUN_ID, baseUrl: BASE_URL, testEmail: TEST_EMAIL, profile: { id: subject.profile_id, label: subject.profile_label }, question, jobId: post.json.jobId, status: poll.json.status, judgeOk: result?.fusion5?.judge?.ok === true, evaluations, pass };
  writeFileSync(REPORT_PATH, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ runId: RUN_ID, pass, status: poll.json.status, jobId: post.json.jobId, reportPath: REPORT_PATH, summary: Object.fromEntries(sciences.map((science) => [science, { ok: evaluations[science].ok, panelOk: evaluations[science].panelOk, missing: evaluations[science].missing, chars: evaluations[science].chars, model: evaluations[science].model }])) }, null, 2));
  process.exit(pass ? 0 : 2);
} finally {
  await pool.end();
}
