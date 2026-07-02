/**
 * GET /api/akg/hex-deep?hex=N[&line=L]
 * คืนตำราเต็มของ卦 N (+ 爻 L ถ้ามี) จาก ref_akg_data (อากง v3)
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";

const HEX_NAMES: Record<number, string> = { 1:'乾',2:'坤',3:'屯',4:'蒙',5:'需',6:'訟',7:'師',8:'比',9:'小畜',10:'履',11:'泰',12:'否',13:'同人',14:'大有',15:'謙',16:'豫',17:'隨',18:'蠱',19:'臨',20:'觀',21:'噬嗑',22:'賁',23:'剝',24:'復',25:'無妄',26:'大畜',27:'頤',28:'大過',29:'坎',30:'離',31:'咸',32:'恆',33:'遯',34:'大壯',35:'晉',36:'明夷',37:'家人',38:'睽',39:'蹇',40:'解',41:'損',42:'益',43:'夬',44:'姤',45:'萃',46:'升',47:'困',48:'井',49:'革',50:'鼎',51:'震',52:'艮',53:'漸',54:'歸妹',55:'豐',56:'旅',57:'巽',58:'兌',59:'渙',60:'節',61:'中孚',62:'小過',63:'既濟',64:'未濟' };

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
