import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const row = await q1(
    `SELECT * FROM ref_formulas WHERE code=$1 AND is_active=TRUE`,
    [code]
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, row });
}
