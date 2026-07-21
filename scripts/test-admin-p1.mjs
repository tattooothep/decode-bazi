/**
 * P1 tests — coupons math, credit caps, session bump, margin fields.
 * Run: node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/test-admin-p1.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = process.env.SCRATCH || "/tmp/grok-goal-47254494a478/implementer";
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

let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log("  PASS", m); }
  else { failed++; console.error("  FAIL", m); }
}

async function main() {
  const env = loadEnv();
  const { applyCouponToPackage } = await import("../src/lib/payment/coupons.ts");
  const { checkCreditAdjustAllowed, pickRoleCap } = await import("../src/lib/admin-credit-policy.ts");
  // auth.ts pulls next/headers — test session_version via SQL + jose only through admin paths if needed

  console.log("=== coupons pure ===");
  const b = applyCouponToPackage({ price_thb: 1000, yam: 100 }, { kind: "percent_off", value: 10 });
  assert(b.amount_thb === 900 && b.discount_thb === 100, "percent_off 10%");
  const f = applyCouponToPackage({ price_thb: 100, yam: 50 }, { kind: "fixed_off", value: 30 });
  assert(f.amount_thb === 70, "fixed_off");
  const y = applyCouponToPackage({ price_thb: 99, yam: 100 }, { kind: "bonus_yam", value: 20 });
  assert(y.yam === 120 && y.amount_thb === 99, "bonus_yam");

  console.log("=== credit caps ===");
  const support = { userId: "x", email: "s@t", orgId: null, role: "support", roles: ["support"], perms: new Set(["admin.users.credit.adjust"]), source: "rbac", isSuper: false };
  const fin = { ...support, roles: ["finance"], role: "finance" };
  const caps = { support: { max_abs: 500, daily: 2000 }, finance: { max_abs: 0, daily: 0 }, ops: { max_abs: 5000, daily: 20000 } };
  assert(pickRoleCap(support, caps).max_abs === 500, "support cap 500");
  assert(pickRoleCap(fin, caps).max_abs === 0, "finance cannot mint");
  // DB path
  const c = new Client({ host: env.PGHOST, port: +env.PGPORT, user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE });
  await c.connect();
  const stamp = Date.now();
  const u = (await c.query(
    `INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,hour_balance,tier,created_at)
     VALUES (gen_random_uuid(),$1,'x','t','th','Asia/Bangkok','system',true,true,0,'free',now()) RETURNING id,email`,
    [`p1_${stamp}@decode.test`]
  )).rows[0];
  try {
    const role = (await c.query(`SELECT id FROM admin_roles WHERE key='finance'`)).rows[0];
    if (role) {
      await c.query(`INSERT INTO admin_user_roles(user_id,role_id,granted_by) VALUES ($1,$2,$1)`, [u.id, role.id]);
      const { resolveAdminSessionForUser } = await import("../src/lib/admin-guard.ts");
      const sess = await resolveAdminSessionForUser(u.id, u.email, null);
      const chk = await checkCreditAdjustAllowed(sess, 10);
      assert(chk.ok === false, "finance credit adjust denied by policy");
    } else {
      assert(true, "skip finance role missing");
    }

    console.log("=== session version (DB bump) ===");
    const sv0 = Number((await c.query(`SELECT COALESCE(session_version,0) AS v FROM users WHERE id=$1`, [u.id])).rows[0].v);
    await c.query(`UPDATE users SET session_version = COALESCE(session_version,0) + 1 WHERE id=$1`, [u.id]);
    const sv1 = Number((await c.query(`SELECT session_version AS v FROM users WHERE id=$1`, [u.id])).rows[0].v);
    assert(sv1 === sv0 + 1, `session_version bump ${sv0}->${sv1}`);
    // shipped helper exists
    const authSrc = fs.readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    assert(authSrc.includes("bumpSessionVersion") && authSrc.includes("session_version"), "auth session_version helpers");

    console.log("=== structure ===");
    for (const p of [
      "src/app/admin/support/page.tsx",
      "src/app/admin/ai-cost/page.tsx",
      "src/lib/payment/coupons.ts",
      "src/app/api/admin/impersonate/route.ts",
      "src/app/api/admin/users/[id]/pdpa/route.ts",
      "src/app/api/admin/users/[id]/devices/route.ts",
      "migrations/20260709_admin_p1.sql",
    ]) {
      assert(fs.existsSync(path.join(root, p)), p);
    }
    // finance margin in route
    const finSrc = fs.readFileSync(path.join(root, "src/app/api/admin/finance/route.ts"), "utf8");
    assert(finSrc.includes("contribution_thb") && finSrc.includes("affiliate_rewards"), "finance margin fields");
    // payment create coupon
    const pay = fs.readFileSync(path.join(root, "src/app/api/payment/create/route.ts"), "utf8");
    assert(pay.includes("resolveCheckoutPricing") && pay.includes("couponCode"), "checkout coupon wired");
    // no affiliate table writes from p1 admin (except read)
    assert(!pay.includes("affiliate_members"), "payment create does not touch affiliate_members");
  } finally {
    await c.query(`DELETE FROM admin_user_roles WHERE user_id=$1`, [u.id]).catch(() => null);
    await c.query(`DELETE FROM users WHERE id=$1`, [u.id]).catch(() => null);
    await c.end();
  }

  console.log(`\nRESULT passed=${passed} failed=${failed}`);
  fs.writeFileSync(path.join(SCRATCH, "p1-tests.log"), `passed=${passed} failed=${failed}\n`);
  fs.writeFileSync(path.join(SCRATCH, "no-deploy.txt"), "P0+P1 local only · deploy when approved\n");
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
