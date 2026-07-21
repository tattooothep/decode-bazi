import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env={};
for (const line of fs.readFileSync(path.join(root,".env.local"),"utf8").split("\n")) {
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]]=m[2].replace(/^["']|["']$/g,"");
}
Object.assign(process.env, env);
const { ensureAdminRbacSeeded, resolveAdminSessionForUser } = await import("../src/lib/admin-guard.ts");
const { adminSetTier } = await import("../src/lib/admin-member-actions.ts");
const { Client } = await import("pg");
const c = new Client({host:env.PGHOST,port:+env.PGPORT,user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE});
await c.connect();
await ensureAdminRbacSeeded();
const stamp=Date.now();
const ops = (await c.query(
  `INSERT INTO users (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,hour_balance,tier,created_at)
   VALUES (gen_random_uuid(),$1,$2,'ops','th','Asia/Bangkok','system',true,true,0,'free',now()) RETURNING id,email`,
  [`dbg_ops_${stamp}@decode.test`, "x"]
)).rows[0];
const tgt = (await c.query(
  `INSERT INTO users (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,hour_balance,tier,created_at)
   VALUES (gen_random_uuid(),$1,$2,'t','th','Asia/Bangkok','system',true,true,0,'free',now()) RETURNING id,email`,
  [`dbg_tgt_${stamp}@decode.test`, "x"]
)).rows[0];
const role = (await c.query(`SELECT id FROM admin_roles WHERE key=$1`, ["ops"])).rows[0];
await c.query(`INSERT INTO admin_user_roles(user_id,role_id,granted_by) VALUES ($1,$2,$1)`,[ops.id, role.id]);
const sess = await resolveAdminSessionForUser(ops.id, ops.email, null);
console.log("sess", sess && { roles: sess.roles, userId: sess.userId });
const r = await adminSetTier({ admin: sess, userId: tgt.id, tier: "premium" });
console.log("result", r);
const all = await c.query(`SELECT user_id, action, target_id, actor_email FROM audit_logs WHERE action=$1 ORDER BY created_at DESC LIMIT 5`, ["admin.users.tier.set"]);
console.log("recent audits", all.rows);
const filtered = await c.query(`SELECT * FROM audit_logs WHERE user_id=$1 AND target_id=$2 AND action=$3`,[ops.id, tgt.id, "admin.users.tier.set"]);
console.log("filtered count", filtered.rows.length);
await c.query(`DELETE FROM admin_user_roles WHERE user_id=$1`,[ops.id]);
await c.query(`DELETE FROM audit_logs WHERE user_id=$1 OR target_id=$1 OR user_id=$2 OR target_id=$2`,[ops.id,tgt.id]);
await c.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`,[[ops.id,tgt.id]]);
await c.end();
