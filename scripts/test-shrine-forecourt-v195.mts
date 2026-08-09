import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORECOURT_CONTENT_ID,
  FORECOURT_BLESSINGS,
  FORECOURT_PHYSICS_SCHEMA,
  FORECOURT_SCENE_SHA256,
  ForecourtDailyLimitReached,
  ForecourtIdempotencyConflict,
  ForecourtImpactError,
  ForecourtInputError,
  ForecourtPrepareReplayRejected,
  ForecourtThrowConflict,
  ForecourtTicketError,
  commitForecourtThrowWithDatabase,
  controlledForecourtVoiceAsset,
  forecourtLevels,
  getForecourtStateWithDatabase,
  parseForecourtCommitInput,
  parseForecourtPrepareInput,
  prepareForecourtThrowWithDatabase,
  resolveForecourtCycleWindow,
  validateForecourtImpact,
  type ForecourtAuthorization,
  type ForecourtCommitInput,
  type ForecourtCommitReplay,
  type ForecourtCounts,
  type ForecourtCycle,
  type ForecourtDatabase,
  type ForecourtPrepareInput,
  type ForecourtPrepareResult,
  type ForecourtRecoverySource,
  type ForecourtTransaction,
  type ForecourtVoiceAsset,
} from "../src/lib/shrine-forecourt-v195";
import {
  FORECOURT_MAX_BODY_BYTES,
  assertForecourtStateQuery,
  forecourtDisabledResponse,
  readForecourtJsonBody,
} from "../src/lib/shrine-forecourt-route";

const secret = "forecourt-v195-test-authority-secret-value";
const U1 = "00000000-0000-4000-8000-000000000101";
const U2 = "00000000-0000-4000-8000-000000000102";

function hex(index: number): string {
  return index.toString(16).padStart(32, "0");
}

function rawPrepare(index: number, overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: `foreprep_${hex(index)}`,
    content_id: FORECOURT_CONTENT_ID,
    physics_schema: FORECOURT_PHYSICS_SCHEMA,
    locale: "th",
    origin: { x: 5.58, y: 1.18, z: 23.24 },
    direction: { x: 0.91356, y: 0.3, z: 0.2746 },
    speed: 6.4,
    angular_velocity: { x: 4, y: -2, z: 1 },
    ...overrides,
  };
}

function rawCommit(
  index: number,
  prepared: ForecourtPrepareResult,
  overrides: Record<string, unknown> = {},
) {
  return {
    idempotency_key: `forecommit_${hex(index)}`,
    throw_id: prepared.throwId,
    ticket: prepared.ticket,
    locale: "th",
    impact_kind: "Navel",
    surface_id: "budai.navel",
    contact: { x: 0.01, y: 0.01, z: 0.01 },
    rest: { x: 0, y: 0.2, z: 5 },
    flight_ms: 900,
    trace_hash: "a".repeat(64),
    ...overrides,
  };
}

type StoredAuthorization = Readonly<{
  authorization: ForecourtAuthorization;
  idempotencyKey: string;
  launchJson: unknown;
}>;
type StoredCommit = Readonly<{
  userId: string;
  dayId: string;
  throwId: string;
  idempotencyKey: string;
  requestHash: string;
  authoritativeImpact: string;
  resultJson: ForecourtCommitReplay["resultJson"];
}>;
type RitualRow = Readonly<{
  id: string;
  userId: string;
  ritualId: string;
  createdAt: Date;
}>;

class MemoryForecourtDatabase implements ForecourtDatabase {
  clock = new Date("2026-08-09T04:00:00.000Z");
  readonly timezones = new Map<string, string | null>([[U1, "Asia/Bangkok"], [U2, "UTC"]]);
  cycles = new Map<string, ForecourtCycle[]>();
  authorizations: StoredAuthorization[] = [];
  commits: StoredCommit[] = [];
  recoveries: Array<Readonly<{ userId: string; dayId: string; source: ForecourtRecoverySource }>> = [];
  blessings: Array<Readonly<{ userId: string; dayId: string; throwId: string }>> = [];
  rituals: RitualRow[] = [];
  private readonly locks = new Map<string, Promise<void>>();

