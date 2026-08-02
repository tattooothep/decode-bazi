/**
 * ชุดทดสอบตรรกะ "เงินจริง" ของศาลเจ้า (2 ส.ค. 2569)
 *  - คืนซ้ำต้องได้ครั้งเดียว (กุญแจเดิม / กดพร้อมกัน / กุญแจใหม่บนของชิ้นเดิม)
 *  - เกินหน้าต่างเวลาต้องปฏิเสธ
 *  - ของที่ถวายแล้วต้องปฏิเสธ
 *  - ย่ามเต็มต้องซื้อไม่ได้ และห้ามหักยาม
 *  - ล้มกลางทางต้องย้อนหมด ไม่มีสภาพครึ่งๆ
 * ทดสอบด้วยฐานข้อมูลจำลองในหน่วยความจำ (ไม่แตะข้อมูลผู้ใช้จริง)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHRINE_BAG_CAPACITY,
  SHRINE_CANCEL_WINDOW_SECONDS,
  SHRINE_OFFERING_CATALOG,
  SHRINE_OFFERING_IDS,
  cancelShrineOfferingPurchase,
  offerShrineGrant,
  parseShrineCancelInput,
  parseShrinePurchaseInput,
  purchaseShrineOffering,
} from "../src/lib/shrine-offering-shop";
import { pool } from "../src/lib/db";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");
let checks = 0;
const ok = (condition: unknown, detail: string) => {
  assert.ok(condition, detail);
  checks += 1;
};
const eq = (actual: unknown, expected: unknown, detail: string) => {
  assert.equal(actual, expected, detail);
  checks += 1;
};

/* ─── เพดานย่ามต้องต่ำกว่าเพดานแอพรุ่นเดิมเสมอ ─── */
ok(
  SHRINE_BAG_CAPACITY + SHRINE_OFFERING_IDS.length < 128,
  "เพดานย่าม + ของที่ถวายล่าสุดชนิดละชิ้น ต้องต่ำกว่า 128 ของแอพรุ่นเดิม",
);
ok(SHRINE_CANCEL_WINDOW_SECONDS > 0 && SHRINE_CANCEL_WINDOW_SECONDS <= 300, "หน้าต่างยกเลิกต้องสั้น");

/* ─── ตัวตรวจอินพุตยกเลิก ─── */
const goodGrantId = "550e8400-e29b-41d4-a716-446655440000";
assert.deepEqual(
  parseShrineCancelInput({
    grant_id: goodGrantId,
    item_id: "talisman",
    idempotency_key: "shrine_99998888777766665555444433332222",
  }),
  {
    grantId: goodGrantId,
    itemId: "talisman",
    idempotencyKey: "shrine_99998888777766665555444433332222",
  },
);
checks += 1;
for (const invalid of [
  { grant_id: "not-a-uuid", item_id: "talisman", idempotency_key: "shrine_99998888777766665555444433332222" },
  { grant_id: goodGrantId, item_id: "fake", idempotency_key: "shrine_99998888777766665555444433332222" },
  { grant_id: goodGrantId, item_id: "talisman", idempotency_key: "guessable" },
  { grant_id: goodGrantId, item_id: "talisman", idempotency_key: "shrine_99998888777766665555444433332222", refund_yam: 99 },
] as unknown[]) {
  assert.throws(() => parseShrineCancelInput(invalid), /shrine_shop_input_invalid/u);
  checks += 1;
}

/* ─── ฐานข้อมูลจำลอง ─── */
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
  purchased_at: number;
};
type FakeRefund = {
  id: string;
  user_id: string;
  grant_id: string;
  purchase_id: string;
  item_id: string;
  refunded_yam: number;
  balance_after: number;
  idempotency_key: string;
  purchase_idempotency_key: string;
};
type FakeTx = { user_id: string; delta: number; reason: string; ref_payment_id: string | null };

const db = {
  balances: new Map<string, number>(),
  grants: [] as FakeGrant[],
  refunds: [] as FakeRefund[],
  transactions: [] as FakeTx[],
  failNextLedgerInsert: false,
  rollbacks: 0,
  commits: 0,
};
/**
 * ROLLBACK ใช้ "บันทึกการย้อน" ต่อรายการ (ไม่ใช่ก๊อปสถานะทั้งก้อน)
 * เพราะหลายรายการทำงานคาบเกี่ยวกันได้ ถ้าย้อนทั้งก้อนจะไปลบงานที่รายการอื่น commit แล้ว
 */
