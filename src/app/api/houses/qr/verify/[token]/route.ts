/**
 * GET /api/houses/qr/verify/:token · ไม่ต้อง auth (token = auth)
 * คืน user_id + house + state_snapshot · mark used
 */
import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await q1<{ user_id: string; house_id: number | null; house_name: string | null; lat: number | null; lng: number | null; face_angle: number | null; state_snapshot: unknown }>(
    `SELECT q.user_id, q.house_id, q.state_snapshot,
            h.name AS house_name, h.lat, h.lng, h.face_angle
     FROM ka_qr_tokens q
     LEFT JOIN ka_houses h ON h.id = q.house_id
     WHERE q.token = $1 AND q.expires_at > NOW() AND q.used_at IS NULL`,
    [token]
  );
  if (!row) {
    return NextResponse.json({
      error: 'Token invalid or expired',
      message: 'QR หมดอายุแล้ว · กรุณาสร้างใหม่จาก desktop',
    }, { status: 404 });
  }
  await q(`UPDATE ka_qr_tokens SET used_at = NOW() WHERE token = $1`, [token]);
  return NextResponse.json({
    user_id: row.user_id,
    house: row.house_id ? {
      id: row.house_id, name: row.house_name,
      lat: parseFloat(String(row.lat)), lng: parseFloat(String(row.lng)),
      face_angle: parseFloat(String(row.face_angle)),
    } : null,
    state_snapshot: row.state_snapshot,
  });
}
