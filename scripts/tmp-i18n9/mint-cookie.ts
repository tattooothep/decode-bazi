import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
(async () => {
  const pool = new Pool();
  const r = await pool.query(`SELECT id, email, current_org_id, hour_balance FROM users WHERE email='profile-test@example.com'`);
  const u = r.rows[0];
  console.log("user:", JSON.stringify(u));
  const { signSession } = await import("/home/jarvis/decode-app/src/lib/auth");
  const tok = await signSession({ userId: u.id, email: u.email, orgId: u.current_org_id });
  console.log("COOKIE=decode_auth=" + tok);
  await pool.end();
})();
