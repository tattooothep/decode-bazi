import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER,
  DEDICATION_LANTERN_COST_YAM,
  DEDICATION_LANTERN_DURATION_DAYS,
  DEDICATION_NAME_MAX_CHARS,
  dedicateShrineLantern,
  getShrineDedicationLanterns,
  parseShrineDedicationInput,
  sanitizeDedicationText,
} from "../src/lib/shrine-dedication-lanterns";
import { pool } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

function isExplicitTestDatabaseName(databaseName: string): boolean {
  const segments = databaseName.trim().toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return segments.includes("test") || segments.includes("ci");
}
assert.equal(isExplicitTestDatabaseName("hourkey_test"), true);
assert.equal(isExplicitTestDatabaseName("decode_db"), false);
assert.equal(isExplicitTestDatabaseName("hourkey_prod"), false);

// ---------- sanitize + parse ----------
const okName = sanitizeDedicationText("  คุณแม่ สมศรี  ", DEDICATION_NAME_MAX_CHARS, false);
assert.deepEqual(okName, { ok: true, text: "คุณแม่ สมศรี", chars: 9 });
const combining = sanitizeDedicationText("กิตติ์พงศ์ใจดีสุดหล่อเลย", DEDICATION_NAME_MAX_CHARS, false);
assert.equal(combining.ok, true, "combining marks must not count toward the 20-char cap");
for (const [raw, reason] of [
  ["", "empty"],
  ["   ", "empty"],
  ["ชื่อยาวเกินยี่สิบตัวอักษรแน่นอนเลยจ้าา", "too_long"],
  ["<b>สมชาย</b>", "unsupported_characters"],
  ["สมชาย<script>", "unsupported_characters"],
  ["สม\u0000ชาย", "unsupported_characters"],
  ["สม​ชาย", "unsupported_characters"],
  ["張三", "unsupported_characters"],
  ["ไอ้เหี้ยดำ", "profanity"],
  ["f u c k", "profanity"],
] as const) {
  const result = sanitizeDedicationText(raw, DEDICATION_NAME_MAX_CHARS, false);
  assert.equal(result.ok, false, `must reject: ${JSON.stringify(raw)}`);
  assert.equal(!result.ok && result.reason, reason, `reason for ${JSON.stringify(raw)}`);
}
assert.deepEqual(
  sanitizeDedicationText("", 60, true),
  { ok: true, text: "", chars: 0 },
  "blessing may be empty",
);

const goodKey = "lantern_00112233445566778899aabbccddeeff";
const dedicationInput = parseShrineDedicationInput({
  dedication_name: "สมชาย ใจดี",
  blessing: "ขอให้สุขภาพแข็งแรง",
  idempotency_key: goodKey,
});
assert.deepEqual(dedicationInput, {
  dedicationName: "สมชาย ใจดี",
  blessing: "ขอให้สุขภาพแข็งแรง",
  idempotencyKey: goodKey,
});
for (const invalid of [
  { dedication_name: "สมชาย", blessing: "", idempotency_key: "guessable" },
  { dedication_name: "สมชาย", blessing: "" },
  { dedication_name: "สมชาย", blessing: "", idempotency_key: goodKey, cost_yam: 0 },
  { dedication_name: "ชื่อยาวเกินยี่สิบตัวอักษรแน่นอนเลยจ้าา", blessing: "", idempotency_key: goodKey },
  { dedication_name: "<img src=x>", blessing: "", idempotency_key: goodKey },
  null,
  [],
] as unknown[]) {
  assert.throws(
    () => parseShrineDedicationInput(invalid),
    /shrine_dedication_input_invalid/u,
  );
}

