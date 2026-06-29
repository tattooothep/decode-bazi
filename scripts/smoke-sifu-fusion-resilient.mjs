import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `resilient-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const BASE_URL = process.env.FUSION_BASE_URL || "http://127.0.0.1:3349";
const RESULT_PATH = `/tmp/sifu-fusion-resilient-smoke-${RUN_ID}.json`;
const REPORT_PATH = `/root/decode-app/reports/sifu-fusion-resilient-smoke-${RUN_ID}.md`;
const HTTP_TIMEOUT_MS = Math.max(60_000, Number(process.env.FUSION_SMOKE_HTTP_TIMEOUT_MS || 900_000));
const PANEL_MODELS = String(process.env.FUSION_SMOKE_PANEL_MODELS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const OMIT_MODE = process.env.FUSION_SMOKE_OMIT_MODE === "1";

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

function md(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function postJson(url, payload, headers = {}) {
  const body = JSON.stringify(payload);
  const target = new URL(url);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
      timeout: HTTP_TIMEOUT_MS,
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode || 0, text }));
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => req.destroy(new Error(`http_timeout_${HTTP_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.write(body);
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

async function pickSubjectAndProfile() {
  const { rows } = await pool.query(`
    SELECT u.id AS user_id, u.email, u.current_org_id AS org_id, u.tier, u.hour_balance,
           om.role AS org_role, p.id AS profile_id, p.nickname, p.name, p.day_master
    FROM users u
    JOIN org_members om ON om.org_id = u.current_org_id AND om.user_id = u.id AND om.status = $$active$$
    JOIN profiles p ON p.org_id = u.current_org_id AND p.is_archived = false
    WHERE (om.role IN ($$owner$$,$$admin$$) OR lower(coalesce(u.tier,$$$$)) IN ($$master$$,$$premium$$))
    ORDER BY CASE WHEN om.role = $$owner$$ THEN 0 WHEN om.role = $$admin$$ THEN 1 ELSE 2 END,
             u.hour_balance DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  `);
  if (!rows[0]) throw new Error("No smoke subject/profile found");
  return rows[0];
}

function buildReport(output) {
  const f = output.response.fusion || {};
  const panel = Array.isArray(f.panel) ? f.panel : [];
  const lines = [];
  lines.push("# Sifu Fusion Resilient Smoke");
  lines.push("");
  lines.push(`- Run ID: \`${output.runId}\``);
  lines.push(`- Base URL: \`${BASE_URL}\``);
  lines.push(`- Panel override: \`${PANEL_MODELS.length ? PANEL_MODELS.join(",") : "-"}\``);
  lines.push(`- Omit mode: \`${OMIT_MODE}\``);
  lines.push(`- HTTP: \`${output.response.status}\``);
  lines.push(`- Pass: \`${output.pass}\``);
  lines.push(`- Subject: \`${output.subject.email}\``);
  lines.push(`- Profile: \`${output.subject.profileLabel}\` · day_master=\`${output.subject.dayMaster || "-"}\``);
  lines.push(`- Mode: \`${f.mode || "-"}\``);
  lines.push(`- Reason: \`${f.reason || "-"}\``);
  lines.push(`- AI answered: \`${f.ai_answered_count ?? "-"} / ${f.ai_requested_count ?? "-"}\``);
  lines.push(`- Judge: \`${f.judge?.model || f.judge_model || "-"}\` · ok=\`${f.judge?.ok ?? null}\``);
  lines.push(`- Used panel fallback: \`${f.used_panel_fallback ?? false}\``);
  lines.push("");
  lines.push("| Model | provider model | ok | error | ms | attempts | chars |");
  lines.push("|---|---|---|---|---:|---:|---:|");
  for (const p of panel) {
    lines.push(`| \`${p.model}\` | \`${md(p.provider_model || "-")}\` | \`${p.ok}\` | \`${md(p.error || "-")}\` | ${p.ms || 0} | ${p.attempts ?? ""} | ${p.chars || 0} |`);
  }
  lines.push("");
  lines.push("## Reply Excerpt");
  lines.push("");
  lines.push(md(output.response.reply || "-").slice(0, 1200));
  return lines.join("\n");
}

try {
  mkdirSync("/root/decode-app/reports", { recursive: true });
  const subject = await pickSubjectAndProfile();
  const token = await signSession(subject);
  const payload = {
    profileId: subject.profile_id,
    topic: "audit_resilient",
    lang: "th",
    threadId: RUN_ID,
    threadProfileId: subject.profile_id,
    history: [],
    noCache: true,
    message: `Resilient smoke ${RUN_ID}: อ่านภาพรวมปี 2026 แบบสั้น กระชับ พร้อมบอกงาน เงิน สุขภาพ และข้อควรระวัง`,
  };
  if (!OMIT_MODE) payload.fusionMode = "resilient";
  if (PANEL_MODELS.length) payload.models = PANEL_MODELS;
  const raw = await postJson(`${BASE_URL}/api/sifu/fusion`, payload, { Cookie: `decode_auth=${token}` });
  let data = {};
  try { data = raw.text ? JSON.parse(raw.text) : {}; } catch { data = { raw: raw.text.slice(0, 1000) }; }
  const output = {
    runId: RUN_ID,
    reportPath: REPORT_PATH,
    resultPath: RESULT_PATH,
    subject: {
      email: subject.email,
      tier: subject.tier,
      orgRole: subject.org_role,
      profileId: subject.profile_id,
      profileLabel: subject.nickname || subject.name || subject.profile_id,
      dayMaster: subject.day_master,
    },
    request: payload,
    response: {
      status: raw.status,
      reply: data.reply || "",
      fusion: data.fusion || null,
      error: data.error || null,
    },
    pass: raw.status === 200 &&
      typeof data.reply === "string" &&
      data.reply.trim().length > 0 &&
      data.fusion?.mode === "resilient" &&
      Number.isFinite(data.fusion?.ai_answered_count) &&
      Number.isFinite(data.fusion?.ai_requested_count),
  };
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
  writeFileSync(REPORT_PATH, buildReport(output));
  console.log(JSON.stringify({
    runId: RUN_ID,
    pass: output.pass,
    status: raw.status,
    reportPath: REPORT_PATH,
    resultPath: RESULT_PATH,
    aiAnswered: data.fusion?.ai_answered_count,
    aiRequested: data.fusion?.ai_requested_count,
    reason: data.fusion?.reason || data.error || null,
  }, null, 2));
  process.exit(output.pass ? 0 : 2);
} finally {
  await pool.end();
}
