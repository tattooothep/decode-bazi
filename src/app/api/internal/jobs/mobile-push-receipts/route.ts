import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { checkMobilePushReceipts } from "@/lib/mobile-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  try {
    const report = await checkMobilePushReceipts(1000);
    return NextResponse.json({ ok: true, ...report });
  } catch {
    return NextResponse.json({ ok: false, error: "receipt_check_failed" }, { status: 503 });
  }
}
