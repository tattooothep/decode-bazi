import { randomUUID } from "crypto";
import { pool, q } from "@/lib/db";

export const SHRINE_OFFERING_IDS = [
  "auspiciousLamp",
  "teaFruitOffering",
  "talisman",
  "vowFulfillment",
] as const;

export type ShrineOfferingId = typeof SHRINE_OFFERING_IDS[number];

const CATALOG_REVISION = "shrine-offerings-v1";
const OFFERING_IDS = new Set<string>(SHRINE_OFFERING_IDS);

/**
 * เพดานย่าม (จำนวนของที่ "ซื้อแล้วยังไม่ถวาย" สูงสุดต่อผู้ใช้)
 * ทำไมต้องมี: แอพรุ่นเดิมตรวจ grants.length > 128 แล้วโยนทิ้งทั้งก้อน
 * = ถ้าของในย่ามล้น หน้าร้านพังถาวร เปิดย่ามไม่ได้ ถวายไม่ได้ ซื้อไม่ได้ กู้เองไม่ได้
 * ทำไมเลือก 96: รายการที่ส่งกลับ = ของยังไม่ถวาย (≤96) + ของที่ถวายล่าสุดชนิดละ 1 ชิ้น (≤4)
 * รวมสูงสุด 100 ต่ำกว่าเพดาน 128 ของแอพรุ่นเดิมอย่างมีระยะเผื่อ แม้อนาคตจะเพิ่มชนิดของบูชา
 */
export const SHRINE_BAG_CAPACITY = 96;

/**
 * หน้าต่างเวลายกเลิก+คืนยาม (วินาที)
 * ทำไม 60 วินาที: ยาวพอสำหรับ "กดผิด/กดรัวเพราะจอค้าง" ซึ่งเป็นเคสจริงที่พบ
 * แต่สั้นพอที่จะไม่กลายเป็นช่องยืมของฟรี (ซื้อ→ใช้ดูภาพในศาล→คืนเงิน)
 */
export const SHRINE_CANCEL_WINDOW_SECONDS = 60;

export const SHRINE_OFFERING_CATALOG = Object.freeze({
  catalog_revision: CATALOG_REVISION,
  items: Object.freeze(SHRINE_OFFERING_IDS.map((id) => Object.freeze({
    id,
    cost_yam: 1,
    enabled: true,
  }))),
});

export type ShrinePurchaseInput = Readonly<{
  itemId: ShrineOfferingId;
  catalogRevision: string;
  idempotencyKey: string;
}>;

export type ShrineOfferInput = Readonly<{
  grantId: string;
  itemId: ShrineOfferingId;
}>;

/** อินพุตยกเลิกการซื้อ · ต้องมีกุญแจกันคืนซ้ำเหมือนตอนซื้อ (เงินจริง ห้ามคืนสองรอบ) */
export type ShrineCancelInput = Readonly<{
  grantId: string;
  itemId: ShrineOfferingId;
  idempotencyKey: string;
}>;

type GrantRow = {
  id: string;
  purchase_id: string;
  item_id: ShrineOfferingId;
  state: "purchased" | "offered";
  catalog_revision: string;
  charged_yam: number;
  balance_after: number;
  idempotency_key: string;
};

type ShopInventoryRow = {
  hour_balance: number;
  purchased_total: number;
  id: string | null;
  item_id: ShrineOfferingId | null;
  state: "purchased" | "offered" | null;
};

/** แถวของขวัญที่ใช้ตอนยกเลิก · ต้องรู้เวลา + ยามที่หักไปจริง เพื่อคืนให้ตรงเป๊ะ */
type CancelGrantRow = GrantRow & {
  purchased_at: string;
  age_seconds: number;
};

type RefundLedgerRow = {
  id: string;
  grant_id: string;
  purchase_id: string;
  item_id: ShrineOfferingId;
  refunded_yam: number;
  balance_after: number;
  idempotency_key: string;
};

function inputInvalid(detail: string): never {
  throw new Error(`shrine_shop_input_invalid:${detail}`);
}

function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  detail: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return inputInvalid(detail);
  }
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  const expected = [...allowedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return inputInvalid(`${detail}_keys`);
  }
  return raw;
}

