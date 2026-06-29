/**
 * POST /api/sifu/fusion
 *
 * Safe Fusion lab for /master-fusion.
 * Invariant: every panel model and the final judge call goes through /api/sifu,
 * so every CLI/API backend receives the same packet-backed Sifu prompt contract as production.
 */
import { NextResponse } from "next/server";
import { loadEnvConfig } from "@next/env";
import { createHash } from "crypto";
import { getSession, signSession, type Session } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { logResearchAiMessage } from "@/lib/research-log";
import { ensureServerEnv } from "@/lib/server-env";
import { refundHours, spendHours, type RefundResult, type SpendResult } from "@/lib/spend-hours";

loadEnvConfig(process.cwd(), false, console, true);
ensureServerEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);

type Msg = { role: "user" | "assistant"; content: string };
type SifuModel = "claude-max-cli" | "codex-cli" | "grok-cli" | "gemini-api";
type FusionMode = "strict" | "resilient";
type PanelResult = {
  model: SifuModel;
  role: "panel" | "judge";
  ok: boolean;
  reply?: string;
  error?: string;
  status?: number;
  ms: number;
  attempts?: number;
  cached?: boolean;
  key?: string;
  chars?: number;
  provider_model?: string | null;
};
type ProgressPhase = "queued" | "panel" | "judge" | "done" | "failed";
type ProgressModelState = {
  model: SifuModel;
  role: "panel" | "judge";
  state: "queued" | "running" | "ok" | "fail" | "skipped";
  ok?: boolean;
  error?: string;
  ms?: number;
  chars?: number;
  attempts?: number;
  updatedAt: number;
};
type FusionRunStatus = {
  runId: string;
  userId: string;
  phase: ProgressPhase;
  phaseStartedAt: number;
  percent: number;
  message: string;
  startedAt: number;
  updatedAt: number;
  panelTotal: number;
  panelDone: number;
  aiAnsweredCount: number;
  aiRequestedCount: number;
  preferredPanelModels: SifuModel[];
  panel: Record<string, ProgressModelState>;
  judge: Record<string, ProgressModelState>;
};
type FusionProgressReporter = {
  phase: (phase: ProgressPhase, message: string, percent?: number) => void;
  panelStarted: (model: SifuModel) => void;
  panelSettled: (result: PanelResult) => void;
  judgeStarted: (model: SifuModel) => void;
  judgeSettled: (result: PanelResult) => void;
  done: (message: string) => void;
  failed: (message: string) => void;
};
type FusionHistoryStatus = "done" | "degraded" | "fail";
type InternalAuditRow = {
  id: string;
  model: string | null;
  question: string | null;
  created_at: string;
  profile_snapshot: unknown;
  pillars_snapshot: unknown;
  packet_hash: string | null;
  packet_snapshot_safe: unknown;
  context_hash: string | null;
  prompt_hash: string | null;
  prompt_version: string | null;
  knowledge_hashes: unknown;
  fact_lock: string | null;
  pillar_lock: string | null;
  identity_check_result: string | null;
  audit_quality: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PANEL_MODELS: SifuModel[] = ["codex-cli", "grok-cli", "gemini-api"];
const RAW_JUDGE_MODEL = process.env.SIFU_FUSION_JUDGE_MODEL || "claude-max-cli";
const JUDGE_MODEL = normalizeSifuModel(RAW_JUDGE_MODEL);
const CHILD_TIMEOUT_MS = Number(process.env.SIFU_FUSION_CHILD_TIMEOUT_MS || 650_000);
const MAX_JUDGE_MESSAGE_CHARS = intEnv("SIFU_FUSION_JUDGE_MESSAGE_CHARS", 24_000, 4_000, 80_000);
const SPEND_HOURS = Math.max(0, Math.floor(Number(process.env.SIFU_FUSION_SPEND_HOURS || 25)));
const MIN_TIER = String(process.env.SIFU_FUSION_MIN_TIER || "master").toLowerCase();
const REQUIRE_ALL_PANELS = process.env.SIFU_FUSION_REQUIRE_ALL_PANELS !== "0";
const PANEL_ATTEMPTS = intEnv("SIFU_FUSION_PANEL_ATTEMPTS", 3, 1, 3);
const JUDGE_ATTEMPTS = intEnv("SIFU_FUSION_JUDGE_ATTEMPTS", 3, 1, 3);
const FUSION_TOTAL_TIMEOUT_MS = intEnv("SIFU_FUSION_TOTAL_TIMEOUT_MS", 540_000, 60_000, 1_800_000);
const RESILIENT_MIN_PANELS = intEnv("SIFU_FUSION_RESILIENT_MIN_PANELS", 2, 1, PANEL_MODELS.length);
const RESILIENT_QUORUM_WAIT_MS = intEnv("SIFU_FUSION_RESILIENT_QUORUM_WAIT_MS", 600_000, 10_000, CHILD_TIMEOUT_MS);
const RESILIENT_PANEL_TIMEOUT_MS = intEnv("SIFU_FUSION_RESILIENT_PANEL_TIMEOUT_MS", 600_000, 30_000, CHILD_TIMEOUT_MS);
const RESILIENT_JUDGE_TIMEOUT_MS = intEnv("SIFU_FUSION_RESILIENT_JUDGE_TIMEOUT_MS", 600_000, 30_000, CHILD_TIMEOUT_MS);
const RESILIENT_WAIT_ALL_PANELS = process.env.SIFU_FUSION_WAIT_ALL_PANELS !== "0";
const FALLBACK_JUDGE_MODELS = cleanModelList(process.env.SIFU_FUSION_FALLBACK_JUDGE_MODELS || "codex-cli,gemini-api,grok-cli");
const RESILIENT_PREFERRED_PANEL_MODELS = cleanModelList(process.env.SIFU_FUSION_RESILIENT_PREFERRED_MODELS || "gemini-api");
const FUSION_STATUS_TTL_MS = 30 * 60_000;
const INTERNAL_SIFU_BASE_URL = process.env.SIFU_INTERNAL_BASE_URL ||
  (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3348");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const TIER_RANK: Record<string, number> = { free: 0, premium: 1, master: 2 };

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isGeminiApiKeyConfigured(): boolean {
  ensureServerEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
  return !!(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"]);
}

function normalizeSifuModel(raw: string | undefined | null): SifuModel | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "claude" || s === "claude-max" || s === "claude-max-cli") return "claude-max-cli";
  if (s === "codex" || s === "codex-cli") return "codex-cli";
  if (s === "grok" || s === "grok-cli") return "grok-cli";
  if (s === "gemini" || s === "gemini-api") return "gemini-api";
  return null;
}

function cleanFusionMode(raw: unknown): FusionMode {
  const s = String(raw || "").trim().toLowerCase();
  return s === "strict" || s === "audit" ? "strict" : "resilient";
}

function cleanModelList(raw: string): SifuModel[] {
  const out = String(raw || "")
    .split(",")
    .map((x) => normalizeSifuModel(x))
    .filter((x): x is SifuModel => !!x);
  return Array.from(new Set(out));
}

function modelLabel(model: SifuModel): string {
  if (model === "claude-max-cli") return "Claude";
  if (model === "codex-cli") return "Codex";
  if (model === "grok-cli") return "Grok";
  if (model === "gemini-api") return "Gemini API";
  return model;
}

function modelListLabel(models: SifuModel[]): string {
  return models.map(modelLabel).join(", ");
}

function cleanRunId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/[^\w.-]+/g, "_").slice(0, 80);
  return s || null;
}

