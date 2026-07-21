/**
 * Platform admin permission catalog + role bundles.
 * Source of truth for valid keys; DB seeds mirror this file.
 */

export const ADMIN_PERM_KEYS = [
  "admin.dashboard.read",
  "admin.users.read",
  "admin.users.credit.adjust",
  "admin.users.tier.set",
  "admin.users.sub.extend",
  "admin.users.suspend",
  "admin.users.restore",
  "admin.users.export",
  "admin.users.notes.write",
  "admin.users.impersonate",
  "admin.packages.read",
  "admin.packages.write",
  "admin.coupons.read",
  "admin.coupons.write",
  "admin.finance.read",
  "admin.orders.read",
  "admin.orders.refund",
  "admin.txns.read",
  "admin.ai_cost.read",
  "admin.settings.read",
  "admin.settings.write",
  "admin.library.read",
  "admin.library.write",
  "admin.engine.read",
  "admin.engine.write",
  "admin.formulas.read",
  "admin.formulas.write",
  "admin.prompts.read",
  "admin.prompts.write",
  "admin.paraphrase.read",
  "admin.paraphrase.write",
  "admin.research.read",
  "admin.research.write",
  "admin.community.read",
  "admin.community.write",
  "admin.affiliate.members.read",
  "admin.affiliate.members.approve",
  "admin.affiliate.members.suspend",
  "admin.affiliate.attributions.read",
  "admin.affiliate.attributions.review",
  "admin.affiliate.rewards.read",
  "admin.affiliate.rewards.approve",
  "admin.affiliate.rewards.pay",
  "admin.affiliate.rewards.reverse",
  "admin.affiliate.settings.write",
  "admin.affiliate.audit.read",
  "admin.iam.read",
  "admin.iam.invite",
  "admin.iam.roles.grant",
  "admin.iam.roles.revoke",
  "admin.audit.read",
  "admin.audit.export",
] as const;

export type AdminPermKey = (typeof ADMIN_PERM_KEYS)[number] | string;

export type RoleSeed = {
  key: string;
  name_th: string;
  name_en: string;
  description: string;
  is_super: boolean;
  sort: number;
  perms: readonly string[] | "*";
};

