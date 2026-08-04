/**
 * GET /api/akg/hex-deep?hex=N[&line=L]
 * คืนตำราเต็มของ卦 N (+ 爻 L ถ้ามี) จาก ref_akg_data (อากง v3)
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";

import { HEX_NAMES } from "@/lib/liuyao/kingwen"; // ตารางชื่อกว้าย้ายไปอยู่ที่เดียว กันสองที่ไม่ตรงกัน

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hexNum = parseInt(searchParams.get("hex") || "0", 10);
    const lineNum = parseInt(searchParams.get("line") || "0", 10);
    if (!hexNum || hexNum < 1 || hexNum > 64) {
      return NextResponse.json({ ok: false, error: "hex must be 1-64" }, { status: 400 });
    }
    const part = hexNum <= 16 ? "1_16" : hexNum <= 32 ? "17_32" : hexNum <= 48 ? "33_48" : "49_64";
    const deepKey = `v2_0${hexNum <= 16 ? 1 : hexNum <= 32 ? 2 : hexNum <= 48 ? 3 : 4}_deep_${part}`;
    const yaoKey = `v3_yao_ci_${part}`;

    const deepRow = await q1<{ data: { interpretations: Array<Record<string, unknown>> } }>(
      `SELECT data FROM ref_akg_data WHERE key=$1`, [deepKey]
    );
    const yaoRow = await q1<{ data: { hexagrams_yao_ci: Array<{ no: number; lines: Array<Record<string, unknown>> }> } }>(
      `SELECT data FROM ref_akg_data WHERE key=$1`, [yaoKey]
    );

    const deepInterp = deepRow?.data?.interpretations?.find((x: any) => x.no === hexNum) || null;
    const yaoHex = yaoRow?.data?.hexagrams_yao_ci?.find(h => h.no === hexNum);
    const allLines = yaoHex?.lines || [];
    const targetLine = lineNum >= 1 && lineNum <= 6 ? allLines[lineNum - 1] : null;

    return NextResponse.json({
      ok: true,
      hex: hexNum,
      name: HEX_NAMES[hexNum] || "?",
      line: lineNum || null,
      deep: deepInterp,
      yao_line: targetLine,
      all_lines: allLines,
      source: "อาม่าอากง v3 (周易 + Zhu Xi · UNESCO 2016)",
    });
  } catch (e: unknown) {
    console.error("[akg/hex-deep]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
