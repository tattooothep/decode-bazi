import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
import { readFileSync } from "fs";
(async () => {
  const pool = new Pool();
  const acc = JSON.parse(readFileSync("/home/jarvis/decode-app/.gate-account.json", "utf8"));
  const u = (await pool.query(`SELECT id, email, current_org_id, hour_balance FROM users WHERE id=$1`, [acc.userId])).rows[0];
  console.log("user:", JSON.stringify(u));
  const p = (await pool.query(`SELECT id, name, day_master IS NOT NULL AS dm FROM profiles WHERE org_id=$1 LIMIT 3`, [u.current_org_id])).rows;
  console.log("profiles:", JSON.stringify(p));
  const { signSession } = await import("/home/jarvis/decode-app/src/lib/auth");
  console.log("TOKEN=" + await signSession({ userId: u.id, email: u.email, orgId: u.current_org_id }));
  await pool.end();
})();