const fusionStatusGlobal = globalThis as typeof globalThis & {
  __hkSifuFusionStatus?: Map<string, FusionRunStatus>;
};
const fusionStatusStore = fusionStatusGlobal.__hkSifuFusionStatus || new Map<string, FusionRunStatus>();
fusionStatusGlobal.__hkSifuFusionStatus = fusionStatusStore;

function pruneFusionStatusStore() {
  const cutoff = Date.now() - FUSION_STATUS_TTL_MS;
  for (const [runId, status] of fusionStatusStore.entries()) {
    if (status.updatedAt < cutoff) fusionStatusStore.delete(runId);
  }
}

function initFusionStatus(runId: string | null, panelModels: SifuModel[], userId: string): FusionRunStatus | null {
  if (!runId) return null;
  pruneFusionStatusStore();
  const now = Date.now();
  const panel = Object.fromEntries(panelModels.map((model) => [model, {
    model,
    role: "panel" as const,
    state: "queued" as const,
    updatedAt: now,
  }]));
  const status: FusionRunStatus = {
    runId,
    userId,
    phase: "queued",
    phaseStartedAt: now,
    percent: 2,
    message: "เตรียมเรียก AI panel",
    startedAt: now,
    updatedAt: now,
    panelTotal: panelModels.length,
    panelDone: 0,
    aiAnsweredCount: 0,
    aiRequestedCount: panelModels.length,
    preferredPanelModels: RESILIENT_PREFERRED_PANEL_MODELS.filter((model) => panelModels.includes(model)),
    panel,
    judge: {},
  };
  fusionStatusStore.set(runId, status);
  return status;
}

function saveFusionStatus(status: FusionRunStatus) {
  status.updatedAt = Date.now();
  fusionStatusStore.set(status.runId, status);
}

function stateFromResult(result: PanelResult): ProgressModelState["state"] {
  if (result.ok && result.reply) return "ok";
  if (result.error === "skipped_after_quorum" || result.error === "skipped_after_resilient_timeout" || result.error === "preferred_wait_timeout" || result.error === "fusion_deadline_exceeded") return "skipped";
  return "fail";
}

function makeFusionProgress(runId: string | null, panelModels: SifuModel[], userId: string): FusionProgressReporter | null {
  const status = initFusionStatus(runId, panelModels, userId);
  if (!status) return null;
  const panelText = modelListLabel(panelModels);
  const setPhase = (phase: ProgressPhase, message: string, percent?: number) => {
    if (status.phase !== phase) status.phaseStartedAt = Date.now();
    status.phase = phase;
    status.message = message;
    if (typeof percent === "number") status.percent = Math.max(status.percent, Math.min(100, Math.round(percent)));
    saveFusionStatus(status);
  };
  const recalcPanelPercent = () => {
    const done = Object.values(status.panel).filter((r) => r.state === "ok" || r.state === "fail" || r.state === "skipped").length;
    const ok = Object.values(status.panel).filter((r) => r.state === "ok").length;
    status.panelDone = done;
    status.aiAnsweredCount = ok;
    status.percent = Math.max(status.percent, Math.min(76, 8 + Math.round((done / Math.max(1, status.panelTotal)) * 68)));
  };
  return {
    phase: setPhase,
    panelStarted(model) {
      const now = Date.now();
      status.phase = "panel";
      status.message = `กำลังเรียก ${panelText} เป็น panel · Claude เป็น judge`;
      status.panel[model] = { model, role: "panel", state: "running", updatedAt: now };
      status.percent = Math.max(status.percent, 8);
      saveFusionStatus(status);
    },
    panelSettled(result) {
      status.panel[result.model] = {
        model: result.model,
        role: "panel",
        state: stateFromResult(result),
        ok: result.ok,
        error: publicErrorCode(result.error, result.status) || result.error,
        ms: result.ms,
        chars: result.chars,
        attempts: result.attempts,
        updatedAt: Date.now(),
      };
      recalcPanelPercent();
      const pendingModels = Object.values(status.panel)
        .filter((r) => r.state === "running" || r.state === "queued")
        .map((r) => r.model);
      status.message = pendingModels.length
        ? `AI ตอบแล้ว ${status.aiAnsweredCount}/${status.aiRequestedCount} ตัว · ยังรอ ${modelListLabel(pendingModels)}`
        : `AI panel จบแล้ว ${status.aiAnsweredCount}/${status.aiRequestedCount} ตัว · กำลังเตรียม judge`;
      saveFusionStatus(status);
    },
    judgeStarted(model) {
      const now = Date.now();
      status.phase = "judge";
      status.phaseStartedAt = now;
      status.percent = Math.max(status.percent, 80);
      status.message = `กำลังให้ judge สังเคราะห์คำตอบด้วย ${model}`;
      status.judge[model] = { model, role: "judge", state: "running", updatedAt: now };
      saveFusionStatus(status);
    },
    judgeSettled(result) {
      status.judge[result.model] = {
        model: result.model,
        role: "judge",
        state: stateFromResult(result),
        ok: result.ok,
        error: publicErrorCode(result.error, result.status) || result.error,
        ms: result.ms,
        chars: result.chars,
        attempts: result.attempts,
        updatedAt: Date.now(),
      };
      status.percent = Math.max(status.percent, result.ok ? 96 : 84);
      status.message = result.ok ? "judge สรุปเสร็จแล้ว" : `judge ${result.model} ไม่สำเร็จ · ลองตัวสำรองถ้ามี`;
      saveFusionStatus(status);
    },
    done(message) {
      setPhase("done", message, 100);
    },
    failed(message) {
      setPhase("failed", message, Math.max(status.percent, 90));
    },
  };
}

function cleanProfileId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function cleanThreadId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[^\w:.-]+/g, "_").slice(0, 80);
  return s || null;
}

function cleanHistory(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-6)
    .map((row) => {
      const item = row as { role?: unknown; content?: unknown };
      const role = item.role === "assistant" ? "assistant" : "user";
      const content = String(item.content || "").replace(/\s+/g, " ").trim().slice(0, 1_500);
      return content ? { role, content } : null;
    })
    .filter((x): x is Msg => !!x);
}

function cleanLang(v: unknown): string {
  const s = String(v || "th").trim().toLowerCase();
  return ["th", "en", "zh"].includes(s) ? s : "th";
}

function cleanTopic(v: unknown): string | undefined {
  const s = String(v || "").trim().replace(/[^\w:-]+/g, "_").slice(0, 80);
  return s || undefined;
}

