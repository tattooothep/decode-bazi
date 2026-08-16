import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  ZibaiStateError,
  mutateZibaiInstallation,
  parseZibaiMutation,
  readZibaiInstallation,
} from "@/lib/mobile-zibai-installation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorize(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return { ok: false as const, error: "not_authorized", status: 401 };
  const limited = await rateLimit(`mobile-zibai:${session.userId}:${clientIp(req)}`, 30, 60_000);
  if (!limited.ok) return { ok: false as const, error: "rate_limited", status: 429 };
  return { ok: true as const, session };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const installationId = new URL(req.url).searchParams.get("installation_id") || "";
  try {
    const status = await readZibaiInstallation(pool, auth.session.userId, installationId);
    return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof ZibaiStateError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return NextResponse.json({ ok: false, error: "zibai_status_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const mutation = parseZibaiMutation(await req.json().catch(() => null));
    const status = await mutateZibaiInstallation(pool, auth.session.userId, mutation);
    return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof TypeError) return NextResponse.json({ ok: false, error: "zibai_input_invalid" }, { status: 400 });
    if (error instanceof ZibaiStateError) return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
    return NextResponse.json({ ok: false, error: "zibai_update_failed" }, { status: 500 });
  }
}
