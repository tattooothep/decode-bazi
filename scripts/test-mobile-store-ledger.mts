import crypto from "node:crypto";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}

const { pool } = await import("../src/lib/db.ts");
const { applyVerifiedStorePurchase } = await import("../src/lib/mobile-store-ledger.ts");
const users = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
const now = Date.now();
const iso = (days: number) => new Date(now + days * 86_400_000).toISOString();
let checks = 0;

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

function purchase(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    platform: "apple" as const,
    productId: "io.hourkey.premium.monthly",
    eventRef: `event-${crypto.randomUUID()}`,
    originalRef: `original-${crypto.randomUUID()}`,
    eventKind: "purchase" as const,
    state: "active" as const,
    environment: "test" as const,
    purchasedAt: new Date(now).toISOString(),
    expiresAt: iso(30),
    accountBinding: userId,
    summary: { fixture: true },
    ...overrides,
  };
}

try {
  for (let index = 0; index < users.length; index += 1) {
    await pool.query(
      `INSERT INTO users(id,email,name,is_active,tier,hour_balance,session_version,created_at)
       VALUES($1,$2,$3,true,'free',1000,0,now())`,
      [users[index], `store-ledger-${Date.now()}-${index}@example.test`, `Store ${index}`]
    );
  }

  const topup = purchase(users[0], {
    productId: "io.hourkey.yam.100",
    eventRef: "topup-event-" + crypto.randomUUID(),
    originalRef: "topup-original-" + crypto.randomUUID(),
    expiresAt: null,
  });
  let result = await applyVerifiedStorePurchase(users[0], topup);
  check(result.status === "applied" && result.hour_balance === 1100, "verified consumable grants the server package amount");
  result = await applyVerifiedStorePurchase(users[0], topup);
  check(result.status === "already" && result.hour_balance === 1100, "replayed consumable is exactly once");
  const topupRefund = {
    ...topup,
    eventRef: "topup-refund-" + crypto.randomUUID(),
    eventKind: "refund" as const,
    state: "revoked" as const,
  };
  result = await applyVerifiedStorePurchase(users[0], topupRefund);
  check(result.hour_balance === 1000, "verified consumable refund claws back its yam");
  result = await applyVerifiedStorePurchase(users[0], topupRefund);
  check(result.status === "already" && result.hour_balance === 1000, "replayed consumable refund never claws back twice");

  const premiumOriginal = "premium-original-" + crypto.randomUUID();
  const premium = purchase(users[0], { originalRef: premiumOriginal, expiresAt: iso(30) });
  result = await applyVerifiedStorePurchase(users[0], premium);
  check(result.plan === "premium" && result.hour_balance === 1500, "verified Premium activates entitlement and grants initial yam once");
  result = await applyVerifiedStorePurchase(users[0], { ...premium, eventRef: "premium-restore-" + crypto.randomUUID(), eventKind: "restore" });
  check(result.plan === "premium" && result.hour_balance === 1500, "restore updates entitlement without granting initial yam twice");

  const masterOriginal = "master-original-" + crypto.randomUUID();
  const master = purchase(users[0], {
    productId: "io.hourkey.master.monthly",
    originalRef: masterOriginal,
    expiresAt: iso(10),
  });
  result = await applyVerifiedStorePurchase(users[0], master);
  check(result.plan === "master" && result.hour_balance === 3500, "Master outranks a longer Premium entitlement");

  result = await applyVerifiedStorePurchase(users[0], {
    ...master,
    eventRef: "master-revoke-" + crypto.randomUUID(),
    eventKind: "revoke",
    state: "revoked",
  });
  check(result.plan === "premium" && result.hour_balance === 1500, "revoking Master falls back and claws back only Master's initial yam");
  result = await applyVerifiedStorePurchase(users[0], {
    ...premium,
    eventRef: "premium-revoke-" + crypto.randomUUID(),
    eventKind: "revoke",
    state: "revoked",
  });
  check(result.plan === "free" && result.hour_balance === 1000, "revoking the final paid source returns to Free and claws back Premium yam once");

  let foreignRejected = false;
  try {
    await applyVerifiedStorePurchase(users[1], {
      ...premium,
      eventRef: "foreign-restore-" + crypto.randomUUID(),
      eventKind: "restore",
      accountBinding: users[1],
    });
  } catch (error) {
    foreignRejected = String(error).includes("bound_to_other_account");
  }
  check(foreignRejected, "a subscription lineage cannot be restored into another Hourkey account");

  const legacySource = await pool.query<{ id: string }>(
    `INSERT INTO product_entitlement_sources(user_id,source_kind,source_ref,tier,status,expires_at)
     VALUES($1,'legacy',$2,'master','active',$3::timestamptz) RETURNING id`,
    [users[2], `legacy-fixture:${users[2]}`, iso(90)]
  );
  await pool.query(`UPDATE users SET tier='master',sub_expires_at=$2,entitlement_source_id=$3 WHERE id=$1`, [users[2], iso(90), legacySource.rows[0].id]);
  const temporaryPremium = purchase(users[2], { originalRef: "temporary-" + crypto.randomUUID(), expiresAt: iso(20) });
  result = await applyVerifiedStorePurchase(users[2], temporaryPremium);
  check(result.plan === "master", "mobile Premium never downgrades an existing Master source");
  result = await applyVerifiedStorePurchase(users[2], {
    ...temporaryPremium,
    eventRef: "temporary-revoke-" + crypto.randomUUID(),
    eventKind: "revoke",
    state: "revoked",
  });
  check(result.plan === "master", "store revoke does not remove a legacy paid entitlement");

  let bindingRejected = false;
  try {
    await applyVerifiedStorePurchase(users[1], purchase(users[0], { accountBinding: users[0] }));
  } catch (error) {
    bindingRejected = String(error).includes("store_account_binding_mismatch");
  }
  check(bindingRejected, "server rejects a purchase whose store account binding does not match the session");
  console.log(`${checks} mobile store ledger checks passed`);
} finally {
  await pool.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [users]).catch(() => null);
  await pool.end().catch(() => null);
}
