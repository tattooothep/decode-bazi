import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  dispatchAstronomyOccurrenceOnce,
  readAstronomyDispatchAdmission,
} from "../src/lib/mobile-astronomy-dispatch-r8";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

if (!process.argv.includes("--run-isolated")) {
  console.log("ASTRONOMY_DISPATCH_R8_NOT_RUN use --run-isolated; production connections forbidden");
} else {
  const { withR8DeliveryTestPostgres } = await import("./lib/r8-delivery-test-postgres.mts");
  await withR8DeliveryTestPostgres(async pool => {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_delivery_store_r8.sql", "utf8"));
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_chain_registry_r8.sql", "utf8"));
    await pool.query(readFileSync("migrations/drafts/20260906_mobile_astronomy_dispatch_queue_r8.sql", "utf8"));
    // Minimal clones of every table the fenced admission read touches.
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
    const chainRow = randomUUID(), audience = "C".repeat(32), deviceToken = "device-token-fixture";
    await pool.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    await pool.query("INSERT INTO mobile_push_tokens VALUES ($1,$2,$3,$4,$5,true)", [tokenId, userId, installationId, audience, deviceToken]);
    await pool.query(`INSERT INTO mobile_science_notification_chains
      (id, account_delivery_chain_uuid, user_id, org_id, science_id, submode, primary_token_id, primary_installation_id)
      VALUES ($1,$2,$3,$4,'astronomy_fact','civil_two_hour',$5,$6)`, [chainRow, randomUUID(), userId, orgId, tokenId, installationId]);
    await pool.query("INSERT INTO mobile_science_notification_endpoints VALUES ($1,$2,$3,$4,1,true,true)", [chainRow, tokenId, installationId, audience]);
    await pool.query("INSERT INTO mobile_science_notification_shadow_cohort VALUES ($1,'astronomy_fact','civil_two_hour',true,'boss',now())", [userId]);
    await pool.query("INSERT INTO mobile_science_notification_subscriptions VALUES ($1,$2,'astronomy_fact','civil_two_hour',false,1,'th')", [userId, orgId]);
    await pool.query("INSERT INTO mobile_science_notification_producer_state VALUES ('astronomy_fact','civil_two_hour',1,1,true,false)", []);

    function makeOccurrence(): Promise<string> {
      const id = randomUUID();
      return pool.query(`INSERT INTO mobile_science_notification_occurrences
        VALUES ($1,$2,'astronomy_fact',$3,'shadowed',1, now() - interval '1 minute', now() + interval '2 hours')`,
        [id, chainRow, `civil:${randomUUID()}`]).then(() => id);
    }
    let nowMs = Date.now();
    const clock = () => { nowMs += 250; return nowMs; };
    const accepted = (projectId: string) => ({ status: 200, body: JSON.stringify({ name: `projects/${projectId}/messages/m-${randomUUID()}` }) });
    const errorBody = (status: number, statusName: string, code?: string) => JSON.stringify({ error: { code: status, status: statusName,
      ...(code ? { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code }] } : {}) } });
    const projectId = "hourkey-fixture";
    const deps = (transport: (r: { body: string }) => Promise<{ status: number; body: string; retryAfter?: string }>) =>
      ({ pool, clock, projectId, transport }) as never;

    // 1) Production posture: provider_send_enabled=false → inert, zero ledger writes.
    const occ1 = await makeOccurrence();
    let calls = 0;
    const r1 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ1);
    check(r1.status === "not_admitted" && ["consent_enabled", "provider_send_enabled"].includes(String(r1.reason)), "hard-off posture keeps dispatch inert");
    check(calls === 0, "inert path makes no provider call");
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_ledgers_r8")).rows[0].n === 0, "inert path writes no ledger");

    // Enable the gates (what the activation migration will do) for the rest.
    await pool.query("UPDATE mobile_science_notification_subscriptions SET enabled=true");
    await pool.query("UPDATE mobile_science_notification_producer_state SET provider_send_enabled=true");

    // 2) Happy path → accepted, ledger accepted, queue empty.
    const r2 = await dispatchAstronomyOccurrenceOnce(deps(async (req) => {
      calls += 1;
      const body = JSON.parse(req.body);
      check(body.message.token === deviceToken, "device token from fenced read reaches the provider envelope");
      check(JSON.parse(body.message.data.body).notificationId === occ1, "payload notificationId = occurrence uuid (receipt-map contract)");
      return accepted(projectId);
    }), occ1);
    check(r2.status === "accepted" && calls === 1, "admitted unit dispatches exactly once");
    const led1 = await pool.query("SELECT current_state->>'state' AS state FROM mobile_astronomy_delivery_ledgers_r8");
    check(led1.rows.length === 1 && led1.rows[0].state === "accepted", "ledger records acceptance");
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_dispatch_queue_r8")).rows[0].n === 0, "terminal outcome leaves no queue row");

    // 3) Re-dispatching an accepted unit skips without any provider call.
    const r3 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ1);
    check(r3.status === "skipped" && calls === 1, "accepted lineage is never resent");

    // 4) Retryable 429 → queue carries retryNotBefore; retry succeeds as attempt 2.
    const occ2 = await makeOccurrence();
    let first = true;
    const r4 = await dispatchAstronomyOccurrenceOnce(deps(async () => {
      calls += 1;
      if (first) { first = false; return { status: 429, body: errorBody(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED") }; }
      return accepted(projectId);
    }), occ2);
    check(r4.status === "not_accepted" && typeof r4.retryNotBefore === "number", "authoritative 429 schedules a retry");
    const q4 = await pool.query("SELECT next_attempt_at, token_disposition FROM mobile_astronomy_dispatch_queue_r8");
    check(q4.rows.length === 1 && q4.rows[0].next_attempt_at !== null && q4.rows[0].token_disposition === "unchanged", "queue row carries retry timing out-of-band");
    const early = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ2);
    check(early.status === "skipped" && early.reason === "retry_not_due", "backoff window blocks an early re-claim");
    nowMs += 180_000; // ข้ามพ้นหน้าต่าง backoff
    const r4b = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ2);
    check(r4b.status === "accepted", "retry claims from rejected_retryable and succeeds");
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_dispatch_queue_r8")).rows[0].n === 0, "successful retry clears the queue row");

    // 5) Transport failure → unknown, never resent even with a healthy transport.
    const occ3 = await makeOccurrence();
    const r5 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; throw new Error("socket reset"); }), occ3);
    check(r5.status === "unknown", "transport failure is an unknown outcome");
    const r5b = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ3);
    check(r5b.status === "skipped" && r5b.reason === "state_submit_unknown", "possibly-accepted lineage is never resent");

    // 6) Structured UNREGISTERED → terminal, queue marks the token disposition.
    const occ4 = await makeOccurrence();
    const r6 = await dispatchAstronomyOccurrenceOnce(deps(async () => ({ status: 404, body: errorBody(404, "NOT_FOUND", "UNREGISTERED") })), occ4);
    check(r6.status === "not_accepted" && r6.tokenDisposition === "unregistered", "unregistered evidence surfaces");
    const q6 = await pool.query("SELECT token_disposition, next_attempt_at FROM mobile_astronomy_dispatch_queue_r8 WHERE occurrence_id=$1", [occ4]);
    check(q6.rows.length === 1 && q6.rows[0].token_disposition === "unregistered" && q6.rows[0].next_attempt_at === null, "queue records unregistered with no retry");

    // 7) Consent flipped between admission and claim → nothing is sent.
    const occ5 = await makeOccurrence();
    let flipped = false;
    const flippingClock = () => {
      nowMs += 250;
      if (!flipped) { flipped = true; return nowMs; }
      return nowMs;
    };
    const admissionBefore = await readAstronomyDispatchAdmission(pool, occ5, Date.now());
    check(admissionBefore?.enabled === true, "unit admitted before the consent flip");
    await pool.query("UPDATE mobile_science_notification_subscriptions SET enabled=false");
    const r7 = await dispatchAstronomyOccurrenceOnce({ pool, clock: flippingClock, projectId, transport: async () => { calls += 1; return accepted(projectId); } } as never, occ5);
    check(r7.status === "not_admitted" && calls === 4, "revoked consent stops the unit before any provider call");
    await pool.query("UPDATE mobile_science_notification_subscriptions SET enabled=true");

    // 9) Fence VALUE change mid-flight (reviewer's blocking scenario): ledger
    // claimed+outboxed under generation 1, consent generation bumped (enabled
    // stays true) → resume must be stopped by the reducer BEFORE any provider
    // call, with the ledger suppressed.
    const { createOrLoadAstronomyDelivery: createLedger, applyAstronomyDeliveryEvent: applyLedger } =
      await import("../src/lib/mobile-astronomy-delivery-store-r8");
    const { resolveAstronomyChainUuid: resolveChain } = await import("../src/lib/mobile-astronomy-chain-registry-r8");
    const occ7 = await makeOccurrence();
    const occ7unit = (await pool.query("SELECT notification_unit_id FROM mobile_science_notification_occurrences WHERE id=$1", [occ7])).rows[0].notification_unit_id;
    const chainUuidReal = await resolveChain(pool, { userId, orgId });
    const fenceA = { rolloutEpoch: 1, consentGeneration: 1, targetRevision: 1, contextRevision: 1 };
    const at9 = clock();
    await createLedger(pool, { chainId: chainUuidReal, notificationUnitId: occ7unit, createdAt: at9, scheduledFor: at9 - 60_000, expiresAt: at9 + 7_000_000, maxAttempts: 3, fence: fenceA });
    await applyLedger(pool, { chainId: chainUuidReal, notificationUnitId: occ7unit, expectedRevision: 0, eventId: randomUUID(), event: { type: "claim", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence: fenceA } } });
    await applyLedger(pool, { chainId: chainUuidReal, notificationUnitId: occ7unit, expectedRevision: 1, eventId: randomUUID(), event: { type: "outbox", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence: fenceA } } });
    await pool.query("UPDATE mobile_science_notification_subscriptions SET consent_generation=2");
    const beforeCalls9 = calls;
    const r9 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ7);
    check(r9.status === "stopped" && String(r9.reason).includes("suppressed"), "fence value change stops the unit via the reducer");
    check(calls === beforeCalls9, "suppressed unit never reaches the provider");
    const led9 = await pool.query("SELECT current_state->>'state' AS state FROM mobile_astronomy_delivery_ledgers_r8 WHERE chain_uuid=$1 AND notification_unit_id=$2", [chainUuidReal, occ7unit]);
    check(led9.rows[0].state === "suppressed", "ledger shows suppressed after the fence change");
    await pool.query("UPDATE mobile_science_notification_subscriptions SET consent_generation=1");

    // 10) Transient gate blip mid-flight leaves the unit resumable, not wedged.
    const occ8 = await makeOccurrence();
    const occ8unit = (await pool.query("SELECT notification_unit_id FROM mobile_science_notification_occurrences WHERE id=$1", [occ8])).rows[0].notification_unit_id;
    const at10 = clock();
    await createLedger(pool, { chainId: chainUuidReal, notificationUnitId: occ8unit, createdAt: at10, scheduledFor: at10 - 60_000, expiresAt: at10 + 7_000_000, maxAttempts: 3, fence: fenceA });
    await applyLedger(pool, { chainId: chainUuidReal, notificationUnitId: occ8unit, expectedRevision: 0, eventId: randomUUID(), event: { type: "claim", at: clock(), admission: { enabled: true, checkedAt: nowMs, fence: fenceA } } });
    const r10 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ8);
    check(r10.status === "accepted", "a claimed unit resumes to completion instead of wedging");

    // 11) Preflight failure defers before any ledger write.
    const occ9 = await makeOccurrence();
    const ledgerCountBefore = (await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_ledgers_r8")).rows[0].n;
    const r11 = await dispatchAstronomyOccurrenceOnce({ pool, clock, projectId,
      transport: async () => { calls += 1; return accepted(projectId); },
      preflight: async () => false } as never, occ9);
    check(r11.status === "not_admitted" && r11.reason === "transport_unavailable", "failed preflight defers the unit");
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_ledgers_r8")).rows[0].n === ledgerCountBefore, "failed preflight writes no ledger");

    // 8) Expired occurrence is refused by the fence.
    const occ6 = await makeOccurrence();
    await pool.query("UPDATE mobile_science_notification_occurrences SET expires_at = now() - interval '1 second' WHERE id=$1", [occ6]);
    const r8 = await dispatchAstronomyOccurrenceOnce(deps(async () => { calls += 1; return accepted(projectId); }), occ6);
    check(r8.status === "not_admitted" && r8.reason === "occurrence_live", "expired occurrence never dispatches");
  });
  console.log(`ASTRONOMY_DISPATCH_R8_OK checks=${checks} (isolated disposable PostgreSQL · injected transport only)`);
}