// ---------- migration + source markers ----------
const migration = read("migrations/20260726_shrine_dedication_lanterns.sql");
for (const marker of [
  "CREATE TABLE IF NOT EXISTS shrine_dedication_lanterns",
  "REFERENCES users(id) ON DELETE CASCADE",
  "UNIQUE (user_id, idempotency_key)",
  "CHECK (idempotency_key ~ '^lantern_[0-9a-f]{32}$')",
  "CHECK (expires_at > starts_at)",
  "idx_shrine_dedication_lanterns_active",
  "idx_shrine_dedication_lanterns_user",
  "REVOKE ALL PRIVILEGES ON TABLE shrine_dedication_lanterns FROM hourkey_app",
  "GRANT SELECT, INSERT ON shrine_dedication_lanterns TO hourkey_app",
]) {
  assert.ok(migration.includes(marker), `migration is missing ${marker}`);
}
assert.doesNotMatch(
  migration,
  /GRANT[^;]*(UPDATE|DELETE)[^;]*ON shrine_dedication_lanterns/iu,
  "lantern rows are immutable for the runtime role",
);

const helperSource = read("src/lib/shrine-dedication-lanterns.ts");
for (const marker of [
  "BEGIN",
  "pg_advisory_xact_lock",
  "shrine-lantern-slots",
  "hour_balance >= $2",
  "INSERT INTO shrine_dedication_lanterns",
  "INSERT INTO hour_transactions",
  "spend_shrine_dedication_lantern",
  "COMMIT",
  "ROLLBACK",
]) {
  assert.ok(helperSource.includes(marker), `atomic lantern helper is missing ${marker}`);
}
assert.doesNotMatch(helperSource, /Math\.random/u);

const routeSource = read("src/app/api/mobile/v1/shrine/lanterns/route.ts");
assert.match(routeSource, /mobile-shrine-lanterns-[a-z-]+-ip:\$\{ip\}/u);
assert.match(routeSource, /mobile-shrine-lanterns-[a-z-]+-user:\$\{session\.userId\}/u);
assert.match(routeSource, /createHash\("sha256"\)\.update\(bearer\)\.digest\("hex"\)/u);
{
  const firstHandler = routeSource.indexOf("export async function");
  const ipLimitIndex = routeSource.indexOf("-ip:${ip}", firstHandler);
  const authIndexes = [
    routeSource.indexOf("await validateMobileBearerToken", firstHandler),
    routeSource.indexOf("await getMobileSession", firstHandler),
  ].filter((index) => index >= 0);
  assert.ok(
    ipLimitIndex >= 0 && authIndexes.length > 0 && ipLimitIndex < Math.min(...authIndexes),
    "IP limiting must precede session database work",
  );
}

