import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";
import { parseTz, wallClockToUtc, zoneOffsetMinutes } from "@/lib/birth-timezone";

/** Immutable V195 capability pin. Content 046 is reused, never rewritten. */
export const FORECOURT_CONTENT_ID = "mainhall-20260809-046";
export const FORECOURT_SCENE_SHA256 =
  "dedfde2c76033334cff27082e681946f3aae43eade5bb636e57e5a51fae2278e";
export const FORECOURT_PHYSICS_SCHEMA = "forecourt-coin-v2";
export const FORECOURT_POLICY_VERSION = "forecourt-authority-v1";
export const FORECOURT_BASE_THROWS = 3;
export const FORECOURT_MAX_THROWS = 4;
export const FORECOURT_TICKET_TTL_MS = 15 * 60_000;
export const FORECOURT_TIMEZONE_ANTI_HOP_MS = 20 * 60 * 60_000;
export const FORECOURT_ORIGIN_BOUNDS = Object.freeze({
  x: Object.freeze([5.52, 5.64] as const),
  y: Object.freeze([1.12, 1.24] as const),
  z: Object.freeze([23.18, 23.30] as const),
});
const FORECOURT_TARGET_XZ = Object.freeze({ x: 0.95767, z: 0.28786 });
const FORECOURT_DIRECTION_MIN_DOT = Math.cos(35 * Math.PI / 180);

export const FORECOURT_LOCALES = [
  "th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es",
] as const;
export type ForecourtLocale = (typeof FORECOURT_LOCALES)[number];

export const FORECOURT_IMPACT_KINDS = [
  "Navel", "Budai", "Stone", "Water", "Ground",
] as const;
export type ForecourtImpactKind = (typeof FORECOURT_IMPACT_KINDS)[number];

export type ForecourtVector = Readonly<{ x: number; y: number; z: number }>;

export type ForecourtProjection = Readonly<{
  localDate: string;
  throwsUsed: number;
  recoveryEarned: boolean;
  blessingClaimed: boolean;
  successes: number;
  lanternLevel: number;
  waterLevel: number;
  lotusLevel: number;
}>;

export type ForecourtPrepareInput = Readonly<{
  idempotencyKey: string;
  contentId: typeof FORECOURT_CONTENT_ID;
  physicsSchema: typeof FORECOURT_PHYSICS_SCHEMA;
  locale: ForecourtLocale;
  origin: ForecourtVector;
  direction: ForecourtVector;
  speed: number;
  angularVelocity: ForecourtVector;
}>;

export type ForecourtCommitInput = Readonly<{
  idempotencyKey: string;
  throwId: string;
  ticket: string;
  locale: ForecourtLocale;
  impactKind: ForecourtImpactKind;
  surfaceId: string;
  contact: ForecourtVector;
  rest: ForecourtVector;
  flightMs: number;
  traceHash: string;
}>;

export type ForecourtVoiceAsset = Readonly<{
  mode: "asset";
  profileId: "budai-warm-v1";
  locale: ForecourtLocale;
  mimeType: "audio/mpeg";
  url: string;
  sha256: string;
  durationMs: number;
}>;

export type ForecourtBlessing = Readonly<{
  blessingId: string;
  resultCode: "forecourt-first-daily-navel-v1";
  presentationCode: "budai.gold-water-lotus";
  display: Readonly<{
    title: string;
    body: string;
    footer: string;
  }>;
  voice: ForecourtVoiceAsset | null;
}>;

export type ForecourtStateResult = Readonly<{
  ok: true;
  authoritative: true;
  contentId: typeof FORECOURT_CONTENT_ID;
  physicsSchema: typeof FORECOURT_PHYSICS_SCHEMA;
  policyVersion: typeof FORECOURT_POLICY_VERSION;
  nextResetAt: string;
  projection: ForecourtProjection;
}>;

export type ForecourtPrepareResult = ForecourtStateResult & Readonly<{
  replayed: boolean;
  throwId: string;
  ordinal: number;
  ticket: string;
  expiresAt: string;
}>;

export type ForecourtCommitResult = ForecourtStateResult & Readonly<{
  replayed: boolean;
  throwId: string;
  impactKind: ForecourtImpactKind;
  blessing: ForecourtBlessing | null;
}>;

export class ForecourtInputError extends Error {
  constructor(field: string) {
    super(`invalid_${field}`);
  }
}

export class ForecourtCapabilityMismatch extends Error {
  constructor() {
    super("forecourt_capability_mismatch");
  }
}

export class ForecourtIdempotencyConflict extends Error {
  constructor() {
    super("forecourt_idempotency_conflict");
  }
}

export class ForecourtDailyLimitReached extends Error {
  constructor(readonly projection: ForecourtProjection) {
    super("forecourt_daily_limit");
  }
}

export class ForecourtThrowConflict extends Error {
  constructor(message = "forecourt_throw_already_committed") {
    super(message);
  }
}

export class ForecourtTicketError extends Error {
  constructor(message: "forecourt_ticket_invalid" | "forecourt_ticket_expired") {
    super(message);
  }
}

export class ForecourtImpactError extends Error {
  constructor(message = "forecourt_impact_invalid") {
    super(message);
  }
}

export class ForecourtAccountUnavailable extends Error {
  constructor() {
    super("forecourt_account_unavailable");
  }
}

