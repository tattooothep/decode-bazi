import { loadEnvConfig } from "@next/env";
loadEnvConfig("/home/jarvis/decode-app");
import { Pool } from "pg";
(async () => {
  const pool = new Pool();
  const r = await pool.query(`SELECT id, name, day_master IS NOT NULL AS has_dm, bazi_pillars IS NOT NULL AS has_bp, yongshen IS NOT NULL AS has_ys, birth_time_known FROM profiles WHERE org_id='e2771c75-5ced-482d-8172-510d6bf989da' AND is_archived = false LIMIT 10`);
  console.log(JSON.stringify(r.rows, null, 1));
  await pool.end();
})();
