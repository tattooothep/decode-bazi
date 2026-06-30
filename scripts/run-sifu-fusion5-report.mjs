import { mkdirSync, writeFileSync } from "fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import nextEnv from "@next/env";
import { SignJWT } from "jose";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const RUN_ID = `fusion5-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const REPORT_DIR = "/root/decode-app/reports";
const REPORT_PATH = `${REPORT_DIR}/sifu-fusion-5-profile-report-${RUN_ID}.md`;
const RESULT_PATH = `/tmp/sifu-fusion-5-profile-result-${RUN_ID}.json`;
const BASE_URL = process.env.FUSION_BASE_URL || "http://127.0.0.1:3349";
const REQUIRED_MODELS = Array.from(new Set((process.env.FUSION5_REQUIRED_MODELS || "codex-cli,grok-cli,gemini-api")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean)));
const REQUIRED_MODEL_SET = new Set(REQUIRED_MODELS);
const CONTINUE_ON_FAIL = process.env.FUSION5_CONTINUE_ON_FAIL === "1";
const HTTP_TIMEOUT_MS = Math.max(60_000, Number(process.env.FUSION5_HTTP_TIMEOUT_MS || 1_800_000));

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

function excerpt(s, max = 520) {
  const one = String(s || "").replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

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
      res.on("end", () => {
        const status = res.statusCode || 0;
        resolve({ status, ok: status >= 200 && status < 300, text });
      });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`http_timeout_${HTTP_TIMEOUT_MS}ms`));
    });
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
    SELECT u.id AS user_id, u.email, u.current_org_id AS org_id, u.hour_balance, u.tier,
           om.role AS org_role, COUNT(p.id)::int AS profile_count
    FROM users u
    JOIN org_members om ON om.org_id = u.current_org_id AND om.user_id = u.id AND om.status = $$active$$
    JOIN profiles p ON p.org_id = u.current_org_id AND p.is_archived = false
    WHERE (om.role IN ($$owner$$,$$admin$$) OR lower(coalesce(u.tier,$$$$)) = $$master$$)
    GROUP BY u.id, u.email, u.current_org_id, u.hour_balance, u.tier, om.role
    HAVING COUNT(p.id) >= 5
    ORDER BY CASE WHEN om.role = $$owner$$ THEN 0 WHEN om.role = $$admin$$ THEN 1 ELSE 2 END,
             u.hour_balance DESC NULLS LAST, COUNT(p.id) DESC
    LIMIT 1
  `);
  if (!rows[0]) throw new Error("No admin/master subject with at least 5 profiles");
  return rows[0];
}

async function pickProfiles(orgId) {
  const { rows } = await pool.query(`
    SELECT id, name, nickname, day_master, birth_datetime, gender, relationship_type
    FROM profiles
    WHERE org_id=$1 AND is_archived=false
    ORDER BY
      CASE WHEN day_master IS NULL THEN 1 ELSE 0 END,
      created_at DESC
    LIMIT 5
  `, [orgId]);
  if (rows.length < 5) throw new Error(`Need 5 profiles, found ${rows.length}`);
  return rows;
}

