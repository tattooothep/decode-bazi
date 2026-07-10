import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PRODUCT_PAGE_ENTITLEMENTS,
  PRODUCT_CONTRACT_VERSION,
} from "../src/lib/product-page-entitlements.ts";
import { FREE_SIGNUP_YAM, TRIAL_DAYS } from "../src/lib/product-entitlement.ts";
import { getCheckoutPackage, getPackage, listPackagesPublic } from "../src/lib/payment/packages.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const pass = (name) => console.log(`SIGNATURE PASS · ${name}`);

assert.equal(PRODUCT_CONTRACT_VERSION, "entitlements-v2-20260710");
assert.equal(FREE_SIGNUP_YAM, 1000);
assert.equal(TRIAL_DAYS, 14);
assert.deepEqual(PRODUCT_PAGE_ENTITLEMENTS.free.forecast, PRODUCT_PAGE_ENTITLEMENTS.master.forecast);
assert.deepEqual(PRODUCT_PAGE_ENTITLEMENTS.free.palmistry, PRODUCT_PAGE_ENTITLEMENTS.master.palmistry);
assert.equal(PRODUCT_PAGE_ENTITLEMENTS.master.network.team_people, 12);
assert.equal(PRODUCT_PAGE_ENTITLEMENTS.trial.network.saved_profiles, 3);
assert.equal(PRODUCT_PAGE_ENTITLEMENTS.premium.network.saved_profiles, 10);
pass("1 contract");

const palmRead = read("src/app/api/palmistry/read/route.ts");
const palmJob = read("src/app/api/palmistry/job/route.ts");
const forecast = read("src/app/api/forecast/route.ts");
assert.match(palmRead, /if \(!sess\).*auth_required/);
assert.match(palmJob, /!row\.user_id \|\| !session \|\| session\.userId !== row\.user_id/);
assert.match(forecast, /const session = await getSession\(\)/);
assert.equal(getCheckoutPackage("premium_1y"), null);
assert.ok(getPackage("premium_1y"), "old annual orders remain fulfillable");
pass("2 server security");

const spending = read("src/lib/spend-hours.ts");
const palmBilling = read("src/lib/palm-billing.ts");
assert.match(spending, /charsToHours\(chars\) - held/);
assert.match(spending, /Math\.ceil\(.*CHARS_PER_YAM/);
assert.match(palmBilling, /billing_status !== "reserved"/);
assert.match(palmBilling, /refund_palmistry_ai_pre/);
assert.match(forecast, /refundReservedHourForUser/);
assert.match(read("src/app/api/today/route.ts"), /today_date_window/);
assert.match(read("src/app/api/calendar/route.ts"), /calendar_month_window/);
assert.match(read("src/app/api/profile/create/route.ts"), /network_profile_limit/);
assert.match(read("src/app/api/network/sifu/route.ts"), /network_team_ai_locked/);
pass("3 exact AI billing and refund");

const pricing = read("public/pricing.html");
const pricingI18n = read("public/js/pricing-i18n9.js");
const publicCodes = listPackagesPublic().map((p) => p.code);
assert.deepEqual(publicCodes, ["topup_100", "topup_550", "topup_1700", "premium_1m", "master_1m"]);
assert.match(pricing, /hourkey-pricing-hero-v1\.webp/);
assert.match(pricing, /\.bill\[hidden\]\{display:none !important;\}/);
assert.match(pricing, /ทดลอง 14 วัน/);
for (const page of ["chart", "today", "calendar", "yongsennetwork", "forecast", "master", "fengshui", "palmistry"]) {
  assert.match(read(`public/${page}.html`), /hk-product-caps\.js/);
}
for (const lang of ["en", "zh", "cn", "vi", "ja", "ko", "ru", "es"]) {
  assert.match(pricingI18n, new RegExp(`\\b${lang}:\\{`), `commercial copy missing ${lang}`);
}
pass("4 pricing UI and nine locales");

const credit = read("src/lib/payment/credit.ts");
const affiliate = read("src/lib/affiliate.ts");
assert.match(credit, /createPendingAffiliateRewardForOrder/);
assert.match(credit, /reverseAffiliateRewardsForOrder/);
assert.match(affiliate, /self_referral/);
assert.doesNotMatch(read("src/lib/product-entitlement.ts"), /affiliate_(members|rewards|attributions)/);
pass("5 regression and affiliate invariants");

console.log("5/5 signatures passed");
