import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHRINE_BAG_CAPACITY,
  SHRINE_CANCEL_WINDOW_SECONDS,
  SHRINE_OFFERING_CATALOG,
  SHRINE_OFFERING_IDS,
  getShrineOfferingShop,
  offerShrineGrant,
  parseShrineOfferInput,
  parseShrinePurchaseInput,
  purchaseShrineOffering,
} from "../src/lib/shrine-offering-shop";
import { pool } from "../src/lib/db";
import { getRedis } from "../src/lib/redis";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

function isExplicitTestDatabaseName(databaseName: string): boolean {
  const segments = databaseName.trim().toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return segments.includes("test") || segments.includes("ci");
}

for (const acceptedDatabaseName of [
  "test",
  "ci",
  "hourkey_test",
  "hourkey-test",
  "test_hourkey",
  "hourkey_ci",
  "  HOURKEY-CI  ",
]) {
  assert.equal(
    isExplicitTestDatabaseName(acceptedDatabaseName),
    true,
    `test database guard must accept ${acceptedDatabaseName}`,
  );
}
for (const rejectedDatabaseName of [
  "",
  "decode_db",
  "hourkey_prod",
  "hourkey_special",
  "contest_prod",
  "civil_service",
  "testéprod",
  "prod测试ci",
]) {
  assert.equal(
    isExplicitTestDatabaseName(rejectedDatabaseName),
    false,
    `test database guard must reject ${rejectedDatabaseName}`,
  );
}

assert.deepEqual(
  SHRINE_OFFERING_CATALOG.items.map((item) => item.id),
  ["auspiciousLamp", "teaFruitOffering", "talisman", "vowFulfillment"],
  "the server catalog must own all four requested shrine offerings",
);
assert.ok(
  SHRINE_OFFERING_CATALOG.items.every((item) => (
    Number.isSafeInteger(item.cost_yam) && item.cost_yam > 0
  )),
  "every offering must have a positive server-authored Yam cost",
);
assert.ok(Object.isFrozen(SHRINE_OFFERING_CATALOG));
assert.ok(Object.isFrozen(SHRINE_OFFERING_CATALOG.items));

const purchaseInput = parseShrinePurchaseInput({
  item_id: "teaFruitOffering",
  catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
  idempotency_key: "shrine_00112233445566778899aabbccddeeff",
});
assert.deepEqual(purchaseInput, {
  itemId: "teaFruitOffering",
  catalogRevision: SHRINE_OFFERING_CATALOG.catalog_revision,
  idempotencyKey: "shrine_00112233445566778899aabbccddeeff",
});
const priorCatalogPurchaseInput = parseShrinePurchaseInput({
  item_id: "teaFruitOffering",
  catalog_revision: "shrine-offerings-v0",
  idempotency_key: "shrine_10112233445566778899aabbccddeeff",
});
assert.equal(
  priorCatalogPurchaseInput.catalogRevision,
  "shrine-offerings-v0",
  "a delayed retry must remain parseable after the server catalog advances",
);
for (const invalid of [
  {
    item_id: "fake",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: purchaseInput.idempotencyKey,
  },
  {
    item_id: "teaFruitOffering",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: "guessable",
  },
  {
    item_id: "teaFruitOffering",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: purchaseInput.idempotencyKey,
    cost_yam: 0,
  },
] as unknown[]) {
  assert.throws(
    () => parseShrinePurchaseInput(invalid),
    /shrine_shop_input_invalid/u,
    "the server must reject guessable, unknown, or client-priced purchases",
  );
}

assert.deepEqual(
  parseShrineOfferInput({
    grant_id: "550e8400-e29b-41d4-a716-446655440000",
    item_id: "teaFruitOffering",
  }),
  {
    grantId: "550e8400-e29b-41d4-a716-446655440000",
    itemId: "teaFruitOffering",
  },
);
assert.throws(
  () => parseShrineOfferInput({
    grant_id: "../other-user",
    item_id: "teaFruitOffering",
  }),
  /shrine_shop_input_invalid/u,
);

