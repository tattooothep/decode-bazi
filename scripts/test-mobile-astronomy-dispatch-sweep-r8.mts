import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runAstronomyDispatchSweep } from "../src/lib/mobile-astronomy-dispatch-worker-r8";
import {
  applyAstronomyDeliveryEvent, createOrLoadAstronomyDelivery, readAstronomyDelivery,
} from "../src/lib/mobile-astronomy-delivery-store-r8";
import { resolveAstronomyChainUuid } from "../src/lib/mobile-astronomy-chain-registry-r8";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

if (!process.argv.includes("--run-isolated")) {
  console.log("ASTRONOMY_DISPATCH_SWEEP_NOT_RUN use --run-isolated; production connections forbidden");
} else {
  const { withR8DeliveryTestPostgres } = await import("./lib/r8-delivery-test-postgres.mts");
  await withR8DeliveryTestPostgres(async pool => {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_delivery_store_r8.sql", "utf8"));
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_chain_registry_r8.sql", "utf8"));
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_dispatch_queue_r8.sql", "utf8"));
    await pool.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, deleted_at timestamptz, is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE mobile_push_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL, installation_id uuid NOT NULL,
        astronomy_fact_audience_binding text NOT NULL, device_push_token text, enabled boolean NOT NULL);
      CREATE TABLE mobile_science_notification_chains (id uuid PRIMARY KEY,
        account_delivery_chain_uuid uuid NOT NULL, user_id uuid NOT NULL, org_id uuid NOT NULL,
        science_id text NOT NULL, submode text NOT NULL, schema_version smallint NOT NULL DEFAULT 1,
        primary_token_id uuid NOT NULL, primary_installation_id uuid NOT NULL,
        consent_generation bigint NOT NULL DEFAULT 1, target_revision bigint NOT NULL DEFAULT 1,
        lifecycle_state text NOT NULL DEFAULT 'shadow');
      CREATE TABLE mobile_science_notification_endpoints (chain_id uuid NOT NULL, token_id uuid NOT NULL,
        installation_id uuid NOT NULL, audience_binding text NOT NULL, target_revision bigint NOT NULL DEFAULT 1,
        primary_endpoint boolean NOT NULL, active boolean NOT NULL);
      CREATE TABLE mobile_science_notification_shadow_cohort (user_id uuid NOT NULL, science_id text NOT NULL,
        submode text NOT NULL, enabled boolean NOT NULL, approved_by text, approved_at timestamptz);
      CREATE TABLE mobile_science_notification_subscriptions (user_id uuid NOT NULL, org_id uuid NOT NULL,
        science_id text NOT NULL, submode text NOT NULL, enabled boolean NOT NULL,
        consent_generation bigint NOT NULL DEFAULT 1, locale text NOT NULL DEFAULT 'th');
      CREATE TABLE mobile_science_notification_producer_state (science_id text NOT NULL, submode text NOT NULL,
        schema_version smallint NOT NULL, rollout_epoch bigint NOT NULL DEFAULT 1,
        evidence_complete boolean NOT NULL, provider_send_enabled boolean NOT NULL);
      CREATE TABLE mobile_science_notification_occurrences (id uuid PRIMARY KEY, chain_id uuid NOT NULL,
        science_id text NOT NULL, notification_unit_id text NOT NULL, state text NOT NULL,
        rollout_epoch bigint NOT NULL DEFAULT 1, scheduled_for timestamptz NOT NULL, expires_at timestamptz NOT NULL);
    `);
    const userId = randomUUID(), orgId = randomUUID(), tokenId = randomUUID(), installationId = randomUUID();
    const chainRow = randomUUID(), audience = "D".repeat(32);
    await pool.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    await pool.query("INSERT INTO mobile_push_tokens VALUES ($1,$2,$3,$4,'devtok',true)", [tokenId, userId, installationId, audience]);
    await pool.query(`INSERT INTO mobile_science_notification_chains
      (id, account_delivery_chain_uuid, user_id, org_id, science_id, submode, primary_token_id, primary_installation_id)
      VALUES ($1,$2,$3,$4,'astronomy_fact','civil_two_hour',$5,$6)`, [chainRow, randomUUID(), userId, orgId, tokenId, installationId]);
    await pool.query("INSERT INTO mobile_science_notification_endpoints VALUES ($1,$2,$3,$4,1,true,true)", [chainRow, tokenId, installationId, audience]);
    await pool.query("INSERT INTO mobile_science_notification_shadow_cohort VALUES ($1,'astronomy_fact','civil_two_hour',true,'boss',now())", [userId]);
    await pool.query("INSERT INTO mobile_science_notification_subscriptions VALUES ($1,$2,'astronomy_fact','civil_two_hour',false,1,'th')", [userId, orgId]);
    await pool.query("INSERT INTO mobile_science_notification_producer_state VALUES ('astronomy_fact','civil_two_hour',1,1,true,false)");

    const addOccurrence = async () => {
      const id = randomUUID();
      await pool.query(`INSERT INTO mobile_science_notification_occurrences
        VALUES ($1,$2,'astronomy_fact',$3,'shadowed',1, now() - interval '1 minute', now() + interval '2 hours')`,
        [id, chainRow, `civil:${randomUUID()}`]);
      return id;
    };
    let nowMs = Date.now();
    const clock = () => { nowMs += 200; return nowMs; };
    const projectId = "hourkey-fixture";
    let calls = 0;
    const okTransport = async () => { calls += 1; return { status: 200, body: JSON.stringify({ name: `projects/${projectId}/messages/m-${randomUUID()}` }) }; };
    const deps = { pool, clock, projectId, transport: okTransport } as never;

    // Hard-off posture: sweep scans but writes/sends nothing.
    await addOccurrence();
    await addOccurrence();
    const inert = await runAstronomyDispatchSweep(deps, { limit: 10 });
    check(inert.scanned === 2 && inert.notAdmitted === 2 && inert.dispatched === 0 && calls === 0, "hard-off sweep is fully inert");
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_ledgers_r8")).rows[0].n === 0, "inert sweep writes no ledger");

    // Enabled: everything due dispatches once; second sweep sends nothing new.
    await pool.query("UPDATE mobile_science_notification_subscriptions SET enabled=true");
    await pool.query("UPDATE mobile_science_notification_producer_state SET provider_send_enabled=true");
    const active = await runAstronomyDispatchSweep(deps, { limit: 10 });
    check(active.dispatched === 2 && calls === 2, "enabled sweep dispatches each due unit exactly once");
    const again = await runAstronomyDispatchSweep(deps, { limit: 10 });
    check(again.dispatched === 0 && again.skipped === 2 && calls === 2, "re-sweep never resends accepted lineages");

    // Stale provider_submitting ledger gets recovered to submit_unknown.
    const chainUuid = await resolveAstronomyChainUuid(pool, { userId, orgId });
    const staleUnit = `civil:${randomUUID()}`;
    const fence = { rolloutEpoch: 1, consentGeneration: 1, targetRevision: 1, contextRevision: 1 };
    const t0 = clock();
    await createOrLoadAstronomyDelivery(pool, { chainId: chainUuid, notificationUnitId: staleUnit, createdAt: t0, scheduledFor: t0, expiresAt: t0 + 7_000_000, maxAttempts: 3, fence });
    await applyAstronomyDeliveryEvent(pool, { chainId: chainUuid, notificationUnitId: staleUnit, expectedRevision: 0, eventId: randomUUID(), event: { type: "claim", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence } } });
    await applyAstronomyDeliveryEvent(pool, { chainId: chainUuid, notificationUnitId: staleUnit, expectedRevision: 1, eventId: randomUUID(), event: { type: "outbox", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence } } });
    await applyAstronomyDeliveryEvent(pool, { chainId: chainUuid, notificationUnitId: staleUnit, expectedRevision: 2, eventId: randomUUID(), event: { type: "begin_submission", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence }, correlationId: randomUUID(), payloadDigest: "b".repeat(64) } });
    nowMs += 30 * 60_000; // นาฬิกาเดินไป 30 นาที = เกินหน้าต่างค้าง 10 นาที
    const recoverSweep = await runAstronomyDispatchSweep(deps, { limit: 10 });
    check(recoverSweep.recovered === 1, "stale in-flight submission is recovered");
    const recovered = await readAstronomyDelivery(pool, { chainId: chainUuid, notificationUnitId: staleUnit });
    check(recovered?.state.state === "submit_unknown", "recovered lineage lands in submit_unknown");
    const afterRecover = await runAstronomyDispatchSweep(deps, { limit: 10 });
    check(afterRecover.dispatched === 0 && calls === 2, "recovered possibly-accepted unit is never resent");
  });
  console.log(`ASTRONOMY_DISPATCH_SWEEP_R8_OK checks=${checks} (isolated disposable PostgreSQL · injected transport only)`);
}
