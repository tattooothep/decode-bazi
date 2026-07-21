import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";

type JobView = {
  id: string;
  feature: string;
  status: string;
  progress: unknown;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const job = await q1<JobView>(
    `SELECT id,feature,status,progress,attempts,max_attempts,error_code,
            created_at,started_at,finished_at,updated_at
       FROM hourkey_jobs
      WHERE id=$1 AND user_id=$2`,
    [id, session.userId]
  );
  if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, job }, { headers: { "Cache-Control": "no-store" } });
}
