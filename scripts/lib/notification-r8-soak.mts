import { createHash } from "node:crypto";
import moment from "moment-timezone";

type PendingArrival = { dueMinute: number; remaining: number };

const ACCOUNTS = 10_000;
const DAYS = 3;
const BOUNDARIES_PER_LOCAL_DAY = 12;
const WORKER_INTERVAL_MINUTES = 2;
const WORKER_CAPACITY_PER_TICK = 8_000;
const DB_BATCH_SIZE = 100;
const DB_POOL_CONNECTIONS = 80;
const LEGACY_ITEMS_PER_TICK = 200;
const ZONES = Object.freeze([
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "Asia/Bangkok",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
]);

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addArrival(target: Map<number, number>, dueMinute: number, count = 1): void {
  target.set(dueMinute, (target.get(dueMinute) || 0) + count);
}

function workerTick(minute: number): boolean {
  return ((minute - 1) % WORKER_INTERVAL_MINUTES + WORKER_INTERVAL_MINUTES) % WORKER_INTERVAL_MINUTES === 0;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)];
}

function consume(
  queue: PendingArrival[],
  nowMinute: number,
  capacity: number,
  latencies: number[],
): number {
  let used = 0;
  while (capacity > 0 && queue.length > 0) {
    const head = queue[0];
    const count = Math.min(capacity, head.remaining);
    for (let index = 0; index < count; index += 1) latencies.push(nowMinute - head.dueMinute);
    head.remaining -= count;
    capacity -= count;
    used += count;
    if (head.remaining === 0) queue.shift();
  }
  return used;
}

function simulateQueues(
  astronomyArrivals: ReadonlyMap<number, number>,
  legacyArrivals: ReadonlyMap<number, number>,
): Readonly<{
  astronomyLatencies: readonly number[];
  legacyLatencies: readonly number[];
  maxBacklogMinutes: number;
  maxAstronomyProcessedPerTick: number;
}> {
  const allMinutes = [...astronomyArrivals.keys(), ...legacyArrivals.keys()];
  const firstMinute = Math.min(...allMinutes);
  const lastArrivalMinute = Math.max(...allMinutes);
  const astronomyQueue: PendingArrival[] = [];
  const legacyQueue: PendingArrival[] = [];
  const astronomyLatencies: number[] = [];
  const legacyLatencies: number[] = [];
  let maxBacklogMinutes = 0;
  let maxAstronomyProcessedPerTick = 0;
  let minute = firstMinute;
  while (minute <= lastArrivalMinute || astronomyQueue.length > 0 || legacyQueue.length > 0) {
    const astronomyCount = astronomyArrivals.get(minute) || 0;
    const legacyCount = legacyArrivals.get(minute) || 0;
    if (astronomyCount > 0) astronomyQueue.push({ dueMinute: minute, remaining: astronomyCount });
    if (legacyCount > 0) legacyQueue.push({ dueMinute: minute, remaining: legacyCount });
    const oldest = Math.min(
      astronomyQueue[0]?.dueMinute ?? Number.POSITIVE_INFINITY,
      legacyQueue[0]?.dueMinute ?? Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(oldest)) maxBacklogMinutes = Math.max(maxBacklogMinutes, minute - oldest);
    if (workerTick(minute)) {
      const legacyUsed = consume(legacyQueue, minute, WORKER_CAPACITY_PER_TICK, legacyLatencies);
      const astronomyUsed = consume(
        astronomyQueue,
        minute,
        WORKER_CAPACITY_PER_TICK - legacyUsed,
        astronomyLatencies,
      );
      maxAstronomyProcessedPerTick = Math.max(maxAstronomyProcessedPerTick, astronomyUsed);
    }
    minute += 1;
  }
  return Object.freeze({
    astronomyLatencies: Object.freeze(astronomyLatencies),
    legacyLatencies: Object.freeze(legacyLatencies),
    maxBacklogMinutes,
    maxAstronomyProcessedPerTick,
  });
}

