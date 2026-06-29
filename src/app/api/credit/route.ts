/**
 * GET /api/credit · ยอดเครดิต "ยาม" คงเหลือของ org ที่ล็อกอิน
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCredit } from "@/lib/credit";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s?.orgId) {
    return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
  }
  const credit_yam = await getCredit(s.orgId);
  return NextResponse.json({ ok: true, credit_yam });
}