/** All non-super roles get explicit lists (never silent full access). */
export const ROLE_SEEDS: RoleSeed[] = [
  {
    key: "superadmin",
    name_th: "ซูเปอร์แอดมิน",
    name_en: "Superadmin",
    description: "Full platform access",
    is_super: true,
    sort: 0,
    perms: "*",
  },
  {
    key: "ops",
    name_th: "ปฏิบัติการ",
    name_en: "Operations",
    description: "Day-to-day user & product ops",
    is_super: false,
    sort: 10,
    perms: [
      "admin.dashboard.read",
      "admin.users.read",
      "admin.users.credit.adjust",
      "admin.users.tier.set",
      "admin.users.sub.extend",
      "admin.users.suspend",
      "admin.users.restore",
      "admin.users.export",
      "admin.users.notes.write",
      "admin.packages.read",
      "admin.packages.write",
      "admin.coupons.read",
      "admin.coupons.write",
      "admin.finance.read",
      "admin.orders.read",
      "admin.txns.read",
      "admin.ai_cost.read",
      "admin.settings.read",
      "admin.settings.write",
      "admin.library.read",
      "admin.engine.read",
      "admin.formulas.read",
      "admin.prompts.read",
      "admin.paraphrase.read",
      "admin.research.read",
      "admin.community.read",
      "admin.community.write",
      "admin.affiliate.members.read",
      "admin.affiliate.rewards.read",
      "admin.affiliate.attributions.read",
      "admin.audit.read",
    ],
  },
  {
    key: "support",
    name_th: "ซัพพอร์ต",
    name_en: "Support",
    description: "User lookup, limited credit, suspend",
    is_super: false,
    sort: 20,
    perms: [
      "admin.dashboard.read",
      "admin.users.read",
      "admin.users.credit.adjust",
      "admin.users.suspend",
      "admin.users.notes.write",
      "admin.community.read",
      "admin.community.write",
      "admin.orders.read",
      "admin.txns.read",
      "admin.audit.read",
    ],
  },
  {
    key: "finance",
    name_th: "การเงิน",
    name_en: "Finance",
    description: "Orders, refunds, commission payout view",
    is_super: false,
    sort: 30,
    perms: [
      "admin.dashboard.read",
      "admin.users.read",
      "admin.users.sub.extend",
      "admin.packages.read",
      "admin.coupons.read",
      "admin.finance.read",
      "admin.orders.read",
      "admin.orders.refund",
      "admin.txns.read",
      "admin.ai_cost.read",
      "admin.affiliate.members.read",
      "admin.affiliate.rewards.read",
      "admin.affiliate.rewards.pay",
      "admin.affiliate.rewards.reverse",
      "admin.affiliate.settings.write",
      "admin.audit.read",
      "admin.audit.export",
    ],
  },
  {
    key: "content",
    name_th: "เนื้อหา",
    name_en: "Content",
    description: "Library, engine, prompts, paraphrase",
    is_super: false,
    sort: 40,
    perms: [
      "admin.dashboard.read",
      "admin.library.read",
      "admin.library.write",
      "admin.engine.read",
      "admin.engine.write",
      "admin.formulas.read",
      "admin.formulas.write",
      "admin.prompts.read",
      "admin.prompts.write",
      "admin.paraphrase.read",
      "admin.paraphrase.write",
      "admin.audit.read",
    ],
  },
  {
    key: "research",
    name_th: "วิจัย",
    name_en: "Research",
    description: "Research console only",
    is_super: false,
    sort: 50,
    perms: [
      "admin.dashboard.read",
      "admin.research.read",
      "admin.research.write",
      "admin.audit.read",
    ],
  },
  {
    key: "affiliate_ops",
    name_th: "แอฟฟิลิเอต",
    name_en: "Affiliate Ops",
    description: "Partner & commission ops (no direct credit mint)",
    is_super: false,
    sort: 60,
    perms: [
      "admin.dashboard.read",
      "admin.users.read",
      "admin.orders.read",
      "admin.affiliate.members.read",
      "admin.affiliate.members.approve",
      "admin.affiliate.members.suspend",
      "admin.affiliate.attributions.read",
      "admin.affiliate.attributions.review",
      "admin.affiliate.rewards.read",
      "admin.affiliate.rewards.approve",
      "admin.affiliate.rewards.reverse",
      "admin.affiliate.audit.read",
      "admin.audit.read",
    ],
  },
  {
    key: "readonly",
    name_th: "อ่านอย่างเดียว",
    name_en: "Read-only",
    description: "Dashboards and lists only",
    is_super: false,
    sort: 90,
    perms: [
      "admin.dashboard.read",
      "admin.users.read",
      "admin.packages.read",
      "admin.coupons.read",
      "admin.finance.read",
      "admin.orders.read",
      "admin.txns.read",
      "admin.ai_cost.read",
      "admin.settings.read",
      "admin.library.read",
      "admin.engine.read",
      "admin.formulas.read",
      "admin.prompts.read",
      "admin.paraphrase.read",
      "admin.research.read",
      "admin.affiliate.members.read",
      "admin.affiliate.rewards.read",
      "admin.affiliate.attributions.read",
      "admin.audit.read",
    ],
  },
];

export const PRODUCT_TIERS = ["free", "premium", "master"] as const;
export type ProductTier = (typeof PRODUCT_TIERS)[number];

export function isProductTier(v: string): v is ProductTier {
  return (PRODUCT_TIERS as readonly string[]).includes(v);
}

/** Map legacy admin mistakes → product tier */
export function normalizeProductTier(raw: string): ProductTier | null {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "pro" || t === "vip") return null; // reject legacy
  if (isProductTier(t)) return t;
  return null;
}

export function hasPermission(
  perms: Set<string> | readonly string[],
  key: string,
  isSuper = false
): boolean {
  if (isSuper) return true;
  const set = perms instanceof Set ? perms : new Set(perms);
  if (set.has("*") || set.has("admin.*")) return true;
  if (set.has(key)) return true;
  // prefix: admin.users.* 
  const parts = key.split(".");
  for (let i = parts.length - 1; i >= 1; i--) {
    const wild = parts.slice(0, i).join(".") + ".*";
    if (set.has(wild)) return true;
  }
  return false;
}

/** Support credit policy defaults (can be overridden by admin_action_policies later). */
export const SUPPORT_CREDIT_MAX_ABS = 500;
export const SUPPORT_CREDIT_DAILY_CAP = 2000;
