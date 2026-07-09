#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

function loadEnv(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

loadEnv();

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

const runId = `aff_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
const emails = {
  ref: `${runId}_ref@test.local`,
  friend: `${runId}_friend@test.local`,
  stranger: `${runId}_stranger@test.local`,
};
const ids = {
  ref: crypto.randomUUID(),
  friend: crypto.randomUUID(),
  stranger: crypto.randomUUID(),
};
const code = `HK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const signatures = [];
function pass(name, evidence) { signatures.push({ name, status: "PASS", evidence }); }
function fail(name, error, evidence = {}) { signatures.push({ name, status: "FAIL", error: String(error?.message || error), evidence }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function one(sql, params = []) { const r = await pool.query(sql, params); return r.rows[0] || null; }
async function many(sql, params = []) { const r = await pool.query(sql, params); return r.rows; }

function fileHas(file, patterns) {
  const s = fs.readFileSync(file, "utf8");
  return patterns.every((p) => (p instanceof RegExp ? p.test(s) : s.includes(p)));
}

async function cleanup() {
  const userIds = [ids.ref, ids.friend, ids.stranger];
  await pool.query(`DELETE FROM affiliate_rewards WHERE referrer_user_id = ANY($1::uuid[]) OR referred_user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await pool.query(`DELETE FROM affiliate_attributions WHERE referrer_user_id = ANY($1::uuid[]) OR referred_user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await pool.query(`DELETE FROM affiliate_members WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await pool.query(`DELETE FROM orders WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]).catch(() => {});
}

try {
  await cleanup();

  try {
    const tables = await many(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'affiliate_%' ORDER BY tablename`
    );
    const names = tables.map((r) => r.tablename);
    for (const n of ["affiliate_attributions", "affiliate_audit_events", "affiliate_members", "affiliate_rewards"]) assert(names.includes(n), `missing ${n}`);
    const settings = await many(`SELECT key FROM app_settings WHERE key LIKE 'affiliate_%'`);
    assert(settings.length >= 8, "affiliate settings not installed");
    pass("01_schema_real_tables", { tables: names, settings: settings.length });
  } catch (e) { fail("01_schema_real_tables", e); }

  await pool.query(
    `INSERT INTO users(id,email,name,is_active,email_verified,created_at)
     VALUES ($1,$2,'Affiliate Ref',true,true,now()),($3,$4,'Affiliate Friend',true,true,now()),($5,$6,'Affiliate Stranger',true,true,now())`,
    [ids.ref, emails.ref, ids.friend, emails.friend, ids.stranger, emails.stranger]
  );

  try {
    await pool.query(`INSERT INTO affiliate_members(user_id,code,status,approved_at) VALUES ($1,$2,'active',now())`, [ids.ref, code]);
    const member = await one(`SELECT code,status FROM affiliate_members WHERE user_id=$1`, [ids.ref]);
    assert(member?.status === "active" && member.code === code, "active member not stored");
    let selfBlocked = false;
    try {
      await pool.query(
        `INSERT INTO affiliate_attributions(referred_user_id,referrer_user_id,code,status) VALUES ($1,$1,$2,'active')`,
        [ids.ref, code]
      );
    } catch { selfBlocked = true; }
    assert(selfBlocked, "self-referral constraint did not block");
    const attr = await one(
      `INSERT INTO affiliate_attributions(referred_user_id,referrer_user_id,code,status,channel,fraud_flags)
       VALUES ($1,$2,$3,'active','verify','[]'::jsonb) RETURNING id,status`,
      [ids.friend, ids.ref, code]
    );
    assert(attr?.status === "active", "active attribution not inserted");
    let dupBlocked = false;
    try {
      await pool.query(
        `INSERT INTO affiliate_attributions(referred_user_id,referrer_user_id,code,status) VALUES ($1,$2,$3,'active')`,
        [ids.friend, ids.stranger, "HK-DUPE"]
      );
    } catch { dupBlocked = true; }
    assert(dupBlocked, "duplicate referred_user_id was not blocked");
    pass("02_attribution_constraints", { code, attribution_id: attr.id, selfBlocked, dupBlocked });
  } catch (e) { fail("02_attribution_constraints", e); }

  try {
    const order = await one(
      `INSERT INTO orders(user_id,package_code,amount_thb,yam_granted,status,pay_method,pay_ref,paid_at)
       VALUES ($1,'premium_1m',399,500,'paid','verify','verify:${runId}',now()) RETURNING id`,
      [ids.friend]
    );
    const attr = await one(`SELECT id FROM affiliate_attributions WHERE referred_user_id=$1`, [ids.friend]);
    const reward = await one(
      `INSERT INTO affiliate_rewards(order_id,attribution_id,referrer_user_id,referred_user_id,amount_thb,net_amount_thb,commission_rate_bps,commission_thb,status,hold_until,guard)
       VALUES ($1,$2,$3,$4,399,399,1500,60,'pending',now(),'{"verify":true}'::jsonb) RETURNING id,status`,
      [order.id, attr.id, ids.ref, ids.friend]
    );
    assert(reward?.status === "pending", "reward not pending");
    await pool.query(`UPDATE affiliate_rewards SET status='approved',approved_at=now() WHERE id=$1 AND status='pending'`, [reward.id]);
    await pool.query(`UPDATE affiliate_rewards SET status='paid',paid_at=now(),payout_ref='verify-payout' WHERE id=$1 AND status='approved'`, [reward.id]);
    await pool.query(`UPDATE affiliate_rewards SET status='reversed',reversed_at=now(),reversal_reason='verify_reverse' WHERE id=$1 AND status='paid'`, [reward.id]);
    const final = await one(`SELECT status,reversal_reason FROM affiliate_rewards WHERE id=$1`, [reward.id]);
    assert(final?.status === "reversed" && final.reversal_reason === "verify_reverse", "reward reversal failed");
    assert(fileHas("src/lib/payment/credit.ts", ["createPendingAffiliateRewardForOrder", "payment_paid"]), "paid-order affiliate hook missing");
    assert(fileHas("src/lib/affiliate.ts", ["reverseAffiliateRewardsForOrder", "reverseAffiliateRewardsForPaymentRefs"]), "affiliate reverse helpers missing");
    pass("03_paid_order_reward_reversal", { order_id: order.id, reward_id: reward.id, lifecycle: ["pending", "approved", "paid", "reversed"], reverse_helpers: true });
  } catch (e) { fail("03_paid_order_reward_reversal", e); }

  try {
    const signupFiles = [
      "src/app/api/auth/signup/route.ts",
      "src/app/api/auth/signup-phone/route.ts",
      "src/app/api/auth/signup-form/route.ts",
      "src/app/api/auth/google/callback/route.ts",
      "src/app/api/auth/line/callback/route.ts",
    ];
    for (const f of signupFiles) assert(fileHas(f, ["captureAffiliateAttribution"]), `${f} does not capture attribution`);
    assert(fileHas("public/signup.html", ["hkAffiliateRef", "referralCode", "affiliateDeviceId"]), "signup page does not forward referral");
    pass("04_signup_paths_capture_ref", { signupFiles });
  } catch (e) { fail("04_signup_paths_capture_ref", e); }

  try {
    const html = fs.readFileSync("public/referral.html", "utf8");
    for (const lang of ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"]) assert(html.includes(`${lang}:`) || html.includes(`${lang}: {`) || html.includes(`${lang}:{`), `missing lang ${lang}`);
    for (const token of ["data-share=\"line\"", "data-share=\"facebook\"", "data-share=\"whatsapp\"", "data-share=\"telegram\"", "data-share=\"x\"", "data-share=\"email\"", "guideModal", "affiliate-hero-v1.webp"]) assert(html.includes(token), `missing ${token}`);
    assert(fs.existsSync("public/assets/affiliate/affiliate-hero-v1.webp"), "hero asset missing");
    assert(fs.existsSync("src/app/admin/affiliate/page.tsx") && fs.existsSync("src/app/api/admin/affiliate/route.ts"), "admin surface missing");
    assert(fileHas("src/app/admin/affiliate/view.tsx", ["approve_signup", "block_signup"]), "admin signup moderation missing");
    assert(fileHas("src/lib/affiliate.ts", ["setAffiliateAttributionStatus", "LEFT JOIN LATERAL"]), "affiliate admin correctness guard missing");
    pass("05_ui_admin_9lang_share_modal", { hero: "public/assets/affiliate/affiliate-hero-v1.webp", shareButtons: 6, languages: 9, signupModeration: true });
  } catch (e) { fail("05_ui_admin_9lang_share_modal", e); }

  const ok = signatures.every((s) => s.status === "PASS");
  const report = { ok, runId, generatedAt: new Date().toISOString(), signatures };
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/affiliate-pilot-signoffs.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  await cleanup();
  await pool.end();
}