  async runLocked<T>(
    userId: string,
    operation: (transaction: ForecourtTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const current = previous.then(() => gate);
    this.locks.set(userId, current);
    await previous;
    const snapshot = structuredClone({
      cycles: [...this.cycles],
      authorizations: this.authorizations,
      commits: this.commits,
      recoveries: this.recoveries,
      blessings: this.blessings,
    });
    try {
      return await operation(this.transaction());
    } catch (error) {
      this.cycles = new Map(snapshot.cycles);
      this.authorizations = snapshot.authorizations;
      this.commits = snapshot.commits;
      this.recoveries = snapshot.recoveries;
      this.blessings = snapshot.blessings;
      throw error;
    } finally {
      release();
      if (this.locks.get(userId) === current) this.locks.delete(userId);
    }
  }

  private transaction(): ForecourtTransaction {
    return {
      now: async () => new Date(this.clock),
      userTimezone: async (userId) => this.timezones.get(userId),
      latestCycle: async (userId) => this.cycles.get(userId)?.at(-1) ?? null,
      insertCycle: async (cycle) => {
        const rows = this.cycles.get(cycle.userId) ?? [];
        if (rows.some((row) => row.id === cycle.id || row.cycleNo === cycle.cycleNo)) {
          throw new Error("cycle_unique_violation");
        }
        this.cycles.set(cycle.userId, [...rows, cycle]);
      },
      authorizationByPrepareKey: async (userId, key) => {
        const row = this.authorizations.find(
          (item) => item.authorization.userId === userId && item.idempotencyKey === key,
        );
        return row ? {
          dayId: row.authorization.dayId,
          requestHash: row.authorization.requestHash,
          resultJson: row.authorization.resultJson,
        } : null;
      },
      authorizationById: async (userId, id) =>
        this.authorizations.find(
          (item) => item.authorization.userId === userId && item.authorization.id === id,
        )?.authorization ?? null,
      insertAuthorization: async (value) => {
        if (value.contentId !== FORECOURT_CONTENT_ID) throw new Error("content_pin");
        if (value.sceneSha256 !== FORECOURT_SCENE_SHA256) throw new Error("scene_pin");
        if (value.physicsSchema !== FORECOURT_PHYSICS_SCHEMA) throw new Error("physics_pin");
        const a = value.authorization;
        if (this.authorizations.some((row) =>
          (row.authorization.userId === a.userId && row.idempotencyKey === value.idempotencyKey)
          || (row.authorization.dayId === a.dayId && row.authorization.ordinal === a.ordinal)
        )) throw new Error("authorization_unique_violation");
        this.authorizations.push({
          authorization: a,
          idempotencyKey: value.idempotencyKey,
          launchJson: value.launchJson,
        });
      },
      commitByKey: async (userId, key) => {
        const row = this.commits.find(
          (item) => item.userId === userId && item.idempotencyKey === key,
        );
        return row ? { requestHash: row.requestHash, resultJson: row.resultJson } : null;
      },
      commitByThrow: async (userId, throwId) => {
        const row = this.commits.find(
          (item) => item.userId === userId && item.throwId === throwId,
        );
        return row ? { requestHash: row.requestHash, resultJson: row.resultJson } : null;
      },
      insertCommit: async (value) => {
        if (this.commits.some((row) =>
          row.throwId === value.throwId
          || (row.userId === value.userId && row.idempotencyKey === value.idempotencyKey)
        )) throw new Error("commit_unique_violation");
        this.commits.push({ ...value });
      },
      counts: async (userId, dayId): Promise<ForecourtCounts> => ({
        throwsUsed: this.authorizations.filter(
          (row) => row.authorization.userId === userId && row.authorization.dayId === dayId,
        ).length,
        lifetimeSuccesses: this.commits.filter(
          (row) => row.userId === userId && row.authoritativeImpact === "Navel",
        ).length,
        recoveryEarned: this.recoveries.some(
          (row) => row.userId === userId && row.dayId === dayId,
        ),
        blessingClaimed: this.blessings.some(
          (row) => row.userId === userId && row.dayId === dayId,
        ),
      }),
      thirdAuthorizationAt: async (userId, dayId) =>
        this.authorizations.find(
          (row) => row.authorization.userId === userId
            && row.authorization.dayId === dayId
            && row.authorization.ordinal === 3,
        )?.authorization.issuedAt ?? null,
      qualifyingRecoverySource: async (userId, notBefore, before) => {
        const eligible = new Set([
          "forecourt-bell", "forecourt-drum", "east-garden-wish-tie",
        ]);
        const row = this.rituals
          .filter((item) => item.userId === userId
            && eligible.has(item.ritualId)
            && item.createdAt >= notBefore
            && item.createdAt <= before)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        return row ? { id: row.id, ritualId: row.ritualId } : null;
      },
      insertRecovery: async (userId, dayId, source) => {
        if (this.recoveries.some((row) => row.dayId === dayId || row.source.id === source.id)) return;
        const sourceRow = this.rituals.find(
          (row) => row.id === source.id && row.userId === userId && row.ritualId === source.ritualId,
        );
        if (!sourceRow) throw new Error("recovery_owner_violation");
        this.recoveries.push({ userId, dayId, source });
      },
      insertBlessing: async (value) => {
        if (this.blessings.some((row) => row.dayId === value.dayId)) return false;
        this.blessings.push({
          userId: value.userId,
          dayId: value.dayId,
          throwId: value.throwId,
        });
        return true;
      },
    };
  }
}

// Exact input contracts, finite bounds, capability pins and coordinate frames.
const validPrepare = parseForecourtPrepareInput(rawPrepare(1));
assert.equal(validPrepare.contentId, FORECOURT_CONTENT_ID);
assert.throws(() => parseForecourtPrepareInput({ ...rawPrepare(1), extra: true }), ForecourtInputError);
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, { speed: Number.NaN })), ForecourtInputError);
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, { content_id: "mainhall-next" })));
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, {
  direction: { x: 0, y: 0, z: 1 },
})), /invalid_direction/u);
for (const origin of [
  { x: 5.5199, y: 1.18, z: 23.24 },
  { x: 5.6401, y: 1.18, z: 23.24 },
  { x: 5.58, y: 1.1199, z: 23.24 },
  { x: 5.58, y: 1.2401, z: 23.24 },
  { x: 5.58, y: 1.18, z: 23.1799 },
  { x: 5.58, y: 1.18, z: 23.3001 },
]) {
  assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, { origin })), /invalid_origin/u);
}
for (const origin of [
  { x: 5.52, y: 1.12, z: 23.18 },
  { x: 5.64, y: 1.24, z: 23.30 },
]) {
  assert.doesNotThrow(() => parseForecourtPrepareInput(rawPrepare(1, { origin })));
}
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, {
  direction: { x: 0, y: 0.3, z: 0.9539392014 },
})), /invalid_direction/u);
function directionAt(horizontalDegrees: number) {
  const horizontal = Math.sqrt(1 - 0.3 ** 2);
  const center = Math.atan2(0.28786, 0.95767);
  const angle = center + horizontalDegrees * Math.PI / 180;
  return { x: horizontal * Math.cos(angle), y: 0.3, z: horizontal * Math.sin(angle) };
}
assert.doesNotThrow(() => parseForecourtPrepareInput(rawPrepare(1, {
  direction: directionAt(34.9), speed: 4.2,
})));
assert.doesNotThrow(() => parseForecourtPrepareInput(rawPrepare(1, {
  direction: directionAt(-34.9), speed: 9,
})));
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, {
  direction: directionAt(35.1),
})), /invalid_direction/u);
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, { speed: 4.1999 })), /invalid_speed/u);
assert.throws(() => parseForecourtPrepareInput(rawPrepare(1, { speed: 9.0001 })), /invalid_speed/u);
for (const display of Object.values(FORECOURT_BLESSINGS)) {
  assert.ok([...display.title].length > 0 && [...display.title].length <= 120);
  assert.ok([...display.body].length > 0 && [...display.body].length <= 360);
  assert.ok([...display.footer].length > 0 && [...display.footer].length <= 180);
}