// ---------- fake-pool atomic flow ----------
type FakeLantern = {
  id: string;
  user_id: string;
  dedication_name: string;
  blessing: string;
  charged_yam: number;
  balance_after: number;
  idempotency_key: string;
  lantern_slot: number;
  starts_at: string;
  expires_at: string;
};
const FUTURE = "2026-08-30T00:00:00+00:00";
const fakeState = {
  balances: new Map<string, number>([["user-1", 45], ["user-2", 100]]),
  commits: 0,
  failNextHourTransactionInsert: false,
  hourTransactions: 0,
  lanterns: [] as FakeLantern[],
  rollbacks: 0,
};
type FakeSnapshot = {
  balances: Map<string, number>;
  lanterns: FakeLantern[];
  hourTransactions: number;
};
const fakeLocks = new Map<string, { held: boolean; waiters: Array<() => void> }>();
async function acquireFakeLock(key: string): Promise<() => void> {
  let lock = fakeLocks.get(key);
  if (!lock) {
    lock = { held: false, waiters: [] };
    fakeLocks.set(key, lock);
  }
  if (lock.held) {
    await new Promise<void>((resolve) => lock!.waiters.push(resolve));
  } else {
    lock.held = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = lock!.waiters.shift();
    if (next) { next(); return; }
    lock!.held = false;
    fakeLocks.delete(key);
  };
}
function createFakeClient() {
  let inTransaction = false;
  let snapshot: FakeSnapshot | null = null;
  const releaseLocks: Array<() => void> = [];
  const ensureSnapshot = () => {
    if (inTransaction && !snapshot) {
      snapshot = {
        balances: new Map(fakeState.balances),
        lanterns: fakeState.lanterns.map((row) => ({ ...row })),
        hourTransactions: fakeState.hourTransactions,
      };
    }
  };
  const finish = (rollback: boolean) => {
    if (rollback && snapshot) {
      fakeState.balances = new Map(snapshot.balances);
      fakeState.lanterns.splice(0, fakeState.lanterns.length, ...snapshot.lanterns.map((row) => ({ ...row })));
      fakeState.hourTransactions = snapshot.hourTransactions;
    }
    snapshot = null;
    inTransaction = false;
    releaseLocks.splice(0).forEach((release) => release());
  };
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const statement = sql.replace(/\s+/gu, " ").trim();
      if (statement === "BEGIN") { inTransaction = true; return { rows: [] as T[] }; }
      if (statement === "COMMIT") { fakeState.commits += 1; finish(false); return { rows: [] as T[] }; }
      if (statement === "ROLLBACK") { fakeState.rollbacks += 1; finish(true); return { rows: [] as T[] }; }
      if (statement.includes("pg_advisory_xact_lock")) {
        releaseLocks.push(await acquireFakeLock(String(params[0])));
        ensureSnapshot();
        return { rows: [] as T[] };
      }
      ensureSnapshot();
      if (statement.includes("FROM shrine_dedication_lanterns") && statement.includes("idempotency_key=$2")) {
        const row = fakeState.lanterns.find((lantern) => (
          lantern.user_id === params[0] && lantern.idempotency_key === params[1]
        ));
        return { rows: (row ? [{ ...row }] : []) as T[] };
      }
      if (statement.includes("COUNT(*) FILTER") && statement.includes("array_agg(lantern_slot)")) {
        const active = fakeState.lanterns.filter((lantern) => lantern.expires_at > "2026-07-26");
        return {
          rows: [{
            mine: active.filter((lantern) => lantern.user_id === params[0]).length,
            slots: active.length ? active.map((lantern) => lantern.lantern_slot) : null,
          }] as T[],
        };
      }
      if (statement.startsWith("UPDATE users") && statement.includes("hour_balance >= $2")) {
        const balance = fakeState.balances.get(String(params[0]));
        const cost = Number(params[1]);
        if (balance === undefined || balance < cost) return { rows: [] as T[] };
        fakeState.balances.set(String(params[0]), balance - cost);
        return { rows: [{ hour_balance: balance - cost }] as T[] };
      }
      if (statement.startsWith("SELECT hour_balance FROM users")) {
        const balance = fakeState.balances.get(String(params[0]));
        return { rows: (balance === undefined ? [] : [{ hour_balance: balance }]) as T[] };
      }
      if (statement.startsWith("INSERT INTO shrine_dedication_lanterns")) {
        const row: FakeLantern = {
          id: String(params[0]),
          user_id: String(params[1]),
          dedication_name: String(params[2]),
          blessing: String(params[3]),
          charged_yam: Number(params[4]),
          balance_after: Number(params[5]),
          idempotency_key: String(params[6]),
          lantern_slot: Number(params[7]),
          starts_at: "2026-07-26T00:00:00+00:00",
          expires_at: FUTURE,
        };
        if (fakeState.lanterns.some((lantern) => (
          lantern.user_id === row.user_id && lantern.idempotency_key === row.idempotency_key
        ))) {
          throw new Error("fake_unique_user_idempotency");
        }
        fakeState.lanterns.push(row);
        return { rows: [{ ...row }] as T[] };
      }
      if (statement.startsWith("INSERT INTO hour_transactions")) {
        if (fakeState.failNextHourTransactionInsert) {
          fakeState.failNextHourTransactionInsert = false;
          throw new Error("injected_hour_transaction_failure");
        }
        fakeState.hourTransactions += 1;
        return { rows: [] as T[] };
      }
      throw new Error(`unexpected_fake_query:${statement}`);
    },
    release() {},
  };
}
type FakeClient = ReturnType<typeof createFakeClient>;
const mutablePool = pool as unknown as { connect: () => Promise<FakeClient> };
const originalConnect = mutablePool.connect;
mutablePool.connect = async () => createFakeClient();
try {
  const first = await dedicateShrineLantern("user-1", dedicationInput);
  assert.equal(first.ok, true);
  assert.ok(first.ok && first.existing === false);
  assert.ok(first.ok && first.charged_yam === DEDICATION_LANTERN_COST_YAM);
  assert.ok(first.ok && first.balance_after === 35, "45 - 10 = 35");
  assert.ok(first.ok && first.lantern.lantern_slot === 0);
  assert.equal(fakeState.hourTransactions, 1);

  const replay = await dedicateShrineLantern("user-1", dedicationInput);
  assert.ok(replay.ok && replay.existing === true);
  assert.ok(replay.ok && replay.lantern.id === (first.ok ? first.lantern.id : ""));
  assert.equal(fakeState.hourTransactions, 1, "replay must never charge twice");
  assert.equal(fakeState.balances.get("user-1"), 35);

  const conflicting = await dedicateShrineLantern("user-1", {
    ...dedicationInput,
    dedicationName: "ชื่ออื่น",
  });
  assert.ok(!conflicting.ok && conflicting.error === "idempotency_conflict" && conflicting.status === 409);

  // ต่างคน slot ต้องไม่ชน
  const other = await dedicateShrineLantern("user-2", parseShrineDedicationInput({
    dedication_name: "Somsri J.",
    blessing: "",
    idempotency_key: "lantern_11111111111111111111111111111111",
  }));
  assert.ok(other.ok && other.lantern.lantern_slot === 1);

  // ledger พังต้อง rollback ทั้งยามและโคม
  const balanceBefore = fakeState.balances.get("user-1")!;
  const lanternsBefore = fakeState.lanterns.length;
  fakeState.failNextHourTransactionInsert = true;
  await assert.rejects(
    dedicateShrineLantern("user-1", parseShrineDedicationInput({
      dedication_name: "สมหญิง",
      blessing: "",
      idempotency_key: "lantern_22222222222222222222222222222222",
    })),
    /injected_hour_transaction_failure/u,
  );
  assert.equal(fakeState.balances.get("user-1"), balanceBefore);
  assert.equal(fakeState.lanterns.length, lanternsBefore);

  // ยิงพร้อมกัน key เดียว = สร้าง 1 + replay 1
  const concurrentInput = parseShrineDedicationInput({
    dedication_name: "คุณตา บุญมี",
    blessing: "อยู่ดีมีสุข",
    idempotency_key: "lantern_33333333333333333333333333333333",
  });
  const concurrent = await Promise.all([
    dedicateShrineLantern("user-1", concurrentInput),
    dedicateShrineLantern("user-1", concurrentInput),
  ]);
  assert.ok(concurrent.every((result) => result.ok));
  assert.deepEqual(
    concurrent.map((result) => result.ok && result.existing).sort(),
    [false, true],
  );
  assert.equal(fakeState.lanterns.filter((row) => row.user_id === "user-1").length, 2);

  // ครบ 3 ดวง active → 409
  const third = await dedicateShrineLantern("user-1", parseShrineDedicationInput({
    dedication_name: "คุณยาย ทองดี",
    blessing: "",
    idempotency_key: "lantern_44444444444444444444444444444444",
  }));
  assert.ok(third.ok);
  const overLimit = await dedicateShrineLantern("user-1", parseShrineDedicationInput({
    dedication_name: "เกินเพดาน",
    blessing: "",
    idempotency_key: "lantern_55555555555555555555555555555555",
  }));
  assert.ok(!overLimit.ok && overLimit.error === "lantern_limit_reached" && overLimit.status === 409);
  assert.equal(
    (!overLimit.ok && "max_active_per_user" in overLimit) ? overLimit.max_active_per_user : 0,
    DEDICATION_LANTERN_ACTIVE_LIMIT_PER_USER,
  );

  // เงินไม่พอ → 402 ไม่มี ledger เพิ่ม
  fakeState.balances.set("user-2", 3);
  const ledgerBefore = fakeState.hourTransactions;
  const poor = await dedicateShrineLantern("user-2", parseShrineDedicationInput({
    dedication_name: "เงินไม่พอ",
    blessing: "",
    idempotency_key: "lantern_66666666666666666666666666666666",
  }));
  assert.ok(!poor.ok && poor.error === "insufficient_yam" && poor.status === 402);
  assert.ok(!poor.ok && "required_yam" in poor && poor.required_yam === DEDICATION_LANTERN_COST_YAM);
  assert.ok(!poor.ok && "balance_yam" in poor && poor.balance_yam === 3);
  assert.equal(fakeState.hourTransactions, ledgerBefore);
} finally {
  mutablePool.connect = originalConnect;
}

