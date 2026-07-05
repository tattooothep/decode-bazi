/**
 * tongshu-live.ts · r413 · คำนวณสด (read-time) 4 ศาสตร์จีนรายวัน สาย通書
 *
 * แทนค่า cache 4 คอลัมน์ใน aj_ephemeris_cache ที่คำนวณผิด (audit ยืนยัน 2 รอบ):
 *   - twelve_spirits (黃黑道 เทพประจำวัน) : cache ตรึง 青龍起子 → ผิด 83%
 *   - twelve_officers (12建除)           : cache ขาดกฎ 疊建 ที่節氣 → ผิด ~6 วัน/ปี
 *   - twenty_eight (28宿)                : cache ใช้ anchor ผิด
 *   - nine_stars (紫白日 สาย通書)        : cache ใช้ day_branch%9 → ผิด 5/6 วัน
 *
 * Engine = tyme4ts (SolarDay → LunarDay) · deterministic · ไม่แตะ DB
 * ⚠️ tyme4ts คืน "อักษรจีนตัวย่อ" (开/闭/满/执 · 青龙/金匮/勾陈 · 虚/娄/毕/参/张/轸)
 *    แต่ระบบทั้งหมด (star-dict-th.ts + datepick.html + cache เดิม) ใช้ "ตัวเต็ม"
 *    → normalize ครบทุกตัวก่อนคืนค่า มิฉะนั้นป้ายไทยหาย
 *
 * สเกลคะแนน/ป้ายดี-ร้าย = ชุดเดิมของระบบ (JIAN_CHU_GOOD / SPIRIT_NATURE /
 * STAR_28_NATURE / NINE_STAR_NATURE จาก scripts/build-ephemeris.cjs) —
 * เปลี่ยนเฉพาะ "ตัวดาว/เทพที่ถูกต้อง" ไม่เปลี่ยนสเกล · shape ModuleResult ตรง cache เดิมเป๊ะ
 */
import type { ModuleResult, ModuleKey, Reason } from "./types";
import { SolarDay } from "tyme4ts";

// ─── normalize map · อักษรย่อ (tyme4ts) → ตัวเต็ม (star-dict-th / datepick) ───

/** 12建除 · ย่อ→เต็ม (ตัวที่เหมือนกันใส่ไว้ด้วยเพื่อ audit ครบ 12) */
const DUTY_TRAD: Record<string, string> = {
  建: "建", 除: "除", 满: "滿", 滿: "滿", 平: "平", 定: "定",
  执: "執", 執: "執", 破: "破", 危: "危", 成: "成", 收: "收",
  开: "開", 開: "開", 闭: "閉", 閉: "閉",
};

/** 黃黑道 12 เทพ · ย่อ→เต็ม */
const SPIRIT_TRAD: Record<string, string> = {
  青龙: "青龍", 青龍: "青龍", 明堂: "明堂", 天刑: "天刑", 朱雀: "朱雀",
  金匮: "金匱", 金匱: "金匱", 天德: "天德", 白虎: "白虎", 玉堂: "玉堂",
  天牢: "天牢", 玄武: "玄武", 司命: "司命", 勾陈: "勾陳", 勾陳: "勾陳",
};

/** 28宿 · ย่อ→เต็ม (ต่างกัน 6 ตัว: 虚娄毕参张轸 · ที่เหลือเหมือนกัน) */
const XIU_TRAD: Record<string, string> = {
  角: "角", 亢: "亢", 氐: "氐", 房: "房", 心: "心", 尾: "尾", 箕: "箕",
  斗: "斗", 牛: "牛", 女: "女", 虚: "虛", 虛: "虛", 危: "危", 室: "室",
  壁: "壁", 奎: "奎", 娄: "婁", 婁: "婁", 胃: "胃", 昴: "昴", 毕: "畢",
  畢: "畢", 觜: "觜", 参: "參", 參: "參", 井: "井", 鬼: "鬼", 柳: "柳",
  星: "星", 张: "張", 張: "張", 翼: "翼", 轸: "軫", 軫: "軫",
};

// ─── สเกลคะแนนเดิมของระบบ (scripts/build-ephemeris.cjs · ห้ามเปลี่ยนสเกล) ───

