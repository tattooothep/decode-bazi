/**
 * GET  /api/profile      → list my profiles
 * POST /api/profile      → create new profile + auto-compute BaZi via wrappers
 *
 * Body: { name, nickname?, birthDate, birthTime, birthLat?, birthLng?, locationName?, gender? }
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import crypto from "node:crypto";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const rows = await q(
    `SELECT id, name, nickname, birth_datetime, birth_location_name, gender,
            day_master, day_master_strength, yongshen, bazi_pillars, is_archived, created_at
     FROM profiles
     WHERE org_id=$1 AND is_archived=false
     ORDER BY created_at DESC`,
    [s.orgId]
  );
  return NextResponse.json({ profiles: rows });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, nickname, birthDate, birthTime = "12:00", birthLat, birthLng, locationName, gender } = body;
  if (!name || !birthDate)
    return NextResponse.json({ error: "name + birthDate required" }, { status: 400 });

  // Compute BaZi via tyme4ts + wrappers
  const tyme = await import("tyme4ts");
  const w3 = await import("../../../../data/library/wrappers/3-ge-ju.js");
  const w6 = await import("../../../../data/library/wrappers/6-strength-yongshen.js");

  const [yy, mm, dd] = birthDate.split("-").map(Number);
  const [hh, mn] = birthTime.split(":").map(Number);
  const ec = tyme.SolarTime.fromYmdHms(yy, mm, dd, hh, mn, 0).getLunarHour().getEightChar();
  const yp = ec.getYear().getName();
  const mpc = ec.getMonth().getName();
  const dp = ec.getDay().getName();
  const hp = ec.getHour().getName();
  const natal = {
    year:  { stem: yp[0], branch: yp[1] },
    month: { stem: mpc[0], branch: mpc[1] },
    day:   { stem: dp[0], branch: dp[1] },
    hour:  { stem: hp[0], branch: hp[1] },
  };

  const yong = w6.bridgeYongshen(natal);
  const ge = w3.inferGeJu(natal);

  const id = crypto.randomUUID();
  const isoDt = `${birthDate}T${birthTime}:00+07:00`;
  await q1(
    `INSERT INTO profiles (
       id, org_id, created_by_user_id, name, nickname,
       birth_datetime, birth_lat, birth_lng, birth_location_name, gender,
       day_master, day_master_strength, yongshen, bazi_pillars,
       birth_source, is_archived, created_at
     ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, $11,$12,$13,$14, 'self_reported',false,now())`,
    [
      id, s.orgId, s.userId, name, nickname || null,
      isoDt, birthLat || null, birthLng || null, locationName || null, gender || null,
      natal.day.stem, yong.strength.level,
      JSON.stringify({ top3: yong.yongshenFinal, climate: yong.climate.climate }),
      JSON.stringify({ pillars: natal, ge_ju: ge.structure }),
    ]
  );

  return NextResponse.json({
    ok: true,
    profile: {
      id,
      name,
      pillars: natal,
      ge_ju: ge.structure,
      day_master: natal.day.stem,
      strength: yong.strength.percent,
      yongshen: yong.yongshenFinal,
      climate: yong.climate.climate,
    },
  });
}