const migration = read("migrations/20260726_shrine_offering_shop.sql");
for (const marker of [
  "CREATE TABLE IF NOT EXISTS shrine_offering_grants",
  "REFERENCES users(id) ON DELETE CASCADE",
  "UNIQUE (user_id, idempotency_key)",
  "CHECK (item_id IN ('auspiciousLamp','teaFruitOffering','talisman','vowFulfillment'))",
  "CHECK (state IN ('purchased','offered'))",
  "CHECK (idempotency_key ~ '^shrine_[0-9a-f]{32}$')",
  "CHECK ((state='purchased' AND offered_at IS NULL)",
  "CREATE INDEX IF NOT EXISTS idx_shrine_offering_grants_user_state",
  "WHERE state='purchased'",
  "CREATE OR REPLACE FUNCTION enforce_shrine_offering_grant_transition()",
  "OLD.state='purchased' AND NEW.state='offered'",
  "CREATE TRIGGER shrine_offering_grant_transition",
  "BEFORE UPDATE OF state, offered_at ON shrine_offering_grants",
  "REVOKE ALL PRIVILEGES ON TABLE shrine_offering_grants FROM hourkey_app",
  "GRANT SELECT, INSERT ON shrine_offering_grants TO hourkey_app",
  "GRANT UPDATE (state, offered_at) ON shrine_offering_grants TO hourkey_app",
]) {
  assert.ok(migration.includes(marker), `migration is missing ${marker}`);
}
assert.doesNotMatch(
  migration,
  /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+shrine_offering_grants/iu,
  "the runtime role may not rewrite ownership or accounting columns",
);

const helperSource = read("src/lib/shrine-offering-shop.ts");
for (const marker of [
  "BEGIN",
  "pg_advisory_xact_lock",
  "hour_balance >= $2",
  "INSERT INTO shrine_offering_grants",
  "INSERT INTO hour_transactions",
  "COMMIT",
  "ROLLBACK",
  "state='offered'",
]) {
  assert.ok(helperSource.includes(marker), `atomic Shrine shop helper is missing ${marker}`);
}
assert.doesNotMatch(
  helperSource,
  /Math\.random/u,
  "purchase or grant identifiers must never use Math.random",
);
assert.match(
  helperSource,
  /WHERE user_id=\$1 AND idempotency_key=\$2[\s\S]{0,120}FOR UPDATE/u,
  "a purchase retry must serialize with a concurrent altar offer before reporting grant state",
);

const shopRouteSource = read("src/app/api/mobile/v1/shrine/shop/route.ts");
const offerRouteSource = read("src/app/api/mobile/v1/shrine/shop/offer/route.ts");
const shopGetRouteSource = shopRouteSource.slice(
  shopRouteSource.indexOf("export async function GET"),
  shopRouteSource.indexOf("export async function POST"),
);
for (const [label, source] of [
  ["shop", shopRouteSource],
  ["offer", offerRouteSource],
] as const) {
  assert.match(
    source,
    /mobile-shrine-shop-[a-z-]+-ip:\$\{ip\}/u,
    `${label} must apply an IP-only limiter before authentication`,
  );
  assert.match(
    source,
    /mobile-shrine-shop-[a-z-]+-user:\$\{session\.userId\}/u,
    `${label} must apply a user-only limiter after authentication`,
  );
  const firstHandler = source.indexOf("export async function");
  const ipLimitIndex = source.indexOf("-ip:${ip}", firstHandler);
  const bearerAuthIndex = source.indexOf("await validateMobileBearerToken", firstHandler);
  const sessionAuthIndex = source.indexOf("await getMobileSession", firstHandler);
  const authIndexes = [bearerAuthIndex, sessionAuthIndex].filter((index) => index >= 0);
  const firstAuthIndex = Math.min(...authIndexes);
  assert.ok(
    ipLimitIndex >= firstHandler
      && authIndexes.length > 0
      && ipLimitIndex < firstAuthIndex,
    `${label} IP limiting must precede session database work`,
  );
}
assert.match(
  shopGetRouteSource,
  /createHash\("sha256"\)\.update\(bearer\)\.digest\("hex"\)/u,
  "shop GET must fingerprint bearer credentials before authentication",
);
const getBearerLimitIndex = shopGetRouteSource.indexOf(
  "-bearer:${bearerFingerprint}",
);
const getIpLimitIndex = shopGetRouteSource.indexOf("-ip:${ip}");
const getSessionIndex = shopGetRouteSource.indexOf("await getMobileSession");
assert.ok(
  getIpLimitIndex >= 0
    && getBearerLimitIndex >= 0
    && getSessionIndex >= 0
    && getIpLimitIndex < getBearerLimitIndex
    && getBearerLimitIndex < getSessionIndex,
  "shop GET limiting must run IP then bearer before session database work",
);
assert.match(
  shopRouteSource,
  /createHash\("sha256"\)\.update\(bearer\)\.digest\("hex"\)/u,
  "purchase mutations must limit a bearer fingerprint across changing IP addresses before authentication",
);
assert.match(
  offerRouteSource,
  /createHash\("sha256"\)\.update\(bearer\)\.digest\("hex"\)/u,
  "offering mutations must limit a bearer fingerprint across changing IP addresses before authentication",
);

