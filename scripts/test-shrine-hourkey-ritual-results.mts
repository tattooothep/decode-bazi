import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HOURKEY_RITUAL_IDS,
  HOURKEY_RITUAL_LOCALES,
  hashHourKeyRitualRequest,
  parseHourKeyRitualInput,
  resolveHourKeyRitual,
} from "../src/lib/shrine-hourkey-ritual-result";
import {
  HOURKEY_RITUAL_DAILY_RESULT_LIMIT,
  HourKeyRitualDailyLimitExceeded,
  HourKeyRitualIdempotencyConflict,
  recordHourKeyRitualResultWithDatabase,
  type HourKeyRitualLedgerDatabase,
} from "../src/lib/shrine-hourkey-ritual-ledger";

const secret = "hourkey-test-secret-32-bytes-minimum-value";
const idempotency_key = "ritual_0123456789abcdef0123456789abcdef";
const userId = "00000000-0000-4000-8000-000000000001";

for (const locale of HOURKEY_RITUAL_LOCALES) {
  for (const ritual_id of HOURKEY_RITUAL_IDS) {
    const needsWish = ritual_id === "guanyin-prayer"
      || ritual_id === "east-garden-wish-tie";
    const input = parseHourKeyRitualInput({
      idempotency_key,
      intent_category: ritual_id === "guanyin-prayer" ? "peace" : undefined,
      locale,
      ritual_id,
      wish_text: needsWish ? "ขอให้ใจสงบ" : undefined,
    });
    const first = resolveHourKeyRitual("user-1", input, secret);
    const replay = resolveHourKeyRitual("user-1", input, secret);
    assert.deepEqual(replay, first, `${ritual_id}/${locale} retry drifted`);
    assert.equal(first.authoritative, true);
    assert.equal(first.status, "authorized");
    assert.ok(first.resultCode.length > 0);
    assert.ok(first.display.title.length > 0);
    assert.ok(first.display.body.length > 0);
    assert.ok(first.display.footer.length > 0);
  }
}

const fortune = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "fortune-sticks",
  }),
  secret,
);
assert.match(fortune.resultCode, /^fortune-stick-([1-9]|[1-5][0-9]|60)$/u);
assert.ok((fortune.values.fortuneStickNumber ?? 0) >= 1);
assert.equal(fortune.values.fortuneStickCanonVersion, "60jiazi-v1");
assert.equal(
  fortune.values.fortuneStickCard?.no,
  fortune.values.fortuneStickNumber,
);
assert.equal(fortune.values.fortuneStickCard?.poem.length, 4);
assert.equal(
  Object.keys(fortune.values.fortuneStickCard?.interpretation ?? {}).length,
  29,
);
assert.ok(
  fortune.values.fortuneStickCard?.poem.every(
    (line) => line.zh.trim().length > 0 && (line.th?.trim().length ?? 0) > 0,
  ),
  "backend fortune result must carry our Chinese source and Thai poem translation",
);
assert.match(fortune.display.body, /ผนึก/u);
assert.match(fortune.display.footer, /คำแปล/u);

const oracle = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "en",
    ritual_id: "oracle-liuyao",
  }),
  secret,
);
assert.match(oracle.resultCode, /^oracle-lines-[6-9](?:-[6-9]){5}$/u);
assert.equal(oracle.values.liuyaoLines?.length, 6);

const jiaobei = resolveHourKeyRitual(
  "user-1",
  parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "jiaobei",
  }),
  secret,
);
assert.match(jiaobei.resultCode, /^jiaobei-(sheng|xiao|yin|li)$/u);

