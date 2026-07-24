/**
 * ตัวจ่ายงาน (dispatcher) ศาสตร์ตั้งชื่อหลายชาติ (ฝั่ง server)
 * เส้น /api/mobile/v1/naming ส่ง system + input มา → route ไป engine ตรงตัว
 * 五格 จีน (chinese_wuge) เป็น default เดิม จัดการที่ route (analyzeName) — ไม่รวมที่นี่เพื่อคงพฤติกรรมเดิม
 */
import { NamingEngineResult, fail } from "./types";
import { analyzeThaiTaksa } from "./thai-taksa";
import { analyzeThaiLekSart } from "./thai-leksart";
import { analyzeNakshatra } from "./indian-nakshatra";
import { analyzeChaldean } from "./chaldean";
import { analyzePythagorean } from "./pythagorean";
import { analyzeJapaneseGokaku } from "./japanese-gokaku";

export type NamingSystem =
  | "thai_taksa"
  | "thai_leksart"
  | "indian_nakshatra"
  | "chaldean"
  | "pythagorean"
  | "japanese_gokaku";

export const MULTINATIONAL_SYSTEMS: NamingSystem[] = [
  "thai_taksa",
  "thai_leksart",
  "indian_nakshatra",
  "chaldean",
  "pythagorean",
  "japanese_gokaku",
];

export type NamingDispatchInput = {
  name?: string;
  surname?: string;
  given?: string;
  birthDay?: string | null; // จันทร์..อาทิตย์ (ทักษา)
  moonLongitude?: number | null; // นิรายนะ 0–360 (นักษัตร)
  nakshatra?: string | number | null;
  pada?: number | null;
  gender?: string | null; // 姓名判断 寡婦運 เฉพาะหญิง
};

function fullName(i: NamingDispatchInput): string {
  return String(i.name || [i.surname, i.given].filter(Boolean).join("") || "").trim();
}

export function runNamingSystem(system: string, input: NamingDispatchInput): NamingEngineResult {
  switch (system) {
    case "thai_taksa":
      return analyzeThaiTaksa({ name: fullName(input), birthDay: input.birthDay });
    case "thai_leksart":
      return analyzeThaiLekSart({ name: fullName(input) });
    case "indian_nakshatra":
      return analyzeNakshatra({ name: fullName(input), moonLongitude: input.moonLongitude, nakshatra: input.nakshatra, pada: input.pada });
    case "chaldean":
      return analyzeChaldean({ name: fullName(input) });
    case "pythagorean":
      return analyzePythagorean({ name: fullName(input) });
    case "japanese_gokaku":
      return analyzeJapaneseGokaku({ surname: String(input.surname || "").trim(), given: String(input.given || "").trim(), gender: input.gender });
    default:
      return fail(system || "unknown", "", `ไม่รู้จักศาสตร์ "${system}" (รองรับ: ${MULTINATIONAL_SYSTEMS.join(", ")}, chinese_wuge)`);
  }
}

export { analyzeThaiTaksa, analyzeThaiLekSart, analyzeNakshatra, analyzeChaldean, analyzePythagorean, analyzeJapaneseGokaku };
export * from "./types";