const shrineTestSource = read("scripts/test-mobile-shrine-shop.mts");
const integrationBlock = shrineTestSource.slice(
  shrineTestSource.lastIndexOf(
    'if (process.env.SHRINE_DB_INTEGRATION === "1")',
  ),
);
for (const marker of [
  "SHRINE_TEST_DATABASE",
  "SELECT current_database() AS database_name",
  'isExplicitTestDatabaseName(expectedDatabase ?? "")',
  "finally",
  "DELETE FROM hour_transactions",
  "DELETE FROM shrine_offering_grants",
  "UPDATE users SET hour_balance=$2",
]) {
  assert.ok(
    integrationBlock.includes(marker),
    `real DB integration needs an explicit test-database guard and cleanup marker: ${marker}`,
  );
}

const mutablePoolQuery = pool as unknown as {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};
const originalPoolQuery = mutablePoolQuery.query;
const purchasedInventoryRows = [
  {
    id: "110e8400-e29b-41d4-a716-446655440000",
    purchase_id: "210e8400-e29b-41d4-a716-446655440000",
    item_id: "auspiciousLamp",
    state: "purchased",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    charged_yam: 1,
    balance_after: 9,
    idempotency_key: "shrine_11111111111111111111111111111111",
  },
  {
    id: "310e8400-e29b-41d4-a716-446655440000",
    purchase_id: "410e8400-e29b-41d4-a716-446655440000",
    item_id: "teaFruitOffering",
    state: "purchased",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    charged_yam: 1,
    balance_after: 8,
    idempotency_key: "shrine_22222222222222222222222222222222",
  },
];
const latestOfferedRows = [
  {
    id: "510e8400-e29b-41d4-a716-446655440000",
    purchase_id: "610e8400-e29b-41d4-a716-446655440000",
    item_id: "talisman",
    state: "offered",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    charged_yam: 1,
    balance_after: 7,
    idempotency_key: "shrine_33333333333333333333333333333333",
  },
];
const inventoryQueries: string[] = [];
mutablePoolQuery.query = async (sql: string) => {
  const statement = sql.replace(/\s+/gu, " ").trim();
  inventoryQueries.push(statement);
  if (
    statement.startsWith("WITH account AS")
    && statement.includes("state='purchased'")
    && statement.includes("state='offered'")
  ) {
    return {
      rows: [...purchasedInventoryRows, ...latestOfferedRows].map((grant, index) => ({
        hour_balance: 7,
        purchased_total: purchasedInventoryRows.length,
        id: grant.id,
        item_id: grant.item_id,
        purchased_at: new Date(Date.UTC(2026, 6, 23, 0, 0, index)).toISOString(),
        state: grant.state,
      })),
    };
  }
  throw new Error(`unexpected_inventory_query:${statement}`);
};
try {
  const inventory = await getShrineOfferingShop("user-1");
  assert.ok(inventory);
  assert.deepEqual(
    inventory.grants.filter((grant) => grant.state === "purchased").map((grant) => grant.id),
    purchasedInventoryRows.map((grant) => grant.id),
    "every unoffered paid grant must survive relaunch inventory recovery",
  );
  assert.deepEqual(
    inventory.grants.filter((grant) => grant.state === "offered").map((grant) => grant.id),
    latestOfferedRows.map((grant) => grant.id),
    "bounded offered restoration state must remain visible",
  );
  assert.equal(
    inventoryQueries.length,
    1,
    "balance, paid inventory, and offered restoration state must share one database snapshot",
  );
  // 2 ส.ค. 2569: เปลี่ยนเจตนาเดิม — เดิมห้าม LIMIT เพราะกลัวของหาย
  // แต่ของจริงคือถ้าเกิน 128 ชิ้น แอพรุ่นเดิมทิ้งทั้งก้อน = ร้านพังถาวร กู้เองไม่ได้
  // ตอนนี้จึงส่งไม่เกินเพดานย่าม + บอกยอดรวมจริงแยกช่อง และเรียงเก่าก่อนเพื่อถวายไล่ออกได้
  assert.ok(
    inventoryQueries[0].includes("state='purchased'")
      && inventoryQueries[0].includes("LIMIT $2")
      && inventoryQueries[0].includes("ORDER BY purchased_at ASC,id ASC"),
    "the purchased inventory query must be bounded by the server bag capacity, oldest first",
  );
  assert.equal(
    inventory.bag_capacity,
    SHRINE_BAG_CAPACITY,
    "the shop must publish the server-owned bag capacity",
  );
  assert.ok(
    SHRINE_BAG_CAPACITY + SHRINE_OFFERING_IDS.length < 128,
    "the capacity plus bounded offered history must stay under the legacy client ceiling of 128",
  );
  assert.equal(inventory.bag_used, purchasedInventoryRows.length);
  assert.equal(inventory.bag_full, false);
  assert.equal(inventory.bag_truncated, false);
  assert.equal(inventory.cancel_window_seconds, SHRINE_CANCEL_WINDOW_SECONDS);
  assert.ok(
    inventoryQueries[0].includes("SELECT DISTINCT ON (item_id)")
      && inventoryQueries[0].includes("state='offered'"),
    "offered history must be bounded by item identity rather than row count",
  );
} finally {
  mutablePoolQuery.query = originalPoolQuery;
}

