import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  applyAstronomyDeliveryEvent, createOrLoadAstronomyDelivery, readAstronomyDelivery,
} from "../src/lib/mobile-astronomy-delivery-store-r8";
import type { AstronomyDeliveryEvent } from "../src/lib/mobile-astronomy-delivery-state-r8";

let discarded: Error | undefined;
const rollbackFailurePool = {
  async connect() { return {
    async query(sql: string) {
      if (sql.startsWith("SELECT")) throw new Error("injected_query_failure");
      if (sql === "ROLLBACK") throw new Error("injected_rollback_failure");
      return { rows: [] };
    },
    release(error?: Error) { discarded = error; },
  }; },
};
await assert.rejects(readAstronomyDelivery(rollbackFailurePool as unknown as Parameters<typeof readAstronomyDelivery>[0], {
  chainId: "00000000-0000-4000-8000-000000000001", notificationUnitId: "pure-pool-failure-test",
}), /injected_query_failure/);
assert.ok(discarded instanceof Error, "failed rollback must discard the client instead of returning it to the pool");

// This test never reads installed environment or connects to a live database.
// Real execution requires the explicit flag and our disposable cluster helper.
if (!process.argv.includes("--run-isolated")) {
  console.log("ASTRONOMY_STORE_R8_NOT_RUN use --run-isolated; production connections forbidden");
} else {
  const { withR8DeliveryTestPostgres } = await import("./lib/r8-delivery-test-postgres.mts");
  await withR8DeliveryTestPostgres(async pool => {
    const sql = readFileSync("migrations/drafts/20260906_mobile_astronomy_delivery_store_r8.sql", "utf8");
    // Sentinels model pre-existing lanes, without loading production data.
    await pool.query("CREATE TABLE legacy_lane_sentinel (science text PRIMARY KEY, enabled boolean NOT NULL)");
    await pool.query("INSERT INTO legacy_lane_sentinel VALUES ('qimen',true),('zibai',true),('ziwei',true),('yam',true),('qizheng',false)");
    const before = JSON.stringify((await pool.query("SELECT * FROM legacy_lane_sentinel ORDER BY science")).rows);
    await pool.query(sql);
    await pool.query(sql);
    await assert.rejects(pool.query(`INSERT INTO mobile_astronomy_delivery_ledgers_r8
      (chain_uuid,notification_unit_id,initial_input,current_state) VALUES ($1,'invalid-null-identity','{}','{}')`, [randomUUID()]),
    /check constraint/);
    const at = Date.parse("2026-09-06T11:00:00.000Z");
    const fence = { rolloutEpoch: 1, consentGeneration: 1, targetRevision: 1, contextRevision: 1 };
    const input = {
      chainId: randomUUID(), notificationUnitId: "civil:2026-09-06T18:00:00+07:00:fold0",
      createdAt: at - 60_000, scheduledFor: at, expiresAt: at + 7_200_000, maxAttempts: 2, fence,
    };
    const key = { chainId: input.chainId, notificationUnitId: input.notificationUnitId };
    let checks = 0;
    function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }
    const created = await Promise.all(Array.from({ length: 8 }, () => createOrLoadAstronomyDelivery(pool, input)));
    check(created.filter(row => row.created).length === 1, "concurrent creation creates one ledger");
    check(created.every(row => row.revision === 0), "creation cannot reset or invent revisions");
    const emit = (expectedRevision: number, event: AstronomyDeliveryEvent, eventId = randomUUID()) =>
      applyAstronomyDeliveryEvent(pool, { ...key, expectedRevision, eventId, event });
    const admission = { enabled: true, checkedAt: at, fence };
    const claim: AstronomyDeliveryEvent = { type: "claim", at, admission };
    const claimId = randomUUID();
    const race = await Promise.all(Array.from({ length: 8 }, () => emit(0, claim, claimId)));
    check(race.filter(row => row.applied).length === 1, "duplicate workers append one claim event");
    check(race.filter(row => row.duplicate).length === 7, "replay deduplication occurs before stale-version rejection");
    const outbox: AstronomyDeliveryEvent = { type: "outbox", at, admission };
    const competing = await Promise.all([emit(1, outbox), emit(1, outbox)]);
    check(competing.filter(row => row.applied).length === 1 && competing.filter(row => row.conflict).length === 1,
      "different events with the same expected revision have one winner");
    await assert.rejects(emit(0, outbox, claimId), /event_id_conflict/);
    checks += 1;
    const correlationId = randomUUID();
    const begun = await emit(2, { type: "begin_submission", at, admission, correlationId, payloadDigest: "a".repeat(64) });
    check(begun.state.state === "provider_submitting" && begun.revision === 3, "submission intent is durable before any provider action");
    const afterRestart = await readAstronomyDelivery(pool, key);
    check(afterRestart?.state.state === "provider_submitting" && afterRestart.revision === 3, "fresh read reconstructs the committed ledger");
    const recovered = await emit(3, { type: "recover_submission", at: at + 1 });
    check(recovered.state.state === "submit_unknown", "restart recovers uncertainty without a fresh attempt");
    const cannotReset = await createOrLoadAstronomyDelivery(pool, { ...input, fence: { ...fence, rolloutEpoch: 2 }, maxAttempts: 9, expiresAt: input.expiresAt + 100_000 });
    check(!cannotReset.created && cannotReset.revision === 4 && cannotReset.state.state === "submit_unknown", "recreation with new revisions cannot reset unknown acceptance");
    check(cannotReset.state.expiresAt === input.expiresAt && cannotReset.state.maxAttempts === 2, "original deadline and retry policy survive recreation");
    const eventCount = (await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_events_r8")).rows[0].n;
    await assert.rejects(emit(4, { type: "claim", at: at + 2, admission: { ...admission, checkedAt: at + 2 } }), /transition_invalid/);
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_events_r8")).rows[0].n === eventCount, "failed reducer transition appends no event");
    const ack = await emit(4, { type: "acknowledge", at: at + 2, correlationId, evidenceRef: "device-receipt-1" });
    check(ack.state.state === "acknowledged" && ack.state.attempts.length === 1, "late acknowledgment updates the original attempt");
    const replayAfterLater = await emit(0, claim, claimId);
    check(replayAfterLater.duplicate && replayAfterLater.revision === 5 && replayAfterLater.state.state === "acknowledged", "old replay reports current state without undoing later evidence");
    const acceptedRecreate = await createOrLoadAstronomyDelivery(pool, input);
    check(acceptedRecreate.state.state === "acknowledged" && !acceptedRecreate.created, "accepted lineage cannot be freshly enrolled");
    await assert.rejects(pool.query("DELETE FROM mobile_astronomy_delivery_events_r8"), /immutable/);
    await assert.rejects(pool.query("UPDATE mobile_astronomy_delivery_ledgers_r8 SET revision=0"), /immutable|revision|checkpoint/);
    checks += 2;

    const otherInput = { ...input, chainId: randomUUID() };
    const otherKey = { chainId: otherInput.chainId, notificationUnitId: otherInput.notificationUnitId };
    await createOrLoadAstronomyDelivery(pool, otherInput);
    await assert.rejects(applyAstronomyDeliveryEvent(pool, { ...otherKey, expectedRevision: 0, eventId: claimId, event: claim }), /event_id_conflict/);
    checks += 1;

    // A test-only PostgreSQL trigger injects failure after the event INSERT,
    // proving the real store transaction rolls back event and checkpoint together.
    await pool.query(`CREATE FUNCTION r8_test_fail_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'r8_test_checkpoint_failure'; END; $$;
      CREATE TRIGGER r8_test_fail_checkpoint BEFORE UPDATE ON mobile_astronomy_delivery_ledgers_r8
      FOR EACH ROW EXECUTE FUNCTION r8_test_fail_checkpoint()`);
    const crashEventId = randomUUID();
    await assert.rejects(applyAstronomyDeliveryEvent(pool, { ...otherKey, expectedRevision: 0, eventId: crashEventId, event: claim }), /r8_test_checkpoint_failure/);
    check((await pool.query("SELECT count(*)::int AS n FROM mobile_astronomy_delivery_events_r8 WHERE event_id=$1", [crashEventId])).rows[0].n === 0,
      "crash after event insertion leaves no partial event");
    check((await readAstronomyDelivery(pool, otherKey))?.revision === 0, "crash preserves original checkpoint");
    await pool.query("DROP TRIGGER r8_test_fail_checkpoint ON mobile_astronomy_delivery_ledgers_r8; DROP FUNCTION r8_test_fail_checkpoint()");
    const retrySameId = await applyAstronomyDeliveryEvent(pool, { ...otherKey, expectedRevision: 0, eventId: crashEventId, event: claim });
    check(retrySameId.applied && retrySameId.revision === 1, "rolled-back event ID is safe to reuse");

    await assert.rejects(emit(5, { type: "suppress", at: at + 3, reason: "revoked", accountId: randomUUID() } as unknown as AstronomyDeliveryEvent), /event_invalid/);
    checks += 1;
    check(JSON.stringify((await pool.query("SELECT * FROM legacy_lane_sentinel ORDER BY science")).rows) === before,
      "additive migration and store leave other lane sentinels byte-equivalent");
    const gates = (await pool.query("SELECT bool_and(provider_dispatch_enabled=false) AS off FROM mobile_astronomy_delivery_ledgers_r8")).rows[0].off;
    check(gates === true, "persisted test ledger is not a production dispatch permission");
    await assert.rejects(pool.query("UPDATE mobile_astronomy_delivery_ledgers_r8 SET provider_dispatch_enabled=true"));
    checks += 1;
    console.log(`ASTRONOMY_DELIVERY_STORE_R8_OK checks=${checks} realPostgres=true providerCalls=0 productionWrites=0 activation=false`);
  });
}
