import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanHouseId(value: string | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const houseId = cleanHouseId(url.searchParams.get("house_id"));
  if (!houseId) {
    return NextResponse.json({ ok: false, error: "bad_house_id" }, { status: 400 });
  }
  const datetimeRaw = url.searchParams.get("datetime");
  const datetime = datetimeRaw ? new Date(datetimeRaw) : new Date();
  if (!Number.isFinite(datetime.getTime())) {
    return NextResponse.json({ ok: false, error: "bad_datetime" }, { status: 400 });
  }

  // Fail closed before forwarding so another account's house can never become
  // an apparently valid empty snapshot.
  const owned = await q1<{ id: number }>(
    `SELECT id FROM ka_houses WHERE id=$1 AND user_id=$2`,
    [houseId, session.userId]
  );
  if (!owned) {
    return NextResponse.json({ ok: false, error: "house_not_found" }, { status: 404 });
  }

  const upstreamUrl = new URL("/api/fengshui-snapshot", internalAppOrigin(req));
  upstreamUrl.searchParams.set("house_id", String(houseId));
  upstreamUrl.searchParams.set("datetime", datetime.toISOString());
  const upstream = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: { Accept: "application/json", Cookie: `decode_auth=${bearer}` },
  });
  const raw = await upstream.json().catch(() => ({ error: "invalid_snapshot_response" })) as Record<string, unknown>;
  const { source: _source, ...data } = raw;
  return NextResponse.json({ ok: upstream.ok, ...data }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
