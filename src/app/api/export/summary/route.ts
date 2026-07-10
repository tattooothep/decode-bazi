/**
 * POST/GET /api/export/summary · "Export สรุป PDF ด้วย AI" (registry: chart/palm/fusion · 20 ยาม/ครั้ง)
 * ─ async job แบบเดียวกับ /api/book: POST → spend 20 ยาม → INSERT running → คืน job_id → worker detached
 *   GET poll · deliver-once (seen_at) · refund ถ้าพัง · reconcileStale (running > 25 นาที / ก่อน server start)
 * ─ cache: 1 (user_id,page,lang,data_hash) done ที่ยังไม่หมดอายุ = reuse ฟรี (ไม่หักยาม) · running เดิม = คืน id เดิม
 * ─ registry: HANDLERS[page] (src/lib/export/{chart,palm,fusion}.ts) — resolveInputs(rawInputs,session)→{dataHash,ctx}
 *   → spend/cache/job สร้างที่นี่ (ร่วมทุกหน้า) → worker เรียก handler.generate(ctx,lang) → markdown+cover(บังคับ)+figs
 * ⚠️ additive · ไม่แตะ /api/chart engine (LOCKED) · ไม่แตะ /api/sifu (แค่เรียกผ่าน fusion-internal boundary)
 * ⚠️ ห้าม AI มั่ว: engine คำนวณเสร็จ → AI แค่สรุปภาษา · คง 6 เรื่องห้าม + NO_PERCENT · เขียนภาษาตาม lang (9 ภาษา)
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1, q } from "@/lib/db";
import { spendHoursForUser, refundHoursForUser } from "@/lib/spend-hours";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang";
import { renderExportPdf, type ExportResult } from "@/lib/export-pdf";
import { cleanId } from "@/lib/export/shared";
import type { PageHandler } from "@/lib/export/types";
import { chartHandler } from "@/lib/export/chart";
import { palmHandler } from "@/lib/export/palm";
import { fusionHandler } from "@/lib/export/fusion";
import { qimenHandler } from "@/lib/export/qimen";
import { datepickHandler } from "@/lib/export/datepick";
import { calendarHandler } from "@/lib/export/calendar";
import { luopanHandler } from "@/lib/export/luopan";
import { entitlementDenied, getProductAccess } from "@/lib/product-entitlement";

export const runtime = "nodejs";
export const maxDuration = 300;

const FEATURE = "export_pdf";
const EXPORT_YAM = 20;
const CACHE_TTL_DAYS = 30;
const SERVER_STARTED_AT = new Date();

/** registry หน้าที่รองรับ Export PDF — เพิ่มหน้าใหม่ = เพิ่ม entry เดียวตรงนี้ (ไม่ต้องแตะ route.ts ที่เหลือ) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HANDLERS: Record<string, PageHandler<any>> = {
  chart: chartHandler,
  palm: palmHandler,
  fusion: fusionHandler,
  qimen: qimenHandler,
  datepick: datepickHandler,
  calendar: calendarHandler,
  luopan: luopanHandler,
};

/* ── worker (detached · ไม่ throw ออกนอก · UPDATE row เสมอ) ── */
async function processExport(jobId: string, userId: string, page: string, lang: string, ctx: unknown, started: number): Promise<void> {
  try {
    const handler = HANDLERS[page];
    if (!handler) throw new Error("handler_missing");
    const { markdown, cover, figs, document } = await handler.generate(ctx, lang);
    const result = {
      version: document ? "export_summary_v2" : "export_summary_v1",
      page,
      lang,
      markdown,
      cover,
      figs,
      ...(document ? { document } : {}),
      meta: { yam: { charged: EXPORT_YAM, refunded: 0 }, ms: Date.now() - started },
    };
    await q(`UPDATE export_jobs SET status='done', result=$2, updated_at=now() WHERE id=$1`, [jobId, JSON.stringify(result)]);
  } catch (e) {
    await refundHoursForUser(userId, EXPORT_YAM, FEATURE).catch(() => {});
    await q(`UPDATE export_jobs SET status='error', error=$2, yam_refunded=$3, updated_at=now() WHERE id=$1`,
      [jobId, (e instanceof Error ? e.message : String(e)).slice(0, 200), EXPORT_YAM]).catch(() => {});
  }
}

