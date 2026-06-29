import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

/**
 * หลังบ้าน · สมาชิก (admin only)
 * GET  /api/admin/members                       → list (?search= &tier= &active= &sort= &page= &limit=)
 * GET  /api/admin/members?id=<uuid>             → รายละเอียด + ยอดใช้ + ประวัติยาม
 * POST { id, action, ... }                       → จัดการ
 *   action=adjust_credit { delta:int, note? }    หัก/เติมยาม (เขียน ledger)
 *   action=set_tier      { tier }                เปลี่ยน tier
 *   action=set_active    { active:bool }         ระงับ/คืนสถานะ
 *   action=extend_sub    { days:int }            ต่ออายุสมาชิก (วัน)
 */
export const runtime = "nodejs";

function guard(e: unknown) {
  if (e instanceof Response) return e;
  return NextResponse.json({ ok: false, error: (e as Error).message || "error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return guard(e); }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // รายละเอียดรายคน
  if (id) {
    const u = await q1<Record<string, unknown>>(
      `SELECT id, email, name, phone, tier, hour_balance, sub_expires_at, is_active,
              email_verified, locale, created_at, last_active_at
         FROM users WHERE id=$1`, [id]);
    if (!u) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const profiles = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM aj_user_profiles WHERE user_id=$1`, [id]).catch(() => ({ n: 0 }));
    const chats = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM chart_sifu_history WHERE user_id=$1`, [id]).catch(() => ({ n: 0 }));
    const txns = await q(
      `SELECT delta, reason, balance_after, ref_feature, note, created_at
         FROM hour_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]);
    const orders = await q(
      `SELECT package_code, amount_thb, yam_granted, status, pay_method, created_at, paid_at
         FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [id]);
    return NextResponse.json({ ok: true, user: u, profiles: profiles?.n ?? 0, chats: chats?.n ?? 0, txns, orders });
  }

  // list + ค้นหา
  const search = (url.searchParams.get("search") || "").trim();
  const tier = (url.searchParams.get("tier") || "").trim();
  const active = (url.searchParams.get("active") || "").trim();
  const sort = (url.searchParams.get("sort") || "created").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10) || 30));
  const off = (page - 1) * limit;

  const where: string[] = [];
  const args: unknown[] = [];
  if (search) { args.push(`%${search.toLowerCase()}%`); where.push(`(LOWER(email) LIKE $${args.length} OR LOWER(COALESCE(name,'')) LIKE $${args.length} OR COALESCE(phone,'') LIKE $${args.length})`); }
  if (tier) { args.push(tier); where.push(`tier=$${args.length}`); }
  if (active === "1") where.push(`is_active=true`);
  if (active === "0") where.push(`is_active=false`);
  const ws = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = sort === "balance" ? "hour_balance DESC"
    : sort === "active" ? "last_active_at DESC NULLS LAST"
    : "created_at DESC";

  const total = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users ${ws}`, args);
  args.push(limit, off);
  const rows = await q(
    `SELECT id, email, name, tier, hour_balance, sub_expires_at, is_active, created_at, last_active_at
       FROM users ${ws} ORDER BY ${orderBy} LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
  return NextResponse.json({ ok: true, total: total?.n ?? 0, page, limit, rows, _admin: admin.email });
}

export async function POST(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return guard(e); }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const exist = await q1<{ id: string }>(`SELECT id FROM users WHERE id=$1`, [id]);
  if (!exist) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (action === "adjust_credit") {
    const delta = Math.trunc(Number(body.delta) || 0);
    if (!delta) return NextResponse.json({ ok: false, error: "delta required" }, { status: 400 });
    const note = String(body.note || "").slice(0, 300);
    const row = await q1<{ balance_after: number }>(
      `WITH upd AS (
         UPDATE users SET hour_balance = GREATEST(0, hour_balance + $2) WHERE id=$1 RETURNING hour_balance
       )
       INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature, note)
       SELECT $1, $2, 'admin_adjust', hour_balance, 'admin:'||$4, $3 FROM upd
       RETURNING balance_after`,
      [id, delta, note || null, admin.email]);
    return NextResponse.json({ ok: true, balance_after: row?.balance_after });
  }

  if (action === "set_tier") {
    const tier = String(body.tier || "").trim();
    if (!["free", "pro", "vip"].includes(tier)) return NextResponse.json({ ok: false, error: "bad tier" }, { status: 400 });
    await q1(`UPDATE users SET tier=$2 WHERE id=$1`, [id, tier]);
    return NextResponse.json({ ok: true, tier });
  }

  if (action === "set_active") {
    const active = body.active === true || body.active === "true" || body.active === 1;
    await q1(`UPDATE users SET is_active=$2 WHERE id=$1`, [id, active]);
    return NextResponse.json({ ok: true, is_active: active });
  }

  if (action === "extend_sub") {
    const days = Math.trunc(Number(body.days) || 0);
    if (!days) return NextResponse.json({ ok: false, error: "days required" }, { status: 400 });
    const row = await q1<{ sub_expires_at: string }>(
      `UPDATE users SET sub_expires_at = GREATEST(COALESCE(sub_expires_at, now()), now()) + ($2 || ' days')::interval
         WHERE id=$1 RETURNING sub_expires_at`, [id, String(days)]);
    return NextResponse.json({ ok: true, sub_expires_at: row?.sub_expires_at });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