function cleanPanelModels(raw: unknown): SifuModel[] {
  if (!Array.isArray(raw)) return PANEL_MODELS;
  const allowed = new Set<SifuModel>(PANEL_MODELS);
  const out = raw
    .map((x) => String(x || "").trim() as SifuModel)
    .filter((x): x is SifuModel => allowed.has(x));
  return Array.from(new Set(out)).slice(0, 4);
}

function clip(text: string, max: number): string {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function tierRank(tier: string | null | undefined): number | null {
  return TIER_RANK[String(tier || "free").toLowerCase()] ?? null;
}

function internalSifuUrl(): URL {
  const base = new URL(INTERNAL_SIFU_BASE_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(base.hostname)) {
    throw new Error("invalid_internal_sifu_base_url");
  }
  return new URL("/api/sifu", base);
}

function internalFusionToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("fusion_internal_secret_missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}

async function internalAuthCookie(session: Session): Promise<string> {
  const token = await signSession({ userId: session.userId, email: session.email, orgId: session.orgId || null });
  return `decode_auth=${encodeURIComponent(token)}`;
}

function publicErrorCode(err: string | undefined, status: number | undefined): string | undefined {
  const s = String(err || "").toLowerCase();
  if (!s && !status) return undefined;
  if (s.includes("skipped_after_quorum")) return "skipped_after_quorum";
  if (s.includes("skipped_after_resilient_timeout")) return "skipped_after_resilient_timeout";
  if (s.includes("preferred_wait_timeout")) return "preferred_wait_timeout";
  if (s.includes("fusion_deadline_exceeded")) return "fusion_deadline_exceeded";
  if (s === "aborted") return "aborted";
  if (s.includes("timeout") || s.includes("abort")) return "timeout";
  if (s.includes("quota") || s.includes("session limit") || s.includes("rate limit") || s.includes("exhausted")) return "provider_quota";
  if (s.includes("busy")) return "provider_busy";
  if (s.includes("gemini_api_key_missing")) return "provider_config";
  if (s.includes("not logged in") || status === 401) return "auth_failed";
  if (status) return `http_${status}`;
  return "provider_failed";
}

function publicPanelResult(r: PanelResult): Omit<PanelResult, "reply" | "key"> {
  return {
    model: r.model,
    role: r.role,
    ok: r.ok,
    status: r.status,
    error: publicErrorCode(r.error, r.status),
    ms: r.ms,
    attempts: r.attempts,
    cached: r.cached,
    chars: r.chars,
    provider_model: r.provider_model,
  };
}

function publicAnswerResult(r: PanelResult): (Omit<PanelResult, "key"> & { error?: string }) | null {
  if (!r.ok || !r.reply) return null;
  return {
    ...publicPanelResult(r),
    ok: true,
    reply: r.reply,
  };
}

function publicAnswerResults(panel: PanelResult[], judges: PanelResult[]): Array<Omit<PanelResult, "key"> & { error?: string }> {
  const out: Array<Omit<PanelResult, "key"> & { error?: string }> = [];
  for (const result of [...panel, ...judges]) {
    const answer = publicAnswerResult(result);
    if (answer) out.push(answer);
  }
  return out;
}

function clipStoredAnswers(raw: unknown, maxReplyChars = 10_000): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== "object") return item;
    const obj = item as Record<string, unknown>;
    const reply = typeof obj.reply === "string" ? obj.reply : "";
    if (!reply || reply.length <= maxReplyChars) return obj;
    return {
      ...obj,
      reply: `${reply.slice(0, maxReplyChars)}\n...[clipped]`,
      clipped: true,
      original_chars: reply.length,
    };
  });
}

function fusionMetaForHistory(fusion: Record<string, unknown>): Record<string, unknown> {
  const { access: _access, answers, ...rest } = fusion;
  void _access;
  return {
    ...rest,
    answers: clipStoredAnswers(answers),
  };
}

async function refundFusionSpend(spend: SpendResult | null): Promise<RefundResult | null> {
  if (!spend?.ok || spend.spent <= 0) return null;
  return refundHours(spend.spent, "sifu_fusion_failed");
}

function spendMeta(spend: SpendResult | null, refund: RefundResult | null) {
  const spent = spend?.ok ? spend.spent : 0;
  const refunded = refund?.ok ? refund.refunded : 0;
  return {
    spent,
    refunded,
    net_spent: Math.max(0, spent - refunded),
    balance_after: refund?.ok ? refund.balance_after : spend?.ok ? spend.balance_after : null,
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text || "").digest("hex");
}

function fusionPublicStatus(fusionStatus: FusionHistoryStatus, degraded: boolean): FusionHistoryStatus {
  if (fusionStatus === "fail") return "fail";
  return degraded ? "degraded" : "done";
}

async function loadFusionProfileSnapshot(profileId: string, orgId: string | null): Promise<Record<string, unknown> | null> {
  if (!orgId) return null;
  return q1<Record<string, unknown>>(
    `SELECT id, name, nickname, day_master, gender, relationship_type,
            birth_datetime::text AS birth_datetime, updated_at::text AS updated_at
       FROM profiles
      WHERE id=$1::uuid AND org_id=$2::uuid AND is_archived=false
      LIMIT 1`,
    [profileId, orgId]
  );
}

function firstAuditValue(rows: InternalAuditRow[], key: keyof InternalAuditRow): unknown {
  for (const row of rows) {
    const value = row[key];
    if (value != null) return value;
  }
  return null;
}

