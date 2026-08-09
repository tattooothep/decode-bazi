import { shrineJson } from "@/lib/shrine-route-guard";
import {
  FORECOURT_CONTENT_ID,
  FORECOURT_PHYSICS_SCHEMA,
  ForecourtAccountUnavailable,
  ForecourtCapabilityMismatch,
  ForecourtDailyLimitReached,
  ForecourtIdempotencyConflict,
  ForecourtImpactError,
  ForecourtInputError,
  ForecourtPrepareReplayRejected,
  ForecourtThrowConflict,
  ForecourtTicketError,
  assertForecourtCapability,
} from "@/lib/shrine-forecourt-v195";

export const FORECOURT_MAX_BODY_BYTES = 8 * 1024;

export function forecourtDisabledResponse() {
  return process.env.SHRINE_FORECOURT_V195_ENABLED === "1"
    ? null
    : shrineJson({ ok: false, error: "forecourt_authority_disabled" }, 503);
}

export function forecourtAuthoritySecret(): string {
  const secret = String(process.env.SHRINE_FORECOURT_AUTHORITY_SECRET || "");
  if (secret.length < 32) throw new Error("forecourt_secret_required");
  return secret;
}

export async function readForecourtJsonBody(request: Request): Promise<unknown> {
  const header = request.headers.get("content-length");
  if (header !== null) {
    const length = Number(header);
    if (!Number.isSafeInteger(length) || length < 0 || length > FORECOURT_MAX_BODY_BYTES) {
      throw new ForecourtInputError("body_size");
    }
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > FORECOURT_MAX_BODY_BYTES) {
    throw new ForecourtInputError("body_size");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new ForecourtInputError("body");
  }
}

export function assertForecourtStateQuery(request: Request): void {
  const query = new URL(request.url).searchParams;
  const keys = [...query.keys()].sort();
  if (
    keys.length !== 2
    || keys[0] !== "content_id"
    || keys[1] !== "physics_schema"
    || query.getAll("content_id").length !== 1
    || query.getAll("physics_schema").length !== 1
  ) {
    throw new ForecourtInputError("query");
  }
  assertForecourtCapability(query.get("content_id"), query.get("physics_schema"));
}

export function forecourtErrorResponse(error: unknown) {
  if (error instanceof ForecourtDailyLimitReached) {
    return shrineJson(
      { ok: false, error: error.message, projection: error.projection },
      409,
    );
  }
  if (error instanceof ForecourtCapabilityMismatch) {
    return shrineJson(
      {
        ok: false,
        error: error.message,
        required: {
          content_id: FORECOURT_CONTENT_ID,
          physics_schema: FORECOURT_PHYSICS_SCHEMA,
        },
      },
      409,
    );
  }
  if (error instanceof ForecourtInputError) {
    return shrineJson({ ok: false, error: error.message }, 400);
  }
  if (error instanceof ForecourtImpactError) {
    return shrineJson({ ok: false, error: error.message }, 422);
  }
  if (error instanceof ForecourtPrepareReplayRejected) {
    return shrineJson(
      { ok: false, error: error.message, projection: error.projection },
      error.message === "forecourt_ticket_expired" ? 410 : 409,
    );
  }
  if (error instanceof ForecourtTicketError) {
    return shrineJson(
      { ok: false, error: error.message },
      error.message === "forecourt_ticket_expired" ? 410 : 409,
    );
  }
  if (error instanceof ForecourtIdempotencyConflict || error instanceof ForecourtThrowConflict) {
    return shrineJson({ ok: false, error: error.message }, 409);
  }
  if (error instanceof ForecourtAccountUnavailable) {
    return shrineJson({ ok: false, error: error.message }, 404);
  }
  console.error(
    "forecourt_authority_unavailable",
    error instanceof Error ? error.message : "unknown",
  );
  return shrineJson({ ok: false, error: "forecourt_authority_unavailable" }, 503);
}
