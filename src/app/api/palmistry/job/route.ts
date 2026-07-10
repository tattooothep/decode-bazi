/* GET /api/palmistry/job?id=<uuid> · poll ผลงานอ่านลายมือ (async job · r479)
 * เลียนแบบ fusion5 GET: recovery(stale/restart) → deliver-once(seen_at) → คืน result/status
 * ownership:
 *   - row.user_id != null → ต้อง getSession แล้ว userId ตรง (กัน IDOR)
 *   - row.user_id == null (guest) → รู้ uuid = เข้าถึงได้ (reading ชั่วคราว รูปลบแล้ว)
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1, q } from "@/lib/db";
import { rm } from "fs/promises";
import { refundPalmJobBilling } from "@/lib/palm-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠️ ต้องเป็น process-global ร่วมกับ read route (คนละ module แต่ process เดียว) — read route โหลดก่อนเสมอ (POST มาก่อน poll)
// ถ้าตั้งใน job module เอง มันโหลด lazy ตอน poll แรก → อาจ "หลัง" งานที่เพิ่งสร้าง → orphan false-positive กับงานแรกหลัง restart
const _g = globalThis as unknown as { __palmServerStartedAt?: Date };
const SERVER_STARTED_AT: Date = _g.__palmServerStartedAt || (_g.__palmServerStartedAt = new Date());

function cleanId(x: unknown): string | null {
  const s = String(x || "").trim();
  return /^[0-9a-f-]{8,40}$/i.test(s) ? s : null;
}

type PalmJobRow = {
  id: string;
  user_id: string | null;
  status: string;
  result: unknown;
  engine: string | null;
  error: string | null;
  job_dir: string | null;
  created_at: string;
};

/* recovery: งาน running เก่า >25 นาที หรือสร้างก่อน server restart → mark error 'timeout' + ลบรูปค้าง (privacy) */
async function reconcileStaleJob(row: PalmJobRow): Promise<PalmJobRow> {
  const createdMs = new Date(row.created_at).getTime();
  const stale = row.status === "running" && Date.now() - createdMs > 25 * 60_000;
  const orphanedByRestart = row.status === "running" && Number.isFinite(createdMs) && createdMs < SERVER_STARTED_AT.getTime() - 1_000;
  if (!stale && !orphanedByRestart) return row;
  const reason = orphanedByRestart ? "server_restart_orphan" : "timeout";
  await q(`UPDATE palm_jobs SET status='error', error=$2, updated_at=now() WHERE id=$1 AND status='running'`, [row.id, reason]).catch(() => {});
  await refundPalmJobBilling(row.id, reason).catch(() => {});
  if (row.job_dir) await rm(row.job_dir, { recursive: true, force: true }).catch(() => {}); // runner ตายแล้ว = ลบรูปที่ค้าง
  return { ...row, status: "error", result: null, error: reason };
}

/* deliver-once: งาน done ที่ถูกส่งให้ client แล้ว mark seen · กันคำตอบเก่าเด้งซ้ำทุกครั้งที่เปิดหน้า */
async function markJobSeen(row: PalmJobRow): Promise<void> {
  if (row.status !== "done") return;
  await q(`UPDATE palm_jobs SET seen_at=now() WHERE id=$1 AND seen_at IS NULL`, [row.id]).catch(() => {});
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = cleanId(url.searchParams.get("id"));
  if (!jobId) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });

  const row = await q1<PalmJobRow>(
    `SELECT id, user_id::text AS user_id, status, result, engine, error, job_dir, created_at::text AS created_at
       FROM palm_jobs WHERE id=$1`,
    [jobId]
  );
  if (!row) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });

  // All new palm jobs are private and login-bound. Legacy guest jobs are closed.
  const session = await getSession();
  if (!row.user_id || !session || session.userId !== row.user_id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const safeRow = await reconcileStaleJob(row);
  await markJobSeen(safeRow);

  const headers = { "Cache-Control": "no-store, max-age=0" };
  if (safeRow.status === "done") {
    const result = (safeRow.result && typeof safeRow.result === "object") ? safeRow.result as Record<string, unknown> : {};
    return NextResponse.json({ status: "done", ...result }, { headers });
  }
  if (safeRow.status === "error") {
    return NextResponse.json({ ok: false, status: "error", error: safeRow.error || "read_failed", engine: safeRow.engine || null }, { headers });
  }
  return NextResponse.json({ ok: true, status: "running", job_id: safeRow.id }, { headers });
}
