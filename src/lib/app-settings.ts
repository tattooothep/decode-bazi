import { q, q1 } from "@/lib/db";

/**
 * ตั้งค่าเว็บ (app_settings · key-value) อ่านแบบ cache ในหน่วยความจำ 30 วิ
 * ใช้ทั้งฝั่ง user (เช็ค maintenance/feature flag/อัตราเครดิต) และ admin (แก้ค่า)
 */
type Cache = { at: number; map: Record<string, string> };
let _cache: Cache | null = null;
const TTL_MS = 30_000;

export const SETTING_DEFAULTS: Record<string, string> = {
  credit_start: "500",
  credit_chars_per_yam: "30",
  maintenance_mode: "off",
  announcement: "",
  feature_vision: "on",
  feature_fusion: "on",
  signup_open: "on",
};

export async function getAllSettings(force = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!force && _cache && now - _cache.at < TTL_MS) return _cache.map;
  const rows = await q<{ key: string; value: string }>(`SELECT key, value FROM app_settings`);
  const map = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value ?? "";
  _cache = { at: now, map };
  return map;
}

export async function getSetting(key: string): Promise<string> {
  const map = await getAllSettings();
  return map[key] ?? SETTING_DEFAULTS[key] ?? "";
}

export async function getSettingNum(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingBool(key: string): Promise<boolean> {
  return (await getSetting(key)) === "on";
}

export async function setSetting(key: string, value: string, by?: string): Promise<void> {
  await q1(
    `INSERT INTO app_settings(key, value, updated_at, updated_by) VALUES ($1,$2,now(),$3)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`,
    [key, value, by || null]
  );
  _cache = null; // ล้าง cache ทันทีหลังแก้
}
