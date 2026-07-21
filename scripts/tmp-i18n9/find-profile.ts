import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
(async () => {
  const pool = new Pool();
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' ORDER BY ordinal_position`);
  console.log("cols:", cols.rows.map((r: any) => r.column_name).join(","));
  const r = await pool.query(`SELECT * FROM profiles WHERE org_id='abbe12d8-ad50-4a21-ae52-cd60814f9c5a' LIMIT 3`);
  console.log(JSON.stringify(r.rows.map((x: any) => ({ id: x.id, name: x.name, is_self: x.is_self })), null, 1));
  await pool.end();
})();
