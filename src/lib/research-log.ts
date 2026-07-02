import { createHash } from "crypto";
import { q1 } from "@/lib/db";
import type { Session } from "@/lib/auth";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const MAX_TEXT = 24_000;
const MAX_HISTORY_ITEMS = 12;
const MAX_JSON_CHARS = 96_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clipText(v: unknown, max = MAX_TEXT): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) + "\n...[clipped]" : s;
}

function safeJson(v: unknown): JsonValue | null {
  if (v == null) return null;
  try {
    const text = JSON.stringify(v);
    if (text.length <= MAX_JSON_CHARS) return JSON.parse(text);
    return {
      _clipped: true,
      chars: text.length,
      head: text.slice(0, MAX_JSON_CHARS),
    };
  } catch {
    return { _unserializable: true };
  }
}

function safeHistory(v: unknown): JsonValue | null {
  if (!Array.isArray(v)) return null;
  return safeJson(
    v.slice(-MAX_HISTORY_ITEMS).map((m) => ({
      role: typeof m?.role === "string" ? m.role : "unknown",
      content: clipText(m?.content, 2_000),
    }))
  );
}

function requestMeta(req?: Request): { ip: string | null; ua: string | null; referrer: string | null } {
  if (!req) return { ip: null, ua: null, referrer: null };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
  return {
    ip,
    ua: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
  };
}

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function cleanThreadId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/[^\w:.-]+/g, "_").slice(0, 100);
  return s || null;
}

function cleanPredictionPhase(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (["before_prediction", "post_feedback", "clarification", "general"].includes(s)) return s;
  if (s === "followup" || s === "follow_up") return "clarification";
  return s ? "general" : null;
}

function conversationKey(parts: Array<string | null | undefined>): string {
  const raw = parts.map((p) => p || "-").join("|");
  return createHash("sha1").update(raw).digest("hex").slice(0, 24);
}

export function buildResearchConversationKey(input: {
  feature: string;
  userId?: string | null;
  profileId?: string | null;
  mode?: string | null;
  topic?: string | null;
}): string {
  return conversationKey([input.feature, input.userId, input.profileId, input.mode, input.topic]);
}

