import { q1 } from "./db";
import type { Session } from "./auth";
import type { SifuSourceAuditRecord } from "./sifu-source-audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function clipText(v: unknown, max = 4_000): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) + "\n...[clipped]" : s;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return JSON.stringify({ _unserializable: true });
  }
}

function requestMeta(req?: Request) {
  if (!req) return { ip_address: null, user_agent: null, referrer: null };
  return {
    ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || null,
    user_agent: clipText(req.headers.get("user-agent"), 1_000),
    referrer: clipText(req.headers.get("referer"), 1_000),
  };
}

export async function logSifuSourceAudit(input: {
  session: Session | null;
  req?: Request;
  record: SifuSourceAuditRecord;
}): Promise<string | null> {
  const record = input.record;
  const meta = requestMeta(input.req);
  const row = await q1<{ id: string }>(
    `INSERT INTO research_ai_source_audits
       (research_ai_message_id, audit_run_id, org_id, user_id, profile_id,
        feature, route, mode, topic, lang, model, cached, status, error,
        prompt_hash, context_hash, packet_hash, answer_hash, candidate_plan_hash,
        source_manifest_hash, prompt_source_map_hash, router_hash, source_manifest,
        included_sources, preselected_sources, selected_chunk_ids, selection_reasons,
        answer_supported_by, model_claimed_used, request_meta)
     VALUES ($1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,
        $20,$21,$22,$23::jsonb,
        $24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,
        $28::jsonb,$29::jsonb,$30::jsonb)
     RETURNING id`,
    [
      cleanUuid(record.researchAiMessageId),
      record.auditRunId,
      input.session?.orgId || null,
      input.session?.userId || null,
      cleanUuid(record.profileId),
      record.feature,
      clipText(record.route, 80),
      clipText(record.mode, 80),
      clipText(record.topic, 120),
      record.lang || "th",
      clipText(record.model, 120),
      !!record.cached,
      record.status,
      clipText(record.error, 1_000),
      clipText(record.promptHash, 128),
      clipText(record.contextHash, 128),
      clipText(record.packetHash, 128),
      clipText(record.answerHash, 128),
      clipText(record.candidatePlanHashSha256, 128),
      clipText(record.sourceManifestHash, 128),
      clipText(record.promptSourceMapHash, 128),
      clipText(record.routerHashSha256, 128),
      safeJson(record.sourceManifest),
      safeJson(record.includedSources),
      safeJson(record.preselectedSources),
      safeJson(record.selectedChunkIds),
      safeJson(record.selectionReasons),
      safeJson(record.answerSupportedBy),
      safeJson(record.modelClaimedUsed),
      safeJson(meta),
    ]
  );
  return row?.id || null;
}

export function logSifuSourceAuditSafe(input: Parameters<typeof logSifuSourceAudit>[0]): void {
  logSifuSourceAudit(input).catch((e) => {
    console.warn("[sifu-source-audit] log failed:", e instanceof Error ? e.message : e);
  });
}
