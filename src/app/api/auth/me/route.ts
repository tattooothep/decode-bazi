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
