import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  parseSavedDatePayload,
  publicSavedDate,
  readSavedDateBody,
  type SavedDateRow,
} from "../saved-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session?.orgId) {
    return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  }

  const limited = await rateLimit(`mobile-datepick-save:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "บันทึกฤกษ์ถี่เกินไป · กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  const decoded = await readSavedDateBody(req);
  if (!decoded.body) {
    return NextResponse.json({ ok: false, error: decoded.error }, { status: decoded.status || 400 });
  }
  const parsed = parseSavedDatePayload(decoded.body);
  if (!parsed.payload) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const row = await q1<SavedDateRow>(
      `INSERT INTO mobile_saved_dates (org_id, user_id, payload)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, payload, created_at::text`,
      [session.orgId, session.userId, JSON.stringify(parsed.payload)]
    );
    return NextResponse.json(
      { ok: true, saved_date: row ? publicSavedDate(row) : null },
      { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[mobile/v1/datepick/save]", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "save_date_failed" }, { status: 500 });
  }
}