type FakeGrant = {
  id: string;
  purchase_id: string;
  user_id: string;
  item_id: string;
  state: "purchased" | "offered";
  catalog_revision: string;
  charged_yam: number;
  balance_after: number;
  idempotency_key: string;
};
const fakeState = {
  balance: 3,
  commits: 0,
  failNextHourTransactionInsert: false,
  grants: [] as FakeGrant[],
  hourTransactions: 0,
  releases: 0,
  rollbacks: 0,
};
type FakePersistentSnapshot = {
  balance: number;
  grants: FakeGrant[];
  hourTransactions: number;
};
const fakeAdvisoryLocks = new Map<string, {
  held: boolean;
  waiters: Array<() => void>;
}>();

function snapshotFakePersistentState(): FakePersistentSnapshot {
  return {
    balance: fakeState.balance,
    grants: fakeState.grants.map((grant) => ({ ...grant })),
    hourTransactions: fakeState.hourTransactions,
  };
}

function restoreFakePersistentState(snapshot: FakePersistentSnapshot) {
  fakeState.balance = snapshot.balance;
  fakeState.grants.splice(
    0,
    fakeState.grants.length,
    ...snapshot.grants.map((grant) => ({ ...grant })),
  );
  fakeState.hourTransactions = snapshot.hourTransactions;
}

async function acquireFakeAdvisoryLock(key: string): Promise<() => void> {
  let lock = fakeAdvisoryLocks.get(key);
  if (!lock) {
    lock = { held: false, waiters: [] };
    fakeAdvisoryLocks.set(key, lock);
  }
  if (lock.held) {
    await new Promise<void>((resolve) => {
      lock!.waiters.push(resolve);
    });
  } else {
    lock.held = true;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = lock!.waiters.shift();
    if (next) {
      next();
      return;
    }
    lock!.held = false;
    fakeAdvisoryLocks.delete(key);
  };
}