export async function logResearchAiMessage(input: {
  session: Session | null;
  req?: Request;
  feature: string;
  mode?: string | null;
  topic?: string | null;
  lang?: string | null;
  profileId?: string | null;
  question: string;
  answer?: string | null;
  history?: unknown;
  requestPayload?: unknown;
  responseMeta?: unknown;
  model?: string | null;
  status?: "ok" | "error";
  error?: string | null;
  spent?: number | null;
  balanceAfter?: number | null;
  durationMs?: number | null;
  cached?: boolean;
  profileSnapshot?: unknown;
  pillarsSnapshot?: unknown;
  packetHash?: string | null;
  packetSnapshotSafe?: unknown;
  contextHash?: string | null;
  promptHash?: string | null;
  promptVersion?: string | null;
  knowledgeHashes?: unknown;
  factLock?: string | null;
  pillarLock?: string | null;
  threadId?: string | null;
  threadProfileId?: string | null;
  historyProfileIds?: unknown;
  identityCheckResult?: string | null;
  predictionPhase?: string | null;
  predictionRows?: unknown;
  historyDroppedCount?: number | null;
  profileBindingStatus?: string | null;
  auditQuality?: string | null;
}): Promise<string | null> {
  const question = clipText(input.question, 4_000);
  if (!question) return null;
  const meta = requestMeta(input.req);
  const userId = input.session?.userId || null;
  const orgId = input.session?.orgId || null;
  const profileId = cleanUuid(input.profileId);
  const threadProfileId = cleanUuid(input.threadProfileId);
  const requestPayloadObj = typeof input.requestPayload === "object" && input.requestPayload
    ? input.requestPayload as Record<string, unknown>
    : {};
  const predictionPhase = cleanPredictionPhase(input.predictionPhase);
  const threadId = cleanThreadId(input.threadId)
    || cleanThreadId(requestPayloadObj.thread_id)
    || cleanThreadId(requestPayloadObj.local_thread_id);
  const responseMeta = {
    ...(typeof input.responseMeta === "object" && input.responseMeta ? input.responseMeta as Record<string, unknown> : {}),
    audit_quality: input.auditQuality || undefined,
    profile_binding_status: input.profileBindingStatus || undefined,
    prediction_phase: predictionPhase || undefined,
    identity_check_result: input.identityCheckResult || undefined,
    packet_hash: input.packetHash || undefined,
    context_hash: input.contextHash || undefined,
    prompt_hash: input.promptHash || undefined,
    ip_address: meta.ip,
    user_agent: meta.ua,
    referrer: meta.referrer,
  };
  const row = await q1<{ id: string }>(
    `INSERT INTO research_ai_messages
       (org_id, user_id, profile_id, feature, mode, topic, lang, conversation_key,
        question, answer, history, request_payload, response_meta, model, status, error,
        spent, balance_after, duration_ms, cached,
        profile_snapshot, pillars_snapshot, packet_hash, packet_snapshot_safe,
        context_hash, prompt_hash, prompt_version, knowledge_hashes, fact_lock, pillar_lock,
        thread_id, thread_profile_id, history_profile_ids, identity_check_result, prediction_phase,
        prediction_rows, history_dropped_count, profile_binding_status, audit_quality)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,
        $17,$18,$19,$20,
        $21::jsonb,$22::jsonb,$23,$24::jsonb,
        $25,$26,$27,$28::jsonb,$29,$30,
        $31,$32,$33::jsonb,$34,$35,
        $36::jsonb,$37,$38,$39)
     RETURNING id`,
    [
      orgId,
      userId,
      profileId,
      input.feature,
      input.mode || null,
      input.topic || null,
      input.lang || "th",
      buildResearchConversationKey({ feature: input.feature, userId, profileId, mode: input.mode, topic: input.topic }),
      question,
      clipText(input.answer),
      JSON.stringify(safeHistory(input.history)),
      JSON.stringify(safeJson(input.requestPayload)),
      JSON.stringify(safeJson(responseMeta)),
      input.model || null,
      input.status || "ok",
      clipText(input.error, 1_000),
      Number.isFinite(input.spent as number) ? input.spent : null,
      Number.isFinite(input.balanceAfter as number) ? input.balanceAfter : null,
      Number.isFinite(input.durationMs as number) ? input.durationMs : null,
      !!input.cached,
      JSON.stringify(safeJson(input.profileSnapshot)),
      JSON.stringify(safeJson(input.pillarsSnapshot)),
      clipText(input.packetHash, 128),
      JSON.stringify(safeJson(input.packetSnapshotSafe)),
      clipText(input.contextHash, 128),
      clipText(input.promptHash, 128),
      clipText(input.promptVersion, 500),
      JSON.stringify(safeJson(input.knowledgeHashes)),
      clipText(input.factLock, 1_000),
      clipText(input.pillarLock, 1_000),
      threadId,
      threadProfileId,
      JSON.stringify(safeJson(input.historyProfileIds)),
      clipText(input.identityCheckResult, 80),
      clipText(predictionPhase, 80),
      JSON.stringify(safeJson(input.predictionRows)),
      Number.isFinite(input.historyDroppedCount as number) ? input.historyDroppedCount : null,
      clipText(input.profileBindingStatus, 80),
      clipText(input.auditQuality, 80),
    ]
  );
  if (userId) {
    q1<{ id: string }>(`UPDATE users SET last_active_at=now() WHERE id=$1 RETURNING id`, [userId]).catch(() => null);
  }
  return row?.id || null;
}

export function logResearchAiMessageSafe(input: Parameters<typeof logResearchAiMessage>[0]): void {
  logResearchAiMessage(input).catch((e) => {
    console.warn("[research-log] ai message failed:", e instanceof Error ? e.message : e);
  });
}

export async function logResearchEvent(input: {
  session: Session | null;
  req?: Request;
  eventName: string;
  pagePath?: string | null;
  referrer?: string | null;
  sessionKey?: string | null;
  profileId?: string | null;
  payload?: unknown;
}): Promise<string | null> {
  const meta = requestMeta(input.req);
  const row = await q1<{ id: string }>(
    `INSERT INTO research_events
       (org_id, user_id, profile_id, event_name, page_path, referrer,
        session_key, ip_address, user_agent, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING id`,
    [
      input.session?.orgId || null,
      input.session?.userId || null,
      cleanUuid(input.profileId),
      input.eventName,
      clipText(input.pagePath, 1_000),
      clipText(input.referrer || meta.referrer, 1_000),
      clipText(input.sessionKey, 160),
      meta.ip,
      clipText(meta.ua, 1_000),
      JSON.stringify(safeJson(input.payload)),
    ]
  );
  if (input.session?.userId) {
    q1<{ id: string }>(`UPDATE users SET last_active_at=now() WHERE id=$1 RETURNING id`, [input.session.userId]).catch(() => null);
  }
  return row?.id || null;
}

export function logResearchEventSafe(input: Parameters<typeof logResearchEvent>[0]): void {
  logResearchEvent(input).catch((e) => {
    console.warn("[research-log] event failed:", e instanceof Error ? e.message : e);
  });
}