const campusResultCodes = new Map([
  ["forecourt-bell", "forecourt-bell-rung"],
  ["forecourt-drum", "forecourt-drum-struck"],
  ["tiangong-incense", "forecourt-tiangong-incense-lit"],
  ["forecourt-guanyin-worship", "forecourt-guanyin-worship-completed"],
  ["east-garden-koi-feed", "east-garden-koi-fed"],
  ["east-garden-wish-tie", "east-garden-wish-tied"],
  ["east-garden-pavilion", "east-garden-pavilion-visited"],
  ["east-garden-guanyin-worship", "east-garden-guanyin-worship-completed"],
]);
for (const [ritual_id, resultCode] of campusResultCodes) {
  const campus = resolveHourKeyRitual(
    "user-1",
    parseHourKeyRitualInput({
      idempotency_key,
      locale: "th",
      ritual_id,
      wish_text: ritual_id === "east-garden-wish-tie"
        ? "ขอให้ครอบครัวสงบสุข"
        : undefined,
    }),
    secret,
  );
  assert.equal(campus.resultCode, resultCode);
  assert.ok(campus.display.title.length > 0);
  assert.ok(campus.display.body.length > 0);
}

assert.throws(
  () => parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "east-garden-wish-tie",
  }),
  /invalid_wish_context/u,
);

const wishInput = parseHourKeyRitualInput({
  idempotency_key,
  locale: "th",
  ritual_id: "east-garden-wish-tie",
  wish_text: "ขอให้ครอบครัวสงบสุข",
});
assert.equal(
  hashHourKeyRitualRequest(wishInput, secret, userId),
  hashHourKeyRitualRequest(wishInput, secret, userId),
);
assert.notEqual(
  hashHourKeyRitualRequest(wishInput, secret, userId),
  hashHourKeyRitualRequest({
    ...wishInput,
    wishText: "ขอให้มีสติ",
  }, secret, userId),
  "idempotency request hash must bind the private wish payload",
);
assert.notEqual(
  hashHourKeyRitualRequest(wishInput, secret, userId),
  hashHourKeyRitualRequest({ ...wishInput, locale: "en" }, secret, userId),
  "idempotency request hash must bind response locale",
);
assert.notEqual(
  hashHourKeyRitualRequest(wishInput, secret, userId),
  hashHourKeyRitualRequest(wishInput, `${secret}-different`, userId),
  "stored request fingerprint must be keyed, not a plain wish hash",
);
assert.notEqual(
  hashHourKeyRitualRequest(wishInput, secret, userId),
  hashHourKeyRitualRequest(
    wishInput,
    secret,
    "00000000-0000-4000-8000-000000000002",
  ),
  "stored request fingerprints must not correlate the same wish across users",
);

