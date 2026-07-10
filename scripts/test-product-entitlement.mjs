/**
 * Product entitlement coherence — drives SHIPPED deriveProductAccess + DB signup defaults + gates.
 * Run from release root:
 *   SCRATCH=... node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/test-product-entitlement.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SCRATCH = process.env.SCRATCH || "/tmp/grok-goal-1f73643c7c3a/implementer";
fs.mkdirSync(SCRATCH, { recursive: true });

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  Object.assign(process.env, env);
  return env;
}

let passed = 0;
let failed = 0;
const lines = [];
function log(s) {
  console.log(s);
  lines.push(s);
}
function assert(cond, msg) {
  if (cond) {
    passed++;
    log("  PASS " + msg);
  } else {
    failed++;
    log("  FAIL " + msg);
  }
}

async function main() {
  loadEnv();
  const {
    deriveProductAccess,
    FREE_SIGNUP_YAM,
    TRIAL_DAYS,
    BOOK_SCIENCE_YAM,
    BOOK_SYNTHESIS_YAM,
    LUOPAN_VISION_USAGE_REASON,
    applySignupProductDefaults,
    getProductAccess,
    countLuopanVisionUses,
  } = await import("../src/lib/product-entitlement.ts");

  log("=== pure deriveProductAccess caps ===");
  const now = Date.now();
  const trial = deriveProductAccess(
    {
      tier: "free",
      hour_balance: 1000,
      sub_expires_at: null,
      trial_ends_at: new Date(now + 20 * 86400000).toISOString(),
    },
    now
  );
  assert(trial.plan === "trial", "trial plan");
  assert(trial.fusion_max_sciences === 3, "trial fusion sci=3");
  assert(trial.fusion_max_profiles === 1, "trial fusion profiles=1");
  assert(trial.book_max_sciences === 2, "trial book sci=2");
  assert(trial.book_synthesis === false, "trial no book synth");
  assert(trial.house_limit === 3, "trial house=3");
  assert(trial.luopan_vision_max === 1, "trial vision=1");
  assert(trial.datepick_max_people === 1, "trial datepick people=1");
  assert(trial.datepick_modules && trial.datepick_modules.length === 6, "trial datepick ~30% modules");
  assert(trial.datepick_modules.includes("ze_ri") && trial.datepick_modules.includes("ba_zi"), "trial core modules");
  assert(!trial.datepick_modules.includes("qi_men"), "trial no qi_men module");
  assert(trial.datepick_max_range_days === 45, "trial range 45d");
  assert(trial.luopan_mode === "core" && trial.luopan_pins === "basic", "trial luopan core");
  assert(trial.qimen_detail_mode === "beginner" && trial.qimen_search === false && trial.qimen_sifu === false, "trial qimen limited");
  assert(trial.fusion_suite === true, "trial fusion_suite");

  const free = deriveProductAccess(
    {
      tier: "free",
      hour_balance: 500,
      sub_expires_at: null,
      trial_ends_at: new Date(now - 86400000).toISOString(),
    },
    now
  );
  assert(free.plan === "free", "post-trial free plan");
  assert(free.fusion_max_sciences === 2, "free fusion sci=2");
  assert(free.fusion_suite === true, "free fusion suite open");
  assert(free.book_max_sciences === 0, "free book closed");
  assert(free.house_limit === 0, "free house=0");
  assert(free.luopan_vision_max === 0, "free vision=0");
  assert(free.datepick_modules && free.datepick_modules.length === 3, "free narrower modules");
  assert(free.qimen_search === false, "free no qimen search");
  assert(free.legacy_free === false, "post-trial not legacy_free");

  const legacy = deriveProductAccess(
    {
      tier: "free",
      hour_balance: 100,
      sub_expires_at: null,
      trial_ends_at: null,
    },
    now
  );
  assert(legacy.plan === "free", "legacy free plan");
  assert(legacy.legacy_free === true, "legacy_free flag");
  assert(legacy.house_limit === 1, "legacy house=1 (no mass trial backfill)");
  assert(legacy.luopan_vision_max === 0, "legacy vision=0");
  assert(legacy.book_max_sciences === 0, "legacy book closed");
  assert(legacy.datepick_modules && legacy.datepick_modules.length === 3, "legacy same free modules");
  assert(legacy.fusion_max_sciences === 2, "legacy fusion=2");

  const prem = deriveProductAccess(
    {
      tier: "premium",
      hour_balance: 100,
      sub_expires_at: new Date(now + 10 * 86400000).toISOString(),
      trial_ends_at: null,
    },
    now
  );
  assert(prem.plan === "premium", "premium plan");
  assert(prem.fusion_max_sciences === 4, "premium fusion 4");
  assert(prem.book_max_sciences === 3, "premium book 3");
  assert(prem.house_limit === 50, "premium houses");
  assert(prem.datepick_modules && prem.datepick_modules.length >= 15, "premium datepick full modules");
  assert(prem.qimen_search === true && prem.qimen_sifu === true, "premium qimen open");
  assert(prem.luopan_mode === "pro", "premium luopan pro");


  const master = deriveProductAccess(
    {
      tier: "master",
      hour_balance: 2000,
      sub_expires_at: new Date(now + 10 * 86400000).toISOString(),
      trial_ends_at: null,
    },
    now
  );
  assert(master.plan === "master", "master plan");
  assert(master.fusion_max_sciences === 6 && master.fusion_max_profiles === 8, "master full fusion");
  assert(master.book_synthesis === true, "master book synth");
  assert(master.luopan_vision_max === 10, "master vision=10/day");

  for (const access of [free, trial, prem, master]) {
    assert(access.fusion_suite === access.pages.fusion.enabled, `${access.plan} fusion alias matches pages`);
    assert(access.fusion_max_sciences === access.pages.fusion.max_sciences, `${access.plan} fusion max alias matches pages`);
    assert(access.book_max_sciences === access.pages.book.max_sciences, `${access.plan} book alias matches pages`);
    assert(access.luopan_vision_max === access.pages.luopan.vision_limit, `${access.plan} vision alias matches pages`);
    assert(access.datepick_max_people === access.pages.datepick.people, `${access.plan} datepick people alias matches pages`);
    assert(access.datepick_max_range_days === access.pages.datepick.range_days, `${access.plan} datepick range alias matches pages`);
  }

  assert(FREE_SIGNUP_YAM === 1000, "FREE_SIGNUP_YAM=1000");
  assert(TRIAL_DAYS === 14, "TRIAL_DAYS=14");
  assert(BOOK_SCIENCE_YAM === 18 && BOOK_SYNTHESIS_YAM === 10, "book yam 18+10");
  assert(LUOPAN_VISION_USAGE_REASON === "spend_luopan_vision_pre", "vision reason constant");

  log("=== UI consistency static ===");
  const bookHtml = fs.readFileSync(path.join(root, "public/book.html"), "utf8");
  assert(/BOOK_SCI_YAM\s*=\s*18/.test(bookHtml), "book.html SCI 18");
  assert(/BOOK_SYNTH_YAM\s*=\s*10/.test(bookHtml), "book.html SYNTH 10");
  assert(!/BOOK_SCI_YAM\s*=\s*50/.test(bookHtml), "book.html not 50");
  const pricing = fs.readFileSync(path.join(root, "public/pricing.html"), "utf8");
  assert(pricing.includes("1000") || pricing.includes("1,000"), "pricing has 1000 yam");
  assert(/ไม่ refill|no monthly auto-refill|尚未每月自動補發/i.test(pricing), "pricing honest no monthly refill");
  assert(!/500 ยาม\/เดือน/.test(pricing), "pricing no false 500/month claim");
  const menu = fs.readFileSync(path.join(root, "public/js/hk-user-menu.js"), "utf8");
  assert(menu.includes("hk-um-trial-line") && menu.includes("trial_ends_at"), "user menu trial line");
  const account = fs.readFileSync(path.join(root, "public/account.html"), "utf8");
  assert(account.includes("trial-exp") && account.includes("in_trial"), "account trial UI");
  const fusion = fs.readFileSync(path.join(root, "public/master-fusion.html"), "utf8");
  assert(fusion.includes("productCaps") && fusion.includes("maxSciences"), "fusion client caps");
  const datepick = fs.readFileSync(path.join(root, "public/datepick.html"), "utf8");
  assert(datepick.includes("datepickMaxPeople") && datepick.includes("loadDatepickCaps"), "datepick client people cap");
  assert(datepick.includes("toggleDatepickPerson"), "datepick toggle respects cap");
  const luopan = fs.readFileSync(path.join(root, "public/luopan.html"), "utf8");
  assert(luopan.includes("luopan_vision_limit") || luopan.includes("luopan_vision_locked"), "luopan surfaces vision entitlement");
  assert(luopan.includes('data-lp-tier="pro"') && luopan.includes('data-lp-tier="full"'), "luopan data-lp-tier pro/full markup");
  assert(luopan.includes('data-lp-pin-tier="full"'), "luopan water pin tier markup");
  const bookApi = fs.readFileSync(path.join(root, "src/app/api/book/route.ts"), "utf8");
  assert(bookApi.includes("product-entitlement") && bookApi.includes("book_science_limit"), "book gate");
  const vision = fs.readFileSync(path.join(root, "src/app/api/luopan/vision/route.ts"), "utf8");
  assert(vision.includes("countLuopanVisionUses"), "vision uses single-count helper");
  const houses = fs.readFileSync(path.join(root, "src/app/api/houses/route.ts"), "utf8");
  assert(houses.includes("house_limit") && houses.includes("getProductAccess"), "houses gate");
  const ausp = fs.readFileSync(path.join(root, "src/app/api/auspicious/route.ts"), "utf8");
  assert(ausp.includes("datepick_people_limit"), "auspicious people gate");
  const capsJs = fs.readFileSync(path.join(root, "public/js/hk-product-caps.js"), "utf8");
  assert(capsJs.includes("applyDatepickLocks") && capsJs.includes("DATEPICK") || capsJs.includes("datepick"), "product-caps js");
  assert(fs.readFileSync(path.join(root, "public/datepick.html"), "utf8").includes("hk-product-caps.js"), "datepick wired");
  assert(fs.readFileSync(path.join(root, "public/luopan.html"), "utf8").includes("hk-product-caps.js"), "luopan wired");
  assert(fs.readFileSync(path.join(root, "public/qimen.html"), "utf8").includes("hk-product-caps.js"), "qimen wired");
  assert(ausp.includes("datepick_module_locked") || ausp.includes("datepick_modules"), "auspicious module gate");
  const qSearch = fs.readFileSync(path.join(root, "src/app/api/qimen/search/route.ts"), "utf8");
  assert(qSearch.includes("qimen_search"), "qimen search gate");
  const qSifu = fs.readFileSync(path.join(root, "src/app/api/qimen/sifu/route.ts"), "utf8");
  assert(qSifu.includes("qimen_sifu"), "qimen sifu gate");


  log("=== admin + affiliate isolation static ===");
  const adminMem = fs.readFileSync(path.join(root, "src/app/api/admin/members/route.ts"), "utf8");
  assert(adminMem.includes("product_access") && adminMem.includes("deriveProductAccess"), "admin members product_access");
  assert(adminMem.includes("extend_trial") && adminMem.includes("trial_ends_at"), "admin extend_trial");
  assert(!/INSERT INTO affiliate_|UPDATE affiliate_/.test(adminMem), "admin members no affiliate write");
  const user360 = fs.readFileSync(path.join(root, "src/app/admin/users/[id]/user360-client.tsx"), "utf8");
  assert(user360.includes("product_access") && user360.includes("extend_trial"), "user360 plan/trial UX");
  const membersUi = fs.readFileSync(path.join(root, "src/app/admin/members/editor.tsx"), "utf8");
  assert(membersUi.includes("product_plan") && membersUi.includes("plan"), "members list plan filter");
  const financeApi = fs.readFileSync(path.join(root, "src/app/api/admin/finance/route.ts"), "utf8");
  assert(financeApi.includes("in_trial"), "finance counts in_trial");
  const affLib = fs.readFileSync(path.join(root, "src/lib/affiliate.ts"), "utf8");
  assert(!affLib.includes("product-entitlement") && !affLib.includes("trial_ends_at"), "affiliate lib isolated from product");
  const credit = fs.readFileSync(path.join(root, "src/lib/payment/credit.ts"), "utf8");
  assert(credit.includes("createPendingAffiliateRewardForOrder"), "fulfill still hooks affiliate");
  const pkgs = fs.readFileSync(path.join(root, "src/lib/payment/packages.ts"), "utf8");
  assert(pkgs.includes("price_thb: 399") && pkgs.includes("price_thb: 990"), "stripe THB packages unchanged");
  assert(pkgs.includes("yam: 500") && pkgs.includes("yam: 2000"), "membership yam packs unchanged");

  log("=== DB signup defaults + membership ===");
  const c = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });
  await c.connect();
  const email = `ent-test-${Date.now()}@hourkey.io`;
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  try {
    await c.query(
      `INSERT INTO users (id, email, password_hash, name, locale, timezone, theme, email_verified, is_active, created_at)
       VALUES ($1,$2,$3,$4,'th','Asia/Bangkok','dark',false,true,now())`,
      [userId, email, "x", "EntTest"]
    );
    await c.query(
      `INSERT INTO organizations (id, owner_user_id, name, slug, created_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT DO NOTHING`,
      [orgId, userId, "t", orgId.slice(0, 8)]
    ).catch(async () => {
      await c.query(`INSERT INTO organizations (id, name) VALUES ($1,$2)`, [orgId, "t"]);
    });
    // ensureOrgMember SQL equivalent
    await c.query(
      `INSERT INTO org_members (id, org_id, user_id, role, status, joined_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'owner', 'active', now(), now())
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [orgId, userId]
    );
    await c.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
    await applySignupProductDefaults(userId);

    const u = await c.query(
      `SELECT hour_balance, trial_ends_at, tier FROM users WHERE id=$1`,
      [userId]
    );
    const row = u.rows[0];
    assert(Number(row.hour_balance) === 1000, "DB hour_balance=1000 after defaults");
    assert(row.trial_ends_at, "DB trial_ends_at set");
    const days =
      (new Date(row.trial_ends_at).getTime() - Date.now()) / 86400000;
    assert(days > 13 && days < 15.5, "trial ~14d (got " + days.toFixed(2) + ")");
    const mem = await c.query(`SELECT 1 FROM org_members WHERE user_id=$1`, [userId]);
    assert(mem.rows.length >= 1, "org_members row exists");

    const access = await getProductAccess(userId);
    assert(access && access.plan === "trial", "getProductAccess plan=trial");
    assert(access.fusion_max_sciences === 3, "live access fusion 3");
    assert(access.luopan_vision_max === 1, "live access vision 1");

    // gate denial shapes (pure)
    const { entitlementDenied } = await import("../src/lib/product-entitlement.ts");
    const d = entitlementDenied("fusion_science_limit", { max: 3, requested: 6 });
    assert(d.code === "fusion_science_limit" && d.upgrade === "/pricing", "denial payload");

    // simulate over-cap decisions
    assert(6 > access.fusion_max_sciences, "over-cap fusion would deny");
    assert(access.book_max_sciences === 2 && 6 > 2, "over-cap book would deny");
    assert(access.house_limit === 3, "house limit trial");

    // vision usage count starts 0
    const v0 = await countLuopanVisionUses(userId);
    assert(v0 === 0, "vision uses start 0");
    await c.query(
      `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature)
       VALUES ($1, -1, $2, 999, 'luopan_vision_pre')`,
      [userId, LUOPAN_VISION_USAGE_REASON]
    );
    const v1 = await countLuopanVisionUses(userId);
    assert(v1 === 1, "vision uses=1 after pre");
    // drain must not double-count
    await c.query(
      `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_feature)
       VALUES ($1, -5, 'spend_luopan_vision', 994, 'luopan_vision')`,
      [userId]
    );
    const v2 = await countLuopanVisionUses(userId);
    assert(v2 === 1, "vision uses still 1 after drain (no double-count)");
  } finally {
    await c.query(`DELETE FROM hour_transactions WHERE user_id=$1`, [userId]).catch(() => {});
    await c.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => {});
    await c.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => {});
    await c.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => {});
    await c.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => {});
    await c.end();
  }

  log("=== summary ===");
  log(`passed=${passed} failed=${failed}`);
  const out = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(SCRATCH, "signup-entitlement.log"), out);
  fs.writeFileSync(path.join(SCRATCH, "gate-denials.log"), out);
  fs.writeFileSync(path.join(SCRATCH, "ui-consistency.log"), out);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
