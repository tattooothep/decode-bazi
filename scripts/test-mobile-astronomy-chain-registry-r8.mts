import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveAstronomyChainUuid } from "../src/lib/mobile-astronomy-chain-registry-r8";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

await assert.rejects(
  resolveAstronomyChainUuid({ query: async () => ({ rows: [] }) } as never, { userId: "x", orgId: "y" }),
  /r8_registry_input_invalid/,
); checks += 1;

if (!process.argv.includes("--run-isolated")) {
  console.log(`ASTRONOMY_CHAIN_REGISTRY_PARTIAL ${checks} checks; use --run-isolated for the database path`);
} else {
  const { withR8DeliveryTestPostgres } = await import("./lib/r8-delivery-test-postgres.mts");
  await withR8DeliveryTestPostgres(async pool => {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    const registrySql = readFileSync("migrations/drafts/20260906_mobile_astronomy_chain_registry_r8.sql", "utf8");
    await pool.query(registrySql);
    await pool.query(registrySql); // idempotent re-apply
    await pool.query(`CREATE TABLE mobile_science_notification_chains (id uuid PRIMARY KEY,
      account_delivery_chain_uuid uuid NOT NULL, user_id uuid NOT NULL, org_id uuid NOT NULL,
      science_id text NOT NULL, submode text NOT NULL)`);

    // Fresh account: mints once, then always returns the same UUID.
    const userA = randomUUID(), orgA = randomUUID();
    const first = await resolveAstronomyChainUuid(pool, { userId: userA, orgId: orgA });
    check(/^[0-9a-f-]{36}$/u.test(first), "resolver mints a UUID");
    check(await resolveAstronomyChainUuid(pool, { userId: userA, orgId: orgA }) === first, "stable across calls");

    // Concurrency: 8 parallel resolvers converge on one UUID.
    const userB = randomUUID(), orgB = randomUUID();
    const race = await Promise.all(Array.from({ length: 8 }, () =>
      resolveAstronomyChainUuid(pool, { userId: userB, orgId: orgB })));
    check(new Set(race).size === 1, "concurrent resolution converges");

    // Adoption: an account with a pre-registry chains row keeps its chain UUID.
    const userC = randomUUID(), orgC = randomUUID(), legacyUuid = randomUUID();
    await pool.query("INSERT INTO mobile_science_notification_chains VALUES ($1,$2,$3,$4,'astronomy_fact','civil_two_hour')",
      [randomUUID(), legacyUuid, userC, orgC]);
    check(await resolveAstronomyChainUuid(pool, { userId: userC, orgId: orgC }) === legacyUuid, "existing chain UUID adopted");

    // Survival: deleting the chains row (device transfer) must not change it.
    await pool.query("DELETE FROM mobile_science_notification_chains WHERE user_id=$1", [userC]);
    check(await resolveAstronomyChainUuid(pool, { userId: userC, orgId: orgC }) === legacyUuid, "chain UUID survives chains-row deletion");

    // Adoption conflict: chains row pointing at a UUID already registered to
    // another account must yield a fresh mint, never a shared binding.
    const userD = randomUUID(), orgD = randomUUID();
    await pool.query("INSERT INTO mobile_science_notification_chains VALUES ($1,$2,$3,$4,'astronomy_fact','civil_two_hour')",
      [randomUUID(), legacyUuid, userD, orgD]);
    const minted = await resolveAstronomyChainUuid(pool, { userId: userD, orgId: orgD });
    check(minted !== legacyUuid, "conflicting adoption falls back to a fresh UUID");
    check(await resolveAstronomyChainUuid(pool, { userId: userD, orgId: orgD }) === minted, "fresh mint is stable too");

    // Registry rows are immutable.
    await assert.rejects(pool.query("UPDATE mobile_astronomy_chain_registry_r8 SET chain_uuid=gen_random_uuid()"), /immutable/); checks += 1;
    await assert.rejects(pool.query("DELETE FROM mobile_astronomy_chain_registry_r8"), /immutable/); checks += 1;
  });
  console.log(`ASTRONOMY_CHAIN_REGISTRY_R8_OK checks=${checks} (isolated disposable PostgreSQL only)`);
}
