import { pool } from "@/lib/db";
import {
  hashHourKeyRitualRequest,
  resolveHourKeyRitual,
  type HourKeyRitualInput,
  type HourKeyRitualResult,
} from "@/lib/shrine-hourkey-ritual-result";

/** One account may commit this many new results per UTC day. Replays are free. */
export const HOURKEY_RITUAL_DAILY_RESULT_LIMIT = 300;

/** A reused key may replay only the exact same semantic request. */
export class HourKeyRitualIdempotencyConflict extends Error {
  constructor() {
    super("ritual_idempotency_conflict");
  }
}

export class HourKeyRitualDailyLimitExceeded extends Error {
  constructor(
    readonly limit: number,
    readonly resetAt: string,
  ) {
    super("ritual_daily_limit");
  }
}

type RitualLedgerRow = Readonly<{
  request_hash: string;
  result_json: HourKeyRitualResult;
}>;

type RitualQuotaRow = Readonly<{
  reset_at: string;
  result_count: number;
}>;

export type HourKeyRitualLedgerClient = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<Readonly<{
    rowCount: number | null;
    rows: readonly Record<string, unknown>[];
  }>>;
  release: () => void;
}>;

export type HourKeyRitualLedgerDatabase = Readonly<{
  connect: () => Promise<HourKeyRitualLedgerClient>;
}>;

const productionDatabase: HourKeyRitualLedgerDatabase = {
  connect: async () => {
    const client = await pool.connect();
    return {
      query: async (text, values = []) => client.query(text, [...values]),
      release: () => client.release(),
    };
  },
};

/**
 * Atomically commits or replays one authoritative HourKey ritual result.
 * Wish text is never stored; only a keyed, user-bound request fingerprint is
 * retained. A per-user advisory transaction lock makes the UTC daily quota
 * race-safe. Exact replays are resolved before the quota count and are free.
 */
export async function recordHourKeyRitualResult(
  userId: string,
  input: HourKeyRitualInput,
  secret: string,
): Promise<HourKeyRitualResult> {
  return recordHourKeyRitualResultWithDatabase(
    productionDatabase,
    userId,
    input,
    secret,
  );
}

/** Database-injected form used to prove insert, replay, conflict, and quota. */
export async function recordHourKeyRitualResultWithDatabase(
  database: HourKeyRitualLedgerDatabase,
  userId: string,
  input: HourKeyRitualInput,
  secret: string,
): Promise<HourKeyRitualResult> {
  const client = await database.connect();
  const requestHash = hashHourKeyRitualRequest(input, secret, userId);
  try {
    await client.query("BEGIN");
    // Serialize all result commits for one account, including midnight/key races.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 763242))",
      [userId],
    );

    const replay = await client.query(
      `SELECT request_hash, result_json
         FROM shrine_hourkey_ritual_results
        WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, input.idempotencyKey],
    );
    const stored = replay.rows[0] as RitualLedgerRow | undefined;
    if (stored) {
      if (stored.request_hash !== requestHash) {
        throw new HourKeyRitualIdempotencyConflict();
      }
      await client.query("COMMIT");
      return stored.result_json;
    }

    const quota = await client.query(
      `WITH bounds AS (
         SELECT date_trunc('day', now() AT TIME ZONE 'UTC')
                  AT TIME ZONE 'UTC' AS start_at
       )
       SELECT (
                SELECT COUNT(*)::int
                  FROM shrine_hourkey_ritual_results
                 WHERE user_id = $1 AND created_at >= start_at
              ) AS result_count,
              (start_at + interval '1 day')::text AS reset_at
         FROM bounds`,
      [userId],
    );
    const quotaRow = quota.rows[0] as RitualQuotaRow | undefined;
    if (!quotaRow) throw new Error("ritual_quota_unavailable");
    if (Number(quotaRow.result_count) >= HOURKEY_RITUAL_DAILY_RESULT_LIMIT) {
      throw new HourKeyRitualDailyLimitExceeded(
        HOURKEY_RITUAL_DAILY_RESULT_LIMIT,
        String(quotaRow.reset_at),
      );
    }

    const result = resolveHourKeyRitual(userId, input, secret);
    const inserted = await client.query(
      `INSERT INTO shrine_hourkey_ritual_results
         (user_id, ritual_id, locale, intent_category, request_hash,
          result_code, result_json, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING request_hash, result_json`,
      [
        userId,
        input.ritualId,
        input.locale,
        input.intentCategory,
        requestHash,
        result.resultCode,
        JSON.stringify(result),
        input.idempotencyKey,
      ],
    );
    const committed = inserted.rows[0] as RitualLedgerRow | undefined;
    if (!committed) throw new Error("ritual_result_not_committed");
    await client.query("COMMIT");
    return committed.result_json;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
