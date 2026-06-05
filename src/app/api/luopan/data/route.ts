/**
 * GET /api/luopan/data?set=<key> · 1 มิ.ย. 2026
 * เสิร์ฟตำรา/engine IP (luopan/methodology) แบบ login-gated — ย้ายจาก public/_preview/ (เดิม fetch public ได้ = IP รั่ว)
 * ต้อง login · whitelist set (กัน path traversal) · cache ในหน่วยความจำ (scale 5k user)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

// whitelist: key → filename (lookup เท่านั้น · กัน ../traversal)
const SETS: Record<string, string> = {
  luopan:      "luopan_complete.json",
  earth:       "earth-plate-symbolic.json",
  annual:      "annual-warning.json",
  xkdg:        "xkdg-64-gua.json",
  core:        "core-sciences.json",
  fenjin:      "fenjin120.json",
  yao:         "yao384.json",
  interaction: "interaction-methodology.json",
  interpretation_template: "00_interpretation_template.json",
  najia:       "01_najia.json",
  basha_huangquan: "02_ba_sha_huang_quan.json",
  basha_huangquan_interpreted: "02b_ba_sha_huang_quan_interpreted.json",
  tigua:       "03_tigua.json",
  sanyuan_long: "04_sanyuan_long.json",
  water_method: "water-method-v1.json",
  month_day_sha: "month-day-sha-v1.json",
};
const DIR = path.join(process.cwd(), "data", "luopan-private");
const cache = new Map<string, string>();

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const set = req.nextUrl.searchParams.get("set") || "";
  const file = SETS[set];
  if (!file) return NextResponse.json({ error: "unknown set" }, { status: 404 });

  try {
    let body = cache.get(set);
    if (!body) { body = await readFile(path.join(DIR, file), "utf8"); cache.set(set, body); }
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
