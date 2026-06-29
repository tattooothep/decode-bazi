/**
 * POST /api/credit/topup · เติมเครดิต "ยาม" (เฟสแรก = admin เติมมือ)
 * ป้องกันด้วย env CREDIT_ADMIN_PIN (ส่ง header x-credit-pin) · ไม่แตะ admin-guard LOCKED
 * body: { orgId: string, amount: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { topUp, getCredit } from "@/lib/credit";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const pin = process.env.CREDIT_ADMIN_PIN;
  if (!pin) {
    return NextResponse.json({ ok: false, error: "topup_disabled" }, { status: 503 });
  }
  if (req.headers.get("x-credit-pin") !== pin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const orgId = String(body.orgId || "").trim();
  const amount = Math.floor(Number(body.amount) || 0);
  if (!UUID_RE.test(orgId)) {
    return NextResponse.json({ ok: false, error: "invalid_orgId" }, { status: 400 });
  }
  if (amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  const before = await getCredit(orgId);
  const balance = await topUp(orgId, amount, "topup");
  return NextResponse.json({ ok: true, orgId, before, added: amount, credit_yam: balance });
}