const JIAN_CHU_GOOD: Record<string, number> = {
  建: 60, 除: 65, 滿: 75, 平: 60, 定: 80, 執: 55, 破: 25, 危: 40, 成: 85, 收: 75, 開: 80, 閉: 35,
};
const SPIRIT_NATURE: Record<string, number> = {
  青龍: 85, 明堂: 80, 金匱: 75, 天德: 85, 玉堂: 80, 司命: 70,
  天刑: 30, 朱雀: 35, 白虎: 25, 天牢: 30, 玄武: 30, 勾陳: 40,
};
const STAR_28_NATURE: Record<string, number> = {
  角: 75, 亢: 35, 氐: 60, 房: 80, 心: 70, 尾: 75, 箕: 65, 斗: 80, 牛: 55, 女: 35,
  虛: 30, 危: 35, 室: 80, 壁: 75, 奎: 55, 婁: 70, 胃: 75, 昴: 30, 畢: 80, 觜: 35,
  參: 75, 井: 75, 鬼: 25, 柳: 35, 星: 55, 張: 75, 翼: 55, 軫: 75,
};
const NINE_STAR_NATURE: Record<number, number> = {
  1: 80, 2: 25, 3: 55, 4: 65, 5: 20, 6: 75, 7: 35, 8: 85, 9: 80,
};

// ─── ค่าสดต่อวัน (civil date · เที่ยงคืนตามปฏิทิน) ───

export type TongshuLiveDay = {
  /** วันที่ที่คำนวณ (YYYY-MM-DD) */
  date: string;
  /** 12建除 · ตัวเต็ม เช่น 開/閉/執 (tyme4ts รู้กฎ疊建ที่節氣) */
  officer: string;
  /** 黃黑道 เทพประจำวัน · ตัวเต็ม เช่น 天牢/金匱 */
  spirit: string;
  /** 28宿 · ตัวเต็ม เช่น 虛/婁 */
  xiu: string;
  /** 紫白日 สาย通書 · 1-9 */
  nineStar: number;
  /** 干支ของวัน (เทียบกับ day_pillar ใน cache เพื่อจับ shichen คร่อมเที่ยงคืน) */
  dayGanZhi: string;
};

/* memo cache ต่อวันที่ · 1 วันคำนวณครั้งเดียวใช้ได้ทั้ง 12 ยาม
 * จำกัดขนาด (FIFO) กัน memory โตไม่จำกัดบน long-running server */
const _memo = new Map<string, TongshuLiveDay>();
const MEMO_MAX = 2000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * คำนวณสด 4 ค่า通書ของวันหนึ่ง (read-time · tyme4ts · memoized)
 * @param dateISO 'YYYY-MM-DD' (รับ 'YYYY-MM-DDTHH:mm' ได้ · ใช้เฉพาะส่วนวันที่)
 * @throws ถ้า format วันที่ผิด หรือ tyme4ts parse ไม่ได้
 */
export function computeTongshuLive(dateISO: string): TongshuLiveDay {
  const m = DATE_RE.exec(String(dateISO || ""));
  if (!m) throw new Error(`computeTongshuLive: invalid date "${dateISO}"`);
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const hit = _memo.get(key);
  if (hit) return hit;

  const ld = SolarDay.fromYmd(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)).getLunarDay();
  const dutyRaw = ld.getDuty().getName();
  const spiritRaw = ld.getTwelveStar().getName();
  const xiuRaw = ld.getTwentyEightStar().getName();
  /* getNineStar().getIndex() = 0-8 → เลขดาว 1-9 (getName() คืนเลขจีน 一..九 ใช้ตรงไม่ได้) */
  const nineStar = ld.getNineStar().getIndex() + 1;

  const day: TongshuLiveDay = {
    date: key,
    officer: DUTY_TRAD[dutyRaw] || dutyRaw,
    spirit: SPIRIT_TRAD[spiritRaw] || spiritRaw,
    xiu: XIU_TRAD[xiuRaw] || xiuRaw,
    nineStar,
    dayGanZhi: ld.getSixtyCycle().getName(),
  };

  if (_memo.size >= MEMO_MAX) {
    // FIFO evict ก้อนแรก ~ MEMO_MAX/4 เพื่อไม่ evict ถี่
    let n = Math.ceil(MEMO_MAX / 4);
    for (const k of _memo.keys()) { _memo.delete(k); if (--n <= 0) break; }
  }
  _memo.set(key, day);
  return day;
}