const PREPARE_KEY = /^foreprep_[0-9a-f]{32}$/u;
const COMMIT_KEY = /^forecommit_[0-9a-f]{32}$/u;
const THROW_ID = /^throw_[0-9a-f]{32}$/u;
const TRACE_HASH = /^[0-9a-f]{64}$/u;
const SURFACE_ID = /^[a-z][a-z0-9.-]{1,63}$/u;
const LOCALE_SET = new Set<string>(FORECOURT_LOCALES);
const IMPACT_SET = new Set<string>(FORECOURT_IMPACT_KINDS);
const EXACT_PREPARE_KEYS = [
  "angular_velocity", "content_id", "direction", "idempotency_key",
  "locale", "origin", "physics_schema", "speed",
] as const;
const EXACT_COMMIT_KEYS = [
  "contact", "flight_ms", "idempotency_key", "impact_kind", "locale",
  "rest", "surface_id", "throw_id", "ticket", "trace_hash",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new ForecourtInputError(field);
  }
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ForecourtInputError(field);
  }
  return value;
}

function vector(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): ForecourtVector {
  if (!isPlainRecord(value)) throw new ForecourtInputError(field);
  exactKeys(value, ["x", "y", "z"], field);
  const result = {
    x: finiteNumber(value.x, `${field}_x`),
    y: finiteNumber(value.y, `${field}_y`),
    z: finiteNumber(value.z, `${field}_z`),
  };
  if (Object.values(result).some((part) => part < minimum || part > maximum)) {
    throw new ForecourtInputError(field);
  }
  return Object.freeze(result);
}

function locale(value: unknown): ForecourtLocale {
  if (typeof value !== "string" || !LOCALE_SET.has(value)) {
    throw new ForecourtInputError("locale");
  }
  return value as ForecourtLocale;
}

function capability(contentId: unknown, physicsSchema: unknown): void {
  if (
    contentId !== FORECOURT_CONTENT_ID
    || physicsSchema !== FORECOURT_PHYSICS_SCHEMA
  ) {
    throw new ForecourtCapabilityMismatch();
  }
}

export function assertForecourtCapability(
  contentId: string | null,
  physicsSchema: string | null,
): void {
  capability(contentId, physicsSchema);
}

export function parseForecourtPrepareInput(raw: unknown): ForecourtPrepareInput {
  if (!isPlainRecord(raw)) throw new ForecourtInputError("body");
  exactKeys(raw, EXACT_PREPARE_KEYS, "body");
  capability(raw.content_id, raw.physics_schema);
  if (typeof raw.idempotency_key !== "string" || !PREPARE_KEY.test(raw.idempotency_key)) {
    throw new ForecourtInputError("idempotency_key");
  }
  const origin = vector(raw.origin, "origin", -64, 64);
  if (
    origin.x < FORECOURT_ORIGIN_BOUNDS.x[0]
    || origin.x > FORECOURT_ORIGIN_BOUNDS.x[1]
    || origin.y < FORECOURT_ORIGIN_BOUNDS.y[0]
    || origin.y > FORECOURT_ORIGIN_BOUNDS.y[1]
    || origin.z < FORECOURT_ORIGIN_BOUNDS.z[0]
    || origin.z > FORECOURT_ORIGIN_BOUNDS.z[1]
  ) {
    throw new ForecourtInputError("origin");
  }
  const direction = vector(raw.direction, "direction", -1, 1);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 0.98 || length > 1.02 || direction.y < 0.15 || direction.y > 0.56) {
    throw new ForecourtInputError("direction");
  }
  const horizontalLength = Math.hypot(direction.x, direction.z);
  const targetDot = (
    direction.x / horizontalLength * FORECOURT_TARGET_XZ.x
    + direction.z / horizontalLength * FORECOURT_TARGET_XZ.z
  );
  if (!Number.isFinite(targetDot) || targetDot < FORECOURT_DIRECTION_MIN_DOT) {
    throw new ForecourtInputError("direction");
  }
  const speed = finiteNumber(raw.speed, "speed");
  if (speed < 4.2 || speed > 9.0) throw new ForecourtInputError("speed");
  const angularVelocity = vector(raw.angular_velocity, "angular_velocity", -30, 30);
  return Object.freeze({
    idempotencyKey: raw.idempotency_key,
    contentId: FORECOURT_CONTENT_ID,
    physicsSchema: FORECOURT_PHYSICS_SCHEMA,
    locale: locale(raw.locale),
    origin,
    direction,
    speed,
    angularVelocity,
  });
}

export function parseForecourtCommitInput(raw: unknown): ForecourtCommitInput {
  if (!isPlainRecord(raw)) throw new ForecourtInputError("body");
  exactKeys(raw, EXACT_COMMIT_KEYS, "body");
  if (typeof raw.idempotency_key !== "string" || !COMMIT_KEY.test(raw.idempotency_key)) {
    throw new ForecourtInputError("idempotency_key");
  }
  if (typeof raw.throw_id !== "string" || !THROW_ID.test(raw.throw_id)) {
    throw new ForecourtInputError("throw_id");
  }
  if (typeof raw.ticket !== "string" || raw.ticket.length < 40 || raw.ticket.length > 256) {
    throw new ForecourtInputError("ticket");
  }
  if (typeof raw.impact_kind !== "string" || !IMPACT_SET.has(raw.impact_kind)) {
    throw new ForecourtInputError("impact_kind");
  }
  if (typeof raw.surface_id !== "string" || !SURFACE_ID.test(raw.surface_id)) {
    throw new ForecourtInputError("surface_id");
  }
  const flightMs = finiteNumber(raw.flight_ms, "flight_ms");
  if (!Number.isInteger(flightMs) || flightMs < 1 || flightMs > 7_000) {
    throw new ForecourtInputError("flight_ms");
  }
  if (typeof raw.trace_hash !== "string" || !TRACE_HASH.test(raw.trace_hash)) {
    throw new ForecourtInputError("trace_hash");
  }
  const contact = vector(raw.contact, "contact", -64, 64);
  const rest = vector(raw.rest, "rest", -64, 64);
  if (rest.y < -4 || rest.y > 20 || rest.z < -8 || rest.z > 48) {
    throw new ForecourtInputError("rest");
  }
  return Object.freeze({
    idempotencyKey: raw.idempotency_key,
    throwId: raw.throw_id,
    ticket: raw.ticket,
    locale: locale(raw.locale),
    impactKind: raw.impact_kind as ForecourtImpactKind,
    surfaceId: raw.surface_id,
    contact,
    rest,
    flightMs,
    traceHash: raw.trace_hash,
  });
}