const queryUrl = `https://hourkey.invalid/api/mobile/v1/shrine/forecourt/state?content_id=${FORECOURT_CONTENT_ID}&physics_schema=${FORECOURT_PHYSICS_SCHEMA}`;
assert.doesNotThrow(() => assertForecourtStateQuery(new Request(queryUrl)));
assert.throws(() => assertForecourtStateQuery(new Request(`${queryUrl}&extra=1`)), /invalid_query/u);
assert.throws(() => assertForecourtStateQuery(new Request(`${queryUrl}&content_id=x`)), /invalid_query/u);
await assert.rejects(
  readForecourtJsonBody(new Request("https://hourkey.invalid", {
    method: "POST",
    body: "x".repeat(FORECOURT_MAX_BODY_BYTES + 1),
  })),
  /invalid_body_size/u,
);
const priorFlag = process.env.SHRINE_FORECOURT_V195_ENABLED;
delete process.env.SHRINE_FORECOURT_V195_ENABLED;
assert.equal(forecourtDisabledResponse()?.status, 503);
process.env.SHRINE_FORECOURT_V195_ENABLED = "1";
assert.equal(forecourtDisabledResponse(), null);
if (priorFlag === undefined) delete process.env.SHRINE_FORECOURT_V195_ENABLED;
else process.env.SHRINE_FORECOURT_V195_ENABLED = priorFlag;

