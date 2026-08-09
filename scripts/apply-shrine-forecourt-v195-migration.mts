import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const rollback = process.argv.includes("--rollback");
const filename = rollback
  ? "20260809_shrine_forecourt_v195_rollback.sql"
  : "20260809_shrine_forecourt_v195.sql";
const expectedTables = [
  "shrine_forecourt_daily_cycles",
  "shrine_forecourt_throw_authorizations",
  "shrine_forecourt_throw_commits",
  "shrine_forecourt_recovery_awards",
  "shrine_forecourt_blessings",
] as const;

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sql = readFileSync(path.join(process.cwd(), "migrations", filename), "utf8");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const tableResult = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY 1`,
    [expectedTables],
  );
  const actual = tableResult.rows.map((row) => row.tablename);
  const expectedCount = rollback ? 0 : expectedTables.length;
  if (actual.length !== expectedCount) {
    throw new Error(`forecourt_v195_table_verification_failed:${actual.join(",")}`);
  }

  if (!rollback) {
    const constraints = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM pg_constraint c
         JOIN pg_class t ON t.oid=c.conrelid
        WHERE t.relname=ANY($1::text[])
          AND c.contype IN ('p','u','f','c')`,
      [expectedTables],
    );
    if (Number(constraints.rows[0]?.count || 0) < 35) {
      throw new Error("forecourt_v195_constraint_verification_failed");
    }
    const pins = await pool.query<{
      content_ok: boolean;
      physics_ok: boolean;
      scene_ok: boolean;
    }>(
      `SELECT
         pg_get_constraintdef(c.oid) LIKE '%mainhall-20260809-046%' AS content_ok,
         pg_get_constraintdef(c.oid) LIKE '%forecourt-coin-v2%' AS physics_ok,
         pg_get_constraintdef(c.oid) LIKE '%dedfde2c76033334cff27082e681946f3aae43eade5bb636e57e5a51fae2278e%' AS scene_ok
       FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       WHERE t.relname='shrine_forecourt_throw_authorizations'
       ORDER BY content_ok DESC, physics_ok DESC, scene_ok DESC`,
    );
    if (
      !pins.rows.some((row) => row.content_ok)
      || !pins.rows.some((row) => row.physics_ok)
      || !pins.rows.some((row) => row.scene_ok)
    ) {
      throw new Error("forecourt_v195_capability_pin_verification_failed");
    }
    const ownerLinks = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid=c.conrelid
        WHERE t.relname=ANY($1::text[]) AND c.contype='f'`,
      [expectedTables],
    );
    const definitions = ownerLinks.rows.map((row) => row.definition).join("\n");
    for (const required of [
      "FOREIGN KEY (user_id, day_id)",
      "FOREIGN KEY (user_id, throw_id)",
      "FOREIGN KEY (user_id, source_result_id, source_ritual_id)",
    ]) {
      if (!definitions.includes(required)) {
        throw new Error(`forecourt_v195_owner_link_verification_failed:${required}`);
      }
    }
    const privileges = await pool.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(
      `SELECT name AS table_name,
              has_table_privilege('hourkey_app', name, 'SELECT') AS can_select,
              has_table_privilege('hourkey_app', name, 'INSERT') AS can_insert,
              has_table_privilege('hourkey_app', name, 'UPDATE') AS can_update,
              has_table_privilege('hourkey_app', name, 'DELETE') AS can_delete
         FROM unnest($1::text[]) AS name`,
      [expectedTables],
    );
    if (privileges.rows.some((row) =>
      !row.can_select || !row.can_insert || row.can_update || row.can_delete
    )) {
      throw new Error("forecourt_v195_privilege_verification_failed");
    }
  }
  console.log(
    rollback ? "forecourt V195 rollback verified" : "forecourt V195 migration verified",
  );
}

main()
  .catch((error) => {
    console.error("forecourt V195 migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
