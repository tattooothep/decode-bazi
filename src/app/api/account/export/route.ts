/**
 * GET /api/account/export · Account Phase 1 (r378 · 3 ก.ค. 2026) · PDPA data portability
 * รวมข้อมูลของ user เป็น JSON เดียว download:
 *  - user (ตัด password_hash / avatar bytea / deleted_snapshot ออก)
 *  - profiles (ดวงที่สร้างเอง + ใน org ตัวเอง)
 *  - ประวัติถามซินแส (chart_sifu_history · ตัดเนื้อยาว 2,000 ตัวอักษร/ฟิลด์)
 *  - ธุรกรรม 時 (hour_transactions)
 *  - อุปกรณ์ (user_devices)
 * rate limit 6 ครั้ง/ชม. (query หลายตาราง)
 */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getAccountUser } from "@/lib/account-utils";

const CLIP = 2000;
const clip = (s: unknown) => {
  const t = String(s ?? "");
  return t.length > CLIP ? t.slice(0, CLIP) + ` …[ตัดที่ ${CLIP} ตัวอักษร]` : t;
};

export async function GET() {
  const acc = await getAccountUser();
  if (!acc) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const { u } = acc;

  const rl = await rateLimit(`acct-export:${u.id}`, 6, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "ขอ export บ่อยเกินไป กรุณารอสักครู่" }, { status: 429 });
  }

  const [profiles, sifuHistory, transactions, devices] = await Promise.all([
    q(
      `SELECT id, name, nickname, gender, relationship_type, birth_datetime,
              birth_lat, birth_lng, birth_location_name, birth_time_known,
              day_master, day_master_strength, bazi_pillars, notes,
              network_group, is_archived, created_at
         FROM profiles
        WHERE created_by_user_id = $1
           OR org_id IN (SELECT id FROM organizations WHERE owner_user_id = $1)
        ORDER BY created_at`,
      [u.id]
    ),
    q<{ id: string; question: string; answer: string }>(
      `SELECT id, profile_id, lang, question, answer, created_at
         FROM chart_sifu_history
        WHERE user_id = $1
        ORDER BY created_at`,
      [u.id]
    ),
    q(
      `SELECT id, delta, reason, balance_after, ref_feature, note, created_at
         FROM hour_transactions
        WHERE user_id = $1
        ORDER BY created_at`,
      [u.id]
    ),
    q(
      `SELECT id, ua, ip_hash, first_seen, last_seen
         FROM user_devices
        WHERE user_id = $1
        ORDER BY last_seen DESC`,
      [u.id]
    ),
  ]);

  const payload = {
    format: "hourkey-account-export",
    version: 1,
    exported_at: new Date().toISOString(),
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      locale: u.locale,
      timezone: u.timezone,
      theme: u.theme,
      tier: u.tier,
      hour_balance: u.hour_balance,
      sub_expires_at: u.sub_expires_at,
      avatar_url: u.avatar_url,
      google_linked: !!u.google_user_id,
      line_linked: !!u.line_user_id,
      created_at: u.created_at,
    },
    profiles,
    sifu_history: sifuHistory.map((h) => ({ ...h, question: clip(h.question), answer: clip(h.answer) })),
    hour_transactions: transactions,
    devices,
  };

  const fname = `hourkey-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
