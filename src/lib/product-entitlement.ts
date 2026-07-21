/**
 * สิทธิ์ผลิตภัณฑ์ · trial 14 วัน / free / premium / master
 * ศูนย์กลางเกตความสามารถ (SoT เดียว · routes + me + docs อ่านจากนี่)
 *
 * Trial tools ~30% บน datepick / luopan / qimen (capability slice · หน้าเปิดได้)
 */
import { q1 } from "@/lib/db";
import {
  PRODUCT_CONTRACT_VERSION,
  PRODUCT_PAGE_ENTITLEMENTS,
  FREE_SIGNUP_YAM,
  TRIAL_DAYS,
  type ProductPageEntitlements,
  type ProductPlan,
} from "@/lib/product-page-entitlements";

export { PRODUCT_CONTRACT_VERSION, PRODUCT_PAGE_ENTITLEMENTS };
export { FREE_SIGNUP_YAM, TRIAL_DAYS };
export type { ProductPlan };

/** ตรง /api/book + public/book.html */
export const BOOK_SCIENCE_YAM = 18;
export const BOOK_SYNTHESIS_YAM = 10;

/** นับการใช้ Vision 1 ครั้ง = 1 แถว reserve pre (ไม่นับ drain ซ้ำ) */
export const LUOPAN_VISION_USAGE_REASON = "spend_luopan_vision_pre";

/** โมดูลวางฤกษ์ทั้งหมดที่ server รู้จัก (sync กับ auspicious ModuleKey) */
export const DATEPICK_ALL_MODULES = [
  "ba_zi",
  "ze_ri",
  "dong_gong",
  "tai_sui",
  "qi_men",
  "tian_xing",
  "moon_void",
  "moon_sign",
  "retro_window",
  "eclipse_zone",
  "rahu_kalam",
  "panchanga",
  "yong_shen",
  "tara_bala",
  "twelve_officers",
  "twenty_eight",
  "twelve_spirits",
  "nine_stars",
  "he_luo",
  "hex64",
] as const;

export type DatepickModuleId = (typeof DATEPICK_ALL_MODULES)[number];

/**
 * Trial ~30% (6/20) · แกนฤกษ์คลาสสิก
 * free หลัง trial แคบกว่า · premium/master = ครบ
 */
export const DATEPICK_MODULES_TRIAL: readonly DatepickModuleId[] = [
  "ze_ri",
  "twelve_officers",
  "dong_gong",
  "tai_sui",
  "ba_zi",
  "twenty_eight",
];

export const DATEPICK_MODULES_FREE: readonly DatepickModuleId[] = [
  "ze_ri",
  "twelve_officers",
  "ba_zi",
];

export type LuopanMode = "core" | "pro" | "full";
export type LuopanPins = "basic" | "full";
export type QimenDetailMode = "beginner" | "pro";

export type ProductAccess = {
  plan: ProductPlan;
  tier: string;
  in_trial: boolean;
  /**
   * true = บัญชีเก่าที่ไม่เคยมี trial_ends_at
   * นโยบาย: ไม่ backfill trial อัตโนมัติ · house_limit=1 (legacy) · caps อื่น = free แคบ
   * ต่างจาก post-trial free (เคยมี trial แล้วหมด) ที่ house_limit=0
   */
  legacy_free: boolean;
  trial_ends_at: string | null;
  sub_active: boolean;
  sub_expires_at: string | null;
  hour_balance: number;
  house_limit: number;
  fusion_max_sciences: number;
  fusion_max_profiles: number;
  book_max_sciences: number;
  book_synthesis: boolean;
  fusion_suite: boolean;
  network_multi: boolean;
  luopan_vision_max: number;
  datepick_max_people: number;
  /** allowlist โมดูลวางฤกษ์ */
  datepick_modules: DatepickModuleId[];
  /** ความกว้างช่วงค้น (วัน) */
  datepick_max_range_days: number;
  /** จำนวนผลสูงสุดต่อคำขอ */
  datepick_max_results: number;
  /** หล่อแก: core≈30% · pro · full */
  luopan_mode: LuopanMode;
  luopan_pins: LuopanPins;
  /** ฉีเหมิน */
  qimen_detail_mode: QimenDetailMode;
  qimen_search: boolean;
  qimen_sifu: boolean;
  /** สิทธิ์รายหน้า v3 - payload เดียวกันสำหรับ web/mobile และ API gates */
  pages: ProductPageEntitlements;
};

export type ProductUserRow = {
  tier: string | null;
  hour_balance: number | null;
  sub_expires_at: string | null;
  trial_ends_at: string | null;
};

