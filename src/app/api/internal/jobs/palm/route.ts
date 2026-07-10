import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { processPalmJob, type PalmJobPayload } from "@/lib/palm/job-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { jobId?: unknown };
  const jobId = String(body.jobId || "");
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ ok: false, error: "bad_job_id" }, { status: 400 });

  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [`palm-worker:${jobId}`]
    );
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return NextResponse.json({ ok: false, error: "already_running" }, { status: 409 });

    const result = await client.query<{ status: string; payload: PalmJobPayload | null }>(
      `SELECT status,payload FROM palm_jobs WHERE id=$1`,
      [jobId]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
    if (row.status === "done" || row.status === "error") {
      return NextResponse.json({ ok: true, terminal: true, status: row.status });
    }
    if (!row.payload) return NextResponse.json({ ok: false, error: "payload_missing" }, { status: 422 });

    await client.query(
      `UPDATE palm_jobs SET status='running',attempt_count=attempt_count+1,heartbeat_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]
    );
    await client.query(
      `UPDATE hourkey_jobs SET status='running',attempts=attempts+1,started_at=COALESCE(started_at,now()),heartbeat_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]
    );
    await processPalmJob(row.payload);
    const final = await client.query<{ status: string }>(`SELECT status FROM palm_jobs WHERE id=$1`, [jobId]);
    return NextResponse.json({ ok: true, status: final.rows[0]?.status || "unknown" });
  } finally {
    if (locked) await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`palm-worker:${jobId}`]).catch(() => {});
    client.release();
  }
}