// ---------- list mock: เห็นของเรา+คนอื่น, คำพรคนอื่นถูกซ่อน ----------
const mutablePoolQuery = pool as unknown as {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};
const originalPoolQuery = mutablePoolQuery.query;
mutablePoolQuery.query = async (sql: string) => {
  const statement = sql.replace(/\s+/gu, " ").trim();
  if (statement.startsWith("WITH account AS") && statement.includes("row_to_json")) {
    const base = {
      charged_yam: 10,
      balance_after: 90,
      idempotency_key: "lantern_77777777777777777777777777777777",
      starts_at: "2026-07-25T00:00:00+00:00",
      expires_at: "2026-08-24T00:00:00+00:00",
    };
    return {
      rows: [
        {
          hour_balance: 90,
          lantern: { ...base, id: "aaa", user_id: "viewer", dedication_name: "ของเรา", blessing: "พรลับ", lantern_slot: 0 },
        },
        {
          hour_balance: 90,
          lantern: {
            ...base, id: "bbb", user_id: "someone-else", dedication_name: "ของเพื่อน", blessing: "พรของเพื่อน",
            lantern_slot: 1, starts_at: "2026-07-26T00:00:00+00:00",
          },
        },
      ],
    };
  }
  throw new Error(`unexpected_list_query:${statement}`);
};
try {
  const list = await getShrineDedicationLanterns("viewer");
  assert.ok(list);
  assert.equal(list.cost_yam, DEDICATION_LANTERN_COST_YAM);
  assert.equal(list.duration_days, DEDICATION_LANTERN_DURATION_DAYS);
  assert.equal(list.balance_yam, 90);
  assert.equal(list.lanterns.length, 2);
  const [newest, mine] = list.lanterns;
  assert.equal(newest.id, "bbb", "newest first");
  assert.equal(newest.is_mine, false);
  assert.equal(newest.blessing, null, "another visitor's blessing must stay private");
  assert.equal(mine.id, "aaa");
  assert.equal(mine.is_mine, true);
  assert.equal(mine.blessing, "พรลับ");
} finally {
  mutablePoolQuery.query = originalPoolQuery;
}

