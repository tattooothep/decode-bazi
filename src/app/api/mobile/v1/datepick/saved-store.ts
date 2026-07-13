const ACTIVITY_TYPES = new Set(["立約", "開市", "出行", "求財", "婚姻", "搬家", "動土", "祭祀"]);
const PILLAR_KEYS = ["year", "month", "day", "hour"] as const;
export const MAX_SAVED_DATE_BODY_BYTES = 64 * 1024;

export type SavedDatePayload = {
  candidateId?: string;
  activityType: string;
  datetime: { start: string; end: string };
  pillars: Record<string, string | { stem?: string; branch?: string }>;
  summary: string;
};

export type SavedDateRow = {
  id: string;
  payload: SavedDatePayload;
  created_at: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, max: number): string | null {
  const text = typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "") : "";
  return text ? text.slice(0, max) : null;
}

function cleanDateTime(value: unknown): string | null {
  const text = cleanText(value, 64);
  if (
    !text
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)
    || !Number.isFinite(Date.parse(text))
  ) return null;
  return text;
}

function cleanPillars(value: unknown): SavedDatePayload["pillars"] | null {
  const raw = record(value);
  if (!raw) return null;
  const result: SavedDatePayload["pillars"] = {};

  for (const key of PILLAR_KEYS) {
    const item = raw[key];
    if (typeof item === "string") {
      const text = cleanText(item, 16);
      if (text) result[key] = text;
      continue;
    }
    const obj = record(item);
    if (!obj) continue;
    const stem = cleanText(obj.stem, 4) || undefined;
    const branch = cleanText(obj.branch, 4) || undefined;
    if (stem || branch) result[key] = { stem, branch };
  }

  return Object.keys(result).length ? result : null;
}

export async function readSavedDateBody(
  req: Request
): Promise<{ body?: Record<string, unknown>; error?: string; status?: number }> {
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_SAVED_DATE_BODY_BYTES) {
    return { error: "saved_date_payload_too_large", status: 413 };
  }
  try {
    const parsed = JSON.parse(text || "{}");
    const body = record(parsed);
    return body ? { body } : { error: "saved_date_payload_invalid", status: 400 };
  } catch {
    return { error: "saved_date_payload_invalid", status: 400 };
  }
}

export function parseSavedDatePayload(
  body: Record<string, unknown>
): { payload?: SavedDatePayload; error?: string } {
  const activityType = cleanText(body.activityType, 32);
  if (!activityType || !ACTIVITY_TYPES.has(activityType)) return { error: "activityType_invalid" };

  const datetime = record(body.datetime);
  const start = cleanDateTime(datetime?.start);
  const end = cleanDateTime(datetime?.end);
  if (!start || !end || Date.parse(end) < Date.parse(start)) return { error: "datetime_invalid" };

  const pillars = cleanPillars(body.pillars);
  if (!pillars) return { error: "pillars_required" };

  const summary = cleanText(body.summary, 2_000);
  if (!summary) return { error: "summary_required" };

  const candidateId = cleanText(body.candidateId, 160) || undefined;
  return {
    payload: {
      ...(candidateId ? { candidateId } : {}),
      activityType,
      datetime: { start, end },
      pillars,
      summary,
    },
  };
}

export function publicSavedDate(row: SavedDateRow) {
  return {
    id: row.id,
    candidateId: row.payload.candidateId || null,
    activityType: row.payload.activityType,
    datetime: row.payload.datetime,
    pillars: row.payload.pillars,
    summary: row.payload.summary,
    created_at: row.created_at,
  };
}
