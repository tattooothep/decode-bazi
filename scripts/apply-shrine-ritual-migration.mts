/**
 * ลงตารางพิธีศาลเจ้า 4 ตาราง (7–9 ส.ค. 69)
 * ใช้ CREATE TABLE IF NOT EXISTS ล้วน · ไม่แตะตารางเดิมสักตัว
 *   node --env-file=.env.local ... หรือ npx tsx scripts/apply-shrine-ritual-migration.mts
 * ใส่ --rollback เพื่อถอนของออก
 */
import { readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";

const rollback = process.argv.includes("--rollback");
const files = rollback
  ? [
      "20260809_shrine_hourkey_ritual_results_rollback.sql",
      "20260807_shrine_ritual_ledger_rollback.sql",
    ]
  : [
      "20260807_shrine_ritual_ledger.sql",
      "20260809_shrine_hourkey_ritual_results.sql",
    ];

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
    for (const file of files) {
      const sql = readFileSync(
        path.join(process.cwd(), "migrations", file),
        "utf8",
      );
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const expectedTables = [
    "shrine_hourkey_ritual_results",
    "shrine_qian_draws",
    "shrine_qian_permit_casts",
    "shrine_ritual_strikes",
  ];
  const check = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
      ORDER BY 1`,
    [expectedTables],
  );
  const actualTables = check.rows.map((row) => row.tablename);
  const shouldExist = rollback ? 0 : expectedTables.length;
  if (actualTables.length !== shouldExist) {
    throw new Error(
      `shrine_ritual_migration_verification_failed:${actualTables.join(",")}`,
    );
  }
  console.log(
    rollback ? "ถอนแล้ว เหลือ:" : "ลงแล้ว มีตาราง:",
    actualTables.join(", ") || "(ไม่มี)",
  );
  await pool.end();
}

main().catch((error) => {
  console.error("ล้มเหลว:", error.message);
  process.exit(1);
});