// ---------- route-level auth guards (ไม่แตะ DB) ----------
const { GET: getLanterns, POST: postLantern } = await import(
  "../src/app/api/mobile/v1/shrine/lanterns/route"
);
const endpoint = "https://hourkey.io/api/mobile/v1/shrine/lanterns";
const validBody = JSON.stringify({
  dedication_name: "สมชาย ใจดี",
  blessing: "",
  idempotency_key: goodKey,
});
{
  const cookieOnly = await postLantern(new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "decode_auth=browser-cookie-must-not-authorize-native-mutation",
    },
    body: validBody,
  }));
  assert.equal(cookieOnly.status, 401);
  assert.deepEqual(await cookieOnly.json(), { ok: false, error: "bearer_required" });

  const textPlain = await postLantern(new Request(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer invalid-test-token", "Content-Type": "text/plain" },
    body: validBody,
  }));
  assert.equal(textPlain.status, 415);
  assert.deepEqual(await textPlain.json(), { ok: false, error: "application_json_required" });

  const invalidBearer = await postLantern(new Request(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-test-token",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: validBody,
  }));
  assert.equal(invalidBearer.status, 401);
  assert.deepEqual(await invalidBearer.json(), { ok: false, error: "not_logged_in" });

  const unauthList = await getLanterns(new Request(endpoint, {
    headers: { Authorization: "Bearer invalid-test-token" },
  }));
  assert.equal(unauthList.status, 401);
}