type Undo = () => void;

const advisoryLocks = new Map<string, { held: boolean; waiters: Array<() => void> }>();
async function acquireLock(key: string): Promise<() => void> {
  let lock = advisoryLocks.get(key);
  if (!lock) {
    lock = { held: false, waiters: [] };
    advisoryLocks.set(key, lock);
  }
  if (lock.held) {
    await new Promise<void>((resolve) => { lock!.waiters.push(resolve); });
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
    advisoryLocks.delete(key);
  };
}

function createFakeClient() {
  const undo: Undo[] = [];
  const releaseLocks: Array<() => void> = [];
  const finish = (rollback: boolean) => {
    if (rollback) undo.splice(0).reverse().forEach((step) => step());
    undo.length = 0;
    releaseLocks.splice(0).forEach((release) => release());
  };
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const statement = sql.replace(/\s+/gu, " ").trim();
      if (statement === "BEGIN") { return { rows: [] as T[] }; }
      if (statement === "COMMIT") { db.commits += 1; finish(false); return { rows: [] as T[] }; }
      if (statement === "ROLLBACK") { db.rollbacks += 1; finish(true); return { rows: [] as T[] }; }
      if (statement.includes("pg_advisory_xact_lock")) {
        releaseLocks.push(await acquireLock(String(params[0])));
        return { rows: [] as T[] };
      }

      if (statement.includes("purchase_idempotency_key=$2")) {
        const row = db.refunds.find((refund) => (
          refund.user_id === params[0] && refund.purchase_idempotency_key === params[1]
        ));
        return { rows: (row ? [{ id: row.id }] : []) as T[] };
      }
      if (statement.includes("FROM shrine_offering_refunds")) {
        const row = db.refunds.find((refund) => (
          refund.user_id === params[0] && refund.idempotency_key === params[1]
        ));
        return { rows: (row ? [{ ...row }] : []) as T[] };
      }
      if (
        statement.includes("FROM shrine_offering_grants")
        && statement.includes("idempotency_key=$2")
      ) {
        const row = db.grants.find((grant) => (
          grant.user_id === params[0] && grant.idempotency_key === params[1]
        ));
        return { rows: (row ? [{ ...row }] : []) as T[] };
      }
      if (
        statement.includes("COUNT(*)::int AS purchased_total")
        && statement.includes("FROM shrine_offering_grants")
      ) {
        const total = db.grants.filter((grant) => (
          grant.user_id === params[0] && grant.state === "purchased"
        )).length;
        return { rows: [{ purchased_total: total }] as T[] };
      }
      if (
        statement.startsWith("SELECT")
        && statement.includes("FROM shrine_offering_grants")
        && statement.includes("WHERE id=$1 AND user_id=$2")
      ) {
        const row = db.grants.find((grant) => (
          grant.id === params[0] && grant.user_id === params[1]
        ));
        return {
          rows: (row
            ? [{
                ...row,
                purchased_at: new Date(row.purchased_at).toISOString(),
                age_seconds: (Date.now() - row.purchased_at) / 1000,
              }]
            : []) as T[],
        };
      }
      if (statement.startsWith("DELETE FROM shrine_offering_grants")) {
        const index = db.grants.findIndex((grant) => (
          grant.id === params[0] && grant.user_id === params[1] && grant.state === "purchased"
        ));
        if (index < 0) return { rows: [] as T[] };
        // ตัวดักระดับฐานข้อมูล: ห้ามลบของที่ถวายแล้ว (จำลอง trigger)
        if (db.grants[index].state !== "purchased") throw new Error("invalid_shrine_offering_grant_delete");
        const [removed] = db.grants.splice(index, 1);
        undo.push(() => { db.grants.splice(index, 0, removed); });
        return { rows: [{ id: removed.id }] as T[] };
      }
      if (statement.startsWith("UPDATE users") && statement.includes("hour_balance >= $2")) {
        const userId = String(params[0]);
        const cost = Number(params[1]);
        const balance = db.balances.get(userId);
        if (balance === undefined || balance < cost) return { rows: [] as T[] };
        db.balances.set(userId, balance - cost);
        undo.push(() => { db.balances.set(userId, (db.balances.get(userId) ?? 0) + cost); });
        return { rows: [{ hour_balance: balance - cost }] as T[] };
      }
      if (statement.startsWith("UPDATE users") && statement.includes("hour_balance+$2")) {
        const userId = String(params[0]);
        const amount = Number(params[1]);
        const balance = db.balances.get(userId);
        if (balance === undefined) return { rows: [] as T[] };
        db.balances.set(userId, balance + amount);
        undo.push(() => { db.balances.set(userId, (db.balances.get(userId) ?? 0) - amount); });
        return { rows: [{ hour_balance: balance + amount }] as T[] };
      }
      if (statement.startsWith("SELECT hour_balance FROM users")) {
        const balance = db.balances.get(String(params[0]));
        return { rows: (balance === undefined ? [] : [{ hour_balance: balance }]) as T[] };
      }
      if (statement.startsWith("INSERT INTO shrine_offering_grants")) {
        const userId = String(params[2]);
        const key = String(params[7]);
        if (db.grants.some((g) => g.user_id === userId && g.idempotency_key === key)) {
          throw new Error("fake_unique_user_idempotency");
        }
        db.grants.push({
          id: String(params[0]),
          purchase_id: String(params[1]),
          user_id: userId,
          item_id: String(params[3]),
          state: "purchased",
          catalog_revision: String(params[4]),
          charged_yam: Number(params[5]),
          balance_after: Number(params[6]),
          idempotency_key: key,
          purchased_at: Date.now(),
        });
        const insertedGrantId = String(params[0]);
        undo.push(() => {
          const at = db.grants.findIndex((g) => g.id === insertedGrantId);
          if (at >= 0) db.grants.splice(at, 1);
        });
        return { rows: [] as T[] };
      }
      if (statement.startsWith("INSERT INTO hour_transactions")) {
        if (db.failNextLedgerInsert) {
          db.failNextLedgerInsert = false;
          throw new Error("injected_hour_transaction_failure");
        }
        const refPaymentId = params[3] === undefined ? null : String(params[3]);
        // UNIQUE(ref_payment_id) ของจริงในฐานข้อมูล = ลงบัญชีคืนซ้ำไม่ได้
        if (refPaymentId && db.transactions.some((tx) => tx.ref_payment_id === refPaymentId)) {
          throw new Error("fake_unique_ref_payment_id");
        }
        db.transactions.push({
          user_id: String(params[0]),
          delta: Number(params[1]),
          reason: statement.includes("'refund_shrine_offering'")
            ? "refund_shrine_offering"
            : "spend_shrine_offering",
          ref_payment_id: refPaymentId,
        });
        const insertedTx = db.transactions[db.transactions.length - 1];
        undo.push(() => {
          const at = db.transactions.indexOf(insertedTx);
          if (at >= 0) db.transactions.splice(at, 1);
        });
        return { rows: [] as T[] };
      }
      if (statement.startsWith("INSERT INTO shrine_offering_refunds")) {
        const userId = String(params[1]);
        const grantId = String(params[2]);
        const purchaseId = String(params[3]);
        const key = String(params[7]);
        const purchaseKey = String(params[8]);
        if (db.refunds.some((r) => r.grant_id === grantId)) throw new Error("fake_unique_grant_refund");
        if (db.refunds.some((r) => r.user_id === userId && r.purchase_idempotency_key === purchaseKey)) {
          throw new Error("fake_unique_refund_purchase_key");
        }
        if (db.refunds.some((r) => r.purchase_id === purchaseId)) throw new Error("fake_unique_purchase_refund");
        if (db.refunds.some((r) => r.user_id === userId && r.idempotency_key === key)) {
          throw new Error("fake_unique_refund_idempotency");
        }
        db.refunds.push({
          id: String(params[0]),
          user_id: userId,
          grant_id: grantId,
          purchase_id: purchaseId,
          item_id: String(params[4]),
          refunded_yam: Number(params[5]),
          balance_after: Number(params[6]),
          idempotency_key: key,
          purchase_idempotency_key: purchaseKey,
        });
        const insertedRefundId = String(params[0]);
        undo.push(() => {
          const at = db.refunds.findIndex((r) => r.id === insertedRefundId);
          if (at >= 0) db.refunds.splice(at, 1);
        });
        return { rows: [] as T[] };
      }
      if (statement.startsWith("UPDATE shrine_offering_grants") && statement.includes("state='offered'")) {
        const row = db.grants.find((g) => g.id === params[0] && g.user_id === params[1]);
        if (row?.state === "purchased") {
          row.state = "offered";
          undo.push(() => { row.state = "purchased"; });
        }
        return { rows: [] as T[] };
      }
      throw new Error(`unexpected_fake_query:${statement}`);
    },
    release() {},
  };
}
const mutablePool = pool as unknown as { connect: () => Promise<ReturnType<typeof createFakeClient>> };
const originalConnect = mutablePool.connect;
mutablePool.connect = async () => createFakeClient();

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
let keySeed = 0;
const nextKey = () => `shrine_${String(keySeed += 1).padStart(32, "0")}`;
const buy = async (userId: string, itemId = "talisman") => purchaseShrineOffering(
  userId,
  parseShrinePurchaseInput({
    item_id: itemId,
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: nextKey(),
  }),
);
const cancel = async (userId: string, grantId: string, itemId: string, key: string) =>
  cancelShrineOfferingPurchase(userId, parseShrineCancelInput({
    grant_id: grantId,
    item_id: itemId,
    idempotency_key: key,
  }));