function summarizeInternalAudit(rows: InternalAuditRow[]) {
  const panelRows = rows.filter((row) => !String(row.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
  const judgeRows = rows.filter((row) => String(row.question || "").startsWith("FUSION_SYNTHESIS_REQUEST"));
  const packetHashes = Array.from(new Set(rows.map((row) => row.packet_hash).filter(Boolean)));
  return {
    rows: rows.length,
    panel_rows: panelRows.length,
    judge_rows: judgeRows.length,
    packet_hashes: packetHashes,
    same_packet_hash: packetHashes.length === 1,
    models: rows.map((row) => ({
      model: row.model,
      role: String(row.question || "").startsWith("FUSION_SYNTHESIS_REQUEST") ? "judge" : "panel",
      packet_hash: row.packet_hash,
      prompt_hash: row.prompt_hash,
      audit_quality: row.audit_quality,
      identity_check_result: row.identity_check_result,
    })),
  };
}

async function collectFusionAuditRows(input: {
  userId: string;
  profileId: string;
  threadId: string | null;
  runId: string | null;
  question: string;
  started: number;
}): Promise<InternalAuditRow[]> {
  const startedIso = new Date(Math.max(0, input.started - 30_000)).toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await q<InternalAuditRow>(
      `SELECT id, model, question, created_at::text AS created_at,
              profile_snapshot, pillars_snapshot, packet_hash, packet_snapshot_safe,
              context_hash, prompt_hash, prompt_version, knowledge_hashes,
              fact_lock, pillar_lock, identity_check_result, audit_quality
         FROM research_ai_messages
        WHERE user_id=$1
          AND feature='sifu_master'
          AND profile_id=$2::uuid
          AND created_at >= $3::timestamptz
          AND ($4::text IS NULL OR thread_id=$4)
          AND ($5::text IS NULL OR request_payload->>'fusion_run_id'=$5 OR response_meta->>'fusion_run_id'=$5)
          AND (question=$6 OR question LIKE 'FUSION_SYNTHESIS_REQUEST%')
        ORDER BY created_at DESC
        LIMIT 12`,
      [input.userId, input.profileId, startedIso, input.threadId, input.runId, input.question]
    );
    if (rows.length) return rows;
    await sleep(140);
  }
  return [];
}

async function logFusionHistory(input: {
  session: Session;
  req: Request;
  started: number;
  profileId: string;
  threadId: string | null;
  threadProfileId: string | null;
  topic: string | undefined;
  lang: string;
  mode: FusionMode;
  message: string;
  history: Msg[];
  runId: string | null;
  panelModels: SifuModel[];
  finalReply: string;
  fusionStatus: FusionHistoryStatus;
  error?: string | null;
  fusion: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const auditRows = await collectFusionAuditRows({
      userId: input.session.userId,
      profileId: input.profileId,
      threadId: input.threadId,
      runId: input.runId,
      question: input.message,
      started: input.started,
    });
    const auditSummary = summarizeInternalAudit(auditRows);
    const fallbackProfileSnapshot = await loadFusionProfileSnapshot(input.profileId, input.session.orgId || null);
    const profileSnapshot = firstAuditValue(auditRows, "profile_snapshot") || fallbackProfileSnapshot;
    const pillarsSnapshot = firstAuditValue(auditRows, "pillars_snapshot");
    const packetSnapshotSafe = firstAuditValue(auditRows, "packet_snapshot_safe");
    const packetHash = firstAuditValue(auditRows, "packet_hash") as string | null;
    const contextHash = firstAuditValue(auditRows, "context_hash") as string | null;
    const promptHash = firstAuditValue(auditRows, "prompt_hash") as string | null;
    const promptVersion = firstAuditValue(auditRows, "prompt_version") as string | null;
    const fusionForHistory = fusionMetaForHistory(input.fusion);
    const responseMeta = {
      ...fusionForHistory,
      fusion_history_version: "sifu_fusion_history_v1",
      fusion_status: input.fusionStatus,
      run_id: input.runId,
      thread_id: input.threadId,
      thread_profile_id: input.threadProfileId,
      final_answer_hash: hashText(input.finalReply).slice(0, 24),
      question_hash: hashText(input.message).slice(0, 24),
      packet_version: packetHash ? `packet:${packetHash.slice(0, 16)}` : contextHash ? `context:${contextHash.slice(0, 16)}` : null,
      packet_hash: packetHash,
      context_hash: contextHash,
      prompt_hash: promptHash,
      prompt_version: promptVersion,
      profile_snapshot_status: auditSummary.rows ? "captured_from_internal_sifu_log" : "profile_fallback_only",
      internal_audit_summary: auditSummary,
      user_state: {
        favorite: false,
        pinned: false,
        note: "",
        updated_at: null,
      },
    };
    return await logResearchAiMessage({
      session: input.session,
      req: input.req,
      feature: "sifu_fusion",
      mode: input.mode,
      topic: input.topic || null,
      lang: input.lang,
      profileId: input.profileId,
      question: input.message,
      answer: input.finalReply || input.error || "",
      history: input.history,
      requestPayload: {
        topic: input.topic || null,
        mode: input.mode,
        profileId: input.profileId,
        thread_id: input.threadId,
        thread_profile_id: input.threadProfileId,
        run_id: input.runId,
        panel_models: input.panelModels,
      },
      responseMeta,
      model: "fusion-api",
      status: input.fusionStatus === "fail" ? "error" : "ok",
      error: input.error || null,
      spent: typeof input.fusion.net_spent === "number" ? input.fusion.net_spent as number : typeof input.fusion.spent === "number" ? input.fusion.spent as number : null,
      balanceAfter: typeof input.fusion.balance_after === "number" ? input.fusion.balance_after as number : null,
      durationMs: Date.now() - input.started,
      cached: false,
      profileSnapshot,
      pillarsSnapshot,
      packetHash,
      packetSnapshotSafe,
      contextHash,
      promptHash,
      promptVersion,
      knowledgeHashes: firstAuditValue(auditRows, "knowledge_hashes"),
      factLock: firstAuditValue(auditRows, "fact_lock") as string | null,
      pillarLock: firstAuditValue(auditRows, "pillar_lock") as string | null,
      threadId: input.threadId || input.runId || "master-fusion",
      threadProfileId: input.threadProfileId || input.profileId,
      historyProfileIds: [input.profileId],
      identityCheckResult: firstAuditValue(auditRows, "identity_check_result") as string | null,
      predictionPhase: "general",
      profileBindingStatus: auditSummary.rows ? "fusion_profile_bound" : "fusion_profile_fallback",
      auditQuality: auditSummary.rows ? "fusion_packet_evidence" : "fusion_profile_snapshot_only",
    });
  } catch (e) {
    console.warn("[sifu-fusion] history log failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function getFusionAccess(session: Session): Promise<{
  allowed: boolean;
  reason?: string;
  tier: string;
  hour_balance: number;
  sub_expires_at: string | null;
  sub_active: boolean;
  admin_role: string | null;
}> {
  const user = await q1<{ tier: string | null; hour_balance: number | null; sub_expires_at: string | null }>(
    `SELECT tier, hour_balance, sub_expires_at FROM users WHERE id=$1`,
    [session.userId]
  );
  const tier = user?.tier || "free";
  const subActive = !!(user?.sub_expires_at && new Date(user.sub_expires_at).getTime() > Date.now());
  const emailAdmin = ADMIN_EMAILS.includes(String(session.email || "").toLowerCase());
  let adminRole: string | null = emailAdmin ? "env_admin" : null;
  if (!adminRole && session.orgId) {
    const member = await q1<{ role: string }>(
      `SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2 AND status='active' LIMIT 1`,
      [session.orgId, session.userId]
    );
    if (member && ["owner", "admin"].includes(member.role)) adminRole = member.role;
  }
  const allowAll = process.env.SIFU_FUSION_ALLOW_ALL === "1";
  const minRank = tierRank(MIN_TIER);
  const currentRank = tierRank(tier) ?? 0;
  const tierAllowed = minRank !== null && currentRank >= minRank && subActive;
  const allowed = allowAll || !!adminRole || tierAllowed;
  return {
    allowed,
    reason: allowed ? undefined : `requires_${MIN_TIER}_tier_or_admin`,
    tier,
    hour_balance: user?.hour_balance ?? 0,
    sub_expires_at: user?.sub_expires_at || null,
    sub_active: subActive,
    admin_role: adminRole,
  };
}

function retryableSifuFailure(r: PanelResult): boolean {
  if (r.ok) return false;
  if (r.status && r.status < 500 && r.status !== 429) return false;
  const code = publicErrorCode(r.error, r.status) || "";
  return ["timeout", "provider_busy", "provider_failed", "provider_quota", "http_429"].includes(code) || code.startsWith("http_5");
}

function retryDelayMs(result: PanelResult, attempt: number, deadline: number): number {
  const code = publicErrorCode(result.error, result.status) || "";
  const base = code === "provider_quota"
    ? Math.min(20_000 * attempt, 60_000)
    : Math.min(1_500 * attempt, 4_000);
  return Math.min(base, Math.max(0, deadline - Date.now() - 500));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => done();
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function remainingTimeout(deadline: number, capMs: number): number {
  return Math.max(0, Math.min(capMs, deadline - Date.now() - 1_000));
}

function unavailableProviderResult(model: SifuModel, role: "panel" | "judge", error = "gemini_api_key_missing"): PanelResult {
  return {
    model,
    role,
    ok: false,
    error,
    ms: 0,
    attempts: 0,
  };
}

async function callSifuOnce(authCookie: string, payload: Record<string, unknown>, model: SifuModel, role: "panel" | "judge", timeoutMs: number, cancelSignal?: AbortSignal): Promise<PanelResult> {
  const started = Date.now();
  const ac = new AbortController();
  const onCancel = () => ac.abort();
  if (cancelSignal?.aborted) ac.abort();
  else cancelSignal?.addEventListener("abort", onCancel, { once: true });
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(internalSifuUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": authCookie,
        "X-Sifu-Fusion": "1",
        "X-Sifu-Fusion-Token": internalFusionToken(),
      },
      body: JSON.stringify({ ...payload, model, stream: false, noCache: true, fusionRole: role, fusionPacketMode: "raw-data" }),
      signal: ac.signal,
      cache: "no-store",
    });
    const text = await r.text();
    let data: { reply?: string; error?: string; cached?: boolean; key?: string; provider_model?: string | null } = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
    const reply = typeof data.reply === "string" ? data.reply.trim() : "";
    if (!r.ok || !reply) {
      return {
        model,
        role,
        ok: false,
        status: r.status,
        error: data.error || `empty_${role}_reply`,
        ms: Date.now() - started,
      };
    }
    return {
      model,
      role,
      ok: true,
      reply,
      ms: Date.now() - started,
      cached: !!data.cached,
      key: data.key,
      chars: reply.length,
      provider_model: typeof data.provider_model === "string" ? data.provider_model : null,
    };
  } catch (e) {
    const err = e as Error;
    return {
      model,
      role,
      ok: false,
      error: err.name === "AbortError" ? (cancelSignal?.aborted ? "aborted" : "timeout") : err.message || "sifu_call_failed",
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
    cancelSignal?.removeEventListener("abort", onCancel);
  }
}

async function callSifu(authCookie: string, payload: Record<string, unknown>, model: SifuModel, role: "panel" | "judge", timeoutMs = CHILD_TIMEOUT_MS, cancelSignal?: AbortSignal): Promise<PanelResult> {
  const attempts = role === "judge" ? JUDGE_ATTEMPTS : PANEL_ATTEMPTS;
  const started = Date.now();
  const deadline = started + timeoutMs;
  let last: PanelResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (cancelSignal?.aborted) return last || { model, role, ok: false, error: "aborted", ms: Date.now() - started, attempts: attempt - 1 };
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1_000) break;
    const result = await callSifuOnce(authCookie, payload, model, role, remainingMs, cancelSignal);
    last = { ...result, ms: Date.now() - started, attempts: attempt };
    if (cancelSignal?.aborted) return last;
    if (result.ok || attempt >= attempts || !retryableSifuFailure(result)) return last;
    console.warn(`[sifu-fusion] ${role} ${model} attempt ${attempt}/${attempts} failed: ${publicErrorCode(result.error, result.status) || "provider_failed"} · retry`);
    const delayMs = retryDelayMs(result, attempt, deadline);
    if (delayMs > 0) await sleep(delayMs, cancelSignal);
  }
  return last || { model, role, ok: false, error: "sifu_call_failed", ms: Date.now() - started, attempts: 0 };
}

