/**
 * ของเสริม/ของแก้ฮวงจุ้ยรายทิศ (เจ้านายสั่ง 20 ก.ค. งาน ②)
 * GET ?mountain=1..9&water=1..9 → คำแนะนำของแก้จากคลัง star_pairs_81 (xuankong-period9.json)
 * เนื้อหาทั้งหมดมาจากคลังคัมภีร์เดิมเท่านั้น — ห้ามปั้น/ห้ามแต่งข้อความวิชาในไฟล์นี้
 * additive ล้วน: ไม่แตะ /api/mobile/v1/luopan/* หรือ /api/fengshui-snapshot (LOCKED)
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMobileSession } from "@/lib/mobile-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type XKPair = {
  id: string;
  mountain_star: number;
  water_star: number;
  score: number;
  nature: string;
  classical_zh?: string;
  interpretation_th?: string;
  interpretation_en?: string;
  remedy_element?: string;
  remedy_th?: string;
  period9_modifier?: string;
};

let cache: { pairs: XKPair[]; at: number } | null = null;
const TTL_MS = 10 * 60_000;

async function loadPairs(): Promise<XKPair[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.pairs;
  const file = path.join(process.cwd(), "data/library/xuankong-period9.json");
  const raw = JSON.parse(await readFile(file, "utf8")) as { star_pairs_81?: XKPair[] };
  const pairs = Array.isArray(raw.star_pairs_81) ? raw.star_pairs_81 : [];
  cache = { pairs, at: Date.now() };
  return pairs;
}

/** ชื่อธาตุของแก้ 3 ภาษา — คำทั่วไป ไม่ใช่เนื้อหาวิชา (ข้อความวิชาใช้ remedy_th จากคลัง) */
const ELEMENT_LABEL: Record<string, { th: string; en: string; zh: string }> = {
  wood: { th: "ไม้", en: "Wood", zh: "木" },
  fire: { th: "ไฟ", en: "Fire", zh: "火" },
  earth: { th: "ดิน", en: "Earth", zh: "土" },
  metal: { th: "โลหะ", en: "Metal", zh: "金" },
  water: { th: "น้ำ", en: "Water", zh: "水" },
  none: { th: "ไม่ต้องแก้", en: "No cure needed", zh: "無需化解" },
};

function star(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const rl = await rateLimit(`mobile-remedy:${session.userId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const url = new URL(req.url);
  const mountain = star(url.searchParams.get("mountain"));
  const water = star(url.searchParams.get("water"));
  if (mountain === null || water === null) {
    return NextResponse.json({ ok: false, error: "invalid_stars" }, { status: 400 });
  }

  const pairs = await loadPairs();
  const pair = pairs.find((p) => p.mountain_star === mountain && p.water_star === water) || null;
  if (!pair) return NextResponse.json({ ok: true, pair: null }, { headers: { "Cache-Control": "no-store" } });

  const element = String(pair.remedy_element || "none");
  return NextResponse.json(
    {
      ok: true,
      pair: {
        id: pair.id,
        mountain: pair.mountain_star,
        water: pair.water_star,
        score: pair.score,
        nature: pair.nature,
        classical_zh: pair.classical_zh || "",
        interpretation: { th: pair.interpretation_th || "", en: pair.interpretation_en || "" },
        remedy: {
          element,
          element_label: ELEMENT_LABEL[element] || ELEMENT_LABEL.none,
          text_th: pair.remedy_th || "",
        },
        period9_modifier: pair.period9_modifier || "",
      },
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
