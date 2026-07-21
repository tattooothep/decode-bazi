import { getPackage, type PackageDef } from "@/lib/payment/packages";

export const MOBILE_STORE_PRODUCTS = {
  "io.hourkey.yam.100": "topup_100",
  "io.hourkey.yam.550": "topup_550",
  "io.hourkey.yam.1700": "topup_1700",
  "io.hourkey.premium.monthly": "premium_1m",
  "io.hourkey.master.monthly": "master_1m",
} as const;

export type MobileStoreProductId = keyof typeof MOBILE_STORE_PRODUCTS;

export function mobileStorePackage(productId: string): PackageDef | null {
  const packageCode = MOBILE_STORE_PRODUCTS[productId as MobileStoreProductId];
  return packageCode ? getPackage(packageCode) : null;
}

export function listMobileStoreProducts() {
  return Object.entries(MOBILE_STORE_PRODUCTS).map(([product_id, packageCode]) => {
    const pkg = getPackage(packageCode);
    if (!pkg) throw new Error(`missing_store_package:${packageCode}`);
    return {
      product_id,
      package_code: pkg.code,
      kind: pkg.kind,
      tier: pkg.tier || null,
      yam: pkg.yam,
      days_reference_only: pkg.days || null,
      name: pkg.name,
    };
  });
}