const SURFACES: Readonly<Record<ForecourtImpactKind, ReadonlySet<string>>> = {
  Navel: new Set(["budai.navel"]),
  Budai: new Set(["budai.body"]),
  Stone: new Set(["basin.stone"]),
  Water: new Set(["basin.water"]),
  Ground: new Set(["forecourt.ground"]),
};

export function validateForecourtImpact(input: ForecourtCommitInput): void {
  if (!SURFACES[input.impactKind].has(input.surfaceId)) {
    throw new ForecourtImpactError();
  }
  // For Navel, contact is local to `budai.navel`; rest is always scene/world.
  // Content 046 uses a 0.15 m trigger plus 0.03 m cross-platform tolerance.
  if (
    input.impactKind === "Navel"
    && Math.hypot(input.contact.x, input.contact.y, input.contact.z) > 0.18
  ) {
    throw new ForecourtImpactError();
  }
}

export function forecourtLevels(lifetimeSuccesses: number): Readonly<{
  lotusLevel: number;
  lanternLevel: number;
  waterLevel: number;
}> {
  if (!Number.isSafeInteger(lifetimeSuccesses) || lifetimeSuccesses < 0) {
    throw new ForecourtInputError("successes");
  }
  return Object.freeze({
    lotusLevel: Math.min(5, Math.floor(lifetimeSuccesses / 3)),
    lanternLevel: Math.min(5, Math.floor(lifetimeSuccesses / 5)),
    waterLevel: Math.min(5, Math.floor(lifetimeSuccesses / 7)),
  });
}

export type LocalDayWindow = Readonly<{
  localDate: string;
  timezoneName: string;
  utcOffsetMinutes: number;
  startedAt: Date;
  nextResetAt: Date;
}>;

