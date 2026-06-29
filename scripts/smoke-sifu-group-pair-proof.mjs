import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `group-pair-proof-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const BASE_URL = process.env.SIFU_GROUP_PROOF_BASE_URL || process.env.SIFU_PROOF_BASE_URL || "http://127.0.0.1:3349";
const MODELS = (process.env.SIFU_GROUP_PROOF_MODELS || "claude-max-cli,grok-cli").split(",").map((s) => s.trim()).filter(Boolean);
const REPORT_DIR = "/root/decode-app/reports";
const REPORT_PATH = `${REPORT_DIR}/sifu-group-pair-proof-${RUN_ID}.md`;
const HTTP_TIMEOUT_MS = Math.max(120_000, Number(process.env.SIFU_GROUP_PROOF_HTTP_TIMEOUT_MS || 900_000));

const REQUIRED_PROMPT_MARKERS = [
  "HK_SIFU_PREFLIGHT_V1",
  "HK_CURRENT_LUCK_RESOLVED_V1",
  "HK_QIYUN_LOCK_V1",
  "HK_LUCK_PILLAR_LOCK_V1",
  "HK_YEAR_PILLAR_CALENDAR_LOCK_V1",
  "HK_YEAR_DAYUN_MAP_V2",
  "HK_LICHUN_YEAR_BOUNDARY_LOCK_V1",
  "HK_JIAOYUN_BOUNDARY_LOCK_V1",
  "HK_LIUNIAN_YEAR_DRILLDOWN_V1",
  "HK_QUERY_YEAR_LUCK_LOCK_V1",
  "HK_BAZI_TIMING_LOCK_V1",
  "HK_BAZI_READ_ORDER_LOCK_V1",
  "HK_MONTH_PILLAR_SCENARIO_LOCK_V1",
  "HK_MONTHLY_DRILLDOWN_SCOPE_V1",
  "HK_SANHE_CANDIDATE_LOCK_V1",
  "HK_TWO_SCENARIOS_V1",
  "HK_SYNASTRY_RESOLVED_V1",
  "HK_SYNASTRY_ACTIVATED",
];
const REQUIRED_PROMPT_CONTENT = [
  "2028/2571",
  "申子辰",
  "寅午戌三合ไฟ",
  "ห้ามอ่านเป็น 寅戌冲",
  "ก่อนพูดวัยจรของปีใด",
  "ก่อน立春",
];

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

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

async function pickNaMuPair() {
  const { rows } = await pool.query(`
    WITH candidates AS (
      SELECT p.org_id,
             array_agg(p.id ORDER BY CASE
               WHEN lower(coalesce(p.name,'') || ' ' || coalesce(p.nickname,'')) LIKE '%na%' THEN 0
               WHEN coalesce(p.name,'') LIKE '%คุณna%' THEN 0
               ELSE 1
             END, p.created_at) AS profile_ids,
             array_agg(coalesce(p.name, p.nickname, p.id::text) ORDER BY CASE
               WHEN lower(coalesce(p.name,'') || ' ' || coalesce(p.nickname,'')) LIKE '%na%' THEN 0
               WHEN coalesce(p.name,'') LIKE '%คุณna%' THEN 0
               ELSE 1
             END, p.created_at) AS names,
             count(*) AS n
      FROM profiles p
      WHERE p.is_archived=false
        AND (
          coalesce(p.name,'') ILIKE '%คุณna%' OR coalesce(p.nickname,'') ILIKE '%คุณna%' OR
          coalesce(p.name,'') ILIKE '%คุณMu%' OR coalesce(p.nickname,'') ILIKE '%คุณMu%' OR
          lower(coalesce(p.name,'') || ' ' || coalesce(p.nickname,'')) LIKE '%na%' OR
          lower(coalesce(p.name,'') || ' ' || coalesce(p.nickname,'')) LIKE '%mu%'
        )
      GROUP BY p.org_id
      HAVING count(*) >= 2
    )
    SELECT c.org_id, c.profile_ids[1:2] AS profile_ids, c.names[1:2] AS names,
           u.id AS user_id, u.email, u.current_org_id
    FROM candidates c
    JOIN org_members om ON om.org_id=c.org_id AND om.status='active'
    JOIN users u ON u.id=om.user_id AND u.current_org_id=c.org_id
    ORDER BY c.n DESC, u.hour_balance DESC NULLS LAST
    LIMIT 1
  `);
  if (rows[0]) return rows[0];

  const fallback = await pool.query(`
    SELECT p.org_id,
           array_agg(p.id ORDER BY (relationship_type IS NULL OR btrim(relationship_type)='') DESC, p.created_at DESC)[1:2] AS profile_ids,
           array_agg(coalesce(p.name, p.nickname, p.id::text) ORDER BY (relationship_type IS NULL OR btrim(relationship_type)='') DESC, p.created_at DESC)[1:2] AS names,
           u.id AS user_id, u.email, u.current_org_id
    FROM profiles p
    JOIN org_members om ON om.org_id=p.org_id AND om.status='active'
    JOIN users u ON u.id=om.user_id AND u.current_org_id=p.org_id
    WHERE p.is_archived=false
    GROUP BY p.org_id, u.id, u.email, u.current_org_id
    HAVING count(*) >= 2
    ORDER BY u.hour_balance DESC NULLS LAST
    LIMIT 1
  `);
  if (!fallback.rows[0]) throw new Error("No org with at least two active profiles");
  return fallback.rows[0];
}

async function signSession(row) {
  return new SignJWT({ userId: row.user_id, email: row.email, orgId: row.org_id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

async function rowFor(threadId, model) {
  for (let i = 0; i < 60; i++) {
    const { rows } = await pool.query(`
      SELECT id, created_at::text AS created_at, model, status, error,
             packet_hash, prompt_hash, context_hash, audit_quality,
             request_payload, response_meta, profile_snapshot, pillars_snapshot,
             history_profile_ids, profile_binding_status
      FROM research_ai_messages
      WHERE thread_id=$1 AND model=$2 AND feature='sifu_group'
      ORDER BY created_at DESC
      LIMIT 1
    `, [threadId, model]);
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function promptPathFor(row, model) {
  return `/tmp/sifu_group_prompt_${model}_${String(row.prompt_hash || "").slice(0, 8)}.txt`;
}

function inspectPrompt(row, model) {
  const path = promptPathFor(row, model);
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, "utf8") : "";
  const embedded = row.request_payload?.prompt_proof && typeof row.request_payload.prompt_proof === "object"
    ? row.request_payload.prompt_proof
    : null;
  const proofText = embedded ? JSON.stringify(embedded) : text;
  const rawMarkers = embedded?.markers || {};
  const rawContent = embedded?.content || {};
  const markers = Object.fromEntries(REQUIRED_PROMPT_MARKERS.map((m) => [m, Boolean(rawMarkers[m] ?? text.includes(m))]));
  const content = Object.fromEntries(REQUIRED_PROMPT_CONTENT.map((m) => [m, Boolean(rawContent[m] ?? text.includes(m))]));
  const hasFullMonthly = proofText.includes("เดือนจร=") && proofText.includes("เดือนจรใช้節氣หลักจริง");
  const hasValid3pMonthlyLimit =
    proofText.includes("ไม่มีเดือนจรเต็ม; ถ้าเป็น 3p") ||
    (proofText.includes("3p ไม่มีเสายาม") && proofText.includes("รายเดือนเต็มมีเฉพาะเมื่อ transitDrilldown.currentDecade ถูกแนบ"));
  const monthlyStatus = hasFullMonthly ? "full_monthly" : hasValid3pMonthlyLimit ? "valid_3p_limited" : "missing";
  const hasAllMarkers = Object.values(markers).every(Boolean);
  const hasAllContent = Object.values(content).every(Boolean) && monthlyStatus !== "missing";
  return {
    path,
    exists,
    source: embedded ? "db_prompt_proof" : exists ? "dump_file" : "missing",
    chars: embedded?.chars || text.length,
    markers,
    content,
    monthlyStatus,
    hasAllMarkers,
    hasAllContent,
    exactlyTwoProfilesInPrompt: embedded ? embedded.profile_sections === 2 : (text.match(/━━━ คนที่ /g) || []).length === 2,
    noMonthlyOmission: embedded
      ? !proofText.includes("ไม่ได้แนบชุดปีจร/เดือนจร")
      : !text.includes("includeTransitDrilldown=false") && !text.includes("ไม่ได้แนบชุดปีจร/เดือนจร"),
  };
}

function rowOk(row, promptProof) {
  return !!row &&
    row.audit_quality === "group_packet_hash_v1" &&
    row.request_payload?.count === 2 &&
    Array.isArray(row.request_payload?.profileIds) && row.request_payload.profileIds.length === 2 &&
    Array.isArray(row.profile_snapshot) && row.profile_snapshot.length === 2 &&
    Array.isArray(row.pillars_snapshot) && row.pillars_snapshot.length === 2 &&
    !!row.packet_hash && !!row.prompt_hash && !!row.context_hash &&
    ["db_prompt_proof", "dump_file"].includes(promptProof.source) &&
    promptProof.hasAllMarkers &&
    promptProof.hasAllContent &&
    promptProof.exactlyTwoProfilesInPrompt &&
    promptProof.noMonthlyOmission;
}

function md(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

const pair = await pickNaMuPair();
const token = await signSession(pair);
const threadId = RUN_ID;
const results = [];

for (const model of MODELS) {
  const response = await postJson(`${BASE_URL}/api/sifu/group?model=${encodeURIComponent(model)}`, {
    profileIds: pair.profile_ids,
    groupLabel: `proof pair ${RUN_ID}: ${pair.names.join(" + ")}`,
    message: `Smoke proof ${RUN_ID}: ตอบสั้น 5 บรรทัด ยืนยันว่าคุณได้รับ HK_YEAR_PILLAR_CALENDAR_LOCK_V1, HK_QUERY_YEAR_LUCK_LOCK_V1, HK_SANHE_CANDIDATE_LOCK_V1 และ synastry resolved ห้ามอ่าน 寅戌冲`,
    history: [],
    threadId,
    lang: "th",
    model,
    stream: false,
  }, { Cookie: `decode_auth=${token}` });
  let data = {};
  try { data = response.text ? JSON.parse(response.text) : {}; } catch { data = { error: response.text.slice(0, 300) }; }
  const row = await rowFor(threadId, model);
  const promptProof = row ? inspectPrompt(row, model) : null;
  results.push({
    model,
    http_status: response.status,
    http_ok: response.ok,
    response_error: data.error || null,
    response_chars: typeof data.reply === "string" ? data.reply.length : 0,
    row_found: !!row,
    row,
    promptProof,
    ok: response.ok && rowOk(row, promptProof || {}),
  });
}

mkdirSync(REPORT_DIR, { recursive: true });
const pass = results.every((r) => r.ok);
const lines = [
  `# Sifu Group Pair Proof ${RUN_ID}`,
  "",
  `- base_url: ${BASE_URL}`,
  `- pair: ${pair.names.join(" + ")}`,
  `- profile_ids: ${pair.profile_ids.join(", ")}`,
  `- models: ${MODELS.join(", ")}`,
  `- overall: ${pass ? "PASS" : "FAIL"}`,
  "",
  "## Model Results",
  "| model | http | row | profiles | proof_source | prompt_dump | chars | markers | content | monthly | exact_pair | no_omission | ok | error |",
  "|---|---:|---|---:|---|---|---:|---|---|---|---|---|---|---|",
  ...results.map((r) => `| ${md(r.model)} | ${r.http_status} | ${r.row_found ? "yes" : "no"} | ${r.row?.profile_snapshot?.length ?? 0} | ${md(r.promptProof?.source || "missing")} | ${r.promptProof?.exists ? md(r.promptProof.path) : "missing"} | ${r.promptProof?.chars || 0} | ${r.promptProof?.hasAllMarkers ? "yes" : "no"} | ${r.promptProof?.hasAllContent ? "yes" : "no"} | ${md(r.promptProof?.monthlyStatus || "missing")} | ${r.promptProof?.exactlyTwoProfilesInPrompt ? "yes" : "no"} | ${r.promptProof?.noMonthlyOmission ? "yes" : "no"} | ${r.ok ? "PASS" : "FAIL"} | ${md(r.response_error || r.row?.error || "")} |`),
  "",
  "## Required Markers",
  REQUIRED_PROMPT_MARKERS.map((m) => `- ${m}`).join("\n"),
  "",
  "## Required Content",
  REQUIRED_PROMPT_CONTENT.map((m) => `- ${m}`).join("\n"),
];
writeFileSync(REPORT_PATH, lines.join("\n"));
console.log(JSON.stringify({
  run_id: RUN_ID,
  report: REPORT_PATH,
  pass,
  results: results.map((r) => ({
    model: r.model,
    http_status: r.http_status,
    ok: r.ok,
    prompt_source: r.promptProof?.source,
    prompt_path: r.promptProof?.path,
    prompt_chars: r.promptProof?.chars,
    monthly_status: r.promptProof?.monthlyStatus,
    markers_ok: r.promptProof?.hasAllMarkers,
    content_ok: r.promptProof?.hasAllContent,
    response_error: r.response_error,
  })),
}, null, 2));
await pool.end();
process.exit(pass ? 0 : 1);
