/**
 * Durable, provider-free astronomy ledger. No production consumer or activation.
 * A separately reviewed integration must resolve the stable authorized chain,
 * classify provider evidence, and hold consent/revocation dispatch fences.
 * This store serializes a lineage and ingests events; it is not those gates.
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  createAstronomyDelivery, transitionAstronomyDelivery,
  type AstronomyDelivery, type AstronomyDeliveryEvent,
} from "./mobile-astronomy-delivery-state-r8";

type Initial = Parameters<typeof createAstronomyDelivery>[0];
type Key = Readonly<{ chainId: string; notificationUnitId: string }>;
export type StoredAstronomyDelivery = Readonly<{ revision: number; state: AstronomyDelivery }>;
type LedgerRow = { chain_uuid: string; notification_unit_id: string; initial_input: Initial; revision: string; current_state: AstronomyDelivery };
type EventRow = { chain_uuid: string; notification_unit_id: string; revision: string; event_json: AstronomyDeliveryEvent; event_digest: string; state_before: AstronomyDelivery; state_after: AstronomyDelivery; state_digest: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function fail(reason: string): never { throw new TypeError(`r8_delivery_store_${reason}`); }
function uuid(value: string): string {
  if (typeof value !== "string" || !UUID.test(value)) fail("uuid_invalid");
  return value.toLowerCase();
}
function keyOf(input: Key): Key {
  const chainId = uuid(input.chainId);
  const unit = input.notificationUnitId;
  if (typeof unit !== "string" || unit.length < 1 || unit.length > 512 || unit.trim() !== unit
    || /[\u0000-\u001f\u007f]/u.test(unit)) fail("unit_invalid");
  return Object.freeze({ chainId, notificationUnitId: unit });
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return fail("json_invalid");
}
function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function exactKeys(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("event_invalid");
}
function checkedEvent(event: AstronomyDeliveryEvent): AstronomyDeliveryEvent {
  const fields: Record<string, readonly string[]> = {
    claim: ["at", "type", "admission"], outbox: ["at", "type", "admission"],
    begin_submission: ["at", "type", "admission", "correlationId", "payloadDigest"],
    result: ["at", "type", "correlationId", "outcome", "retryable", "evidenceRef"],
    acknowledge: ["at", "type", "correlationId", "evidenceRef"],
    suppress: ["at", "type", "reason"], expire: ["at", "type"], recover_submission: ["at", "type"],
  };
  if (!event || !Object.hasOwn(fields, event.type)) fail("event_invalid");
  exactKeys(event, fields[event.type]);
  if ("admission" in event) {
    exactKeys(event.admission, ["enabled", "checkedAt", "fence"]);
    exactKeys(event.admission.fence, ["rolloutEpoch", "consentGeneration", "targetRevision", "contextRevision"]);
  }
  const normalized = "correlationId" in event ? { ...event, correlationId: uuid(event.correlationId) } : event;
  const json = canonical(normalized);
  if (Buffer.byteLength(json, "utf8") > 8192) fail("event_too_large");
  // Capture caller-owned data before the first await; no reference can change
  // after its digest is chosen and before transaction/reducer execution.
  return JSON.parse(json) as AstronomyDeliveryEvent;
}
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard: Error | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='5s'");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch { discard = new Error("r8_delivery_store_rollback_failed"); }
    throw error;
  } finally { client.release(discard); }
}
async function locked(client: PoolClient, key: Key): Promise<LedgerRow | null> {
  const result = await client.query<LedgerRow>(
    `SELECT chain_uuid::text,notification_unit_id,initial_input,revision::text,current_state
       FROM mobile_astronomy_delivery_ledgers_r8
      WHERE chain_uuid=$1::uuid AND notification_unit_id=$2 FOR UPDATE`,
    [key.chainId, key.notificationUnitId],
  );
  return result.rows[0] ?? null;
}
async function verified(client: PoolClient, row: LedgerRow): Promise<StoredAstronomyDelivery> {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) fail("checkpoint_invalid");
  let state = createAstronomyDelivery(row.initial_input);
  if (state.chainId !== row.chain_uuid || state.notificationUnitId !== row.notification_unit_id) fail("checkpoint_identity_invalid");
  const events = await client.query<EventRow>(
    `SELECT revision::text,event_json,event_digest,state_before,state_after,state_digest
       FROM mobile_astronomy_delivery_events_r8
      WHERE chain_uuid=$1::uuid AND notification_unit_id=$2 ORDER BY revision`,
    [row.chain_uuid, row.notification_unit_id],
  );
  if (events.rows.length !== revision) fail("checkpoint_revision_invalid");
  for (let index = 0; index < events.rows.length; index += 1) {
    const item = events.rows[index];
    const event = checkedEvent(item.event_json);
    if (Number(item.revision) !== index + 1 || digest(event) !== item.event_digest
      || canonical(item.state_before) !== canonical(state)) fail("event_integrity_invalid");
    state = transitionAstronomyDelivery(state, event);
    if (digest(state) !== item.state_digest || canonical(state) !== canonical(item.state_after)) fail("event_integrity_invalid");
  }
  if (canonical(state) !== canonical(row.current_state)) fail("checkpoint_integrity_invalid");
  return Object.freeze({ revision, state });
}

export async function createOrLoadAstronomyDelivery(pool: Pool, input: Initial): Promise<StoredAstronomyDelivery & { created: boolean }> {
  const state = createAstronomyDelivery(input);
  const key = keyOf(state);
  const initial: Initial = {
    chainId: state.chainId, notificationUnitId: state.notificationUnitId, createdAt: input.createdAt,
    scheduledFor: state.scheduledFor, expiresAt: state.expiresAt, maxAttempts: state.maxAttempts, fence: state.fence,
  };
  return transaction(pool, async client => {
    const inserted = await client.query(
      `INSERT INTO mobile_astronomy_delivery_ledgers_r8(chain_uuid,notification_unit_id,initial_input,current_state)
       VALUES ($1::uuid,$2,$3::jsonb,$4::jsonb) ON CONFLICT (chain_uuid,notification_unit_id) DO NOTHING`,
      [key.chainId, key.notificationUnitId, canonical(initial), canonical(state)],
    );
    const row = await locked(client, key);
    if (!row) fail("ledger_missing");
    return Object.freeze({ ...await verified(client, row), created: inserted.rowCount === 1 });
  });
}

export async function readAstronomyDelivery(pool: Pool, input: Key): Promise<StoredAstronomyDelivery | null> {
  const key = keyOf(input);
  return transaction(pool, async client => {
    const row = await locked(client, key);
    return row ? verified(client, row) : null;
  });
}

export async function applyAstronomyDeliveryEvent(pool: Pool, input: Key & Readonly<{
  expectedRevision: number; eventId: string; event: AstronomyDeliveryEvent;
}>): Promise<StoredAstronomyDelivery & Readonly<{ applied: boolean; duplicate: boolean; conflict: boolean }>> {
  const key = keyOf(input);
  const eventId = uuid(input.eventId);
  const event = checkedEvent(input.event);
  const expectedRevision = input.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail("revision_invalid");
  const eventDigest = digest(event);
  return transaction(pool, async client => {
    const row = await locked(client, key);
    if (!row) fail("ledger_missing");
    const current = await verified(client, row);
    const existing = await client.query<EventRow>(
      "SELECT chain_uuid::text,notification_unit_id,event_json,event_digest FROM mobile_astronomy_delivery_events_r8 WHERE event_id=$1::uuid",
      [eventId],
    );
    if (existing.rows.length) {
      const previous = existing.rows[0];
      if (previous.chain_uuid !== key.chainId || previous.notification_unit_id !== key.notificationUnitId
        || previous.event_digest !== eventDigest || canonical(previous.event_json) !== canonical(event)) fail("event_id_conflict");
      return Object.freeze({ ...current, applied: false, duplicate: true, conflict: false });
    }
    if (current.revision !== expectedRevision) return Object.freeze({ ...current, applied: false, duplicate: false, conflict: true });
    const next = transitionAstronomyDelivery(current.state, event);
    const nextRevision = current.revision + 1;
    if (!Number.isSafeInteger(nextRevision)) fail("revision_invalid");
    const insertion = await client.query(
      `INSERT INTO mobile_astronomy_delivery_events_r8
        (chain_uuid,notification_unit_id,revision,event_id,event_json,event_digest,state_before,state_after,state_digest)
       VALUES ($1::uuid,$2,$3,$4::uuid,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (event_id) DO NOTHING`,
      [key.chainId,key.notificationUnitId,nextRevision,eventId,canonical(event),eventDigest,canonical(current.state),canonical(next),digest(next)],
    );
    if (insertion.rowCount !== 1) fail("event_id_conflict");
    const updated = await client.query(
      `UPDATE mobile_astronomy_delivery_ledgers_r8 SET revision=$3,current_state=$4::jsonb
        WHERE chain_uuid=$1::uuid AND notification_unit_id=$2 AND revision=$5`,
      [key.chainId,key.notificationUnitId,nextRevision,canonical(next),current.revision],
    );
    if (updated.rowCount !== 1) fail("checkpoint_conflict");
    return Object.freeze({ revision: nextRevision, state: next, applied: true, duplicate: false, conflict: false });
  });
}
