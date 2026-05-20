/**
 * POST /api/houses/qr/generate · Body { house_id?, state_snapshot? }
 * คืน { token, url, expires_in, qr_data }
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { house_id, state_snapshot } = await req.json().catch(() => ({} as any));

  if (house_id) {
    const owns = await q1(`SELECT id FROM ka_houses WHERE id=$1 AND user_id=$2`, [house_id, s.userId]);
    if (!owns) return NextResponse.json({ error: 'House not found' }, { status: 404 });
  }
  const token = crypto.randomBytes(24).toString("hex");
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
  await q(
    `INSERT INTO ka_qr_tokens (token, user_id, house_id, state_snapshot, ip_origin)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [token, s.userId, house_id ?? null, JSON.stringify(state_snapshot ?? {}), ip || null]
  );
  const baseUrl = process.env.PUBLIC_URL || 'https://www.hourkey.io';
  const handoffUrl = `${baseUrl}/compass/qr/${token}`;
  return NextResponse.json({ token, url: handoffUrl, expires_in: 300, qr_data: handoffUrl });
}