function parseItemId(value: unknown): ShrineOfferingId {
  if (typeof value !== "string" || !OFFERING_IDS.has(value)) {
    return inputInvalid("item_id");
  }
  return value as ShrineOfferingId;
}

export function parseShrinePurchaseInput(value: unknown): ShrinePurchaseInput {
  const raw = strictRecord(
    value,
    ["item_id", "catalog_revision", "idempotency_key"],
    "purchase",
  );
  const catalogRevision = typeof raw.catalog_revision === "string"
    ? raw.catalog_revision.trim()
    : "";
  const idempotencyKey = typeof raw.idempotency_key === "string"
    ? raw.idempotency_key.trim()
    : "";
  if (
    catalogRevision.length > 128
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(catalogRevision)
  ) {
    inputInvalid("catalog_revision");
  }
  if (!/^shrine_[0-9a-f]{32}$/u.test(idempotencyKey)) inputInvalid("idempotency_key");
  return Object.freeze({
    itemId: parseItemId(raw.item_id),
    catalogRevision,
    idempotencyKey,
  });
}

export function parseShrineOfferInput(value: unknown): ShrineOfferInput {
  const raw = strictRecord(value, ["grant_id", "item_id"], "offer");
  const grantId = typeof raw.grant_id === "string" ? raw.grant_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(grantId)) {
    inputInvalid("grant_id");
  }
  return Object.freeze({
    grantId,
    itemId: parseItemId(raw.item_id),
  });
}

export function parseShrineCancelInput(value: unknown): ShrineCancelInput {
  const raw = strictRecord(
    value,
    ["grant_id", "item_id", "idempotency_key"],
    "cancel",
  );
  const grantId = typeof raw.grant_id === "string" ? raw.grant_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(grantId)) {
    inputInvalid("grant_id");
  }
  const idempotencyKey = typeof raw.idempotency_key === "string"
    ? raw.idempotency_key.trim()
    : "";
  // กุญแจต้องสุ่มจริงรูปแบบเดียวกับตอนซื้อ = เดาไม่ได้ + ใช้ replay คำตอบเดิมได้
  if (!/^shrine_[0-9a-f]{32}$/u.test(idempotencyKey)) inputInvalid("idempotency_key");
  return Object.freeze({
    grantId,
    itemId: parseItemId(raw.item_id),
    idempotencyKey,
  });
}

function publicGrant(row: GrantRow) {
  return {
    id: row.id,
    item_id: row.item_id,
    state: row.state,
  };
}

export async function getShrineOfferingShop(userId: string) {
  const rows = await q<ShopInventoryRow>(
    `WITH account AS (
       SELECT hour_balance
         FROM users
        WHERE id=$1 AND deleted_at IS NULL
     ),
     purchased_count AS (
       SELECT COUNT(*)::int AS purchased_total
         FROM shrine_offering_grants
        WHERE user_id=$1 AND state='purchased'
     ),
     purchased_grants AS (
       -- ส่งคืนไม่เกินเพดานย่าม: กันแอพรุ่นเดิม (ตรวจ >128 แล้วทิ้งทั้งก้อน) พังถาวร
       -- เรียงเก่าก่อน = ผู้ใช้ที่ของค้างเกินเพดานอยู่แล้วยังถวายไล่ออกได้ตามลำดับ ไม่มีชิ้นไหนถูกขังถาวร
       SELECT id,item_id,state,purchased_at
         FROM shrine_offering_grants
        WHERE user_id=$1 AND state='purchased'
        ORDER BY purchased_at ASC,id ASC
        LIMIT $2
     ),
     latest_offered_grants AS (
       SELECT DISTINCT ON (item_id)
              id,item_id,state,purchased_at
         FROM shrine_offering_grants
        WHERE user_id=$1 AND state='offered'
        ORDER BY item_id,purchased_at DESC,id DESC
     ),
     visible_grants AS (
       SELECT id,item_id,state,purchased_at FROM purchased_grants
       UNION ALL
       SELECT id,item_id,state,purchased_at FROM latest_offered_grants
     )
     SELECT account.hour_balance,
            purchased_count.purchased_total,
            visible_grants.id,
            visible_grants.item_id,
            visible_grants.state
       FROM account
       CROSS JOIN purchased_count
       LEFT JOIN visible_grants ON TRUE
      ORDER BY visible_grants.purchased_at DESC NULLS LAST,visible_grants.id DESC`,
    [userId, SHRINE_BAG_CAPACITY],
  );
  const account = rows[0];
  if (!account) return null;
  const bagUsed = Math.max(0, Number(account.purchased_total) || 0);
  return {
    ok: true as const,
    ...SHRINE_OFFERING_CATALOG,
    balance_yam: Number(account.hour_balance) || 0,
    // ฟิลด์เสริม (แอพรุ่นเดิมไม่รู้จักก็ไม่พัง เพราะฝั่งแอพอ่านเฉพาะคีย์ที่ต้องใช้)
    bag_capacity: SHRINE_BAG_CAPACITY,
    bag_used: bagUsed,
    bag_full: bagUsed >= SHRINE_BAG_CAPACITY,
    bag_truncated: bagUsed > SHRINE_BAG_CAPACITY,
    cancel_window_seconds: SHRINE_CANCEL_WINDOW_SECONDS,
    grants: rows.flatMap((row) => (
      row.id === null
        ? []
        : [{
            id: row.id,
            item_id: row.item_id!,
            state: row.state!,
          }]
    )),
  };
}

