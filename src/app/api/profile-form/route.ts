import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import crypto from "node:crypto";

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return redirect303("/login?err=" + encodeURIComponent("กรุณาเข้าสู่ระบบก่อน"));

  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const birthDate = String(form.get("birthDate") || "");
  const birthTime = String(form.get("birthTime") || "12:00");
  const locationName = String(form.get("locationName") || "Bangkok");
  const gender = String(form.get("gender") || "M");
  if (!name || !birthDate) return redirect303("/onboarding?err=" + encodeURIComponent("กรอก ชื่อ + วันเกิด"));

  // Compute BaZi via shared helper (TST applied · single source of truth)
  const { calcBazi } = await import("@/lib/bazi-calc");
  const calc = await calcBazi({
    date: birthDate,
    time: birthTime,
    longitude: 100.5018, // TODO: parse from form when location autocomplete added
    gmtOffsetHours: 7,
    gender: gender as "M" | "F" | undefined,
  });
  const natal = calc.pillars;
  const yong = { strength: calc.strength, yongshenFinal: calc.yongshen, climate: { climate: calc.climate } };
  const ge = { structure: calc.geJu.structure };

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
      id, s.orgId, s.userId, name, null,
      isoDt, "13.7563", "100.5018", locationName, gender,
      natal.day.stem, yong.strength.level,
      JSON.stringify({ top3: yong.yongshenFinal, climate: yong.climate.climate }),
      JSON.stringify({ pillars: natal, ge_ju: ge.structure }),
    ]
  );

  return redirect303("/dashboard");
}
