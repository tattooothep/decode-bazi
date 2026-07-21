import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
const pool = new Pool();
(async () => {
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`);
  console.log("cols:", cols.rows.map((r: any) => r.column_name).join(","));
  const r = await pool.query(`SELECT id, email FROM users WHERE email ILIKE '%test%' OR email ILIKE '%admin%' OR email ILIKE '%jarvis%' OR email ILIKE '%tattoothep%' ORDER BY created_at LIMIT 10`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
})();
