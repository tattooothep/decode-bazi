import crypto from "node:crypto";
import fs from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const base = process.env.BASE_URL || "http://127.0.0.1:3370";
const db = new pg.Client({ host:env.PGHOST,port:Number(env.PGPORT),database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD });
const userId = crypto.randomUUID(), orgId = crypto.randomUUID();
const email = `mobile-luopan-vision-${Date.now()}@example.test`;
let checks = 0;
function check(value, message) { if (!value) throw new Error(`FAIL ${message}`); checks += 1; console.log(`PASS ${message}`); }
async function post(token, body) {
  const response = await fetch(`${base}/api/mobile/v1/luopan/vision`, { method:"POST",headers:{authorization:token?`Bearer ${token}`:"","content-type":"application/json"},body:JSON.stringify(body) });
  return { response, data:await response.json().catch(() => ({})) };
}
try {
  await db.connect();
  await db.query(`INSERT INTO users(id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,trial_ends_at,session_version,created_at) VALUES($1,$2,'test-only','Vision Test','th','Asia/Bangkok','dark',true,true,'free',1000,NULL,0,now())`,[userId,email]);
  await db.query(`INSERT INTO organizations(id,owner_user_id,name,slug,created_at) VALUES($1,$2,'Vision Test',$3,now())`,[orgId,userId,`vision-${Date.now()}`]);
  await db.query(`INSERT INTO org_members(id,org_id,user_id,role,status,joined_at) VALUES(gen_random_uuid(),$1,$2,'owner','active',now())`,[orgId,userId]);
  await db.query(`UPDATE users SET current_org_id=$1 WHERE id=$2`,[orgId,userId]);
  const token = await new SignJWT({userId,email,orgId,sv:0}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("20m").sign(new TextEncoder().encode(env.AUTH_SECRET));
  const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  let result = await post(null,{question:"ดูแปลน",image:tinyImage});
  check(result.response.status===401,"Luopan Vision requires a mobile session");
  result = await post(token,{question:"",image:tinyImage});
  check(result.response.status===400&&result.data.error==="bad_question","Luopan Vision rejects an empty question");
  result = await post(token,{question:"ดูแปลน",image:"data:text/plain;base64,SGk="});
  check(result.response.status===400&&result.data.error==="bad_image","Luopan Vision accepts only supported image data URLs");
  result = await post(token,{question:"ดูแปลน",image:tinyImage,packet:"x".repeat(12001)});
  check(result.response.status===413&&result.data.error==="packet_too_large","Luopan Vision caps client context");
  result = await post(token,{question:"ดูแปลน",image:tinyImage});
  check(result.response.status===403&&result.data.code==="luopan_vision_locked","Luopan Vision preserves the production free-tier lock");
  check(!/(claude|anthropic|openrouter|gemini|model_name)/i.test(JSON.stringify(result.data)),"Luopan Vision does not disclose model or provider names");
  console.log(`${checks} mobile Luopan Vision checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM org_members WHERE user_id=$1`,[userId]).catch(()=>null);
    await db.query(`UPDATE users SET current_org_id=NULL WHERE id=$1`,[userId]).catch(()=>null);
    await db.query(`DELETE FROM organizations WHERE id=$1`,[orgId]).catch(()=>null);
    await db.query(`DELETE FROM users WHERE id=$1`,[userId]).catch(()=>null);
    await db.end().catch(()=>null);
  }
}