async function callJudgeWithFallback(
  authCookie: string,
  payload: Record<string, unknown>,
  primaryModel: SifuModel,
  fusionMode: FusionMode,
  fusionDeadline: number,
  progress?: FusionProgressReporter | null,
): Promise<{ judge: PanelResult; judges: PanelResult[] }> {
  const models = Array.from(new Set([primaryModel, ...FALLBACK_JUDGE_MODELS]));
  const timeoutMs = fusionMode === "resilient" ? RESILIENT_JUDGE_TIMEOUT_MS : CHILD_TIMEOUT_MS;
  const judges: PanelResult[] = [];
  for (const model of models) {
    const remainingMs = remainingTimeout(fusionDeadline, timeoutMs);
    if (remainingMs <= 1_000) break;
    progress?.judgeStarted(model);
    if (model === "gemini-api" && !isGeminiApiKeyConfigured()) {
      const skipped = unavailableProviderResult(model, "judge");
      progress?.judgeSettled(skipped);
      judges.push(skipped);
      continue;
    }
    const result = await callSifu(authCookie, payload, model, "judge", remainingMs);
    progress?.judgeSettled(result);
    judges.push(result);
    if (result.ok && result.reply) return { judge: result, judges };
  }
  return {
    judge: judges[judges.length - 1] || unavailableProviderResult(primaryModel, "judge", "fusion_deadline_exceeded"),
    judges,
  };
}

function panelStats(panel: PanelResult[], panelModels: SifuModel[]) {
  const ok = panel.filter((r) => r.ok && r.reply);
  const answered = new Set(ok.map((r) => r.model));
  return {
    ai_answered_count: ok.length,
    ai_requested_count: panelModels.length,
    ai_answered_models: ok.map((r) => r.model),
    ai_failed_models: panelModels.filter((model) => !answered.has(model)),
  };
}

function judgeStats(judges: PanelResult[], primaryModel: SifuModel) {
  return {
    judge_backup_used: !!judges.find((r) => r.ok && r.reply && r.model !== primaryModel),
    judge_attempted_count: judges.length,
    judge_attempted_models: judges.map((r) => r.model),
  };
}