function createFakeClient() {
  let inTransaction = false;
  let transactionSnapshot: FakePersistentSnapshot | null = null;
  const releaseLocks: Array<() => void> = [];
  const ensureSnapshot = () => {
    if (inTransaction && !transactionSnapshot) {
      transactionSnapshot = snapshotFakePersistentState();
    }
  };
  const finishTransaction = (rollback: boolean) => {
    if (rollback && transactionSnapshot) restoreFakePersistentState(transactionSnapshot);
    transactionSnapshot = null;
    inTransaction = false;
    releaseLocks.splice(0).forEach((release) => release());
  };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const statement = sql.replace(/\s+/gu, " ").trim();
      if (statement === "BEGIN") {
        inTransaction = true;
        return { rows: [] as T[] };
      }
      if (statement === "COMMIT") {
        fakeState.commits += 1;
        finishTransaction(false);
        return { rows: [] as T[] };
      }
      if (statement === "ROLLBACK") {
        fakeState.rollbacks += 1;
        finishTransaction(true);
        return { rows: [] as T[] };
      }
      if (statement.includes("pg_advisory_xact_lock")) {
        releaseLocks.push(await acquireFakeAdvisoryLock(String(params[0])));
        ensureSnapshot();
        return { rows: [] as T[] };
      }

      ensureSnapshot();
      if (
        statement.includes("FROM shrine_offering_grants")
        && statement.includes("idempotency_key=$2")
      ) {
        const row = fakeState.grants.find((grant) => (
          grant.user_id === params[0] && grant.idempotency_key === params[1]
        ));
        return { rows: (row ? [{ ...row }] : []) as T[] };
      }
      // ร่องรอยการคืนเงิน: กันคำสั่งซื้อค้างคิวยิงซ้ำแล้วหักยามรอบสอง
      if (statement.includes("FROM shrine_offering_refunds")) {
        return { rows: [] as T[] };
      }
      // ด่านย่ามเต็ม: นับของที่ซื้อแล้วยังไม่ถวายก่อนหักยาม
      if (
        statement.includes("COUNT(*)::int AS purchased_total")
        && statement.includes("FROM shrine_offering_grants")
      ) {
        const purchasedTotal = fakeState.grants.filter((grant) => (
          grant.user_id === params[0] && grant.state === "purchased"
        )).length;
        return { rows: [{ purchased_total: purchasedTotal }] as T[] };
      }
      if (
        statement.startsWith("UPDATE users")
        && statement.includes("hour_balance >= $2")
      ) {
        const cost = Number(params[1]);
        if (params[0] !== "user-1" || fakeState.balance < cost) {
          return { rows: [] as T[] };
        }
        fakeState.balance -= cost;
        return { rows: [{ hour_balance: fakeState.balance }] as T[] };
      }
      if (
        statement.startsWith("SELECT hour_balance FROM users")
        && params[0] === "user-1"
      ) {
        return { rows: [{ hour_balance: fakeState.balance }] as T[] };
      }
      if (statement.startsWith("INSERT INTO shrine_offering_grants")) {
        const userId = String(params[2]);
        const itemId = String(params[3]);
        const idempotencyKey = String(params[7]);
        if (fakeState.grants.some((grant) => (
          grant.user_id === userId && grant.idempotency_key === idempotencyKey
        ))) {
          throw new Error("fake_unique_user_idempotency");
        }
        if (fakeState.grants.some((grant) => (
          grant.user_id === userId
          && grant.item_id === itemId
          && grant.state === "purchased"
        ))) {
          throw new Error("fake_unique_unoffered_item");
        }
        fakeState.grants.push({
          id: String(params[0]),
          purchase_id: String(params[1]),
          user_id: userId,
          item_id: itemId,
          state: "purchased",
          catalog_revision: String(params[4]),
          charged_yam: Number(params[5]),
          balance_after: Number(params[6]),
          idempotency_key: idempotencyKey,
        });
        return { rows: [] as T[] };
      }
      if (statement.startsWith("INSERT INTO hour_transactions")) {
        if (fakeState.failNextHourTransactionInsert) {
          fakeState.failNextHourTransactionInsert = false;
          throw new Error("injected_hour_transaction_failure");
        }
        fakeState.hourTransactions += 1;
        return { rows: [] as T[] };
      }
      if (
        statement.includes("FROM shrine_offering_grants")
        && statement.includes("WHERE id=$1 AND user_id=$2")
      ) {
        const row = fakeState.grants.find((grant) => (
          grant.id === params[0] && grant.user_id === params[1]
        ));
        return { rows: (row ? [{ ...row }] : []) as T[] };
      }
      if (
        statement.startsWith("UPDATE shrine_offering_grants")
        && statement.includes("state='offered'")
      ) {
        const row = fakeState.grants.find((grant) => (
          grant.id === params[0] && grant.user_id === params[1]
        ));
        if (row?.state === "purchased") row.state = "offered";
        return { rows: [] as T[] };
      }
      throw new Error(`unexpected_fake_query:${statement}`);
    },
    release() {
      fakeState.releases += 1;
    },
  };
}
type FakeClient = ReturnType<typeof createFakeClient>;
const mutablePool = pool as unknown as {
  connect: () => Promise<FakeClient>;
};
const originalConnect = mutablePool.connect;
mutablePool.connect = async () => createFakeClient();
try {
  const first = await purchaseShrineOffering("user-1", purchaseInput);
  assert.equal(first.ok, true);
  assert.equal(first.existing, false);
  assert.equal(first.balance_after, 2);
  assert.equal(fakeState.hourTransactions, 1);
  assert.equal(fakeState.grants.length, 1);

  const retry = await purchaseShrineOffering("user-1", purchaseInput);
  assert.equal(retry.ok, true);
  assert.equal(retry.existing, true);
  assert.equal(retry.purchase_id, first.purchase_id);
  assert.equal(fakeState.balance, 2);
  assert.equal(fakeState.hourTransactions, 1, "an idempotent retry must never charge twice");

  const offered = await offerShrineGrant("user-1", {
    grantId: first.grant.id,
    itemId: "teaFruitOffering",
  });
  assert.equal(offered.ok, true);
  assert.equal(offered.existing, false);
  assert.equal(fakeState.grants[0].state, "offered");
  const offerRetry = await offerShrineGrant("user-1", {
    grantId: first.grant.id,
    itemId: "teaFruitOffering",
  });
  assert.equal(offerRetry.ok, true);
  assert.equal(offerRetry.existing, true);

  const purchaseRetryAfterOffer = await purchaseShrineOffering("user-1", purchaseInput);
  assert.equal(purchaseRetryAfterOffer.ok, true);
  assert.equal(purchaseRetryAfterOffer.existing, true);
  assert.equal(
    purchaseRetryAfterOffer.grant.state,
    "offered",
    "an idempotent retry must report current server state without charging or re-carrying the prop",
  );
  assert.equal(fakeState.hourTransactions, 1);

  const balanceBeforeStalePurchase = fakeState.balance;
  const grantsBeforeStalePurchase = fakeState.grants.length;
  const staleNewPurchase = await purchaseShrineOffering(
    "user-1",
    priorCatalogPurchaseInput,
  );
  assert.equal(staleNewPurchase.ok, false);
  assert.equal(staleNewPurchase.error, "catalog_revision_stale");
  assert.equal(
    fakeState.balance,
    balanceBeforeStalePurchase,
    "a stale catalog must never authorize a new Yam debit",
  );
  assert.equal(fakeState.grants.length, grantsBeforeStalePurchase);
  assert.equal(fakeState.hourTransactions, 1);

  fakeState.grants.push({
    id: "750e8400-e29b-41d4-a716-446655440000",
    purchase_id: "850e8400-e29b-41d4-a716-446655440000",
    user_id: "user-1",
    item_id: priorCatalogPurchaseInput.itemId,
    state: "offered",
    catalog_revision: priorCatalogPurchaseInput.catalogRevision,
    charged_yam: 1,
    balance_after: fakeState.balance,
    idempotency_key: priorCatalogPurchaseInput.idempotencyKey,
  });
  const priorCatalogRetry = await purchaseShrineOffering(
    "user-1",
    priorCatalogPurchaseInput,
  );
  assert.equal(priorCatalogRetry.ok, true);
  assert.equal(priorCatalogRetry.existing, true);
  assert.equal(priorCatalogRetry.grant.state, "offered");
  assert.equal(
    fakeState.hourTransactions,
    1,
    "a delayed replay from a prior catalog must recover its persisted result without charging",
  );

  const conflictingReplay = await purchaseShrineOffering("user-1", {
    ...purchaseInput,
    itemId: "talisman",
  });
  assert.equal(conflictingReplay.ok, false);
  assert.equal(conflictingReplay.error, "idempotency_conflict");
  assert.equal(fakeState.hourTransactions, 1);

  const balanceBeforeLedgerFailure = fakeState.balance;
  const grantsBeforeLedgerFailure = fakeState.grants.map((grant) => ({ ...grant }));
  const transactionsBeforeLedgerFailure = fakeState.hourTransactions;
  fakeState.failNextHourTransactionInsert = true;
  await assert.rejects(
    purchaseShrineOffering("user-1", parseShrinePurchaseInput({
      item_id: "talisman",
      catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
      idempotency_key: "shrine_44444444444444444444444444444444",
    })),
    /injected_hour_transaction_failure/u,
    "a ledger failure must abort the purchase",
  );
  assert.equal(
    fakeState.balance,
    balanceBeforeLedgerFailure,
    "ROLLBACK must restore the Yam debit after a ledger failure",
  );
  assert.deepEqual(
    fakeState.grants,
    grantsBeforeLedgerFailure,
    "ROLLBACK must remove a grant whose ledger insert failed",
  );
  assert.equal(fakeState.hourTransactions, transactionsBeforeLedgerFailure);

  const concurrentInput = parseShrinePurchaseInput({
    item_id: "talisman",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: "shrine_55555555555555555555555555555555",
  });
  const concurrentResults = await Promise.all([
    purchaseShrineOffering("user-1", concurrentInput),
    purchaseShrineOffering("user-1", concurrentInput),
  ]);
  assert.ok(concurrentResults.every((result) => result.ok));
  assert.deepEqual(
    concurrentResults.map((result) => result.existing).sort(),
    [false, true],
    "the advisory lock must serialize same-key purchases into one creation and one replay",
  );
  assert.equal(fakeState.balance, balanceBeforeLedgerFailure - 1);
  assert.equal(fakeState.hourTransactions, transactionsBeforeLedgerFailure + 1);
  assert.equal(
    fakeState.grants.filter((grant) => grant.idempotency_key === concurrentInput.idempotencyKey).length,
    1,
    "concurrent same-key purchases must persist one grant",
  );

  fakeState.balance = 0;
  const insufficient = await purchaseShrineOffering("user-1", parseShrinePurchaseInput({
    item_id: "talisman",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: "shrine_ffeeddccbbaa99887766554433221100",
  }));
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.error, "insufficient_yam");
  assert.equal(fakeState.hourTransactions, transactionsBeforeLedgerFailure + 1);
  assert.ok(fakeState.rollbacks >= 1);
} finally {
  mutablePool.connect = originalConnect;
}