let storedRow: Readonly<{
  request_hash: string;
  result_json: ReturnType<typeof resolveHourKeyRitual>;
}> | null = null;
let quotaQueries = 0;
const fakeDatabase: HourKeyRitualLedgerDatabase = {
  async connect() {
    return {
      async query(text, values = []) {
        if (text.includes("SELECT request_hash")) {
          return {
            rowCount: storedRow ? 1 : 0,
            rows: storedRow ? [storedRow] : [],
          };
        }
        if (text.includes("WITH bounds")) {
          quotaQueries += 1;
          return {
            rowCount: 1,
            rows: [{ reset_at: "2026-08-10T00:00:00.000Z", result_count: storedRow ? 1 : 0 }],
          };
        }
        if (text.includes("INSERT INTO")) {
          storedRow = {
            request_hash: String(values[4]),
            result_json: JSON.parse(String(values[6])),
          };
          return { rowCount: 1, rows: [storedRow] };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
  },
};
const firstCommit = await recordHourKeyRitualResultWithDatabase(
  fakeDatabase,
  userId,
  wishInput,
  secret,
);
assert.equal(quotaQueries, 1);
const exactReplay = await recordHourKeyRitualResultWithDatabase(
  fakeDatabase,
  userId,
  wishInput,
  secret,
);
assert.deepEqual(exactReplay, firstCommit, "exact retries must replay stored JSON");
assert.equal(
  quotaQueries,
  1,
  "exact replays must return before and not consume the new-result quota",
);
await assert.rejects(
  recordHourKeyRitualResultWithDatabase(
    fakeDatabase,
    userId,
    { ...wishInput, wishText: "ขอให้มีสติ" },
    secret,
  ),
  HourKeyRitualIdempotencyConflict,
  "same key with changed semantics must conflict",
);

const quotaDatabase: HourKeyRitualLedgerDatabase = {
  async connect() {
    return {
      async query(text) {
        if (text.includes("SELECT request_hash")) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes("WITH bounds")) {
          return {
            rowCount: 1,
            rows: [{
              reset_at: "2026-08-10T00:00:00.000Z",
              result_count: HOURKEY_RITUAL_DAILY_RESULT_LIMIT,
            }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
      release() {},
    };
  },
};
await assert.rejects(
  recordHourKeyRitualResultWithDatabase(
    quotaDatabase,
    userId,
    { ...wishInput, idempotencyKey: "ritual_1123456789abcdef0123456789abcdef" },
    secret,
  ),
  HourKeyRitualDailyLimitExceeded,
  "new results above the durable daily quota must be rejected",
);

assert.throws(
  () => parseHourKeyRitualInput({ locale: "th", ritual_id: "incense" }),
  /invalid_idempotency_key/u,
);
assert.throws(
  () => parseHourKeyRitualInput({
    idempotency_key,
    locale: "th",
    ritual_id: "guanyin-prayer",
  }),
  /invalid_prayer_context/u,
);

const routeSource = readFileSync(
  "src/app/api/mobile/v1/shrine/ritual/result/route.ts",
  "utf8",
);
assert.match(routeSource, /getMobileSession/u);
assert.match(routeSource, /mobileBearerToken/u);
assert.match(routeSource, /mobile-shrine-ritual-result-ip/u);
assert.match(routeSource, /mobile-shrine-ritual-result-bearer/u);
assert.match(routeSource, /mobile-shrine-ritual-result-user/u);
assert.match(routeSource, /process\.env\.AUTH_SECRET/u);
assert.match(routeSource, /recordHourKeyRitualResult/u);
assert.match(routeSource, /HourKeyRitualIdempotencyConflict/u);
assert.match(routeSource, /HourKeyRitualDailyLimitExceeded/u);
assert.match(routeSource, /resetAt: error\.resetAt/u);
assert.match(routeSource, /"Retry-After"/u);

const ledgerSource = readFileSync(
  "src/lib/shrine-hourkey-ritual-ledger.ts",
  "utf8",
);
assert.match(ledgerSource, /stored\.request_hash !== requestHash/u);
assert.match(ledgerSource, /pg_advisory_xact_lock/u);
assert.match(ledgerSource, /HOURKEY_RITUAL_DAILY_RESULT_LIMIT = 300/u);
assert.match(ledgerSource, /now\(\) AT TIME ZONE 'UTC'/u);
assert.ok(
  ledgerSource.indexOf("SELECT request_hash") < ledgerSource.indexOf("WITH bounds"),
  "exact replay lookup must run before the daily new-result quota",
);
assert.match(ledgerSource, /client\.query\("BEGIN"\)/u);
assert.match(ledgerSource, /client\.query\("COMMIT"\)/u);
assert.match(ledgerSource, /client\.query\("ROLLBACK"\)/u);
assert.doesNotMatch(ledgerSource, /wish_text/u);

const migrationSource = readFileSync(
  "migrations/20260809_shrine_hourkey_ritual_results.sql",
  "utf8",
);
assert.match(migrationSource, /UNIQUE \(user_id, idempotency_key\)/u);
assert.match(migrationSource, /REVOKE UPDATE, DELETE/u);
assert.doesNotMatch(migrationSource, /wish_text/u);

const migrationRunnerSource = readFileSync(
  "scripts/apply-shrine-ritual-migration.mts",
  "utf8",
);
assert.match(
  migrationRunnerSource,
  /20260809_shrine_hourkey_ritual_results\.sql/u,
);
assert.match(
  migrationRunnerSource,
  /20260809_shrine_hourkey_ritual_results_rollback\.sql/u,
);
assert.match(migrationRunnerSource, /shrine_hourkey_ritual_results/u);
assert.match(migrationRunnerSource, /BEGIN/u);
assert.match(migrationRunnerSource, /ROLLBACK/u);

console.log(
  `PASS HourKey ritual backend: ${HOURKEY_RITUAL_IDS.length} rituals × ${HOURKEY_RITUAL_LOCALES.length} locales`,
);
