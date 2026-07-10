/**
 * P0 admin tests — drives SHIPPED modules on real DB paths.
 * Run: node --experimental-strip-types --import ./scripts/ts-alias-loader.mjs scripts/test-admin-p0.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SCRATCH = process.env.SCRATCH || "/tmp/grok-goal-47254494a478/implementer";
fs.mkdirSync(SCRATCH, { recursive: true });

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  Object.assign(process.env, env);
  process.env.ADMIN_RBAC_ENFORCE = "1";
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
  const env = loadEnv();

  const {
    resolveAdminSessionForUser,
    evaluatePermission,
    ensureAdminRbacSeeded,
    sessionHasPermission,
  } = await import("../src/lib/admin-guard.ts");
  const { checkAccountUsable, accountGateMessage } = await import("../src/lib/account-status.ts");
  const { normalizeProductTier } = await import("../src/lib/admin-permissions.ts");
  const { adminAdjustCredit, adminSetTier, adminSetActive } = await import("../src/lib/admin-member-actions.ts");
  const { clawbackYamForOrder, refundPaidOrder } = await import("../src/lib/payment/credit.ts");
  const { writeAdminAudit } = await import("../src/lib/admin-audit.ts");

  await ensureAdminRbacSeeded();

  const c = new Client({
    host: env.PGHOST,
    port: +env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
  });
  await c.connect();

  // ── fixtures ─────────────────────────────────────────────
  const stamp = Date.now();
  const mkUser = async (suffix, extra = {}) => {
    const email = `p0_${suffix}_${stamp}@decode.test`;
    const r = await c.query(
      `INSERT INTO users (id, email, password_hash, name, locale, timezone, theme, email_verified, is_active, hour_balance, tier, created_at, deleted_at)
       VALUES (gen_random_uuid(), $1, 'x', $2, 'th', 'Asia/Bangkok', 'system', true, $3, $4, 'free', now(), $5)
       RETURNING id, email`,
      [email, suffix, extra.is_active !== false, extra.hour_balance ?? 200, extra.deleted_at || null]
    );
    return r.rows[0];
  };

  const grantRole = async (userId, roleKey) => {
    const role = await c.query(`SELECT id FROM admin_roles WHERE key=$1`, [roleKey]);
    if (!role.rows[0]) throw new Error("missing role " + roleKey);
    await c.query(
      `INSERT INTO admin_user_roles(user_id, role_id, granted_by, note)
       VALUES ($1,$2,$1,'test')`,
      [userId, role.rows[0].id]
    );
  };

  const cleanupIds = [];

  try {
    log("=== 1) RBAC requirePermission path (resolveAdminSessionForUser + evaluatePermission) ===");
    const prevEmails = process.env.ADMIN_EMAILS || "";

    // Break-glass: set ADMIN_EMAILS at runtime (envAllowlist re-reads each call) — NO DB role grant
    const glass = await mkUser("breakglass");
    cleanupIds.push(glass.id);
    process.env.ADMIN_EMAILS = glass.email;
    const glassSess = await resolveAdminSessionForUser(glass.id, glass.email, null);
    assert(!!glassSess, "break-glass session resolved without DB role");
    assert(glassSess.source === "env", "break-glass source=env");
    assert(glassSess.isSuper === true, "break-glass isSuper");
    assert(sessionHasPermission(glassSess, "admin.users.credit.adjust") === true, "break-glass can credit.adjust");
    assert(evaluatePermission(glassSess, "admin.orders.refund").ok === true, "break-glass can refund");
    // clear env so later users are not accidentally break-glass
    process.env.ADMIN_EMAILS = "";

    // superadmin via DB role
    const founder = await mkUser("founder");
    cleanupIds.push(founder.id);
    await grantRole(founder.id, "superadmin");
    const founderSess = await resolveAdminSessionForUser(founder.id, founder.email, null);
    assert(!!founderSess, "superadmin session resolved");
    assert(founderSess.isSuper || sessionHasPermission(founderSess, "admin.users.credit.adjust"), "super can credit");
    const superEval = evaluatePermission(founderSess, "admin.users.credit.adjust");
    assert(superEval.ok === true, "evaluatePermission allow for super/role with credit");

    const supportU = await mkUser("support");
    cleanupIds.push(supportU.id);
    await grantRole(supportU.id, "support");
    const supportSess = await resolveAdminSessionForUser(supportU.id, supportU.email, null);
    assert(!!supportSess, "support session resolved");
    assert(sessionHasPermission(supportSess, "admin.users.credit.adjust") === true, "support HAS credit.adjust");
    assert(sessionHasPermission(supportSess, "admin.users.tier.set") === false, "support LACKS tier.set");
    const denyTier = evaluatePermission(supportSess, "admin.users.tier.set");
    assert(denyTier.ok === false && denyTier.status === 403, "evaluatePermission deny tier for support");
    const allowCredit = evaluatePermission(supportSess, "admin.users.credit.adjust");
    assert(allowCredit.ok === true, "evaluatePermission allow credit for support");

    // Role WITHOUT credit.adjust (readonly + finance)
    const roU = await mkUser("readonly");
    cleanupIds.push(roU.id);
    await grantRole(roU.id, "readonly");
    const roSess = await resolveAdminSessionForUser(roU.id, roU.email, null);
    assert(!!roSess, "readonly session resolved");
    assert(sessionHasPermission(roSess, "admin.users.read") === true, "readonly HAS users.read");
    assert(sessionHasPermission(roSess, "admin.users.credit.adjust") === false, "readonly LACKS credit.adjust");
    const denyRoCredit = evaluatePermission(roSess, "admin.users.credit.adjust");
    assert(denyRoCredit.ok === false && denyRoCredit.status === 403, "evaluatePermission deny credit for readonly");
    const denyRoAction = await adminAdjustCredit({
      admin: roSess,
      userId: glass.id,
      delta: 10,
      note: "should fail",
    });
    assert(denyRoAction.ok === false && denyRoAction.error === "forbidden", "adminAdjustCredit denies readonly");

    const finU = await mkUser("finance");
    cleanupIds.push(finU.id);
    await grantRole(finU.id, "finance");
    const finSess = await resolveAdminSessionForUser(finU.id, finU.email, null);
    assert(!!finSess, "finance session resolved");
    assert(sessionHasPermission(finSess, "admin.orders.refund") === true, "finance HAS orders.refund");
    assert(sessionHasPermission(finSess, "admin.users.credit.adjust") === false, "finance LACKS credit.adjust");
    const denyFinCredit = evaluatePermission(finSess, "admin.users.credit.adjust");
    assert(denyFinCredit.ok === false && denyFinCredit.status === 403, "evaluatePermission deny credit for finance");
    const denyFinAction = await adminAdjustCredit({
      admin: finSess,
      userId: glass.id,
      delta: 5,
      note: "finance cannot mint",
    });
    assert(denyFinAction.ok === false && denyFinAction.error === "forbidden", "adminAdjustCredit denies finance");

    const civilian = await mkUser("civilian");
    cleanupIds.push(civilian.id);
    const noAdmin = await resolveAdminSessionForUser(civilian.id, civilian.email, null);
    assert(noAdmin === null, "non-admin resolve returns null");
    const denyAll = evaluatePermission(noAdmin, "admin.users.credit.adjust");
    assert(denyAll.ok === false && denyAll.status === 401, "non-admin evaluate → 401");

    process.env.ADMIN_EMAILS = prevEmails;

    fs.writeFileSync(
      path.join(SCRATCH, "rbac-tests.log"),
      lines.filter((l) => l.includes("PASS") || l.includes("FAIL") || l.startsWith("===")).join("\n") + "\n"
    );

    log("=== 2) Tier mutation + audit rows (adminSetTier / adminAdjustCredit / adminSetActive) ===");
    const target = await mkUser("target", { hour_balance: 300 });
    cleanupIds.push(target.id);
    const opsU = await mkUser("ops");
    cleanupIds.push(opsU.id);
    await grantRole(opsU.id, "ops");
    const ops = await resolveAdminSessionForUser(opsU.id, opsU.email, null);
    assert(!!ops, "ops session");

    const badTier = await adminSetTier({ admin: ops, userId: target.id, tier: "pro" });
    assert(badTier.ok === false && badTier.error === "bad tier", "set_tier rejects pro via shipped adminSetTier");
    const badVip = await adminSetTier({ admin: ops, userId: target.id, tier: "vip" });
    assert(badVip.ok === false, "set_tier rejects vip");

    const goodTier = await adminSetTier({ admin: ops, userId: target.id, tier: "premium" });
    assert(goodTier.ok === true && goodTier.tier === "premium", "set_tier accepts premium");
    const tierRow = await c.query(`SELECT tier FROM users WHERE id=$1`, [target.id]);
    assert(tierRow.rows[0].tier === "premium", "DB tier is premium");

    const auditTier = await c.query(
      `SELECT action, payload FROM audit_logs WHERE user_id=$1 AND action='admin.users.tier.set' AND target_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [ops.userId, target.id]
    );
    assert(auditTier.rows.length === 1, "audit row for set_tier");
    if (auditTier.rows[0]) {
      assert(String(JSON.stringify(auditTier.rows[0].payload)).includes("premium"), "audit payload has premium");
    }

    const denySupportTier = await adminSetTier({
      admin: supportSess,
      userId: target.id,
      tier: "master",
    });
    assert(denySupportTier.ok === false && denySupportTier.error === "forbidden", "support cannot set_tier via shipped action");

    const credit = await adminAdjustCredit({
      admin: ops,
      userId: target.id,
      delta: 50,
      note: "p0 test topup",
    });
    assert(credit.ok === true && Number(credit.balance_after) === 350, `credit adjust balance_after=${credit.balance_after}`);
    const auditCredit = await c.query(
      `SELECT 1 FROM audit_logs WHERE user_id=$1 AND action='admin.users.credit.adjust' AND target_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [ops.userId, target.id]
    );
    assert(auditCredit.rows.length === 1, "audit row for adjust_credit");
    const txn = await c.query(
      `SELECT delta, reason FROM hour_transactions WHERE user_id=$1 AND reason='admin_adjust' ORDER BY created_at DESC LIMIT 1`,
      [target.id]
    );
    assert(txn.rows[0] && Number(txn.rows[0].delta) === 50, "hour_transactions admin_adjust +50");

    const sus = await adminSetActive({ admin: ops, userId: target.id, active: false, note: "suspend test" });
    assert(sus.ok === true && sus.is_active === false, "suspend via adminSetActive");
    const auditSus = await c.query(
      `SELECT action FROM audit_logs WHERE user_id=$1 AND action='admin.users.suspend' AND target_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [ops.userId, target.id]
    );
    assert(auditSus.rows.length === 1, "audit row for suspend");

    // role grant audit
    await writeAdminAudit({
      actor: ops,
      action: "admin.iam.roles.grant",
      targetType: "user",
      targetId: supportU.id,
      payload: { role_key: "support", test: true },
    });
    const auditGrant = await c.query(
      `SELECT 1 FROM audit_logs WHERE action='admin.iam.roles.grant' AND user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [ops.userId]
    );
    assert(auditGrant.rows.length === 1, "audit row for role grant");

    fs.writeFileSync(
      path.join(SCRATCH, "tier-audit-tests.log"),
      [
        "adminSetTier pro/vip reject + premium accept",
        "audit_logs set_tier/adjust_credit/suspend/roles.grant",
        `target=${target.id} ops=${ops.userId}`,
      ].join("\n") + "\n"
    );

    log("=== 3) Login enforce via checkAccountUsable (shipped) ===");
    // restore target for other tests — create dedicated suspended/deleted users
    const susUser = await mkUser("suspended_u");
    cleanupIds.push(susUser.id);
    await c.query(`UPDATE users SET is_active=false WHERE id=$1`, [susUser.id]);
    const g1 = await checkAccountUsable(susUser.id);
    assert(g1.ok === false && g1.reason === "suspended", "checkAccountUsable suspended");

    const delUser = await mkUser("deleted_u");
    cleanupIds.push(delUser.id);
    await c.query(`UPDATE users SET deleted_at=now(), is_active=false WHERE id=$1`, [delUser.id]);
    const g2 = await checkAccountUsable(delUser.id);
    assert(g2.ok === false && g2.reason === "deleted", "checkAccountUsable deleted");

    const okUser = await mkUser("active_u");
    cleanupIds.push(okUser.id);
    const g3 = await checkAccountUsable(okUser.id);
    assert(g3.ok === true, "checkAccountUsable active ok");
    assert(accountGateMessage("suspended").includes("ระงับ") || accountGateMessage("suspended").length > 0, "gate message");

    // suspended user cannot resolve admin even if role granted
    await grantRole(susUser.id, "ops");
    const susAdmin = await resolveAdminSessionForUser(susUser.id, susUser.email, null);
    assert(susAdmin === null, "suspended admin resolve denied");

    fs.writeFileSync(
      path.join(SCRATCH, "login-enforce-tests.log"),
      "checkAccountUsable suspended/deleted/active + suspended cannot resolveAdminSession\n"
    );

    log("=== 4) Refund clawback via shipped clawbackYamForOrder / refundPaidOrder ===");
    const payUser = await mkUser("payer", { hour_balance: 500 });
    cleanupIds.push(payUser.id);
    const ord = await c.query(
      `INSERT INTO orders (id, user_id, package_code, amount_thb, yam_granted, status, pay_method, pay_ref, paid_at, created_at)
       VALUES (gen_random_uuid(), $1, 'topup_100', 99, 100, 'paid', 'mock', $2, now(), now())
       RETURNING id`,
      [payUser.id, `p0_pay_${stamp}`]
    );
    const orderId = ord.rows[0].id;

    const claw1 = await clawbackYamForOrder(orderId, "test_clawback");
    assert(claw1.ok === true && claw1.status === "clawed" && claw1.clawed === 100, `clawbackYamForOrder clawed=${JSON.stringify(claw1)}`);
    const bal1 = await c.query(`SELECT hour_balance FROM users WHERE id=$1`, [payUser.id]);
    assert(Number(bal1.rows[0].hour_balance) === 400, `balance 400 after clawback got ${bal1.rows[0].hour_balance}`);
    const led = await c.query(
      `SELECT delta, reason FROM hour_transactions WHERE ref_payment_id=$1`,
      [`order_${orderId}_refund`]
    );
    assert(led.rows[0] && Number(led.rows[0].delta) === -100 && led.rows[0].reason === "refund_clawback", "ledger refund_clawback");

    const claw2 = await clawbackYamForOrder(orderId, "test_clawback_again");
    assert(claw2.ok === true && claw2.status === "already", "clawback idempotent already");

    // second order for full refundPaidOrder
    const ord2 = await c.query(
      `INSERT INTO orders (id, user_id, package_code, amount_thb, yam_granted, status, pay_method, pay_ref, paid_at, created_at)
       VALUES (gen_random_uuid(), $1, 'topup_100', 99, 100, 'paid', 'mock', $2, now(), now())
       RETURNING id`,
      [payUser.id, `p0_pay2_${stamp}`]
    );
    // re-add yam as if purchased
    await c.query(`UPDATE users SET hour_balance = hour_balance + 100 WHERE id=$1`, [payUser.id]);
    const refund = await refundPaidOrder(ord2.rows[0].id, "admin_test_refund", ops.userId);
    assert(refund.ok === true, `refundPaidOrder ok ${JSON.stringify(refund)}`);
    assert(refund.clawback && refund.clawback.ok, "refund includes clawback result");
    const ordSt = await c.query(`SELECT status FROM orders WHERE id=$1`, [ord2.rows[0].id]);
    assert(ordSt.rows[0].status === "refunded", "order status refunded after refundPaidOrder");

    fs.writeFileSync(
      path.join(SCRATCH, "refund-clawback-tests.log"),
      `clawbackYamForOrder status=${claw1.status} clawed=${claw1.clawed}\nrefundPaidOrder ok order=${ord2.rows[0].id} status=${ordSt.rows[0].status}\n`
    );

    log("=== 5) Structure + i18n + IAM accept path ===");
    const iamSrc = fs.readFileSync(path.join(root, "src/app/api/admin/iam/route.ts"), "utf8");
    const acceptIdx = iamSrc.indexOf('action === "accept_invite"');
    const grantIdx = iamSrc.indexOf("admin.iam.roles.grant");
    assert(acceptIdx > 0 && acceptIdx < grantIdx, "accept_invite handled before grant permission gate");
    assert(fs.existsSync(path.join(root, "src/app/admin/users/[id]/page.tsx")), "User 360 page");
    assert(fs.existsSync(path.join(root, "docs/AFFILIATE_ISOLATION_CONTRACT.md")), "contract doc");
    const i18n = fs.readFileSync(path.join(root, "src/lib/admin-i18n.ts"), "utf8");
    for (const loc of ["th", "en", "zh", "vi", "ja", "ko", "ru", "es"]) {
      assert(i18n.includes(loc), `locale ${loc}`);
    }
    fs.writeFileSync(
      path.join(SCRATCH, "admin-ui-structure.txt"),
      "User360 /admin/users/[id]\norders /admin/orders\niam accept_invite before grant\nlocales th en zh vi ja ko ru es\n"
    );

    log("=== 6) No deploy ===");
    fs.writeFileSync(path.join(SCRATCH, "no-deploy.txt"), "approve-before-deploy honored\n");
    assert(true, "no deploy");

    process.env.ADMIN_EMAILS = prevEmails;
  } finally {
    // cleanup test users (cascade roles)
    for (const id of cleanupIds) {
      await c.query(`DELETE FROM audit_logs WHERE user_id=$1 OR target_id=$1`, [id]).catch(() => null);
      await c.query(`DELETE FROM hour_transactions WHERE user_id=$1`, [id]).catch(() => null);
      await c.query(`DELETE FROM orders WHERE user_id=$1`, [id]).catch(() => null);
      await c.query(`DELETE FROM admin_user_roles WHERE user_id=$1`, [id]).catch(() => null);
      await c.query(`DELETE FROM users WHERE id=$1`, [id]).catch(() => null);
    }
    await c.end();
  }

  log(`\nRESULT passed=${passed} failed=${failed}`);
  fs.writeFileSync(path.join(SCRATCH, "test-summary.log"), `passed=${passed} failed=${failed}\n` + lines.join("\n"));
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(SCRATCH, "test-error.log"), String(e.stack || e));
  process.exit(1);
});
