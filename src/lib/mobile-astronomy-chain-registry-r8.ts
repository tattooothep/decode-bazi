/**
 * R8 stable chain UUID resolver (design §5.4 · 6 ก.ย. 2569)
 *
 * The durable delivery ledger keys lineages on a chain UUID that must never be
 * re-minted for the same (user, org, science, submode) — otherwise acceptance
 * tombstones stop protecting against duplicate sends after a device transfer
 * recreates the chains row. Resolution order:
 *   1. registry row (permanent, immutable) — the authority once written;
 *   2. adopt an existing chains.account_delivery_chain_uuid so history minted
 *      before the registry existed keeps its UUID;
 *   3. mint a fresh UUID, insert-once (concurrent resolvers converge via the
 *      primary key + re-select; the UNIQUE chain_uuid keeps adoption races
 *      from binding one UUID to two accounts).
 */
import type { Pool } from "pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function resolveAstronomyChainUuid(
  pool: Pool,
  input: Readonly<{ userId: string; orgId: string }>,
): Promise<string> {
  if (!UUID_RE.test(input.userId) || !UUID_RE.test(input.orgId)) {
    throw new TypeError("r8_registry_input_invalid");
  }
  const params = [input.userId, input.orgId];
  const existing = await pool.query<{ chain_uuid: string }>(
    `SELECT chain_uuid FROM mobile_astronomy_chain_registry_r8
      WHERE user_id=$1 AND org_id=$2 AND science_id='astronomy_fact' AND submode='civil_two_hour'`,
    params,
  );
  if (existing.rows[0]) return existing.rows[0].chain_uuid;

  // Adoption keeps continuity with chain UUIDs minted before the registry;
  // ON CONFLICT DO NOTHING on either key means a concurrent resolver or an
  // adopted UUID already bound elsewhere never overwrites anything.
  await pool.query(
    `INSERT INTO mobile_astronomy_chain_registry_r8 (user_id, org_id, science_id, submode, chain_uuid)
     SELECT $1, $2, 'astronomy_fact', 'civil_two_hour',
            COALESCE((
              SELECT c.account_delivery_chain_uuid
                FROM mobile_science_notification_chains c
               WHERE c.user_id=$1 AND c.org_id=$2
                 AND c.science_id='astronomy_fact' AND c.submode='civil_two_hour'
               LIMIT 1
            ), gen_random_uuid())
     ON CONFLICT DO NOTHING`,
    params,
  );
  let settled = await pool.query<{ chain_uuid: string }>(
    `SELECT chain_uuid FROM mobile_astronomy_chain_registry_r8
      WHERE user_id=$1 AND org_id=$2 AND science_id='astronomy_fact' AND submode='civil_two_hour'`,
    params,
  );
  if (!settled.rows[0]) {
    // Adopted UUID already registered to another account (unique conflict ate
    // the insert): fall back to a freshly minted UUID for this account.
    await pool.query(
      `INSERT INTO mobile_astronomy_chain_registry_r8 (user_id, org_id, science_id, submode, chain_uuid)
       VALUES ($1, $2, 'astronomy_fact', 'civil_two_hour', gen_random_uuid())
       ON CONFLICT DO NOTHING`,
      params,
    );
    settled = await pool.query<{ chain_uuid: string }>(
      `SELECT chain_uuid FROM mobile_astronomy_chain_registry_r8
        WHERE user_id=$1 AND org_id=$2 AND science_id='astronomy_fact' AND submode='civil_two_hour'`,
      params,
    );
  }
  if (!settled.rows[0]) throw new Error("r8_registry_resolution_failed");
  return settled.rows[0].chain_uuid;
}