const fakePrepared: ForecourtPrepareResult = {
  ok: true,
  authoritative: true,
  contentId: FORECOURT_CONTENT_ID,
  physicsSchema: FORECOURT_PHYSICS_SCHEMA,
  policyVersion: "forecourt-authority-v1",
  nextResetAt: "2026-08-10T00:00:00.000Z",
  projection: {
    localDate: "2026-08-09", throwsUsed: 1, recoveryEarned: false,
    blessingClaimed: false, successes: 0, lanternLevel: 0, waterLevel: 0, lotusLevel: 0,
  },
  replayed: false,
  throwId: `throw_${hex(1)}`,
  ordinal: 1,
  ticket: `ftk_1780000000.${"a".repeat(43)}`,
  expiresAt: "2026-08-09T04:15:00.000Z",
};
assert.throws(
  () => parseForecourtCommitInput(rawCommit(1, fakePrepared, { flight_ms: 7001 })),
  /invalid_flight_ms/u,
);
assert.doesNotThrow(() => parseForecourtCommitInput(rawCommit(1, fakePrepared, { flight_ms: 1 })));
assert.doesNotThrow(() => parseForecourtCommitInput(rawCommit(1, fakePrepared, { flight_ms: 7000 })));
assert.throws(
  () => parseForecourtCommitInput(rawCommit(1, fakePrepared, { surface_id: "BudaiNavelTarget" })),
  /invalid_surface_id/u,
);
const badNavel = parseForecourtCommitInput(rawCommit(1, fakePrepared, {
  contact: { x: 0.19, y: 0, z: 0 },
}));
assert.throws(() => validateForecourtImpact(badNavel), ForecourtImpactError);
for (const [impact_kind, surface_id] of [
  ["Navel", "budai.navel"],
  ["Budai", "budai.body"],
  ["Stone", "basin.stone"],
  ["Water", "basin.water"],
  ["Ground", "forecourt.ground"],
] as const) {
  assert.doesNotThrow(() => validateForecourtImpact(parseForecourtCommitInput(
    rawCommit(1, fakePrepared, { impact_kind, surface_id }),
  )));
}

// Timezone is server-derived, frozen during a live cycle, and every reset is >=20h.
const bangkok = resolveForecourtCycleWindow(new Date("2026-08-09T18:00:00Z"), "Asia/Bangkok");
assert.equal(bangkok.localDate, "2026-08-10");
assert.ok(bangkok.nextResetAt.getTime() - bangkok.startedAt.getTime() >= 20 * 60 * 60_000);
for (const at of ["2026-03-08T07:00:00Z", "2026-11-01T07:00:00Z"]) {
  const dst = resolveForecourtCycleWindow(new Date(at), "America/New_York");
  assert.ok(dst.nextResetAt.getTime() - dst.startedAt.getTime() >= 20 * 60 * 60_000);
}

// Same-owner lock makes exactly three base ordinals durable under concurrency.
const db = new MemoryForecourtDatabase();
const concurrent = await Promise.all([1, 2, 3].map((index) =>
  prepareForecourtThrowWithDatabase(
    db,
    U1,
    parseForecourtPrepareInput(rawPrepare(index)),
    secret,
  )
));
assert.deepEqual(concurrent.map((row) => row.ordinal).sort(), [1, 2, 3]);
assert.equal(db.authorizations.length, 3);
const replayPrepare = await prepareForecourtThrowWithDatabase(db, U1, validPrepare, secret);
assert.equal(replayPrepare.replayed, true);
assert.equal(replayPrepare.throwId, concurrent[0].throwId);
await assert.rejects(
  prepareForecourtThrowWithDatabase(
    db,
    U1,
    parseForecourtPrepareInput(rawPrepare(1, { speed: 6.5 })),
    secret,
  ),
  ForecourtIdempotencyConflict,
);
await assert.rejects(
  prepareForecourtThrowWithDatabase(
    db,
    U1,
    parseForecourtPrepareInput(rawPrepare(4)),
    secret,
  ),
  ForecourtDailyLimitReached,
);