function resetDb(balance = 50) {
  db.balances = new Map([[USER, balance], [OTHER, balance]]);
  db.grants.length = 0;
  db.refunds.length = 0;
  db.transactions.length = 0;
  db.failNextLedgerInsert = false;
}

try {
  /* ── 1. ยกเลิกปกติ: คืนยาม + ลบของ + ลงบัญชี ── */
  resetDb(10);
  const bought = await buy(USER);
  ok(bought.ok, "ซื้อสำเร็จ");
  eq(db.balances.get(USER), 9, "ซื้อแล้วยามลด 1");
  const key1 = nextKey();
  const refund = await cancel(USER, bought.ok ? bought.grant.id : "", "talisman", key1);
  ok(refund.ok, "ยกเลิกในหน้าต่างเวลาต้องสำเร็จ");
  eq(refund.ok && refund.existing, false, "ครั้งแรกไม่ใช่ replay");
  eq(refund.ok && refund.refunded_yam, 1, "คืน 1 ยาม");
  eq(db.balances.get(USER), 10, "ยามกลับเท่าเดิม");
  eq(db.grants.length, 0, "ของถูกลบออกจากย่าม");
  eq(db.refunds.length, 1, "มีบันทึกการคืน 1 แถว");
  eq(
    db.transactions.filter((tx) => tx.reason === "refund_shrine_offering").length,
    1,
    "ลงบัญชีคืน 1 แถว",
  );

  /* ── 2. คืนซ้ำด้วยกุญแจเดิม = ได้ครั้งเดียว ── */
  const replay = await cancel(USER, bought.ok ? bought.grant.id : "", "talisman", key1);
  ok(replay.ok, "กดซ้ำกุญแจเดิมต้องตอบสำเร็จแบบ replay");
  eq(replay.ok && replay.existing, true, "replay ต้องบอกว่าเคยคืนแล้ว");
  eq(db.balances.get(USER), 10, "กดซ้ำต้องไม่คืนเงินรอบสอง");
  eq(db.transactions.filter((tx) => tx.reason === "refund_shrine_offering").length, 1, "บัญชีคืนยังมีแถวเดียว");

  /* ── 3. คืนซ้ำด้วยกุญแจใหม่บนของชิ้นเดิม = ไม่เจอของแล้ว ── */
  const secondKey = await cancel(USER, bought.ok ? bought.grant.id : "", "talisman", nextKey());
  eq(secondKey.ok, false, "ของถูกลบไปแล้ว ยกเลิกซ้ำไม่ได้");
  eq(!secondKey.ok && secondKey.error, "grant_not_found", "ต้องตอบ grant_not_found");
  eq(db.balances.get(USER), 10, "ยามต้องไม่งอก");

  /* ── 4. กดยกเลิกรัวพร้อมกันด้วยกุญแจเดียวกัน ── */
  resetDb(10);
  const raced = await buy(USER);
  const raceKey = nextKey();
  const results = await Promise.all([
    cancel(USER, raced.ok ? raced.grant.id : "", "talisman", raceKey),
    cancel(USER, raced.ok ? raced.grant.id : "", "talisman", raceKey),
  ]);
  ok(results.every((result) => result.ok), "ทั้งสองคำสั่งต้องไม่พัง");
  assert.deepEqual(
    results.map((result) => (result.ok ? result.existing : null)).sort(),
    [false, true],
    "กดพร้อมกันต้องคืนจริงครั้งเดียว อีกครั้งเป็น replay",
  );
  checks += 1;
  eq(db.balances.get(USER), 10, "กดพร้อมกันคืนเงินครั้งเดียว");
  eq(db.refunds.length, 1, "บันทึกการคืนมีแถวเดียว");
  eq(db.transactions.filter((tx) => tx.reason === "refund_shrine_offering").length, 1, "บัญชีคืนแถวเดียว");

  /* ── 5. เกินหน้าต่างเวลา ── */
  resetDb(10);
  const stale = await buy(USER);
  db.grants[0].purchased_at = Date.now() - (SHRINE_CANCEL_WINDOW_SECONDS + 1) * 1000;
  const expired = await cancel(USER, stale.ok ? stale.grant.id : "", "talisman", nextKey());
  eq(expired.ok, false, "เกินเวลาต้องปฏิเสธ");
  eq(!expired.ok && expired.error, "cancel_window_expired", "รหัสต้องแยกได้ชัด");
  eq(db.balances.get(USER), 9, "เกินเวลาแล้วห้ามคืนยาม");
  eq(db.grants.length, 1, "ของต้องยังอยู่ในย่าม");

  /* ── ขอบเวลาพอดี (ยังอยู่ในหน้าต่าง) ── */
  db.grants[0].purchased_at = Date.now() - (SHRINE_CANCEL_WINDOW_SECONDS - 1) * 1000;
  const edge = await cancel(USER, stale.ok ? stale.grant.id : "", "talisman", nextKey());
  ok(edge.ok, "ภายในหน้าต่างเวลาต้องคืนได้");
  eq(db.balances.get(USER), 10, "คืนแล้วยามกลับเท่าเดิม");

  /* ── 6. ของที่ถวายแล้วต้องปฏิเสธ ── */
  resetDb(10);
  const offeredBuy = await buy(USER);
  const offered = await offerShrineGrant(USER, {
    grantId: offeredBuy.ok ? offeredBuy.grant.id : "",
    itemId: "talisman",
  });
  ok(offered.ok, "ถวายสำเร็จ");
  const afterOffer = await cancel(USER, offeredBuy.ok ? offeredBuy.grant.id : "", "talisman", nextKey());
  eq(afterOffer.ok, false, "ถวายแล้วยกเลิกไม่ได้");
  eq(!afterOffer.ok && afterOffer.error, "grant_already_offered", "รหัสต้องบอกว่าถวายแล้ว");
  eq(db.balances.get(USER), 9, "ถวายแล้วห้ามคืนยาม");
  eq(db.grants.length, 1, "ของที่ถวายแล้วต้องไม่ถูกลบ");

  /* ── 7. ยกเลิกของคนอื่นไม่ได้ ── */
  const crossUser = await cancel(OTHER, offeredBuy.ok ? offeredBuy.grant.id : "", "talisman", nextKey());
  eq(crossUser.ok, false, "ข้ามบัญชีต้องไม่เจอของ");
  eq(!crossUser.ok && crossUser.error, "grant_not_found", "ข้ามบัญชีต้องตอบ grant_not_found");
  eq(db.balances.get(OTHER), 10, "ยามของอีกบัญชีต้องไม่ขยับ");

  /* ── 8. ชนิดของไม่ตรงต้องปฏิเสธ ── */
  resetDb(10);
  const mismatchBuy = await buy(USER);
  const mismatch = await cancel(USER, mismatchBuy.ok ? mismatchBuy.grant.id : "", "auspiciousLamp", nextKey());
  eq(mismatch.ok, false, "ชนิดของไม่ตรงต้องปฏิเสธ");
  eq(!mismatch.ok && mismatch.error, "grant_item_mismatch", "รหัสต้องเป็น grant_item_mismatch");
  eq(db.balances.get(USER), 9, "ห้ามคืนยามเมื่อชนิดไม่ตรง");

  /* ── 9. ล้มกลางทางตอนลงบัญชี ต้องย้อนหมด ── */
  resetDb(10);
  const failBuy = await buy(USER);
  db.failNextLedgerInsert = true;
  await assert.rejects(
    cancel(USER, failBuy.ok ? failBuy.grant.id : "", "talisman", nextKey()),
    /injected_hour_transaction_failure/u,
    "บัญชีล้ม = การคืนต้องล้มทั้งก้อน",
  );
  checks += 1;
  eq(db.balances.get(USER), 9, "ย้อนกลับแล้วยามต้องไม่งอก");
  eq(db.grants.length, 1, "ย้อนกลับแล้วของต้องกลับมาอยู่ในย่าม");
  eq(db.refunds.length, 0, "ย้อนกลับแล้วต้องไม่มีบันทึกการคืน");

  /* ── 9ข. คำสั่งซื้อเดิมค้างคิว ยิงซ้ำหลังคืนเงิน ต้องไม่หักซ้ำ ── */
  resetDb(10);
  const queuedKey = nextKey();
  const queuedInput = parseShrinePurchaseInput({
    item_id: "talisman",
    catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
    idempotency_key: queuedKey,
  });
  const queuedBuy = await purchaseShrineOffering(USER, queuedInput);
  ok(queuedBuy.ok, "ซื้อรอบแรกสำเร็จ");
  const queuedCancel = await cancel(USER, queuedBuy.ok ? queuedBuy.grant.id : "", "talisman", nextKey());
  ok(queuedCancel.ok, "ยกเลิกสำเร็จ");
  eq(db.balances.get(USER), 10, "คืนแล้วยามกลับเท่าเดิม");
  const queuedRetry = await purchaseShrineOffering(USER, queuedInput);
  eq(queuedRetry.ok, false, "คำสั่งซื้อค้างคิวหลังคืนเงินต้องไม่หักซ้ำ");
  eq(!queuedRetry.ok && queuedRetry.error, "purchase_refunded", "ต้องตอบว่ารายการถูกคืนไปแล้ว");
  eq(db.balances.get(USER), 10, "ยามต้องไม่ถูกหักรอบสอง");
  eq(db.grants.length, 0, "ต้องไม่มีของงอกขึ้นมาใหม่");

  /* ── 10. ย่ามเต็มต้องซื้อไม่ได้ และห้ามหักยาม ── */
  resetDb(500);
  for (let index = 0; index < SHRINE_BAG_CAPACITY; index += 1) {
    db.grants.push({
      id: `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`,
      purchase_id: `bbbbbbbb-0000-4000-8000-${String(index).padStart(12, "0")}`,
      user_id: USER,
      item_id: "talisman",
      state: "purchased",
      catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
      charged_yam: 1,
      balance_after: 1,
      idempotency_key: `shrine_${String(900000 + index).padStart(32, "0")}`,
      purchased_at: Date.now(),
    });
  }
  const balanceBeforeFull = db.balances.get(USER)!;
  const blocked = await buy(USER);
  eq(blocked.ok, false, "ย่ามเต็มต้องซื้อไม่ได้");
  eq(!blocked.ok && blocked.error, "bag_full", "รหัสต้องแยกได้ชัดว่า bag_full");
  eq(!blocked.ok && blocked.status, 409, "สถานะต้องเป็น 409");
  ok(!blocked.ok && typeof blocked.message_th === "string" && blocked.message_th.includes("ถวาย"), "ต้องบอกให้ไปถวายก่อน");
  eq(db.balances.get(USER), balanceBeforeFull, "ย่ามเต็มแล้วห้ามหักยามแม้แต่ยามเดียว");
  eq(db.grants.filter((g) => g.state === "purchased").length, SHRINE_BAG_CAPACITY, "จำนวนของต้องไม่เกินเพดาน");
  eq(db.transactions.length, 0, "ห้ามลงบัญชีเมื่อซื้อไม่สำเร็จ");

  /* ── 11. ถวายออก 1 ชิ้นแล้วต้องซื้อได้อีก ── */
  const freeUp = await offerShrineGrant(USER, { grantId: db.grants[0].id, itemId: "talisman" });
  ok(freeUp.ok, "ถวายเพื่อเปิดที่ว่าง");
  const afterFree = await buy(USER);
  ok(afterFree.ok, "มีที่ว่างแล้วต้องซื้อได้");
  eq(db.balances.get(USER), balanceBeforeFull - 1, "ซื้อได้แล้วหักยาม 1");

  /* ── 12. ซื้อรัวพร้อมกันตอนย่ามเหลือที่ 1 ต้องผ่านแค่คำสั่งเดียว ── */
  resetDb(500);
  for (let index = 0; index < SHRINE_BAG_CAPACITY - 1; index += 1) {
    db.grants.push({
      id: `cccccccc-0000-4000-8000-${String(index).padStart(12, "0")}`,
      purchase_id: `dddddddd-0000-4000-8000-${String(index).padStart(12, "0")}`,
      user_id: USER,
      item_id: "talisman",
      state: "purchased",
      catalog_revision: SHRINE_OFFERING_CATALOG.catalog_revision,
      charged_yam: 1,
      balance_after: 1,
      idempotency_key: `shrine_${String(800000 + index).padStart(32, "0")}`,
      purchased_at: Date.now(),
    });
  }
  const concurrent = await Promise.all([buy(USER), buy(USER), buy(USER)]);
  eq(concurrent.filter((result) => result.ok).length, 1, "เหลือที่ 1 ต้องซื้อสำเร็จคำสั่งเดียว");
  eq(
    concurrent.filter((result) => !result.ok && result.error === "bag_full").length,
    2,
    "อีกสองคำสั่งต้องโดนด่านย่ามเต็ม",
  );
  eq(
    db.grants.filter((g) => g.state === "purchased").length,
    SHRINE_BAG_CAPACITY,
    "แม้กดพร้อมกันก็ห้ามล้นเพดาน",
  );
  eq(db.balances.get(USER), 500 - 1, "หักยามเฉพาะคำสั่งที่สำเร็จ");
} finally {
  mutablePool.connect = originalConnect;
}

