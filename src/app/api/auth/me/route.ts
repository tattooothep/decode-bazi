import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 200 });
  const user = await q1<{ id: string; email: string; name: string; locale: string; theme: string }>(
    "SELECT id, email, name, locale, theme FROM users WHERE id=$1",
    [s.userId]
  );
  return NextResponse.json({ user, session: s });
}
