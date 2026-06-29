import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `liunian-proof-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const BASE_URL = process.env.SIFU_PROOF_BASE_URL || process.env.FUSION_BASE_URL || "http://127.0.0.1:3349";
const REPORT_DIR = "/root/decode-app/reports";
const REPORT_PATH = `${REPORT_DIR}/sifu-liunian-proof-${RUN_ID}.md`;
const RESULT_PATH = `/tmp/sifu-liunian-proof-${RUN_ID}.json`;
const MASTER_MODELS = (process.env.SIFU_PROOF_MASTER_MODELS || "claude-max-cli,codex-cli,grok-cli")
  .split(",").map((s) => s.trim()).filter(Boolean);
const FUSION_MODELS = (process.env.SIFU_PROOF_FUSION_MODELS || "codex-cli,grok-cli,gemini-api")
  .split(",").map((s) => s.trim()).filter(Boolean);
const SKIP_MASTER = process.env.SIFU_PROOF_SKIP_MASTER === "1";
const SKIP_FUSION = process.env.SIFU_PROOF_SKIP_FUSION === "1";
const HTTP_TIMEOUT_MS = Math.max(60_000, Number(process.env.SIFU_PROOF_HTTP_TIMEOUT_MS || 1_200_000));
const MARKER = "HK_LIUNIAN_YEAR_DRILLDOWN_V1";
const REQUIRED_MARKERS = (process.env.SIFU_PROOF_REQUIRED_MARKERS || [
  "HK_LIUNIAN_YEAR_DRILLDOWN_V1",
  "HK_LUCK_PILLAR_LOCK_V1",
  "HK_QUERY_YEAR_LUCK_LOCK_V1",
  "HK_YEAR_DAYUN_MAP_V2",
  "HK_YEAR_PILLAR_CALENDAR_LOCK_V1",
  "HK_LICHUN_YEAR_BOUNDARY_LOCK_V1",
  "HK_JIAOYUN_BOUNDARY_LOCK_V1",
  "HK_SIFU_PREFLIGHT_V1",
  "HK_BAZI_TIMING_LOCK_V1",
  "HK_BAZI_READ_ORDER_LOCK_V1",
  "HK_CURRENT_LUCK_RESOLVED_V1",
  "HK_QIYUN_LOCK_V1",
  "HK_MONTH_PILLAR_SCENARIO_LOCK_V1",
  "HK_MONTHLY_DRILLDOWN_SCOPE_V1",
  "HK_SANHE_CANDIDATE_LOCK_V1",
  "HK_TWO_SCENARIOS_V1",
  "HK_SYNASTRY_RESOLVED_V1",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const REQUIRED_CONTENT = (process.env.SIFU_PROOF_REQUIRED_CONTENT || [
  "2028/2571",
  "申子辰",
  "ก่อนพูดวัยจรของปีใด",
  "ก่อน立春",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

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
      res.on("end", () => resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, text }));
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

async function pickSubject() {
  const { rows } = await pool.query(`
    SELECT u.id AS user_id, u.email, u.current_org_id AS org_id, u.hour_balance, u.tier
    FROM users u
    JOIN org_members om ON om.org_id = u.current_org_id AND om.user_id = u.id AND om.status = $$active$$
    JOIN profiles p ON p.org_id = u.current_org_id AND p.is_archived = false
    WHERE (om.role IN ($$owner$$,$$admin$$) OR lower(coalesce(u.tier,$$$$)) IN ($$master$$,$$premium$$))
    GROUP BY u.id, u.email, u.current_org_id, u.hour_balance, u.tier
    ORDER BY u.hour_balance DESC NULLS LAST
    LIMIT 1
  `);
  if (!rows[0]) throw new Error("No user with active org/profile for proof");
  return rows[0];
}

async function pickProfile(orgId) {
  const { rows } = await pool.query(`
    SELECT id, name, nickname, day_master, birth_time_known
    FROM profiles
    WHERE org_id=$1 AND is_archived=false
    ORDER BY
      CASE WHEN lower(coalesce(name,$$$$) || $$ $$ || coalesce(nickname,$$$$)) LIKE $$%swit%$$ THEN 0 ELSE 1 END,
      CASE WHEN day_master=$$壬$$ THEN 0 ELSE 1 END,
      CASE WHEN birth_time_known IS true THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST,
      created_at DESC
    LIMIT 1
  `, [orgId]);
  if (!rows[0]) throw new Error("No profile for proof");
  return rows[0];
}

async function rowsFor(threadId, profileId, expectedMin) {
  for (let i = 0; i < 30; i++) {
    const { rows } = await pool.query(`
      SELECT id, created_at::text AS created_at, model, question, cached,
             packet_hash, prompt_hash, fact_lock, pillar_lock,
             audit_quality, identity_check_result, packet_snapshot_safe, response_meta, error
      FROM research_ai_messages
      WHERE thread_id=$1 AND profile_id=$2::uuid AND feature=$$sifu_master$$
      ORDER BY created_at ASC
    `, [threadId, profileId]);
    if (rows.length >= expectedMin) return rows;
    await sleep(500);
  }
  const { rows } = await pool.query(`
    SELECT id, created_at::text AS created_at, model, question, cached,
           packet_hash, prompt_hash, fact_lock, pillar_lock,
           audit_quality, identity_check_result, packet_snapshot_safe, response_meta, error
    FROM research_ai_messages
    WHERE thread_id=$1 AND profile_id=$2::uuid AND feature=$$sifu_master$$
    ORDER BY created_at ASC
  `, [threadId, profileId]);
  return rows;
}

function hasMarker(row) {
  const text = JSON.stringify(row.packet_snapshot_safe || {});
  return REQUIRED_MARKERS.every((marker) => text.includes(marker));
}

function hasRequiredContent(row) {
  const text = JSON.stringify(row.packet_snapshot_safe || {});
  return REQUIRED_CONTENT.every((needle) => text.includes(needle));
}

function rowOk(row, expectIdentity = "pass") {
  return !!row &&
    row.cached === false &&
    !!row.packet_hash &&
    !!row.prompt_hash &&
    !!row.fact_lock &&
    !!row.pillar_lock &&
    row.audit_quality === "packet_evidence" &&
    (expectIdentity === "any" || row.identity_check_result === expectIdentity) &&
    hasMarker(row) &&
    hasRequiredContent(row);
}

function md(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

async function runMaster(token, profile) {
  const threadId = `${RUN_ID}-master`;
  const results = [];
  for (const model of MASTER_MODELS) {
    const response = await postJson(`${BASE_URL}/api/sifu`, {
      profileId: profile.id,
      topic: "liunian_proof",
      lang: "th",
      threadId,
      history: [],
      message: `Master LiuNian proof ${RUN_ID}: อ่านปี 2027 และ 2028 โดยใช้ HK_LIUNIAN_YEAR_DRILLDOWN_V1 จาก packet เท่านั้น`,
      noCache: true,
      model,
    }, { Cookie: `decode_auth=${token}` });
    let data = {};
    try { data = response.text ? JSON.parse(response.text) : {}; } catch { data = { error: response.text.slice(0, 300) }; }
    results.push({ model, status: response.status, ok: response.ok, error: data.error || null, chars: typeof data.reply === "string" ? data.reply.length : 0 });
  }
  const rows = await rowsFor(threadId, profile.id, MASTER_MODELS.length);
  const proof = MASTER_MODELS.map((model) => {
    const row = rows.find((r) => r.model === model && !String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
    return {
      model,
      row_found: !!row,
      cached: row?.cached ?? null,
      packet_hash: row?.packet_hash || null,
      prompt_hash: row?.prompt_hash || null,
      audit_quality: row?.audit_quality || null,
      identity_check_result: row?.identity_check_result || null,
      marker: row ? hasMarker(row) : false,
      content: row ? hasRequiredContent(row) : false,
      ok: rowOk(row),
    };
  });
  return { threadId, results, proof, pass: proof.every((p) => p.ok) && results.every((r) => r.ok) };
}

async function runFusion(token, profile) {
  const threadId = `${RUN_ID}-fusion`;
  const response = await postJson(`${BASE_URL}/api/sifu/fusion`, {
    profileId: profile.id,
    topic: "liunian_proof",
    lang: "th",
    threadId,
    history: [],
    message: `Fusion LiuNian proof ${RUN_ID}: ให้ทุก panel อ่านปี 2027 และ 2028 จาก HK_LIUNIAN_YEAR_DRILLDOWN_V1 แล้วให้ judge สรุป`,
    noCache: true,
    fusionMode: "strict",
    panelModels: FUSION_MODELS,
  }, { Cookie: `decode_auth=${token}` });
  let data = {};
  try { data = response.text ? JSON.parse(response.text) : {}; } catch { data = { error: response.text.slice(0, 300) }; }
  const expectedRows = FUSION_MODELS.length + 1;
  const rows = await rowsFor(threadId, profile.id, expectedRows);
  const panelProof = FUSION_MODELS.map((model) => {
    const row = rows.find((r) => r.model === model && !String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
    return {
      model,
      role: "panel",
      row_found: !!row,
      cached: row?.cached ?? null,
      packet_hash: row?.packet_hash || null,
      prompt_hash: row?.prompt_hash || null,
      audit_quality: row?.audit_quality || null,
      identity_check_result: row?.identity_check_result || null,
      marker: row ? hasMarker(row) : false,
      content: row ? hasRequiredContent(row) : false,
      ok: rowOk(row, "any"),
    };
  });
  const judgeRow = rows.find((r) => String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
  const judgeProof = {
    model: judgeRow?.model || null,
    role: "judge",
    row_found: !!judgeRow,
    cached: judgeRow?.cached ?? null,
    packet_hash: judgeRow?.packet_hash || null,
    prompt_hash: judgeRow?.prompt_hash || null,
    audit_quality: judgeRow?.audit_quality || null,
    identity_check_result: judgeRow?.identity_check_result || null,
    marker: judgeRow ? hasMarker(judgeRow) : false,
    content: judgeRow ? hasRequiredContent(judgeRow) : false,
    ok: rowOk(judgeRow, "any"),
  };
  const packetHashes = Array.from(new Set([...panelProof, judgeProof].map((p) => p.packet_hash).filter(Boolean)));
  return {
    threadId,
    status: response.status,
    ok: response.ok,
    error: data.error || null,
    fusion: data.fusion || null,
    panelProof,
    judgeProof,
    same_packet_hash: packetHashes.length === 1,
    pass: response.ok && panelProof.every((p) => p.ok) && judgeProof.ok && packetHashes.length === 1,
  };
}

try {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET missing");
  mkdirSync(REPORT_DIR, { recursive: true });
  const subject = await pickSubject();
  const profile = await pickProfile(subject.org_id);
  const token = await signSession(subject);
  const master = SKIP_MASTER
    ? { threadId: `${RUN_ID}-master`, results: [], proof: [], pass: true, skipped: true }
    : await runMaster(token, profile);
  const fusion = SKIP_FUSION
    ? { threadId: `${RUN_ID}-fusion`, status: 0, ok: true, error: null, fusion: null, panelProof: [], judgeProof: null, same_packet_hash: true, pass: true, skipped: true }
    : await runFusion(token, profile);
  const result = {
    run_id: RUN_ID,
    base_url: BASE_URL,
    profile: {
      id: profile.id,
      label: profile.nickname || profile.name || profile.id,
      day_master: profile.day_master || null,
      birth_time_known: profile.birth_time_known,
    },
    marker: MARKER,
    required_markers: REQUIRED_MARKERS,
    required_content: REQUIRED_CONTENT,
    master,
    fusion,
    pass: master.pass && fusion.pass,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
  const rows = [
    `# Sifu LiuNian Proof ${RUN_ID}`,
    "",
    `- Base URL: \`${BASE_URL}\``,
    `- Profile: \`${profile.id}\` ${md(profile.nickname || profile.name || "")}`,
    `- Marker: \`${MARKER}\``,
    `- Required markers: ${REQUIRED_MARKERS.map((m) => `\`${m}\``).join(", ")}`,
    `- Required content proof: ${REQUIRED_CONTENT.map((m) => `\`${m}\``).join(", ")}`,
    `- Overall: **${result.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Master",
    "",
    ...(master.skipped ? [
      "_Skipped by `SIFU_PROOF_SKIP_MASTER=1`._",
    ] : [
      "| Model | HTTP | Row | Cached | Packet | Prompt | Marker | Content | Audit | Identity | PASS |",
      "|---|---:|---|---|---|---|---|---|---|---|---|",
      ...master.proof.map((p) => {
        const http = master.results.find((r) => r.model === p.model);
        return `| ${p.model} | ${http?.status ?? "-"} | ${p.row_found ? "yes" : "no"} | ${p.cached} | ${p.packet_hash ? p.packet_hash.slice(0, 10) : "-"} | ${p.prompt_hash ? p.prompt_hash.slice(0, 10) : "-"} | ${p.marker ? "yes" : "no"} | ${p.content ? "yes" : "no"} | ${p.audit_quality || "-"} | ${p.identity_check_result || "-"} | ${p.ok ? "PASS" : "FAIL"} |`;
      }),
    ]),
    "",
    "## Fusion",
    "",
    ...(fusion.skipped ? [
      "_Skipped by `SIFU_PROOF_SKIP_FUSION=1`._",
    ] : [
      `- HTTP: ${fusion.status}`,
      `- same_packet_hash: ${fusion.same_packet_hash}`,
      "",
      "| Role | Model | Row | Cached | Packet | Prompt | Marker | Content | Audit | Identity | PASS |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
      ...fusion.panelProof.map((p) => `| ${p.role} | ${p.model} | ${p.row_found ? "yes" : "no"} | ${p.cached} | ${p.packet_hash ? p.packet_hash.slice(0, 10) : "-"} | ${p.prompt_hash ? p.prompt_hash.slice(0, 10) : "-"} | ${p.marker ? "yes" : "no"} | ${p.content ? "yes" : "no"} | ${p.audit_quality || "-"} | ${p.identity_check_result || "-"} | ${p.ok ? "PASS" : "FAIL"} |`),
      `| ${fusion.judgeProof.role} | ${fusion.judgeProof.model || "-"} | ${fusion.judgeProof.row_found ? "yes" : "no"} | ${fusion.judgeProof.cached} | ${fusion.judgeProof.packet_hash ? fusion.judgeProof.packet_hash.slice(0, 10) : "-"} | ${fusion.judgeProof.prompt_hash ? fusion.judgeProof.prompt_hash.slice(0, 10) : "-"} | ${fusion.judgeProof.marker ? "yes" : "no"} | ${fusion.judgeProof.content ? "yes" : "no"} | ${fusion.judgeProof.audit_quality || "-"} | ${fusion.judgeProof.identity_check_result || "-"} | ${fusion.judgeProof.ok ? "PASS" : "FAIL"} |`,
    ]),
    "",
    `Result JSON: \`${RESULT_PATH}\``,
  ];
  writeFileSync(REPORT_PATH, `${rows.join("\n")}\n`);
  console.log(`report=${REPORT_PATH}`);
  console.log(`result=${RESULT_PATH}`);
  console.log(result.pass ? "PASS" : "FAIL");
  process.exit(result.pass ? 0 : 1);
} finally {
  await pool.end().catch(() => {});
}
