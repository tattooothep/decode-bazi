import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  astronomyEngagementEventId, recordAstronomyEngagementR8,
} from "../src/lib/mobile-astronomy-engagement-r8";
import {
  applyAstronomyDeliveryEvent, createOrLoadAstronomyDelivery,
} from "../src/lib/mobile-astronomy-delivery-store-r8";
import type { AstronomyDeliveryEvent } from "../src/lib/mobile-astronomy-delivery-state-r8";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

// Deterministic dedupe id: same parts → same UUID, different parts → different.
const idA = astronomyEngagementEventId(["a", "b", "c"]);
check(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u.test(idA), "event id is a valid dedupe UUID");
check(idA === astronomyEngagementEventId(["a", "b", "c"]), "event id deterministic");
check(idA !== astronomyEngagementEventId(["a", "b", "d"]), "event id varies with content");

// Bad input and unowned notifications short-circuit to not_astronomy without
// touching the ledger (stub pool proves only the ownership query runs).
const queries: string[] = [];
const stubPool = { async query(sql: string) { queries.push(sql); return { rows: [] }; } };
const base = {
  userId: "11111111-1111-4111-8111-111111111111",
  orgId: "44444444-4444-4444-8444-444444444444",
  notificationId: "22222222-2222-4222-8222-222222222222",
  installationId: "33333333-3333-4333-8333-333333333333",
  event: "opened" as const, actionId: "",
};
check(await recordAstronomyEngagementR8(stubPool as never, { ...base, notificationId: "not-a-uuid" }) === "not_astronomy", "invalid id rejected before any query");
check(await recordAstronomyEngagementR8(stubPool as never, { ...base, orgId: "" }) === "not_astronomy", "org-less session never enters the astronomy path");
check(queries.length === 0, "invalid input runs zero queries");
check(await recordAstronomyEngagementR8(stubPool as never, base) === "not_astronomy", "unowned occurrence falls through to legacy");
check(queries.length === 1 && !queries[0].includes("mobile_astronomy_delivery_ledgers"), "ownership miss never reads the ledger");

