/**
 * payment/packages.ts · แหล่งความจริงเดียวของแพ็กเกจ (server-side เท่านั้น)
 * r408 · 5 ก.ค. 2026
 *
 * ⚠️ กฎเหล็กความปลอดภัย: ราคา + จำนวนยาม + tier hardcode ที่นี่เท่านั้น
 *   client ส่งมาแค่ `code` · ห้ามเชื่อ amount/yam จาก client เด็ดขาด (กันแก้ราคา)
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
  premium_1y: {
    code: "premium_1y",
    kind: "subscription",
    price_thb: 599,
    yam: 120,
    tier: "premium",
    days: 365,
    name: { th: "Premium 1 ปี", en: "Premium 1 year", zh: "賢者一年" },
  },
  master_1y: {
    code: "master_1y",
    kind: "subscription",
    price_thb: 5990,
    yam: 1200,
    tier: "master",
    days: 365,
    name: { th: "Master 1 ปี", en: "Master 1 year", zh: "大師一年" },
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
