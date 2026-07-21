import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
(async () => {
  const pool = new Pool();
  const r = await pool.query(`
    SELECT u.email, u.id AS uid, u.current_org_id, u.hour_balance, p.id AS pid, p.name, p.relationship_type
    FROM users u JOIN profiles p ON p.org_id = u.current_org_id
    WHERE (u.email ILIKE '%test%' OR u.email ILIKE '%@x.com' OR u.email ILIKE '%.local%') AND u.hour_balance > 5
    ORDER BY u.created_at DESC LIMIT 8`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
})();