/** pure · ใช้เทสได้โดยไม่แตะ DB */
export function deriveProductAccess(row: ProductUserRow, nowMs: number = Date.now()): ProductAccess {
  const tier = (row.tier || "free").toLowerCase();
  const subActive = !!(row.sub_expires_at && new Date(row.sub_expires_at).getTime() > nowMs);
  const inTrial = !!(row.trial_ends_at && new Date(row.trial_ends_at).getTime() > nowMs);
  const paidMaster = tier === "master" && subActive;
  const paidPremium = tier === "premium" && subActive;

  let plan: ProductPlan = "free";
  if (paidMaster) plan = "master";
  else if (paidPremium) plan = "premium";
  else if (inTrial) plan = "trial";
  const pages = PRODUCT_PAGE_ENTITLEMENTS[plan];

  /* legacy: ไม่มี trial_ends_at เลย · ไม่แจก trial ย้อนหลัง · บ้านได้ 1 หลัง */
  const legacy_free = !row.trial_ends_at && plan === "free";
  const house_limit = legacy_free ? 1 : pages.fengshui.houses;
  const fusion_max_sciences = pages.fusion.max_sciences;
  const fusion_max_profiles = pages.fusion.max_profiles;
  const book_max_sciences = pages.book.max_sciences;
  const book_synthesis = pages.book.synthesis;
  const fusion_suite = pages.fusion.enabled;
  const network_multi = pages.network.team_analysis;
  const luopan_vision_max = pages.luopan.vision_limit;
  const datepick_max_people = pages.datepick.people;

  /* ── datepick / luopan / qimen · trial ~30% ── */
  let datepick_modules: DatepickModuleId[] = [...DATEPICK_MODULES_FREE];
  const datepick_max_range_days = pages.datepick.range_days;
  const datepick_max_results = pages.datepick.results;
  const luopan_mode: LuopanMode = pages.luopan.mode;
  const luopan_pins: LuopanPins = pages.luopan.pins;
  const qimen_detail_mode: QimenDetailMode = pages.qimen.detail === "basic" || pages.qimen.detail === "beginner" ? "beginner" : "pro";
  const qimen_search = pages.qimen.search_days > 0;
  const qimen_sifu = pages.qimen.sifu;

  if (paidMaster) {
    datepick_modules = [...DATEPICK_ALL_MODULES];
  } else if (paidPremium) {
    datepick_modules = [...DATEPICK_ALL_MODULES];
  } else if (inTrial) {
    datepick_modules = [...DATEPICK_MODULES_TRIAL];
  }
  // free post-trial: DATEPICK_MODULES_FREE · core · beginner · no search/sifu (ด้านบน)

  return {
    plan,
    tier,
    in_trial: inTrial,
    legacy_free,
    trial_ends_at: row.trial_ends_at,
    sub_active: subActive,
    sub_expires_at: row.sub_expires_at,
    hour_balance: Number(row.hour_balance) || 0,
    house_limit,
    fusion_max_sciences,
    fusion_max_profiles,
    book_max_sciences,
    book_synthesis,
    fusion_suite,
    network_multi,
    luopan_vision_max,
    datepick_max_people,
    datepick_modules,
    datepick_max_range_days,
    datepick_max_results,
    luopan_mode,
    luopan_pins,
    qimen_detail_mode,
    qimen_search,
    qimen_sifu,
    pages,
  };
}

export async function getProductAccess(userId: string): Promise<ProductAccess | null> {
  if (!userId) return null;
  const row = await q1<ProductUserRow>(
    `SELECT tier, hour_balance, sub_expires_at, trial_ends_at FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [userId]
  );
  if (!row) return null;
  return deriveProductAccess(row);
}

/** กรอง activeModules ตาม plan · คืน allowed + stripped */
export function filterDatepickModules(
  requested: string[],
  access: ProductAccess
): { allowed: DatepickModuleId[]; stripped: string[] } {
  const allow = new Set(access.datepick_modules);
  const allowed: DatepickModuleId[] = [];
  const stripped: string[] = [];
  for (const m of requested) {
    const key = String(m) as DatepickModuleId;
    if (allow.has(key)) allowed.push(key);
    else stripped.push(String(m));
  }
  return { allowed, stripped };
}

/** นับการใช้ Vision จริง (reserve pre เท่านั้น) */
export async function countLuopanVisionUses(userId: string, daily = false): Promise<number> {
  const used = await q1<{ n: number }>(
    `SELECT GREATEST(0,
       COUNT(*) FILTER (WHERE reason = $2) -
       COUNT(*) FILTER (WHERE reason = $3)
     )::int AS n
     FROM hour_transactions WHERE user_id=$1
       AND ($4::boolean=false OR created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`,
    [userId, LUOPAN_VISION_USAGE_REASON, "refund_luopan_vision_pre", daily]
  ).catch(() => ({ n: 0 }));
  return Number(used?.n) || 0;
}

export async function applySignupProductDefaults(userId: string): Promise<void> {
  if (!userId) return;
  await q1(
    `UPDATE users SET
       hour_balance = $2,
       trial_ends_at = COALESCE(trial_ends_at, now() + ($3::text || ' days')::interval)
     WHERE id = $1`,
    [userId, FREE_SIGNUP_YAM, String(TRIAL_DAYS)]
  ).catch((e) =>
    console.warn("[product] applySignupProductDefaults", e instanceof Error ? e.message : e)
  );
}

export function entitlementDenied(
  code: string,
  extra: Record<string, unknown> = {}
): { error: string; code: string; upgrade: string } & Record<string, unknown> {
  return {
    error: code,
    code,
    upgrade: "/pricing",
    ...extra,
  };
}

/** payload caps สำหรับ /api/account/me (web + mobile) */
export function productAccessToCaps(access: ProductAccess) {
  return {
    contract_version: PRODUCT_CONTRACT_VERSION,
    house_limit: access.house_limit,
    legacy_free: !!access.legacy_free,
    fusion_max_sciences: access.fusion_max_sciences,
    fusion_max_profiles: access.fusion_max_profiles,
    book_max_sciences: access.book_max_sciences,
    book_synthesis: access.book_synthesis,
    fusion_suite: access.fusion_suite,
    network_multi: access.network_multi,
    luopan_vision_max: access.luopan_vision_max,
    datepick_max_people: access.datepick_max_people,
    datepick_modules: access.datepick_modules,
    datepick_max_range_days: access.datepick_max_range_days,
    datepick_max_results: access.datepick_max_results,
    luopan_mode: access.luopan_mode,
    luopan_pins: access.luopan_pins,
    qimen_detail_mode: access.qimen_detail_mode,
    qimen_search: access.qimen_search,
    qimen_sifu: access.qimen_sifu,
    pages: access.pages,
  };
}
