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
  id: string | null;
  item_id: ShrineOfferingId | null;
  state: "purchased" | "offered" | null;
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
     purchased_grants AS (
       SELECT id,item_id,state,purchased_at
         FROM shrine_offering_grants
        WHERE user_id=$1 AND state='purchased'
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
            visible_grants.id,
            visible_grants.item_id,
            visible_grants.state
       FROM account
       LEFT JOIN visible_grants ON TRUE
      ORDER BY visible_grants.purchased_at DESC NULLS LAST,visible_grants.id DESC`,
    [userId],
  );
  const account = rows[0];
  if (!account) return null;
  return {
    ok: true as const,
    ...SHRINE_OFFERING_CATALOG,
    balance_yam: Number(account.hour_balance) || 0,
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

    if (input.catalogRevision !== CATALOG_REVISION) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        error: "catalog_revision_stale",
        status: 409,
        catalog_revision: CATALOG_REVISION,
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