async function pollAuditRows(threadId, profileId) {
  for (let i = 0; i < 20; i++) {
    const { rows } = await pool.query(`
      SELECT id, created_at, model, question, answer, cached, prompt_hash, packet_hash,
             fact_lock, pillar_lock, audit_quality, identity_check_result,
             profile_binding_status, response_meta, request_payload, duration_ms
      FROM research_ai_messages
      WHERE thread_id=$1 AND profile_id=$2 AND feature=$$sifu_master$$
      ORDER BY created_at ASC
    `, [threadId, profileId]);
    const panelRows = rows.filter((r) => !String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
    const judgeRows = rows.filter((r) => String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
    if (panelRows.length >= REQUIRED_MODELS.length && judgeRows.length >= 1) return rows;
    await sleep(500);
  }
  const { rows } = await pool.query(`
    SELECT id, created_at, model, question, answer, cached, prompt_hash, packet_hash,
           fact_lock, pillar_lock, audit_quality, identity_check_result,
           profile_binding_status, response_meta, request_payload, duration_ms
    FROM research_ai_messages
    WHERE thread_id=$1 AND profile_id=$2 AND feature=$$sifu_master$$
    ORDER BY created_at ASC
  `, [threadId, profileId]);
  return rows;
}

function proofForRows(rows) {
  const panelRows = rows.filter((r) => !String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
  const judgeRows = rows.filter((r) => String(r.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
  const packetHashes = Array.from(new Set(rows.map((r) => r.packet_hash).filter(Boolean)));
  const dbPanelModels = Array.from(new Set(panelRows.map((r) => String(r.model || "")).filter(Boolean)));
  const missingPanelModels = REQUIRED_MODELS.filter((model) => !dbPanelModels.includes(model));
  const unexpectedPanelModels = dbPanelModels.filter((model) => !REQUIRED_MODEL_SET.has(model));
  const byModel = Object.fromEntries(panelRows.map((r) => [r.model, r]));
  const panelProof = REQUIRED_MODELS.map((model) => {
    const r = byModel[model];
    return {
      model,
      rowFound: !!r,
      cached: r?.cached ?? null,
      promptHash: r?.prompt_hash || null,
      packetHash: r?.packet_hash || null,
      factLock: r?.fact_lock || null,
      pillarLock: r?.pillar_lock || null,
      auditQuality: r?.audit_quality || null,
      identityCheck: r?.identity_check_result || null,
      answerExcerpt: excerpt(r?.answer, 900),
      ok: !!r && r.cached === false && !!r.prompt_hash && !!r.packet_hash && !!r.fact_lock && !!r.pillar_lock && r.audit_quality === "packet_evidence" && r.identity_check_result === "pass",
    };
  });
  const judge = judgeRows[judgeRows.length - 1] || null;
  return {
    rows: rows.length,
    panelRows: panelRows.length,
    judgeRows: judgeRows.length,
    packetHashes,
    samePacketHash: packetHashes.length === 1,
    dbPanelModels,
    missingPanelModels,
    unexpectedPanelModels,
    exactPanelModelSet: missingPanelModels.length === 0 && unexpectedPanelModels.length === 0,
    panelProof,
    judgeProof: judge ? {
      model: judge.model,
      cached: judge.cached,
      promptHash: judge.prompt_hash || null,
      packetHash: judge.packet_hash || null,
      factLock: judge.fact_lock || null,
      pillarLock: judge.pillar_lock || null,
      auditQuality: judge.audit_quality || null,
      identityCheck: judge.identity_check_result || null,
      answerExcerpt: excerpt(judge.answer, 1_000),
      ok: judge.cached === false && !!judge.prompt_hash && !!judge.packet_hash && !!judge.fact_lock && !!judge.pillar_lock && judge.audit_quality === "packet_evidence" && judge.identity_check_result === "pass",
    } : null,
  };
}

async function runLoop(subject, token, profile, index) {
  const threadId = `${RUN_ID}-loop-${index}`;
  const question = `Fusion audit loop ${index}/5 (${RUN_ID}): อ่านดวงจริงจาก engine prompt packet สำหรับปี 2026 โดยเน้นงาน เงิน สุขภาพ และจุดตัดสินใจสำคัญ ตอบให้ชัดว่าควรเดินหน้าหรือประคองตัวพร้อมเหตุผลจากผังดวง`;
  console.log(`[${new Date().toISOString()}] loop ${index}/5 start profile=${profile.id}`);
  const started = Date.now();
  let response;
  try {
    response = await postJson(`${BASE_URL}/api/sifu/fusion`, {
      profileId: profile.id,
      topic: "audit_2026",
      lang: "th",
      threadId,
      history: [],
      message: question,
      noCache: true,
      fusionMode: "strict",
      models: REQUIRED_MODELS,
    }, { Cookie: `decode_auth=${token}` });
  } catch (e) {
    const auditRows = await pollAuditRows(threadId, profile.id);
    const proof = proofForRows(auditRows);
    const result = {
      index,
      threadId,
      profile: {
        id: profile.id,
        label: profile.nickname || profile.name || `profile-${index}`,
        dayMaster: profile.day_master || null,
        gender: profile.gender || null,
        relationship: profile.relationship_type || null,
      },
      httpStatus: 0,
      ok: false,
      error: e?.message || "http_request_failed",
      ms: Date.now() - started,
      fusion: {
        model: "fusion-api",
        degraded: true,
        reason: "runner_http_failed",
        spent: 0,
        balanceAfter: null,
        ms: Date.now() - started,
        finalExcerpt: "",
        panel: [],
        judge: null,
      },
      proof,
      pass: false,
    };
    console.log(`[${new Date().toISOString()}] loop ${index}/5 done status=0 pass=false error=${result.error}`);
    return result;
  }
  const text = response.text;
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 800) }; }
  const auditRows = await pollAuditRows(threadId, profile.id);
  const proof = proofForRows(auditRows);
  const panel = Array.isArray(data?.fusion?.panel) ? data.fusion.panel : [];
  const responsePanelModels = Array.from(new Set(panel.map((p) => String(p.model || "")).filter(Boolean)));
  const missingResponsePanelModels = REQUIRED_MODELS.filter((model) => !responsePanelModels.includes(model));
  const unexpectedResponsePanelModels = responsePanelModels.filter((model) => !REQUIRED_MODEL_SET.has(model));
  const exactResponsePanelModels = panel.length === REQUIRED_MODELS.length
    && missingResponsePanelModels.length === 0
    && unexpectedResponsePanelModels.length === 0;
  const proofAnswerByModel = Object.fromEntries(proof.panelProof.map((p) => [p.model, p.answerExcerpt || ""]));
  const result = {
    index,
    threadId,
    profile: {
      id: profile.id,
      label: profile.nickname || profile.name || `profile-${index}`,
      dayMaster: profile.day_master || null,
      gender: profile.gender || null,
      relationship: profile.relationship_type || null,
    },
    httpStatus: response.status,
    ok: response.ok,
    error: data.error || null,
    fusion: {
      model: data.model || null,
      degraded: data?.fusion?.degraded ?? null,
      reason: data?.fusion?.reason || null,
      spent: data?.fusion?.spent ?? null,
      balanceAfter: data?.fusion?.balance_after ?? null,
      ms: data?.fusion?.ms ?? Date.now() - started,
      replyChars: typeof data.reply === "string" ? data.reply.length : 0,
      finalExcerpt: excerpt(data.reply, 900),
      panel: panel.map((p) => ({
        model: p.model,
        ok: !!p.ok,
        cached: !!p.cached,
        status: p.status || null,
        ms: p.ms || 0,
        attempts: p.attempts || null,
        chars: p.chars || proofAnswerByModel[p.model]?.length || 0,
        error: p.error || null,
        excerpt: excerpt(p.reply || proofAnswerByModel[p.model], 700),
      })),
      judge: data?.fusion?.judge ? {
        model: data.fusion.judge.model,
        ok: !!data.fusion.judge.ok,
        cached: !!data.fusion.judge.cached,
        status: data.fusion.judge.status || null,
        ms: data.fusion.judge.ms || 0,
        attempts: data.fusion.judge.attempts || null,
        chars: data.fusion.judge.chars || proof.judgeProof?.answerExcerpt?.length || 0,
        error: data.fusion.judge.error || null,
        excerpt: excerpt(data.fusion.judge.reply || proof.judgeProof?.answerExcerpt, 900),
      } : null,
    },
    proof,
    modelContract: {
      requiredPanelModels: REQUIRED_MODELS,
      responsePanelModels,
      missingResponsePanelModels,
      unexpectedResponsePanelModels,
      exactResponsePanelModels,
      dbPanelModels: proof.dbPanelModels,
      missingDbPanelModels: proof.missingPanelModels,
      unexpectedDbPanelModels: proof.unexpectedPanelModels,
      exactDbPanelModels: proof.exactPanelModelSet,
    },
    pass: response.ok
      && data?.fusion?.degraded === false
      && exactResponsePanelModels
      && proof.exactPanelModelSet
      && REQUIRED_MODELS.every((m) => panel.some((p) => p.model === m && p.ok && p.cached === false))
      && data?.fusion?.judge?.ok === true
      && data?.fusion?.judge?.cached === false
      && proof.samePacketHash
      && proof.panelProof.every((p) => p.ok)
      && proof.judgeProof?.ok === true,
  };
  console.log(`[${new Date().toISOString()}] loop ${index}/5 done status=${response.status} pass=${result.pass} panels=${result.fusion.panel.map((p) => `${p.model}:${p.ok ? "ok" : "fail"}:${p.cached ? "cache" : "live"}`).join(",")}`);
  return result;
}

function buildReport(subject, results) {
  const passCount = results.filter((r) => r.pass).length;
  const lines = [];
  lines.push(`# Sifu Fusion 5-Profile Audit Report`);
  lines.push("");
  lines.push(`- Run ID: \`${RUN_ID}\``);
  lines.push(`- Generated: \`${new Date().toISOString()}\``);
  lines.push(`- Base URL: \`${BASE_URL}\``);
  lines.push(`- Test subject: \`${subject.email}\` · tier=\`${subject.tier || "-"}\` · org_role=\`${subject.org_role || "-"}\``);
  lines.push(`- Required panel models: ${REQUIRED_MODELS.map((m) => `\`${m}\``).join(", ")}`);
  lines.push(`- Judge model: \`claude-max-cli\``);
  lines.push(`- Cache policy: \`noCache=true\` for panel and judge calls`);
  lines.push(`- Result: **${passCount}/${results.length} completed loops passed** (target: 5/5)`);
  lines.push("");
  lines.push(`## Pass Criteria`);
  lines.push("");
  lines.push("- Fusion endpoint returns HTTP 200 with `degraded=false`.");
  lines.push(`- All ${REQUIRED_MODELS.length} panel models return \`ok=true\` and \`cached=false\`.`);
  lines.push("- Response panel models and DB audit panel models exactly match the required panel model set; no extra provider calls are allowed.");
  lines.push("- Judge returns `ok=true` and `cached=false`.");
  lines.push("- DB audit row exists for every panel and judge call under the loop `threadId`.");
  lines.push("- Every DB audit row has `prompt_hash`, `packet_hash`, `fact_lock`, `pillar_lock`, `audit_quality=packet_evidence`, `identity_check_result=pass`.");
  lines.push("- All rows in the same loop share one `packet_hash`, proving the same chart packet evidence was attached to each engine prompt.");
  lines.push("");
  lines.push(`## Summary Table`);
  lines.push("");
  lines.push("| Loop | Profile | Day Master | HTTP | Fusion | Panels live | Judge | Packet proof | Attempts | Spent | Balance After |");
  lines.push("|---:|---|---|---:|---|---|---|---|---|---:|---:|");
  for (const r of results) {
    const panelsLive = r.fusion.panel.map((p) => `${p.model}:${p.ok ? "ok" : "fail"}:${p.cached ? "cache" : "live"}${p.error ? `:${p.error}` : ""}`).join("<br>");
    const packetProof = r.proof.samePacketHash && r.proof.panelProof.every((p) => p.ok) && r.proof.judgeProof?.ok ? "pass" : "fail";
    const attempts = [
      ...r.fusion.panel.map((p) => `${p.model}:${p.attempts || "-"}`),
      `judge:${r.fusion.judge?.attempts || "-"}`,
    ].join("<br>");
    lines.push(`| ${r.index} | ${md(r.profile.label)} | ${md(r.profile.dayMaster || "-")} | ${r.httpStatus} | ${r.pass ? "pass" : "fail"} | ${panelsLive} | ${r.fusion.judge?.ok ? "ok" : "fail"}:${r.fusion.judge?.cached ? "cache" : "live"}${r.fusion.judge?.error ? `:${r.fusion.judge.error}` : ""} | ${packetProof} | ${attempts} | ${r.fusion.spent ?? 0} | ${r.fusion.balanceAfter ?? ""} |`);
  }
  lines.push("");
  for (const r of results) {
    lines.push(`## Loop ${r.index}: ${r.profile.label}`);
    lines.push("");
    lines.push(`- Thread ID: \`${r.threadId}\``);
    lines.push(`- Profile ID: \`${r.profile.id}\``);
    lines.push(`- Day Master: \`${r.profile.dayMaster || "-"}\``);
    lines.push(`- Fusion status: HTTP \`${r.httpStatus}\`, pass=\`${r.pass}\`, reason=\`${r.fusion.reason || r.error || "-"}\`, degraded=\`${r.fusion.degraded}\``);
    lines.push(`- Panel model contract: response=\`${r.modelContract?.exactResponsePanelModels ? "pass" : "fail"}\` (${(r.modelContract?.responsePanelModels || []).join(",") || "-"}), DB=\`${r.modelContract?.exactDbPanelModels ? "pass" : "fail"}\` (${(r.modelContract?.dbPanelModels || []).join(",") || "-"})`);
    if (r.modelContract?.unexpectedResponsePanelModels?.length || r.modelContract?.unexpectedDbPanelModels?.length) {
      lines.push(`- Unexpected panel models: response=\`${(r.modelContract.unexpectedResponsePanelModels || []).join(",") || "-"}\`, DB=\`${(r.modelContract.unexpectedDbPanelModels || []).join(",") || "-"}\``);
    }
    if (r.modelContract?.missingResponsePanelModels?.length || r.modelContract?.missingDbPanelModels?.length) {
      lines.push(`- Missing panel models: response=\`${(r.modelContract.missingResponsePanelModels || []).join(",") || "-"}\`, DB=\`${(r.modelContract.missingDbPanelModels || []).join(",") || "-"}\``);
    }
    lines.push(`- Packet hash count: \`${r.proof.packetHashes.length}\`, same packet hash across panel/judge: \`${r.proof.samePacketHash}\``);
    lines.push(`- Packet hash: \`${r.proof.packetHashes[0] || "-"}\``);
    lines.push("");
    lines.push(`### Prompt Packet Proof`);
    lines.push("");
    lines.push("| Role | Model | DB row | cached | prompt_hash | packet_hash | fact_lock | pillar_lock | audit_quality | identity | proof |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const p of r.proof.panelProof) {
      lines.push(`| panel | \`${p.model}\` | ${p.rowFound ? "yes" : "no"} | \`${p.cached}\` | ${p.promptHash ? "yes" : "no"} | ${p.packetHash ? "yes" : "no"} | ${p.factLock ? "yes" : "no"} | ${p.pillarLock ? "yes" : "no"} | \`${p.auditQuality || "-"}\` | \`${p.identityCheck || "-"}\` | ${p.ok ? "pass" : "fail"} |`);
    }
    const j = r.proof.judgeProof;
    lines.push(`| judge | \`${j?.model || "-"}\` | ${j ? "yes" : "no"} | \`${j?.cached ?? null}\` | ${j?.promptHash ? "yes" : "no"} | ${j?.packetHash ? "yes" : "no"} | ${j?.factLock ? "yes" : "no"} | ${j?.pillarLock ? "yes" : "no"} | \`${j?.auditQuality || "-"}\` | \`${j?.identityCheck || "-"}\` | ${j?.ok ? "pass" : "fail"} |`);
    lines.push("");
    lines.push(`### Panel Predictions`);
    lines.push("");
    for (const p of r.fusion.panel) {
      lines.push(`#### ${p.model}`);
      lines.push("");
      lines.push(`- ok=\`${p.ok}\`, cached=\`${p.cached}\`, ms=\`${p.ms}\`, attempts=\`${p.attempts || "-"}\`, chars=\`${p.chars}\``);
      if (p.error) lines.push(`- error: \`${md(p.error)}\``);
      lines.push("");
      lines.push(`> ${md(p.excerpt || "-")}`);
      lines.push("");
    }
    lines.push(`### Claude Judgment Summary`);
    lines.push("");
    lines.push(`- judge ok=\`${r.fusion.judge?.ok}\`, cached=\`${r.fusion.judge?.cached}\`, ms=\`${r.fusion.judge?.ms}\`, attempts=\`${r.fusion.judge?.attempts || "-"}\`, chars=\`${r.fusion.judge?.chars}\``);
    if (r.fusion.judge?.error) lines.push(`- judge error: \`${md(r.fusion.judge.error)}\``);
    lines.push("");
    lines.push(`> ${md(r.fusion.finalExcerpt || r.fusion.judge?.excerpt || "-")}`);
    lines.push("");
  }
  return lines.join("\n");
}