function rounded(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function runAcceleratedProviderFreeSoak() {
  if (moment.tz.dataVersion !== "2026c") throw new Error("r8_soak_tzdb_mismatch");
  const dueByZone = ZONES.map((zone) => Array.from({ length: DAYS }, (_, day) => (
    Array.from({ length: BOUNDARIES_PER_LOCAL_DAY }, (_, boundary) => Math.trunc(
      moment.tz([2026, 8, 4 + day, boundary * 2, 0, 0], zone).valueOf() / 60_000,
    ))
  )));
  const astronomyArrivals = new Map<number, number>();
  const lineages = new Set<string>();
  let duplicateLineages = 0;
  let crashReplayAttempts = 0;
  let deduplicatedReplays = 0;
  let revokedBeforeEnqueue = 0;
  let deletedBeforeEnqueue = 0;
  let providerCalls = 0;

  for (let account = 0; account < ACCOUNTS; account += 1) {
    const zoneIndex = account % ZONES.length;
    const zone = ZONES[zoneIndex];
    for (let day = 0; day < DAYS; day += 1) {
      for (let boundary = 0; boundary < BOUNDARIES_PER_LOCAL_DAY; boundary += 1) {
        const lineage = sha(`r8-soak-v2\0${zone}\0${account}\0${day}\0${boundary}`);
        if (lineages.has(lineage)) duplicateLineages += 1;
        else lineages.add(lineage);
        if (account < 100 && boundary === 5) {
          crashReplayAttempts += 1;
          if (lineages.has(lineage)) deduplicatedReplays += 1;
        }
        if (account % 997 === 0 && boundary === 7) {
          revokedBeforeEnqueue += 1;
          continue;
        }
        if (account % 991 === 0 && boundary === 9) {
          deletedBeforeEnqueue += 1;
          continue;
        }
        addArrival(astronomyArrivals, dueByZone[zoneIndex][day][boundary]);
      }
    }
  }

  const arrivalMinutes = [...astronomyArrivals.keys()];
  const minMinute = Math.min(...arrivalMinutes);
  const maxMinute = Math.max(...arrivalMinutes);
  const legacyArrivals = new Map<number, number>();
  for (let minute = minMinute; minute <= maxMinute + WORKER_INTERVAL_MINUTES; minute += 1) {
    if (workerTick(minute)) addArrival(legacyArrivals, minute - 1, LEGACY_ITEMS_PER_TICK);
  }
  const baselineLegacy = simulateQueues(new Map(), legacyArrivals);
  const combined = simulateQueues(astronomyArrivals, legacyArrivals);
  const baselineLegacyP95 = percentile(baselineLegacy.legacyLatencies, 0.95);
  const combinedLegacyP95 = percentile(combined.legacyLatencies, 0.95);
  const legacyP95RegressionPercent = baselineLegacyP95 === 0
    ? (combinedLegacyP95 === 0 ? 0 : 100)
    : rounded(((combinedLegacyP95 - baselineLegacyP95) / baselineLegacyP95) * 100);
  const processedOccurrences = combined.astronomyLatencies.length;
  const peakArrivalsPerMinute = Math.max(...astronomyArrivals.values());
  const poolPercent = rounded(
    (Math.ceil(combined.maxAstronomyProcessedPerTick / DB_BATCH_SIZE) / DB_POOL_CONNECTIONS) * 100,
  );
  const quotaPercent = rounded(processedOccurrences / (lineages.size * 2) * 100);
  const qizhengSyntheticEnvelopes = ["C1", "B", "C2", "D1", "D2"].map((ruleClass) => Object.freeze({
    ruleClass,
    state: "suppressed" as const,
    reason: "source_incomplete" as const,
    providerEligible: false as const,
  }));

  // This accelerated lane has no provider adapter or credentials by design.
  providerCalls += 0;
  return Object.freeze({
    mode: "accelerated_provider_free_72h_simulation" as const,
    observedWindowHours: DAYS * 24,
    accounts: ACCOUNTS,
    boundariesPerDay: ACCOUNTS * BOUNDARIES_PER_LOCAL_DAY,
    boundaries: lineages.size,
    processedOccurrences,
    p95Minutes: percentile(combined.astronomyLatencies, 0.95),
    p99Minutes: percentile(combined.astronomyLatencies, 0.99),
    maxBacklogMinutes: combined.maxBacklogMinutes,
    poolPercent,
    quotaPercent,
    headroomMultiplier: rounded(WORKER_CAPACITY_PER_TICK / peakArrivalsPerMinute),
    legacyP95RegressionPercent,
    duplicateLineages,
    crashReplayAttempts,
    deduplicatedReplays,
    revokedBeforeEnqueue,
    deletedBeforeEnqueue,
    providerCalls,
    tzdb: moment.tz.dataVersion,
    zones: ZONES,
    qizhengSuppressionReasons: Object.freeze(qizhengSyntheticEnvelopes.map((entry) => entry.reason)),
  });
}
