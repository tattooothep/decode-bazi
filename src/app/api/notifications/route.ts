import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401, headers: NO_STORE });
  const rows = await q<Record<string, unknown>>(
    `SELECT id::text,event_type,severity,title,body,target_url,read_at,created_at
       FROM notification_inbox WHERE recipient_user_id=$1
      ORDER BY created_at DESC LIMIT 100`,
    [session.userId]
  );
  const unread = rows.reduce((n, row) => n + (row.read_at ? 0 : 1), 0);
  return NextResponse.json({ ok: true, unread, rows }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401, headers: NO_STORE });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || "").trim();
  if (body.all === true) {
    await q(`UPDATE notification_inbox SET read_at=COALESCE(read_at,now()) WHERE recipient_user_id=$1`, [session.userId]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400, headers: NO_STORE });
  await q(
    `UPDATE notification_inbox SET read_at=COALESCE(read_at,now()) WHERE id=$1::uuid AND recipient_user_id=$2`,
    [id, session.userId]
  );
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
