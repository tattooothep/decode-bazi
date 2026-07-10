/**
 * payment/packages.ts · แหล่งความจริงเดียวของแพ็กเกจ checkout (server-side เท่านั้น)
 * r408 · 5 ก.ค. 2026 · confirmed SoT 2026-07-09 (admin packages DB = promo tooling only)
 *
 * ⚠️ กฎเหล็กความปลอดภัย: ราคา + จำนวนยาม + tier hardcode ที่นี่เท่านั้น
 *   client ส่งมาแค่ `code` · ห้ามเชื่อ amount/yam จาก client เด็ดขาด (กันแก้ราคา)
 *   tier ค่าได้เฉพาะ free|premium|master (subscription grants premium|master)
 * See docs/AFFILIATE_ISOLATION_CONTRACT.md
 */

export type PackageKind = "topup" | "subscription";

export type PackageDef = {
  code: string;
  kind: PackageKind;
  /** ราคาเป็นบาท (จำนวนเต็ม) — ใช้ตรวจยอดที่ gateway ตัดจริงต้องตรงกับค่านี้ */
  price_thb: number;
  /** จำนวนยามที่เติมให้ (topup = ยามหลัก · subscription = ยามแถม) */
  yam: number;
  /** เฉพาะ subscription: tier ที่จะเปิด */
  tier?: "premium" | "master";
  /** เฉพาะ subscription: อายุสมาชิก (วัน) */
  days?: number;
  name: { th: string; en: string; zh: string };
};

/** config แพ็กเกจทั้งหมด · lookup ด้วย code เท่านั้น */
export const PACKAGES: Record<string, PackageDef> = {
  topup_100: {
    code: "topup_100",
    kind: "topup",
    price_thb: 99,
    yam: 100,
    name: { th: "100 ยาม", en: "100 credits", zh: "100 時" },
  },
  topup_550: {
    code: "topup_550",
    kind: "topup",
    price_thb: 449,
    yam: 550,
    name: { th: "550 ยาม", en: "550 credits", zh: "550 時" },
  },
  topup_1700: {
    code: "topup_1700",
    kind: "topup",
    price_thb: 1290,
    yam: 1700,
    name: { th: "1,700 ยาม", en: "1,700 credits", zh: "1,700 時" },
  },
  // ── Premium ──────────────────────────────────────────────
  premium_1m: {
    code: "premium_1m",
    kind: "subscription",
    price_thb: 399,
    yam: 500,
    tier: "premium",
    days: 30,
    name: { th: "Premium รายเดือน", en: "Premium monthly", zh: "賢者月費" },
  },
  premium_1y: {
    code: "premium_1y",
    kind: "subscription",
    price_thb: 3990, // = 10 เดือน (แถม 2 เดือน)
    yam: 500, // ยามเริ่มต้น · เติมรายเดือน = เฟส 2 (tier refill cron)
    tier: "premium",
    days: 365,
    name: { th: "Premium รายปี", en: "Premium annual", zh: "賢者年費" },
  },
  // ── Master ───────────────────────────────────────────────
  master_1m: {
    code: "master_1m",
    kind: "subscription",
    price_thb: 990,
    yam: 2000,
    tier: "master",
    days: 30,
    name: { th: "Master รายเดือน", en: "Master monthly", zh: "大師月費" },
  },
  master_1y: {
    code: "master_1y",
    kind: "subscription",
    price_thb: 9900, // = 10 เดือน (แถม 2 เดือน)
    yam: 2000, // ยามเริ่มต้น · เติมรายเดือน = เฟส 2
    tier: "master",
    days: 365,
    name: { th: "Master รายปี", en: "Master annual", zh: "大師年費" },
  },
};

/** ดึง config แพ็กเกจแบบปลอดภัย (server-side) · คืน null ถ้าไม่รู้จัก code */
export function getPackage(code: string | null | undefined): PackageDef | null {
  if (!code) return null;
  return PACKAGES[String(code)] || null;
}

/** จำนวนสตางค์ (satang) สำหรับ gateway (Stripe/Omise คิดหน่วยเล็กสุด) */
export function thbToSatang(thb: number): number {
  return Math.round(Number(thb) * 100);
}

/** รายการแพ็กเกจสำหรับแสดงผลฝั่ง client (ไม่มีข้อมูลลับ) */
export function listPackagesPublic() {
  return Object.values(PACKAGES).map((p) => ({
    code: p.code,
    key: p.code, // alias สำหรับ account.html
    kind: p.kind,
    price_thb: p.price_thb,
    hours: p.yam,
    tier: p.tier || null,
    days: p.days || null,
    name: p.name,
    label: p.name.th,
  }));
}