function writeOutputs(subject, results) {
  const output = {
    runId: RUN_ID,
    reportPath: REPORT_PATH,
    resultPath: RESULT_PATH,
    subject: {
      email: subject.email,
      orgId: subject.org_id,
      tier: subject.tier,
      orgRole: subject.org_role,
    },
    results,
  };
  writeFileSync(RESULT_PATH, JSON.stringify(output, null, 2));
  writeFileSync(REPORT_PATH, buildReport(subject, results));
  return output;
}

try {
  mkdirSync(REPORT_DIR, { recursive: true });
  const subject = await pickSubject();
  const profiles = await pickProfiles(subject.org_id);
  const token = await signSession(subject);
  const results = [];
  console.log(`[${new Date().toISOString()}] run=${RUN_ID} subject=${subject.email} profiles=${profiles.length}`);
  for (let i = 0; i < profiles.length; i++) {
    const result = await runLoop(subject, token, profiles[i], i + 1);
    results.push(result);
    writeOutputs(subject, results);
    if (!result.pass && !CONTINUE_ON_FAIL) {
      console.log(`[${new Date().toISOString()}] stop-on-fail loop=${result.index}; set FUSION5_CONTINUE_ON_FAIL=1 to force all loops`);
      break;
    }
  }
  const output = writeOutputs(subject, results);
  const pass = results.length === profiles.length && results.every((r) => r.pass);
  console.log(JSON.stringify({ runId: RUN_ID, pass, reportPath: REPORT_PATH, resultPath: RESULT_PATH, loops: results.map((r) => ({ index: r.index, status: r.httpStatus, pass: r.pass, panels: r.fusion.panel.map((p) => ({ model: p.model, ok: p.ok, cached: p.cached, attempts: p.attempts, chars: p.chars, error: p.error })), judge: { ok: r.fusion.judge?.ok, cached: r.fusion.judge?.cached, attempts: r.fusion.judge?.attempts, chars: r.fusion.judge?.chars, error: r.fusion.judge?.error }, proof: { samePacketHash: r.proof.samePacketHash, panelProof: r.proof.panelProof.map((p) => ({ model: p.model, ok: p.ok })), judgeProof: r.proof.judgeProof?.ok } })) }, null, 2));
  process.exit(pass ? 0 : 2);
} finally {
  await pool.end();
}