/* ─── ตรวจไฟล์ประกอบ (เส้นทาง + ไฟล์ย้ายฐานข้อมูล) ─── */
const cancelRoute = read("src/app/api/mobile/v1/shrine/shop/cancel/route.ts");
for (const marker of [
  "bearer_required",
  "application_json_required",
  'createHash("sha256").update(bearer).digest("hex")',
  "cancelShrineOfferingPurchase",
]) {
  ok(cancelRoute.includes(marker), `เส้นทางยกเลิกต้องมีด่าน: ${marker}`);
}
const migration = read("migrations/20260802_shrine_offering_refund.sql");
for (const marker of [
  "CREATE TABLE IF NOT EXISTS shrine_offering_refunds",
  "grant_id uuid NOT NULL UNIQUE",
  "UNIQUE (user_id, idempotency_key)",
  "GRANT DELETE ON shrine_offering_grants",
  "enforce_shrine_offering_grant_delete",
  "BEFORE DELETE ON shrine_offering_grants",
]) {
  ok(migration.includes(marker), `ไฟล์ย้ายฐานข้อมูลต้องมี: ${marker}`);
}
const lib = read("src/lib/shrine-offering-shop.ts");
ok(lib.includes("'refund_shrine_offering'"), "ต้องลงบัญชีด้วยเหตุผล refund_shrine_offering");
ok(lib.includes("shrine_refund:"), "ต้องใช้ ref_payment_id แยกสำหรับการคืน");

console.log(
  `SHRINE_REFUND_BAGCAP_OK checks=${checks} capacity=${SHRINE_BAG_CAPACITY} window=${SHRINE_CANCEL_WINDOW_SECONDS}s rollbacks=${db.rollbacks} commits=${db.commits}`,
);