// Recovery only follows base #3 and an eligible same-owner durable ritual in this cycle.
const preThirdDb = new MemoryForecourtDatabase();
await getForecourtStateWithDatabase(preThirdDb, U1);
preThirdDb.clock = new Date("2026-08-09T04:00:10.000Z");
preThirdDb.rituals.push({
  id: "00000000-0000-4000-8000-000000000200",
  userId: U1,
  ritualId: "forecourt-bell",
  createdAt: preThirdDb.clock,
});
for (const index of [51, 52]) {
  await prepareForecourtThrowWithDatabase(
    preThirdDb, U1, parseForecourtPrepareInput(rawPrepare(index)), secret,
  );
}
assert.equal((await getForecourtStateWithDatabase(preThirdDb, U1)).projection.recoveryEarned, false);
const thirdUnlocked = await prepareForecourtThrowWithDatabase(
  preThirdDb, U1, parseForecourtPrepareInput(rawPrepare(53)), secret,
);
assert.equal(thirdUnlocked.ordinal, 3);
assert.equal(
  thirdUnlocked.projection.recoveryEarned,
  true,
  "throw #3 unlocks an already-earned recovery in its own response",
);
assert.equal(thirdUnlocked.projection.throwsUsed, 3);
const fourthWithoutRefresh = await prepareForecourtThrowWithDatabase(
  preThirdDb, U1, parseForecourtPrepareInput(rawPrepare(54)), secret,
);
assert.equal(fourthWithoutRefresh.ordinal, 4, "throw #4 is available without GET/re-enter");
assert.equal(preThirdDb.recoveries.length, 1);
const replayUnlockedThird = await prepareForecourtThrowWithDatabase(
  preThirdDb, U1, parseForecourtPrepareInput(rawPrepare(53)), secret,
);
assert.equal(replayUnlockedThird.replayed, true);
assert.equal(replayUnlockedThird.throwId, thirdUnlocked.throwId);
assert.equal(replayUnlockedThird.projection.recoveryEarned, true);
assert.equal(replayUnlockedThird.projection.throwsUsed, 4);
assert.equal(preThirdDb.authorizations.length, 4, "replay burns no fifth ordinal");
assert.equal(preThirdDb.recoveries.length, 1, "replay cannot duplicate recovery");

// Commit is a second authoritative reconciliation point when the eligible
// activity becomes durable after prepare #3 but before its physical outcome.
const commitRecoveryDb = new MemoryForecourtDatabase();
await getForecourtStateWithDatabase(commitRecoveryDb, U1);
const commitRecoveryPrepares: ForecourtPrepareResult[] = [];
for (const index of [61, 62, 63]) {
  commitRecoveryPrepares.push(await prepareForecourtThrowWithDatabase(
    commitRecoveryDb,
    U1,
    parseForecourtPrepareInput(rawPrepare(index)),
    secret,
  ));
}
const commitRecoveryThird = commitRecoveryPrepares[2];
assert.equal(commitRecoveryThird.projection.recoveryEarned, false);
commitRecoveryDb.clock = new Date(commitRecoveryDb.clock.getTime() + 1_000);
commitRecoveryDb.rituals.push({
  id: "00000000-0000-4000-8000-000000000204",
  userId: U1,
  ritualId: "forecourt-drum",
  createdAt: commitRecoveryDb.clock,
});
const commitUnlocked = await commitForecourtThrowWithDatabase(
  commitRecoveryDb,
  U1,
  parseForecourtCommitInput(rawCommit(63, commitRecoveryThird)),
  secret,
);
assert.equal(
  commitUnlocked.projection.recoveryEarned,
  true,
  "commit response exposes a recovery earned after prepare #3",
);
assert.equal(commitUnlocked.projection.throwsUsed, 3);
const commitRecoveryFourth = await prepareForecourtThrowWithDatabase(
  commitRecoveryDb,
  U1,
  parseForecourtPrepareInput(rawPrepare(64)),
  secret,
);
assert.equal(commitRecoveryFourth.ordinal, 4);
assert.equal(commitRecoveryDb.recoveries.length, 1);

db.clock = new Date("2026-08-09T04:01:00.000Z");
db.rituals.push(
  { id: "00000000-0000-4000-8000-000000000201", userId: U2, ritualId: "forecourt-bell", createdAt: db.clock },
  { id: "00000000-0000-4000-8000-000000000202", userId: U1, ritualId: "TreeCare", createdAt: db.clock },
);
assert.equal((await getForecourtStateWithDatabase(db, U1)).projection.recoveryEarned, false);
db.rituals.push({
  id: "00000000-0000-4000-8000-000000000203",
  userId: U1,
  ritualId: "east-garden-wish-tie",
  createdAt: db.clock,
});
const recovered = await getForecourtStateWithDatabase(db, U1);
assert.equal(recovered.projection.recoveryEarned, true);
assert.equal(db.recoveries.length, 1);
const fourth = await prepareForecourtThrowWithDatabase(
  db,
  U1,
  parseForecourtPrepareInput(rawPrepare(4)),
  secret,
);
assert.equal(fourth.ordinal, 4);
await assert.rejects(
  prepareForecourtThrowWithDatabase(db, U1, parseForecourtPrepareInput(rawPrepare(5)), secret),
  ForecourtDailyLimitReached,
);