function isoDayInZone(at: Date, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function nextIsoDay(day: string): string {
  const next = new Date(`${day}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function atLocalMidnight(day: string, timezoneName: string): Date {
  const parsed = parseTz(timezoneName);
  const value = parsed === null
    ? null
    : wallClockToUtc(`${day}T00:00:00`, parsed);
  if (value === null || !Number.isFinite(value.getTime())) {
    throw new ForecourtInputError("timezone");
  }
  return value;
}

export function resolveForecourtCycleWindow(
  at: Date,
  requestedTimezone: string | null,
  prior: Readonly<{ nextResetAt: Date }> | null = null,
): LocalDayWindow {
  const candidate = String(requestedTimezone || "").trim();
  const parsed = parseTz(candidate);
  const timezoneName = parsed?.kind === "zone" ? parsed.label : "Asia/Bangkok";
  const localDate = isoDayInZone(at, timezoneName);
  const localStart = atLocalMidnight(localDate, timezoneName);
  const priorBoundary = prior?.nextResetAt ?? localStart;
  const startedAt = new Date(Math.max(localStart.getTime(), priorBoundary.getTime()));
  const localNext = atLocalMidnight(nextIsoDay(localDate), timezoneName);
  const antiHopNext = new Date(startedAt.getTime() + FORECOURT_TIMEZONE_ANTI_HOP_MS);
  const nextResetAt = new Date(Math.max(localNext.getTime(), antiHopNext.getTime()));
  const offset = zoneOffsetMinutes(at.getTime(), timezoneName);
  if (offset === null) throw new ForecourtInputError("timezone");
  return Object.freeze({
    localDate,
    timezoneName,
    utcOffsetMinutes: offset,
    startedAt,
    nextResetAt,
  });
}

export type ForecourtCycle = Readonly<{
  id: string;
  userId: string;
  cycleNo: number;
  localDate: string;
  timezoneName: string;
  utcOffsetMinutes: number;
  startedAt: Date;
  nextResetAt: Date;
}>;

export type ForecourtAuthorization = Readonly<{
  id: string;
  userId: string;
  dayId: string;
  ordinal: number;
  requestHash: string;
  ticketHash: string;
  issuedAt: Date;
  expiresAt: Date;
  resultJson: ForecourtPrepareResult;
}>;

export type ForecourtCommitReplay = Readonly<{
  requestHash: string;
  resultJson: ForecourtCommitResult;
}>;

export type ForecourtCounts = Readonly<{
  throwsUsed: number;
  lifetimeSuccesses: number;
  recoveryEarned: boolean;
  blessingClaimed: boolean;
}>;

export type ForecourtRecoverySource = Readonly<{ id: string; ritualId: string }>;

export type ForecourtTransaction = Readonly<{
  now(): Promise<Date>;
  userTimezone(userId: string): Promise<string | null | undefined>;
  latestCycle(userId: string): Promise<ForecourtCycle | null>;
  insertCycle(cycle: ForecourtCycle): Promise<void>;
  authorizationByPrepareKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Readonly<{ requestHash: string; resultJson: ForecourtPrepareResult }> | null>;
  authorizationById(userId: string, throwId: string): Promise<ForecourtAuthorization | null>;
  insertAuthorization(input: Readonly<{
    authorization: ForecourtAuthorization;
    idempotencyKey: string;
    contentId: string;
    sceneSha256: string;
    physicsSchema: string;
    locale: ForecourtLocale;
    launchJson: unknown;
  }>): Promise<void>;
  commitByKey(userId: string, idempotencyKey: string): Promise<ForecourtCommitReplay | null>;
  commitByThrow(userId: string, throwId: string): Promise<ForecourtCommitReplay | null>;
  insertCommit(input: Readonly<{
    userId: string;
    dayId: string;
    throwId: string;
    idempotencyKey: string;
    requestHash: string;
    locale: ForecourtLocale;
    reportedImpact: ForecourtImpactKind;
    authoritativeImpact: ForecourtImpactKind;
    surfaceId: string;
    evidenceJson: unknown;
    resultJson: ForecourtCommitResult;
  }>): Promise<void>;
  counts(userId: string, dayId: string): Promise<ForecourtCounts>;
  thirdAuthorizationAt(userId: string, dayId: string): Promise<Date | null>;
  qualifyingRecoverySource(
    userId: string,
    notBefore: Date,
    before: Date,
  ): Promise<ForecourtRecoverySource | null>;
  insertRecovery(
    userId: string,
    dayId: string,
    source: ForecourtRecoverySource,
  ): Promise<void>;
  insertBlessing(input: Readonly<{
    id: string;
    userId: string;
    dayId: string;
    throwId: string;
    locale: ForecourtLocale;
    display: ForecourtBlessing["display"];
    voice: ForecourtVoiceAsset | null;
  }>): Promise<boolean>;
}>;

export type ForecourtDatabase = Readonly<{
  runLocked<T>(
    userId: string,
    operation: (transaction: ForecourtTransaction) => Promise<T>,
  ): Promise<T>;
}>;

export type ForecourtVoiceResolver = (
  locale: ForecourtLocale,
) => ForecourtVoiceAsset | null;

function validatedVoiceAsset(
  value: ForecourtVoiceAsset | null,
  expectedLocale: ForecourtLocale,
): ForecourtVoiceAsset | null {
  if (value === null) return null;
  try {
    const url = new URL(value.url);
    if (
      value.mode !== "asset"
      || value.profileId !== "budai-warm-v1"
      || value.locale !== expectedLocale
      || value.mimeType !== "audio/mpeg"
      || url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.hash !== ""
      || value.url.length > 512
      || !/^[0-9a-f]{64}$/u.test(value.sha256)
      || !Number.isInteger(value.durationMs)
      || value.durationMs < 700
      || value.durationMs > 15_000
    ) return null;
    return Object.freeze({ ...value });
  } catch {
    return null;
  }
}

function semanticHash(secret: string, domain: string, value: unknown): string {
  if (secret.length < 32) throw new Error("forecourt_secret_required");
  return createHmac("sha256", secret)
    .update(`hourkey:shrine:forecourt:${domain}:v1\0`)
    .update(JSON.stringify(value))
    .digest("hex");
}

function prepareSemantic(input: ForecourtPrepareInput): unknown {
  return {
    contentId: input.contentId,
    physicsSchema: input.physicsSchema,
    locale: input.locale,
    origin: input.origin,
    direction: input.direction,
    speed: input.speed,
    angularVelocity: input.angularVelocity,
  };
}

function commitSemantic(input: ForecourtCommitInput): unknown {
  return {
    throwId: input.throwId,
    ticket: input.ticket,
    locale: input.locale,
    impactKind: input.impactKind,
    surfaceId: input.surfaceId,
    contact: input.contact,
    rest: input.rest,
    flightMs: input.flightMs,
    traceHash: input.traceHash,
  };
}

function throwId(): string {
  return `throw_${randomUUID().replaceAll("-", "")}`;
}

function blessingId(): string {
  return `bls_${randomUUID().replaceAll("-", "")}`;
}

function makeTicket(
  secret: string,
  userId: string,
  id: string,
  dayId: string,
  expiresAt: Date,
): string {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`hourkey:forecourt-ticket:v1\0${userId}\0${id}\0${dayId}\0${expires}`)
    .digest("base64url");
  return `ftk_${expires}.${signature}`;
}

function verifyTicket(
  secret: string,
  userId: string,
  authorization: ForecourtAuthorization,
  ticket: string,
  now: Date,
): void {
  const match = /^ftk_([0-9]{10})\.([A-Za-z0-9_-]{43})$/u.exec(ticket);
  if (!match) throw new ForecourtTicketError("forecourt_ticket_invalid");
  const expires = Number(match[1]);
  const expected = makeTicket(
    secret,
    userId,
    authorization.id,
    authorization.dayId,
    authorization.expiresAt,
  );
  const actualBuffer = Buffer.from(ticket);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
    || createHash("sha256").update(ticket).digest("hex") !== authorization.ticketHash
  ) {
    throw new ForecourtTicketError("forecourt_ticket_invalid");
  }
  if (
    expires * 1000 !== authorization.expiresAt.getTime()
    || now.getTime() > authorization.expiresAt.getTime()
  ) {
    throw new ForecourtTicketError("forecourt_ticket_expired");
  }
}

function stateResult(
  cycle: ForecourtCycle,
  projection: ForecourtProjection,
): ForecourtStateResult {
  return Object.freeze({
    ok: true,
    authoritative: true,
    contentId: FORECOURT_CONTENT_ID,
    physicsSchema: FORECOURT_PHYSICS_SCHEMA,
    policyVersion: FORECOURT_POLICY_VERSION,
    nextResetAt: cycle.nextResetAt.toISOString(),
    projection,
  });
}

function projection(cycle: ForecourtCycle, counts: ForecourtCounts): ForecourtProjection {
  const levels = forecourtLevels(counts.lifetimeSuccesses);
  return Object.freeze({
    localDate: cycle.localDate,
    throwsUsed: counts.throwsUsed,
    recoveryEarned: counts.recoveryEarned,
    blessingClaimed: counts.blessingClaimed,
    successes: counts.lifetimeSuccesses,
    lanternLevel: levels.lanternLevel,
    waterLevel: levels.waterLevel,
    lotusLevel: levels.lotusLevel,
  });
}

async function activeCycle(
  tx: ForecourtTransaction,
  userId: string,
): Promise<{ cycle: ForecourtCycle; now: Date }> {
  const now = await tx.now();
  let prior = await tx.latestCycle(userId);
  if (prior !== null && now.getTime() < prior.nextResetAt.getTime()) {
    return { cycle: prior, now };
  }
  const timezone = await tx.userTimezone(userId);
  if (timezone === undefined) throw new ForecourtAccountUnavailable();
  const window = resolveForecourtCycleWindow(
    now,
    timezone,
    prior === null ? null : { nextResetAt: prior.nextResetAt },
  );
  const cycle: ForecourtCycle = Object.freeze({
    id: randomUUID(),
    userId,
    cycleNo: (prior?.cycleNo ?? 0) + 1,
    ...window,
  });
  await tx.insertCycle(cycle);
  prior = cycle;
  return { cycle: prior, now };
}

async function reconcileRecovery(
  tx: ForecourtTransaction,
  userId: string,
  cycle: ForecourtCycle,
  now: Date,
): Promise<void> {
  const counts = await tx.counts(userId, cycle.id);
  if (counts.recoveryEarned || counts.throwsUsed < FORECOURT_BASE_THROWS) return;
  const thirdAt = await tx.thirdAuthorizationAt(userId, cycle.id);
  if (thirdAt === null) return;
  // The award is unlocked only after base throw #3. Its durable ritual may
  // happen earlier in the same cycle (the normal bell/drum-before-Budai flow).
  const source = await tx.qualifyingRecoverySource(userId, cycle.startedAt, now);
  if (source !== null) await tx.insertRecovery(userId, cycle.id, source);
}

export async function getForecourtStateWithDatabase(
  database: ForecourtDatabase,
  userId: string,
): Promise<ForecourtStateResult> {
  return database.runLocked(userId, async (tx) => {
    const { cycle, now } = await activeCycle(tx, userId);
    await reconcileRecovery(tx, userId, cycle, now);
    return stateResult(cycle, projection(cycle, await tx.counts(userId, cycle.id)));
  });
}

export async function prepareForecourtThrowWithDatabase(
  database: ForecourtDatabase,
  userId: string,
  input: ForecourtPrepareInput,
  secret: string,
): Promise<ForecourtPrepareResult> {
  const requestHash = semanticHash(secret, "prepare", prepareSemantic(input));
  return database.runLocked(userId, async (tx) => {
    const replay = await tx.authorizationByPrepareKey(userId, input.idempotencyKey);
    if (replay !== null) {
      if (replay.requestHash !== requestHash) throw new ForecourtIdempotencyConflict();
      const { cycle, now } = await activeCycle(tx, userId);
      await reconcileRecovery(tx, userId, cycle, now);
      const currentState = stateResult(
        cycle,
        projection(cycle, await tx.counts(userId, cycle.id)),
      );
      // The transaction identity stays exact (throw/ticket/ordinal), while the
      // state projection is always reconciled at replay time. Returning the
      // stored projection here can roll a client back to an earlier throw or
      // even to the previous daily cycle.
      return Object.freeze({
        ...replay.resultJson,
        ...currentState,
        replayed: true,
      });
    }
    const { cycle, now } = await activeCycle(tx, userId);
    await reconcileRecovery(tx, userId, cycle, now);
    const before = await tx.counts(userId, cycle.id);
    const limit = before.recoveryEarned ? FORECOURT_MAX_THROWS : FORECOURT_BASE_THROWS;
    if (before.throwsUsed >= limit) {
      throw new ForecourtDailyLimitReached(projection(cycle, before));
    }
    const id = throwId();
    const issuedAt = now;
    const expiresAt = new Date(
      Math.floor((now.getTime() + FORECOURT_TICKET_TTL_MS) / 1000) * 1000,
    );
    const ticket = makeTicket(secret, userId, id, cycle.id, expiresAt);
    const nextCounts: ForecourtCounts = {
      ...before,
      throwsUsed: before.throwsUsed + 1,
    };
    const result: ForecourtPrepareResult = Object.freeze({
      ...stateResult(cycle, projection(cycle, nextCounts)),
      replayed: false,
      throwId: id,
      ordinal: nextCounts.throwsUsed,
      ticket,
      expiresAt: expiresAt.toISOString(),
    });
    const authorization: ForecourtAuthorization = Object.freeze({
      id,
      userId,
      dayId: cycle.id,
      ordinal: nextCounts.throwsUsed,
      requestHash,
      ticketHash: createHash("sha256").update(ticket).digest("hex"),
      issuedAt,
      expiresAt,
      resultJson: result,
    });
    await tx.insertAuthorization({
      authorization,
      idempotencyKey: input.idempotencyKey,
      contentId: input.contentId,
      sceneSha256: FORECOURT_SCENE_SHA256,
      physicsSchema: input.physicsSchema,
      locale: input.locale,
      launchJson: prepareSemantic(input),
    });
    return result;
  });
}

export const FORECOURT_BLESSINGS: Readonly<
  Record<ForecourtLocale, ForecourtBlessing["display"]>
> = {
  th: {
    title: "พรแห่งรอยยิ้มของพระสังกัจจายน์",
    body: "วันนี้เหรียญแตะจุดมงคลเป็นครั้งแรก ขอให้ใช้รอยยิ้มเตือนใจให้เบา วางสิ่งที่หนัก และแบ่งความอิ่มเอมให้คนรอบข้าง",
    footer: "พรนี้เป็นกิจกรรมสะท้อนใจภายในวัด HourKey ไม่ใช่คำรับรองผลในโลกจริง",
  },
  en: {
    title: "Budai's blessing of joyful ease",
    body: "Your coin reached the auspicious point for the first time today. Let the smile remind you to travel lightly, set down what weighs on you, and share contentment with others.",
    footer: "An in-temple HourKey reflection, not a real-world guarantee.",
  },
  zh: {
    title: "布袋和悅之福",
    body: "今日錢幣首次觸及吉點。願此笑容提醒你放下重負，輕心前行，並將知足與喜悅分享於人。",
    footer: "此為 HourKey 寺內反思活動，並非現實世界的保證。",
  },
  cn: {
    title: "布袋和悦之福",
    body: "今日钱币首次触及吉点。愿此笑容提醒你放下重负，轻心前行，并将知足与喜悦分享于人。",
    footer: "此为 HourKey 寺内反思活动，并非现实世界的保证。",
  },
  vi: {
    title: "Phúc an vui của Bố Đại",
    body: "Hôm nay đồng xu lần đầu chạm điểm cát lành. Hãy để nụ cười nhắc bạn bước đi nhẹ lòng, đặt xuống điều nặng trĩu và sẻ chia sự đủ đầy.",
    footer: "Đây là hoạt động chiêm nghiệm trong đền HourKey, không phải bảo đảm ngoài đời.",
  },
  ja: {
    title: "布袋の和やかな祝福",
    body: "今日、硬貨が初めて吉点に触れました。その笑顔を、重荷を下ろし、軽やかに進み、満ち足りた心を分かち合う印としてください。",
    footer: "HourKey寺院内の内省活動であり、現実世界の保証ではありません。",
  },
  ru: {
    title: "Благословение лёгкой радости Будая",
    body: "Сегодня монета впервые коснулась благоприятной точки. Пусть улыбка напомнит идти налегке, отпустить тяжесть и делиться довольством с другими.",
    footer: "Это практика размышления внутри храма HourKey, а не гарантия в реальном мире.",
  },
  ko: {
    title: "포대화상의 온화한 기쁨의 축복",
    body: "오늘 동전이 처음으로 길한 지점에 닿았습니다. 그 미소를 보며 무거운 마음을 내려놓고 가볍게 나아가며 만족을 나누세요.",
    footer: "HourKey 사원 안의 성찰 활동이며 현실의 결과를 보장하지 않습니다.",
  },
  es: {
    title: "Bendición de alegría serena de Budai",
    body: "Hoy la moneda alcanzó por primera vez el punto auspicioso. Que la sonrisa te recuerde caminar con ligereza, soltar el peso y compartir la satisfacción con los demás.",
    footer: "Una reflexión dentro del templo HourKey; no garantiza resultados en el mundo real.",
  },
};

export async function commitForecourtThrowWithDatabase(
  database: ForecourtDatabase,
  userId: string,
  input: ForecourtCommitInput,
  secret: string,
  resolveVoice: ForecourtVoiceResolver = () => null,
): Promise<ForecourtCommitResult> {
  const requestHash = semanticHash(secret, "commit", commitSemantic(input));
  return database.runLocked(userId, async (tx) => {
    const replay = await tx.commitByKey(userId, input.idempotencyKey);
    if (replay !== null) {
      if (replay.requestHash !== requestHash) throw new ForecourtIdempotencyConflict();
      const { cycle, now } = await activeCycle(tx, userId);
      await reconcileRecovery(tx, userId, cycle, now);
      const currentState = stateResult(
        cycle,
        projection(cycle, await tx.counts(userId, cycle.id)),
      );
      // Preserve the committed outcome/blessing, but never let an exact
      // idempotent replay overwrite a newer authoritative projection.
      return Object.freeze({
        ...replay.resultJson,
        ...currentState,
        replayed: true,
      });
    }
    if (await tx.commitByThrow(userId, input.throwId) !== null) {
      throw new ForecourtThrowConflict();
    }
    const authorization = await tx.authorizationById(userId, input.throwId);
    if (authorization === null) throw new ForecourtThrowConflict("forecourt_throw_not_found");
    const now = await tx.now();
    verifyTicket(secret, userId, authorization, input.ticket, now);
    validateForecourtImpact(input);
    const cycle = await tx.latestCycle(userId);
    if (cycle === null || cycle.id !== authorization.dayId) {
      throw new ForecourtThrowConflict("forecourt_throw_cycle_closed");
    }

    const before = await tx.counts(userId, cycle.id);
    let blessing: ForecourtBlessing | null = null;
    if (input.impactKind === "Navel" && !before.blessingClaimed) {
      let voice: ForecourtVoiceAsset | null = null;
      try {
        voice = validatedVoiceAsset(resolveVoice(input.locale), input.locale);
      } catch {
        // Voice is optional presentation. The committed game result must survive.
      }
      const newBlessingId = blessingId();
      const inserted = await tx.insertBlessing({
        id: newBlessingId,
        userId,
        dayId: cycle.id,
        throwId: authorization.id,
        locale: input.locale,
        display: FORECOURT_BLESSINGS[input.locale],
        voice,
      });
      if (inserted) {
        blessing = Object.freeze({
          blessingId: newBlessingId,
          resultCode: "forecourt-first-daily-navel-v1",
          presentationCode: "budai.gold-water-lotus",
          display: Object.freeze({ ...FORECOURT_BLESSINGS[input.locale] }),
          voice,
        });
      }
    }

    const nextCounts: ForecourtCounts = {
      ...before,
      lifetimeSuccesses: before.lifetimeSuccesses
        + (input.impactKind === "Navel" ? 1 : 0),
      blessingClaimed: before.blessingClaimed || blessing !== null,
    };
    const result: ForecourtCommitResult = Object.freeze({
      ...stateResult(cycle, projection(cycle, nextCounts)),
      replayed: false,
      throwId: authorization.id,
      impactKind: input.impactKind,
      blessing,
    });
    await tx.insertCommit({
      userId,
      dayId: cycle.id,
      throwId: authorization.id,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      locale: input.locale,
      reportedImpact: input.impactKind,
      authoritativeImpact: input.impactKind,
      surfaceId: input.surfaceId,
      evidenceJson: {
        contact: input.contact,
        rest: input.rest,
        flightMs: input.flightMs,
        traceHash: input.traceHash,
      },
      resultJson: result,
    });
    return result;
  });
}

function rowDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("forecourt_invalid_database_time");
  return date;
}

function cycleRow(row: Readonly<Record<string, unknown>>): ForecourtCycle {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    cycleNo: Number(row.cycle_no),
    localDate: String(row.local_day),
    timezoneName: String(row.timezone_name),
    utcOffsetMinutes: Number(row.utc_offset_minutes),
    startedAt: rowDate(row.started_at),
    nextResetAt: rowDate(row.next_reset_at),
  };
}

/** PostgreSQL adapter. The service above is also exercised against a locked
 * in-memory adapter, so quota/concurrency behavior is not coupled to mocks. */
export const productionForecourtDatabase: ForecourtDatabase = {
  async runLocked<T>(userId: string, operation: (tx: ForecourtTransaction) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 195046))",
        [userId],
      );
      const tx: ForecourtTransaction = {
        async now() {
          const result = await client.query("SELECT now() AS now");
          return rowDate(result.rows[0]?.now);
        },
        async userTimezone(id) {
          const result = await client.query(
            "SELECT timezone FROM users WHERE id=$1 AND deleted_at IS NULL AND is_active=true",
            [id],
          );
          return result.rows[0] ? (result.rows[0].timezone as string | null) : undefined;
        },
        async latestCycle(id) {
          const result = await client.query(
            `SELECT id,user_id,cycle_no,local_day,timezone_name,utc_offset_minutes,
                    started_at,next_reset_at
               FROM shrine_forecourt_daily_cycles
              WHERE user_id=$1 ORDER BY cycle_no DESC LIMIT 1`,
            [id],
          );
          return result.rows[0] ? cycleRow(result.rows[0]) : null;
        },
        async insertCycle(cycle) {
          await client.query(
            `INSERT INTO shrine_forecourt_daily_cycles
               (id,user_id,cycle_no,local_day,timezone_name,utc_offset_minutes,
                started_at,next_reset_at,policy_version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [cycle.id, cycle.userId, cycle.cycleNo, cycle.localDate,
              cycle.timezoneName, cycle.utcOffsetMinutes, cycle.startedAt,
              cycle.nextResetAt, FORECOURT_POLICY_VERSION],
          );
        },
        async authorizationByPrepareKey(id, key) {
          const result = await client.query(
            `SELECT request_hash,result_json FROM shrine_forecourt_throw_authorizations
              WHERE user_id=$1 AND idempotency_key=$2`,
            [id, key],
          );
          return result.rows[0]
            ? { requestHash: result.rows[0].request_hash, resultJson: result.rows[0].result_json }
            : null;
        },
        async authorizationById(id, throwIdentifier) {
          const result = await client.query(
            `SELECT id,user_id,day_id,ordinal,request_hash,ticket_hash,issued_at,
                    expires_at,result_json
               FROM shrine_forecourt_throw_authorizations
              WHERE user_id=$1 AND id=$2`,
            [id, throwIdentifier],
          );
          const row = result.rows[0];
          return row ? {
            id: row.id,
            userId: row.user_id,
            dayId: row.day_id,
            ordinal: Number(row.ordinal),
            requestHash: row.request_hash,
            ticketHash: row.ticket_hash,
            issuedAt: rowDate(row.issued_at),
            expiresAt: rowDate(row.expires_at),
            resultJson: row.result_json,
          } : null;
        },
        async insertAuthorization(value) {
          const a = value.authorization;
          await client.query(
            `INSERT INTO shrine_forecourt_throw_authorizations
               (id,user_id,day_id,ordinal,idempotency_key,request_hash,ticket_hash,
                content_id,scene_sha256,physics_schema,locale,launch_json,
                issued_at,expires_at,result_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb)`,
            [a.id, a.userId, a.dayId, a.ordinal, value.idempotencyKey,
              a.requestHash, a.ticketHash, value.contentId, value.sceneSha256,
              value.physicsSchema, value.locale, JSON.stringify(value.launchJson),
              a.issuedAt, a.expiresAt, JSON.stringify(a.resultJson)],
          );
        },
        async commitByKey(id, key) {
          const result = await client.query(
            `SELECT request_hash,result_json FROM shrine_forecourt_throw_commits
              WHERE user_id=$1 AND idempotency_key=$2`,
            [id, key],
          );
          return result.rows[0]
            ? { requestHash: result.rows[0].request_hash, resultJson: result.rows[0].result_json }
            : null;
        },
        async commitByThrow(id, throwIdentifier) {
          const result = await client.query(
            `SELECT request_hash,result_json FROM shrine_forecourt_throw_commits
              WHERE user_id=$1 AND throw_id=$2`,
            [id, throwIdentifier],
          );
          return result.rows[0]
            ? { requestHash: result.rows[0].request_hash, resultJson: result.rows[0].result_json }
            : null;
        },
        async insertCommit(value) {
          await client.query(
            `INSERT INTO shrine_forecourt_throw_commits
               (user_id,day_id,throw_id,idempotency_key,request_hash,locale,
                reported_impact,authoritative_impact,surface_id,evidence_json,result_json)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
            [value.userId, value.dayId, value.throwId, value.idempotencyKey,
              value.requestHash, value.locale, value.reportedImpact,
              value.authoritativeImpact, value.surfaceId,
              JSON.stringify(value.evidenceJson), JSON.stringify(value.resultJson)],
          );
        },
        async counts(id, dayId) {
          const result = await client.query(
            `SELECT
               (SELECT count(*)::int FROM shrine_forecourt_throw_authorizations
                 WHERE user_id=$1 AND day_id=$2) AS throws_used,
               (SELECT count(*)::int FROM shrine_forecourt_throw_commits
                 WHERE user_id=$1 AND authoritative_impact='Navel') AS lifetime_successes,
               EXISTS(SELECT 1 FROM shrine_forecourt_recovery_awards
                 WHERE user_id=$1 AND day_id=$2) AS recovery_earned,
               EXISTS(SELECT 1 FROM shrine_forecourt_blessings
                 WHERE user_id=$1 AND day_id=$2) AS blessing_claimed`,
            [id, dayId],
          );
          const row = result.rows[0];
          return {
            throwsUsed: Number(row.throws_used),
            lifetimeSuccesses: Number(row.lifetime_successes),
            recoveryEarned: row.recovery_earned === true,
            blessingClaimed: row.blessing_claimed === true,
          };
        },
        async thirdAuthorizationAt(id, dayId) {
          const result = await client.query(
            `SELECT issued_at FROM shrine_forecourt_throw_authorizations
              WHERE user_id=$1 AND day_id=$2 AND ordinal=3`,
            [id, dayId],
          );
          return result.rows[0] ? rowDate(result.rows[0].issued_at) : null;
        },
        async qualifyingRecoverySource(id, notBefore, before) {
          const result = await client.query(
            `SELECT id,ritual_id FROM shrine_hourkey_ritual_results
              WHERE user_id=$1
                AND (
                  (ritual_id='forecourt-bell' AND result_code='forecourt-bell-rung')
                  OR (ritual_id='forecourt-drum' AND result_code='forecourt-drum-struck')
                  OR (ritual_id='east-garden-wish-tie' AND result_code='east-garden-wish-tied')
                )
                AND created_at >= $2 AND created_at <= $3
              ORDER BY created_at,id LIMIT 1`,
            [id, notBefore, before],
          );
          return result.rows[0]
            ? { id: result.rows[0].id, ritualId: result.rows[0].ritual_id }
            : null;
        },
        async insertRecovery(id, dayId, source) {
          await client.query(
            `INSERT INTO shrine_forecourt_recovery_awards
               (user_id,day_id,source_result_id,source_ritual_id)
             VALUES ($1,$2,$3,$4) ON CONFLICT (day_id) DO NOTHING`,
            [id, dayId, source.id, source.ritualId],
          );
        },
        async insertBlessing(value) {
          const result = await client.query(
            `INSERT INTO shrine_forecourt_blessings
               (id,user_id,day_id,throw_id,locale,result_code,display_json,voice_json)
             VALUES ($1,$2,$3,$4,$5,'forecourt-first-daily-navel-v1',$6::jsonb,$7::jsonb)
             ON CONFLICT (day_id) DO NOTHING RETURNING id`,
            [value.id, value.userId, value.dayId, value.throwId, value.locale,
              JSON.stringify(value.display), JSON.stringify(value.voice)],
          );
          return result.rowCount === 1;
        },
      };
      const value = await operation(tx);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
};

export function controlledForecourtVoiceAsset(
  localeValue: ForecourtLocale,
): ForecourtVoiceAsset | null {
  const raw = String(process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL || "").trim();
  const suffix = localeValue.toUpperCase();
  const sha256 = String(
    process.env[`SHRINE_FORECOURT_BUDAI_VOICE_SHA256_${suffix}`] || "",
  ).trim();
  const durationMs = Number(
    process.env[`SHRINE_FORECOURT_BUDAI_VOICE_DURATION_MS_${suffix}`],
  );
  if (
    !raw
    || !/^[0-9a-f]{64}$/u.test(sha256)
    || !Number.isInteger(durationMs)
    || durationMs < 700
    || durationMs > 15_000
  ) return null;
  try {
    const base = new URL(raw.endsWith("/") ? raw : `${raw}/`);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
      return null;
    }
    const url = new URL(`forecourt-first-daily-navel-v1-${localeValue}.mp3`, base);
    if (url.origin !== base.origin) return null;
    return Object.freeze({
      mode: "asset",
      profileId: "budai-warm-v1",
      locale: localeValue,
      mimeType: "audio/mpeg",
      url: url.toString(),
      sha256,
      durationMs,
    });
  } catch {
    return null;
  }
}

export function getForecourtState(userId: string): Promise<ForecourtStateResult> {
  return getForecourtStateWithDatabase(productionForecourtDatabase, userId);
}

export function prepareForecourtThrow(
  userId: string,
  input: ForecourtPrepareInput,
  secret: string,
): Promise<ForecourtPrepareResult> {
  return prepareForecourtThrowWithDatabase(
    productionForecourtDatabase,
    userId,
    input,
    secret,
  );
}

export function commitForecourtThrow(
  userId: string,
  input: ForecourtCommitInput,
  secret: string,
): Promise<ForecourtCommitResult> {
  return commitForecourtThrowWithDatabase(
    productionForecourtDatabase,
    userId,
    input,
    secret,
    (localeValue) => controlledForecourtVoiceAsset(localeValue),
  );
}