if (!process.argv.includes("--run-isolated")) {
  console.log(`ASTRONOMY_ENGAGEMENT_MAP_PARTIAL ${checks} checks; use --run-isolated for the full ledger path`);
} else {
  const { withR8DeliveryTestPostgres } = await import("./lib/r8-delivery-test-postgres.mts");
  await withR8DeliveryTestPostgres(async pool => {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_delivery_store_r8.sql", "utf8"));
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_chain_registry_r8.sql", "utf8"));
    // Minimal clones of the ownership tables — only the columns the ownership
    // predicate and registry resolver read; production schemas stay untouched.
    await pool.query(`
      CREATE TABLE mobile_push_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL,
        astronomy_fact_audience_binding text NOT NULL, enabled boolean NOT NULL);
      CREATE TABLE mobile_science_notification_chains (id uuid PRIMARY KEY,
        account_delivery_chain_uuid uuid NOT NULL, user_id uuid NOT NULL,
        org_id uuid NOT NULL, science_id text NOT NULL, submode text NOT NULL DEFAULT 'civil_two_hour');
      CREATE TABLE mobile_science_notification_endpoints (chain_id uuid NOT NULL,
        token_id uuid NOT NULL, installation_id uuid NOT NULL,
        audience_binding text NOT NULL, primary_endpoint boolean NOT NULL, active boolean NOT NULL);
      CREATE TABLE mobile_science_notification_occurrences (id uuid PRIMARY KEY,
        chain_id uuid NOT NULL, science_id text NOT NULL, notification_unit_id text NOT NULL);
    `);
    const userId = randomUUID(), orgId = randomUUID(), tokenId = randomUUID();
    const chainRow = randomUUID(), chainUuid = randomUUID(), occurrenceId = randomUUID();
    const installationId = randomUUID(), audience = "A".repeat(32);
    const unit = "civil:2026-09-06T18:00:00+07:00:fold0";
    await pool.query("INSERT INTO mobile_push_tokens VALUES ($1,$2,$3,true)", [tokenId, userId, audience]);
    await pool.query("INSERT INTO mobile_science_notification_chains VALUES ($1,$2,$3,$4,'astronomy_fact')", [chainRow, chainUuid, userId, orgId]);
    await pool.query("INSERT INTO mobile_science_notification_endpoints VALUES ($1,$2,$3,$4,true,true)", [chainRow, tokenId, installationId, audience]);
    await pool.query("INSERT INTO mobile_science_notification_occurrences VALUES ($1,$2,'astronomy_fact',$3)", [occurrenceId, chainRow, unit]);

    const input = { ...base, userId, orgId, notificationId: occurrenceId, installationId };

    // Owned but no ledger yet (nothing ever dispatched) → absorbed, no error.
    check(await recordAstronomyEngagementR8(pool, input) === "accepted_no_dispatch", "no ledger absorbs the report");

    // Ledger exists but unit never reached submission → still absorbed.
    const at = Date.parse("2026-09-06T11:00:00.000Z");
    const fence = { rolloutEpoch: 1, consentGeneration: 1, targetRevision: 1, contextRevision: 1 };
    await createOrLoadAstronomyDelivery(pool, {
      chainId: chainUuid, notificationUnitId: unit,
      createdAt: at - 60_000, scheduledFor: at, expiresAt: at + 7_200_000, maxAttempts: 2, fence,
    });
    check(await recordAstronomyEngagementR8(pool, input) === "accepted_no_dispatch", "scheduled-only unit cannot be acknowledged");

    // Drive to provider_submitting, then the receipt must record as acknowledge.
    const key = { chainId: chainUuid, notificationUnitId: unit };
    const admission = { enabled: true, checkedAt: at, fence };
    const emit = (expectedRevision: number, event: AstronomyDeliveryEvent) =>
      applyAstronomyDeliveryEvent(pool, { ...key, expectedRevision, eventId: randomUUID(), event });
    await emit(0, { type: "claim", at, admission });
    await emit(1, { type: "outbox", at, admission });
    const correlationId = randomUUID();
    await emit(2, { type: "begin_submission", at, admission, correlationId, payloadDigest: "a".repeat(64) });

    check(await recordAstronomyEngagementR8(pool, input) === "recorded", "verified receipt records an acknowledge event");
    const acked = await pool.query(
      "SELECT current_state->>'state' AS state, current_state->'attempts'->0->>'acceptance' AS acceptance FROM mobile_astronomy_delivery_ledgers_r8 WHERE chain_uuid=$1",
      [chainUuid]);
    check(acked.rows[0].state === "acknowledged" && acked.rows[0].acceptance === "accepted", "ledger shows acknowledged/accepted");
    check(await recordAstronomyEngagementR8(pool, input) === "duplicate", "device replay deduplicates on the deterministic event id");
    check(await recordAstronomyEngagementR8(pool, { ...input, event: "app_received" }) === "recorded", "a different engagement event is its own evidence");

    // Device transfer divergence (reviewer's blocking scenario): the chains row
    // is deleted and re-minted with a fresh account_delivery_chain_uuid, but
    // the ledger lives under the registry UUID — receipts must keep landing.
    const remintedChainRow = randomUUID();
    await pool.query("DELETE FROM mobile_science_notification_occurrences WHERE id=$1", [occurrenceId]);
    await pool.query("DELETE FROM mobile_science_notification_endpoints WHERE chain_id=$1", [chainRow]);
    await pool.query("DELETE FROM mobile_science_notification_chains WHERE id=$1", [chainRow]);
    await pool.query("INSERT INTO mobile_science_notification_chains VALUES ($1,$2,$3,$4,'astronomy_fact')", [remintedChainRow, randomUUID(), userId, orgId]);
    await pool.query("INSERT INTO mobile_science_notification_endpoints VALUES ($1,$2,$3,$4,true,true)", [remintedChainRow, tokenId, installationId, audience]);
    const remintedOccurrence = randomUUID();
    await pool.query("INSERT INTO mobile_science_notification_occurrences VALUES ($1,$2,'astronomy_fact',$3)", [remintedOccurrence, remintedChainRow, unit]);
    check(await recordAstronomyEngagementR8(pool, { ...input, notificationId: remintedOccurrence, event: "action", actionId: "hourkey_open" }) === "recorded",
      "receipt after chain re-mint still lands on the registry-keyed ledger");
    const ledgers = await pool.query("SELECT chain_uuid FROM mobile_astronomy_delivery_ledgers_r8");
    check(ledgers.rows.length === 1 && ledgers.rows[0].chain_uuid === chainUuid, "no second ledger lineage appears after re-mint");
    const inputReminted = { ...input, notificationId: remintedOccurrence };


    // Ownership failures with a live ledger still never acknowledge.
    check(await recordAstronomyEngagementR8(pool, { ...inputReminted, userId: randomUUID() }) === "not_astronomy", "foreign user cannot acknowledge");
    check(await recordAstronomyEngagementR8(pool, { ...inputReminted, installationId: randomUUID() }) === "not_astronomy", "foreign installation cannot acknowledge");
    await pool.query("UPDATE mobile_push_tokens SET enabled=false WHERE id=$1", [tokenId]);
    check(await recordAstronomyEngagementR8(pool, inputReminted) === "not_astronomy", "disabled token cannot acknowledge");
    await pool.query("UPDATE mobile_push_tokens SET enabled=true, astronomy_fact_audience_binding=$2 WHERE id=$1", [tokenId, "B".repeat(32)]);
    check(await recordAstronomyEngagementR8(pool, inputReminted) === "not_astronomy", "rotated audience binding invalidates the old endpoint");
  });
  console.log(`ASTRONOMY_ENGAGEMENT_MAP_R8_OK checks=${checks} (isolated disposable PostgreSQL only)`);
}