// Commit validates ownership, ticket, surface semantics and exact replays.
const commitDb = new MemoryForecourtDatabase();
const p1 = await prepareForecourtThrowWithDatabase(
  commitDb, U1, parseForecourtPrepareInput(rawPrepare(11)), secret,
);
const c1Input = parseForecourtCommitInput(rawCommit(11, p1));
await assert.rejects(
  commitForecourtThrowWithDatabase(commitDb, U2, c1Input, secret),
  ForecourtThrowConflict,
);
const voice: ForecourtVoiceAsset = {
  mode: "asset",
  profileId: "budai-warm-v1",
  locale: "th",
  mimeType: "audio/mpeg",
  url: "https://assets.hourkey.io/budai/forecourt-first-daily-navel-v1-th.mp3",
  sha256: "b".repeat(64),
  durationMs: 8_200,
};
const c1 = await commitForecourtThrowWithDatabase(commitDb, U1, c1Input, secret, () => voice);
assert.equal(c1.blessing?.voice?.profileId, "budai-warm-v1");
assert.equal(c1.blessing?.voice?.sha256, "b".repeat(64));
assert.match(c1.blessing?.blessingId ?? "", /^bls_[0-9a-f]{32}$/u);
assert.equal(c1.blessing?.presentationCode, "budai.gold-water-lotus");
assert.equal(c1.projection.successes, 1);
assert.equal(c1.projection.blessingClaimed, true);
const c1Replay = await commitForecourtThrowWithDatabase(commitDb, U1, c1Input, secret);
assert.equal(c1Replay.replayed, true);
assert.deepEqual(c1Replay.blessing, c1.blessing);
await assert.rejects(
  commitForecourtThrowWithDatabase(
    commitDb,
    U1,
    parseForecourtCommitInput(rawCommit(11, p1, { rest: { x: 1, y: 0.2, z: 5 } })),
    secret,
  ),
  ForecourtIdempotencyConflict,
);
await assert.rejects(
  commitForecourtThrowWithDatabase(
    commitDb,
    U1,
    parseForecourtCommitInput(rawCommit(12, p1)),
    secret,
  ),
  ForecourtThrowConflict,
);

const badSurfacePrepared = await prepareForecourtThrowWithDatabase(
  commitDb, U1, parseForecourtPrepareInput(rawPrepare(12)), secret,
);
await assert.rejects(
  commitForecourtThrowWithDatabase(
    commitDb,
    U1,
    parseForecourtCommitInput(rawCommit(13, badSurfacePrepared, {
      impact_kind: "Navel", surface_id: "budai.body",
    })),
    secret,
  ),
  ForecourtImpactError,
);

// Voice lookup failure cannot roll back the first-Navel text award.
const voiceFailDb = new MemoryForecourtDatabase();
const voiceFailPrepare = await prepareForecourtThrowWithDatabase(
  voiceFailDb, U1, parseForecourtPrepareInput(rawPrepare(21)), secret,
);
const voiceFail = await commitForecourtThrowWithDatabase(
  voiceFailDb,
  U1,
  parseForecourtCommitInput(rawCommit(21, voiceFailPrepare)),
  secret,
  () => { throw new Error("manifest_unavailable"); },
);
assert.ok(voiceFail.blessing?.display.body);
assert.equal(voiceFail.blessing?.voice, null);
assert.equal(voiceFailDb.commits.length, 1);
assert.equal(voiceFailDb.blessings.length, 1);

// Two simultaneous accepted Navels get two successes but one daily blessing.
const blessingDb = new MemoryForecourtDatabase();
const [bp1, bp2] = await Promise.all([31, 32].map(async (index) =>
  prepareForecourtThrowWithDatabase(
    blessingDb, U1, parseForecourtPrepareInput(rawPrepare(index)), secret,
  )
));
const blessingResults = await Promise.all([
  commitForecourtThrowWithDatabase(
    blessingDb, U1, parseForecourtCommitInput(rawCommit(31, bp1)), secret,
  ),
  commitForecourtThrowWithDatabase(
    blessingDb, U1, parseForecourtCommitInput(rawCommit(32, bp2)), secret,
  ),
]);
assert.equal(blessingResults.filter((row) => row.blessing !== null).length, 1);
assert.equal(blessingResults.at(-1)?.projection.successes, 2);
assert.equal(blessingDb.blessings.length, 1);
blessingDb.clock = new Date(blessingResults[1].nextResetAt);
blessingDb.clock = new Date(blessingDb.clock.getTime() + 1);
const afterRollover = await getForecourtStateWithDatabase(blessingDb, U1);
assert.equal(afterRollover.projection.throwsUsed, 0);
assert.equal(afterRollover.projection.successes, 2);
assert.equal(afterRollover.projection.blessingClaimed, false);

