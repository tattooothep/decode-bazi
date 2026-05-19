/**
 * qimen-destiny.ts · QiMen Natal mini-card data
 *
 * Codex direction:
 *   - cached direct fetch (ไม่ใช่ /api/qimen/divine hop)
 *   - async helper · tight timeout · fail-open `null`
 *   - in-memory cache key = `date|time|longitude`
 *   - return 4 fields: deity · direction · star · door (ของ life palace)
 */

export type QimenDestinyMini = {
  deity_zh: string | null;
  deity_th: string | null;
  deity_en: string | null;
  direction_zh: string | null;
  direction_th: string | null;
  star_zh: string | null;
  star_th: string | null;
  door_zh: string | null;
  door_th: string | null;
};

const QIMEN_API_URL = process.env.QIMEN_API_URL || "http://localhost:4090";
const QIMEN_TIMEOUT_MS = 500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry = { data: QimenDestinyMini | null; expires: number };
const cache = new Map<string, CacheEntry>();

const DEITY_TH: Record<string, string> = {
  "值符":"จื๋อฝู", "螣蛇":"งูใหญ่", "太陰":"ไท่อิน", "六合":"ลิ่วเหอ",
  "白虎":"เสือขาว", "玄武":"เซวียนอู่", "九地":"จิ๋วตี้", "九天":"จิ๋วเทียน",
};
const DEITY_EN: Record<string, string> = {
  "值符":"Direct Charm","螣蛇":"Flying Snake","太陰":"Great Yin","六合":"Six Harmony",
  "白虎":"White Tiger","玄武":"Black Tortoise","九地":"Nine Earth","九天":"Nine Heaven",
};
const STAR_TH: Record<string, string> = {
  "天蓬":"เทียนเผิง","天任":"เทียนเหริน","天沖":"เทียนชง","天輔":"เทียนฝู่",
  "天英":"เทียนอิง","天芮":"เทียนรุ่ย","天柱":"เทียนจู้","天心":"เทียนซิน","天禽":"เทียนฉิน",
};
const DOOR_TH: Record<string, string> = {
  "休門":"พักผ่อน","生門":"กำเนิด","傷門":"บาดเจ็บ","杜門":"ปิด",
  "景門":"ทัศนียภาพ","死門":"ดับ","驚門":"ตื่น","開門":"เปิด",
};
const DIRECTION_TH: Record<string, string> = {
  "坎":"ทิศเหนือ","艮":"ทิศตะวันออกเฉียงเหนือ","震":"ทิศตะวันออก","巽":"ทิศตะวันออกเฉียงใต้",
  "離":"ทิศใต้","坤":"ทิศตะวันตกเฉียงใต้","兌":"ทิศตะวันตก","乾":"ทิศตะวันตกเฉียงเหนือ","中":"กลาง",
};

/* Codex fix: ห้ามเดา palaces[0] · ถ้าหา selfPalace ไม่ได้ return null */
function pickLifePalace(divineResp: unknown): QimenDestinyMini | null {
  try {
    const r = divineResp as Record<string, unknown>;
    const data = (r?.data as Record<string, unknown>) || r;
    const selfPalace = data?.selfPalace as Record<string, unknown> | undefined;
    const calc = (data?.calculation as Record<string, unknown>) || data;
    const palaces = calc?.palaces as Record<string, unknown>[] | undefined;
    if (!selfPalace || !palaces || !Array.isArray(palaces) || palaces.length === 0) return null;
    const targetId = selfPalace.palace_id;
    if (targetId === undefined || targetId === null) return null;
    const cell = palaces.find(p => p && (p as Record<string, unknown>).palace_id === targetId);
    if (!cell) return null;
    const c = cell as Record<string, unknown>;
    const deity_zh    = (c.deity_zh as string) || null;
    const deity_th    = (c.deity_name_th as string) || (deity_zh ? DEITY_TH[deity_zh] || null : null);
    const deity_en    = (c.deity_name_en as string) || (deity_zh ? DEITY_EN[deity_zh] || null : null);
    const star_zh     = (c.star_zh as string) || null;
    const star_th     = (c.star_name_th as string) || (star_zh ? STAR_TH[star_zh] || null : null);
    const door_zh     = (c.door_zh as string) || null;
    const door_th     = (c.door_name_th as string) || (door_zh ? DOOR_TH[door_zh] || null : null);
    const trigram_zh  = (c.trigram_zh as string) || null;
    const direction_zh = trigram_zh || (c.direction as string) || null;
    const direction_th = trigram_zh ? DIRECTION_TH[trigram_zh] || null : null;
    return { deity_zh, deity_th, deity_en, direction_zh, direction_th, star_zh, star_th, door_zh, door_th };
  } catch {
    return null;
  }
}

export async function buildQimenDestiny(date: string, time: string, longitude: number): Promise<QimenDestinyMini | null> {
  const key = `${date}|${time}|${longitude}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.data;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), QIMEN_TIMEOUT_MS);
  try {
    const r = await fetch(`${QIMEN_API_URL}/api/qimen/divine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, time, longitude }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      cache.set(key, { data: null, expires: now + CACHE_TTL_MS });
      return null;
    }
    const j = await r.json();
    const out = pickLifePalace(j);
    cache.set(key, { data: out, expires: now + CACHE_TTL_MS });
    return out;
  } catch {
    clearTimeout(t);
    cache.set(key, { data: null, expires: now + 60_000 }); // 1 min on failure
    return null;
  }
}