// ─── ประกอบ ModuleResult 4 ตัว · shape ตรง cache เดิมเป๊ะ ───

function buildResult(
  module: ModuleKey, score: number, tags: string[],
  up: Reason[], down: Reason[], confidence: number, raw: Record<string, any>,
): ModuleResult {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return {
    module, status: "ready",
    score: { raw: s, normalized: s, weight: 1.0 },
    pass: s >= 40,
    tags, reasons: { up, down, warning: [] },
    confidence, raw,
  };
}

export type TongshuModuleResults = {
  twelve_officers: ModuleResult;
  twelve_spirits: ModuleResult;
  twenty_eight: ModuleResult;
  nine_stars: ModuleResult;
};

/** สร้าง ModuleResult 4 module จากค่าสด · logic/สเกล/ข้อความ = build-ephemeris.cjs เดิมทุกตัวอักษร */
export function buildTongshuModuleResults(day: TongshuLiveDay): TongshuModuleResults {
  const oScore = JIAN_CHU_GOOD[day.officer] ?? 50;
  const twelve_officers = buildResult("twelve_officers", oScore, [`officer_${day.officer}`],
    oScore >= 60 ? [{ code: "OFFICER_GOOD", thai: `✓ ${day.officer}日 (12建除)`, delta: oScore - 50 }] : [],
    oScore < 40 ? [{ code: "OFFICER_BAD", thai: `⚠ ${day.officer}日 (12建除)`, delta: oScore - 50 }] : [],
    0.85, { officer: day.officer });

  const spScore = SPIRIT_NATURE[day.spirit] ?? 50;
  const twelve_spirits = buildResult("twelve_spirits", spScore, [`spirit_${day.spirit}`],
    spScore >= 60 ? [{ code: "SPIRIT_GOOD", thai: `✨ ${day.spirit} (12神煞)`, delta: spScore - 50 }] : [],
    spScore < 40 ? [{ code: "SPIRIT_BAD", thai: `⚠ ${day.spirit} (12神煞)`, delta: spScore - 50 }] : [],
    0.8, { spirit: day.spirit });

  const xScore = STAR_28_NATURE[day.xiu] ?? 50;
  const twenty_eight = buildResult("twenty_eight", xScore, [`xiu_${day.xiu}`],
    xScore >= 60 ? [{ code: "XIU_GOOD", thai: `⭐ ${day.xiu}宿 (28宿)`, delta: xScore - 50 }] : [],
    xScore < 40 ? [{ code: "XIU_BAD", thai: `⚠ ${day.xiu}宿 (28宿)`, delta: xScore - 50 }] : [],
    0.8, { star: day.xiu });

  const nScore = NINE_STAR_NATURE[day.nineStar] ?? 50;
  const nine_stars = buildResult("nine_stars", nScore, [`flystar_${day.nineStar}`],
    nScore >= 60 ? [{ code: "STAR_GOOD", thai: `🌟 ${day.nineStar}白 (飛星)`, delta: nScore - 50 }] : [],
    nScore < 40 ? [{ code: "STAR_BAD", thai: `⚠ ${day.nineStar}星 (飛星)`, delta: nScore - 50 }] : [],
    0.75, { star: day.nineStar });

  return { twelve_officers, twelve_spirits, twenty_eight, nine_stars };
}

/**
 * เลือกวันที่ให้ตรงกับแถว cache: แถว shichen=0 (晚子時 23:00-01:00) ใน cache เดิม
 * ผูกกับ day_pillar ของ "วันถัดไป" → เทียบ 干支 · ถ้าไม่ตรงลองวันถัดไป (สูงสุด +1)
 * ไม่ตรงทั้งคู่ (ไม่ควรเกิด) → ใช้วันตาม date ของแถว (fail-safe)
 */
export function computeTongshuLiveForRow(dateISO: string, rowDayGanZhi?: string | null): TongshuLiveDay {
  const base = computeTongshuLive(dateISO);
  const gz = (rowDayGanZhi || "").trim();
  if (!gz || base.dayGanZhi === gz) return base;
  const m = DATE_RE.exec(base.date)!;
  const next = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + 1));
  const nextISO = next.toISOString().slice(0, 10);
  const nextDay = computeTongshuLive(nextISO);
  return nextDay.dayGanZhi === gz ? nextDay : base;
}