// Concurrent exact commit retries serialize to one durable write and one replay.
const exactCommitDb = new MemoryForecourtDatabase();
const exactPrepared = await prepareForecourtThrowWithDatabase(
  exactCommitDb, U1, parseForecourtPrepareInput(rawPrepare(41)), secret,
);
const exactInput = parseForecourtCommitInput(rawCommit(41, exactPrepared));
const exactResults = await Promise.all([
  commitForecourtThrowWithDatabase(exactCommitDb, U1, exactInput, secret),
  commitForecourtThrowWithDatabase(exactCommitDb, U1, exactInput, secret),
]);
assert.deepEqual(exactResults.map((row) => row.replayed).sort(), [false, true]);
assert.equal(exactCommitDb.commits.length, 1);

// Exact transaction replays preserve their outcome identity, but their state
// projection must be reconciled to the current cycle. A stored prior-day
// projection must never roll today's quota/blessing state backwards.
const priorCycleCommit = exactResults[0];
exactCommitDb.clock = new Date(
  new Date(priorCycleCommit.nextResetAt).getTime() + 1,
);
const currentCycleState = await getForecourtStateWithDatabase(exactCommitDb, U1);
assert.notEqual(
  currentCycleState.projection.localDate,
  priorCycleCommit.projection.localDate,
);
assert.equal(currentCycleState.projection.throwsUsed, 0);
assert.equal(currentCycleState.projection.blessingClaimed, false);

const commitReplayAfterRollover = await commitForecourtThrowWithDatabase(
  exactCommitDb,
  U1,
  exactInput,
  secret,
);
assert.equal(commitReplayAfterRollover.replayed, true);
assert.equal(commitReplayAfterRollover.throwId, priorCycleCommit.throwId);
assert.equal(commitReplayAfterRollover.impactKind, priorCycleCommit.impactKind);
assert.deepEqual(commitReplayAfterRollover.blessing, priorCycleCommit.blessing);
assert.deepEqual(
  commitReplayAfterRollover.projection,
  currentCycleState.projection,
);
assert.equal(commitReplayAfterRollover.nextResetAt, currentCycleState.nextResetAt);
assert.equal(exactCommitDb.commits.length, 1, "commit replay remains one durable write");

await assert.rejects(
  prepareForecourtThrowWithDatabase(
    exactCommitDb,
    U1,
    parseForecourtPrepareInput(rawPrepare(41)),
    secret,
  ),
  (error: unknown) => error instanceof ForecourtPrepareReplayRejected
    && error.message === "forecourt_throw_cycle_closed"
    && error.projection.localDate === currentCycleState.projection.localDate
    && error.projection.throwsUsed === 0,
  "a lost prior-cycle prepare ends rejected with today's projection",
);
assert.equal(
  exactCommitDb.authorizations.length,
  1,
  "prepare replay remains one durable authorization",
);

const expiredPrepareDb = new MemoryForecourtDatabase();
const expiresPrepared = await prepareForecourtThrowWithDatabase(
  expiredPrepareDb,
  U1,
  parseForecourtPrepareInput(rawPrepare(42)),
  secret,
);
expiredPrepareDb.clock = new Date(
  new Date(expiresPrepared.expiresAt).getTime() + 1,
);
await assert.rejects(
  prepareForecourtThrowWithDatabase(
    expiredPrepareDb,
    U1,
    parseForecourtPrepareInput(rawPrepare(42)),
    secret,
  ),
  (error: unknown) => error instanceof ForecourtPrepareReplayRejected
    && error.message === "forecourt_ticket_expired"
    && error.projection.localDate === expiresPrepared.projection.localDate
    && error.projection.throwsUsed === 1,
  "same-cycle prepare replay after ticket TTL ends rejected without a launch",
);
assert.equal(expiredPrepareDb.authorizations.length, 1, "expiry burns no new ordinal");