if (process.env.SHRINE_DB_INTEGRATION === "1") {
  const userId = process.env.SHRINE_TEST_USER_ID;
  const otherUserId = process.env.SHRINE_TEST_OTHER_USER_ID;
  const expectedDatabase = process.env.SHRINE_TEST_DATABASE?.trim();
  assert.match(userId ?? "", /^[0-9a-f-]{36}$/iu);
  assert.match(otherUserId ?? "", /^[0-9a-f-]{36}$/iu);
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
    "DB integration must fail closed unless the connected database is the explicitly named test DB",
  );

  const realIdempotencyKey = "shrine_abcdef0123456789abcdef0123456789";
  let originalBalance: number | null = null;
  try {
    const shopBefore = await getShrineOfferingShop(userId!);
    assert.equal(shopBefore?.balance_yam, 3);
    assert.deepEqual(shopBefore?.grants, []);
    originalBalance = shopBefore.balance_yam;

    const realPurchaseInput = parseShrinePurchaseInput({
      item_id: "vowFulfillment",
      catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
      idempotency_key: realIdempotencyKey,
    });
    const realPurchase = await purchaseShrineOffering(userId!, realPurchaseInput);
    assert.equal(realPurchase.ok, true);
    assert.equal(realPurchase.existing, false);
    assert.equal(realPurchase.balance_after, 2);

    const realRetry = await purchaseShrineOffering(userId!, realPurchaseInput);
    assert.equal(realRetry.ok, true);
    assert.equal(realRetry.existing, true);
    assert.equal(realRetry.purchase_id, realPurchase.purchase_id);
    assert.equal(realRetry.balance_after, 2);

    const crossUserOffer = await offerShrineGrant(otherUserId!, {
      grantId: realPurchase.grant.id,
      itemId: "vowFulfillment",
    });
    assert.equal(crossUserOffer.ok, false);
    assert.equal(crossUserOffer.error, "grant_not_found");

    const realOffer = await offerShrineGrant(userId!, {
      grantId: realPurchase.grant.id,
      itemId: "vowFulfillment",
    });
    assert.equal(realOffer.ok, true);
    assert.equal(realOffer.existing, false);
    const realOfferRetry = await offerShrineGrant(userId!, {
      grantId: realPurchase.grant.id,
      itemId: "vowFulfillment",
    });
    assert.equal(realOfferRetry.ok, true);
    assert.equal(realOfferRetry.existing, true);

    const shopAfter = await getShrineOfferingShop(userId!);
    assert.equal(shopAfter?.balance_yam, 2);
    assert.deepEqual(shopAfter?.grants, [{
      id: realPurchase.grant.id,
      item_id: "vowFulfillment",
      state: "offered",
    }]);
    const persistedLedger = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM hour_transactions
        WHERE user_id=$1 AND ref_payment_id=$2`,
      [userId, `shrine_purchase:${realPurchase.purchase_id}`],
    );
    assert.equal(
      persistedLedger.rows[0]?.count,
      1,
      "real PostgreSQL replay must persist exactly one Yam ledger row",
    );
    console.log("MOBILE_SHRINE_SHOP_DB_OK purchase=1 ledger=1 offer=offered cross-user=blocked");
  } finally {
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query("BEGIN");
      await cleanupClient.query(
        `DELETE FROM hour_transactions AS ledger
          USING shrine_offering_grants AS grant
         WHERE grant.user_id=$1
           AND grant.idempotency_key=$2
           AND ledger.user_id=grant.user_id
           AND ledger.ref_payment_id='shrine_purchase:' || grant.purchase_id`,
        [userId, realIdempotencyKey],
      );
      await cleanupClient.query(
        `DELETE FROM shrine_offering_grants
          WHERE user_id=$1 AND idempotency_key=$2`,
        [userId, realIdempotencyKey],
      );
      if (originalBalance !== null) {
        await cleanupClient.query(
          "UPDATE users SET hour_balance=$2 WHERE id=$1",
          [userId, originalBalance],
        );
      }
      await cleanupClient.query("COMMIT");
    } catch (error) {
      await cleanupClient.query("ROLLBACK").catch(() => null);
      throw error;
    } finally {
      cleanupClient.release();
    }
  }
}

const { POST: postShrinePurchase } = await import(
  "../src/app/api/mobile/v1/shrine/shop/route"
);
const { POST: postShrineOffer } = await import(
  "../src/app/api/mobile/v1/shrine/shop/offer/route"
);
const purchaseBody = JSON.stringify({
  item_id: purchaseInput.itemId,
  catalog_revision: purchaseInput.catalogRevision,
  idempotency_key: purchaseInput.idempotencyKey,
});
const offerBody = JSON.stringify({
  grant_id: "550e8400-e29b-41d4-a716-446655440000",
  item_id: "teaFruitOffering",
});

for (const [label, route, body] of [
  ["purchase", postShrinePurchase, purchaseBody],
  ["offer", postShrineOffer, offerBody],
] as const) {
  const cookieOnly = await route(new Request(`https://hourkey.io/api/mobile/v1/shrine/shop/${label}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "decode_auth=browser-cookie-must-not-authorize-native-mutation",
    },
    body,
  }));
  assert.equal(cookieOnly.status, 401, `${label} mutation must reject cookie-only auth`);
  assert.deepEqual(
    await cookieOnly.json(),
    { ok: false, error: "bearer_required" },
    `${label} mutation must fail before browser cookie lookup`,
  );

  const textPlain = await route(new Request(`https://hourkey.io/api/mobile/v1/shrine/shop/${label}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-test-token",
      "Content-Type": "text/plain",
    },
    body,
  }));
  assert.equal(textPlain.status, 415, `${label} mutation must reject simple text/plain CSRF bodies`);
  assert.deepEqual(
    await textPlain.json(),
    { ok: false, error: "application_json_required" },
  );

  const invalidBearer = await route(new Request(`https://hourkey.io/api/mobile/v1/shrine/shop/${label}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer invalid-test-token",
      "Content-Type": "application/json; charset=utf-8",
    },
    body,
  }));
  assert.equal(invalidBearer.status, 401, `${label} mutation must validate the supplied bearer`);
  assert.deepEqual(await invalidBearer.json(), { ok: false, error: "not_logged_in" });
}

getRedis().disconnect();
console.log("MOBILE_SHRINE_SHOP_OK items=4 currency=yam atomic=true idempotent=true");
