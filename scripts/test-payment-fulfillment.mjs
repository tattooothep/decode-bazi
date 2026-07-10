import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
Object.assign(process.env, env);

const { fulfillOrder } = await import("../src/lib/payment/credit.ts");
const client = new pg.Client({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
});

let userId;
let orgId;
let orderId;
const payRef = `test:fulfill:${Date.now()}`;
let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`PASS ${message}`);
}

try {
  await client.connect();
  userId = crypto.randomUUID();
  orgId = crypto.randomUUID();
  orderId = crypto.randomUUID();
  const email = `payment-fulfill-${Date.now()}@decode.test`;
  await client.query(
    `INSERT INTO users
       (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,created_at)
     VALUES ($1,$2,'test-only','Payment fulfill','th','Asia/Bangkok','dark',true,true,'free',1000,now())`,
    [userId, email]
  );
  await client.query(
    `INSERT INTO organizations(id,owner_user_id,name,slug,created_at)
     VALUES ($1,$2,'Payment fulfill org',$3,now())`,
    [orgId, userId, `payment-fulfill-${Date.now()}`]
  );
  await client.query(
    `INSERT INTO org_members(id,org_id,user_id,role,status,joined_at)
     VALUES (gen_random_uuid(),$1,$2,'owner','active',now())`,
    [orgId, userId]
  );
  await client.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`, [orgId, userId]);
  await client.query(
    `INSERT INTO orders(id,user_id,package_code,amount_thb,yam_granted,status,pay_method,created_at)
     VALUES ($1,$2,'premium_1m',399,500,'pending','stripe_promptpay',now())`,
    [orderId, userId]
  );

  const first = await fulfillOrder(orderId, payRef, "stripe", 399);
  check(first.ok && first.status === "credited", "first fulfillment credits the order");
  check(first.ok && first.balance_after === 1500, "balance increases exactly once by 500");
  check(first.ok && first.tier === "premium", "user upgrades to premium");

  const state = await client.query(
    `SELECT o.status, o.pay_ref, u.tier, u.hour_balance, u.sub_expires_at,
            (SELECT COUNT(*)::int FROM hour_transactions ht WHERE ht.ref_payment_id='order_'||o.id::text) AS tx_count,
            (SELECT COUNT(*)::int FROM subscriptions s WHERE s.payment_id=o.pay_ref) AS sub_count,
            (SELECT interval FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY created_at DESC LIMIT 1) AS sub_interval,
            (SELECT id IS NOT NULL FROM subscriptions s WHERE s.payment_id=o.pay_ref ORDER BY created_at DESC LIMIT 1) AS sub_has_id
       FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1`,
    [orderId]
  );
  const row = state.rows[0];
  check(row.status === "paid" && row.pay_ref === payRef, "order is paid and keeps gateway reference");
  check(Number(row.tx_count) === 1, "one credit ledger row is linked to the order");
  check(Number(row.sub_count) === 1 && row.sub_has_id === true, "one subscription row has a valid id");
  check(row.sub_interval === "month", "30-day pass records monthly interval");
  check(row.sub_expires_at != null, "subscription expiry is set on the user");

  const second = await fulfillOrder(orderId, payRef, "stripe", 399);
  check(second.ok && second.status === "already", "repeat fulfillment is idempotent");
  const after = await client.query(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
  check(Number(after.rows[0].hour_balance) === 1500, "repeat fulfillment does not add credits again");
} finally {
  if (orderId) {
    await client.query(`DELETE FROM affiliate_rewards WHERE order_id=$1`, [orderId]).catch(() => null);
    await client.query(`DELETE FROM hour_transactions WHERE ref_payment_id IN ($1,$2)`, [`order_${orderId}`, `order_${orderId}_refund`]).catch(() => null);
    await client.query(`DELETE FROM subscriptions WHERE payment_id=$1`, [payRef]).catch(() => null);
    await client.query(`DELETE FROM orders WHERE id=$1`, [orderId]).catch(() => null);
  }
  if (userId) {
    await client.query(`DELETE FROM org_members WHERE user_id=$1`, [userId]).catch(() => null);
    await client.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`, [userId]).catch(() => null);
  }
  if (orgId) await client.query(`DELETE FROM organizations WHERE id=$1`, [orgId]).catch(() => null);
  if (userId) await client.query(`DELETE FROM users WHERE id=$1`, [userId]).catch(() => null);
  await client.end().catch(() => null);
}

console.log(`payment fulfillment: ${passed} checks passed`);