// Exact committed replay remains available after ticket expiry; new expired commit is rejected.
commitDb.clock = new Date("2026-08-09T05:00:00.000Z");
assert.equal(
  (await commitForecourtThrowWithDatabase(commitDb, U1, c1Input, secret)).replayed,
  true,
);
await assert.rejects(
  commitForecourtThrowWithDatabase(
    commitDb,
    U1,
    parseForecourtCommitInput(rawCommit(13, badSurfacePrepared, {
      impact_kind: "Ground", surface_id: "forecourt.ground",
    })),
    secret,
  ),
  ForecourtTicketError,
);

// Active timezone is frozen; lifetime levels survive a reset and are reachable.
const frozenDb = new MemoryForecourtDatabase();
const frozenFirst = await getForecourtStateWithDatabase(frozenDb, U1);
frozenDb.timezones.set(U1, "Pacific/Kiritimati");
frozenDb.clock = new Date("2026-08-09T05:00:00.000Z");
const frozenAgain = await getForecourtStateWithDatabase(frozenDb, U1);
assert.equal(frozenAgain.projection.localDate, frozenFirst.projection.localDate);
assert.equal(frozenAgain.nextResetAt, frozenFirst.nextResetAt);
assert.deepEqual(forecourtLevels(2), { lotusLevel: 0, lanternLevel: 0, waterLevel: 0 });
assert.deepEqual(forecourtLevels(35), { lotusLevel: 5, lanternLevel: 5, waterLevel: 5 });
assert.equal(Object.keys(frozenAgain.projection).sort().join(","), [
  "blessingClaimed", "lanternLevel", "localDate", "lotusLevel",
  "recoveryEarned", "successes", "throwsUsed", "waterLevel",
].sort().join(","));

// Controlled voice is fail-closed unless URL, immutable hash and duration all exist.
const priorEnvironment = {
  base: process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL,
  sha: process.env.SHRINE_FORECOURT_BUDAI_VOICE_SHA256_TH,
  duration: process.env.SHRINE_FORECOURT_BUDAI_VOICE_DURATION_MS_TH,
};
delete process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL;
assert.equal(controlledForecourtVoiceAsset("th"), null);
process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL = "https://assets.hourkey.io/v195/budai";
process.env.SHRINE_FORECOURT_BUDAI_VOICE_SHA256_TH = "c".repeat(64);
process.env.SHRINE_FORECOURT_BUDAI_VOICE_DURATION_MS_TH = "7800";
assert.equal(controlledForecourtVoiceAsset("th")?.profileId, "budai-warm-v1");
if (priorEnvironment.base === undefined) delete process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL;
else process.env.SHRINE_FORECOURT_BUDAI_VOICE_BASE_URL = priorEnvironment.base;
if (priorEnvironment.sha === undefined) delete process.env.SHRINE_FORECOURT_BUDAI_VOICE_SHA256_TH;
else process.env.SHRINE_FORECOURT_BUDAI_VOICE_SHA256_TH = priorEnvironment.sha;
if (priorEnvironment.duration === undefined) delete process.env.SHRINE_FORECOURT_BUDAI_VOICE_DURATION_MS_TH;
else process.env.SHRINE_FORECOURT_BUDAI_VOICE_DURATION_MS_TH = priorEnvironment.duration;

// Migration/release contract: additive, owner-bound recovery, pins, rollback refusal.
const migration = readFileSync("migrations/20260809_shrine_forecourt_v195.sql", "utf8");
const rollback = readFileSync("migrations/20260809_shrine_forecourt_v195_rollback.sql", "utf8");
assert.match(migration, /mainhall-20260809-046/u);
assert.match(migration, new RegExp(FORECOURT_SCENE_SHA256, "u"));
assert.match(migration, /forecourt-coin-v2/u);
assert.match(migration, /FOREIGN KEY \(user_id, source_result_id, source_ritual_id\)/u);
assert.match(migration, /forecourt-bell','forecourt-drum','east-garden-wish-tie/u);
assert.doesNotMatch(migration, /TreeCare/u);
assert.match(rollback, /rollback_blocked/u);
assert.match(rollback, /used_rows > 0/u);

for (const route of ["state", "prepare", "commit"]) {
  const source = readFileSync(
    `src/app/api/mobile/v1/shrine/forecourt/${route}/route.ts`,
    "utf8",
  );
  assert.match(source, /guardShrineRequest/u);
  assert.match(source, /force-dynamic/u);
  assert.ok(
    source.indexOf("forecourtDisabledResponse()") < source.indexOf("guardShrineRequest(request"),
    `${route} must fail closed before authentication/rate-limit/DB work`,
  );
}
assert.doesNotMatch(readFileSync("src/lib/shrine-forecourt-v195.ts", "utf8"), /wish_text/u);

console.log("PASS shrine forecourt V195 authoritative contract suite");