export async function purchaseShrineOffering(userId: string, input: ShrinePurchaseInput) {
  const item = SHRINE_OFFERING_CATALOG.items.find((candidate) => candidate.id === input.itemId);
  if (!item?.enabled) return { ok: false as const, error: "item_unavailable", status: 404 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`shrine-shop:${userId}:${input.idempotencyKey}`],
    );
    const existing = await client.query<GrantRow>(
      `SELECT id,purchase_id,item_id,state,catalog_revision,charged_yam,balance_after,idempotency_key
         FROM shrine_offering_grants
        WHERE user_id=$1 AND idempotency_key=$2
        LIMIT 1
        FOR UPDATE`,
      [userId, input.idempotencyKey],
    );
    const prior = existing.rows[0];
    if (prior) {
      if (
        prior.item_id !== input.itemId
        || prior.catalog_revision !== input.catalogRevision
      ) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "idempotency_conflict", status: 409 };
      }
      const balance = await client.query<{ hour_balance: number }>(
        `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!balance.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "account_not_available", status: 404 };
      }
      await client.query("COMMIT");
      return {
        ok: true as const,
        existing: true,
        purchase_id: prior.purchase_id,
        idempotency_key: prior.idempotency_key,
        catalog_revision: prior.catalog_revision,
        item_id: prior.item_id,
        charged_yam: Number(prior.charged_yam),
        balance_after: Number(balance.rows[0].hour_balance),
        grant: publicGrant(prior),
      };
    }

    // ── กันหักซ้ำหลังคืนเงิน ──
    // ของถูกลบตอนยกเลิกไปแล้ว ถ้าแอพยิงคำสั่งซื้อเดิมที่ค้างคิวมาอีก
    // จะกลายเป็นการซื้อใหม่และหักยามรอบสอง จึงต้องเช็คร่องรอยการคืนก่อน
    const refunded = await client.query<{ id: string }>(
      `SELECT id FROM shrine_offering_refunds
        WHERE user_id=$1 AND purchase_idempotency_key=$2
        LIMIT 1`,
      [userId, input.idempotencyKey],
    );
    if (refunded.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "purchase_refunded",
        status: 409,
        message_th: "รายการนี้ถูกยกเลิกและคืนยามไปแล้ว",
      };
    }

    if (input.catalogRevision !== CATALOG_REVISION) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "catalog_revision_stale",
        status: 409,
        catalog_revision: CATALOG_REVISION,
      };
    }

    // ── ด่านย่ามเต็ม ── ต้องอยู่ก่อนหักยามเสมอ (ห้ามหักเงินแล้วค่อยพบว่าใส่ย่ามไม่ได้)
    // ล็อกระดับผู้ใช้ก่อนนับ = กดซื้อรัวพร้อมกันคนละกุญแจก็แซงเพดานไม่ได้
    // ลำดับล็อกคงที่เสมอ (กุญแจซื้อ → ย่ามของผู้ใช้) จึงไม่เกิดวงจรค้าง
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`shrine-bag:${userId}`],
    );
    const bagUsed = await client.query<{ purchased_total: number }>(
      `SELECT COUNT(*)::int AS purchased_total
         FROM shrine_offering_grants
        WHERE user_id=$1 AND state='purchased'`,
      [userId],
    );
    const used = Number(bagUsed.rows[0]?.purchased_total) || 0;
    if (used >= SHRINE_BAG_CAPACITY) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "bag_full",
        status: 409,
        bag_capacity: SHRINE_BAG_CAPACITY,
        bag_used: used,
        message_th: "ย่ามเต็มแล้ว กรุณาถวายของที่มีอยู่ก่อนจึงจะซื้อเพิ่มได้",
      };
    }

    const updated = await client.query<{ hour_balance: number }>(
      `UPDATE users
          SET hour_balance=hour_balance-$2
        WHERE id=$1 AND deleted_at IS NULL AND hour_balance >= $2
        RETURNING hour_balance`,
      [userId, item.cost_yam],
    );
    if (!updated.rows[0]) {
      const account = await client.query<{ hour_balance: number }>(
        `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      await client.query("ROLLBACK");
      if (!account.rows[0]) {
        return { ok: false as const, error: "account_not_available", status: 404 };
      }
      return {
        ok: false as const,
        error: "insufficient_yam",
        status: 402,
        required_yam: item.cost_yam,
        balance_yam: Number(account.rows[0].hour_balance) || 0,
      };
    }

    const grantId = randomUUID();
    const purchaseId = randomUUID();
    const balanceAfter = Number(updated.rows[0].hour_balance);
    await client.query(
      `INSERT INTO shrine_offering_grants
       (id,purchase_id,user_id,item_id,state,catalog_revision,charged_yam,balance_after,idempotency_key)
       VALUES ($1,$2,$3,$4,'purchased',$5,$6,$7,$8)`,
      [
        grantId,
        purchaseId,
        userId,
        input.itemId,
        input.catalogRevision,
        item.cost_yam,
        balanceAfter,
        input.idempotencyKey,
      ],
    );
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,$2,'spend_shrine_offering',$3,'shrine',$4,$5)`,
      [
        userId,
        -item.cost_yam,
        balanceAfter,
        `shrine_purchase:${purchaseId}`,
        JSON.stringify({ itemId: input.itemId, grantId }),
      ],
    );
    await client.query("COMMIT");
    return {
      ok: true as const,
      existing: false,
      purchase_id: purchaseId,
      idempotency_key: input.idempotencyKey,
      catalog_revision: input.catalogRevision,
      item_id: input.itemId,
      charged_yam: item.cost_yam,
      balance_after: balanceAfter,
      grant: {
        id: grantId,
        item_id: input.itemId,
        state: "purchased" as const,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * ยกเลิกการซื้อภายในหน้าต่างเวลาสั้น = คืนยาม + ลบของ ในรายการเดียวกัน
 *
 * ทำไมต้องมี: ศาลเจ้าหักยามจาก users.hour_balance ตรงๆ โดยไม่มีทางคืนเลยทั้งระบบ
 * (ทุกหน้าอื่นมีคืน) หลังบ้านเติมยามคืนได้ก็จริง แต่ลบของทิ้งไม่ได้ = ผู้ใช้ได้ทั้งเงินทั้งของ
 *
 * กติกาเงิน 4 ข้อที่บังคับในนี้:
 *  1) คืนยาม + ลบของ + ลงบัญชี อยู่ในรายการเดียวกัน ล้มแล้วย้อนหมด ไม่มีสภาพครึ่งๆ
 *  2) คืนซ้ำไม่ได้ 3 ชั้น — ตารางบันทึกคืนมี UNIQUE(user_id, กุญแจ) และ UNIQUE(grant_id)
 *     บวกกับ ref_payment_id ในบัญชียามที่ UNIQUE อยู่แล้ว และของถูกลบไปแล้วรอบสอง
 *  3) ของที่ถวายไปแล้วยกเลิกไม่ได้เด็ดขาด (ถวายแล้วคือถวายแล้ว)
 *  4) ลงบัญชีทุกครั้งด้วยเหตุผล refund_shrine_offering = ตรวจย้อนหลังได้
 */
export async function cancelShrineOfferingPurchase(
  userId: string,
  input: ShrineCancelInput,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ล็อกด้วยกุญแจยกเลิก = กดยกเลิกรัวๆ ด้วยกุญแจเดียวกัน ถูกจัดคิวทีละคำสั่ง
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`shrine-cancel:${userId}:${input.idempotencyKey}`],
    );

    // ── ชั้นกันคืนซ้ำที่ 1: เคยคืนด้วยกุญแจนี้แล้วหรือยัง ──
    const prior = await client.query<RefundLedgerRow>(
      `SELECT id,grant_id,purchase_id,item_id,refunded_yam,balance_after,idempotency_key
         FROM shrine_offering_refunds
        WHERE user_id=$1 AND idempotency_key=$2
        LIMIT 1`,
      // ไม่ใช้ FOR UPDATE เพราะตารางบันทึกการคืนต้องอ่านอย่างเดียว (สิทธิ์มีแค่ SELECT/INSERT)
      // การจัดคิวคำสั่งกุญแจเดียวกันอาศัย pg_advisory_xact_lock ข้างบน
      // และถ้ามีอะไรหลุดผ่านมาได้จริง UNIQUE(user_id,กุญแจ)+UNIQUE(grant_id) จะทำให้ล้มแล้วย้อนทั้งก้อน
      [userId, input.idempotencyKey],
    );
    const priorRefund = prior.rows[0];
    if (priorRefund) {
      // กุญแจเดิมแต่ชี้คนละชิ้น = แอพส่งผิด ห้ามคืนซ้ำเป็นอันขาด
      if (
        priorRefund.grant_id !== input.grantId
        || priorRefund.item_id !== input.itemId
      ) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "idempotency_conflict", status: 409 };
      }
      const balance = await client.query<{ hour_balance: number }>(
        `SELECT hour_balance FROM users WHERE id=$1 AND deleted_at IS NULL`,
        [userId],
      );
      if (!balance.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false as const, error: "account_not_available", status: 404 };
      }
      await client.query("COMMIT");
      return {
        ok: true as const,
        existing: true,
        refund_id: priorRefund.id,
        grant_id: priorRefund.grant_id,
        purchase_id: priorRefund.purchase_id,
        item_id: priorRefund.item_id,
        idempotency_key: priorRefund.idempotency_key,
        refunded_yam: Number(priorRefund.refunded_yam),
        balance_after: Number(balance.rows[0].hour_balance),
      };
    }

    // ── ตรวจของชิ้นที่ขอยกเลิก ── ล็อกแถวไว้กันสองคำสั่งลบพร้อมกัน
    const grant = await client.query<CancelGrantRow>(
      `SELECT id,purchase_id,item_id,state,catalog_revision,charged_yam,balance_after,
              idempotency_key,purchased_at,
              EXTRACT(EPOCH FROM (now()-purchased_at))::float8 AS age_seconds
         FROM shrine_offering_grants
        WHERE id=$1 AND user_id=$2
        FOR UPDATE`,
      [input.grantId, userId],
    );
    const row = grant.rows[0];
    if (!row) {
      // ไม่เจอ = ไม่เคยมี หรือถูกยกเลิกไปแล้วด้วยกุญแจอื่น (คืนไปแล้วครั้งเดียวตามกติกา)
      await client.query("ROLLBACK");
      return { ok: false as const, error: "grant_not_found", status: 404 };
    }
    if (row.item_id !== input.itemId) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "grant_item_mismatch", status: 409 };
    }
    if (row.state !== "purchased") {
      // ถวายแล้วคือถวายแล้ว ตามคติจริง — คืนไม่ได้
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "grant_already_offered",
        status: 409,
        message_th: "ของชิ้นนี้ถวายไปแล้ว ยกเลิกไม่ได้",
      };
    }
    const ageSeconds = Number(row.age_seconds);
    if (!Number.isFinite(ageSeconds) || ageSeconds > SHRINE_CANCEL_WINDOW_SECONDS) {
      // เวลาวัดจากนาฬิกาฐานข้อมูล ไม่เชื่อนาฬิกาเครื่องผู้ใช้
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "cancel_window_expired",
        status: 409,
        cancel_window_seconds: SHRINE_CANCEL_WINDOW_SECONDS,
        message_th: `ยกเลิกได้ภายใน ${SHRINE_CANCEL_WINDOW_SECONDS} วินาทีหลังซื้อเท่านั้น`,
      };
    }

    // ── ลบของ ── เงื่อนไข state='purchased' ซ้ำอีกชั้นระดับคำสั่ง
    const deleted = await client.query<{ id: string }>(
      `DELETE FROM shrine_offering_grants
        WHERE id=$1 AND user_id=$2 AND state='purchased'
        RETURNING id`,
      [input.grantId, userId],
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "cancel_conflict", status: 409 };
    }

    // ── คืนยามเท่าที่หักไปจริงจากแถวนั้น (ไม่ใช่ราคาปัจจุบันในแคตตาล็อก) ──
    const refunded = Math.max(0, Math.floor(Number(row.charged_yam)));
    if (refunded <= 0) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "cancel_conflict", status: 409 };
    }
    const credited = await client.query<{ hour_balance: number }>(
      `UPDATE users
          SET hour_balance=hour_balance+$2
        WHERE id=$1 AND deleted_at IS NULL
        RETURNING hour_balance`,
      [userId, refunded],
    );
    if (!credited.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "account_not_available", status: 404 };
    }
    const balanceAfter = Number(credited.rows[0].hour_balance);

    // ── ลงบัญชียาม ── ref_payment_id มี UNIQUE index อยู่แล้ว = ชั้นกันคืนซ้ำที่ 2
    await client.query(
      `INSERT INTO hour_transactions
       (user_id,delta,reason,balance_after,ref_feature,ref_payment_id,note)
       VALUES ($1,$2,'refund_shrine_offering',$3,'shrine',$4,$5)`,
      [
        userId,
        refunded,
        balanceAfter,
        `shrine_refund:${row.purchase_id}`,
        JSON.stringify({ itemId: row.item_id, grantId: row.id }),
      ],
    );

    // ── บันทึกการคืน ── UNIQUE(user_id,กุญแจ) และ UNIQUE(grant_id) = ชั้นกันคืนซ้ำที่ 3
    const refundId = randomUUID();
    await client.query(
      `INSERT INTO shrine_offering_refunds
       (id,user_id,grant_id,purchase_id,item_id,refunded_yam,balance_after,idempotency_key,
        purchase_idempotency_key,purchased_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        refundId,
        userId,
        row.id,
        row.purchase_id,
        row.item_id,
        refunded,
        balanceAfter,
        input.idempotencyKey,
        row.idempotency_key,
        row.purchased_at,
      ],
    );
    await client.query("COMMIT");
    return {
      ok: true as const,
      existing: false,
      refund_id: refundId,
      grant_id: row.id,
      purchase_id: row.purchase_id,
      item_id: row.item_id,
      idempotency_key: input.idempotencyKey,
      refunded_yam: refunded,
      balance_after: balanceAfter,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

export async function offerShrineGrant(userId: string, input: ShrineOfferInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const grant = await client.query<GrantRow>(
      `SELECT id,purchase_id,item_id,state,catalog_revision,charged_yam,balance_after,idempotency_key
         FROM shrine_offering_grants
        WHERE id=$1 AND user_id=$2
        FOR UPDATE`,
      [input.grantId, userId],
    );
    const row = grant.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "grant_not_found", status: 404 };
    }
    if (row.item_id !== input.itemId) {
      await client.query("ROLLBACK");
      return { ok: false as const, error: "grant_item_mismatch", status: 409 };
    }
    if (row.state === "purchased") {
      await client.query(
        `UPDATE shrine_offering_grants
            SET state='offered',offered_at=now()
          WHERE id=$1 AND user_id=$2 AND state='purchased'`,
        [input.grantId, userId],
      );
    }
    await client.query("COMMIT");
    return {
      ok: true as const,
      existing: row.state === "offered",
      grant: {
        id: row.id,
        item_id: row.item_id,
        state: "offered" as const,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}
