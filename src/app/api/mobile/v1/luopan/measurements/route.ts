import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { evaluateMobileLuopanMeasurement, type NorthReference } from "@/lib/mobile-luopan";

export const dynamic = "force-dynamic";
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,120}$/;

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const rows = await q(
    `SELECT id::text,house_id,client_measurement_id,method,north_reference,heading_deg,
            accuracy_class,accuracy_deg,sample_count,circular_std_deg,repeat_spread_deg,
            max_tilt_deg,facing_mountain,sitting_mountain,boundary_distance_deg,
            quality_status,quality_reasons,formula_version,created_at
       FROM mobile_luopan_measurements WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [session.userId]
  );
  return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const clientId = String(body.client_measurement_id || "").trim();
  if (!CLIENT_ID_RE.test(clientId)) return NextResponse.json({ ok: false, error: "client_measurement_id required" }, { status: 400 });
  const method = body.method === "manual" || body.method === "map" ? body.method : "sensor";
  const northReference = (["magnetic", "true", "manual", "map_true"].includes(String(body.north_reference))
    ? body.north_reference : "magnetic") as NorthReference;
  const gate = evaluateMobileLuopanMeasurement({
    headingDeg: Number(body.heading_deg), northReference, method,
    accuracyClass: Number(body.accuracy_class), accuracyDeg: Number(body.accuracy_deg),
    sampleCount: Number(body.sample_count), circularStdDeg: Number(body.circular_std_deg),
    repeatSpreadDeg: Number(body.repeat_spread_deg), maxTiltDeg: Number(body.max_tilt_deg),
  });
  const saveLocation = body.save_location === true;
  const latitude = saveLocation && Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null;
  const longitude = saveLocation && Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null;
  const houseId = /^\d+$/.test(String(body.house_id || "")) ? String(body.house_id) : null;
  if (houseId) {
    const owned = await q1(`SELECT id FROM ka_houses WHERE id=$1::bigint AND user_id=$2`, [houseId, session.userId]);
    if (!owned) return NextResponse.json({ ok: false, error: "house not found" }, { status: 404 });
  }
  const row = await q1<Record<string, unknown>>(
    `INSERT INTO mobile_luopan_measurements
      (user_id,house_id,client_measurement_id,method,north_reference,heading_deg,
       true_heading_deg,magnetic_heading_deg,declination_deg,accuracy_class,accuracy_deg,
       sample_count,circular_std_deg,repeat_spread_deg,max_tilt_deg,facing_mountain,
       sitting_mountain,boundary_distance_deg,quality_status,quality_reasons,
       latitude,longitude,location_accuracy_m,formula_version)
     VALUES ($1,$2::bigint,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::text[],$21,$22,$23,$24)
     ON CONFLICT(user_id,client_measurement_id) DO UPDATE SET client_measurement_id=EXCLUDED.client_measurement_id
     RETURNING id::text,quality_status,quality_reasons,heading_deg,facing_mountain,sitting_mountain,created_at`,
    [session.userId,houseId,clientId,method,northReference,gate.headingDeg,
     Number.isFinite(Number(body.true_heading_deg)) ? Number(body.true_heading_deg) : null,
     Number.isFinite(Number(body.magnetic_heading_deg)) ? Number(body.magnetic_heading_deg) : null,
     Number.isFinite(Number(body.declination_deg)) ? Number(body.declination_deg) : null,
     Number.isFinite(Number(body.accuracy_class)) ? Number(body.accuracy_class) : null,
     Number.isFinite(Number(body.accuracy_deg)) ? Number(body.accuracy_deg) : null,
     Number(body.sample_count) || 0,Number.isFinite(Number(body.circular_std_deg)) ? Number(body.circular_std_deg) : null,
     Number.isFinite(Number(body.repeat_spread_deg)) ? Number(body.repeat_spread_deg) : null,
     Number.isFinite(Number(body.max_tilt_deg)) ? Number(body.max_tilt_deg) : null,
     gate.facingMountain.name,gate.sittingMountain.name,gate.boundaryDistanceDeg,
     gate.pass ? "pass" : "fail",gate.reasons,latitude,longitude,
     saveLocation && Number.isFinite(Number(body.location_accuracy_m)) ? Number(body.location_accuracy_m) : null,
     "luopan-core-v1-xuankong-chart-v1"]
  );
  return NextResponse.json({ ok: true, measurement: row, gate }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
}