async function collectPanels(
  authCookie: string,
  payload: Record<string, unknown>,
  panelModels: SifuModel[],
  fusionMode: FusionMode,
  fusionDeadline: number,
  progress?: FusionProgressReporter | null,
): Promise<PanelResult[]> {
  if (fusionMode === "strict") {
    return Promise.all(panelModels.map(async (model) => {
      progress?.panelStarted(model);
      if (model === "gemini-api" && !isGeminiApiKeyConfigured()) {
        const skipped = unavailableProviderResult(model, "panel");
        progress?.panelSettled(skipped);
        return skipped;
      }
      const timeoutMs = remainingTimeout(fusionDeadline, CHILD_TIMEOUT_MS);
      const result = timeoutMs > 1_000
        ? await callSifu(authCookie, payload, model, "panel", timeoutMs)
        : unavailableProviderResult(model, "panel", "fusion_deadline_exceeded");
      progress?.panelSettled(result);
      return result;
    }));
  }

  const started = Date.now();
  const deadline = Math.min(started + RESILIENT_QUORUM_WAIT_MS, fusionDeadline - 1_000);
  const pending = new Map<SifuModel, Promise<{ model: SifuModel; result: PanelResult }>>();
  const controllers = new Map<SifuModel, AbortController>();
  const results: PanelResult[] = [];

  for (const model of panelModels) {
    if (model === "gemini-api" && !isGeminiApiKeyConfigured()) {
      const skipped = unavailableProviderResult(model, "panel");
      results.push(skipped);
      progress?.panelSettled(skipped);
      continue;
    }
    const timeoutMs = remainingTimeout(fusionDeadline, RESILIENT_PANEL_TIMEOUT_MS);
    if (timeoutMs <= 1_000) {
      const skipped = unavailableProviderResult(model, "panel", "fusion_deadline_exceeded");
      results.push(skipped);
      progress?.panelSettled(skipped);
      continue;
    }
    const controller = new AbortController();
    controllers.set(model, controller);
    progress?.panelStarted(model);
    pending.set(model, callSifu(authCookie, payload, model, "panel", timeoutMs, controller.signal)
      .then((result) => ({ model, result }))
      .finally(() => { controllers.delete(model); }));
  }

  while (pending.size) {
    const successCount = results.filter((r) => r.ok && r.reply).length;
    const preferredPending = RESILIENT_PREFERRED_PANEL_MODELS
      .filter((model) => panelModels.includes(model))
      .some((model) => pending.has(model));
    if (!RESILIENT_WAIT_ALL_PANELS && successCount >= RESILIENT_MIN_PANELS && !preferredPending) break;
    const remainingMs = Math.min(deadline - Date.now(), fusionDeadline - Date.now() - 1_000);
    if (remainingMs <= 0) break;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), remainingMs));
    const settled = await Promise.race([...pending.values(), timeout]);
    if (!settled) break;
    pending.delete(settled.model);
    results.push(settled.result);
    progress?.panelSettled(settled.result);
  }

  const preferredStillPending = RESILIENT_PREFERRED_PANEL_MODELS
    .filter((model) => panelModels.includes(model))
    .some((model) => pending.has(model));
  const skippedError = Date.now() >= fusionDeadline - 1_000
    ? "fusion_deadline_exceeded"
    : preferredStillPending
    ? "preferred_wait_timeout"
    : RESILIENT_WAIT_ALL_PANELS
    ? "skipped_after_resilient_timeout"
    : results.some((r) => r.ok && r.reply) ? "skipped_after_quorum" : "skipped_after_resilient_timeout";
  for (const model of pending.keys()) {
    controllers.get(model)?.abort();
    const skipped: PanelResult = {
      model,
      role: "panel",
      ok: false,
      error: skippedError,
      ms: Date.now() - started,
      attempts: 0,
    };
    results.push(skipped);
    progress?.panelSettled(skipped);
  }

  const order = new Map(panelModels.map((model, index) => [model, index]));
  return results.sort((a, b) => (order.get(a.model) ?? 0) - (order.get(b.model) ?? 0));
}

function noPanelReply(lang: string, stats: ReturnType<typeof panelStats>): string {
  if (lang === "en") return `Fusion could not produce an astrology answer in this round because ${stats.ai_answered_count}/${stats.ai_requested_count} AI engines returned a usable answer. No panel evidence was available, so the run was refunded.`;
  if (lang === "zh") return `本輪 Fusion 無法產生命理答案，因為 ${stats.ai_answered_count}/${stats.ai_requested_count} 個 AI 引擎回傳可用答案。沒有可用 panel 證據，本輪已退回費用。`;
  return `รอบนี้ Fusion ยังสร้างคำตอบดวงไม่ได้ เพราะมี AI ตอบสำเร็จ ${stats.ai_answered_count}/${stats.ai_requested_count} ตัว ไม่มีคำตอบ panel ที่ใช้เป็นหลักฐานได้ ระบบจึงคืนชั่วโมงให้รอบนี้`;
}

function buildJudgeMessage(question: string, panel: PanelResult[], lang: string): string {
  const ok = panel.filter((r) => r.ok && r.reply);
  const questionPart = clip(question, 420);
  const fixed = [
    "FUSION_SYNTHESIS_REQUEST",
    "คุณคือซินแส Fusion judge ของ hourkey.io",
    "คัมภีร์ strict/canonical คือ source of truth สำหรับหลักพยากรณ์และการตีความใน scope ของมัน",
    "FACT LOCK/PILLAR LOCK คือ hard facts ของเคสนี้; packet/interactions/luck/year คือข้อมูลดิบและหลักฐานคำนวณพร้อม provenance เพื่อกันอ่านผิดดวง ไม่ใช่ checklist บังคับ conclusion",
    "ถ้า raw engine label หรือคำตอบ panel ขัดคัมภีร์ strict ใน scope ของมัน ให้ลด raw label เป็นหลักฐานรองและยึดคัมภีร์",
    "หน้าที่ลำดับแรก: วินิจฉัยดวงเองจากคัมภีร์ + hard facts + packet evidence ของเคสนี้ก่อน แล้วจึงเทียบกับ panel outputs เป็น second opinion",
    "ตรวจภายในเงียบๆ ก่อนตอบ: (1) consensus ที่ทุก panel เห็นตรงกัน (2) strongest details/warnings จากแต่ละ panel (3) จุดที่ panel ขัดกันและเหตุผลที่เลือกข้างโดยยึดคัมภีร์+hard facts",
    "ห้ามตัดคำเตือนสำคัญเพียงเพราะทำให้คำตอบสั้นลง โดยเฉพาะ timing, clash/harm/punishment, contracts, money-risk, relationship-house, และ luck/year interactions ที่ตอบตรงคำถาม",
    "ลดคำการันตีอนาคต เช่น 'แน่นอน/รวยแน่' ให้เป็นเงื่อนไขตามดวงและการตัดสินใจจริง",
    "ถ้าพูดเรื่องสุขภาพ ให้ใช้ภาษาสัญลักษณ์ดวงว่า 'ควรระวังตามธาตุ/สัญลักษณ์' ไม่ใช่วินิจฉัยโรค",
    "ถ้าเจอ 丁未/未 ให้จำว่า 丁 เป็นไฟแต่ 未 เป็นดินด้วย ห้ามสรุปเป็นไฟล้วนหรือดีล้วน",
    "ถ้าพูดเรื่องดิน 4/四庫 ต้องแยกพื้นดวงเดิม วัยจร และปีจรให้ชัด อย่าทำให้เข้าใจว่าพื้นดวงเดิมมีสี่庫ครบถ้าไม่ใช่",
    "หน้าที่ลำดับสอง: รวมเป็นคำตอบเดียวที่ตรงคำถามที่สุด, ตัดสิ่งที่ขัด hard facts หรือคัมภีร์ strict, รักษารายละเอียดดีสุดจาก panel, และไม่เอ่ยชื่อโมเดลเว้นจำเป็น",
    `คำถามผู้ใช้: ${questionPart}`,
    "PANEL_OUTPUTS:",
  ].join("\n");
  const availablePanelChars = Math.max(260 * Math.max(1, ok.length), MAX_JUDGE_MESSAGE_CHARS - fixed.length - 120);
  const budget = Math.max(260, Math.floor(availablePanelChars / Math.max(1, ok.length)));
  const blocks = ok.map((r) => `${r.model}: ${clip(r.reply || "", budget)}`).join("\n");
  const tail = lang === "en"
    ? "\nAnswer in English as one final answer. Do not reveal internal process."
    : lang === "zh"
      ? "\n請用中文給出一個最終答案，不要揭露內部流程。"
      : "\nตอบภาษาไทยเป็นคำตอบสุดท้ายเดียว ไม่ต้องแจกแจง process ภายใน";
  return clip(`${fixed}\n${blocks}${tail}`, MAX_JUDGE_MESSAGE_CHARS);
}