/* ── result shape สำหรับ GET ── */
type ExportRow = { id: string; user_id: string; status: string; result: unknown; error: string | null; lang: string | null; page: string | null; yam_charged: number; yam_refunded: number; created_at: string; seen_at?: string | null };
function exportJson(row: ExportRow) {
  return { job_id: row.id, status: row.status, result: row.result || null, error: row.error || null, lang: row.lang || "th", page: row.page || "chart" };
}

export async function POST(req: Request) {
  let chargedYam = 0, userId = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    userId = session.userId;

    const page = String(body.page || "chart").trim();
    const handler = HANDLERS[page];
    if (!handler) return NextResponse.json({ error: "unsupported_page" }, { status: 400 });
    const productAccess = await getProductAccess(userId);
    const exportAllowed = page === "chart"
      ? !!productAccess?.pages.chart.ai_summary_pdf
      : page === "calendar"
        ? !!productAccess?.pages.calendar.pdf
        : true;
    if (!exportAllowed) {
      return NextResponse.json(
        entitlementDenied(`${page}_pdf_locked`, { plan: productAccess?.plan || "free" }),
        { status: 403 }
      );
    }
    const lang = isSifuAnswerLang(body.lang) ? String(body.lang) : "th";
    const rawInputs = (body.inputs || {}) as Record<string, unknown>;

    // resolveInputs: validate + โหลดข้อมูล/ผูก cookie (chart→birth/profileId · palm→reading snapshot · fusion→fusion5_jobs)
    const resolved = await handler.resolveInputs(rawInputs, session);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const { dataHash, ctx } = resolved;

    // cache: done ยังไม่หมดอายุ → reuse (ไม่หักยาม)
    const cached = await q1<{ id: string }>(
      `SELECT id FROM export_jobs WHERE user_id=$1 AND page=$2 AND lang=$3 AND data_hash=$4 AND status='done'
         AND created_at > now() - ($5 || ' days')::interval ORDER BY created_at DESC LIMIT 1`,
      [userId, page, lang, dataHash, String(CACHE_TTL_DAYS)]);
    if (cached) return NextResponse.json({ job_id: cached.id, status: "done", reused: true });

    // running เดิม → คืน id เดิม (กันกดรัว/พับจอเปิดใหม่)
    const running = await q1<{ id: string }>(
      `SELECT id FROM export_jobs WHERE user_id=$1 AND page=$2 AND lang=$3 AND data_hash=$4 AND status='running'
         AND created_at > now() - interval '25 min' ORDER BY created_at DESC LIMIT 1`,
      [userId, page, lang, dataHash]);
    if (running) return NextResponse.json({ job_id: running.id, status: "running", reused: true });

    // spend 20 ยาม (atomic · 402 ถ้าไม่พอ)
    const spend = await spendHoursForUser(userId, EXPORT_YAM, FEATURE);
    if (!spend.ok) return NextResponse.json({ error: "insufficient_hours", needed: EXPORT_YAM, balance: spend.balance ?? 0 }, { status: 402 });
    chargedYam = EXPORT_YAM;

    const row = await q1<{ id: string }>(
      `INSERT INTO export_jobs(user_id, org_id, page, lang, data_hash, status, yam_charged)
       VALUES ($1,$2,$3,$4,$5,'running',$6) RETURNING id`,
      [userId, session.orgId ?? null, page, lang, dataHash, EXPORT_YAM]);
    if (!row) { await refundHoursForUser(userId, EXPORT_YAM, FEATURE).catch(() => {}); return NextResponse.json({ error: "job_create_failed" }, { status: 500 }); }
    chargedYam = 0; // worker รับช่วง refund แล้ว

    void processExport(row.id, userId, page, lang, ctx, Date.now());
    return NextResponse.json({ job_id: row.id, status: "running", yam: { charged: EXPORT_YAM } }, { status: 202 });
  } catch (e) {
    console.error("[export/summary] POST", e instanceof Error ? (e.stack || e.message) : String(e));
    if (chargedYam > 0 && userId) await refundHoursForUser(userId, chargedYam, FEATURE).catch(() => {});
    return NextResponse.json({ error: "export_error" }, { status: 500 });
  }
}

