import { createHash, createHmac } from "node:crypto";
import {
  buildCivilSkySnapshot,
  nextCivilTwoHourBoundary,
  type AstronomyFactSnapshot,
  type CivilTwoHourBoundary,
} from "./astro/astronomy-fact-r8";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY_ID_RE = /^[A-Za-z0-9._:-]{4,80}$/u;

export type AstronomyShadowRow = Readonly<{
  chain_id: string;
  account_delivery_chain_uuid: string;
  user_id: string;
  org_id: string;
  display_timezone: string;
  schema_version: number;
  rollout_epoch: number;
  target_revision: number;
  consent_generation: number;
  quiet_start: number;
  quiet_end: number;
  local_day_cap: number;
  local_day_count: number | string;
  rolling_24h_count: number | string;
}>;

export type IdentityKey = Readonly<{ key: Uint8Array; keyId: string }>;

export type AstronomyShadowOccurrence = Readonly<{
  chainId: string;
  notificationUnitId: string;
  identityCbor: Buffer;
  identityHash: Buffer;
  resultRevisionHash: Buffer;
  rolloutEpoch: number;
  state: "shadowed" | "expired";
  suppressionReason: "quiet_hours" | "local_day_cap" | "rolling_24h_cap" | null;
  scheduledFor: Date;
  expiresAt: Date;
  snapshot: Readonly<{
    snapshotSchema: 1;
    category: "astronomy_fact";
    mode: "civil_two_hour";
    identityKeyId: string;
    facts: AstronomyFactSnapshot;
    validity: Readonly<{ scheduledFor: string; expiresAt: string }>;
    decision: Readonly<{
      state: "shadowed" | "expired";
      suppressionReason: "quiet_hours" | "local_day_cap" | "rolling_24h_cap" | null;
      localDayCountBefore: number;
      rolling24hCountBefore: number;
      localDayCap: number;
      rolling24hCap: 12;
    }>;
  }>;
  snapshotDigest: string;
}>;

function lengthHeader(major: number, length: number | bigint): Buffer {
  const value = typeof length === "bigint" ? length : BigInt(length);
  if (value < BigInt(0)) throw new TypeError("r8_cbor_length_invalid");
  if (value < BigInt(24)) return Buffer.from([(major << 5) | Number(value)]);
  if (value <= BigInt(0xff)) return Buffer.from([(major << 5) | 24, Number(value)]);
  if (value <= BigInt(0xffff)) {
    const output = Buffer.alloc(3);
    output[0] = (major << 5) | 25;
    output.writeUInt16BE(Number(value), 1);
    return output;
  }
  if (value <= BigInt(0xffff_ffff)) {
    const output = Buffer.alloc(5);
    output[0] = (major << 5) | 26;
    output.writeUInt32BE(Number(value), 1);
    return output;
  }
  if (value <= BigInt("18446744073709551615")) {
    const output = Buffer.alloc(9);
    output[0] = (major << 5) | 27;
    output.writeBigUInt64BE(value, 1);
    return output;
  }
  throw new TypeError("r8_cbor_integer_too_large");
}

function canonicalMap(value: Record<string, unknown>): Buffer {
  const entries = Object.entries(value).map(([key, item]) => {
    const encodedKey = canonicalCbor(key);
    return { encodedKey, encodedValue: canonicalCbor(item) };
  }).sort((left, right) => left.encodedKey.length - right.encodedKey.length
    || Buffer.compare(left.encodedKey, right.encodedKey));
  return Buffer.concat([
    lengthHeader(5, entries.length),
    ...entries.flatMap((entry) => [entry.encodedKey, entry.encodedValue]),
  ]);
}

