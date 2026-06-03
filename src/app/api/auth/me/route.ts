import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 200 });
  const user = await q1<{
    id: string;
    email: string;
    name: string;
    locale: string;
    theme: string;
    avatar_url: string | null;
    line_user_id: string | null;
    google_user_id: string | null;
  }>(
    "SELECT id, email, name, locale, theme, avatar_url, line_user_id, google_user_id FROM users WHERE id=$1",
    [s.userId]
  );
  return NextResponse.json(
    { user, session: s },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function PUT(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "กรุณากรอกชื่อบัญชี" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "ชื่อบัญชียาวเกินไป" }, { status: 400 });
  }

  const user = await q1<{
    id: string;
    email: string;
    name: string;
    locale: string;
    theme: string;
    avatar_url: string | null;
    line_user_id: string | null;
    google_user_id: string | null;
  }>(
    `UPDATE users
        SET name=$2, last_active_at=now()
      WHERE id=$1
      RETURNING id, email, name, locale, theme, avatar_url, line_user_id, google_user_id`,
    [s.userId, name]
  );
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  return NextResponse.json(
    { ok: true, user },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