async function reconcileStale(row: ExportRow, userId: string): Promise<ExportRow> {
  const createdMs = new Date(row.created_at).getTime();
  const stale = row.status === "running" && Date.now() - createdMs > 25 * 60_000;
  const orphaned = row.status === "running" && Number.isFinite(createdMs) && createdMs < SERVER_STARTED_AT.getTime() - 1_000;
  if (!stale && !orphaned) return row;
  const reason = orphaned ? "server_restart_orphan" : "timeout";
  const upd = await q1<{ yam_charged: number; yam_refunded: number }>(
    `UPDATE export_jobs SET status='error', error=$3, updated_at=now()
       WHERE id=$1 AND user_id=$2 AND status='running' RETURNING yam_charged, yam_refunded`,
    [row.id, userId, reason]);
  if (upd) {
    const remaining = Math.max(0, (upd.yam_charged || 0) - (upd.yam_refunded || 0));
    if (remaining > 0) {
      await refundHoursForUser(userId, remaining, FEATURE).catch(() => {});
      await q(`UPDATE export_jobs SET yam_refunded=yam_charged WHERE id=$1`, [row.id]).catch(() => {});
    }
  }
  return { ...row, status: "error", result: null, error: reason };
}

async function markSeen(row: ExportRow, userId: string): Promise<void> {
  if (row.status !== "done") return;
  await q(`UPDATE export_jobs SET seen_at=now() WHERE id=$1 AND user_id=$2 AND seen_at IS NULL`, [row.id, userId]).catch(() => {});
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const url = new URL(req.url);
  const jobId = cleanId(url.searchParams.get("id") || url.searchParams.get("job_id"));
  if (!jobId) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const wantPdf = url.searchParams.get("format") === "pdf";

  const row = await q1<ExportRow>(
    `SELECT id, user_id, status, result, error, lang, page, yam_charged, yam_refunded, created_at::text AS created_at
       FROM export_jobs WHERE id=$1`, [jobId]);
  if (!row) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  // ownership: ไม่ตรง = 403 (กันอ่านงานข้ามบัญชี · IDOR) — เช็คก่อน gen PDF เสมอ
  if (row.user_id !== session.userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const safe = await reconcileStale(row, session.userId);

  // ── ?format=pdf: เจนไฟล์ .pdf ฝั่ง server (chromium) → ดาวน์โหลดตรง (ไม่เด้ง print) ──
  // ใช้ result ที่ worker เก็บไว้แล้ว (ไม่เรียก AI ซ้ำ · ไม่หักยามซ้ำ)
  if (wantPdf) {
    if (safe.status !== "done" || !safe.result) {
      return NextResponse.json({ error: "not_ready", status: safe.status }, { status: 409 });
    }
    try {
      const result = safe.result as ExportResult;
      const lang = String(safe.lang || result.lang || "th");
      const page = (String(safe.page || result.page || "chart").replace(/[^a-z0-9-]/gi, "") || "chart").slice(0, 24);
      const buf = await renderExportPdf(result, lang, safe.id);
      await markSeen(safe, session.userId);
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = ("hourkey-" + page + "-" + ymd + ".pdf").replace(/[^a-zA-Z0-9._-]/g, "");
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(buf.length),
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    } catch (e) {
      console.error("[export/summary] pdf render", e instanceof Error ? (e.stack || e.message) : String(e));
      return NextResponse.json({ error: "pdf_render_failed" }, { status: 500 });
    }
  }

  await markSeen(safe, session.userId);
  return NextResponse.json(exportJson(safe), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