export function canonicalCbor(value: unknown): Buffer {
  if (value === null) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("r8_cbor_number_invalid");
    return value >= 0 ? lengthHeader(0, value) : lengthHeader(1, -1 - value);
  }
  if (typeof value === "bigint") {
    return value >= BigInt(0) ? lengthHeader(0, value) : lengthHeader(1, BigInt(-1) - value);
  }
  if (typeof value === "string") {
    const encoded = Buffer.from(value, "utf8");
    return Buffer.concat([lengthHeader(3, encoded.length), encoded]);
  }
  if (value instanceof Uint8Array) {
    const encoded = Buffer.from(value);
    return Buffer.concat([lengthHeader(2, encoded.length), encoded]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([lengthHeader(4, value.length), ...value.map(canonicalCbor)]);
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return canonicalMap(value as Record<string, unknown>);
  }
  throw new TypeError("r8_cbor_value_invalid");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hmac(key: Uint8Array, domain: string, value: Buffer): Buffer {
  if (key.byteLength < 32 || key.byteLength > 64) throw new TypeError("r8_identity_key_invalid");
  return createHmac("sha256", key).update(domain, "utf8").update(Buffer.from([0])).update(value).digest();
}

function currentCivilBoundary(timezone: string, at: Date): CivilTwoHourBoundary {
  let cursor = new Date(at.valueOf() - 6 * 3_600_000);
  let current: CivilTwoHourBoundary | null = null;
  for (let index = 0; index < 8; index += 1) {
    const candidate = nextCivilTwoHourBoundary(timezone, cursor);
    if (!candidate || candidate.instant > at) break;
    current = candidate;
    cursor = candidate.instant;
  }
  if (!current) throw new TypeError("r8_shadow_boundary_unresolved");
  return current;
}

function validateRow(row: AstronomyShadowRow): void {
  for (const value of [row.chain_id,row.account_delivery_chain_uuid,row.user_id,row.org_id]) {
    if (!UUID_RE.test(String(value || ""))) throw new TypeError("r8_shadow_identity_invalid");
  }
  if (row.schema_version !== 1 || !Number.isSafeInteger(Number(row.rollout_epoch)) || Number(row.rollout_epoch) < 1
    || !Number.isSafeInteger(Number(row.target_revision)) || Number(row.target_revision) < 1
    || !Number.isSafeInteger(Number(row.consent_generation)) || Number(row.consent_generation) < 1) {
    throw new TypeError("r8_shadow_generation_invalid");
  }
  for (const hour of [row.quiet_start,row.quiet_end]) {
    if (!Number.isSafeInteger(Number(hour)) || Number(hour) < 0 || Number(hour) > 23) {
      throw new TypeError("r8_shadow_quiet_hours_invalid");
    }
  }
  if (Number(row.quiet_start) === Number(row.quiet_end)
    || !Number.isSafeInteger(Number(row.local_day_cap)) || Number(row.local_day_cap) < 1 || Number(row.local_day_cap) > 12
    || !Number.isSafeInteger(Number(row.local_day_count)) || Number(row.local_day_count) < 0
    || !Number.isSafeInteger(Number(row.rolling_24h_count)) || Number(row.rolling_24h_count) < 0) {
    throw new TypeError("r8_shadow_policy_invalid");
  }
}

export function shadowAdmissionDecision(
  row: AstronomyShadowRow,
  facts: AstronomyFactSnapshot,
): Readonly<{
  state: "shadowed" | "expired";
  suppressionReason: "quiet_hours" | "local_day_cap" | "rolling_24h_cap" | null;
}> {
  validateRow(row);
  const clock = /T(\d{2}):(\d{2}):\d{2}(?:[+-]\d{2}:\d{2})$/u.exec(facts.localBoundary);
  if (!clock) throw new TypeError("r8_shadow_local_boundary_invalid");
  const localMinute = Number(clock[1]) * 60 + Number(clock[2]);
  const quietStart = Number(row.quiet_start) * 60;
  const quietEnd = Number(row.quiet_end) * 60;
  const quiet = quietStart < quietEnd
    ? localMinute >= quietStart && localMinute < quietEnd
    : localMinute >= quietStart || localMinute < quietEnd;
  if (quiet) return Object.freeze({ state: "expired", suppressionReason: "quiet_hours" });
  if (Number(row.local_day_count) >= Number(row.local_day_cap)) {
    return Object.freeze({ state: "expired", suppressionReason: "local_day_cap" });
  }
  if (Number(row.rolling_24h_count) >= 12) {
    return Object.freeze({ state: "expired", suppressionReason: "rolling_24h_cap" });
  }
  return Object.freeze({ state: "shadowed", suppressionReason: null });
}

export function buildAstronomyShadowOccurrence(
  row: AstronomyShadowRow,
  at: Date,
  identityKey: IdentityKey,
): AstronomyShadowOccurrence {
  validateRow(row);
  if (!KEY_ID_RE.test(identityKey.keyId)) throw new TypeError("r8_identity_key_id_invalid");
  const boundary = currentCivilBoundary(row.display_timezone, at);
  const nextBoundary = nextCivilTwoHourBoundary(row.display_timezone, boundary.instant);
  if (!nextBoundary) throw new TypeError("r8_shadow_expiry_unresolved");
  const facts = buildCivilSkySnapshot({
    instant: boundary.instant,
    timezone: row.display_timezone,
    observation: { frame: "geocentric", location: null },
  });
  const identityCbor = canonicalCbor({
    v: 1,
    chain: row.account_delivery_chain_uuid,
    notificationUnitId: boundary.unitId,
  });
  const identityHash = hmac(identityKey.key, "hourkey:r8:delivery-lineage:v1", identityCbor);
  const resultRevisionCbor = canonicalCbor({
    v: 1,
    identityHash,
    timezone: row.display_timezone,
    schemaVersion: row.schema_version,
    rolloutEpoch: row.rollout_epoch,
    targetRevision: row.target_revision,
    consentGeneration: row.consent_generation,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    localDayCap: row.local_day_cap,
    modelVersion: facts.modelVersion,
  });
  const resultRevisionHash = hmac(identityKey.key, "hourkey:r8:result-revision:v1", resultRevisionCbor);
  const decision = shadowAdmissionDecision(row, facts);
  const snapshot = Object.freeze({
    snapshotSchema: 1 as const,
    category: "astronomy_fact" as const,
    mode: "civil_two_hour" as const,
    identityKeyId: identityKey.keyId,
    facts,
    validity: Object.freeze({
      scheduledFor: boundary.instant.toISOString(),
      expiresAt: nextBoundary.instant.toISOString(),
    }),
    decision: Object.freeze({
      ...decision,
      localDayCountBefore: Number(row.local_day_count),
      rolling24hCountBefore: Number(row.rolling_24h_count),
      localDayCap: Number(row.local_day_cap),
      rolling24hCap: 12 as const,
    }),
  });
  return Object.freeze({
    chainId: row.chain_id,
    notificationUnitId: boundary.unitId,
    identityCbor,
    identityHash,
    resultRevisionHash,
    rolloutEpoch: row.rollout_epoch,
    state: decision.state,
    suppressionReason: decision.suppressionReason,
    scheduledFor: new Date(boundary.instant.valueOf()),
    expiresAt: new Date(nextBoundary.instant.valueOf()),
    snapshot,
    snapshotDigest: createHash("sha256").update(canonicalJson(snapshot)).digest("hex"),
  });
}
