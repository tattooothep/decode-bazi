import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { writeAdminAudit } from "@/lib/admin-audit";
import { q, q1 } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

/**
 * Support tickets + notes bridge
 * GET  list / detail
 * POST create | add_message | set_status | add_user_note
 */
export async function GET(req: NextRequest) {
  try { await requirePermission("admin.users.read"); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("user_id");
  const status = (url.searchParams.get("status") || "").trim();

  if (id) {
    const ticket = await q1(
      `SELECT t.*, u.email AS user_email, a.email AS assignee_email
         FROM support_tickets t
         LEFT JOIN users u ON u.id=t.user_id
         LEFT JOIN users a ON a.id=t.assignee_id
        WHERE t.id=$1`,
      [id]
    );
    if (!ticket) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const messages = await q(
      `SELECT m.*, u.email AS author_email
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id=m.author_id
        WHERE m.ticket_id=$1 ORDER BY m.created_at ASC`,
      [id]
    );
    return NextResponse.json({ ok: true, ticket, messages });
  }

  const where: string[] = [];
  const args: unknown[] = [];
  if (status) { args.push(status); where.push(`t.status=$${args.length}`); }
  if (userId) { args.push(userId); where.push(`t.user_id=$${args.length}`); }
  const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await q(
    `SELECT t.id, t.subject, t.status, t.priority, t.channel, t.created_at, t.updated_at,
            t.user_id, u.email AS user_email
       FROM support_tickets t
       LEFT JOIN users u ON u.id=t.user_id
       ${ws}
       ORDER BY t.updated_at DESC LIMIT 100`,
    args
  ).catch(() => []);
  // also surface support_reports if any
  const reports = await q(
    `SELECT id, user_id, email, category, message, status, severity, created_at, page_path
       FROM support_reports ORDER BY created_at DESC LIMIT 50`
  ).catch(() => []);
  return NextResponse.json({ ok: true, rows, reports });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requirePermission("admin.users.notes.write"); } catch (e) { return guard(e); }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");

  if (action === "create") {
    const userId = body.user_id ? String(body.user_id) : null;
    const subject = String(body.subject || "Support").slice(0, 300);
    const text = String(body.body || body.message || "").slice(0, 8000);
    if (!text) return NextResponse.json({ ok: false, error: "body required" }, { status: 400 });
    const email = body.email ? String(body.email) : null;
    const row = await q1<{ id: string }>(
      `INSERT INTO support_tickets(user_id, email, subject, body, status, priority, channel, created_by, assignee_id)
       VALUES ($1,$2,$3,$4,'open',$5,'admin',$6,$6) RETURNING id`,
      [userId, email, subject, text, String(body.priority || "normal"), admin.userId]
    );
    if (row) {
      await q1(
        `INSERT INTO support_ticket_messages(ticket_id, author_id, author_type, body)
         VALUES ($1,$2,'admin',$3)`,
        [row.id, admin.userId, text]
      );
    }
    await writeAdminAudit({
      actor: admin,
      action: "admin.support.ticket.create",
      targetType: "support_ticket",
      targetId: row?.id || null,
      payload: { user_id: userId, subject },
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, id: row?.id });
  }

  if (action === "add_message") {
    const ticketId = String(body.ticket_id || body.id || "");
    const text = String(body.body || "").slice(0, 8000);
    if (!ticketId || !text) return NextResponse.json({ ok: false, error: "ticket_id+body required" }, { status: 400 });
    await q1(
      `INSERT INTO support_ticket_messages(ticket_id, author_id, author_type, body)
       VALUES ($1,$2,'admin',$3)`,
      [ticketId, admin.userId, text]
    );
    await q1(`UPDATE support_tickets SET updated_at=now(), status=CASE WHEN status='closed' THEN status ELSE 'pending' END WHERE id=$1`, [ticketId]);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_status") {
    const ticketId = String(body.ticket_id || body.id || "");
    const status = String(body.status || "");
    if (!ticketId || !["open", "pending", "resolved", "closed"].includes(status)) {
      return NextResponse.json({ ok: false, error: "bad status" }, { status: 400 });
    }
    await q1(
      `UPDATE support_tickets SET status=$2, updated_at=now(),
          resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN now() ELSE resolved_at END
        WHERE id=$1`,
      [ticketId, status]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
