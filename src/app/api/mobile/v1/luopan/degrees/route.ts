/**
 * GET /api/mobile/v1/luopan/degrees?degree=0[&facing_deg=0&year=2026&timing=era&profile_id=uuid]
 *
 * Read-only BFF for the direction explorer. `degree` is always the absolute
 * compass/ring bearing (0=N), never the browser's rotated cursor coordinate.
 * The server calls the canonical /api/luopan/degrees engine and returns only
 * the selected row plus the same five leading/five caution rows used by web.
 */
import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import {
  parseMobileLuopanDegreesInput,
  projectMobileLuopanDegreesResponse,
} from "@/lib/mobile-luopan-degrees-contract";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const CANONICAL_TIMEOUT_MS = 10_000;

function canonicalCookie(req: Request): string {
  const bearer = mobileBearerToken(req);
  return bearer ? `decode_auth=${bearer}` : req.headers.get("cookie") || "";
}

function json(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) return json({ ok: false, error: "not_logged_in" }, 401);

  const limited = await rateLimit(`mobile-luopan-degrees:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return json(
      { ok: false, error: "rate_limited" },
      429,
      { "Retry-After": String(Math.max(1, Math.ceil(limited.retryAfterMs / 1000))) },
    );
  }

  const parsed = parseMobileLuopanDegreesInput(new URL(req.url), new Date().getFullYear());
  if (!parsed.ok) return json({ ok: false, error: "invalid_request", detail: parsed.error }, 400);
  const input = parsed.input;

  if (input.profileId) {
    if (!UUID_RE.test(input.profileId)) return json({ ok: false, error: "invalid_profile_id" }, 400);
    const owned = await q1<{ id: string }>(
      `SELECT id::text
         FROM profiles
        WHERE id=$1
          AND org_id=$2
          AND created_by_user_id=$3
          AND COALESCE(is_archived,false)=false`,
      [input.profileId, session.orgId, session.userId],
    );
    if (!owned) return json({ ok: false, error: "profile_not_found" }, 404);
  }

  const origin = internalAppOrigin(req);
  const cookie = canonicalCookie(req);
  let upstream: Response;
  let upstreamValue: unknown;
  let receivedHeaders = false;
  let timedOut = false;
  const upstreamAbort = new AbortController();
  const abortUpstream = () => upstreamAbort.abort();
  if (req.signal.aborted) abortUpstream();
  else req.signal.addEventListener("abort", abortUpstream, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    upstreamAbort.abort();
  }, CANONICAL_TIMEOUT_MS);
  try {
    upstream = await fetch(`${origin}/api/luopan/degrees`, {
      method: "POST",
      cache: "no-store",
      signal: upstreamAbort.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        facing_deg: input.facingDeg,
        year: input.year,
        timing: input.timing,
        profile_id: input.profileId,
        // Preview deliberately has no pins: it cannot create, save, or mutate house evidence.
        pins: [],
      }),
    });
    receivedHeaders = true;
    // Keep the same abort/timeout boundary through body consumption, not only headers.
    upstreamValue = await upstream.json();
  } catch {
    return json(
      {
        ok: false,
        error: timedOut ? "canonical_engine_timeout" : receivedHeaders ? "canonical_engine_invalid_response" : "canonical_engine_unavailable",
        source: "/api/luopan/degrees",
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", abortUpstream);
  }

  if (!upstream.ok) {
    const upstreamBody = upstreamValue && typeof upstreamValue === "object"
      ? upstreamValue as Record<string, unknown>
      : {};
    return json(
      { ok: false, error: String(upstreamBody.error || "canonical_engine_error"), source: "/api/luopan/degrees" },
      upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502,
    );
  }

  const projected = projectMobileLuopanDegreesResponse(upstreamValue, input);
  if (!projected.ok) {
    return json({ ok: false, error: projected.error, source: "/api/luopan/degrees" }, 502);
  }
  return json(projected.value);
}