// ---------- real-DB integration (ยิงจริงผ่าน route handlers) ----------
if (process.env.SHRINE_DB_INTEGRATION === "1") {
  const expectedDatabase = process.env.SHRINE_TEST_DATABASE?.trim();
  assert.ok(
    isExplicitTestDatabaseName(expectedDatabase ?? ""),
    "SHRINE_TEST_DATABASE must explicitly name an isolated test or CI database",
  );
  const databaseIdentity = await pool.query<{ database_name: string }>(
    "SELECT current_database() AS database_name",
  );
  assert.equal(
    databaseIdentity.rows[0]?.database_name,
    expectedDatabase,
    "DB integration must fail closed unless connected to the named test DB",
  );
  const { signSession } = await import("../src/lib/auth");

  const runTag = randomUUID().slice(0, 8);
  const userA = randomUUID();
  const userB = randomUUID();
  await pool.query(
    `INSERT INTO users (id,email,hour_balance) VALUES
     ($1,$2,25),($3,$4,100)`,
    [userA, `lantern-a-${runTag}@test.local`, userB, `lantern-b-${runTag}@test.local`],
  );
  const tokenA = await signSession({ userId: userA, email: `lantern-a-${runTag}@test.local`, sv: 0 });
  const tokenB = await signSession({ userId: userB, email: `lantern-b-${runTag}@test.local`, sv: 0 });
  const post = (token: string, body: unknown, forwardedFor: string) =>
    postLantern(new Request(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedFor,
      },
      body: JSON.stringify(body),
    }));
  const list = (token: string, forwardedFor: string) =>
    getLanterns(new Request(endpoint, {
      headers: { Authorization: `Bearer ${token}`, "X-Forwarded-For": forwardedFor },
    }));
  const ipA = `10.99.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const ipB = `10.98.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const keyA = `lantern_${randomUUID().replace(/-/gu, "")}`;
  try {
    // ถวายดวงแรก → หัก 10 ยาม
    const dedicated = await post(tokenA, {
      dedication_name: "คุณแม่ สมศรี",
      blessing: "ขอให้แข็งแรง",
      idempotency_key: keyA,
    }, ipA);
    assert.equal(dedicated.status, 200);
    const dedicatedBody = await dedicated.json();
    assert.equal(dedicatedBody.ok, true);
    assert.equal(dedicatedBody.existing, false);
    assert.equal(dedicatedBody.charged_yam, 10);
    assert.equal(dedicatedBody.balance_after, 15);
    assert.equal(dedicatedBody.lantern.dedication_name, "คุณแม่ สมศรี");
    assert.equal(dedicatedBody.lantern.is_mine, true);
    const expiresMs = Date.parse(dedicatedBody.lantern.expires_at) - Date.parse(dedicatedBody.lantern.starts_at);
    assert.equal(Math.round(expiresMs / 86_400_000), 30, "lantern must last 30 days");

    // user B ถวาย 1 ดวง
    const otherKey = `lantern_${randomUUID().replace(/-/gu, "")}`;
    const otherDedicated = await post(tokenB, {
      dedication_name: "Grandpa Lee",
      blessing: "peace and health",
      idempotency_key: otherKey,
    }, ipB);
    assert.equal(otherDedicated.status, 200);
    const otherBody = await otherDedicated.json();
    assert.notEqual(otherBody.lantern.lantern_slot, dedicatedBody.lantern.lantern_slot);

    // list: เห็นของเรา + ของคนอื่น, คำพรคนอื่นซ่อน
    const listed = await list(tokenA, ipA);
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.ok, true);
    assert.equal(listedBody.balance_yam, 15);
    const mine = listedBody.lanterns.find((row: { id: string }) => row.id === dedicatedBody.lantern.id);
    const theirs = listedBody.lanterns.find((row: { id: string }) => row.id === otherBody.lantern.id);
    assert.ok(mine && theirs, "the hall must show both my lantern and the community lantern");
    assert.equal(mine.is_mine, true);
    assert.equal(mine.blessing, "ขอให้แข็งแรง");
    assert.equal(theirs.is_mine, false);
    assert.equal(theirs.blessing, null);

    // replay เดิม → ไม่หักซ้ำ
    const replayed = await post(tokenA, {
      dedication_name: "คุณแม่ สมศรี",
      blessing: "ขอให้แข็งแรง",
      idempotency_key: keyA,
    }, ipA);
    assert.equal(replayed.status, 200);
    const replayedBody = await replayed.json();
    assert.equal(replayedBody.existing, true);
    assert.equal(replayedBody.balance_after, 15, "a replay must never charge twice");

    // เงินไม่พอ → 402 (เหลือ 15 → หักได้อีก 1 ดวง แล้วดวงถัดไปไม่พอ)
    const second = await post(tokenA, {
      dedication_name: "คุณพ่อ สมหมาย",
      blessing: "",
      idempotency_key: `lantern_${randomUUID().replace(/-/gu, "")}`,
    }, ipA);
    assert.equal(second.status, 200);
    const poor = await post(tokenA, {
      dedication_name: "เงินไม่พอแล้ว",
      blessing: "",
      idempotency_key: `lantern_${randomUUID().replace(/-/gu, "")}`,
    }, ipA);
    assert.equal(poor.status, 402);
    const poorBody = await poor.json();
    assert.equal(poorBody.error, "insufficient_yam");
    assert.equal(poorBody.required_yam, 10);
    assert.equal(poorBody.balance_yam, 5);

    // ชื่อยาวเกิน → 400
    const tooLong = await post(tokenB, {
      dedication_name: "ชื่อยาวเกินยี่สิบตัวอักษรแน่นอนเลยจ้าา",
      blessing: "",
      idempotency_key: `lantern_${randomUUID().replace(/-/gu, "")}`,
    }, ipB);
    assert.equal(tooLong.status, 400);
    const tooLongBody = await tooLong.json();
    assert.equal(tooLongBody.error, "invalid_dedication");
    assert.equal(tooLongBody.detail, "dedication_name_too_long");

    // เกิน 3 ดวง active → 409 (user B มี 1 → เติมอีก 2 แล้วดวงที่ 4 ต้องโดนกัน)
    for (let index = 0; index < 2; index += 1) {
      const fill = await post(tokenB, {
        dedication_name: `Lantern ${index + 2}`,
        blessing: "",
        idempotency_key: `lantern_${randomUUID().replace(/-/gu, "")}`,
      }, ipB);
      assert.equal(fill.status, 200);
    }
    const overLimit = await post(tokenB, {
      dedication_name: "ดวงที่สี่",
      blessing: "",
      idempotency_key: `lantern_${randomUUID().replace(/-/gu, "")}`,
    }, ipB);
    assert.equal(overLimit.status, 409);
    assert.equal((await overLimit.json()).error, "lantern_limit_reached");

    // ledger ต้องมี 1 แถวต่อโคม
    const ledger = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM hour_transactions
        WHERE user_id=$1 AND reason='spend_shrine_dedication_lantern'`,
      [userA],
    );
    assert.equal(ledger.rows[0]?.count, 2, "two dedications = exactly two ledger rows");

    console.log("MOBILE_SHRINE_LANTERNS_DB_OK dedicate=hit ledger=1:1 replay=no-double-charge 402=ok 400=ok 409=ok list=community+mine");
  } finally {
    // ล้างข้อมูลทดสอบคืน
    await pool.query(
      `DELETE FROM hour_transactions WHERE user_id = ANY($1::uuid[])`,
      [[userA, userB]],
    );
    await pool.query(
      `DELETE FROM shrine_dedication_lanterns WHERE user_id = ANY($1::uuid[])`,
      [[userA, userB]],
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
  }
}

getRedis().disconnect();
await pool.end().catch(() => null);
console.log("MOBILE_SHRINE_LANTERNS_OK cost=10 duration=30d limit=3 idempotent=true sanitize=true");