function fallbackPanelReply(panel: PanelResult[]): PanelResult | null {
  return panel.find((r) => r.ok && r.model === "codex-cli") ||
    panel.find((r) => r.ok && r.model === "grok-cli") ||
    panel.find((r) => r.ok && r.model === "gemini-api") ||
    panel.find((r) => r.ok) ||
    null;
}

export async function POST(req: Request) {
  const started = Date.now();
  const fusionDeadline = started + FUSION_TOTAL_TIMEOUT_MS;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  if (!JUDGE_MODEL) {
    return NextResponse.json({ error: "invalid_judge_model", judge_model: RAW_JUDGE_MODEL }, { status: 500 });
  }

  const access = await getFusionAccess(session);
  if (!access.allowed) {
    return NextResponse.json({ error: "fusion_forbidden", reason: access.reason, access }, { status: 403 });
  }

  const parsedBody = await req.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
  const message = String(body.message || "").trim();
  const profileId = cleanProfileId(body.profileId);
  const threadId = cleanThreadId(body.threadId);
  const threadProfileId = cleanProfileId(body.threadProfileId || body.historyProfileId);
  const history = cleanHistory(body.history);
  const topic = cleanTopic(body.topic);
  const lang = cleanLang(body.lang);
  const panelModels = cleanPanelModels(body.models || body.panelModels || body.panel_models);
  const runId = cleanRunId(body.runId || body.run_id);
  const requestedFusionMode = cleanFusionMode(body.fusionMode || body.fusion_mode);
  const fusionMode: FusionMode = threadId === "master-fusion" ? "resilient" : requestedFusionMode;
  const noCache = body.noCache === true || body.no_cache === true;

  if (!message) return NextResponse.json({ error: "no message" }, { status: 400 });
  if (message.length > 2_000) return NextResponse.json({ error: "message too long" }, { status: 400 });
  if (!profileId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
  if (panelModels.length < 2) return NextResponse.json({ error: "fusion_requires_two_models" }, { status: 400 });
  if (!session.orgId) return NextResponse.json({ error: "org_required" }, { status: 403 });
  const progress = makeFusionProgress(runId, panelModels, session.userId);
  progress?.phase("queued", "ตรวจ profile และเตรียมเรียก AI", 4);
  const profile = await q1<{ id: string }>(
    `SELECT id FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false LIMIT 1`,
    [profileId, session.orgId]
  );
  if (!profile) {
    progress?.failed("ไม่พบ profile สำหรับรัน Fusion");
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  let spend: SpendResult | null = null;
  if (SPEND_HOURS > 0) {
    spend = await spendHours(SPEND_HOURS, "sifu_fusion");
    if (!spend.ok) {
      progress?.failed("ชั่วโมงไม่พอสำหรับ Fusion");
      return NextResponse.json(
        { error: spend.error, required: spend.required, balance: spend.balance, access },
        { status: spend.status }
      );
    }
  }

  const basePayload = {
    message,
    history,
    profileId,
    threadId,
    threadProfileId,
    fusionRunId: runId,
    topic,
    lang,
    noCache,
  };

  const authCookie = await internalAuthCookie(session);
  progress?.phase("panel", `กำลังเรียก ${modelListLabel(panelModels)} เป็น panel · Claude เป็น judge`, 8);
  const panel = await collectPanels(authCookie, basePayload, panelModels, fusionMode, fusionDeadline, progress);
  const successful = panel.filter((r) => r.ok && r.reply);
  const requiredPanelCount = fusionMode === "resilient" ? 1 : panelModels.length;
  const quorumPanelCount = fusionMode === "resilient" ? Math.min(panelModels.length, RESILIENT_MIN_PANELS) : panelModels.length;
  const stats = panelStats(panel, panelModels);
  if (fusionMode === "strict" && REQUIRE_ALL_PANELS && successful.length < panelModels.length) {
    progress?.failed("Fusion strict ไม่ครบทุก panel");
    const refund = await refundFusionSpend(spend);
    const fusion = {
      degraded: true,
      reason: "all_panel_models_required",
      mode: fusionMode,
      panel: panel.map(publicPanelResult),
      answers: publicAnswerResults(panel, []),
      required_panel_models: panelModels,
      preferred_panel_models: RESILIENT_PREFERRED_PANEL_MODELS,
      judge_attempted_count: 0,
      judge_attempted_models: [],
      ...stats,
      fusion_total_timeout_ms: FUSION_TOTAL_TIMEOUT_MS,
      packet_contract: "panel_calls_route_through_/api/sifu",
      ...spendMeta(spend, refund),
      ms: Date.now() - started,
    };
    const historyId = await logFusionHistory({
      session,
      req,
      started,
      profileId,
      threadId,
      threadProfileId,
      topic,
      lang,
      mode: fusionMode,
      message,
      history,
      runId,
      panelModels,
      finalReply: "",
      fusionStatus: "fail",
      error: "fusion_panel_incomplete",
      fusion,
    });
    return NextResponse.json({
      error: "fusion_panel_incomplete",
      reply: "",
      model: "fusion-api",
      fusion: { ...fusion, history_id: historyId },
    }, { status: 502 });
  }
  if (fusionMode === "strict" && successful.length < requiredPanelCount) {
    progress?.failed("Fusion strict มี panel ตอบไม่พอ");
    const refund = await refundFusionSpend(spend);
    const fusion = {
      degraded: true,
      reason: `fewer_than_${requiredPanelCount}_panel_replies`,
      mode: fusionMode,
      panel: panel.map(publicPanelResult),
      answers: publicAnswerResults(panel, []),
      required_panel_count: requiredPanelCount,
      preferred_panel_models: RESILIENT_PREFERRED_PANEL_MODELS,
      judge_attempted_count: 0,
      judge_attempted_models: [],
      ...stats,
      fusion_total_timeout_ms: FUSION_TOTAL_TIMEOUT_MS,
      packet_contract: "panel_calls_route_through_/api/sifu",
      ...spendMeta(spend, refund),
      ms: Date.now() - started,
    };
    const historyId = await logFusionHistory({
      session,
      req,
      started,
      profileId,
      threadId,
      threadProfileId,
      topic,
      lang,
      mode: fusionMode,
      message,
      history,
      runId,
      panelModels,
      finalReply: "",
      fusionStatus: "fail",
      error: "fusion_panel_insufficient",
      fusion,
    });
    return NextResponse.json({
      error: "fusion_panel_insufficient",
      reply: "",
      model: "fusion-api",
      fusion: { ...fusion, history_id: historyId },
    }, { status: 502 });
  }
  if (fusionMode === "resilient" && successful.length < 1) {
    progress?.failed("ไม่มี AI panel ที่ตอบสำเร็จ ระบบคืนชั่วโมงรอบนี้");
    const refund = await refundFusionSpend(spend);
    const noPanel = noPanelReply(lang, stats);
    const fusion = {
      degraded: true,
      reason: "no_panel_answer_refunded",
      mode: fusionMode,
      panel: panel.map(publicPanelResult),
      judge: null,
      judges: [],
      answers: [],
      panel_models: panelModels,
      preferred_panel_models: RESILIENT_PREFERRED_PANEL_MODELS,
      required_panel_count: requiredPanelCount,
      quorum_panel_count: quorumPanelCount,
      judge_attempted_count: 0,
      judge_attempted_models: [],
      ...stats,
      fusion_total_timeout_ms: FUSION_TOTAL_TIMEOUT_MS,
      packet_contract: "panel_calls_route_through_/api/sifu",
      ...spendMeta(spend, refund),
      ms: Date.now() - started,
    };
    const historyId = await logFusionHistory({
      session,
      req,
      started,
      profileId,
      threadId,
      threadProfileId,
      topic,
      lang,
      mode: fusionMode,
      message,
      history,
      runId,
      panelModels,
      finalReply: noPanel,
      fusionStatus: "fail",
      error: "no_panel_answer_refunded",
      fusion,
    });
    return NextResponse.json({
      reply: noPanel,
      model: "fusion-api",
      cached: false,
      fusion: { ...fusion, history_id: historyId },
    });
  }

  const judgeMessage = buildJudgeMessage(message, successful, lang);
  progress?.phase("judge", `AI panel พร้อม ${successful.length}/${panelModels.length} ตัว · กำลังให้ judge สังเคราะห์`, 78);
  const { judge, judges } = await callJudgeWithFallback(
    authCookie,
    { ...basePayload, message: judgeMessage, history: [] },
    JUDGE_MODEL,
    fusionMode,
    fusionDeadline,
    progress,
  );
  const panelFallback = fusionMode === "resilient" ? fallbackPanelReply(successful) : null;
  const finalReply = judge.ok && judge.reply ? judge.reply : panelFallback?.reply || "";
  const usedPanelFallback = !(judge.ok && judge.reply) && !!panelFallback?.reply;
  const degraded = !judge.ok || fusionMode === "resilient" && (successful.length < panelModels.length || judge.model !== JUDGE_MODEL || usedPanelFallback);
  const jStats = judgeStats(judges, JUDGE_MODEL);

  if (!finalReply) {
    progress?.failed(judge.ok ? "judge ตอบว่าง" : "judge ล้มเหลวและไม่มี fallback ที่ใช้ได้");
    const refund = await refundFusionSpend(spend);
    const fusion = {
      degraded: true,
      reason: judge.ok ? "judge_empty" : "judge_failed",
      mode: fusionMode,
      panel: panel.map(publicPanelResult),
      judge: publicPanelResult(judge),
      judges: judges.map(publicPanelResult),
      answers: publicAnswerResults(panel, judges),
      preferred_panel_models: RESILIENT_PREFERRED_PANEL_MODELS,
      ...jStats,
      ...stats,
      fusion_total_timeout_ms: FUSION_TOTAL_TIMEOUT_MS,
      packet_contract: "panel_and_judge_calls_route_through_/api/sifu",
      ...spendMeta(spend, refund),
      ms: Date.now() - started,
    };
    const historyId = await logFusionHistory({
      session,
      req,
      started,
      profileId,
      threadId,
      threadProfileId,
      topic,
      lang,
      mode: fusionMode,
      message,
      history,
      runId,
      panelModels,
      finalReply: "",
      fusionStatus: "fail",
      error: judge.ok ? "fusion_empty" : "fusion_judge_failed",
      fusion,
    });
    return NextResponse.json({
      error: judge.ok ? "fusion_empty" : "fusion_judge_failed",
      reply: "",
      model: "fusion-api",
      fusion: { ...fusion, history_id: historyId },
    }, { status: 502 });
  }

  progress?.done(`Fusion complete · AI answered ${stats.ai_answered_count}/${stats.ai_requested_count}`);
  const fusion = {
    degraded,
    reason: degraded ? "judge_synthesized_degraded" : "judge_synthesized",
    mode: fusionMode,
    panel: panel.map(publicPanelResult),
    judge: publicPanelResult(judge),
    judges: judges.map(publicPanelResult),
    answers: publicAnswerResults(panel, judges),
    used_panel_fallback: usedPanelFallback,
    ...jStats,
    judge_model: judge.model,
    primary_judge_model: JUDGE_MODEL,
    fallback_judge_models: FALLBACK_JUDGE_MODELS,
    panel_models: panelModels,
    preferred_panel_models: RESILIENT_PREFERRED_PANEL_MODELS,
    required_panel_count: requiredPanelCount,
    quorum_panel_count: quorumPanelCount,
    ...stats,
    fusion_total_timeout_ms: FUSION_TOTAL_TIMEOUT_MS,
    packet_contract: "Every panel and judge call is POST /api/sifu with the selected profileId, so each CLI/API backend receives the complete Sifu prompt packet.",
    min_tier: MIN_TIER,
    access: {
      tier: access.tier,
      sub_active: access.sub_active,
      admin_role: access.admin_role,
    },
    ...spendMeta(spend, null),
    ms: Date.now() - started,
  };
  const historyId = await logFusionHistory({
    session,
    req,
    started,
    profileId,
    threadId,
    threadProfileId,
    topic,
    lang,
    mode: fusionMode,
    message,
    history,
    runId,
    panelModels,
    finalReply,
    fusionStatus: fusionPublicStatus(degraded ? "degraded" : "done", degraded),
    fusion,
  });
  return NextResponse.json({
    reply: finalReply,
    model: "fusion-api",
    cached: false,
    fusion: { ...fusion, history_id: historyId },
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const url = new URL(req.url);
  const runId = cleanRunId(url.searchParams.get("runId") || url.searchParams.get("run_id"));
  if (!runId) return NextResponse.json({ error: "run_id_required" }, { status: 400 });
  pruneFusionStatusStore();
  const status = fusionStatusStore.get(runId);
  if (!status) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  if (status.userId !== session.userId) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  const publicStatus = { ...status } as Record<string, unknown>;
  delete publicStatus.userId;
  return NextResponse.json({ ok: true, status: publicStatus });
}
