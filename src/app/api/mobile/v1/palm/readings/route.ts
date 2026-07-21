import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { publicAiPayload } from "@/lib/public-ai-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES = new Set(["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]);

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const rawProfile = new URL(req.url).searchParams.get("profile_id") || "";
  if (rawProfile && !UUID.test(rawProfile)) return NextResponse.json({ ok: false, error: "bad_profile_id" }, { status: 400 });
  const rows = await q<{ id:string;profile_id:string|null;lang:string;clarity:number|null;created_at:string }>(
    `SELECT id::text,profile_id::text,lang,clarity,created_at::text
       FROM palm_readings
      WHERE user_id=$1 AND ($2::uuid IS NULL OR profile_id=$2::uuid)
      ORDER BY created_at DESC LIMIT 30`,
    [session.userId, rawProfile || null]
  );
  return NextResponse.json({ ok: true, readings: rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id || "").trim();
  const profileId = String(body.profile_id || "").trim();
  if (!UUID.test(jobId) || !UUID.test(profileId)) return NextResponse.json({ ok: false, error: "bad_reference" }, { status: 400 });
  const profile = await q1<{ id:string }>(
    `SELECT id::text FROM profiles
      WHERE id=$1::uuid AND created_by_user_id=$2 AND COALESCE(is_archived,false)=false`,
    [profileId, session.userId]
  );
  if (!profile) return NextResponse.json({ ok: false, error: "profile_not_available" }, { status: 404 });
  const job = await q1<{ result:Record<string,unknown>;lang:string|null;engine:string|null }>(
    `SELECT result,lang,engine FROM palm_jobs WHERE id=$1::uuid AND user_id=$2 AND status='done'`,
    [jobId, session.userId]
  );
  const reading = job?.result && typeof job.result.reading === "object" ? job.result.reading : null;
  if (!job || !reading) return NextResponse.json({ ok: false, error: "completed_job_required" }, { status: 409 });
  const clarityRaw = Number(job.result.clarity_overall);
  const clarity = Number.isFinite(clarityRaw) ? Math.max(0, Math.min(100, Math.round(clarityRaw))) : null;
  const lang = LOCALES.has(String(job.lang || "")) ? String(job.lang) : "en";
  await q(
    `INSERT INTO palm_readings(id,user_id,org_id,lang,reading,clarity,engine,profile_id)
     VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,$8::uuid)
     ON CONFLICT(id) DO NOTHING`,
    [jobId, session.userId, session.orgId || null, lang, JSON.stringify(reading), clarity, job.engine, profileId]
  );
  const saved = await q1<{ id:string }>(`SELECT id::text FROM palm_readings WHERE id=$1::uuid AND user_id=$2`, [jobId, session.userId]);
  if (!saved) return NextResponse.json({ ok: false, error: "reading_bound_to_other_account" }, { status: 409 });
  return NextResponse.json(publicAiPayload({ ok: true, id: saved.id, clarity }), { status: 201 });
}
